# Pendências de layout (issue #19, Fases 3–4)

Anotado em 22/09/2026, durante o teste ao vivo do PR #21 (sidebar).

- **Lista de semanas na tela de Disponibilidade não atualiza após importar a
  planilha.** Como a semana vai virar seletor global no header (Fase 3), talvez
  não precise corrigir a tela atual — conferir depois que o seletor existir.
- **Semana atual e slug do hospital em todas as URLs.** Ex.:
  `/revezo/<slug-hospital>/<semana>/regras`. O contexto passa a vir da URL
  (compartilhável, sobrevive a reload) em vez de só do estado do WorkContext.
  Implica: `unidades` precisa de coluna `slug` (migração via
  `supabase/migrations/`) e o roteamento precisa respeitar o `basename` do
  GitHub Pages.
- **Seletor global à direita do ícone Revezo**, alinhado verticalmente com ele,
  no header.
- **Ícone e bloco de login/infos pessoais alinhados à direita** do header.

Continua pendente da Fase 3/4 original: remover o bloco fixo da semana, levar o
indicador de violações e a barra Importar/Gerar/Imprimir para a rota `/`, e o
reset de `unidadeId` no WorkContext quando o perfil recarrega (low do @sec no
PR #20).
