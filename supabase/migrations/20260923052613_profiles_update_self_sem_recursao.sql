-- profiles_update_self consultava public.profiles direto no WITH CHECK. Com a
-- profiles_select fechada (20260923044030), isso passou a dar "infinite
-- recursion detected in policy for relation profiles" em qualquer UPDATE de
-- profiles — inclusive o admin trocando papel. Lê o próprio perfil por funções
-- security definer, como is_admin()/minha_unidade() já fazem.
create function public.meu_papel() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;
create function public.meu_ativo() returns boolean
language sql stable security definer set search_path = public as $$
  select ativo from public.profiles where id = auth.uid();
$$;
revoke all on function public.meu_papel() from public, anon;
revoke all on function public.meu_ativo() from public, anon;
grant execute on function public.meu_papel() to authenticated;
grant execute on function public.meu_ativo() to authenticated;

alter policy profiles_update_self on public.profiles with check (
  id = (select auth.uid())
  and role is not distinct from (select public.meu_papel())
  and ativo is not distinct from (select public.meu_ativo())
  and unidade_id is not distinct from (select public.minha_unidade())
);
