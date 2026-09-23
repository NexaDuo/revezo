# Pendências

Até a primeira versão oficial o Revezo roda sem issues/board: este arquivo é o
registro do que falta. Item feito sai daqui no mesmo PR que o resolve.

## Produto
- **Anonimizar os dados de exemplo** antes de abrir o repositório:
  `docs/referencia/`, `src/lib/solver/defaultConfig.ts` e os mocks com nome de
  pessoa real.

- **Grade salva ainda guarda sítio por nome.** O JSON de `escalas_semanais.grade`
  é indexado pelo nome do sítio; renomear um sítio deixa as versões antigas
  apontando para o nome velho (a migração de sítio por id não cobre a grade).

## Segurança (@sec, baixa)
- Revogar `execute` de `public` em `is_admin()`, `is_coordenador()` e
  `minha_unidade()`; conceder só a `authenticated` (como já feito em
  `meu_papel()`/`meu_ativo()`).
- Convite recusado por `aceitar_convite()` fica pendente e reserva o e-mail;
  mostrar/marcar esses convites na tela de Convites.

## Qualidade (@rev, baixa)
- Teste para `localStorage` lançando exceção (modo demonstração).
- Teste de impressão em largura de celular.
