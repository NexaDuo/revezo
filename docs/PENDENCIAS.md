# Pendências

Até a primeira versão oficial o Revezo roda sem issues/board: este arquivo é o
registro do que falta. Item feito sai daqui no mesmo PR que o resolve.

## Produto
- Voltar/avançar do navegador dentro da SPA não protege contra descartar edições não salvas da grade; `beforeunload` cobre apenas recarregar/fechar.
- **Anonimizar os dados de exemplo** antes de abrir o repositório:
  `docs/referencia/`, `src/lib/solver/defaultConfig.ts` e os mocks com nome de
  pessoa real.

- **Grade salva ainda guarda sítio por nome.** O JSON de `escalas_semanais.grade`
  é indexado pelo nome do sítio; renomear um sítio deixa as versões antigas
  apontando para o nome velho (a migração de sítio por id não cobre a grade).

## Segurança (@sec, baixa)
- **Semana com versões e nenhuma ativa.** Pela API direta um coordenador pode
  marcar a ativa como substituída (ou apagá-la). A semana abre como "Nenhuma
  grade gerada"; deveria dizer "N versões, nenhuma ativa" com "Tornar ativa".
- **`criado_por` falsificável por escrita direta** em `escalas_semanais` (a RPC
  usa `auth.uid()`, o INSERT/UPDATE cru aceita qualquer uuid). Trigger
  `new.criado_por := coalesce(old.criado_por, auth.uid())` ou revogar a coluna.
- **Unidade pública expõe versões substituídas** (rascunhos) e `criado_por`.
  Hoje só a demonstração fictícia é pública; rever antes de publicar unidade real.
- Revogar `execute` de `public` em `is_admin()`, `is_coordenador()` e
  `minha_unidade()`; conceder só a `authenticated` (como já feito em
  `meu_papel()`/`meu_ativo()`).
- Convite recusado por `aceitar_convite()` fica pendente e reserva o e-mail;
  mostrar/marcar esses convites na tela de Convites.

## Qualidade (@rev, baixa)
- Teste para `localStorage` lançando exceção (modo demonstração).
- Teste de impressão em largura de celular.
