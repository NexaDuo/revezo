import { Config, Pessoa, Regras, Sitio, ColocacaoFixa, ColocacaoFixaNaoAcoes, Proibicao, DuplaProibida } from "./types";

export const DIAS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];

export const ACOES = "Ações de vigilância/VD/PSE/Ensino/cursos/grupos";

export const SITIOS_MANHA: Sitio[] = [
  { n: "Consultas - Sala 1", quem: "enf" },
  { n: "Consultas - Sala 5", quem: "enf", opcional: true },
  { n: "Supervisão", quem: "enf" },
  { n: "Ensino", quem: "enf", opcional: true },
  { n: "Procedim. de enfermagem", quem: "tec" },
  { n: "Vacina", quem: "tec" },
  { n: "Acolhimento", quem: "tec" },
  { n: "Curativo", quem: "tec" },
  { n: ACOES, quem: "ambos" },
];

export const SITIOS_TARDE: Sitio[] = [
  { n: "Consultas - Sala 1", quem: "enf" },
  { n: "Consultas - Sala 5", quem: "enf", opcional: true },
  { n: "Supervisão", quem: "enf" },
  { n: "Ensino", quem: "enf", opcional: true },
  { n: "Procedim. de enfermagem", quem: "tec" },
  { n: "Vacina", quem: "tec" },
  { n: "Acolhimento", quem: "tec" },
  { n: "Curativo- CME 16h", quem: "tec" },
  { n: ACOES, quem: "ambos" },
];

export const SITIOS_TEC = ["Procedim. de enfermagem", "Vacina", "Acolhimento", "Curativo"];

/** Sítios com mais atendimento primeiro — é onde a dupla rende mais. */
export const PRIORIDADE_DUPLA = ["Acolhimento", "Vacina", "Procedim. de enfermagem", "Curativo- CME 16h"];

/** Regras específicas de pessoa, do caso-origem. São DADO, não código:
 *  outra unidade carrega as suas próprias (tabela `regras_config`). */
export const PROIBICOES: Proibicao[] = [
  { pessoa: "Marta", sitio: "Vacina" },
];

export const DUPLAS_PROIBIDAS: DuplaProibida[] = [
  ["Valéria", "Bia P"],
];

/** Quem não aparece na planilha de disponibilidade do caso-origem mas trabalha
 *  na unidade: posto fixo no Ensino e reforço isento de Ações. Só demonstração. */
export const EQUIPE_FORA_DA_PLANILHA_DEMO: Pessoa[] = [
  { n: "Livia", c: "enf", t: "ambos", fixo: "Ensino" },
  { n: "Artur", c: "enf", t: "ambos", isentoAcoes: true, custoExtra: 3 },
];

export const REGRAS_DEFAULT: Regras = {
  disponibilidade: { on: true, hard: true, txt: "Não escalar quem está de F / FC / FE / AT no dia" },
  turnoBase: { on: true, hard: true, txt: "Cada um só no seu turno-base (exceto plantão P)." },
  categoria: { on: true, hard: true, txt: "Sala 1/5, Supervisão e Ensino só enfermeiro; Procedimento→Curativo só técnico" },
  mariaVacina: { on: true, hard: true, txt: "Respeitar as proibições de pessoa por sítio" },
  plantaoMesmo: { on: true, hard: true, txt: "Quem está de plantão não fica no mesmo sítio de manhã e de tarde" },
  diasSeguidos: { on: true, hard: true, txt: "Não repetir o mesmo sítio em dias seguidos (vale para Ações)" },
  sextaSegunda: { on: true, hard: true, txt: "Não repetir o sítio da sexta anterior na segunda" },
  duplaProibida: { on: true, hard: true, txt: "Respeitar as duplas proibidas no mesmo sítio" },
  fixas: { on: true, hard: true, txt: "Respeitar as colocações fixas de grupos/atividades" },
  acoesSemana: { on: true, hard: false, txt: "Cada profissional passa ao menos 1x por semana em Ações" },
  cobertura: { on: true, hard: false, txt: "Todo sítio deve ter alguém em todos os dias" },
  alternancia16h: { on: true, hard: false, txt: "Quem entra às 16h divide sítio, alternando o sítio a cada dia" },
};

export const FIXAS: ColocacaoFixa[] = [
  { p: "Bia P", d: 1, t: "manha", s: ACOES },
  { p: "Bia P", d: 3, t: "tarde", s: ACOES },
  { p: "Luana", d: 3, t: "manha", s: ACOES },
  { p: "Rita", d: 0, t: "tarde", s: ACOES },
  { p: "Rita", d: 2, t: "tarde", s: ACOES },
  { p: "Sônia", d: 4, t: "manha", s: ACOES },
  { p: "Sônia", d: 3, t: "tarde", s: ACOES },
  { p: "Valéria", d: 2, t: "tarde", s: ACOES },
  { p: "Fábio", d: 2, t: "manha", s: ACOES },
  { p: "Pâmela", d: 1, t: "tarde", s: ACOES },
  { p: "Bia J", d: 3, t: "tarde", s: ACOES },
];

export const FIXAS_NAO_ACOES: ColocacaoFixaNaoAcoes[] = [
  { p: "Pâmela", d: 1, t: "manha" },
  { p: "Bia J", d: 3, t: "manha" },
];

export const defaultConfig: Config = {
  dias: DIAS,
  equipe: [],
  acoes: ACOES,
  sitios: { manha: SITIOS_MANHA, tarde: SITIOS_TARDE },
  sitiosTec: SITIOS_TEC,
  prioridadeDupla: PRIORIDADE_DUPLA,
  proibicoes: PROIBICOES,
  duplasProibidas: DUPLAS_PROIBIDAS,
  fixas: FIXAS,
  fixasNaoAcoes: FIXAS_NAO_ACOES,
  regras: REGRAS_DEFAULT,
  disp: {},
  sextaAnterior: { manha: {}, tarde: {} },
};
