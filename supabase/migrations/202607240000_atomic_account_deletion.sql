begin;

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
