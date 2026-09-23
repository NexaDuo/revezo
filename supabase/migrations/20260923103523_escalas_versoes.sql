-- =====================================================================
-- Versões da grade semanal.
--
-- Antes: `unique (unidade_id, data_inicio)` e o app fazia upsert nessa chave,
-- então cada "Salvar" sobrescrevia a semana em silêncio.
-- Agora: várias versões por semana, exatamente UMA ativa. Gerar + salvar cria
-- uma linha nova (que vira a ativa); salvar uma grade aberta atualiza a linha
-- pelo id e não mexe em qual é a ativa.
--
-- Não destrutivo: nenhuma linha é apagada; as existentes (únicas por semana
-- até hoje) viram todas ativas pelo default da coluna.
-- =====================================================================

-- 1. Solta a chave única antiga. O nome gerado pelo Postgres para a
--    constraint inline é previsível, mas procurar pelas colunas evita
--    depender dele — e falha alto se não achar nada para soltar.
do $$
declare nome text;
begin
  select c.conname into nome
    from pg_constraint c
   where c.conrelid = 'public.escalas_semanais'::regclass
     and c.contype = 'u'
     and (select array_agg(a.attname::text order by a.attname)
            from unnest(c.conkey) k join pg_attribute a
              on a.attrelid = c.conrelid and a.attnum = k)
         = array['data_inicio', 'unidade_id'];
  if nome is null then
    raise exception 'Constraint unique (unidade_id, data_inicio) de escalas_semanais não encontrada';
  end if;
  execute format('alter table public.escalas_semanais drop constraint %I', nome);
end $$;

-- 2. Estado da versão.
alter table public.escalas_semanais
  add column ativa boolean not null default true,
  add column substituida_em timestamptz;

-- Ativa não tem data de substituição; substituída sempre tem.
alter table public.escalas_semanais
  add constraint escalas_semanais_substituicao_coerente
  check ((ativa and substituida_em is null) or (not ativa and substituida_em is not null));

-- No máximo uma ativa por (unidade, semana) — garantido pelo banco, não pelo app.
create unique index escalas_semanais_uma_ativa
  on public.escalas_semanais (unidade_id, data_inicio) where ativa;

-- `updated_at` mede alteração de CONTEÚDO. Trocar a versão ativa (ativa /
-- substituida_em) não é edição da grade e não pode aparecer como "Atualizada".
drop trigger escalas_touch on public.escalas_semanais;
create trigger escalas_touch before update on public.escalas_semanais
  for each row
  when ((old.titulo, old.data_inicio, old.data_fim, old.dias, old.grade, old.rodape, old.violacoes, old.score, old.status)
        is distinct from
        (new.titulo, new.data_inicio, new.data_fim, new.dias, new.grade, new.rodape, new.violacoes, new.score, new.status))
  execute function public.touch_updated_at();

-- 3. Troca da versão ativa, atômica.
--
-- SECURITY INVOKER de propósito: as policies `escalas_semanais_write`
-- (coordenador da unidade ou admin) continuam valendo dentro da função. Um
-- UPDATE barrado pela RLS não dá erro, só afeta zero linhas; por isso a
-- função conta as linhas e falha alto em vez de devolver sucesso vazio.
--
-- O advisory lock por (unidade, semana) serializa duas gravações simultâneas
-- da mesma semana: sem ele, a segunda não enxergaria a linha nova da primeira
-- e bateria no índice único em vez de substituí-la.

create function public.salvar_escala_nova(
  p_unidade_id  uuid,
  p_titulo      text,
  p_data_inicio date,
  p_data_fim    date,
  p_dias        jsonb,
  p_grade       jsonb,
  p_rodape      jsonb,
  p_violacoes   jsonb,
  p_score       integer,
  p_status      text
) returns public.escalas_semanais
language plpgsql security invoker set search_path = public as $$
declare nova public.escalas_semanais;
begin
  if p_unidade_id is null or p_data_inicio is null then
    raise exception 'Unidade e semana são obrigatórias para salvar a grade';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('escalas_semanais:' || p_unidade_id || ':' || p_data_inicio, 0));

  update public.escalas_semanais
     set ativa = false, substituida_em = now()
   where unidade_id = p_unidade_id and data_inicio = p_data_inicio and ativa;

  -- O INSERT passa pelo WITH CHECK da policy: sem permissão, erro (e o
  -- UPDATE acima é desfeito junto).
  insert into public.escalas_semanais
    (unidade_id, titulo, data_inicio, data_fim, dias, grade, rodape, violacoes, score, status, criado_por, ativa)
  values
    (p_unidade_id, p_titulo, p_data_inicio, p_data_fim,
     coalesce(p_dias, '[]'::jsonb), coalesce(p_grade, '{}'::jsonb),
     coalesce(p_rodape, '[]'::jsonb), coalesce(p_violacoes, '[]'::jsonb),
     coalesce(p_score, 0), coalesce(p_status, 'rascunho'), auth.uid(), true)
  returning * into nova;
  return nova;
end $$;

create function public.ativar_escala(p_id uuid) returns public.escalas_semanais
language plpgsql security invoker set search_path = public as $$
declare alvo public.escalas_semanais; n integer;
begin
  select * into alvo from public.escalas_semanais where id = p_id;
  if alvo.id is null then
    raise exception 'Grade % não encontrada ou sem acesso', p_id;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('escalas_semanais:' || alvo.unidade_id || ':' || alvo.data_inicio, 0));

  update public.escalas_semanais
     set ativa = false, substituida_em = now()
   where unidade_id = alvo.unidade_id and data_inicio = alvo.data_inicio and ativa and id <> p_id;

  update public.escalas_semanais
     set ativa = true, substituida_em = null
   where id = p_id
  returning * into alvo;
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'Sem permissão para ativar esta grade';
  end if;
  return alvo;
end $$;

revoke all on function public.salvar_escala_nova(uuid, text, date, date, jsonb, jsonb, jsonb, jsonb, integer, text) from public, anon;
revoke all on function public.ativar_escala(uuid) from public, anon;
grant execute on function public.salvar_escala_nova(uuid, text, date, date, jsonb, jsonb, jsonb, jsonb, integer, text) to authenticated;
grant execute on function public.ativar_escala(uuid) to authenticated;
