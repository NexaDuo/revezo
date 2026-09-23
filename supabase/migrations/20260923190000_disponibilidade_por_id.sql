-- disponibilidade_semanal.dados passa a ser { "<equipe.id>": [...] } em vez de
-- { "<nome_curto>": [...] }. Renomear alguém na Equipe não pode mais soltar a
-- pessoa da própria disponibilidade.
--
-- Backfill tolerante: só troca a chave quando btrim(nome_curto) casa com
-- EXATAMENTE uma pessoa da unidade. Chave sem correspondência (nome fora da
-- Equipe, ambíguo) fica como está; o app lê os dois formatos e avisa na tela
-- sobre nome fora da equipe. Nada é apagado.
--
-- Reversão (se precisar): mesma função, trocando id -> nome_curto.

begin;

create function pg_temp.dados_por_id(u uuid, d jsonb) returns jsonb
language sql stable as $$
  select coalesce(jsonb_object_agg(coalesce(m.id::text, kv.key), kv.value), '{}'::jsonb)
    from jsonb_each(d) kv
    left join lateral (
      select (array_agg(e.id))[1] id from public.equipe e
       where e.unidade_id = u and btrim(e.nome_curto) = btrim(kv.key)
      having count(*) = 1
    ) m on true
$$;

update public.disponibilidade_semanal
   set dados = pg_temp.dados_por_id(unidade_id, dados)
 where jsonb_typeof(dados) = 'object';

commit;
