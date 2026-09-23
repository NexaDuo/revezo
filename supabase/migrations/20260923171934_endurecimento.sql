-- Endurecimento pendente das revisões de segurança (docs/PENDENCIAS.md).
--
-- 1. `escalas_semanais.criado_por` deixa de ser falsificável: a RPC
--    `salvar_escala_nova` já gravava `auth.uid()`, mas INSERT/UPDATE direto
--    pela API aceitava qualquer uuid. Agora o banco decide: no INSERT é quem
--    está logado; no UPDATE, o valor original nunca muda.
-- 2. `is_admin()`, `is_coordenador()` e `minha_unidade()` perdem o execute
--    de PUBLIC. A migração 20260922165057 revogou só de `anon`, mas `anon`
--    herdava de PUBLIC e continuava executando. Verificado antes: nenhuma
--    policy aplicável a `anon` usa essas funções (todas são `to authenticated`);
--    a leitura pública usa só `unidade_publica()`.
-- 3. Leitura pública (anônima ou de outra unidade) de `escalas_semanais` vê
--    só a versão ATIVA de cada semana; versões substituídas são rascunho.
--    Quem é da unidade (ou admin) continua vendo todas pela policy própria.
-- 4. Chave de regra `mariaVacina` -> `proibicoesSitio` (a antiga carregava
--    um primeiro nome). Nenhuma escala salva cita a chave.

begin;

-- 1
create function public.escalas_fixar_criado_por() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.criado_por := auth.uid();
  else
    new.criado_por := old.criado_por;
  end if;
  return new;
end $$;
revoke execute on function public.escalas_fixar_criado_por() from public, anon, authenticated;

create trigger escalas_fixar_criado_por before insert or update on public.escalas_semanais
  for each row execute function public.escalas_fixar_criado_por();

-- 2
revoke execute on function public.is_admin()       from public, anon;
revoke execute on function public.is_coordenador() from public, anon;
revoke execute on function public.minha_unidade()  from public, anon;
grant  execute on function public.is_admin()       to authenticated;
grant  execute on function public.is_coordenador() to authenticated;
grant  execute on function public.minha_unidade()  to authenticated;

-- 3
alter policy escalas_semanais_publica_select on public.escalas_semanais
  using (public.unidade_publica(unidade_id) and ativa);

-- 4
update public.regras_config set chave = 'proibicoesSitio' where chave = 'mariaVacina';

commit;
