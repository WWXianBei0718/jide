begin;

revoke all on function public.claim_material_processing_jobs(text, integer, integer)
  from public, anon, authenticated, service_role;
drop function public.claim_material_processing_jobs(text, integer, integer);

create function public.claim_material_processing_jobs(
  p_worker_id text,
  p_job_types text[],
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

  if p_job_types is null
    or cardinality(p_job_types) < 1
    or cardinality(p_job_types) > 4
    or exists (
      select 1
      from unnest(p_job_types) as requested(job_type)
      where requested.job_type not in (
        'image_ocr',
        'audio_transcription',
        'video_transcription',
        'document_text'
      )
    ) then
    raise exception 'Invalid job types';
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
    where job.job_type = any(p_job_types)
      and job.attempt_count < 20
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

revoke all on function public.claim_material_processing_jobs(text, text[], integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_material_processing_jobs(text, text[], integer, integer)
  to service_role;

commit;
