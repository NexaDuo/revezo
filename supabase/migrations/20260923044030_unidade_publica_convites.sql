-- Acesso público somente de leitura; as policies de escrita existentes permanecem.
alter table public.unidades add column publica boolean not null default false;

create function public.unidade_publica(uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.unidades where id = $1 and publica);
$$;
revoke all on function public.unidade_publica(uuid) from public;
grant execute on function public.unidade_publica(uuid) to anon, authenticated;
create policy unidades_publicas_select on public.unidades for select to anon, authenticated
  using (public.unidade_publica(id));
grant select on public.unidades to anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['equipe','sitios','regras_config','proibicoes',
    'duplas_proibidas','colocacoes_fixas','escalas_semanais',
    'disponibilidade_semanal','disponibilidade_mensal'] loop
    if to_regclass('public.' || t) is not null then
      execute format('create policy %I on public.%I for select to anon, authenticated using (public.unidade_publica(unidade_id))', t || '_publica_select', t);
      execute format('grant select on public.%I to anon, authenticated', t);
    end if;
  end loop;
end $$;

alter policy profiles_select on public.profiles using (
  id = (select auth.uid()) or (select public.is_admin()) or
  ((select public.is_coordenador()) and unidade_id = (select public.minha_unidade()))
);

create table public.convites (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(email)),
  unidade_id uuid not null references public.unidades on delete cascade,
  role text not null check (role in ('admin','coordenador','visualizador')),
  convidado_por uuid references auth.users on delete set null,
  aceito_em timestamptz,
  aceito_por uuid references auth.users on delete set null,
  created_at timestamptz default now()
);
create unique index convites_email_pendente on public.convites(email) where aceito_em is null;
create index convites_unidade on public.convites(unidade_id);
create index convites_convidado_por on public.convites(convidado_por);
create index convites_aceito_por on public.convites(aceito_por);
alter table public.convites enable row level security;
revoke all on public.convites from public, anon, authenticated;
grant select, insert, update, delete on public.convites to authenticated;
create policy convites_admin on public.convites for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy convites_coordenador_select on public.convites for select to authenticated
  using ((select public.is_coordenador()) and unidade_id = (select public.minha_unidade()));
create policy convites_coordenador_insert on public.convites for insert to authenticated
  with check ((select public.is_coordenador()) and unidade_id = (select public.minha_unidade())
    and role in ('coordenador','visualizador') and aceito_em is null and aceito_por is null
    and convidado_por = (select auth.uid()));
create policy convites_coordenador_delete on public.convites for delete to authenticated
  using ((select public.is_coordenador()) and unidade_id = (select public.minha_unidade()));

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare convite public.convites%rowtype; papel text;
begin
  -- Só e-mail confirmado herda convite: cadastro por senha ainda não
  -- confirmado não pode se apropriar do convite de outra pessoa. (Google já
  -- chega confirmado; senão, o aceite fica para aceitar_convite() no login.)
  if new.email_confirmed_at is not null then
    select * into convite from public.convites
      where email = lower(new.email) and aceito_em is null for update;
  end if;
  papel := coalesce(convite.role, case when not exists (select 1 from public.profiles)
    then 'admin' else 'visualizador' end);
  insert into public.profiles(id, email, nome, avatar_url, role, unidade_id)
    values (new.id, new.email,
      coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
      new.raw_user_meta_data->>'avatar_url', papel, convite.unidade_id)
    on conflict (id) do update set email = excluded.email,
      nome = coalesce(excluded.nome, public.profiles.nome),
      avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url);
  if convite.id is not null then
    update public.profiles set role = convite.role, unidade_id = convite.unidade_id where id = new.id;
    update public.convites set aceito_em = now(), aceito_por = new.id where id = convite.id;
  end if;
  return new;
end $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

create function public.aceitar_convite() returns void
language plpgsql security definer set search_path = public as $$
declare convite public.convites%rowtype; usuario uuid := auth.uid(); endereco text;
begin
  if usuario is null then raise exception 'Autenticação necessária'; end if;
  select lower(email) into endereco from auth.users
    where id = usuario and email_confirmed_at is not null;
  if endereco is null then return; end if;
  select * into convite from public.convites
    where email = endereco and aceito_em is null for update;
  if convite.id is null then return; end if;
  update public.profiles set role = convite.role, unidade_id = convite.unidade_id where id = usuario;
  if not found then raise exception 'Perfil não encontrado para aceitar convite'; end if;
  update public.convites set aceito_em = now(), aceito_por = usuario where id = convite.id;
end $$;
revoke all on function public.aceitar_convite() from public, anon;
grant execute on function public.aceitar_convite() to authenticated;

-- Dados inteiramente fictícios. Duas categorias, dois turnos e rotação entre
-- atendimento e ações; sem folgas presumidas pelo app.
insert into public.unidades(slug, nome, publica)
values ('demonstracao', 'Hospital Demonstração', true) on conflict (slug) do nothing;
insert into public.equipe(unidade_id, nome, nome_curto, categoria, turno_base, ordem)
select u.id, v.nome, v.nome, v.categoria, v.turno, v.ordem
from public.unidades u cross join (values
  ('Aurora Estelar','enf','manha',1), ('Íris Lunar','enf','manha',2),
  ('Ciro Cometa','tec','manha',3), ('Nilo Solar','tec','manha',4),
  ('Lira Boreal','enf','tarde',5), ('Orion Celeste','enf','tarde',6),
  ('Zafira Nuvem','tec','tarde',7), ('Téo Nebuloso','tec','tarde',8)
) v(nome,categoria,turno,ordem) where u.slug = 'demonstracao'
on conflict (unidade_id,nome_curto) do nothing;
insert into public.sitios(unidade_id,ordem,nome,categoria_permitida)
select u.id,v.ordem,v.nome,v.categoria from public.unidades u cross join (values
  (1,'Consulta demonstrativa','enf'), (2,'Cuidados demonstrativos','tec'), (3,'Ações educativas','ambos')
) v(ordem,nome,categoria) where u.slug = 'demonstracao'
on conflict (unidade_id,ordem) do nothing;
insert into public.regras_config(unidade_id,chave,nome,ativa,rigida,ordem)
select u.id,v.chave,v.nome,true,v.rigida,v.ordem from public.unidades u cross join (values
  ('disponibilidade','Disponibilidade',true,1), ('turnoBase','Turno-base',true,2),
  ('categoria','Categoria profissional',true,3), ('mariaVacina','Proibições por sítio',true,4),
  ('plantaoMesmo','Plantão no mesmo sítio',true,5), ('diasSeguidos','Dias seguidos',true,6),
  ('sextaSegunda','Sexta para segunda',true,7), ('duplaProibida','Duplas proibidas',true,8),
  ('fixas','Colocações fixas',true,9), ('acoesSemana','Ações na semana',false,10),
  ('cobertura','Cobertura dos sítios',false,11), ('alternancia16h','Alternância das 16h',false,12)
) v(chave,nome,rigida,ordem) where u.slug = 'demonstracao'
on conflict (unidade_id,chave) do nothing;
insert into public.disponibilidade_semanal(unidade_id,data_inicio,data_fim,dias,dados,origem)
select u.id, date_trunc('week', current_date)::date, date_trunc('week', current_date)::date + 4,
  '["Segunda","Terça","Quarta","Quinta","Sexta"]'::jsonb,
  jsonb_object_agg(e.nome_curto, '["OK","OK","OK","OK","OK"]'::jsonb),
  '{"arquivo":"Demonstração fictícia"}'::jsonb
from public.unidades u join public.equipe e on e.unidade_id = u.id
where u.slug = 'demonstracao' group by u.id
on conflict (unidade_id,data_inicio) do nothing;
