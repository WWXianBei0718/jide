begin;

create table if not exists public.chat_usage_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamp with time zone not null default now()
);

create index if not exists idx_chat_usage_events_user_created_at
  on public.chat_usage_events (user_id, created_at desc);

alter table public.chat_usage_events enable row level security;

revoke all on table public.chat_usage_events from anon, authenticated;

create or replace function public.consume_chat_quota()
returns table (
  allowed boolean,
  limit_scope text,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  quota_now timestamp with time zone := statement_timestamp();
  minute_count integer;
  day_count integer;
  next_available_at timestamp with time zone;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(current_user_id::text || ':chat', 0)
  );

  delete from public.chat_usage_events
  where user_id = current_user_id
    and created_at < quota_now - interval '1 day';

  select count(*)
  into minute_count
  from public.chat_usage_events
  where user_id = current_user_id
    and created_at >= quota_now - interval '1 minute';

  if minute_count >= 10 then
    select min(created_at) + interval '1 minute'
    into next_available_at
    from public.chat_usage_events
    where user_id = current_user_id
      and created_at >= quota_now - interval '1 minute';

    return query
      select false, 'minute'::text,
        greatest(1, ceil(extract(epoch from next_available_at - quota_now))::integer);
    return;
  end if;

  select count(*)
  into day_count
  from public.chat_usage_events
  where user_id = current_user_id
    and created_at >= quota_now - interval '1 day';

  if day_count >= 100 then
    select min(created_at) + interval '1 day'
    into next_available_at
    from public.chat_usage_events
    where user_id = current_user_id
      and created_at >= quota_now - interval '1 day';

    return query
      select false, 'day'::text,
        greatest(1, ceil(extract(epoch from next_available_at - quota_now))::integer);
    return;
  end if;

  insert into public.chat_usage_events (user_id)
  values (current_user_id);

  return query select true, null::text, 0;
end;
$$;

revoke all on function public.consume_chat_quota() from public, anon;
grant execute on function public.consume_chat_quota() to authenticated;

commit;
