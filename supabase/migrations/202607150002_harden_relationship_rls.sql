begin;

drop policy if exists "Users can view their own conversations" on public.conversations;
drop policy if exists "Users can create their own conversations" on public.conversations;
drop policy if exists "Users can update their own conversations" on public.conversations;
drop policy if exists "Users can delete their own conversations" on public.conversations;

create policy "Users can view their own conversations"
  on public.conversations
  for select
  to authenticated
  using (
    conversations.user_id = (select auth.uid())
    and exists (
      select 1
      from public.memory_profiles profile
      where profile.id = conversations.memory_profile_id
        and profile.user_id = (select auth.uid())
    )
  );

create policy "Users can create their own conversations"
  on public.conversations
  for insert
  to authenticated
  with check (
    conversations.user_id = (select auth.uid())
    and exists (
      select 1
      from public.memory_profiles profile
      where profile.id = conversations.memory_profile_id
        and profile.user_id = (select auth.uid())
    )
  );

create policy "Users can update their own conversations"
  on public.conversations
  for update
  to authenticated
  using (
    conversations.user_id = (select auth.uid())
    and exists (
      select 1
      from public.memory_profiles profile
      where profile.id = conversations.memory_profile_id
        and profile.user_id = (select auth.uid())
    )
  )
  with check (
    conversations.user_id = (select auth.uid())
    and exists (
      select 1
      from public.memory_profiles profile
      where profile.id = conversations.memory_profile_id
        and profile.user_id = (select auth.uid())
    )
  );

create policy "Users can delete their own conversations"
  on public.conversations
  for delete
  to authenticated
  using (
    conversations.user_id = (select auth.uid())
    and exists (
      select 1
      from public.memory_profiles profile
      where profile.id = conversations.memory_profile_id
        and profile.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can view messages for their own profiles" on public.messages;
drop policy if exists "Users can create messages for their own profiles" on public.messages;
drop policy if exists "Users can delete messages for their own profiles" on public.messages;

create policy "Users can view messages for their own profiles"
  on public.messages
  for select
  to authenticated
  using (
    messages.user_id = (select auth.uid())
    and exists (
      select 1
      from public.memory_profiles profile
      where profile.id = messages.memory_profile_id
        and profile.user_id = (select auth.uid())
    )
  );

create policy "Users can create messages for their own profiles"
  on public.messages
  for insert
  to authenticated
  with check (
    messages.user_id = (select auth.uid())
    and exists (
      select 1
      from public.memory_profiles profile
      where profile.id = messages.memory_profile_id
        and profile.user_id = (select auth.uid())
    )
  );

create policy "Users can delete messages for their own profiles"
  on public.messages
  for delete
  to authenticated
  using (
    messages.user_id = (select auth.uid())
    and exists (
      select 1
      from public.memory_profiles profile
      where profile.id = messages.memory_profile_id
        and profile.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can view their own consents" on public.consents;
drop policy if exists "Users can create their own consents" on public.consents;

create policy "Users can view their own consents"
  on public.consents
  for select
  to authenticated
  using (
    consents.user_id = (select auth.uid())
    and (
      consents.memory_profile_id is null
      or exists (
        select 1
        from public.memory_profiles profile
        where profile.id = consents.memory_profile_id
          and profile.user_id = (select auth.uid())
      )
    )
  );

create policy "Users can create their own consents"
  on public.consents
  for insert
  to authenticated
  with check (
    consents.user_id = (select auth.uid())
    and (
      consents.memory_profile_id is null
      or exists (
        select 1
        from public.memory_profiles profile
        where profile.id = consents.memory_profile_id
          and profile.user_id = (select auth.uid())
      )
    )
  );

commit;
