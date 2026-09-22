-- =====================================================================
-- REVEZO — schema inicial
--
-- Escopo: MULTI-UNIDADE. O caso-origem (unidade da Michele) é o primeiro
-- cliente, não o escopo. Toda regra específica de pessoa é DADO, nunca
-- coluna booleana com nome próprio no meio.
--
-- Esta migração é destrutiva por decisão explícita: dropa e recria tudo
-- em `public`. Rodar só enquanto não houver dado real a preservar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. LIMPEZA
-- ---------------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;

drop table if exists public.disponibilidade_mensal cascade;
drop table if exists public.escalas_semanais     cascade;
drop table if exists public.colocacoes_fixas     cascade;
drop table if exists public.duplas_proibidas     cascade;
drop table if exists public.proibicoes           cascade;
drop table if exists public.regras_config        cascade;
drop table if exists public.sitios               cascade;
drop table if exists public.equipe               cascade;
drop table if exists public.profiles             cascade;
drop table if exists public.unidades             cascade;

drop function if exists public.handle_new_user()  cascade;
drop function if exists public.is_admin()         cascade;
drop function if exists public.is_coordenador()   cascade;
drop function if exists public.minha_unidade()    cascade;
drop function if exists public.touch_updated_at() cascade;

-- ---------------------------------------------------------------------
-- 1. UNIDADES (tenants)
-- ---------------------------------------------------------------------
create table public.unidades (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  nome       text not null,
  -- rótulos dos dias úteis da grade, na ordem impressa
  dias       jsonb not null default '["Segunda","Terça","Quarta","Quinta","Sexta"]'::jsonb,
  ativa      boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. PERFIS, PAPÉIS E AUTENTICAÇÃO
-- ---------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users on delete cascade,
  unidade_id uuid references public.unidades(id) on delete set null,
  email      text not null,
  nome       text,
  avatar_url text,
  role       text not null default 'visualizador'
             check (role in ('admin','coordenador','visualizador')),
  ativo      boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on public.profiles (unidade_id);

-- `security definer` para não recorrer nas próprias policies de profiles.
create or replace function public.is_admin() returns boolean as $$
  select coalesce(
    (select role = 'admin' and ativo from public.profiles where id = auth.uid()),
    false);
$$ language sql stable security definer set search_path = public;

create or replace function public.is_coordenador() returns boolean as $$
  select coalesce(
    (select role in ('admin','coordenador') and ativo from public.profiles where id = auth.uid()),
    false);
$$ language sql stable security definer set search_path = public;

create or replace function public.minha_unidade() returns uuid as $$
  select unidade_id from public.profiles where id = auth.uid();
$$ language sql stable security definer set search_path = public;

create or replace function public.touch_updated_at() returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Primeiro usuário do sistema vira admin; os demais entram como
-- VISUALIZADOR e são promovidos por um admin. O padrão antigo
-- ('coordenador' para todos) dava poder de escrita a qualquer pessoa
-- que conseguisse logar com Google.
create or replace function public.handle_new_user() returns trigger as $$
declare
  total_users  integer;
  assigned_role text;
begin
  select count(*) into total_users from public.profiles;
  assigned_role := case when total_users = 0 then 'admin' else 'visualizador' end;

  insert into public.profiles (id, email, nome, avatar_url, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name',
             new.raw_user_meta_data->>'name',
             split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url',
    assigned_role)
  on conflict (id) do update set
    email      = excluded.email,
    nome       = coalesce(excluded.nome, public.profiles.nome),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url);

  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 3. DOMÍNIO DA ESCALA
-- ---------------------------------------------------------------------

-- Profissionais. `turno_base = 'noite'` é quem entra só depois das 16h:
-- o solver deriva daí a regra de alternância, sem lista de nomes.
create table public.equipe (
  id          uuid primary key default gen_random_uuid(),
  unidade_id  uuid not null references public.unidades(id) on delete cascade,
  nome        text not null,
  nome_curto  text not null,
  categoria   text not null check (categoria in ('enf','tec')),
  turno_base  text not null check (turno_base in ('manha','tarde','noite','ambos')),
  -- posto fixo: ocupa este sítio todos os dias e fica isento de "dias seguidos"
  fixo_sitio  text,
  -- não exigir passagem semanal por Ações
  isento_acoes boolean not null default false,
  -- penalidade no custo do solver: quanto maior, menos escolhido para sítio comum
  custo_extra  numeric not null default 0,
  ativo       boolean not null default true,
  ordem       integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (unidade_id, nome_curto)
);

create index on public.equipe (unidade_id);

-- Linhas da grade. `opcional` substitui a lista de exceções que estava
-- codificada no validador ("cobertura não vale para Ensino e Sala 5").
create table public.sitios (
  id                  uuid primary key default gen_random_uuid(),
  unidade_id          uuid not null references public.unidades(id) on delete cascade,
  ordem               integer not null,
  nome                text not null,
  -- alguns sítios mudam de nome à tarde mas são O MESMO sítio para as regras
  nome_tarde          text,
  categoria_permitida text not null check (categoria_permitida in ('enf','tec','ambos')),
  opcional            boolean not null default false,
  -- ordem de preferência para encaixar a segunda pessoa (sítios com mais
  -- atendimento primeiro); null = não entra nessa fila
  prioridade_dupla    integer,
  created_at          timestamptz not null default now(),
  unique (unidade_id, ordem)
);

create index on public.sitios (unidade_id);

-- Liga/desliga por regra. Esta tabela NÃO carrega nome próprio: quem é
-- proibido de quê vive em `proibicoes` / `duplas_proibidas`.
create table public.regras_config (
  id         uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades(id) on delete cascade,
  chave      text not null,
  nome       text not null,
  descricao  text,
  ativa      boolean not null default true,
  rigida     boolean not null default true,
  ordem      integer not null default 0,
  unique (unidade_id, chave)
);

create index on public.regras_config (unidade_id);

-- "Fulano nunca no sítio X."
create table public.proibicoes (
  id          uuid primary key default gen_random_uuid(),
  unidade_id  uuid not null references public.unidades(id) on delete cascade,
  pessoa_curto text not null,
  sitio_nome   text not null,
  motivo       text,
  unique (unidade_id, pessoa_curto, sitio_nome)
);

create index on public.proibicoes (unidade_id);

-- "Fulano e Beltrano não ficam juntos no mesmo sítio."
create table public.duplas_proibidas (
  id          uuid primary key default gen_random_uuid(),
  unidade_id  uuid not null references public.unidades(id) on delete cascade,
  pessoa_a    text not null,
  pessoa_b    text not null,
  motivo      text,
  check (pessoa_a <> pessoa_b),
  unique (unidade_id, pessoa_a, pessoa_b)
);

create index on public.duplas_proibidas (unidade_id);

-- Grupos e atividades recorrentes.
-- `tipo`: 'fixa_sitio'  = tem de estar NESTE sítio neste dia/turno
--         'fora_do'     = tem de estar escalada, mas NÃO neste sítio
create table public.colocacoes_fixas (
  id           uuid primary key default gen_random_uuid(),
  unidade_id   uuid not null references public.unidades(id) on delete cascade,
  pessoa_curto text not null,
  dia          integer not null check (dia between 0 and 6),
  turno        text not null check (turno in ('manha','tarde')),
  sitio_nome   text not null,
  tipo         text not null default 'fixa_sitio' check (tipo in ('fixa_sitio','fora_do')),
  descricao    text,
  -- Lição registrada no AGENTS.md: fixa que só fecha porque calha de cair no
  -- dia de plantão da pessoa quebra silenciosamente quando o plantão muda.
  -- Quem depende disso tem de declarar.
  depende_de_plantao boolean not null default false
);

create index on public.colocacoes_fixas (unidade_id);

-- Histórico de semanas. É o que faz a regra sexta->segunda existir de fato:
-- sem a semana anterior persistida, a regra é código morto.
create table public.escalas_semanais (
  id          uuid primary key default gen_random_uuid(),
  unidade_id  uuid not null references public.unidades(id) on delete cascade,
  titulo      text not null,
  data_inicio date not null,
  data_fim    date not null,
  dias        jsonb not null default '[]'::jsonb,
  grade       jsonb not null default '{}'::jsonb,
  rodape      jsonb not null default '[]'::jsonb,
  violacoes   jsonb not null default '[]'::jsonb,
  score       integer not null default 0,
  status      text not null default 'rascunho'
              check (status in ('rascunho','validada','publicada')),
  criado_por  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (unidade_id, data_inicio)
);

create index on public.escalas_semanais (unidade_id, data_inicio desc);

create trigger escalas_touch before update on public.escalas_semanais
  for each row execute function public.touch_updated_at();

-- Folgas, férias e plantões vindos da planilha do mês.
create table public.disponibilidade_mensal (
  id             uuid primary key default gen_random_uuid(),
  unidade_id     uuid not null references public.unidades(id) on delete cascade,
  mes            integer not null check (mes between 1 and 12),
  ano            integer not null,
  arquivo_nome   text,
  dados          jsonb not null default '{}'::jsonb,
  atualizado_por uuid references public.profiles(id) on delete set null,
  updated_at     timestamptz not null default now(),
  unique (unidade_id, mes, ano)
);

create index on public.disponibilidade_mensal (unidade_id);

create trigger disp_touch before update on public.disponibilidade_mensal
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 4. RLS — tudo fechado por unidade
-- ---------------------------------------------------------------------
alter table public.unidades               enable row level security;
alter table public.profiles               enable row level security;
alter table public.equipe                 enable row level security;
alter table public.sitios                 enable row level security;
alter table public.regras_config          enable row level security;
alter table public.proibicoes             enable row level security;
alter table public.duplas_proibidas       enable row level security;
alter table public.colocacoes_fixas       enable row level security;
alter table public.escalas_semanais       enable row level security;
alter table public.disponibilidade_mensal enable row level security;

-- unidades: vê a sua; admin vê e escreve todas
create policy unidades_select on public.unidades for select to authenticated
  using (id = public.minha_unidade() or public.is_admin());
create policy unidades_write on public.unidades for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- profiles: todos os autenticados leem (a grade mostra nomes)
create policy profiles_select on public.profiles for select to authenticated
  using (true);

-- o próprio perfil, sem poder se auto-promover nem se reativar
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role       is not distinct from (select p.role       from public.profiles p where p.id = auth.uid())
    and ativo      is not distinct from (select p.ativo      from public.profiles p where p.id = auth.uid())
    and unidade_id is not distinct from (select p.unidade_id from public.profiles p where p.id = auth.uid())
  );

-- papéis, unidade e desativação: só admin
create policy profiles_admin on public.profiles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Domínio: leitura para quem é da unidade, escrita para coordenador da unidade.
-- Admin atravessa tudo.
do $$
declare t text;
begin
  foreach t in array array[
    'equipe','sitios','regras_config','proibicoes','duplas_proibidas',
    'colocacoes_fixas','escalas_semanais','disponibilidade_mensal'
  ] loop
    execute format($f$
      create policy %1$s_select on public.%1$s for select to authenticated
        using (unidade_id = public.minha_unidade() or public.is_admin());
      create policy %1$s_write on public.%1$s for all to authenticated
        using  ((unidade_id = public.minha_unidade() and public.is_coordenador()) or public.is_admin())
        with check ((unidade_id = public.minha_unidade() and public.is_coordenador()) or public.is_admin());
    $f$, t);
  end loop;
end $$;

-- =====================================================================
-- 5. SEED — unidade do caso-origem
--
-- Nomes próprios aqui são DADO DE UM CLIENTE, não regra do produto.
-- Outra unidade carrega as suas próprias linhas e nada no código muda.
-- =====================================================================
insert into public.unidades (slug, nome) values ('caso-origem', 'Unidade piloto — enfermagem');

insert into public.sitios (unidade_id, ordem, nome, nome_tarde, categoria_permitida, opcional, prioridade_dupla)
select u.id, v.ordem, v.nome, v.nome_tarde, v.cat, v.opcional, v.prio
from public.unidades u, (values
  (1, 'Consultas - Sala 1',                                null,                 'enf',   false, null),
  (2, 'Consultas - Sala 5',                                null,                 'enf',   true,  null),
  (3, 'Supervisão',                                        null,                 'enf',   false, null),
  (4, 'Ensino',                                            null,                 'enf',   true,  null),
  (5, 'Procedim. de enfermagem',                           null,                 'tec',   false, 3),
  (6, 'Vacina',                                            null,                 'tec',   false, 2),
  (7, 'Acolhimento',                                       null,                 'tec',   false, 1),
  (8, 'Curativo',                                          'Curativo- CME 16h',  'tec',   false, 4),
  (9, 'Ações de vigilância/VD/PSE/Ensino/cursos/grupos',   null,                 'ambos', false, null)
) as v(ordem, nome, nome_tarde, cat, opcional, prio)
where u.slug = 'caso-origem';

insert into public.equipe (unidade_id, nome, nome_curto, categoria, turno_base, fixo_sitio, isento_acoes, custo_extra, ordem)
select u.id, v.nome, v.curto, v.cat, v.turno, v.fixo, v.isento, v.custo, v.ordem
from public.unidades u, (values
  ('May',                             'May',        'enf', 'manha', null,     false, 0,  1),
  ('Shana',                           'Shana',      'enf', 'manha', null,     false, 0,  2),
  ('Ana Cláudia',                     'Ana Claudia','enf', 'manha', null,     false, 0,  3),
  ('Sandra',                          'Sandra',     'enf', 'manha', null,     false, 0,  4),
  ('Michele Ferreira',                'Michele',    'enf', 'tarde', null,     false, 0,  5),
  ('Fernanda',                        'Fernanda',   'enf', 'tarde', null,     false, 0,  6),
  ('Carolina K',                      'Carolina K', 'enf', 'tarde', null,     false, 0,  7),
  ('Carolina Feijó Voigt',            'Carol V',    'enf', 'noite', null,     false, 0,  8),
  -- posto fixo no Ensino: isento de "dias seguidos" e de Ações
  ('Letícia',                         'Leticia',    'enf', 'ambos', 'Ensino', true,  0,  9),
  -- só entra como reforço: custo alto para não ser escolhido antes dos outros
  ('Allan',                           'Allan',      'enf', 'ambos', null,     true,  3, 10),
  ('Vanessa',                         'Vanessa',    'tec', 'manha', null,     false, 0, 11),
  ('Maria',                           'Maria',      'tec', 'manha', null,     false, 0, 12),
  ('Andressa',                        'Andressa',   'tec', 'manha', null,     false, 0, 13),
  ('Daniele de Souza Prado Dorneles', 'Dani P',     'tec', 'manha', null,     false, 0, 14),
  ('Luciana',                         'Luciana',    'tec', 'manha', null,     false, 0, 15),
  ('Fabiano',                         'Fabiano',    'tec', 'tarde', null,     false, 0, 16),
  ('Daniele Volkmer Jacobsen',        'Dani J',     'tec', 'tarde', null,     false, 0, 17),
  ('Nicole',                          'Nicole',     'tec', 'tarde', null,     false, 0, 18),
  ('Paula',                           'Paula',      'tec', 'tarde', null,     false, 0, 19),
  ('Regina',                          'Regina',     'tec', 'noite', null,     false, 0, 20),
  ('Jomalba',                         'Jomalba',    'tec', 'noite', null,     false, 0, 21)
) as v(nome, curto, cat, turno, fixo, isento, custo, ordem)
where u.slug = 'caso-origem';

-- As chaves batem 1:1 com `Regras` em src/lib/solver/types.ts.
-- Textos genéricos de propósito: o "quem" mora nas tabelas de dados.
insert into public.regras_config (unidade_id, chave, nome, descricao, ativa, rigida, ordem)
select u.id, v.chave, v.nome, v.descricao, true, v.rigida, v.ordem
from public.unidades u, (values
  ('disponibilidade', 'Disponibilidade do mês',  'Não escalar quem está de F, FC, FE ou AT no dia.',                            true,  1),
  ('turnoBase',       'Turno-base',              'Respeitar o turno-base; quem entra às 16h nunca é escalado de manhã.',        true,  2),
  ('categoria',       'Categoria profissional',  'Cada sítio aceita só a categoria declarada (enfermeiro, técnico ou ambos).',  true,  3),
  ('mariaVacina',     'Proibições por sítio',    'Respeitar a lista de proibições pessoa x sítio da unidade.',                  true,  4),
  ('plantaoMesmo',    'Plantão no mesmo sítio',  'Quem está de plantão não fica no mesmo sítio de manhã e de tarde.',           true,  5),
  ('diasSeguidos',    'Dias seguidos',           'Não repetir o mesmo sítio em dias consecutivos, exceto em posto fixo.',       true,  6),
  ('sextaSegunda',    'Sexta para segunda',      'Não repetir na segunda o sítio ocupado na sexta anterior.',                   true,  7),
  ('duplaProibida',   'Duplas proibidas',        'Respeitar a lista de pessoas que não ficam juntas no mesmo sítio.',           true,  8),
  ('fixas',           'Colocações fixas',        'Respeitar grupos e atividades recorrentes.',                                  true,  9),
  ('acoesSemana',     'Ações na semana',         'Cada profissional passa ao menos 1x por semana em Ações.',                    false, 10),
  ('cobertura',       'Cobertura dos sítios',    'Todo sítio não-opcional tem alguém em todos os dias.',                        false, 11),
  ('alternancia16h',  'Alternância das 16h',     'Quem entra às 16h divide sítio, alternando o sítio a cada dia.',              false, 12)
) as v(chave, nome, descricao, rigida, ordem)
where u.slug = 'caso-origem';

insert into public.proibicoes (unidade_id, pessoa_curto, sitio_nome, motivo)
select u.id, 'Maria', 'Vacina', 'Restrição da unidade'
from public.unidades u where u.slug = 'caso-origem';

insert into public.duplas_proibidas (unidade_id, pessoa_a, pessoa_b, motivo)
select u.id, 'Vanessa', 'Dani P', 'Restrição da unidade'
from public.unidades u where u.slug = 'caso-origem';

-- dia: 0 = segunda .. 4 = sexta
insert into public.colocacoes_fixas (unidade_id, pessoa_curto, dia, turno, sitio_nome, tipo, descricao, depende_de_plantao)
select u.id, v.pessoa, v.dia, v.turno, v.sitio, v.tipo, v.descricao, v.dep
from public.unidades u,
     (select 'Ações de vigilância/VD/PSE/Ensino/cursos/grupos' as acoes) a,
     (values
  ('Dani P',  1, 'manha', 'fixa_sitio', 'Ações terça manhã',            false),
  ('Dani P',  3, 'tarde', 'fixa_sitio', 'Ações quinta tarde',           false),
  ('Luciana', 3, 'manha', 'fixa_sitio', 'Grupo de caminhada',           false),
  ('Regina',  0, 'tarde', 'fixa_sitio', 'Grupo de caminhada',           false),
  ('Regina',  2, 'tarde', 'fixa_sitio', 'Grupo de caminhada',           false),
  ('Sandra',  4, 'manha', 'fixa_sitio', 'Tabagismo',                    false),
  ('Sandra',  3, 'tarde', 'fixa_sitio', 'Viva Leve',                    false),
  ('Vanessa', 2, 'tarde', 'fixa_sitio', 'Ações quarta tarde',           false),
  ('Fabiano', 2, 'manha', 'fixa_sitio', 'Ações quarta manhã',           false),
  ('Paula',   1, 'tarde', 'fixa_sitio', 'Ações terça tarde',            false),
  ('Dani J',  3, 'tarde', 'fixa_sitio', 'Ações quinta tarde',           false),
  -- estas duas só fecham porque caem no dia de plantão da pessoa
  ('Paula',   1, 'manha', 'fora_do',    'Escalada, mas fora de Ações',  true),
  ('Dani J',  3, 'manha', 'fora_do',    'Escalada, mas fora de Ações',  true)
) as v(pessoa, dia, turno, tipo, descricao, dep)
cross join lateral (select a.acoes as sitio) s
where u.slug = 'caso-origem';
