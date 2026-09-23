-- Referências a pessoa por id, resolvidas pelo nome curto atual na aplicação.
-- Transação explícita mantém o arquivo atômico inclusive com CREATE INDEX.
-- FK composta impede referências entre unidades.
-- ON DELETE NO ACTION, não RESTRICT: recusa apagar pessoa em uso, mas checa
-- no fim do comando para permitir excluir a unidade inteira em cascata
-- (equipe e regras juntas), independentemente da ordem interna da cascata.
-- Backfill por btrim(nome_curto), só com exatamente uma correspondência.
-- Erros mostram tabela/nome/quantidade, nunca ids nos logs públicos.
-- Pré-verificação (somente leitura; deve voltar vazia):
-- with refs as (
--   select 'colocacoes_fixas.pessoa_curto' tabela, unidade_id, pessoa_curto nome from public.colocacoes_fixas
--   union all
--   select 'proibicoes.pessoa_curto' tabela, unidade_id, pessoa_curto nome from public.proibicoes
--   union all
--   select 'duplas_proibidas.pessoa_a' tabela, unidade_id, pessoa_a nome from public.duplas_proibidas
--   union all
--   select 'duplas_proibidas.pessoa_b' tabela, unidade_id, pessoa_b nome from public.duplas_proibidas
-- ) select r.* from refs r where
--   (select count(*) from public.equipe e where e.unidade_id = r.unidade_id
--     and btrim(e.nome_curto) = btrim(r.nome)) <> 1;

begin;
alter table public.equipe add constraint equipe_id_unidade_key unique (id, unidade_id);
alter table public.colocacoes_fixas add column pessoa_id uuid;
alter table public.proibicoes add column pessoa_id uuid;
alter table public.duplas_proibidas add column pessoa_a_id uuid;
alter table public.duplas_proibidas add column pessoa_b_id uuid;

create function pg_temp.pessoa_por_nome(u uuid, ref text) returns uuid
language sql stable as $$
  select (array_agg(e.id))[1] from public.equipe e
   where e.unidade_id = u and btrim(e.nome_curto) = btrim(ref)
  having count(*) = 1
$$;
update public.colocacoes_fixas set pessoa_id = pg_temp.pessoa_por_nome(unidade_id, pessoa_curto);
update public.proibicoes set pessoa_id = pg_temp.pessoa_por_nome(unidade_id, pessoa_curto);
update public.duplas_proibidas set pessoa_a_id = pg_temp.pessoa_por_nome(unidade_id, pessoa_a);
update public.duplas_proibidas set pessoa_b_id = pg_temp.pessoa_por_nome(unidade_id, pessoa_b);

do $$
declare pendentes text;
begin
  -- Só tabela e quantidade: o log do CI é público e nome de pessoa é dado
  -- pessoal. Para ver quais linhas, rode a pré-verificação do cabeçalho.
  select string_agg(format('%s: %s linha(s)', tabela, n), E'\n' order by tabela)
    into pendentes from (
      select tabela, count(*) n from (
        select 'colocacoes_fixas.pessoa_curto' tabela from public.colocacoes_fixas where pessoa_id is null
        union all
        select 'proibicoes.pessoa_curto' from public.proibicoes where pessoa_id is null
        union all
        select 'duplas_proibidas.pessoa_a' from public.duplas_proibidas where pessoa_a_id is null
        union all
        select 'duplas_proibidas.pessoa_b' from public.duplas_proibidas where pessoa_b_id is null
      ) x group by tabela
    ) y;
  if pendentes is not null then
    raise exception using
      message = 'Referências a pessoa sem correspondência única na unidade (nome inexistente ou ambíguo). Nada foi aplicado.',
      detail = pendentes,
      hint = 'Use a pré-verificação de 20260923154308_pessoa_id_referencias.sql, corrija os nomes e rode de novo.';
  end if;
end $$;

alter table public.colocacoes_fixas
  alter column pessoa_id set not null,
  add constraint colocacoes_fixas_pessoa_id_fk foreign key (pessoa_id, unidade_id)
    references public.equipe (id, unidade_id) on delete no action;
create index on public.colocacoes_fixas (pessoa_id);
alter table public.proibicoes
  alter column pessoa_id set not null,
  add constraint proibicoes_pessoa_id_fk foreign key (pessoa_id, unidade_id)
    references public.equipe (id, unidade_id) on delete no action;
create index on public.proibicoes (pessoa_id);
alter table public.duplas_proibidas
  alter column pessoa_a_id set not null,
  add constraint duplas_proibidas_pessoa_a_id_fk foreign key (pessoa_a_id, unidade_id)
    references public.equipe (id, unidade_id) on delete no action;
create index on public.duplas_proibidas (pessoa_a_id);
alter table public.duplas_proibidas
  alter column pessoa_b_id set not null,
  add constraint duplas_proibidas_pessoa_b_id_fk foreign key (pessoa_b_id, unidade_id)
    references public.equipe (id, unidade_id) on delete no action;
create index on public.duplas_proibidas (pessoa_b_id);

-- As constraints das colunas antigas caem junto com elas.
alter table public.colocacoes_fixas drop column pessoa_curto;
alter table public.proibicoes drop column pessoa_curto;
alter table public.duplas_proibidas drop column pessoa_a;
alter table public.duplas_proibidas drop column pessoa_b;
alter table public.proibicoes
  add constraint proibicoes_unidade_pessoa_sitio_key unique (unidade_id, pessoa_id, sitio_id);
alter table public.duplas_proibidas
  add constraint duplas_proibidas_pessoas_distintas check (pessoa_a_id <> pessoa_b_id),
  add constraint duplas_proibidas_unidade_pessoas_key unique (unidade_id, pessoa_a_id, pessoa_b_id);
commit;
