begin;

create extension if not exists vector;

alter table public.uploaded_files
  add column if not exists storage_bucket text not null default 'memory-quarantine',
  add column if not exists quarantine_path text,
  add column if not exists detected_mime text,
  add column if not exists sha256 text,
  add column if not exists status text not null default 'requested',
  add column if not exists processing_error text,
  add column if not exists scan_details jsonb not null default '{}'::jsonb,
  add column if not exists available_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists upload_expires_at timestamptz not null default (now() + interval '2 hours'),
  add column if not exists updated_at timestamptz not null default now();

alter table public.uploaded_files
  drop constraint if exists uploaded_files_status_check;

alter table public.uploaded_files
  add constraint uploaded_files_status_check
  check (status in ('requested', 'quarantined', 'validating', 'ready', 'rejected', 'deleting', 'deleted'));

alter table public.memory_materials
  add column if not exists uploaded_file_id uuid references public.uploaded_files(id) on delete set null;

alter table public.consents
  add column if not exists policy_version text,
  add column if not exists notice_hash text,
  add column if not exists withdrawn_at timestamptz,
  add column if not exists evidence jsonb not null default '{}'::jsonb;

create unique index if not exists idx_uploaded_files_bucket_path
  on public.uploaded_files(storage_bucket, file_path)
  where deleted_at is null;

create unique index if not exists idx_memory_materials_uploaded_file
  on public.memory_materials(uploaded_file_id)
  where uploaded_file_id is not null;

create index if not exists idx_uploaded_files_status_created
  on public.uploaded_files(status, created_at);

create index if not exists idx_uploaded_files_expiry
  on public.uploaded_files(upload_expires_at)
  where status in ('requested', 'quarantined');

create index if not exists idx_uploaded_files_profile_status
  on public.uploaded_files(memory_profile_id, status);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'memory-quarantine',
    'memory-quarantine',
    false,
    26214400,
    array[
      'image/jpeg', 'image/png', 'image/webp',
      'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/mp4',
      'video/mp4', 'video/webm',
      'application/pdf'
    ]::text[]
  ),
  (
    'memory-assets',
    'memory-assets',
    false,
    26214400,
    array[
      'image/jpeg', 'image/png', 'image/webp',
      'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/mp4',
      'video/mp4', 'video/webm',
      'application/pdf'
    ]::text[]
  )
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.uploaded_files enable row level security;

drop policy if exists "Users can create their own uploaded files" on public.uploaded_files;
drop policy if exists "Users can update their own uploaded files" on public.uploaded_files;
drop policy if exists "Users can delete their own uploaded files" on public.uploaded_files;

revoke insert, update, delete on table public.uploaded_files from anon, authenticated;
grant select on table public.uploaded_files to authenticated;

drop policy if exists "Users can view their own uploaded files" on public.uploaded_files;
create policy "Users can view their own uploaded files"
  on public.uploaded_files
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.validate_material_uploaded_file()
returns trigger as $$
begin
  if new.uploaded_file_id is not null and not exists (
    select 1
    from public.uploaded_files uploaded
    where uploaded.id = new.uploaded_file_id
      and uploaded.memory_profile_id = new.memory_profile_id
      and uploaded.status = 'ready'
  ) then
    raise exception 'Uploaded file is not available for this memory profile';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trigger_validate_material_uploaded_file on public.memory_materials;
create trigger trigger_validate_material_uploaded_file
before insert or update of uploaded_file_id, memory_profile_id on public.memory_materials
for each row execute function public.validate_material_uploaded_file();

create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trigger_update_uploaded_files_updated_at on public.uploaded_files;
create trigger trigger_update_uploaded_files_updated_at
before update on public.uploaded_files
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

  return material_id;
end;
$$;

revoke all on function public.finalize_material_upload(uuid, text, text, jsonb) from public;
grant execute on function public.finalize_material_upload(uuid, text, text, jsonb) to service_role;

commit;
