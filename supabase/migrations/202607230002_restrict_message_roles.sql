-- Authenticated clients may append their own user messages, but must never be
-- able to forge assistant/system history. Assistant messages are persisted by
-- the trusted API only after profile ownership and provider response checks.

drop policy if exists "Users can create messages for their own profiles"
  on public.messages;

create policy "Users can create user messages for their own profiles"
  on public.messages
  for insert
  to authenticated
  with check (
    messages.user_id = (select auth.uid())
    and messages.role = 'user'
    and exists (
      select 1
      from public.memory_profiles profile
      where profile.id = messages.memory_profile_id
        and profile.user_id = (select auth.uid())
    )
  );
