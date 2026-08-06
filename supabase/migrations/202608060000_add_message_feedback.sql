begin;

create unique index if not exists idx_messages_feedback_identity
  on public.messages(id, user_id, memory_profile_id);

create table if not exists public.message_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  memory_profile_id uuid not null references public.memory_profiles(id) on delete cascade,
  message_id uuid not null,
  verdict text not null check (verdict in ('like', 'unlike')),
  reasons text[] not null default '{}'::text[]
    check (
      cardinality(reasons) <= 5
      and reasons <@ array[
        'fact_wrong',
        'tone_wrong',
        'relationship_wrong',
        'unsupported',
        'too_generic'
      ]::text[]
      and (verdict = 'unlike' or cardinality(reasons) = 0)
    ),
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint message_feedback_message_owner_fkey
    foreign key (message_id, user_id, memory_profile_id)
    references public.messages(id, user_id, memory_profile_id)
    on delete cascade,
  unique (user_id, message_id)
);

create index if not exists idx_message_feedback_profile_updated
  on public.message_feedback(memory_profile_id, updated_at desc);

alter table public.message_feedback enable row level security;

drop policy if exists "Users can view feedback for their own assistant messages"
  on public.message_feedback;
create policy "Users can view feedback for their own assistant messages"
  on public.message_feedback
  for select
  to authenticated
  using (
    message_feedback.user_id = (select auth.uid())
    and exists (
      select 1
      from public.memory_profiles profile
      where profile.id = message_feedback.memory_profile_id
        and profile.user_id = (select auth.uid())
    )
    and exists (
      select 1
      from public.messages message
      where message.id = message_feedback.message_id
        and message.memory_profile_id = message_feedback.memory_profile_id
        and message.user_id = (select auth.uid())
        and message.role = 'assistant'
    )
  );

drop policy if exists "Users can create feedback for their own assistant messages"
  on public.message_feedback;
create policy "Users can create feedback for their own assistant messages"
  on public.message_feedback
  for insert
  to authenticated
  with check (
    message_feedback.user_id = (select auth.uid())
    and exists (
      select 1
      from public.memory_profiles profile
      where profile.id = message_feedback.memory_profile_id
        and profile.user_id = (select auth.uid())
    )
    and exists (
      select 1
      from public.messages message
      where message.id = message_feedback.message_id
        and message.memory_profile_id = message_feedback.memory_profile_id
        and message.user_id = (select auth.uid())
        and message.role = 'assistant'
    )
  );

drop policy if exists "Users can update feedback for their own assistant messages"
  on public.message_feedback;
create policy "Users can update feedback for their own assistant messages"
  on public.message_feedback
  for update
  to authenticated
  using (
    message_feedback.user_id = (select auth.uid())
  )
  with check (
    message_feedback.user_id = (select auth.uid())
    and exists (
      select 1
      from public.memory_profiles profile
      where profile.id = message_feedback.memory_profile_id
        and profile.user_id = (select auth.uid())
    )
    and exists (
      select 1
      from public.messages message
      where message.id = message_feedback.message_id
        and message.memory_profile_id = message_feedback.memory_profile_id
        and message.user_id = (select auth.uid())
        and message.role = 'assistant'
    )
  );

drop policy if exists "Users can delete feedback for their own assistant messages"
  on public.message_feedback;
create policy "Users can delete feedback for their own assistant messages"
  on public.message_feedback
  for delete
  to authenticated
  using (
    message_feedback.user_id = (select auth.uid())
    and exists (
      select 1
      from public.memory_profiles profile
      where profile.id = message_feedback.memory_profile_id
        and profile.user_id = (select auth.uid())
    )
  );

revoke all on table public.message_feedback from public, anon;
grant select, insert, update, delete on table public.message_feedback to authenticated;

create or replace function public.delete_user_owned_account_data(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'User ID is required';
  end if;

  delete from public.message_feedback where user_id = p_user_id;
  delete from public.messages where user_id = p_user_id;
  delete from public.conversations where user_id = p_user_id;
  delete from public.consents where user_id = p_user_id;
  delete from public.uploaded_files where user_id = p_user_id;
  delete from public.memory_profiles where user_id = p_user_id;
  delete from public.chat_usage_events where user_id = p_user_id;
  delete from public.external_api_usage_events where user_id = p_user_id;
end;
$$;

revoke all on function public.delete_user_owned_account_data(uuid) from public, anon, authenticated;
grant execute on function public.delete_user_owned_account_data(uuid) to service_role;

commit;
