-- =====================================================================
-- REVEZO: Schema Inicial - Autenticação, Perfis, Papéis e Domínio
-- =====================================================================

-- 1. TABELA DE PERFIS DE USUÁRIO (auth & roles)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  nome text,
  avatar_url text,
  role text not null default 'coordenador' check (role in ('admin', 'coordenador', 'visualizador')),
  ativo boolean not null default true,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

-- Habilitar RLS
alter table public.profiles enable row level security;

-- Funções auxiliares de permissão
create or replace function public.is_admin()
returns boolean as $$
  select coalesce(
    (select role = 'admin' and ativo = true from public.profiles where id = auth.uid()),
    false
  );
$$ language sql stable security definer;

create or replace function public.is_coordenador()
returns boolean as $$
  select coalesce(
    (select role in ('admin', 'coordenador') and ativo = true from public.profiles where id = auth.uid()),
    false
  );
$$ language sql stable security definer;

-- Políticas de acesso para profiles
create policy "Perfis visíveis por qualquer usuário autenticado"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Usuário pode atualizar seu próprio perfil básico"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid() 
    and role = (select role from public.profiles where id = auth.uid()) -- impede auto-promoção
    and ativo = (select ativo from public.profiles where id = auth.uid()) -- impede reativação
  );

create policy "Apenas admin pode alterar papéis ou desativar usuários"
  on public.profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Gatilho para auto-criação de perfil no primeiro login com Google OAuth
create or replace function public.handle_new_user()
returns trigger as $$
declare
  total_users integer;
  assigned_role text;
begin
  select count(*) into total_users from public.profiles;
  
  -- Primeiro usuário vira admin automaticamente; os próximos são coordenadores
  if total_users = 0 then
    assigned_role := 'admin';
  else
    assigned_role := 'coordenador';
  end if;

  insert into public.profiles (id, email, nome, avatar_url, role)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data->>'avatar_url',
    assigned_role
  )
  on conflict (id) do update set
    email = excluded.email,
    nome = coalesce(excluded.nome, public.profiles.nome),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
    updated_at = now();

  return new;
end;
$$ language plpgsql security definer;

-- Conectar gatilho ao auth.users
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- 2. DOMÍNIO DA ESCALA: EQUIPE, SÍTIOS, REGRAS E ESCALAS
-- =====================================================================

-- Tabela de Equipe (Profissionais)
create table if not exists public.equipe (
  id uuid default gen_random_uuid() primary key,
  nome text not null,
  nome_curto text not null,
  categoria text not null check (categoria in ('enf', 'tec')),
  turno_base text not null check (turno_base in ('manha', 'tarde', 'noite', 'ambos')),
  fixo_sitio text,
  ativo boolean not null default true,
  ordem integer default 0,
  created_at timestamptz default timezone('utc'::text, now()) not null
);

alter table public.equipe enable row level security;
create policy "Equipe visível por autenticados" on public.equipe for select to authenticated using (true);
create policy "Equipe modificável por coordenador ou admin" on public.equipe for all to authenticated using (public.is_coordenador());

-- Tabela de Sítios (Linhas da grade)
create table if not exists public.sitios (
  id uuid default gen_random_uuid() primary key,
  ordem integer not null,
  nome text not null,
  nome_tarde text,
  categoria_permitida text not null check (categoria_permitida in ('enf', 'tec', 'ambos')),
  created_at timestamptz default timezone('utc'::text, now()) not null
);

alter table public.sitios enable row level security;
create policy "Sítios visíveis por autenticados" on public.sitios for select to authenticated using (true);
create policy "Sítios modificáveis por coordenador ou admin" on public.sitios for all to authenticated using (public.is_coordenador());

-- Tabela de Configuração de Regras
create table if not exists public.regras_config (
  id uuid default gen_random_uuid() primary key,
  chave text not null unique,
  nome text not null,
  descricao text,
  ativa boolean not null default true,
  rigida boolean not null default true,
  ordem integer default 0
);

alter table public.regras_config enable row level security;
create policy "Regras visíveis por autenticados" on public.regras_config for select to authenticated using (true);
create policy "Regras modificáveis por coordenador ou admin" on public.regras_config for all to authenticated using (public.is_coordenador());

-- Tabela de Colocações Fixas (Atividades, grupos, etc.)
create table if not exists public.colocacoes_fixas (
  id uuid default gen_random_uuid() primary key,
  pessoa_nome text not null,
  dia integer not null check (dia between 0 and 4), -- 0: Seg .. 4: Sex
  turno text not null check (turno in ('manha', 'tarde')),
  sitio_nome text,
  tipo text not null default 'fixa_acoes' check (tipo in ('fixa_acoes', 'fora_acoes', 'especifica')),
  descricao text
);

alter table public.colocacoes_fixas enable row level security;
create policy "Fixas visíveis por autenticados" on public.colocacoes_fixas for select to authenticated using (true);
create policy "Fixas modificáveis por coordenador ou admin" on public.colocacoes_fixas for all to authenticated using (public.is_coordenador());

-- Tabela de Escalas Semanais (Histórico & Persistência)
create table if not exists public.escalas_semanais (
  id uuid default gen_random_uuid() primary key,
  titulo text not null,
  data_inicio date not null,
  data_fim date not null,
  dias jsonb not null default '[]'::jsonb,
  grade jsonb not null default '{}'::jsonb,
  rodape jsonb not null default '[]'::jsonb,
  status text not null default 'rascunho' check (status in ('rascunho', 'validada', 'publicada')),
  criado_por uuid references public.profiles(id),
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

alter table public.escalas_semanais enable row level security;
create policy "Escalas visíveis por autenticados" on public.escalas_semanais for select to authenticated using (true);
create policy "Escalas gerenciadas por coordenador ou admin" on public.escalas_semanais for all to authenticated using (public.is_coordenador());

-- Tabela de Disponibilidade Mensal Importada
create table if not exists public.disponibilidade_mensal (
  id uuid default gen_random_uuid() primary key,
  mes integer not null,
  ano integer not null,
  arquivo_nome text,
  dados jsonb not null default '{}'::jsonb,
  atualizado_por uuid references public.profiles(id),
  updated_at timestamptz default timezone('utc'::text, now()) not null,
  unique(mes, ano)
);

alter table public.disponibilidade_mensal enable row level security;
create policy "Disponibilidade visível por autenticados" on public.disponibilidade_mensal for select to authenticated using (true);
create policy "Disponibilidade gerenciada por coordenador ou admin" on public.disponibilidade_mensal for all to authenticated using (public.is_coordenador());

-- =====================================================================
-- 3. SEEDS INICIAIS (Equipe oficial, sítios e regras da unidade)
-- =====================================================================

insert into public.sitios (ordem, nome, nome_tarde, categoria_permitida) values
  (1, 'Consultas - Sala 1', null, 'enf'),
  (2, 'Consultas - Sala 5', null, 'enf'),
  (3, 'Supervisão', null, 'enf'),
  (4, 'Ensino', null, 'enf'),
  (5, 'Procedim. de enfermagem', null, 'tec'),
  (6, 'Vacina', null, 'tec'),
  (7, 'Acolhimento', null, 'tec'),
  (8, 'Curativo', 'Curativo- CME 16h', 'tec'),
  (9, 'Ações de vigilância/VD/PSE/Ensino/cursos/grupos', null, 'ambos')
on conflict do nothing;

insert into public.equipe (nome, nome_curto, categoria, turno_base, fixo_sitio, ordem) values
  ('May', 'May', 'enf', 'manha', null, 1),
  ('Shana', 'Shana', 'enf', 'manha', null, 2),
  ('Ana Cláudia', 'Ana Claudia', 'enf', 'manha', null, 3),
  ('Sandra', 'Sandra', 'enf', 'manha', null, 4),
  ('Michele Ferreira', 'Michele', 'enf', 'tarde', null, 5),
  ('Fernanda', 'Fernanda', 'enf', 'tarde', null, 6),
  ('Carolina K', 'Carolina K', 'enf', 'tarde', null, 7),
  ('Carolina Feijó Voigt', 'Carol V', 'enf', 'noite', null, 8),
  ('Letícia', 'Leticia', 'enf', 'ambos', 'Ensino', 9),
  ('Allan', 'Allan', 'enf', 'ambos', null, 10),
  ('Vanessa', 'Vanessa', 'tec', 'manha', null, 11),
  ('Maria', 'Maria', 'tec', 'manha', null, 12),
  ('Andressa', 'Andressa', 'tec', 'manha', null, 13),
  ('Daniele de Souza Prado Dorneles', 'Dani P', 'tec', 'manha', null, 14),
  ('Luciana', 'Luciana', 'tec', 'manha', null, 15),
  ('Fabiano', 'Fabiano', 'tec', 'tarde', null, 16),
  ('Daniele Volkmer Jacobsen', 'Dani J', 'tec', 'tarde', null, 17),
  ('Nicole', 'Nicole', 'tec', 'tarde', null, 18),
  ('Paula', 'Paula', 'tec', 'tarde', null, 19),
  ('Regina', 'Regina', 'tec', 'noite', null, 20),
  ('Jomalba', 'Jomalba', 'tec', 'noite', null, 21)
on conflict do nothing;

insert into public.regras_config (chave, nome, descricao, ativa, rigida, ordem) values
  ('disponibilidade', 'Disponibilidade Mensal', 'Não escalar quem está de F, FC, FE ou AT no dia.', true, true, 1),
  ('turnoBase', 'Turno Base e 16h', 'Respeitar turno-base; profissionais das 16h nunca entram de manhã.', true, true, 2),
  ('categoria', 'Categoria Profissional', 'Salas 1/5, Supervisão e Ensino só enfermeiros; Procedimento até Curativo só técnicos.', true, true, 3),
  ('mariaVacina', 'Maria fora da Vacina', 'Maria nunca pode ser alocada no sítio Vacina.', true, true, 4),
  ('plantaoMesmo', 'Plantão no mesmo sítio', 'Quem está de plantão não pode ficar no mesmo sítio de manhã e de tarde.', true, true, 5),
  ('diasSeguidos', 'Dias Seguidos', 'Não repetir o mesmo sítio em dias consecutivos (inclusive Ações).', true, true, 6),
  ('sextaSegunda', 'Sexta para Segunda', 'Não repetir na segunda-feira o mesmo sítio ocupado na sexta-feira anterior.', true, true, 7),
  ('duplaProibida', 'Dupla Vanessa e Dani P', 'Vanessa e Dani P não podem ficar juntas no mesmo sítio.', true, true, 8),
  ('fixas', 'Colocações Fixas', 'Respeitar grupos fixos (tabagismo, caminhada, viva leve, etc.).', true, true, 9),
  ('acoesSemana', 'Ações na Semana', 'Cada profissional deve passar ao menos 1x na semana em Ações (preferir dia de plantão).', true, false, 10),
  ('cobertura', 'Cobertura de Sítios', 'Todo sítio deve ter profissional alocado.', true, false, 11),
  ('alternancia16h', 'Alternância 16h', 'Regina e Jomalba alternam o sítio de cobertura após as 16h.', true, false, 12)
on conflict (chave) do nothing;

insert into public.colocacoes_fixas (pessoa_nome, dia, turno, sitio_nome, tipo, descricao) values
  ('Dani P', 1, 'manha', null, 'fixa_acoes', 'Ações terça manhã'),
  ('Dani P', 3, 'tarde', null, 'fixa_acoes', 'Ações quinta tarde'),
  ('Luciana', 3, 'manha', null, 'fixa_acoes', 'Caminhada quinta manhã'),
  ('Regina', 0, 'tarde', null, 'fixa_acoes', 'Caminhada segunda tarde'),
  ('Regina', 2, 'tarde', null, 'fixa_acoes', 'Caminhada quarta tarde'),
  ('Sandra', 4, 'manha', null, 'fixa_acoes', 'Tabagismo sexta manhã'),
  ('Sandra', 3, 'tarde', null, 'fixa_acoes', 'Viva Leve quinta tarde'),
  ('Vanessa', 2, 'tarde', null, 'fixa_acoes', 'Ações quarta tarde'),
  ('Fabiano', 2, 'manha', null, 'fixa_acoes', 'Ações quarta manhã'),
  ('Paula', 1, 'tarde', null, 'fixa_acoes', 'Ações terça tarde'),
  ('Dani J', 3, 'tarde', null, 'fixa_acoes', 'Ações quinta tarde'),
  ('Paula', 1, 'manha', null, 'fora_acoes', 'Paula terça manhã fora de Ações'),
  ('Dani J', 3, 'manha', null, 'fora_acoes', 'Dani J quinta manhã fora de Ações')
on conflict do nothing;
