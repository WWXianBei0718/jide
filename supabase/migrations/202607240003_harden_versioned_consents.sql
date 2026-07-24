begin;

create index if not exists idx_consents_profile_type_created
  on public.consents(memory_profile_id, consent_type, created_at desc, id desc);

drop policy if exists "Users can create their own consents" on public.consents;

revoke insert, update, delete on table public.consents from anon, authenticated;
grant select on table public.consents to authenticated;

drop policy if exists "Users can view their own consents" on public.consents;
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
        from public.memory_profiles as profile
        where profile.id = consents.memory_profile_id
          and profile.user_id = (select auth.uid())
      )
    )
  );

commit;
