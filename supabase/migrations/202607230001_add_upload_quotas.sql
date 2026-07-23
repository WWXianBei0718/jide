begin;

alter table public.external_api_usage_events
  drop constraint if exists external_api_usage_events_operation_check,
  drop constraint if exists external_api_usage_events_units_check;

alter table public.external_api_usage_events
  add constraint external_api_usage_events_operation_check
    check (operation in ('voice_clone', 'tts', 'upload')),
  add constraint external_api_usage_events_units_check
    check (units > 0 and units <= 26214400);

create or replace function public.consume_external_api_quota(
  requested_operation text,
  requested_units integer default 1
)
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
  burst_window interval;
  burst_limit integer;
  daily_request_limit integer;
  daily_unit_limit integer;
  burst_count integer;
  daily_count integer;
  daily_units integer;
  next_available_at timestamp with time zone;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if requested_operation = 'voice_clone' then
    burst_window := interval '10 minutes';
    burst_limit := 1;
    daily_request_limit := 3;
    daily_unit_limit := 3;
  elsif requested_operation = 'tts' then
    burst_window := interval '1 minute';
    burst_limit := 20;
    daily_request_limit := 300;
    daily_unit_limit := 100000;
  elsif requested_operation = 'upload' then
    burst_window := interval '10 minutes';
    burst_limit := 20;
    daily_request_limit := 100;
    daily_unit_limit := 524288000;
  else
    raise exception using errcode = '22023', message = 'Unsupported operation';
  end if;

  if requested_units is null or requested_units < 1 or requested_units > 26214400 then
    raise exception using errcode = '22023', message = 'Invalid requested units';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(current_user_id::text || ':' || requested_operation, 0)
  );

  delete from public.external_api_usage_events
  where user_id = current_user_id
    and created_at < quota_now - interval '1 day';

  select count(*)
  into burst_count
  from public.external_api_usage_events
  where user_id = current_user_id
    and operation = requested_operation
    and created_at >= quota_now - burst_window;

  if burst_count >= burst_limit then
    select min(created_at) + burst_window
    into next_available_at
    from public.external_api_usage_events
    where user_id = current_user_id
      and operation = requested_operation
      and created_at >= quota_now - burst_window;

    return query
      select false, 'burst'::text,
        greatest(1, ceil(extract(epoch from next_available_at - quota_now))::integer);
    return;
  end if;

  select count(*), coalesce(sum(units), 0)
  into daily_count, daily_units
  from public.external_api_usage_events
  where user_id = current_user_id
    and operation = requested_operation
    and created_at >= quota_now - interval '1 day';

  if daily_count >= daily_request_limit then
    select min(created_at) + interval '1 day'
    into next_available_at
    from public.external_api_usage_events
    where user_id = current_user_id
      and operation = requested_operation
      and created_at >= quota_now - interval '1 day';

    return query
      select false, 'daily_requests'::text,
        greatest(1, ceil(extract(epoch from next_available_at - quota_now))::integer);
    return;
  end if;

  if daily_units + requested_units > daily_unit_limit then
    select min(created_at) + interval '1 day'
    into next_available_at
    from public.external_api_usage_events
    where user_id = current_user_id
      and operation = requested_operation
      and created_at >= quota_now - interval '1 day';

    return query
      select false, 'daily_units'::text,
        greatest(1, ceil(extract(epoch from next_available_at - quota_now))::integer);
    return;
  end if;

  insert into public.external_api_usage_events (user_id, operation, units)
  values (current_user_id, requested_operation, requested_units);

  return query select true, null::text, 0;
end;
$$;

revoke all on function public.consume_external_api_quota(text, integer) from public, anon;
grant execute on function public.consume_external_api_quota(text, integer) to authenticated;

commit;

