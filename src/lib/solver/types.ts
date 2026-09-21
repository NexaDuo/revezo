export type Turno = "manha" | "tarde" | "noite" | "ambos";
export type Categoria = "enf" | "tec";
export type StatusDisponibilidade = "OK" | "P" | "F" | "FC" | "FE" | "AT" | "ATM" | string;

export interface Pessoa {
  n: string;
  c: Categoria;
  t: Turno;
  fixo?: string;
}

export interface Sitio {
  n: string;
  quem: "enf" | "tec" | "ambos";
}

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
  mariaVacina: RegraConfig;
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
