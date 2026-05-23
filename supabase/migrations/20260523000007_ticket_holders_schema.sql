-- ============================================================
-- TICKET HOLDERS — dados do titular de cada ingresso (acompanhantes)
-- ============================================================
alter table public.tickets
  add column if not exists holder_name text,
  add column if not exists holder_email text,
  add column if not exists holder_cpf text,
  add column if not exists holder_phone text;

alter table public.order_items
  add column if not exists holders jsonb;

comment on column public.order_items.holders is 'Array de holders: [{name, email, cpf, phone, same_as_buyer?}]. Length = quantity.';

-- reserve_tickets: aceita items.holders e salva snapshot em order_items.holders
create or replace function public.reserve_tickets(
  p_event_id uuid, p_items jsonb,
  p_buyer_name text, p_buyer_email citext, p_buyer_phone text, p_buyer_cpf text,
  p_utm jsonb, p_ip inet, p_user_agent text
)
returns table(order_id uuid, total_cents integer)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_order_id uuid; v_total integer := 0; v_item jsonb; v_tt record;
  v_qty integer; v_subtotal integer; v_holders jsonb;
begin
  if not exists (select 1 from public.events where id = p_event_id and status = 'publicado') then
    raise exception 'EVENT_NOT_AVAILABLE';
  end if;
  insert into public.orders (event_id, buyer_name, buyer_email, buyer_phone, buyer_cpf,
    total_cents, status, expires_at, utm_source, utm_medium, utm_campaign, utm_term, utm_content, ip, user_agent)
  values (p_event_id, p_buyer_name, p_buyer_email, p_buyer_phone, p_buyer_cpf,
    0, 'pendente', now() + interval '10 minutes',
    p_utm->>'source', p_utm->>'medium', p_utm->>'campaign', p_utm->>'term', p_utm->>'content', p_ip, p_user_agent)
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::int;
    if v_qty <= 0 then raise exception 'INVALID_QUANTITY'; end if;
    v_holders := v_item->'holders';
    if v_holders is not null and jsonb_array_length(v_holders) <> v_qty then
      raise exception 'HOLDERS_QUANTITY_MISMATCH';
    end if;
    select * into v_tt from public.ticket_types
      where id = (v_item->>'ticket_type_id')::uuid and event_id = p_event_id for update;
    if not found then raise exception 'TICKET_TYPE_NOT_FOUND'; end if;
    if v_tt.active = false then raise exception 'TICKET_TYPE_INACTIVE'; end if;
    if v_tt.sale_starts_at is not null and now() < v_tt.sale_starts_at then raise exception 'SALE_NOT_STARTED'; end if;
    if v_tt.sale_ends_at is not null and now() > v_tt.sale_ends_at then raise exception 'SALE_ENDED'; end if;
    if v_tt.qty_sold + v_qty > v_tt.qty_total then raise exception 'NOT_ENOUGH_TICKETS'; end if;
    v_subtotal := v_tt.price_cents * v_qty;
    v_total := v_total + v_subtotal;
    insert into public.order_items (order_id, ticket_type_id, quantity, unit_price_cents, subtotal_cents, holders)
    values (v_order_id, v_tt.id, v_qty, v_tt.price_cents, v_subtotal, v_holders);
    update public.ticket_types set qty_sold = qty_sold + v_qty where id = v_tt.id;
  end loop;

  update public.orders set total_cents = v_total where id = v_order_id;
  return query select v_order_id, v_total;
end;
$$;

-- checkin_ticket retorna holder_name agora
create or replace function public.checkin_ticket(p_hash text, p_device text default null)
returns table(
  result text, ticket_id uuid, ticket_type_name text,
  event_name text, event_starts_at timestamptz, event_location_name text,
  buyer_name text, buyer_cpf_masked text, used_at timestamptz, used_by_email text
)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor uuid := (select auth.uid()); v_role text;
  v_ticket public.tickets; v_event public.events;
  v_ticket_type public.ticket_types; v_order public.orders;
  v_result text; v_updated_count int; v_actor_email text;
  v_holder_name text; v_holder_cpf text; v_cpf_masked text;
begin
  select role into v_role from public.admin_users where id = v_actor;
  if v_role is null or v_role not in ('admin', 'operator') then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  select * into v_ticket from public.tickets where hash = p_hash;
  if not found then
    return query select 'invalido'::text, null::uuid, null::text, null::text, null::timestamptz, null::text, null::text, null::text, null::timestamptz, null::text;
    return;
  end if;
  select * into v_event from public.events where id = v_ticket.event_id;
  select * into v_ticket_type from public.ticket_types where id = v_ticket.ticket_type_id;
  select * into v_order from public.orders where id = v_ticket.order_id;
  select email into v_actor_email from public.admin_users where id = v_actor;
  v_holder_name := coalesce(v_ticket.holder_name, v_order.buyer_name);
  v_holder_cpf := coalesce(v_ticket.holder_cpf, v_order.buyer_cpf);

  if v_ticket.status = 'cancelado' then v_result := 'cancelado';
  elsif v_ticket.status = 'usado' then v_result := 'ja_usado';
  else
    update public.tickets set status = 'usado', used_at = now(), used_by = v_actor, used_device = p_device
      where id = v_ticket.id and status = 'valido';
    get diagnostics v_updated_count = row_count;
    if v_updated_count > 0 then
      v_result := 'ok'; v_ticket.status := 'usado'; v_ticket.used_at := now();
    else
      v_result := 'ja_usado';
      select * into v_ticket from public.tickets where id = v_ticket.id;
    end if;
  end if;
  insert into public.checkins (ticket_id, event_id, operator_id, result, device)
  values (v_ticket.id, v_event.id, v_actor, v_result, p_device);
  if v_holder_cpf is not null and length(v_holder_cpf) = 11 then
    v_cpf_masked := substr(v_holder_cpf,1,3) || '.***.***-' || substr(v_holder_cpf,10,2);
  else v_cpf_masked := '***'; end if;
  return query select v_result::text, v_ticket.id, v_ticket_type.name,
    v_event.name, v_event.starts_at, v_event.location_name,
    v_holder_name, v_cpf_masked, v_ticket.used_at, v_actor_email;
end;
$$;
