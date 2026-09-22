-- Unidade do caso-origem. Nomes próprios aqui são DADO DE UM CLIENTE,
-- não regra do produto: outra unidade carrega as suas linhas e nada no
-- código muda.
insert into public.unidades (slug, nome) values ('caso-origem', 'Unidade piloto — enfermagem');

insert into public.sitios (unidade_id, ordem, nome, nome_tarde, categoria_permitida, opcional, prioridade_dupla)
select u.id, v.ordem, v.nome, v.nome_tarde, v.cat, v.opcional, v.prio
from public.unidades u, (values
  (1, 'Consultas - Sala 1',                              null::text,          'enf',   false, null::int),
  (2, 'Consultas - Sala 5',                              null,                'enf',   true,  null),
  (3, 'Supervisão',                                      null,                'enf',   false, null),
  (4, 'Ensino',                                          null,                'enf',   true,  null),
  (5, 'Procedim. de enfermagem',                         null,                'tec',   false, 3),
  (6, 'Vacina',                                          null,                'tec',   false, 2),
  (7, 'Acolhimento',                                     null,                'tec',   false, 1),
  (8, 'Curativo',                                        'Curativo- CME 16h', 'tec',   false, 4),
  (9, 'Ações de vigilância/VD/PSE/Ensino/cursos/grupos', null,                'ambos', false, null)
) as v(ordem, nome, nome_tarde, cat, opcional, prio)
where u.slug = 'caso-origem';

insert into public.equipe (unidade_id, nome, nome_curto, categoria, turno_base, fixo_sitio, isento_acoes, custo_extra, ordem)
select u.id, v.nome, v.curto, v.cat, v.turno, v.fixo, v.isento, v.custo, v.ordem
from public.unidades u, (values
  ('May',                             'May',         'enf', 'manha', null::text, false, 0, 1),
  ('Shana',                           'Shana',       'enf', 'manha', null,       false, 0, 2),
  ('Ana Cláudia',                     'Ana Claudia', 'enf', 'manha', null,       false, 0, 3),
  ('Sandra',                          'Sandra',      'enf', 'manha', null,       false, 0, 4),
  ('Michele Ferreira',                'Michele',     'enf', 'tarde', null,       false, 0, 5),
  ('Fernanda',                        'Fernanda',    'enf', 'tarde', null,       false, 0, 6),
  ('Carolina K',                      'Carolina K',  'enf', 'tarde', null,       false, 0, 7),
  ('Carolina Feijó Voigt',            'Carol V',     'enf', 'noite', null,       false, 0, 8),
  ('Letícia',                         'Leticia',     'enf', 'ambos', 'Ensino',   true,  0, 9),
  ('Allan',                           'Allan',       'enf', 'ambos', null,       true,  3, 10),
  ('Vanessa',                         'Vanessa',     'tec', 'manha', null,       false, 0, 11),
  ('Maria',                           'Maria',       'tec', 'manha', null,       false, 0, 12),
  ('Andressa',                        'Andressa',    'tec', 'manha', null,       false, 0, 13),
  ('Daniele de Souza Prado Dorneles', 'Dani P',      'tec', 'manha', null,       false, 0, 14),
  ('Luciana',                         'Luciana',     'tec', 'manha', null,       false, 0, 15),
  ('Fabiano',                         'Fabiano',     'tec', 'tarde', null,       false, 0, 16),
  ('Daniele Volkmer Jacobsen',        'Dani J',      'tec', 'tarde', null,       false, 0, 17),
  ('Nicole',                          'Nicole',      'tec', 'tarde', null,       false, 0, 18),
  ('Paula',                           'Paula',       'tec', 'tarde', null,       false, 0, 19),
  ('Regina',                          'Regina',      'tec', 'noite', null,       false, 0, 20),
  ('Jomalba',                         'Jomalba',     'tec', 'noite', null,       false, 0, 21)
) as v(nome, curto, cat, turno, fixo, isento, custo, ordem)
where u.slug = 'caso-origem';

-- As chaves batem 1:1 com `Regras` em src/lib/solver/types.ts.
insert into public.regras_config (unidade_id, chave, nome, descricao, ativa, rigida, ordem)
select u.id, v.chave, v.nome, v.descricao, true, v.rigida, v.ordem
from public.unidades u, (values
  ('disponibilidade', 'Disponibilidade do mês', 'Não escalar quem está de F, FC, FE ou AT no dia.',                           true,  1),
  ('turnoBase',       'Turno-base',             'Respeitar o turno-base; quem entra às 16h nunca é escalado de manhã.',       true,  2),
  ('categoria',       'Categoria profissional', 'Cada sítio aceita só a categoria declarada (enfermeiro, técnico ou ambos).', true,  3),
  ('mariaVacina',     'Proibições por sítio',   'Respeitar a lista de proibições pessoa x sítio da unidade.',                 true,  4),
  ('plantaoMesmo',    'Plantão no mesmo sítio', 'Quem está de plantão não fica no mesmo sítio de manhã e de tarde.',          true,  5),
  ('diasSeguidos',    'Dias seguidos',          'Não repetir o mesmo sítio em dias consecutivos, exceto em posto fixo.',      true,  6),
  ('sextaSegunda',    'Sexta para segunda',     'Não repetir na segunda o sítio ocupado na sexta anterior.',                  true,  7),
  ('duplaProibida',   'Duplas proibidas',       'Respeitar a lista de pessoas que não ficam juntas no mesmo sítio.',          true,  8),
  ('fixas',           'Colocações fixas',       'Respeitar grupos e atividades recorrentes.',                                 true,  9),
  ('acoesSemana',     'Ações na semana',        'Cada profissional passa ao menos 1x por semana em Ações.',                   false, 10),
  ('cobertura',       'Cobertura dos sítios',   'Todo sítio não-opcional tem alguém em todos os dias.',                       false, 11),
  ('alternancia16h',  'Alternância das 16h',    'Quem entra às 16h divide sítio, alternando o sítio a cada dia.',             false, 12)
) as v(chave, nome, descricao, rigida, ordem)
where u.slug = 'caso-origem';

insert into public.proibicoes (unidade_id, pessoa_curto, sitio_nome, motivo)
select u.id, 'Maria', 'Vacina', 'Restrição da unidade'
from public.unidades u where u.slug = 'caso-origem';

insert into public.duplas_proibidas (unidade_id, pessoa_a, pessoa_b, motivo)
select u.id, 'Vanessa', 'Dani P', 'Restrição da unidade'
from public.unidades u where u.slug = 'caso-origem';

-- dia: 0 = segunda .. 4 = sexta. Todas as fixas abaixo são no sítio de Ações.
insert into public.colocacoes_fixas (unidade_id, pessoa_curto, dia, turno, sitio_nome, tipo, descricao, depende_de_plantao)
select u.id, v.pessoa, v.dia, v.turno,
       'Ações de vigilância/VD/PSE/Ensino/cursos/grupos',
       v.tipo, v.descricao, v.dep
from public.unidades u, (values
  ('Dani P',  1, 'manha', 'fixa_sitio', 'Ações terça manhã',           false),
  ('Dani P',  3, 'tarde', 'fixa_sitio', 'Ações quinta tarde',          false),
  ('Luciana', 3, 'manha', 'fixa_sitio', 'Grupo de caminhada',          false),
  ('Regina',  0, 'tarde', 'fixa_sitio', 'Grupo de caminhada',          false),
  ('Regina',  2, 'tarde', 'fixa_sitio', 'Grupo de caminhada',          false),
  ('Sandra',  4, 'manha', 'fixa_sitio', 'Tabagismo',                   false),
  ('Sandra',  3, 'tarde', 'fixa_sitio', 'Viva Leve',                   false),
  ('Vanessa', 2, 'tarde', 'fixa_sitio', 'Ações quarta tarde',          false),
  ('Fabiano', 2, 'manha', 'fixa_sitio', 'Ações quarta manhã',          false),
  ('Paula',   1, 'tarde', 'fixa_sitio', 'Ações terça tarde',           false),
  ('Dani J',  3, 'tarde', 'fixa_sitio', 'Ações quinta tarde',          false),
  -- estas duas só fecham porque caem no dia de plantão da pessoa
  ('Paula',   1, 'manha', 'fora_do',    'Escalada, mas fora de Ações', true),
  ('Dani J',  3, 'manha', 'fora_do',    'Escalada, mas fora de Ações', true)
) as v(pessoa, dia, turno, tipo, descricao, dep)
where u.slug = 'caso-origem';

-- Backfill: o trigger só dispara em INSERT em auth.users, então os usuários
-- que já existiam ficariam sem perfil e sem conseguir usar o app.
-- O mais antigo vira admin; os demais, visualizador.
insert into public.profiles (id, unidade_id, email, nome, avatar_url, role, created_at)
select
  au.id,
  (select id from public.unidades where slug = 'caso-origem'),
  au.email,
  coalesce(au.raw_user_meta_data->>'full_name',
           au.raw_user_meta_data->>'name',
           split_part(au.email, '@', 1)),
  au.raw_user_meta_data->>'avatar_url',
  case when au.created_at = (select min(created_at) from auth.users) then 'admin' else 'visualizador' end,
  au.created_at
from auth.users au
on conflict (id) do nothing;
