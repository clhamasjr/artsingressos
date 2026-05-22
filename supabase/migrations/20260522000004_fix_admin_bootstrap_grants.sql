-- ============================================================
-- FIX: trigger handle_new_user falhou silenciosamente em produção.
-- Motivo: o role supabase_auth_admin (que executa triggers em auth.users)
-- nao tinha EXECUTE permission na function private.handle_new_user(),
-- pois revoke all on function ... from public removeu o grant default.
-- ============================================================

grant execute on function private.handle_new_user() to supabase_auth_admin;
grant usage on schema private to supabase_auth_admin;
grant select on private.admin_bootstrap_whitelist to supabase_auth_admin;

-- Promove qualquer usuario ja cadastrado que esteja na whitelist
-- mas ainda nao foi promovido (recuperacao apos o bug acima)
insert into public.admin_users (id, email, role)
select u.id, u.email, w.role
from auth.users u
join private.admin_bootstrap_whitelist w on w.email = u.email
on conflict (id) do nothing;
