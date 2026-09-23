-- Referência a sítio por id, não por nome.
--
-- `colocacoes_fixas.sitio_nome`, `proibicoes.sitio_nome` e `equipe.fixo_sitio`
-- guardavam o NOME do sítio (texto). Renomear um sítio em Configurações deixou
-- as colocações fixas da unidade piloto apontando para um nome que não existia
-- mais, e a geração da grade quebrou no validador. Com id + chave estrangeira,
-- renomear não quebra nada e apagar um sítio em uso é recusado pelo banco.
--
-- Decisões:
-- * FK composta (sitio_id, unidade_id) -> sitios(id, unidade_id): a regra só
--   pode apontar para sítio da MESMA unidade. Uma FK só em `id` aceitaria o id
--   de um sítio de outro hospital.
-- * ON DELETE NO ACTION (o padrão), não RESTRICT: apagar um sítio que alguma
--   regra ou pessoa usa falha alto do mesmo jeito, mas a checagem roda no fim
--   do comando, então excluir a UNIDADE inteira (cascata em sitios e nas
--   regras ao mesmo tempo) continua funcionando. RESTRICT checaria no meio da
--   cascata e poderia recusar a exclusão da unidade conforme a ordem interna.
-- * Backfill pelo nome dentro da mesma unidade: primeiro `nome`, depois
--   `nome_tarde`; nome ambíguo (dois sítios com o mesmo nome) não casa.
--   Sobrou referência sem sítio? A migração ABORTA listando as linhas. Nunca
--   vira NULL em silêncio.
-- * As colunas de texto são removidas aqui, não mantidas "só leitura" por uma
--   versão: ninguém as atualizaria num rename, e uma cópia de nome que
--   envelhece é exatamente o bug que esta migração corrige.
-- * `escalas_semanais.grade` também guarda nomes de sítio, mas é histórico:
--   fica como está. O app tolera sítio que não existe mais e avisa.

-- 1. alvo da FK composta
alter table public.sitios add constraint sitios_id_unidade_key unique (id, unidade_id);

-- 2. colunas novas, ainda sem restrição
alter table public.colocacoes_fixas add column sitio_id uuid;
alter table public.proibicoes       add column sitio_id uuid;
alter table public.equipe           add column fixo_sitio_id uuid;

-- 3. backfill pelo nome, na mesma unidade
create function pg_temp.sitio_por_nome(u uuid, ref text) returns uuid
language sql stable as $$
  select coalesce(
    (select (array_agg(s.id))[1] from public.sitios s
      where s.unidade_id = u and btrim(s.nome) = btrim(ref) having count(*) = 1),
    (select (array_agg(s.id))[1] from public.sitios s
      where s.unidade_id = u and btrim(s.nome_tarde) = btrim(ref) having count(*) = 1)
  )
$$;

-- "fora das Ações" (tipo fora_do) não usa sítio; o texto nessas linhas é
-- resíduo e é descartado.
update public.colocacoes_fixas
   set sitio_id = pg_temp.sitio_por_nome(unidade_id, sitio_nome)
 where tipo = 'fixa_sitio';

update public.proibicoes
   set sitio_id = pg_temp.sitio_por_nome(unidade_id, sitio_nome);

update public.equipe
   set fixo_sitio_id = pg_temp.sitio_por_nome(unidade_id, fixo_sitio)
 where nullif(btrim(fixo_sitio), '') is not null;

-- 4. falhar alto: nenhuma referência pode ficar sem sítio
do $$
declare pendentes text;
begin
  select string_agg(format('%s id=%s unidade=%s sitio=%L', tabela, id, unidade_id, nome), E'\n' order by tabela, nome)
    into pendentes
    from (
      select 'colocacoes_fixas' as tabela, id, unidade_id, sitio_nome as nome
        from public.colocacoes_fixas where tipo = 'fixa_sitio' and sitio_id is null
      union all
      select 'proibicoes', id, unidade_id, sitio_nome
        from public.proibicoes where sitio_id is null
      union all
      select 'equipe.fixo_sitio', id, unidade_id, fixo_sitio
        from public.equipe where nullif(btrim(fixo_sitio), '') is not null and fixo_sitio_id is null
    ) x;
  if pendentes is not null then
    raise exception using
      message = 'Referências a sítio sem correspondência na unidade (nome inexistente ou ambíguo). Corrija os nomes e rode de novo.',
      detail  = pendentes;
  end if;
end $$;

-- 5. restrições
alter table public.colocacoes_fixas
  add constraint colocacoes_fixas_sitio_fk foreign key (sitio_id, unidade_id)
      references public.sitios (id, unidade_id),
  add constraint colocacoes_fixas_sitio_por_tipo check ((tipo = 'fixa_sitio') = (sitio_id is not null));

alter table public.proibicoes
  alter column sitio_id set not null,
  add constraint proibicoes_sitio_fk foreign key (sitio_id, unidade_id)
      references public.sitios (id, unidade_id);

alter table public.equipe
  add constraint equipe_fixo_sitio_fk foreign key (fixo_sitio_id, unidade_id)
      references public.sitios (id, unidade_id);

create index on public.colocacoes_fixas (sitio_id);
create index on public.proibicoes (sitio_id);
create index on public.equipe (fixo_sitio_id);

-- 6. fora as colunas de texto (a unique antiga de proibicoes cai junto)
alter table public.colocacoes_fixas drop column sitio_nome;
alter table public.proibicoes       drop column sitio_nome;
alter table public.equipe           drop column fixo_sitio;

alter table public.proibicoes
  add constraint proibicoes_unidade_pessoa_sitio_key unique (unidade_id, pessoa_curto, sitio_id);
