-- ============================================================
-- ADMIN BOOTSTRAP - auto-promove emails da whitelist no signup
-- Fluxo: usuario clica em magic link -> auth.users insert -> trigger
-- verifica whitelist -> insere em admin_users com role apropriada
-- ============================================================

create table if not exists private.admin_bootstrap_whitelist (
  email citext primary key,
  role text not null default 'admin' check (role in ('admin','operator')),
  added_at timestamptz not null default now()
);
revoke all on table private.admin_bootstrap_whitelist from public, anon, authenticated;

insert into private.admin_bootstrap_whitelist (email, role)
values ('carlos@lhamascred.com.br', 'admin')
on conflict (email) do nothing;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
begin
  select role into v_role
  from private.admin_bootstrap_whitelist
  where email = new.email;

  if v_role is not null then
    insert into public.admin_users (id, email, role)
    values (new.id, new.email, v_role)
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();
