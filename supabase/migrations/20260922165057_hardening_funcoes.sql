-- 1. search_path fixo na função de trigger (advisor 0011)
create or replace function public.touch_updated_at() returns trigger as $$
begin new.updated_at := now(); return new; end;
$$ language plpgsql set search_path = public;

-- 2. Tirar as funções SECURITY DEFINER da API REST pública (advisors 0028/0029).
--
-- ATENÇÃO: is_admin/is_coordenador/minha_unidade CONTINUAM executáveis por
-- `authenticated` de propósito. As policies de RLS são avaliadas no contexto
-- do usuário que consulta, então revogar EXECUTE delas para `authenticated`
-- quebraria o acesso a TODAS as tabelas. O que se revoga é o acesso anônimo.
revoke execute on function public.is_admin()       from anon;
revoke execute on function public.is_coordenador() from anon;
revoke execute on function public.minha_unidade()  from anon;

-- Estas duas nunca são chamadas por um usuário: rodam como trigger
-- (handle_new_user, pelo serviço de auth) e como event trigger de DDL.
revoke execute on function public.handle_new_user()  from anon, authenticated;
revoke execute on function public.touch_updated_at() from anon, authenticated;

-- rls_auto_enable é do ambiente Supabase, não deste repositório: num projeto
-- novo ela pode não existir, e um revoke direto abortaria a migração.
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'rls_auto_enable') then
    execute 'revoke execute on function public.rls_auto_enable() from anon, authenticated';
  end if;
end $$;
