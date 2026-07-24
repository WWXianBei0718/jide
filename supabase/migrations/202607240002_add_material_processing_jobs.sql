begin;

create table if not exists public.material_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null,
  memory_profile_id uuid not null references public.memory_profiles(id) on delete cascade,
  job_type text not null,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  error_code text,
  processor_version text,
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint material_processing_jobs_material_profile_fkey
    foreign key (material_id, memory_profile_id)
    references public.memory_materials(id, memory_profile_id)
    on delete cascade,
  constraint material_processing_jobs_job_type_check
    check (job_type in ('image_ocr', 'audio_transcription', 'video_transcription', 'document_text')),
  constraint material_processing_jobs_status_check
    check (status in ('pending', 'processing', 'extracted', 'failed', 'blocked')),
  constraint material_processing_jobs_attempt_count_check
    check (attempt_count between 0 and 20),
  constraint material_processing_jobs_error_code_check
    check (
      error_code is null
      or error_code ~ '^[a-z0-9_]{1,80}$'
    ),
  constraint material_processing_jobs_processor_version_check
    check (
      processor_version is null
      or processor_version ~ '^[a-zA-Z0-9._-]{1,80}$'
    ),
  constraint material_processing_jobs_timestamps_check
    check (
      (started_at is null or started_at >= queued_at)
      and (completed_at is null or started_at is not null)
      and (completed_at is null or completed_at >= started_at)
    ),
  unique (material_id, job_type)
);

create index if not exists idx_material_processing_jobs_profile_status
  on public.material_processing_jobs(memory_profile_id, status, queued_at);

create index if not exists idx_material_processing_jobs_pending
  on public.material_processing_jobs(status, queued_at)
  where status in ('pending', 'failed');

alter table public.material_processing_jobs enable row level security;

revoke all on table public.material_processing_jobs from public, anon, authenticated;
grant select on table public.material_processing_jobs to authenticated;

drop policy if exists "Users can view processing jobs for their own profiles"
  on public.material_processing_jobs;
create policy "Users can view processing jobs for their own profiles"
  on public.material_processing_jobs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.memory_profiles as profile
      where profile.id = material_processing_jobs.memory_profile_id
        and profile.user_id = (select auth.uid())
    )
  );

drop trigger if exists trigger_update_material_processing_jobs_updated_at
  on public.material_processing_jobs;
create trigger trigger_update_material_processing_jobs_updated_at
before update on public.material_processing_jobs
for each row execute function public.update_updated_at();

create or replace function public.finalize_material_upload(
  p_upload_id uuid,
  p_material_type text,
  p_sha256 text,
  p_scan_details jsonb
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

  select * into uploaded
  from public.uploaded_files
  where id = p_upload_id
  for update;

  if not found or uploaded.purpose <> 'material' or uploaded.status <> 'validating' then
    raise exception 'Upload cannot be finalized';
  end if;

  update public.uploaded_files
  set storage_bucket = 'memory-assets',
      status = 'ready',
      detected_mime = uploaded.file_type,
      sha256 = p_sha256,
      available_at = now(),
      processing_error = null,
      scan_details = coalesce(p_scan_details, '{}'::jsonb)
  where id = p_upload_id;

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

revoke all on function public.finalize_material_upload(uuid, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.finalize_material_upload(uuid, text, text, jsonb)
  to service_role;

insert into public.material_processing_jobs (
  material_id,
  memory_profile_id,
  job_type,
  status
)
select
  material.id,
  material.memory_profile_id,
  case material.type
    when 'image' then 'image_ocr'
    when 'audio' then 'audio_transcription'
    when 'video' then 'video_transcription'
    when 'document' then 'document_text'
  end,
  'pending'
from public.memory_materials as material
inner join public.uploaded_files as uploaded
  on uploaded.id = material.uploaded_file_id
where material.type in ('image', 'audio', 'video', 'document')
  and uploaded.status = 'ready'
on conflict (material_id, job_type) do nothing;

commit;
