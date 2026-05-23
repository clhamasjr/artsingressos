-- ============================================================
-- RPC: checkin_ticket
-- Validação atômica de voucher na entrada (admin/operator).
-- - UPDATE atômico previne race condition de dupla entrada
-- - Log automático em checkins (audit trail)
-- - Retorna estado + dados pra UI
-- ============================================================
create or replace function public.checkin_ticket(p_hash text, p_device text default null)
returns table(
  result text,
  ticket_id uuid,
  ticket_type_name text,
  event_name text,
  event_starts_at timestamptz,
  event_location_name text,
  buyer_name text,
  buyer_cpf_masked text,
  used_at timestamptz,
  used_by_email text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := (select auth.uid());
  v_role text;
  v_ticket public.tickets;
  v_event public.events;
  v_ticket_type public.ticket_types;
  v_order public.orders;
  v_result text;
  v_updated_count int;
  v_actor_email text;
  v_cpf text;
  v_cpf_masked text;
begin
  -- 1) Permissão
  select role into v_role from public.admin_users where id = v_actor;
  if v_role is null or v_role not in ('admin', 'operator') then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  -- 2) Busca ticket pelo hash
  select * into v_ticket from public.tickets where hash = p_hash;
  if not found then
    return query select 'invalido'::text, null::uuid, null::text, null::text, null::timestamptz, null::text, null::text, null::text, null::timestamptz, null::text;
    return;
  end if;

  -- 3) Carrega relacionados
  select * into v_event from public.events where id = v_ticket.event_id;
  select * into v_ticket_type from public.ticket_types where id = v_ticket.ticket_type_id;
  select * into v_order from public.orders where id = v_ticket.order_id;
  select email into v_actor_email from public.admin_users where id = v_actor;

  -- 4) Tentativa de check-in atômica
  if v_ticket.status = 'cancelado' then
    v_result := 'cancelado';
  elsif v_ticket.status = 'usado' then
    v_result := 'ja_usado';
  else
    update public.tickets
    set status = 'usado', used_at = now(), used_by = v_actor, used_device = p_device
    where id = v_ticket.id and status = 'valido';
    get diagnostics v_updated_count = row_count;
    if v_updated_count > 0 then
      v_result := 'ok';
      v_ticket.status := 'usado';
      v_ticket.used_at := now();
      v_ticket.used_by := v_actor;
    else
      v_result := 'ja_usado';
      select * into v_ticket from public.tickets where id = v_ticket.id;
    end if;
  end if;

  -- 5) Log no checkins
  insert into public.checkins (ticket_id, event_id, operator_id, result, device)
  values (v_ticket.id, v_event.id, v_actor, v_result, p_device);

  -- 6) CPF mascarado
  v_cpf := v_order.buyer_cpf;
  if v_cpf is not null and length(v_cpf) = 11 then
    v_cpf_masked := substr(v_cpf,1,3) || '.***.***-' || substr(v_cpf,10,2);
  else
    v_cpf_masked := '***';
  end if;

  return query select
    v_result::text,
    v_ticket.id,
    v_ticket_type.name,
    v_event.name,
    v_event.starts_at,
    v_event.location_name,
    v_order.buyer_name,
    v_cpf_masked,
    v_ticket.used_at,
    v_actor_email;
end;
$$;

grant execute on function public.checkin_ticket(text, text) to authenticated;
revoke execute on function public.checkin_ticket(text, text) from anon, public;
