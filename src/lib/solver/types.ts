export type Turno = "manha" | "tarde" | "noite" | "ambos";
export type Categoria = "enf" | "tec";
export type StatusDisponibilidade = "OK" | "P" | "F" | "FC" | "FE" | "AT" | "ATM" | string;

export interface Pessoa {
  n: string;
  c: Categoria;
  t: Turno;
  /** Posto fixo: a pessoa ocupa este sítio todos os dias, nos dois turnos.
   *  Quem tem posto fixo fica isento de `diasSeguidos` (senão o solver nunca fecha). */
  fixo?: string;
  /** Rótulo do mesmo posto fixo na grade da tarde, quando o sítio muda de nome
   *  à tarde (`nome_tarde`). Ausente = o mesmo de `fixo`. */
  fixoTarde?: string;
  /** Não exigir que passe por Ações 1x na semana. */
  isentoAcoes?: boolean;
  /** Penalidade somada ao custo do solver: quanto maior, menos a pessoa é escolhida
   *  para preencher sítio comum. Serve para quem só entra como reforço. */
  custoExtra?: number;
  /** Nome como aparece na planilha de disponibilidade (coluna `nome` da Equipe).
   *  O importador usa para achar o nome curto — o apelido é dado, não código. */
  completo?: string;
}

export interface Sitio {
  n: string;
  quem: "enf" | "tec" | "ambos";
  /** Sítio que pode ficar vazio sem gerar alerta de cobertura. */
  opcional?: boolean;
}

/** "Fulano nunca no sítio X." */
export interface Proibicao {
  pessoa: string;
  sitio: string;
}

/** "Fulano e Beltrano não ficam juntos no mesmo sítio." */
export type DuplaProibida = [string, string];

export interface ColocacaoFixa {
  p: string;
  d: number;
  t: "manha" | "tarde";
  s: string;
}

export interface ColocacaoFixaNaoAcoes {
  p: string;
  d: number;
  t: "manha" | "tarde";
}

export interface RegraConfig {
  on: boolean;
  hard: boolean;
  txt: string;
}

export interface Regras {
  disponibilidade: RegraConfig;
  turnoBase: RegraConfig;
  categoria: RegraConfig;
  proibicoesSitio: RegraConfig;
  plantaoMesmo: RegraConfig;
  diasSeguidos: RegraConfig;
  sextaSegunda: RegraConfig;
  duplaProibida: RegraConfig;
  fixas: RegraConfig;
  acoesSemana: RegraConfig;
  cobertura: RegraConfig;
  alternancia16h: RegraConfig;
}

export interface SextaAnterior {
  manha: Record<string, string[]>;
  tarde: Record<string, string[]>;
}

export interface Config {
  dias: string[];
  equipe: Pessoa[];
  acoes: string;
  sitios: { manha: Sitio[]; tarde: Sitio[] };
  sitiosTec: string[];
  /** Ordem de preferência ao colocar uma segunda pessoa no mesmo sítio. */
  prioridadeDupla: string[];
  proibicoes: Proibicao[];
  duplasProibidas: DuplaProibida[];
  fixas: ColocacaoFixa[];
  fixasNaoAcoes: ColocacaoFixaNaoAcoes[];
  regras: Regras;
  disp: Record<string, StatusDisponibilidade[]>;
  sextaAnterior: SextaAnterior;
}

export interface Violacao {
  hard: boolean;
  regra: string;
  turno: "manha" | "tarde";
  sitio: string;
  d: number;
  msg: string;
}

export type EscalaTurno = Record<string, string[][]>;

export interface Escala {
  manha: EscalaTurno;
  tarde: EscalaTurno;
}

export interface ScheduleResult {
  escala: Escala;
  violacoes: Violacao[];
  score: number;
}
