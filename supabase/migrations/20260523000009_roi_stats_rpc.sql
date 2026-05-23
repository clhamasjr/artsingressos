-- get_roi_stats: cruza ad_spend × orders por utm_campaign
create or replace function public.get_roi_stats(
  p_event_id uuid default null,
  p_date_from date default (current_date - interval '30 days')::date,
  p_date_to date default current_date
)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp stable
as $$
declare
  v_actor uuid := (select auth.uid());
  v_role text;
  v_totals jsonb; v_by_campaign jsonb; v_by_platform jsonb; v_daily jsonb;
begin
  select role into v_role from public.admin_users where id = v_actor;
  if v_role is null or v_role != 'admin' then raise exception 'NOT_AUTHORIZED' using errcode = '42501'; end if;

  with op as (
    select * from public.orders where status='pago'
      and (paid_at::date between p_date_from and p_date_to)
      and (p_event_id is null or event_id = p_event_id)
  ), sp as (
    select * from public.ad_spend where date between p_date_from and p_date_to
  )
  select jsonb_build_object(
    'revenue_cents', coalesce((select sum(total_cents) from op), 0),
    'spend_cents', coalesce((select sum(spend_cents) from sp), 0),
    'conversions', coalesce((select count(*) from op), 0),
    'impressions', coalesce((select sum(impressions) from sp), 0),
    'clicks', coalesce((select sum(clicks) from sp), 0)
  ) into v_totals;

  select coalesce(jsonb_agg(item order by spend_cents desc), '[]'::jsonb) into v_by_campaign
  from (
    select jsonb_build_object('campaign', campaign_name, 'platform', platform, 'spend_cents', spend_cents, 'impressions', impressions, 'clicks', clicks, 'conversions', conversions, 'revenue_cents', revenue_cents) as item, spend_cents
    from (
      select s.campaign_name, s.platform, sum(s.spend_cents) as spend_cents, sum(s.impressions) as impressions, sum(s.clicks) as clicks,
        coalesce((select count(*) from public.orders o where o.status='pago' and o.utm_campaign=s.campaign_name and o.paid_at::date between p_date_from and p_date_to and (p_event_id is null or o.event_id=p_event_id)), 0) as conversions,
        coalesce((select sum(o.total_cents) from public.orders o where o.status='pago' and o.utm_campaign=s.campaign_name and o.paid_at::date between p_date_from and p_date_to and (p_event_id is null or o.event_id=p_event_id)), 0) as revenue_cents
      from public.ad_spend s where s.date between p_date_from and p_date_to group by s.campaign_name, s.platform
    ) sub
  ) sub2;

  select coalesce(jsonb_agg(item order by spend_cents desc), '[]'::jsonb) into v_by_platform
  from (
    select jsonb_build_object('platform', platform, 'spend_cents', spend_cents, 'impressions', impressions, 'clicks', clicks) as item, spend_cents
    from (select platform, sum(spend_cents) as spend_cents, sum(impressions) as impressions, sum(clicks) as clicks from public.ad_spend where date between p_date_from and p_date_to group by platform) sub
  ) sub2;

  select coalesce(jsonb_agg(item order by day), '[]'::jsonb) into v_daily
  from (
    select jsonb_build_object('day', day, 'revenue_cents', revenue_cents, 'spend_cents', spend_cents) as item, day
    from (
      select d as day,
        coalesce((select sum(total_cents) from public.orders where status='pago' and paid_at::date=d and (p_event_id is null or event_id=p_event_id)), 0) as revenue_cents,
        coalesce((select sum(spend_cents) from public.ad_spend where date=d), 0) as spend_cents
      from generate_series(p_date_from, p_date_to, '1 day'::interval)::date as d
    ) per_day
  ) sub;

  return jsonb_build_object('date_from', p_date_from, 'date_to', p_date_to, 'totals', v_totals, 'by_campaign', v_by_campaign, 'by_platform', v_by_platform, 'daily', v_daily);
end;
$$;
grant execute on function public.get_roi_stats(uuid, date, date) to authenticated;
revoke execute on function public.get_roi_stats(uuid, date, date) from anon, public;
