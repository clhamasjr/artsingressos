-- ============================================================
-- FIX: policies usam private.is_admin() em USING/WITH CHECK, mas
-- anon/authenticated nao tinham EXECUTE permission, causando erro
-- "permission denied for function is_admin" no SELECT de admin_users
-- (e em qualquer query que dispara essas policies).
--
-- Solucao: GRANT EXECUTE para anon e authenticated.
-- O schema 'private' nao esta exposto via PostgREST (so 'public',
-- 'storage', 'graphql_public' por default), entao mesmo com USAGE
-- + EXECUTE, a funcao continua nao chamavel via /rest/v1/rpc/.
-- ============================================================

grant usage on schema private to authenticated, anon;
grant execute on function private.is_admin() to authenticated, anon;
grant execute on function private.is_admin_or_operator() to authenticated, anon;
