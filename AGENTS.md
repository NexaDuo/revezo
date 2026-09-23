# AGENTS.md

Autoridade do projeto Revezo. `docs/PRODUTO.md` e `docs/REGRAS.md` são o registro
histórico do caso-origem — valiosos pelas lições, **desatualizados quanto
ao escopo**. Em caso de conflito, este arquivo vence.

## Architecture

**O produto é um editor com gerador dentro, não um gerador.** A resposta certa não é
única — existem dezenas de escalas válidas. O valor está em achar uma válida em
segundos e deixar a coordenadora ajustar. "Gerar automático" é o botão; arrastar é o
produto.

Pipeline, nesta ordem, sem exceção:

```
LER            →  ALOCAR                →  CONFERIR      →  AJUSTAR      →  IMPRIMIR
importador        solver determinístico    validador        drag & drop     PDF (@media
.xlsx             (guloso + reinícios)     (a cada edição)  (o humano)      print, fixo)
```

**Nenhum LLM no caminho crítico da alocação.** Isso é resultado de teste, não estética:
três tentativas (Gem, Opal, Codex CLI) pediram ao modelo para ler os documentos *e*
resolver as restrições *e* desenhar o Word. A leitura errava dia de plantão/folga e a
resolução violava regras em silêncio. Se uma mudança colocar um modelo no caminho da
alocação, a mudança está errada. O LLM é legítimo **em volta**: explicar um conflito,
sugerir substituição, redigir o rodapé.

**O validador é a peça central, não o solver.** Uma única função (`src/lib/solver/validator.ts`)
pinta a célula, monta o relatório de conferência e **pontua** a tentativa do solver
(rígida = 100, alerta = 1). Três comportamentos, uma implementação — duplicar essa
lógica é o jeito mais rápido de criar bug invisível.

**Escopo atual: multi-hospital.** O caso-origem é o primeiro cliente, não o escopo.
Toda regra específica de pessoa ou unidade é **dado**, nunca código.

## Constraints

- **Regra de negócio não se escreve em `if`.** Nome próprio no solver é bug. Em 22/09/2026
  `solver.ts` e `validator.ts` foram limpos: proibição pessoa×sítio, dupla proibida, posto
  fixo, isenção de Ações e pessoal das 16h viraram campos de `Config`/`Pessoa`
  (`proibicoes`, `duplasProibidas`, `fixo`, `isentoAcoes`, `custoExtra`, `t: "noite"`).
  **Manter assim:** nome próprio só pode aparecer em `defaultConfig.ts` (dado semente do
  caso-origem) — em `solver.ts`, `validator.ts` e `utils.ts`, nunca:

  ```bash
  grep -nE 'Marta|Valéria|Bia |Livia|Artur|Rita|Joana' \
    src/lib/solver/solver.ts src/lib/solver/validator.ts src/lib/solver/utils.ts
  ```

  tem que voltar vazio. Com Supabase, esses campos já vêm das tabelas da unidade
  (`src/lib/loadConfig.ts`); `defaultConfig.ts` só vale no modo demonstração. O que
  falta está em `docs/PENDENCIAS.md`.
- **Falhar alto, sempre.** Violação silenciosa é o pior modo de falha do domínio: a
  escala vai impressa para a parede. Todo componente novo mostra o que não conseguiu
  resolver, na tela. Nada de defaults que escondem incerteza.
- **A saída é PDF, via impressão do navegador.** Decidido em 22/09/2026: o `.docx` saiu
  do produto (era a saída do POC; a dependência `docx` foi removida). O layout impresso
  continua não-negociável — a escala vai colada na parede: A4 paisagem, tabela única com
  bordas cinza, margens estreitas, sem a interface em volta. Isso mora no bloco
  `@media print` de `src/index.css`, que é **saída de produto, não estilo acessório**.
  Mensagens de violação não vão para o papel (`data-print-hide`).
- **Mostrar o motivo da recusa vale mais que a sugestão certa.** A célula precisa listar
  quem **não** pode entrar e **por quê** ("de FC", "já está em Vacina", "entra só depois
  das 16h"). É isso que transforma o produto em ferramenta de raciocínio, não caixa-preta.
- **Ligar/desligar regra é ferramenta de descoberta.** O painel de Regras existe para
  responder "essa regra é inegociável mesmo?". Ele precisa estar ligado ao solver —
  desligado, é enfeite.
- **Regra escrita ≠ regra real.** A escala pronta do cliente é fonte melhor que o
  documento de orientações dele. Derivar o modelo de dados da saída real.
- **Dado real de funcionário não entra no repositório.** `.gitignore` já barra
  `*.xlsx`/`*.pdf`/`*.docx`. Fixtures, docs, seed e `defaultConfig.ts` usam nomes
  fictícios desde 23/09/2026 — o **histórico do git** ainda tem os reais, então
  abrir o repo exige reescrever o histórico ou publicar um repo novo. Apelido de
  pessoa (nome da planilha → nome curto) é dado da Equipe (coluna `nome`), nunca
  tabela no código.
- **Sem segredo no código.** Supabase só por `VITE_*` em `.env`. A pasta de origem no
  OneDrive contém um `client_secret*.json` real — nunca copiar para cá.

## Release phases

`main` **é produção**. Push em `main` dispara `.github/workflows/deploy.yml`, que builda
e publica `dist/` no GitHub Pages em https://nexaduo.com/revezo/. **Não existe staging.**

Definição de pronto:
1. `npm run build` passa (o `tsc -b` é o type-check real).
2. `npx playwright test` verde **com e sem `.env`**. O CI roda sem credenciais, o
   que muda o comportamento do app: `isSupabaseConfigured` fica falso, as consultas
   voltam vazias na hora e o modo demonstração entra como coordenador, fazendo
   aparecer botões que não existem quando você está deslogado. Teste que passa só
   de um lado quebra no outro — já aconteceu duas vezes:
   ```bash
   npx playwright test && mv .env .env.bak && npx playwright test; mv .env.bak .env
   ```
3. Migração de schema vai por `supabase/migrations/` (`supabase-migrations.yml`), nunca
   por alteração manual no painel.
4. Smoke na URL pública após o deploy.

## Lessons

- **Leitura de documento é engenharia determinística, não prompt.** Toda vez que um
  modelo leu a planilha/PDF "por visão", errou coluna. Parser por coordenadas/XML acertou.
  O gargalo nunca foi a geração — foi a leitura.
- **A regra "sexta ≠ segunda" exige estado.** Precisa da escala da semana *anterior* como
  entrada, o que obriga o produto a ter histórico. Regra aparentemente inócua que muda a
  arquitetura. `config.sextaAnterior` vem da escala salva da semana anterior
  (`src/lib/sextaAnterior.ts`); sem ela, a geração avisa na tela que a regra não foi
  aplicada.
- **Posto fixo precisa de isenção explícita.** Alguém fixo num sítio todos os dias viola
  "não repetir sítio em dias seguidos". Sem a isenção, o solver nunca fecha.
- **Guloso + ~350 reinícios ganha de backtracking** nesta escala de problema (9 sítios ×
  5 dias × 2 turnos): roda em menos de 1s e cabe na cabeça. Otimalidade não é requisito;
  validade é.
- **Algumas restrições só fecham por coincidência.** Colocações fixas que dependem do dia
  de plantão da pessoa quebram quando o plantão muda de dia — e ninguém entende por quê.
  Fixas precisam declarar de que dependem.
- **A célula não é uma lista de nomes.** Na escala real ela é texto com horário, motivo e
  atividade (`Bia P 10h`, `Artur VD com Rosa`, `Curso Manejo: Pâmela P`), às vezes com
  4 pessoas, às vezes vazia. Nenhuma linha do documento de regras dizia isso.
- **"Sem instalação" era requisito funcional no caso-origem**, não conveniência:
  computador de hospital, sem permissão de admin, sem plano pago. A migração de HTML
  único para app web com login **gastou essa vantagem** — ela só se paga se o que veio
  em troca (multiusuário, histórico, multi-unidade) for real e usado.
- **Tirar nome próprio do código é barato e paga na hora.** A migração das regras
  específicas (proibição pessoa×sítio, dupla proibida, posto fixo, isenção de Ações,
  pessoal das 16h) de `if` para dados custou uma tarde e a escala do caso-origem passou
  a fechar com score 0. O que parecia "regra de negócio complexa" era tabela.
- **Migração aplicada pelo MCP ganha a versão que o servidor decidir.** O
  `apply_migration` carimba o próprio timestamp; nomear o arquivo local com um
  timestamp chutado faz o `supabase db push` recusar por divergência de histórico.
  Aplicou pelo MCP? Rode `list_migrations` e nomeie o arquivo com a versão que
  voltou de lá.
- **Em teste de RLS, ausência de erro não prova bloqueio.** `INSERT` barrado
  devolve erro, mas `UPDATE` e `DELETE` são *filtrados* pelo `USING` da policy: o
  PostgREST responde sucesso com zero linhas afetadas. Medir só `error` dá falso
  negativo de segurança — conte as linhas afetadas com `.select()`.
- **Reescrita porta o motor, esquece o produto.** A migração POC→React trouxe solver e
  validador íntegros e deixou para trás justamente o que fazia o POC ser usado: painel de
  candidatos com motivo, quem está livre, regras ligadas ao solver, salvar/abrir semana,
  sexta anterior, rodapé e o layout impresso. Motor não é produto.
