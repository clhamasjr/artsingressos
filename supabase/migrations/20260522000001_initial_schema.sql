-- ============================================================
-- Arts Ingressos - migration inicial
-- Cria todas as tabelas + RLS + helpers + RPC de reserva atômica
-- ============================================================

-- ----- EXTENSIONS -----
create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ----- ENUMS -----
do $$ begin
  create type event_status as enum ('rascunho','publicado','encerrado','cancelado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type order_status as enum ('pendente','pago','falhou','expirado','cancelado','estornado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_method as enum ('pix','credit_card','debit_card');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ticket_status as enum ('valido','usado','cancelado');
exception when duplicate_object then null; end $$;

-- ----- HELPER: updated_at -----
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

-- ============================================================
-- ADMIN USERS (apenas pessoas com login podem aparecer aqui)
-- ============================================================
create table if not exists public.admin_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email citext not null unique,
  name text,
  role text not null default 'admin' check (role in ('admin','operator')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists admin_users_updated_at on public.admin_users;
create trigger admin_users_updated_at before update on public.admin_users
  for each row execute function public.set_updated_at();

create or replace function public.is_admin()
returns boolean language sql security definer set search_path = public, pg_temp stable as $$
  select exists(select 1 from public.admin_users where id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_admin_or_operator()
returns boolean language sql security definer set search_path = public, pg_temp stable as $$
  select exists(select 1 from public.admin_users where id = auth.uid() and role in ('admin','operator'));
$$;

-- ============================================================
-- EVENTS
-- ============================================================
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  banner_url text,
  location_name text,
  location_address text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  status event_status not null default 'rascunho',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_events_status_starts on public.events(status, starts_at);
create index if not exists idx_events_slug on public.events(slug);

drop trigger if exists events_updated_at on public.events;
create trigger events_updated_at before update on public.events
  for each row execute function public.set_updated_at();

-- ============================================================
-- TICKET TYPES (lotes)
-- ============================================================
create table if not exists public.ticket_types (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  description text,
  price_cents integer not null check (price_cents >= 0),
  qty_total integer not null check (qty_total >= 0),
  qty_sold integer not null default 0 check (qty_sold >= 0),
  sale_starts_at timestamptz,
  sale_ends_at timestamptz,
  position integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (qty_sold <= qty_total)
);

create index if not exists idx_ticket_types_event on public.ticket_types(event_id, position);

drop trigger if exists ticket_types_updated_at on public.ticket_types;
create trigger ticket_types_updated_at before update on public.ticket_types
  for each row execute function public.set_updated_at();

-- ============================================================
-- ORDERS
-- ============================================================
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  buyer_name text not null,
  buyer_email citext not null,
  buyer_phone text not null,
  buyer_cpf text not null,
  total_cents integer not null check (total_cents >= 0),
  status order_status not null default 'pendente',
  payment_method payment_method,
  mp_preference_id text,
  mp_payment_id text unique,
  paid_at timestamptz,
  expires_at timestamptz not null,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  ip inet,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_orders_status_expires on public.orders(status, expires_at);
create index if not exists idx_orders_buyer_email on public.orders(buyer_email);
create index if not exists idx_orders_buyer_cpf on public.orders(buyer_cpf);
create index if not exists idx_orders_created on public.orders(created_at desc);

drop trigger if exists orders_updated_at on public.orders;
create trigger orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

-- ============================================================
-- ORDER ITEMS
-- ============================================================
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  ticket_type_id uuid not null references public.ticket_types(id),
  quantity integer not null check (quantity > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  subtotal_cents integer not null check (subtotal_cents >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_order_items_order on public.order_items(order_id);

-- ============================================================
-- TICKETS (vouchers com hash HMAC no QR)
-- ============================================================
create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  ticket_type_id uuid not null references public.ticket_types(id),
  event_id uuid not null references public.events(id),
  hash text not null unique,
  status ticket_status not null default 'valido',
  used_at timestamptz,
  used_by uuid references public.admin_users(id),
  used_device text,
  created_at timestamptz not null default now()
);

create index if not exists idx_tickets_order on public.tickets(order_id);
create index if not exists idx_tickets_event_status on public.tickets(event_id, status);
create index if not exists idx_tickets_hash on public.tickets(hash);

-- ============================================================
-- CHECKINS (log de cada leitura de QR)
-- ============================================================
create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id),
  event_id uuid not null references public.events(id),
  operator_id uuid references public.admin_users(id),
  device text,
  result text not null check (result in ('ok','ja_usado','invalido','evento_errado','cancelado')),
  raw_payload jsonb,
  ts timestamptz not null default now()
);

create index if not exists idx_checkins_ticket on public.checkins(ticket_id, ts desc);
create index if not exists idx_checkins_event_ts on public.checkins(event_id, ts desc);

-- ============================================================
-- WEBHOOK EVENTS (idempotência do Mercado Pago)
-- ============================================================
create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  external_id text not null,
  signature_valid boolean not null,
  raw_headers jsonb,
  raw_payload jsonb,
  processed boolean not null default false,
  processed_at timestamptz,
  error text,
  received_at timestamptz not null default now(),
  unique (source, external_id)
);

create index if not exists idx_webhook_processed on public.webhook_events(source, processed);

-- ============================================================
-- AUDIT LOG
-- ============================================================
create table if not exists public.audit_log (
  id bigserial primary key,
  actor_id uuid,
  actor_type text not null check (actor_type in ('admin','operator','system','anon')),
  entity_type text not null,
  entity_id uuid,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  ip inet,
  ts timestamptz not null default now()
);

create index if not exists idx_audit_entity on public.audit_log(entity_type, entity_id, ts desc);
create index if not exists idx_audit_actor on public.audit_log(actor_id, ts desc);

-- ============================================================
-- AD SPEND (Fase 3 - dashboard ROI)
-- ============================================================
create table if not exists public.ad_spend (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  platform text not null check (platform in ('meta','tiktok','google')),
  campaign_id text not null,
  campaign_name text,
  spend_cents integer not null default 0,
  impressions integer not null default 0,
  clicks integer not null default 0,
  raw jsonb,
  created_at timestamptz not null default now(),
  unique (date, platform, campaign_id)
);

create index if not exists idx_ad_spend_date_platform on public.ad_spend(date desc, platform);

-- ============================================================
-- ROW LEVEL SECURITY - habilita em TODAS as tabelas
-- ============================================================
alter table public.admin_users    enable row level security;
alter table public.events         enable row level security;
alter table public.ticket_types   enable row level security;
alter table public.orders         enable row level security;
alter table public.order_items    enable row level security;
alter table public.tickets        enable row level security;
alter table public.checkins       enable row level security;
alter table public.webhook_events enable row level security;
alter table public.audit_log      enable row level security;
alter table public.ad_spend       enable row level security;

-- ============================================================
-- POLICIES
-- ============================================================

-- ADMIN_USERS: cada um lê o próprio; admin lê todos; só admin escreve
drop policy if exists admin_users_self_read   on public.admin_users;
drop policy if exists admin_users_admin_write on public.admin_users;
create policy admin_users_self_read on public.admin_users
  for select to authenticated using (id = auth.uid() or public.is_admin());
create policy admin_users_admin_write on public.admin_users
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- EVENTS: anon lê publicado; admin tudo
drop policy if exists events_anon_read_published on public.events;
drop policy if exists events_auth_read_published on public.events;
drop policy if exists events_admin_all           on public.events;
create policy events_anon_read_published on public.events
  for select to anon using (status = 'publicado');
create policy events_auth_read_published on public.events
  for select to authenticated using (status = 'publicado' or public.is_admin());
create policy events_admin_all on public.events
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- TICKET_TYPES: anon lê ativos de eventos publicados; admin tudo
drop policy if exists ticket_types_anon_read_active on public.ticket_types;
drop policy if exists ticket_types_auth_read        on public.ticket_types;
drop policy if exists ticket_types_admin_write      on public.ticket_types;
create policy ticket_types_anon_read_active on public.ticket_types
  for select to anon using (
    active = true and exists (
      select 1 from public.events e where e.id = ticket_types.event_id and e.status = 'publicado'
    )
  );
create policy ticket_types_auth_read on public.ticket_types
  for select to authenticated using (
    public.is_admin() or (
      active = true and exists (
        select 1 from public.events e where e.id = ticket_types.event_id and e.status = 'publicado'
      )
    )
  );
create policy ticket_types_admin_write on public.ticket_types
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ORDERS: anon BLOQUEADO. Acesso ao próprio pedido SEMPRE via Edge Function. Admin tudo.
drop policy if exists orders_admin_all on public.orders;
create policy orders_admin_all on public.orders
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ORDER_ITEMS: idem
drop policy if exists order_items_admin_all on public.order_items;
create policy order_items_admin_all on public.order_items
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- TICKETS: operadores leem (pra check-in); admin escreve
drop policy if exists tickets_admin_read  on public.tickets;
drop policy if exists tickets_admin_write on public.tickets;
create policy tickets_admin_read on public.tickets
  for select to authenticated using (public.is_admin_or_operator());
create policy tickets_admin_write on public.tickets
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- CHECKINS: operadores inserem; admin lê/edita
drop policy if exists checkins_operator_insert on public.checkins;
drop policy if exists checkins_admin_select    on public.checkins;
drop policy if exists checkins_admin_modify    on public.checkins;
drop policy if exists checkins_admin_delete    on public.checkins;
create policy checkins_operator_insert on public.checkins
  for insert to authenticated with check (public.is_admin_or_operator());
create policy checkins_admin_select on public.checkins
  for select to authenticated using (public.is_admin_or_operator());
create policy checkins_admin_modify on public.checkins
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy checkins_admin_delete on public.checkins
  for delete to authenticated using (public.is_admin());

-- WEBHOOK_EVENTS: só service_role escreve (sem policy pra authenticated = bloqueia). Admin lê.
drop policy if exists webhook_events_admin_read on public.webhook_events;
create policy webhook_events_admin_read on public.webhook_events
  for select to authenticated using (public.is_admin());

-- AUDIT_LOG: só admin lê. Insert via service_role.
drop policy if exists audit_log_admin_read on public.audit_log;
create policy audit_log_admin_read on public.audit_log
  for select to authenticated using (public.is_admin());

-- AD_SPEND: só admin
drop policy if exists ad_spend_admin_all on public.ad_spend;
create policy ad_spend_admin_all on public.ad_spend
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- RPC: reserve_tickets — transação atômica de reserva
-- Chamada pela Edge Function create-order com service_role.
-- Faz SELECT FOR UPDATE em ticket_types pra evitar overselling.
-- ============================================================
create or replace function public.reserve_tickets(
  p_event_id uuid,
  p_items jsonb,
  p_buyer_name text,
  p_buyer_email citext,
  p_buyer_phone text,
  p_buyer_cpf text,
  p_utm jsonb,
  p_ip inet,
  p_user_agent text
)
returns table(order_id uuid, total_cents integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order_id uuid;
  v_total integer := 0;
  v_item jsonb;
  v_tt record;
  v_qty integer;
  v_subtotal integer;
begin
  if not exists (select 1 from public.events where id = p_event_id and status = 'publicado') then
    raise exception 'EVENT_NOT_AVAILABLE';
  end if;

  insert into public.orders (event_id, buyer_name, buyer_email, buyer_phone, buyer_cpf,
                             total_cents, status, expires_at, utm_source, utm_medium,
                             utm_campaign, utm_term, utm_content, ip, user_agent)
  values (p_event_id, p_buyer_name, p_buyer_email, p_buyer_phone, p_buyer_cpf,
          0, 'pendente', now() + interval '10 minutes',
          p_utm->>'source', p_utm->>'medium', p_utm->>'campaign',
          p_utm->>'term', p_utm->>'content', p_ip, p_user_agent)
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::int;
    if v_qty <= 0 then raise exception 'INVALID_QUANTITY'; end if;

    -- Lock pessimista pra evitar overselling em concorrência
    select * into v_tt
    from public.ticket_types
    where id = (v_item->>'ticket_type_id')::uuid and event_id = p_event_id
    for update;

    if not found                                       then raise exception 'TICKET_TYPE_NOT_FOUND'; end if;
    if v_tt.active = false                             then raise exception 'TICKET_TYPE_INACTIVE'; end if;
    if v_tt.sale_starts_at is not null and now() < v_tt.sale_starts_at then raise exception 'SALE_NOT_STARTED'; end if;
    if v_tt.sale_ends_at   is not null and now() > v_tt.sale_ends_at   then raise exception 'SALE_ENDED'; end if;
    if v_tt.qty_sold + v_qty > v_tt.qty_total          then raise exception 'NOT_ENOUGH_TICKETS'; end if;

    v_subtotal := v_tt.price_cents * v_qty;
    v_total := v_total + v_subtotal;

    insert into public.order_items (order_id, ticket_type_id, quantity, unit_price_cents, subtotal_cents)
    values (v_order_id, v_tt.id, v_qty, v_tt.price_cents, v_subtotal);

    update public.ticket_types set qty_sold = qty_sold + v_qty where id = v_tt.id;
  end loop;

  update public.orders set total_cents = v_total where id = v_order_id;

  return query select v_order_id, v_total;
end;
$$;

-- Garante que reserve_tickets só seja chamada via service_role (Edge Function)
revoke all on function public.reserve_tickets(uuid, jsonb, text, citext, text, text, jsonb, inet, text)
  from public, anon, authenticated;

-- ============================================================
-- RPC: release_expired_orders — libera estoque de pedidos vencidos
-- Roda em cron (1x/min) ou chamada manualmente.
-- ============================================================
create or replace function public.release_expired_orders()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer := 0;
  v_order record;
begin
  for v_order in
    select id from public.orders
    where status = 'pendente' and expires_at < now()
    for update
  loop
    -- devolve estoque
    update public.ticket_types tt
    set qty_sold = greatest(0, tt.qty_sold - oi.quantity)
    from public.order_items oi
    where oi.order_id = v_order.id and oi.ticket_type_id = tt.id;

    update public.orders set status = 'expirado' where id = v_order.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.release_expired_orders() from public, anon, authenticated;
