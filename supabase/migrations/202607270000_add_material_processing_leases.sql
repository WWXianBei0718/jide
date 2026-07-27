begin;

alter table public.material_processing_jobs
  add column if not exists lease_owner text,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists next_attempt_at timestamptz;

update public.material_processing_jobs
set status = case
      when attempt_count < 20 then 'failed'
      else 'blocked'
    end,
    error_code = 'lease_migration_recovery',
    started_at = coalesce(started_at, queued_at),
    completed_at = now(),
    lease_owner = null,
    lease_expires_at = null,
    next_attempt_at = case
      when attempt_count < 20 then now()
      else null
    end
where status = 'processing';

alter table public.material_processing_jobs
  add constraint material_processing_jobs_lease_owner_check
    check (
      lease_owner is null
      or lease_owner ~ '^[a-zA-Z0-9._:-]{1,120}$'
    ),
  add constraint material_processing_jobs_lease_state_check
    check (
      (
        status = 'processing'
        and lease_owner is not null
        and lease_expires_at is not null
      )
      or (
        status <> 'processing'
        and lease_owner is null
        and lease_expires_at is null
      )
    ),
  add constraint material_processing_jobs_retry_state_check
    check (
      next_attempt_at is null
      or status = 'failed'
    );

create index if not exists idx_material_processing_jobs_claimable
  on public.material_processing_jobs(status, next_attempt_at, lease_expires_at, queued_at)
  where status in ('pending', 'failed', 'processing');

revoke select on table public.material_processing_jobs from authenticated;
grant select (
  id,
  material_id,
  memory_profile_id,
  job_type,
  status,
  attempt_count,
  error_code,
  processor_version,
  queued_at,
  started_at,
  completed_at,
  next_attempt_at,
  created_at,
  updated_at
) on table public.material_processing_jobs to authenticated;

create or replace function public.claim_material_processing_jobs(
  p_worker_id text,
  p_limit integer default 5,
  p_lease_seconds integer default 600
)
returns table (
  id uuid,
  material_id uuid,
  memory_profile_id uuid,
  job_type text,
  attempt_count integer,
  lease_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_worker_id is null
    or p_worker_id !~ '^[a-zA-Z0-9._:-]{1,120}$' then
    raise exception 'Invalid worker id';
  end if;

  if p_limit < 1 or p_limit > 20 then
    raise exception 'Invalid claim limit';
  end if;

  if p_lease_seconds < 60 or p_lease_seconds > 1800 then
    raise exception 'Invalid lease duration';
  end if;

  return query
  with candidates as (
    select job.id
    from public.material_processing_jobs as job
    where job.attempt_count < 20
      and (
        job.status = 'pending'
        or (
          job.status = 'failed'
          and (
            job.next_attempt_at is null
            or job.next_attempt_at <= now()
          )
        )
        or (
          job.status = 'processing'
          and job.lease_expires_at <= now()
        )
      )
    order by coalesce(job.next_attempt_at, job.queued_at), job.queued_at, job.id
    for update skip locked
    limit p_limit
  )
  update public.material_processing_jobs as job
  set status = 'processing',
      attempt_count = job.attempt_count + 1,
      error_code = null,
      processor_version = null,
      started_at = now(),
      completed_at = null,
      lease_owner = p_worker_id,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      next_attempt_at = null
  from candidates
  where job.id = candidates.id
  returning
    job.id,
    job.material_id,
    job.memory_profile_id,
    job.job_type,
    job.attempt_count,
    job.lease_expires_at;
end;
$$;

create or replace function public.complete_material_processing_job(
  p_job_id uuid,
  p_worker_id text,
  p_processor_version text,
  p_extracted_text text,
  p_content_sha256 text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed public.material_processing_jobs%rowtype;
begin
  if p_worker_id is null
    or p_worker_id !~ '^[a-zA-Z0-9._:-]{1,120}$' then
    raise exception 'Invalid worker id';
  end if;

  if p_processor_version is null
    or p_processor_version !~ '^[a-zA-Z0-9._-]{1,80}$' then
    raise exception 'Invalid processor version';
  end if;

  if p_extracted_text is null
    or length(btrim(p_extracted_text)) < 1
    or length(p_extracted_text) > 2000000 then
    raise exception 'Invalid extracted text';
  end if;

  if p_content_sha256 is null
    or p_content_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid extracted content hash';
  end if;

  select * into claimed
  from public.material_processing_jobs
  where material_processing_jobs.id = p_job_id
  for update;

  if not found
    or claimed.status <> 'processing'
    or claimed.lease_owner <> p_worker_id
    or claimed.lease_expires_at <= now() then
    return false;
  end if;

  update public.memory_materials
  set content = btrim(p_extracted_text),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'content_source', 'extracted',
        'extraction_job_type', claimed.job_type,
        'extraction_processor_version', p_processor_version,
        'extracted_content_sha256', p_content_sha256,
        'extracted_at', now(),
        'indexing_status', 'blocked',
        'indexing_error', 'ai_processing_consent_required',
        'indexing_updated_at', now()
      )
  where id = claimed.material_id
    and memory_profile_id = claimed.memory_profile_id;

  if not found then
    raise exception 'Material not found';
  end if;

  update public.material_processing_jobs
  set status = 'extracted',
      error_code = null,
      processor_version = p_processor_version,
      completed_at = now(),
      lease_owner = null,
      lease_expires_at = null,
      next_attempt_at = null
  where id = claimed.id;

  return true;
end;
$$;

create or replace function public.fail_material_processing_job(
  p_job_id uuid,
  p_worker_id text,
  p_error_code text,
  p_retryable boolean,
  p_retry_after_seconds integer default 300
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed public.material_processing_jobs%rowtype;
  next_status text;
begin
  if p_worker_id is null
    or p_worker_id !~ '^[a-zA-Z0-9._:-]{1,120}$' then
    raise exception 'Invalid worker id';
  end if;

  if p_error_code is null
    or p_error_code !~ '^[a-z0-9_]{1,80}$' then
    raise exception 'Invalid processing error code';
  end if;

  if p_retry_after_seconds < 60 or p_retry_after_seconds > 86400 then
    raise exception 'Invalid retry delay';
  end if;

  select * into claimed
  from public.material_processing_jobs
  where material_processing_jobs.id = p_job_id
  for update;

  if not found
    or claimed.status <> 'processing'
    or claimed.lease_owner <> p_worker_id
    or claimed.lease_expires_at <= now() then
    return 'lease_lost';
  end if;

  next_status := case
    when p_retryable and claimed.attempt_count < 20 then 'failed'
    else 'blocked'
  end;

  update public.material_processing_jobs
  set status = next_status,
      error_code = p_error_code,
      completed_at = now(),
      lease_owner = null,
      lease_expires_at = null,
      next_attempt_at = case
        when next_status = 'failed'
          then now() + make_interval(secs => p_retry_after_seconds)
        else null
      end
  where id = claimed.id;

  return next_status;
end;
$$;

revoke all on function public.claim_material_processing_jobs(text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.complete_material_processing_job(uuid, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.fail_material_processing_job(uuid, text, text, boolean, integer)
  from public, anon, authenticated;

grant execute on function public.claim_material_processing_jobs(text, integer, integer)
  to service_role;
grant execute on function public.complete_material_processing_job(uuid, text, text, text, text)
  to service_role;
grant execute on function public.fail_material_processing_job(uuid, text, text, boolean, integer)
  to service_role;

commit;
