-- ============================================================
-- Tabela CUSTOMERS (contas de clientes que compram ingressos)
-- Separada de admin_users. Mesmo auth.users como base.
-- ============================================================
create table if not exists public.customers (
  id uuid primary key references auth.users(id) on delete cascade,
  email citext not null unique,
  name text not null,
  phone text,
  cpf text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_customers_email on public.customers(email);
create index if not exists idx_customers_cpf on public.customers(cpf);

drop trigger if exists customers_updated_at on public.customers;
create trigger customers_updated_at before update on public.customers
  for each row execute function public.set_updated_at();

-- RLS
alter table public.customers enable row level security;

drop policy if exists customers_self_select on public.customers;
drop policy if exists customers_self_update on public.customers;
drop policy if exists customers_admin_select on public.customers;

create policy customers_self_select on public.customers
  for select to authenticated using (id = (select auth.uid()));
create policy customers_self_update on public.customers
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy customers_admin_select on public.customers
  for select to authenticated using (private.is_admin());

-- Orders: customer_id (opcional, pra suportar PDV sem conta)
alter table public.orders add column if not exists customer_id uuid references public.customers(id);
create index if not exists idx_orders_customer on public.orders(customer_id);

drop policy if exists orders_customer_select on public.orders;
create policy orders_customer_select on public.orders
  for select to authenticated using (customer_id = (select auth.uid()));

drop policy if exists order_items_customer_select on public.order_items;
create policy order_items_customer_select on public.order_items
  for select to authenticated using (exists (
    select 1 from public.orders o
    where o.id = order_items.order_id and o.customer_id = (select auth.uid())
  ));

drop policy if exists tickets_customer_select on public.tickets;
create policy tickets_customer_select on public.tickets
  for select to authenticated using (exists (
    select 1 from public.orders o
    where o.id = tickets.order_id and o.customer_id = (select auth.uid())
  ));

-- Trigger handle_new_user atualizado pra criar customer quando aplicavel
create or replace function private.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public, private, pg_temp
as $$
declare
  v_role text;
  v_signup_type text;
  v_meta_name text;
  v_meta_phone text;
  v_meta_cpf text;
begin
  v_signup_type := new.raw_user_meta_data->>'signup_type';
  v_meta_name := coalesce(new.raw_user_meta_data->>'name', '');
  v_meta_phone := new.raw_user_meta_data->>'phone';
  v_meta_cpf := new.raw_user_meta_data->>'cpf';

  select role into v_role from private.admin_bootstrap_whitelist where email = new.email;
  if v_role is not null then
    insert into public.admin_users (id, email, role)
    values (new.id, new.email, v_role)
    on conflict (id) do nothing;
  end if;

  if v_signup_type = 'customer' or v_meta_name != '' then
    insert into public.customers (id, email, name, phone, cpf)
    values (new.id, new.email, coalesce(nullif(v_meta_name, ''), new.email), v_meta_phone, v_meta_cpf)
    on conflict (id) do nothing;
  end if;

  return new;
end;
$$;
