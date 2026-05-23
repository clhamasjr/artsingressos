-- ============================================================
-- RPC: get_event_checkin_stats
-- Consolida estatísticas de venda/check-in pra um evento.
-- Acessível a admin/operator. Retorna JSON pra simplificar front.
-- ============================================================
create or replace function public.get_event_checkin_stats(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_actor uuid := (select auth.uid());
  v_role text;
  v_result jsonb;
  v_totals jsonb;
  v_by_lot jsonb;
  v_recent jsonb;
  v_hourly jsonb;
  v_last_hour int;
begin
  select role into v_role from public.admin_users where id = v_actor;
  if v_role is null or v_role not in ('admin', 'operator') then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'sold', coalesce(count(*) filter (where t.status != 'cancelado'), 0),
    'checked_in', coalesce(count(*) filter (where t.status = 'usado'), 0),
    'cancelled', coalesce(count(*) filter (where t.status = 'cancelado'), 0),
    'valid', coalesce(count(*) filter (where t.status = 'valido'), 0)
  ) into v_totals
  from public.tickets t
  where t.event_id = p_event_id;

  select jsonb_agg(
    jsonb_build_object(
      'id', tt.id, 'name', tt.name, 'qty_total', tt.qty_total,
      'sold', coalesce(s.sold, 0), 'checked_in', coalesce(s.checked_in, 0)
    ) order by tt.position
  ) into v_by_lot
  from public.ticket_types tt
  left join (
    select ticket_type_id,
           count(*) filter (where status != 'cancelado') as sold,
           count(*) filter (where status = 'usado') as checked_in
    from public.tickets where event_id = p_event_id
    group by ticket_type_id
  ) s on s.ticket_type_id = tt.id
  where tt.event_id = p_event_id;

  select jsonb_agg(item order by ts desc) into v_recent
  from (
    select jsonb_build_object(
      'id', c.id, 'ts', c.ts, 'result', c.result,
      'buyer_name', o.buyer_name, 'ticket_type_name', tt.name,
      'operator_email', au.email
    ) as item, c.ts
    from public.checkins c
    join public.tickets t on c.ticket_id = t.id
    join public.orders o on t.order_id = o.id
    join public.ticket_types tt on t.ticket_type_id = tt.id
    left join public.admin_users au on c.operator_id = au.id
    where c.event_id = p_event_id
    order by c.ts desc
    limit 30
  ) sub;

  select jsonb_agg(
    jsonb_build_object('hour', hour_bucket, 'count', cnt) order by hour_bucket
  ) into v_hourly
  from (
    select date_trunc('hour', ts) as hour_bucket, count(*) as cnt
    from public.checkins
    where event_id = p_event_id and result = 'ok'
      and ts > now() - interval '24 hours'
    group by 1
  ) h;

  select count(*) into v_last_hour
  from public.checkins
  where event_id = p_event_id and result = 'ok' and ts > now() - interval '1 hour';

  v_result := jsonb_build_object(
    'totals', v_totals,
    'by_ticket_type', coalesce(v_by_lot, '[]'::jsonb),
    'recent_checkins', coalesce(v_recent, '[]'::jsonb),
    'hourly_last_24h', coalesce(v_hourly, '[]'::jsonb),
    'last_hour_count', coalesce(v_last_hour, 0)
  );

  return v_result;
end;
$$;

grant execute on function public.get_event_checkin_stats(uuid) to authenticated;
revoke execute on function public.get_event_checkin_stats(uuid) from anon, public;
