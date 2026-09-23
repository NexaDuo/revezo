# REGRAS.md — registro histórico do caso-origem

> **DOCUMENTO HISTÓRICO — não é a autoridade do projeto.** A autoridade é o
> `AGENTS.md` na raiz. Este arquivo era o `CLAUDE.md` da época em que o produto
> era um HTML único single-tenant para uma pessoa, e descreve
> `app/editor_escala.html`, que não existe mais neste repositório (a versão de
> referência está em `docs/referencia/editor_escala.html`).
>
> Continua valioso por um motivo: é a descrição mais completa das **regras de
> negócio reais** do caso-origem. Onde ele falar de escopo, arquitetura ou
> stack, está desatualizado — vale o `AGENTS.md`.

Complemento histórico e estratégico: `PRODUTO.md` (teses testadas, o que quebrou, roadmap).

Escopo atual: **single-tenant**. É a ferramenta de UMA pessoa (Mirela Fontes,
enfermeira responsável pela escala de sítio de uma unidade de saúde). Nada aqui
precisa ser genérico para outras unidades — o objetivo é fechar as pendências e
isso virar rotina semanal dela.

---

## 1. O problema, em uma frase

Toda semana a coordenadora monta à mão a **escala de sítio da enfermagem**: um Word
(paisagem) com 9 sítios × 5 dias (seg–sex) × 2 turnos (manhã/tarde), distribuindo
~21 profissionais e respeitando ~12 regras. Leva horas e erra por cansaço.
O produto gera essa escala em segundos, ela revisa arrastando nomes e baixa o Word.

**1 arquivo .docx por semana.** Layout igual ao modelo impresso (não negociável —
a escala é impressa e colada na parede).

---

## 2. Arquitetura — a decisão central

```
LER              →   ALOCAR                 →   CONFERIR        →   AJUSTAR    →   RENDERIZAR
importador xlsx      solver determinístico      validador           drag & drop     OOXML/docx
(ou parse_mensal)    (guloso + reinícios)       (a cada mudança)    (a coordenadora)     (layout fixo)
```

**Nenhum LLM no caminho crítico.** Isso não é preferência estética, é resultado de
teste: as três primeiras tentativas (Gem, Opal, Codex) pediam ao modelo para ler os
PDFs **e** resolver as restrições **e** desenhar o Word ao mesmo tempo. A leitura
errava dia de plantão/folga e a resolução violava regras em silêncio — o pior modo
de falha possível, porque a escala *parece* certa.

O LLM continua útil **em volta**: explicar um conflito ("por que a Noemi não pode
entrar aqui?"), sugerir substituição, redigir o rodapé, lidar com exceção do mês.
Nunca decidir a alocação.

Regra ao evoluir o código: **se uma mudança colocar um modelo no caminho da
alocação, ela está errada.**

---

## 3. Estado atual do código

### `app/editor_escala.html` — o produto (ideia 3, escolhida)

Arquivo HTML **único**, ~58 KB, sem build, sem dependência, sem CDN, sem servidor,
sem conta, offline. Abre com duplo clique. Isso é requisito, não acidente: a coordenadora
usa o computador do hospital, sem permissão para instalar nada.

O que já funciona:

- Grade MANHÃ + TARDE, 9 sítios na ordem impressa, 5 colunas.
- **Gerar automático** — 350 reinícios do solver, fica com a melhor pontuação.
  Na semana real 03–07/08 fecha com **0 violações rígidas e 1 alerta**.
- **Arrastar e soltar** nomes entre células; `×` remove; clicar numa célula lista
  quem pode entrar ali **e o motivo de quem não pode** ("de FC", "já está em Vacina",
  "entra só depois das 16h").
- **Conferência** — cada violação com nome da regra, motivo e local; clicar leva à
  célula. Célula vermelha = regra rígida; amarela = alerta.
- **Quem está livre** — por dia, quem sobrou e quem está fora, com o motivo.
- **Regras** — liga/desliga cada regra individualmente. Serve para descobrir na
  prática quais regras são inegociáveis: desligue uma e veja se a escala melhora.
- **Importar planilha (.xlsx)** — lê a `Escala Agosto 2026.xlsx` direto no navegador.
- **Disponibilidade** — caminho manual alternativo (colar JSON ou editar à mão).
- **Salvar/Abrir semana** (.json), incluindo "usar a sexta desta semana como semana
  anterior" — é o que faz a regra sexta↔segunda funcionar de verdade.
- **Baixar .docx** — Word em paisagem, tabela com bordas, cabeçalhos sombreados,
  rodapé. Zip OOXML montado à mão em ~40 linhas, sem biblioteca.

Spec detalhada: `app/IDEIA3_APP_ESCALA.md`.

### Auxiliares (ainda úteis, fora do app)

| Arquivo | Papel | Status |
|---|---|---|
| `parse_mensal.py` | parser determinístico da mensal em PDF (pdfplumber, tabela por coordenadas) | fallback — o app lê o .xlsx direto |
| `gerar_escala_docx.py` | renderizador Word a partir de `escala_semana.json` (python-docx) | referência de layout; o app replica em OOXML |
| `escala_semana.json` | exemplo preenchido (semana 20–24/jul) | fixture de teste |
| `debug/disponibilidade_03a07.json` | saída esperada do importador para a semana 03–07/08 | **teste de regressão** |

### Tentativas arquivadas (não desenvolver mais — ver PRODUTO.md)

`codex/` (pacote para OpenAI Codex CLI) · `gem/` (Gem do Gemini) · `opal/` (pipeline
Google Opal, 4 blocos). Mantidos como registro do que foi testado e por que falhou.

---

## 4. Domínio — regras de negócio

### Sítios (linhas da escala, nesta ordem exata)

| # | Sítio | Quem preenche |
|---|---|---|
| 1 | Consultas – Sala 1 | enfermeiro |
| 2 | Consultas – Sala 5 | enfermeiro |
| 3 | Supervisão | enfermeiro |
| 4 | Ensino | enfermeiro (normalmente Livia) |
| 5 | Procedim. de enfermagem | técnico |
| 6 | Vacina | técnico |
| 7 | Acolhimento | técnico |
| 8 | Curativo (tarde: "Curativo- CME 16h") | técnico |
| 9 | Ações de vigilância/VD/PSE/Ensino/cursos/grupos | enfermeiro **e** técnico |

Os 4 primeiros são só enfermeiros; de Procedimento a Curativo, só técnicos; Ações é
mista. O nome do sítio 8 muda entre turnos mas é **o mesmo sítio** para efeito de
regras — daí a função `canon()` que normaliza `"Curativo- CME 16h" → "Curativo"`.

Abaixo da tabela: linha de **Férias** + trocas/substituições/observações da semana.

### Equipe (~21 pessoas)

Enfermeiras manhã (07:00–13:00): Lia, Tainá, Ana Lucia, Sônia
Enfermeiras tarde (12:30–18:30): Mirela (13:30–19:30), Flávia, Clara K
Enfermeira 16h (16:00–22:00): Clara V (plantão de 12h na quarta)
Também enfermeiros: Livia (Ensino, posto fixo diário), Artur
Técnicos manhã: Valéria, Marta, Adriana, Bia P, Luana
Técnicos tarde: Fábio, Bia J, Noemi, Pâmela
Técnicos 16h: Rita, Joana

Todos fazem **1 plantão (P) de 12h por semana** — o dia sai da escala mensal.

**Regra de nome:** primeiro nome. Se repetir, inicial do último sobrenome —
**Bia P** (Beatriz Paiva Nunes) × **Bia J** (Beatriz Juliano Vidal);
**Clara V** (Clara Fonseca Valente); **Clara K** (Clara Siqueira K.).
O importador casa nome completo da planilha → nome curto via `NOME_CURTO`.

### Regras rígidas (bloqueiam — `hard: true`)

| chave | regra |
|---|---|
| `disponibilidade` | não escalar quem está de F / FC / FE / AT no dia |
| `turnoBase` | cada um só no seu turno-base (exceto plantão); quem é 16h nunca de manhã |
| `categoria` | Sala 1/5, Supervisão e Ensino só enfermeiro; Procedimento→Curativo só técnico |
| `proibicoesSitio` (antes `mariaVacina`) | Marta nunca na Vacina |
| `plantaoMesmo` | quem está de plantão não fica no mesmo sítio de manhã e de tarde |
| `diasSeguidos` | não repetir o mesmo sítio em dias seguidos (vale para Ações) |
| `sextaSegunda` | não repetir o sítio da sexta anterior na segunda |
| `duplaProibida` | Valéria e Bia P não ficam juntas no mesmo sítio |
| `fixas` | respeitar as colocações fixas de grupos/atividades |

### Alertas (avisam, não bloqueiam — `hard: false`)

| chave | regra |
|---|---|
| `acoesSemana` | cada profissional passa ao menos 1x por semana em Ações |
| `cobertura` | todo sítio deve ter alguém em todos os dias |
| `alternancia16h` | Rita/Joana dividem sítio após as 16h, alternando o sítio a cada dia |

### Colocações fixas (grupos e atividades recorrentes)

Em **Ações**: Bia P (ter manhã, qui tarde) · Luana (qui manhã, grupo de caminhada) ·
Rita (seg e qua tarde, grupo de caminhada) · Sônia (sex manhã tabagismo, qui tarde
viva leve) · Valéria (qua tarde) · Fábio (qua manhã) · Pâmela (ter tarde) ·
Bia J (qui tarde).

Fora de Ações (a pessoa precisa estar escalada, mas **não** em Ações):
Pâmela (ter manhã) · Bia J (qui manhã).

⚠️ Hoje isso está **hardcoded** em `FIXAS` / `FIXAS_NAO_ACOES` no HTML. Enquanto
mudar com frequência, alguém precisa editar o arquivo — candidato a virar aba de
configuração na tela.

### 4B. Como a escala REAL dela se parece (importante)

Recorte do modelo de referência (semana 20–24/jul, `EXEMPLO - escala semana 20 a 24
julho.docx`). Vale mais que qualquer descrição de regra — é a saída que temos que igualar:

| Sítio (manhã) | Segunda 20 | Terça 21 | Quarta 22 | Quinta 23 | Sexta 24 |
|---|---|---|---|---|---|
| Consultas - Sala 1 | Sônia | Ana Lucia | **Lia/Artur** | Lia | Clara |
| Ensino | Livia | Livia | Livia | Livia | **-** |
| Acolhimento | Valéria | Luana | Marta | **Artur/Bia J/Bia P 10h** | Noemi |
| Ações | Valéria | **Curso Manejo: Pâmela P** | **Rita 10h/Clara V 10h/Marta** | **Bia J P 10h/Clara P 10h** | **Joana 10h/Sônia grupo/Noemi P/Artur VD com Rosa** |

| Sítio (tarde) | Segunda 20 | Terça 21 | Quarta 22 | Quinta 23 | Sexta 24 |
|---|---|---|---|---|---|
| Consultas - Sala 5 | *(vazio)* | **Clara 16h** | Clara 16h | - | Clara |
| Curativo- CME 16h | **Ana/Artur/Joana 16h** | Bia J | Fábio | Noemi | Pâmela |
| Ações | **Clara V 16h VD/Ana/Rita 16h** | **Curso Manejo: Valéria/I/Rita (CME)** | **Marta P CLS-17h** | Sônia P grupo/Bia P P | Curso Manejo: Clara e Bia J |

Rodapé real: `Férias: Mirela, Adriana` · `Segunda: Lu troca Bia J | Terça: Tainá FC |
Quarta: Tainá Férias | Quinta: Mirela FC | Sexta: Luana FC` · `Noemi troca Bia P |
Flávia férias | Mirela FC | Clara P`

O que isso ensina:

- **Célula é texto livre com nomes dentro**, não uma lista de nomes. Tem horário
  (`Bia P 10h`, `Clara 16h`), motivo (`P`, `grupo`, `VD com Rosa`, `CLS-17h`),
  atividade que engloba a célula (`Curso Manejo: ...`) e separador `/` para 2–4 pessoas.
- **Célula vazia e `-` existem** e são legítimos (Ensino na sexta, Sala 5 na segunda tarde).
- O modelo de dados atual (`escala{turno}{sitio}[dia] = [nomes]`) **não expressa isso**.
  A evolução natural é `[{nome, obs}]` + uma `obs` da própria célula, preservando o
  `[nomes]` antigo na leitura dos .json já salvos.

### Regras conhecidas mas ainda NÃO implementadas

- **Marta em Ações na 2ª quarta e na 3ª terça do mês** (reunião do conselho).
  A interpretação de "segundas quartas / terceiras terças" nunca foi confirmada com
  a coordenadora. Precisa de contexto de mês, não só de semana.
- **Prioridade de dupla de técnicos:** quando sobrar gente para dobrar num sítio,
  priorizar Acolhimento → Vacinas → Procedimentos (sítios com mais atendimento).
- **Ordem de substituição por ATM/curso/folga** (e escrever a substituição no rodapé):
  - técnico ausente: 1) técnico em Ações no turno → 2) técnico de plantão →
    3) enfermeira em Ações no turno → 4) enfermeira de plantão
  - enfermeira ausente: 1) enfermeira em Ações no turno → 2) enfermeira de plantão

---

## 5. Entradas

| Entrada | Formato | Para que |
|---|---|---|
| `Escala Agosto 2026.xlsx` | planilha mensal do hospital | **fonte oficial** de disponibilidade (plantão/folga/férias) |
| `escala mensal de agosto.pdf` | PDF da mesma coisa | legado; lido por `parse_mensal.py` |
| `escala enfermeiras agosto.doc` | Word | quem fica em Sala 1 / Sala 5 / Supervisão por dia e turno + plantão de cada enfermeira |
| `regras para escala de sítio.docx` | Word | orientações originais (já destiladas neste arquivo) |
| `EXEMPLO - escala semana 20 a 24 julho.docx` | Word | modelo de layout de referência |

### Estrutura da planilha mensal (aprendido lendo o arquivo real)

- Uma aba por mês (MAI…DEZ) + `Pessoas` (~13k funcionários do hospital), `Cargo`, `bkp`.
  Só interessam as abas de mês com ≥20 colunas de dia.
- **Linha 4 = cabeçalho**: Registro | Nome do Colaborador | Categoria Profissional |
  Nº Conselho | Horário contratual | dias 1..31.
- **Linhas de seção na coluna A**: MANHÃ / TARDE / NOITE → definem o turno-base de
  quem vem abaixo. Essas mesmas linhas marcam `S` e `D` nas colunas de sábado/domingo.
- Legenda nas linhas 31–42:
  - **plantão / trabalha**: P, PN, P4, PHE, PBH, TP
  - **turno**: M, T, N1, N2 (também contam como trabalho)
  - **ausência**: Fe/FE, FC, DSR, AT, LO, LM, LP, LS, LC, FP, I, NC
- A coluna de categoria vem com **erro de digitação** ("Enfermaira") — casar por regex
  `enferm[ae]ir`, nunca por igualdade.
- Códigos desconhecidos aparecem na linha "códigos:" da tela de importação e são
  tratados como **ausência**. Se um deles significar presença, é uma linha de código
  para corrigir.

### Como o app lê o .xlsx sem biblioteca

Um `.xlsx` é um zip de XMLs. O navegador descompacta nativamente com
`DecompressionStream("deflate-raw")` — sem CDN, sem npm, sem servidor, offline.
Três partes: percorrer o diretório central do zip; ler `sharedStrings.xml` (o Excel
guarda textos numa tabela única) e o XML da aba; casar nomes completos com nomes curtos.
Funciona em Chrome, Edge, Firefox e Safari atuais; em navegador antigo o app **avisa**
em vez de falhar em silêncio, e o caminho de colar JSON continua lá.

---

## 6. Modelo de dados

```js
EQUIPE[]        { n, c: "enf"|"tec", t: "manha"|"tarde"|"noite"|"ambos", fixo? }
DISP{nome:[5]}  "OK" | "P" (plantão) | "F" | "FC" | "FE" | "AT"
SITIOS{turno}[] { n, quem: "enf"|"tec"|"ambos" }   // ordem = ordem impressa
escala{turno}{sitio}[dia] = [nomes]               // célula é LISTA: cabe 2 pessoas (16h)
SEXTA_ANTERIOR{turno}{sitio} = [nomes]            // entrada da regra sexta↔segunda
FIXAS[]         { p, d: 0..4, t, s }              // colocações de grupo/atividade
REGRAS{chave}   { on, hard, txt }
```

Uma semana inteira cabe num JSON de ~4 KB. **O histórico é a pasta de JSONs** — cada
semana salva vira a "semana anterior" da próxima. Sem servidor, de propósito.

---

## 7. Motor de regras — a peça central

Cada regra é uma entrada em `REGRAS` com `on` (ligada) e `hard` (bloqueia ou avisa).
O validador percorre turno × sítio × dia e devolve
`{hard, regra, turno, sitio, dia, msg}`.

A **mesma função** serve para três coisas:

1. pintar a célula (vermelho = rígida, amarelo = alerta),
2. montar o relatório de conferência,
3. **pontuar** uma tentativa do solver (rígida = 100, alerta = 1).

Mudou a regra, mudaram os três comportamentos juntos. **Nunca duplique lógica de
validação** — se precisar validar em outro lugar, chame `validar()`.

## 8. Solver

Guloso com aleatoriedade e reinício — não backtracking puro. Mais simples e
suficiente para 9 sítios × 5 dias × 2 turnos. 350 tentativas rodam em <1s.

1. **Ensino**: Livia todos os dias (posto fixo, **isento** da regra de dias seguidos).
2. **Colocações fixas** de grupo/atividade.
3. Sítio a sítio, dia a dia: candidatos que passam em **todas** as rígidas, ordenados
   por custo = repetição do sítio na semana + carga acumulada + ruído. Quando não
   sobra ninguém do turno, quem entra às 16h assume o sítio.
4. **Ações**: quem tem menos Ações na semana, preferindo o dia de plantão.
5. **Rita e Joana** dividem um sítio de técnico após as 16h, alternando.
6. **Passe final**: quem ficou sem Ações na semana entra no dia de plantão.

---

## 9. Pendências (o que falta para virar rotina dela)

| # | Item | Esforço | Observação |
|---|---|---|---|
| 1 | **Ler a escala das enfermeiras** (salas por dia/turno) | médio | **é o que falta de verdade** — hoje o solver decide as salas, mas isso já vem decidido em outro documento |
| 2 | **Observação dentro da célula** ("P 10h", "VD com Rosa", "Curso Manejo: ...") | médio | hoje a célula só aceita nome. Na escala real dela isso é **frequente, não exceção** — ver §4B |
| 3 | Ajuste fino do layout do .docx | baixo | comparar com o modelo impresso e acertar larguras |
| 4 | Colocações fixas fora do código | baixo | aba de configuração na tela |
| 5 | Regras não implementadas da seção 4 | médio | Marta/conselho, prioridade de dupla, substituições automáticas |
| 6 | Histórico automático | baixo | hoje é salvar/abrir arquivo — **proposital**, sem servidor |

---

## 10. Limites honestos (dizer isso à Mirela, sempre)

- **Não substitui a revisão dela.** O solver garante as regras escritas; as não
  escritas (quem se dá bem com quem, quem está aprendendo um sítio) só ela sabe.
- **Lixo entra, lixo sai.** A qualidade depende da disponibilidade estar certa — por
  isso a leitura determinística da planilha é a porta de entrada certa.
- **Sem servidor = sem histórico automático.** Se ela não salvar o .json, a regra
  sexta↔segunda não tem base na semana seguinte.
- O resultado é sempre **rascunho para revisão humana**.

---

## 11. Convenções ao mexer neste projeto

- **Um arquivo só.** `editor_escala.html` não ganha build, bundler, npm ou CDN.
  Toda dependência nova precisa ser nativa do navegador ou não entra.
- **Offline obrigatório.** Nenhuma chamada de rede em runtime.
- **Zero instalação.** Duplo clique tem que funcionar no computador do hospital.
- **Falhar alto, nunca em silêncio.** Navegador antigo, código desconhecido na
  planilha, sítio vazio: tudo aparece na tela. Escala errada que parece certa é o
  pior resultado possível.
- **Português** em toda a UI, mensagens de erro e nomes de regra.
- Toda mudança no importador precisa continuar passando no teste com o arquivo real:
  o resultado esperado da semana 03–07/08 é idêntico a `debug/disponibilidade_03a07.json`.
- Toda mudança no solver/validador: rodar a semana 03–07/08 e conferir que continua em
  **0 violações rígidas**.

---

## 12. Armadilhas do ambiente (já custaram tempo)

- Esta pasta é um **mount do OneDrive**. Ler arquivos com **acento no nome** via shell
  falha com `Invalid argument` / `Input/output error` (ex.: `instrução da coordenadora.md`).
  Contorno: `device_stage_files` para esses arquivos, ou renomear sem acento.
- Números de dia na planilha vêm como `1.0`, não `1` — **comparação de string não
  funciona**, converta.
- Linhas em branco existem e o Excel **não as escreve no XML**: sem respeitar o
  atributo `r` de cada `<row>`, a matriz desalinha e o cabeçalho aparece na linha errada.
- O **ano não está declarado** na planilha. Não pergunte: a linha de seção marca S e D
  nas colunas de sábado e domingo; teste alguns anos e fique com o que faz os
  marcadores baterem. Se a planilha mudar de ano, acompanha sozinho.
- `.doc` antigo (escala das enfermeiras) não abre com python-docx. Converter com
  `libreoffice --headless --convert-to docx` ou `antiword`.

---

## 13. Como rodar

```bash
# o produto
abrir app/editor_escala.html no navegador (duplo clique)

# fallback: disponibilidade a partir do PDF mensal
pip install pdfplumber
python3 parse_mensal.py "escala mensal de agosto.pdf" --dias 3 4 5 6 7 --out disp.json

# fallback: renderizar o Word a partir de um JSON pronto
pip install python-docx
python3 gerar_escala_docx.py escala_semana.json "Escala semana 03 a 07-08.docx"
```

## 14. Próximo passo acordado

Rodar **uma semana real com a coordenadora**, lado a lado com a escala que ela faria à mão,
e comparar. Duas perguntas para essa sessão:

1. Quais diferenças são **erro do solver**?
2. Quais diferenças são **regra que ninguém tinha escrito ainda**?

O resultado dessa sessão alimenta a seção 4 (regras) e a seção 9 (pendências).
