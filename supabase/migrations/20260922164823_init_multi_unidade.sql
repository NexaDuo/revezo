-- =====================================================================
-- REVEZO — schema inicial, multi-unidade.
-- Destrutivo por decisão explícita: dropa e recria tudo em `public`.
-- =====================================================================

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

-- 1. UNIDADES (tenants) ------------------------------------------------
create table public.unidades (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  nome       text not null,
  dias       jsonb not null default '["Segunda","Terça","Quarta","Quinta","Sexta"]'::jsonb,
  ativa      boolean not null default true,
  created_at timestamptz not null default now()
);

-- 2. PERFIS E PAPÉIS ---------------------------------------------------
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

create or replace function public.is_admin() returns boolean as $$
  select coalesce((select role = 'admin' and ativo from public.profiles where id = auth.uid()), false);
$$ language sql stable security definer set search_path = public;

create or replace function public.is_coordenador() returns boolean as $$
  select coalesce((select role in ('admin','coordenador') and ativo from public.profiles where id = auth.uid()), false);
$$ language sql stable security definer set search_path = public;

create or replace function public.minha_unidade() returns uuid as $$
  select unidade_id from public.profiles where id = auth.uid();
$$ language sql stable security definer set search_path = public;

create or replace function public.touch_updated_at() returns trigger as $$
begin new.updated_at := now(); return new; end;
$$ language plpgsql;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Primeiro usuário vira admin; os demais entram como VISUALIZADOR e são
-- promovidos por um admin. O padrão anterior dava escrita a qualquer um
-- que conseguisse logar com Google.
create or replace function public.handle_new_user() returns trigger as $$
declare
  total_users integer;
  assigned_role text;
begin
  select count(*) into total_users from public.profiles;
  assigned_role := case when total_users = 0 then 'admin' else 'visualizador' end;

  insert into public.profiles (id, email, nome, avatar_url, role)
  values (new.id, new.email,
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

-- 3. DOMÍNIO -----------------------------------------------------------
create table public.equipe (
  id           uuid primary key default gen_random_uuid(),
  unidade_id   uuid not null references public.unidades(id) on delete cascade,
  nome         text not null,
  nome_curto   text not null,
  categoria    text not null check (categoria in ('enf','tec')),
  turno_base   text not null check (turno_base in ('manha','tarde','noite','ambos')),
  fixo_sitio   text,
  isento_acoes boolean not null default false,
  custo_extra  numeric not null default 0,
  ativo        boolean not null default true,
  ordem        integer not null default 0,
  created_at   timestamptz not null default now(),
  unique (unidade_id, nome_curto)
);
create index on public.equipe (unidade_id);

create table public.sitios (
  id                  uuid primary key default gen_random_uuid(),
  unidade_id          uuid not null references public.unidades(id) on delete cascade,
  ordem               integer not null,
  nome                text not null,
  nome_tarde          text,
  categoria_permitida text not null check (categoria_permitida in ('enf','tec','ambos')),
  opcional            boolean not null default false,
  prioridade_dupla    integer,
  created_at          timestamptz not null default now(),
  unique (unidade_id, ordem)
);
create index on public.sitios (unidade_id);

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

create table public.proibicoes (
  id           uuid primary key default gen_random_uuid(),
  unidade_id   uuid not null references public.unidades(id) on delete cascade,
  pessoa_curto text not null,
  sitio_nome   text not null,
  motivo       text,
  unique (unidade_id, pessoa_curto, sitio_nome)
);
create index on public.proibicoes (unidade_id);

create table public.duplas_proibidas (
  id         uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades(id) on delete cascade,
  pessoa_a   text not null,
  pessoa_b   text not null,
  motivo     text,
  check (pessoa_a <> pessoa_b),
  unique (unidade_id, pessoa_a, pessoa_b)
);
create index on public.duplas_proibidas (unidade_id);

create table public.colocacoes_fixas (
  id           uuid primary key default gen_random_uuid(),
  unidade_id   uuid not null references public.unidades(id) on delete cascade,
  pessoa_curto text not null,
  dia          integer not null check (dia between 0 and 6),
  turno        text not null check (turno in ('manha','tarde')),
  sitio_nome   text not null,
  tipo         text not null default 'fixa_sitio' check (tipo in ('fixa_sitio','fora_do')),
  descricao    text,
  depende_de_plantao boolean not null default false
);
create index on public.colocacoes_fixas (unidade_id);

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
  status      text not null default 'rascunho' check (status in ('rascunho','validada','publicada')),
  criado_por  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (unidade_id, data_inicio)
);
create index on public.escalas_semanais (unidade_id, data_inicio desc);
create trigger escalas_touch before update on public.escalas_semanais
  for each row execute function public.touch_updated_at();

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

-- 4. RLS ---------------------------------------------------------------
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

create policy unidades_select on public.unidades for select to authenticated
  using (id = public.minha_unidade() or public.is_admin());
create policy unidades_write on public.unidades for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy profiles_select on public.profiles for select to authenticated using (true);

create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role       is not distinct from (select p.role       from public.profiles p where p.id = auth.uid())
    and ativo      is not distinct from (select p.ativo      from public.profiles p where p.id = auth.uid())
    and unidade_id is not distinct from (select p.unidade_id from public.profiles p where p.id = auth.uid())
  );

create policy profiles_admin on public.profiles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

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
