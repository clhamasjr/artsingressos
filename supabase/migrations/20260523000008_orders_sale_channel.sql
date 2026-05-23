-- Sale channel: online (compra pelo site) ou presencial (PDV)
alter table public.orders
  add column if not exists sale_channel text not null default 'online' check (sale_channel in ('online','presencial')),
  add column if not exists sold_by_id uuid references public.admin_users(id);

create index if not exists idx_orders_sale_channel on public.orders(sale_channel);

-- Aceitar payment_method presenciais
alter type payment_method add value if not exists 'dinheiro';
alter type payment_method add value if not exists 'cartao_maquininha';
alter type payment_method add value if not exists 'pix_manual';
