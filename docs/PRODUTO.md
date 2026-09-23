# PRODUTO.md — Escala de Sítio: teses testadas, aprendizados e roadmap

Registro de decisão do projeto. Serve para **não refazer caminho já testado**.
Contexto técnico e regras de negócio: `CLAUDE.md`.

> **NOTA DE ESCOPO (22/09/2026):** o produto deixou de ser single-tenant. O objetivo
> agora é gerar escalas para hospitais, com o caso-origem como primeiro cliente.
> As lições de engenharia abaixo seguem válidas; onde o texto disser "não generalizar",
> leia como o que era verdade antes do pivô. A autoridade é o `AGENTS.md` na raiz.

Escopo original: single-tenant, caso-origem. O "produto" aqui significa *isso virar rotina
semanal dela, sem a gente no meio* — não virar SaaS multi-unidade.

Última atualização: setembro/2026.

---

## 1. Por que isso é um produto e não um script

O que a coordenadora faz toda semana é um problema de **satisfação de restrições com
revisão humana obrigatória**. Duas consequências que mudam tudo:

1. **A resposta certa não é única.** Existem dezenas de escalas válidas. O valor não
   está em "achar a escala", está em achar uma válida rápido e deixar ela ajustar.
2. **Ela é a autoridade final.** Tem regras que ninguém escreveu (quem se dá bem com
   quem, quem está aprendendo um sítio). Qualquer produto que tente decidir sozinho
   perde a confiança dela na primeira semana.

Por isso o formato final não é "gerador", é **editor com gerador dentro**.
"Gerar automático" é o botão; arrastar é o produto.

---

## 2. As quatro teses testadas

### Tese 1 — GPT/Gem customizado: "o modelo faz tudo"

**Pacote:** `gem/` (instruções autossuficientes + conhecimento de regras + exemplo de layout).
Escolhido porque Gems são **gratuitas** com conta Google — a coordenadora usa a conta dela,
sem plano pago, e o compartilhamento funciona como Google Drive (link).

**Fluxo:** ela anexa a mensal + a escala das enfermeiras no chat, pede "gere a escala da
semana 03 a 07/08", confere a tabela, pede o .docx, baixa.

**Por que não fechou:**
- **Leitura errada.** O modelo lendo o PDF da mensal "por visão" erra o dia exato de
  plantão e folga. Erro de uma coluna = pessoa escalada no dia de folga.
- **Violação silenciosa.** Quando não conseguia satisfazer as restrições, entregava uma
  escala plausível com regra quebrada, sem avisar. Falha invisível.
- **Layout não fiel.** A Gemini monta o .docx do jeito dela — bordas, cores e larguras
  não batem com o modelo impresso.

**O que sobrou de bom:** a ideia de um assistente conversacional **em volta** do
produto (explicar conflito, sugerir substituição, redigir rodapé). Isso continua válido.

### Tese 2 — Google Opal: pipeline visual de 4 blocos

**Pacote:** `opal/` — `Entrada → Extract Availability → Generate Schedule JSON → Render`.
Gemini 3 Pro em todos os blocos, code execution ligado no extrator, assets de regras
anexados no gerador, render em modo Google Doc para exportar .docx.

**Por que não fechou:**
- **Mesmo problema de leitura da tese 1.** A saída do `Extract Availability` precisava
  bater com `debug/disponibilidade_agosto.json` e não batia de forma confiável.
- **Sandbox fechado.** `parse_mensal.py` não roda dentro do Opal (sem pdfplumber). A
  saída foi criar o `05_MODO_PARSER_LOCAL.md`: rodar o parser na máquina e **colar o
  JSON** no Opal. Funciona, mas a coordenadora passa a ter dois passos manuais por semana.
- **Sem nó de HTTP genérico.** Não dá para hospedar o parser como API e chamar do Opal —
  o Opal não expõe esse recurso ao usuário. Beco sem saída.

**O aprendizado que veio daqui:** o gargalo nunca foi a geração, foi a **leitura**.
Foi este teste que justificou escrever o `parse_mensal.py`.

### Tese 3 — Codex CLI na pasta: "agente com AGENTS.md"

**Pacote:** `codex/` — `AGENTS.md` com todas as regras + `gerar_escala_docx.py` +
`entradas/` + fixture de exemplo. O agente lê os arquivos, monta o
`escala_semana.json` e roda o renderizador Python (layout 100% fiel).

**O que essa tese acertou:** separar **conteúdo** (o JSON, decidido pelo agente) de
**forma** (o .docx, renderizado por código determinístico). O layout deixou de ser
problema a partir daqui.

**Por que não fechou como produto dela:**
- **Barreira de instalação.** Exige Node/npm ou o script de instalação, mais Python e
  `python-docx`. No computador do hospital, sem permissão de instalação, isso morre.
- **Não tem tier gratuito.** O login do Codex CLI exige plano ChatGPT pago ou chave de
  API. O plano free dá o modelo no app, não o CLI.
- **Terminal.** O usuário final é enfermeira, não desenvolvedora.
- **A alocação continuava no modelo**, com o mesmo risco de violação silenciosa.

**Veredito:** ótimo para **nós** desenvolvermos (é o caminho deste `CLAUDE.md`),
inviável para **ela** operar.

### Tese 4 — App HTML único, solver determinístico ✅ **escolhida**

`app/editor_escala.html`. Um arquivo, duplo clique, offline, sem conta, sem instalação.
LLM fora do caminho crítico.

| Trabalho | Quem faz | Erra? |
|---|---|---|
| Ler disponibilidade | importador .xlsx nativo (ou `parse_mensal.py`) | não |
| Distribuir nos sítios | solver determinístico em JS | não viola regra rígida |
| Conferir | validador, roda a cada alteração | aponta o que quebrou |
| Ajustar | a coordenadora, arrastando | **é o ponto** |
| Gerar o Word | gerador OOXML embutido | layout fixo |

**Resultado medido:** semana real 03–07/08 fecha com **0 violações rígidas e 1 alerta**,
em menos de um segundo (350 reinícios do solver).

---

## 3. Aprendizados transferíveis

### Sobre onde colocar o LLM

**Um LLM que precisa ler, resolver e desenhar ao mesmo tempo falha nos três.**
Separar as três responsabilidades foi o que fez o projeto andar. Nas teses 1–3 o modelo
acumulava tudo; na tese 4 ele saiu do caminho e só sobrou trabalho que código faz melhor.

**Violação silenciosa é o pior modo de falha.** Uma escala com erro *que parece certa*
é mais danosa que um erro que aparece na tela — ela vai impressa para a parede. Todo
componente novo tem que falhar alto.

**Leitura de documento é engenharia determinística, não prompt.** Toda vez que um modelo
leu a planilha/PDF "por visão", errou coluna. Parser por coordenadas/XML: acertou.

### Sobre restrições (aprendido apanhando)

- **A regra "sexta ≠ segunda" exige estado.** Precisa da escala da semana *anterior* como
  entrada. Isso obriga o produto a ter histórico — no app, salvar o .json de cada semana.
  Regra aparentemente inócua que muda a arquitetura.
- **Posto fixo precisa de isenção explícita.** Livia no Ensino todos os dias viola
  "não repetir sítio em dias seguidos". Sem isenção, o solver nunca fechava.
- **Algumas restrições só fecham por coincidência.** As colocações fixas fora de Ações
  (Pâmela terça manhã, Bia J quinta manhã) só funcionam porque caem no dia de plantão
  dessas pessoas. Se o plantão mudar de dia, a regra quebra — e ninguém vai entender por quê.
- **Ligar/desligar regra é ferramenta de descoberta, não configuração.** O painel de
  Regras existe para responder "essa regra é inegociável mesmo?". Desliga uma, vê se a
  escala melhora, pergunta pra ela. Foi assim que várias "regras rígidas" viraram alertas.
- **Regra escrita ≠ regra real.** O documento de orientações da coordenadora tinha ambiguidade
  ("segundas quartas / terceiras terças" — nunca confirmado) e omissões. A escala pronta
  dela é uma fonte melhor que o documento de regras.

- **A escala pronta dela é mais informativa que o documento de regras.** O modelo de
  referência (20–24/jul) mostrou que a célula não é uma lista de nomes: é texto com
  horário, motivo e atividade (`Bia P 10h`, `Artur VD com Rosa`, `Curso Manejo: Pâmela P`),
  às vezes com 4 pessoas, às vezes vazia. Nenhuma linha do documento de orientações dizia
  isso. Lição: **derivar o modelo de dados da saída real, não da especificação escrita.**

### Sobre validador e solver

**O validador é a peça central, não o solver.** A mesma função pinta a célula, monta o
relatório e **pontua** a tentativa do solver (rígida = 100, alerta = 1). Uma
implementação, três comportamentos que nunca divergem. Duplicar essa lógica é o jeito
mais rápido de criar bug invisível.

**Guloso + 350 reinícios ganha de backtracking.** Para 9 sítios × 5 dias × 2 turnos, roda
em <1s e é código que cabe na cabeça. Otimalidade não era requisito — validade era.

### Sobre distribuição e o usuário real

**"Sem instalação" é requisito funcional, não conveniência.** Computador de hospital,
sem permissão de admin, sem plano pago, sem tempo para aprender ferramenta. Um arquivo
HTML que abre com duplo clique passa; qualquer CLI ou stack com npm não passa.

**Free tier importa na escolha da plataforma.** Gems (grátis) > Codex CLI (pago). No fim,
um HTML local é mais grátis e mais confiável que os dois.

**Mostrar o motivo da recusa vale mais que a sugestão certa.** O que ganhou a
usabilidade foi a célula listar *quem não pode entrar e por quê* ("de FC", "já está em
Vacina", "entra só depois das 16h"). Isso transforma o produto em ferramenta de
raciocínio dela, não caixa-preta.

### Sobre implementação sem dependência

- `.xlsx` é um zip de XMLs; o navegador descompacta nativo com
  `DecompressionStream("deflate-raw")`. Dá para ler planilha sem SheetJS, sem CDN, offline.
- `.docx` também: o zip OOXML dá para montar à mão em ~40 linhas de JS, sem biblioteca.
- Três detalhes que só o arquivo real ensina: número vem como `1.0`; linha em branco não
  existe no XML (respeitar o atributo `r`); o ano não está declarado (deduzir pelos
  marcadores S/D do fim de semana). Testar com arquivo real cedo economizou reescrita.

---

## 4. Ideias levantadas e ainda não testadas

| Ideia | Status | Nota |
|---|---|---|
| Assistente conversacional ao lado do app (explicar conflito, sugerir substituição, redigir rodapé) | não implementado | é o lugar legítimo do LLM; único uso que sobrou da tese 1 |
| Importar a escala da semana passada do `.docx` gerado | não testado | tiraria o passo "salvar o .json" |
| Aprender colocações fixas a partir do histórico de escalas prontas | não testado | as escalas dela são a melhor fonte de regra |
| Aba de configuração para equipe/sítios/fixas | não implementado | tira o hardcode; pré-requisito se um dia generalizar |
| Parser da mensal como API | descartado | Opal não expõe nó HTTP; e o app já lê o .xlsx direto |
| Hospedar como site com upload | descartado | offline + sem conta é vantagem competitiva, não limitação |

---

## 5. Roadmap — o que falta para virar rotina dela

### Fase 1 — fechar o laço com a realidade (agora)

Rodar **uma semana real com a coordenadora**, lado a lado com a escala que ela faria à mão.
Duas perguntas, e só elas:

1. Quais diferenças são **erro do solver**?
2. Quais diferenças são **regra que ninguém tinha escrito ainda**?

Sem essa sessão, todo o resto é palpite. O resultado alimenta as regras e as pendências
no `CLAUDE.md`.

### Fase 2 — pendências técnicas, em ordem de impacto

1. **Importar a escala das enfermeiras** (salas por dia/turno). É o que falta de verdade:
   hoje o solver decide as salas, mas essa decisão já existe em outro documento. Enquanto
   isso não entra, a escala das enfermeiras sai errada e ela corrige à mão toda semana.
2. **Observação dentro da célula** ("P 10h", "VD com Rosa"). Hoje só nome; o rodapé
   cobre parcialmente.
3. **Colocações fixas fora do código**, em aba de configuração.
4. **Ajuste fino do layout do .docx** contra o modelo impresso (larguras).
5. **Regras faltantes:** Marta/conselho (precisa de contexto de mês), prioridade de dupla
   de técnicos, ordem de substituição automática por ATM/curso/folga.

### Fase 3 — rotina sem a gente

O sucesso é: ela abre o HTML, importa a planilha do mês, escolhe a semana, clica em
gerar, arrasta três nomes, baixa o Word e imprime. Sem nos chamar.
Medida: **duas semanas seguidas sem pergunta**.

---

## 6. O que NÃO fazer

- **Não devolver a alocação para um LLM.** Testado três vezes, falhou três vezes.
- **Não adicionar build, npm, bundler ou CDN** ao `editor_escala.html`.
- **Não exigir servidor, conta ou login.** Offline é feature.
- **Não retomar `codex/`, `gem/` ou `opal/`** como caminho de produto. Ficam como registro.
- **Não generalizar para multi-unidade antes da fase 3.** Configuração genérica sem um
  caso funcionando de ponta a ponta é custo sem retorno.
- **Não esconder incerteza.** Código desconhecido na planilha, sítio vazio, navegador
  antigo: tudo aparece na tela.
