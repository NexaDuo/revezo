# Pendências

Até a primeira versão oficial o Revezo roda sem issues/board: este arquivo é o
registro do que falta. Item feito sai daqui no mesmo PR que o resolve.

## Produto
- Voltar/avançar do navegador dentro da SPA não protege contra descartar edições não salvas da grade; `beforeunload` cobre apenas recarregar/fechar.
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

- Workflow de migrações usa `supabase/setup-cli@v1` com `version: latest`, com
  acesso à senha do banco: fixar versão do CLI e a action por SHA, e
  `permissions: contents: read`.

## Qualidade (@rev, baixa)
- Teste para `localStorage` lançando exceção (modo demonstração).
- Teste de impressão em largura de celular.
