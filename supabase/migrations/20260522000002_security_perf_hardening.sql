-- ============================================================
-- HARDENING: corrige WARNs do Security Advisor + perf
-- - search_path fixo em set_updated_at
-- - Move is_admin/is_admin_or_operator pro schema 'private' (não exposto via RPC)
-- - Recria policies separadas por command (resolve multiple_permissive_policies)
-- - Usa (select auth.uid()) (resolve auth_rls_initplan)
-- - Adiciona índices em FKs faltantes
-- ============================================================

-- 1) set_updated_at: search_path fixo
create or replace function public.set_updated_at()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
begin new.updated_at = now(); return new; end;
$$;

-- 2) Schema 'private' + helpers
create schema if not exists private;
grant usage on schema private to postgres, service_role;

create or replace function private.is_admin()
returns boolean language sql security definer set search_path = public, pg_temp stable as $$
  select exists(select 1 from public.admin_users where id = (select auth.uid()) and role = 'admin');
$$;

create or replace function private.is_admin_or_operator()
returns boolean language sql security definer set search_path = public, pg_temp stable as $$
  select exists(select 1 from public.admin_users where id = (select auth.uid()) and role in ('admin','operator'));
$$;

revoke all on function private.is_admin() from public, anon, authenticated;
revoke all on function private.is_admin_or_operator() from public, anon, authenticated;
grant execute on function private.is_admin() to postgres;
grant execute on function private.is_admin_or_operator() to postgres;

-- 3) Drop CASCADE das funções antigas (policies dependentes vão junto)
drop function if exists public.is_admin() cascade;
drop function if exists public.is_admin_or_operator() cascade;

-- CASCADE só remove policies que usam is_admin. As policies anon não dependiam e
-- precisam ser dropadas manualmente pra evitar duplicatas com as novas:
drop policy if exists events_anon_read_published on public.events;
drop policy if exists ticket_types_anon_read_active on public.ticket_types;

-- 4) Recriar policies separadas por command + usando private.is_admin
-- ADMIN_USERS
create policy admin_users_select on public.admin_users
  for select to authenticated using (id = (select auth.uid()) or private.is_admin());
create policy admin_users_insert on public.admin_users
  for insert to authenticated with check (private.is_admin());
create policy admin_users_update on public.admin_users
  for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy admin_users_delete on public.admin_users
  for delete to authenticated using (private.is_admin());

-- EVENTS
create policy events_anon_select_published on public.events
  for select to anon using (status = 'publicado');
create policy events_auth_select on public.events
  for select to authenticated using (status = 'publicado' or private.is_admin());
create policy events_admin_insert on public.events
  for insert to authenticated with check (private.is_admin());
create policy events_admin_update on public.events
  for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy events_admin_delete on public.events
  for delete to authenticated using (private.is_admin());

-- TICKET_TYPES
create policy ticket_types_anon_select on public.ticket_types
  for select to anon using (
    active = true and exists (
      select 1 from public.events e where e.id = ticket_types.event_id and e.status = 'publicado'
    )
  );
create policy ticket_types_auth_select on public.ticket_types
  for select to authenticated using (
    private.is_admin() or (
      active = true and exists (
        select 1 from public.events e where e.id = ticket_types.event_id and e.status = 'publicado'
      )
    )
  );
create policy ticket_types_admin_insert on public.ticket_types
  for insert to authenticated with check (private.is_admin());
create policy ticket_types_admin_update on public.ticket_types
  for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy ticket_types_admin_delete on public.ticket_types
  for delete to authenticated using (private.is_admin());

-- ORDERS
create policy orders_admin_select on public.orders for select to authenticated using (private.is_admin());
create policy orders_admin_insert on public.orders for insert to authenticated with check (private.is_admin());
create policy orders_admin_update on public.orders for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy orders_admin_delete on public.orders for delete to authenticated using (private.is_admin());

-- ORDER_ITEMS
create policy order_items_admin_select on public.order_items for select to authenticated using (private.is_admin());
create policy order_items_admin_insert on public.order_items for insert to authenticated with check (private.is_admin());
create policy order_items_admin_update on public.order_items for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy order_items_admin_delete on public.order_items for delete to authenticated using (private.is_admin());

-- TICKETS
create policy tickets_select on public.tickets for select to authenticated using (private.is_admin_or_operator());
create policy tickets_admin_insert on public.tickets for insert to authenticated with check (private.is_admin());
create policy tickets_admin_update on public.tickets for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy tickets_admin_delete on public.tickets for delete to authenticated using (private.is_admin());

-- CHECKINS
create policy checkins_select on public.checkins for select to authenticated using (private.is_admin_or_operator());
create policy checkins_insert on public.checkins for insert to authenticated with check (private.is_admin_or_operator());
create policy checkins_update on public.checkins for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy checkins_delete on public.checkins for delete to authenticated using (private.is_admin());

-- WEBHOOK_EVENTS / AUDIT_LOG / AD_SPEND
create policy webhook_events_admin_select on public.webhook_events for select to authenticated using (private.is_admin());
create policy audit_log_admin_select on public.audit_log for select to authenticated using (private.is_admin());
create policy ad_spend_admin_select on public.ad_spend for select to authenticated using (private.is_admin());
create policy ad_spend_admin_insert on public.ad_spend for insert to authenticated with check (private.is_admin());
create policy ad_spend_admin_update on public.ad_spend for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy ad_spend_admin_delete on public.ad_spend for delete to authenticated using (private.is_admin());

-- 5) Índices nas FKs faltantes
create index if not exists idx_checkins_operator        on public.checkins(operator_id);
create index if not exists idx_order_items_ticket_type  on public.order_items(ticket_type_id);
create index if not exists idx_orders_event             on public.orders(event_id);
create index if not exists idx_tickets_ticket_type      on public.tickets(ticket_type_id);
create index if not exists idx_tickets_used_by          on public.tickets(used_by);
