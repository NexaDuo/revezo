begin;

alter table public.escalas_semanais add column sitios jsonb;
comment on column public.escalas_semanais.sitios is 'Fotografia dos sítios; NULL identifica grades legadas sem fotografia.';

create or replace function public.escalas_touch_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin
  if (old.titulo, old.data_inicio, old.data_fim, old.dias, old.grade, old.sitios, old.rodape, old.violacoes, old.score, old.status)
     is distinct from
     (new.titulo, new.data_inicio, new.data_fim, new.dias, new.grade, new.sitios, new.rodape, new.violacoes, new.score, new.status) then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end $$;
revoke execute on function public.escalas_touch_updated_at() from public, anon, authenticated;

drop function public.salvar_escala_nova(uuid, text, date, date, jsonb, jsonb, jsonb, jsonb, integer, text);

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
  p_status      text,
  p_sitios      jsonb
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
    (unidade_id, titulo, data_inicio, data_fim, dias, grade, rodape, violacoes, score, status, sitios, criado_por, ativa)
  values
    (p_unidade_id, p_titulo, p_data_inicio, p_data_fim,
     coalesce(p_dias, '[]'::jsonb), coalesce(p_grade, '{}'::jsonb),
     coalesce(p_rodape, '[]'::jsonb), coalesce(p_violacoes, '[]'::jsonb),
     coalesce(p_score, 0), coalesce(p_status, 'rascunho'), p_sitios, auth.uid(), true)
  returning * into nova;
  return nova;
end $$;

revoke all on function public.salvar_escala_nova(uuid, text, date, date, jsonb, jsonb, jsonb, jsonb, integer, text, jsonb) from public, anon;
grant execute on function public.salvar_escala_nova(uuid, text, date, date, jsonb, jsonb, jsonb, jsonb, integer, text, jsonb) to authenticated;

commit;
