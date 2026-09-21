import { Config, Pessoa, Escala } from "./types";

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

export function ondeEsteve(escala: Escala, config: Config, n: string, d: number, turno: "manha" | "tarde"): string[] {
  const out: string[] = [];
  for (const s of config.sitios[turno]) {
    if ((escala[turno][s.n][d] || []).includes(n)) out.push(s.n);
  }
  return out;
}
