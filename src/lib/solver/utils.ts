import { Config, Pessoa, Escala, DuplaProibida } from "./types";

export const canon = (s: string) => s.replace("Curativo- CME 16h", "Curativo").trim();

export function indexarEquipe(equipe: Pessoa[]): Record<string, Pessoa> {
  const map: Record<string, Pessoa> = {};
  for (const p of equipe) map[p.n] = p;
  return map;
}

export function criarEscalaVazia(config: Config): Escala {
  const col = () => Array.from({ length: config.dias.length }, () => []);
  const manha: Record<string, string[][]> = {};
  for (const s of config.sitios.manha) manha[s.n] = col();
  const tarde: Record<string, string[][]> = {};
  for (const s of config.sitios.tarde) tarde[s.n] = col();
  return { manha, tarde };
}

export function status(disp: Record<string, string[]>, n: string, d: number): string {
  return (disp[n] || [])[d] || "OK";
}

export function estaFora(disp: Record<string, string[]>, n: string, d: number): boolean {
  return ["F", "FC", "FE", "AT", "ATM"].includes(status(disp, n, d));
}

export function ehPlantao(disp: Record<string, string[]>, n: string, d: number): boolean {
  return status(disp, n, d) === "P";
}

export function podeTurno(pessoaMap: Record<string, Pessoa>, disp: Record<string, string[]>, n: string, d: number, turno: "manha" | "tarde"): boolean {
  const p = pessoaMap[n];
  if (!p) return true;
  if (p.t === "ambos") return true;
  if (p.t === "noite") return turno === "tarde";
  if (p.t === turno) return true;
  return ehPlantao(disp, n, d);
}

export function disponivel(config: Config, pessoaMap: Record<string, Pessoa>, n: string, d: number, turno: "manha" | "tarde"): boolean {
  if (config.regras.disponibilidade.on && estaFora(config.disp, n, d)) return false;
  if (config.regras.turnoBase.on && !podeTurno(pessoaMap, config.disp, n, d, turno)) return false;
  return true;
}

export function cabeNoSitio(config: Config, pessoaMap: Record<string, Pessoa>, n: string, sitio: string, turno: "manha" | "tarde"): boolean {
  const s = config.sitios[turno].find(x => x.n === sitio);
  if (!s) return false;
  const c = pessoaMap[n]?.c || "tec";
  if (!config.regras.categoria.on) return true;
  return s.quem === "ambos" || s.quem === c;
}

/** Quem está na célula. Nunca lança: uma referência a sítio que não existe na
 *  grade (sítio renomeado ou apagado, grade salva antiga) é célula vazia. Quem
 *  carrega os dados é que avisa na tela que a referência ficou órfã. */
export function celula(escala: Escala, turno: "manha" | "tarde", sitio: string, d: number): string[] {
  return escala[turno]?.[sitio]?.[d] || [];
}

export function ondeEsteve(escala: Escala, config: Config, n: string, d: number, turno: "manha" | "tarde"): string[] {
  const out: string[] = [];
  for (const s of config.sitios[turno]) {
    if (celula(escala, turno, s.n, d).includes(n)) out.push(s.n);
  }
  return out;
}

/** Posto fixo: a pessoa ocupa o sítio todos os dias. Quem tem posto fixo fica
 *  isento de `diasSeguidos` — sem essa isenção o solver nunca fecha. */
export function ehPostoFixo(pessoaMap: Record<string, Pessoa>, n: string, sitio: string): boolean {
  const f = pessoaMap[n]?.fixo;
  return !!f && canon(f) === canon(sitio);
}

/** Alguém tem este sítio como posto fixo? Então o sítio é isento de `diasSeguidos`. */
export function sitioTemPostoFixo(equipe: Pessoa[], sitio: string): boolean {
  return equipe.some(p => p.fixo && canon(p.fixo) === canon(sitio));
}

export function sitioProibido(config: Config, n: string, sitio: string): boolean {
  return config.proibicoes.some(x => x.pessoa === n && canon(x.sitio) === canon(sitio));
}

/** Retorna a primeira dupla proibida presente na célula, ou null. */
export function duplaProibidaEm(config: Config, nomes: string[]): DuplaProibida | null {
  for (const [a, b] of config.duplasProibidas) {
    if (nomes.includes(a) && nomes.includes(b)) return [a, b];
  }
  return null;
}

/** Entrar com `n` nesta célula formaria uma dupla proibida? */
export function formariaDuplaProibida(config: Config, nomes: string[], n: string): boolean {
  return config.duplasProibidas.some(([a, b]) =>
    (n === a && nomes.includes(b)) || (n === b && nomes.includes(a)));
}

/** Quem entra só depois das 16h. */
export function pessoas16h(equipe: Pessoa[]): Pessoa[] {
  return equipe.filter(p => p.t === "noite");
}
