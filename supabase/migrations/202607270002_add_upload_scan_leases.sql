begin;

alter table public.uploaded_files
  add column if not exists scan_attempt_count integer not null default 0,
  add column if not exists scan_lease_owner text,
  add column if not exists scan_lease_expires_at timestamptz,
  add column if not exists scan_next_attempt_at timestamptz,
  add column if not exists scan_processor_version text;

alter table public.uploaded_files
  drop constraint if exists uploaded_files_status_check;
alter table public.uploaded_files
  add constraint uploaded_files_status_check
  check (status in (
    'requested',
    'quarantined',
    'validating',
    'scanning',
    'ready',
    'rejected',
    'deleting',
    'deleted'
  ));

alter table public.uploaded_files
  add constraint uploaded_files_scan_attempt_count_check
  check (scan_attempt_count between 0 and 10),
  add constraint uploaded_files_scan_lease_owner_check
  check (
    scan_lease_owner is null
    or scan_lease_owner ~ '^[a-zA-Z0-9._:-]{1,120}$'
  ),
  add constraint uploaded_files_scan_processor_version_check
  check (
    scan_processor_version is null
    or scan_processor_version ~ '^[a-zA-Z0-9._-]{1,80}$'
  ),
  add constraint uploaded_files_scan_state_check
  check (
    (
      status = 'scanning'
      and scan_lease_owner is not null
      and scan_lease_expires_at is not null
    )
    or (
      status <> 'scanning'
      and scan_lease_owner is null
      and scan_lease_expires_at is null
    )
  );

create index if not exists idx_uploaded_files_scan_claim
  on public.uploaded_files(status, scan_next_attempt_at, created_at)
  where status in ('quarantined', 'scanning');

revoke select on table public.uploaded_files from authenticated;
grant select (
  id,
  memory_profile_id,
  user_id,
  file_name,
  file_path,
  file_type,
  file_size,
  purpose,
  created_at,
  storage_bucket,
  quarantine_path,
  detected_mime,
  sha256,
  status,
  processing_error,
  scan_details,
  available_at,
  deleted_at,
  upload_expires_at,
  updated_at
) on table public.uploaded_files to authenticated;

revoke select (
  scan_attempt_count,
  scan_lease_owner,
  scan_lease_expires_at,
  scan_next_attempt_at,
  scan_processor_version
) on table public.uploaded_files from authenticated;

create function public.claim_uploads_for_malware_scan(
  p_worker_id text,
  p_limit integer default 3,
  p_lease_seconds integer default 300
)
returns table (
  id uuid,
  user_id uuid,
  memory_profile_id uuid,
  file_name text,
  file_path text,
  quarantine_path text,
  file_type text,
  file_size bigint,
  purpose text,
  scan_details jsonb,
  scan_attempt_count integer,
  scan_lease_expires_at timestamptz
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
  if p_limit < 1 or p_limit > 10 then
    raise exception 'Invalid claim limit';
  end if;
  if p_lease_seconds < 60 or p_lease_seconds > 900 then
    raise exception 'Invalid lease duration';
  end if;

  return query
  with candidates as (
    select uploaded.id
    from public.uploaded_files as uploaded
    where uploaded.scan_attempt_count < 10
      and uploaded.upload_expires_at >= now()
      and coalesce(uploaded.scan_details ->> 'malware_scan', '') in ('pending', 'failed')
      and (
        (
          uploaded.status = 'quarantined'
          and (
            uploaded.scan_next_attempt_at is null
            or uploaded.scan_next_attempt_at <= now()
          )
        )
        or (
          uploaded.status = 'scanning'
          and uploaded.scan_lease_expires_at <= now()
        )
      )
    order by coalesce(uploaded.scan_next_attempt_at, uploaded.created_at),
      uploaded.created_at,
      uploaded.id
    for update skip locked
    limit p_limit
  )
  update public.uploaded_files as uploaded
  set status = 'scanning',
      scan_attempt_count = uploaded.scan_attempt_count + 1,
      scan_lease_owner = p_worker_id,
      scan_lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      scan_next_attempt_at = null,
      processing_error = null
  from candidates
  where uploaded.id = candidates.id
  returning
    uploaded.id,
    uploaded.user_id,
    uploaded.memory_profile_id,
    uploaded.file_name,
    uploaded.file_path,
    uploaded.quarantine_path,
    uploaded.file_type,
    uploaded.file_size,
    uploaded.purpose,
    uploaded.scan_details,
    uploaded.scan_attempt_count,
    uploaded.scan_lease_expires_at;
end;
$$;

create function public.fail_upload_malware_scan(
  p_upload_id uuid,
  p_worker_id text,
  p_error_code text,
  p_retryable boolean,
  p_retry_after_seconds integer default 60
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  next_status text;
begin
  if p_error_code is null
    or p_error_code !~ '^[a-z0-9_]{1,80}$' then
    raise exception 'Invalid error code';
  end if;
  if p_retry_after_seconds < 10 or p_retry_after_seconds > 86400 then
    raise exception 'Invalid retry delay';
  end if;

  update public.uploaded_files as uploaded
  set status = case
        when p_retryable and uploaded.scan_attempt_count < 10
          then 'quarantined'
        else 'rejected'
      end,
      processing_error = p_error_code,
      scan_lease_owner = null,
      scan_lease_expires_at = null,
      scan_next_attempt_at = case
        when p_retryable and uploaded.scan_attempt_count < 10
          then now() + make_interval(secs => p_retry_after_seconds)
        else null
      end,
      scan_details = coalesce(uploaded.scan_details, '{}'::jsonb)
        || jsonb_build_object(
          'malware_scan',
          case
            when p_error_code = 'malware_detected' then 'infected'
            else 'failed'
          end
        )
  where uploaded.id = p_upload_id
    and uploaded.status = 'scanning'
    and uploaded.scan_lease_owner = p_worker_id
    and uploaded.scan_lease_expires_at > now()
  returning uploaded.status into next_status;

  return coalesce(next_status, 'lease_lost');
end;
$$;

create function public.complete_scanned_upload(
  p_upload_id uuid,
  p_worker_id text,
  p_material_type text,
  p_sha256 text,
  p_scan_processor_version text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uploaded public.uploaded_files%rowtype;
  material_id uuid;
  processing_job_type text;
begin
  if p_material_type not in ('image', 'audio', 'video', 'document') then
    raise exception 'Unsupported material type';
  end if;
  if p_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid SHA-256';
  end if;
  if p_scan_processor_version is null
    or p_scan_processor_version !~ '^[a-zA-Z0-9._-]{1,80}$' then
    raise exception 'Invalid scan processor version';
  end if;

  select * into uploaded
  from public.uploaded_files
  where id = p_upload_id
    and status = 'scanning'
    and scan_lease_owner = p_worker_id
    and scan_lease_expires_at > now()
  for update;

  if not found then
    return null;
  end if;

  update public.uploaded_files
  set storage_bucket = 'memory-assets',
      status = 'ready',
      detected_mime = uploaded.file_type,
      sha256 = p_sha256,
      available_at = now(),
      processing_error = null,
      scan_lease_owner = null,
      scan_lease_expires_at = null,
      scan_next_attempt_at = null,
      scan_processor_version = p_scan_processor_version,
      scan_details = coalesce(uploaded.scan_details, '{}'::jsonb)
        || jsonb_build_object(
          'signature_validated', true,
          'malware_scan', 'clean',
          'scanner_version', p_scan_processor_version
        )
  where id = p_upload_id;

  if uploaded.purpose = 'voice_cloning' then
    return uploaded.id;
  end if;

  insert into public.memory_materials (
    memory_profile_id,
    uploaded_file_id,
    type,
    title,
    content,
    file_url,
    metadata
  ) values (
    uploaded.memory_profile_id,
    uploaded.id,
    p_material_type,
    uploaded.file_name,
    null,
    null,
    jsonb_build_object(
      'mime_type', uploaded.file_type,
      'size', uploaded.file_size,
      'sha256', p_sha256
    )
  )
  returning id into material_id;

  processing_job_type := case p_material_type
    when 'image' then 'image_ocr'
    when 'audio' then 'audio_transcription'
    when 'video' then 'video_transcription'
    when 'document' then 'document_text'
  end;

  insert into public.material_processing_jobs (
    material_id,
    memory_profile_id,
    job_type,
    status
  ) values (
    material_id,
    uploaded.memory_profile_id,
    processing_job_type,
    'pending'
  );

  return material_id;
end;
$$;

revoke all on function public.claim_uploads_for_malware_scan(text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.fail_upload_malware_scan(uuid, text, text, boolean, integer)
  from public, anon, authenticated;
revoke all on function public.complete_scanned_upload(uuid, text, text, text, text)
  from public, anon, authenticated;

grant execute on function public.claim_uploads_for_malware_scan(text, integer, integer)
  to service_role;
grant execute on function public.fail_upload_malware_scan(uuid, text, text, boolean, integer)
  to service_role;
grant execute on function public.complete_scanned_upload(uuid, text, text, text, text)
  to service_role;

commit;
