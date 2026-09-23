# Pendências

Até a primeira versão oficial o Revezo roda sem issues/board: este arquivo é o
registro do que falta. Item feito sai daqui no mesmo PR que o resolve.

## Produto
- **Padrão único de tabela.** Toda lista de registros (Equipe, Sítios, Regras,
  Histórico, Usuários, Convites, Unidades) com carregamento paginado de 10
  registros, edição da linha em modal e cache dos dados na navegação entre
  telas. Em andamento (`feat/tabelas-padrao`).
- **Telas para proibições, duplas proibidas e colocações fixas.** O solver já lê
  essas tabelas por unidade (`src/lib/loadConfig.ts`), mas não há tela para
  cadastrá-las: hoje só entram por SQL. Fazer depois do padrão de tabela, já nele.
- **Anonimizar os dados de exemplo** antes de abrir o repositório:
  `docs/referencia/`, `src/lib/solver/defaultConfig.ts` e os mocks com nome de
  pessoa real.

## Segurança (@sec, baixa)
- Revogar `execute` de `public` em `is_admin()`, `is_coordenador()` e
  `minha_unidade()`; conceder só a `authenticated` (como já feito em
  `meu_papel()`/`meu_ativo()`).
- Convite recusado por `aceitar_convite()` fica pendente e reserva o e-mail;
  mostrar/marcar esses convites na tela de Convites.

## Qualidade (@rev, baixa)
- Teste para `localStorage` lançando exceção (modo demonstração).
- Teste de impressão em largura de celular.
