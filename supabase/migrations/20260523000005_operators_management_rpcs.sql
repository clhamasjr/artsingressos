-- ============================================================
-- Gerenciamento de operadores via RPCs (só admin pode chamar)
-- ============================================================

-- 1) Lista operadores (whitelist + admin_users existentes)
create or replace function public.list_operators()
returns table(
  email citext, role text, status text, user_id uuid,
  last_sign_in_at timestamptz, added_at timestamptz
)
language plpgsql security definer
set search_path = public, private, pg_temp stable
as $$
declare v_actor uuid := (select auth.uid());
begin
  if not exists (select 1 from public.admin_users where id = v_actor and role = 'admin') then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  return query
  select
    coalesce(au.email, wl.email) as email,
    coalesce(au.role, wl.role) as role,
    case when au.id is not null then 'active' else 'invited' end as status,
    au.id as user_id, u.last_sign_in_at,
    coalesce(au.created_at, wl.added_at) as added_at
  from private.admin_bootstrap_whitelist wl
  full outer join public.admin_users au on au.email = wl.email
  left join auth.users u on u.id = au.id
  order by added_at desc;
end;
$$;
grant execute on function public.list_operators() to authenticated;
revoke execute on function public.list_operators() from anon, public;

-- 2) Adicionar operador (whitelist + promove se user já existe)
create or replace function public.add_operator(p_email citext, p_role text default 'operator')
returns void
language plpgsql security definer
set search_path = public, private, pg_temp
as $$
declare
  v_actor uuid := (select auth.uid());
  v_existing_user_id uuid;
begin
  if not exists (select 1 from public.admin_users where id = v_actor and role = 'admin') then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if p_role not in ('admin', 'operator') then raise exception 'INVALID_ROLE'; end if;

  insert into private.admin_bootstrap_whitelist (email, role)
  values (lower(trim(p_email::text))::citext, p_role)
  on conflict (email) do update set role = excluded.role;

  select id into v_existing_user_id from auth.users where lower(email) = lower(p_email::text) limit 1;
  if v_existing_user_id is not null then
    insert into public.admin_users (id, email, role)
    values (v_existing_user_id, lower(trim(p_email::text))::citext, p_role)
    on conflict (id) do update set role = excluded.role;
  end if;
end;
$$;
grant execute on function public.add_operator(citext, text) to authenticated;
revoke execute on function public.add_operator(citext, text) from anon, public;

-- 3) Remover operador
create or replace function public.remove_operator(p_email citext)
returns void
language plpgsql security definer
set search_path = public, private, pg_temp
as $$
declare
  v_actor uuid := (select auth.uid());
  v_actor_email citext;
begin
  if not exists (select 1 from public.admin_users where id = v_actor and role = 'admin') then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  select email into v_actor_email from public.admin_users where id = v_actor;
  if lower(v_actor_email::text) = lower(p_email::text) then
    raise exception 'CANNOT_REMOVE_SELF';
  end if;
  delete from private.admin_bootstrap_whitelist where lower(email::text) = lower(p_email::text);
  delete from public.admin_users where lower(email::text) = lower(p_email::text);
end;
$$;
grant execute on function public.remove_operator(citext) to authenticated;
revoke execute on function public.remove_operator(citext) from anon, public;
