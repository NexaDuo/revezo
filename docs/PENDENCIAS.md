# Pendências

Até a primeira versão oficial o Revezo roda sem issues/board: este arquivo é o
registro do que falta. Item feito sai daqui no mesmo PR que o resolve.

## Produto
- **Histórico do git com nomes reais.** O conteúdo atual está anonimizado, mas
  commits antigos (fixtures, seed, `excelParser.ts`, docs) têm nomes completos de
  funcionários. Antes de abrir o repositório: reescrever o histórico
  (`git filter-repo`) ou publicar um repositório novo a partir do `main`.
- **Chave de regra `mariaVacina`** (em `regras_config` e no código) carrega um
  primeiro nome. Renomear para `proibicoesSitio` exige migração dos dados.
- **Seed da unidade piloto: repo ≠ produção (intencional).** O arquivo
  `20260922164919_seed_unidade_piloto.sql` tem nomes fictícios; produção mantém os
  reais. Nunca rodar `supabase migration repair --status reverted` nessa versão
  seguido de `db push`: os inserts não têm `on conflict` e duplicariam a equipe.
- **Unidade piloto: nome da Equipe = nome da planilha.** O importador deixou de
  ter apelidos no código; para a planilha do caso-origem voltar a achar os nomes
  curtos, a coluna Nome da Equipe precisa ter o nome como está na planilha.

- **Semana aberta pelo Histórico não revalida ao arrastar.** Ela entra com a
  grade e as violações salvas, mas sem `Config`: editar a célula não recalcula a
  conferência até gerar de novo.

## Segurança (@sec, baixa)
- Revogar `execute` de `public` em `is_admin()`, `is_coordenador()` e
  `minha_unidade()`; conceder só a `authenticated` (como já feito em
  `meu_papel()`/`meu_ativo()`).
- Convite recusado por `aceitar_convite()` fica pendente e reserva o e-mail;
  mostrar/marcar esses convites na tela de Convites.

- Workflow de migrações usa `supabase/setup-cli@v1` com `version: latest`, com
  acesso à senha do banco: fixar versão do CLI e a action por SHA, e
  `permissions: contents: read`.

## Qualidade (@rev, baixa)
- Teste para `localStorage` lançando exceção (modo demonstração).
- Teste de impressão em largura de celular.
