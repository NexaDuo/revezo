# Pendências

Até a primeira versão oficial o Revezo roda sem issues/board: este arquivo é o
registro do que falta. Item feito sai daqui no mesmo PR que o resolve.

## Produto
- **Histórico do git com nomes reais.** O conteúdo atual está anonimizado, mas
  commits antigos (fixtures, seed, `excelParser.ts`, docs) têm nomes completos de
  funcionários. Antes de abrir o repositório: reescrever o histórico
  (`git filter-repo`) ou publicar um repositório novo a partir do `main`.
- **Seed da unidade piloto: repo ≠ produção (intencional).** O arquivo
  `20260922164919_seed_unidade_piloto.sql` tem nomes fictícios; produção mantém os
  reais. Nunca rodar `supabase migration repair --status reverted` nessa versão
  seguido de `db push`: os inserts não têm `on conflict` e duplicariam a equipe.
- **Unidade piloto: nome da Equipe = nome da planilha.** O importador deixou de
  ter apelidos no código; para a planilha do caso-origem voltar a achar os nomes
  curtos, a coluna Nome da Equipe precisa ter o nome como está na planilha.

- **Grades legadas sem fotografia de sítios.** A coluna `escalas_semanais.sitios`
  preserva ID, nomes, ordem e categorias; abrir não atualiza a grade, salvar
  reconcilia por ID. Nas grades antigas (`sitios = NULL`), só é possível inferir
  IDs por nome exato/canônico: rename anterior à fotografia é ambíguo e fica
  preservado como linha órfã, com aviso. Resolver essa identidade exige revisão
  humana; nomes reutilizados por IDs diferentes bloqueiam o salvamento.

- **Disponibilidade semanal ainda referencia pessoa por nome.** O JSON de
  `disponibilidade_semanal.dados` vem da planilha; renomear o nome curto exige
  revisar/reimportar a semana. A grade avisa nomes fora da equipe ativa e pessoas
  sem linha de disponibilidade. Migrar esse vínculo para id permanece pendente.

## Segurança (@sec, baixa)
- **Unidade pública expõe `criado_por`** (uuid de quem gravou a versão ativa).
  As versões substituídas já não aparecem para quem é de fora. Hoje só a
  demonstração fictícia é pública; rever antes de publicar unidade real.


## Qualidade (@rev, baixa)

- **Suíte Playwright com `.env` em paralelo é instável.** Com vários workers,
  1–3 testes logados diferentes falham por rodada (timeouts de navegação); com
  `--workers=1` (como no CI) passa inteira. Investigar a contenção do dev
  server antes de confiar na suíte paralela local.
