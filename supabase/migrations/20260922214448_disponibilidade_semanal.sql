-- A importação do .xlsx produz DISPONIBILIDADE de uma semana (quem está de
-- P/F/FC/FE/AT em cada dia), não a grade. Até aqui isso vivia só no estado do
-- React e sumia ao recarregar.
--
-- `disponibilidade_mensal` existia mas nunca foi escrita (0 linhas) e tinha a
-- granularidade errada — por mês, enquanto a importação é por semana.
drop table if exists public.disponibilidade_mensal cascade;

create table public.disponibilidade_semanal (
  id          uuid primary key default gen_random_uuid(),
  unidade_id  uuid not null references public.unidades(id) on delete cascade,
  -- segunda-feira da semana; é a chave natural
  data_inicio date not null,
  data_fim    date not null,
  -- rótulos das colunas, na ordem: ["Segunda 03", "Terça 04", ...]
  dias        jsonb not null default '[]'::jsonb,
  -- { "nome_curto": ["OK","P","F","OK","FC"], ... } — uma entrada por dia
  dados       jsonb not null default '{}'::jsonb,
  -- de onde veio: arquivo, aba e rótulo da semana escolhida. Sem isto ninguém
  -- consegue auditar de qual planilha saiu um plantão errado.
  origem      jsonb not null default '{}'::jsonb,
  atualizado_por uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- reimportar a mesma semana SOBRESCREVE, não duplica
  unique (unidade_id, data_inicio)
);

create index on public.disponibilidade_semanal (unidade_id, data_inicio desc);

create trigger disponibilidade_semanal_touch before update on public.disponibilidade_semanal
  for each row execute function public.touch_updated_at();

alter table public.disponibilidade_semanal enable row level security;

create policy disponibilidade_semanal_select on public.disponibilidade_semanal
  for select to authenticated
  using (unidade_id = public.minha_unidade() or public.is_admin());

create policy disponibilidade_semanal_write on public.disponibilidade_semanal
  for all to authenticated
  using  ((unidade_id = public.minha_unidade() and public.is_coordenador()) or public.is_admin())
  with check ((unidade_id = public.minha_unidade() and public.is_coordenador()) or public.is_admin());
