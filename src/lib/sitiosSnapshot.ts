import type { LinhaSitio } from './montarConfig';
import type { Config, Escala } from './solver/types';
import { canon } from './solver/utils';

export type SitioSnapshot = LinhaSitio & { removido?: boolean };
export const rotuloSitio = (s: LinhaSitio, t: 'manha' | 'tarde') => t === 'manha' ? s.nome : s.nome_tarde || s.nome;
const turnos = ['manha', 'tarde'] as const;

/** Seleciona apenas os campos públicos da fotografia, sem metadados da unidade. */
export function fotografarSitios(linhas: SitioSnapshot[]): SitioSnapshot[] {
  return [...linhas].sort((a, b) => a.ordem - b.ordem).map(s => ({
    id: s.id, ordem: s.ordem, nome: s.nome, nome_tarde: s.nome_tarde,
    categoria_permitida: s.categoria_permitida, opcional: s.opcional,
    prioridade_dupla: s.prioridade_dupla, ...(s.removido ? { removido: true } : {}),
  }));
}

export function sitiosDemo(config: Config): SitioSnapshot[] {
  return config.sitios.manha.map((s, i) => ({
    id: `demo-sitio-${i}`, ordem: i, nome: s.n, nome_tarde: config.sitios.tarde[i]?.n || null,
    categoria_permitida: s.quem, opcional: !!s.opcional,
    prioridade_dupla: config.prioridadeDupla.indexOf(config.sitios.tarde[i]?.n) < 0
      ? null : config.prioridadeDupla.indexOf(config.sitios.tarde[i]?.n),
  }));
}

/** Legado: reserva todos os nomes exatos antes de tentar canon, por turno.
 *  Nunca altera chaves, ordem ou conteúdo. Identidades desconhecidas não são
 *  casadas novamente por nome ao salvar: recebem um ID local persistente. */
export function inferirFotografia(grade: Escala, atuais: SitioSnapshot[]): SitioSnapshot[] {
  const linhas = new Map<string, SitioSnapshot>();
  for (const t of turnos) {
    const chaves = Object.keys(grade[t] || {});
    const usados = new Set<string>();
    const pares = new Map<string, SitioSnapshot>();
    for (const chave of chaves) {
      const s = atuais.find(s => !usados.has(s.id) && rotuloSitio(s, t) === chave);
      if (s) { pares.set(chave, s); usados.add(s.id); }
    }
    for (const chave of chaves) {
      const s = pares.get(chave) ?? atuais.find(s => !usados.has(s.id) && canon(rotuloSitio(s, t)) === canon(chave));
      if (s) usados.add(s.id);
      const id = s?.id ?? `legado:${chave}`;
      const linha = linhas.get(id) ?? { ...(s ?? {
        id, categoria_permitida: 'ambos', opcional: true, prioridade_dupla: null, removido: true,
      }), ordem: linhas.size, nome: chave, nome_tarde: chave };
      if (t === 'manha') linha.nome = chave;
      else linha.nome_tarde = chave;
      linhas.set(id, linha);
    }
  }
  return [...linhas.values()];
}

export function orfaosDaGrade(grade: Escala, foto: SitioSnapshot[], atuais: SitioSnapshot[]): string[] {
  const ids = new Set(atuais.map(s => s.id));
  return [...new Set(turnos.flatMap(t => Object.keys(grade[t] || {}).filter(n => {
    const s = foto.find(s => rotuloSitio(s, t) === n);
    return !s || s.removido || !ids.has(s.id);
  })))];
}

/** Somente salvar promove a fotografia para o cadastro atual. Não perde
 *  conteúdo em colisões (ex.: nome de um sítio excluído reutilizado). */
export function atualizarFotografia(grade: Escala, foto: SitioSnapshot[], atuais: SitioSnapshot[], dias: string[]) {
  const snapshot = fotografarSitios(atuais);
  for (const s of foto) if (!atuais.some(a => a.id === s.id)) snapshot.push({ ...s, ordem: Math.max(-1, ...snapshot.map(l => l.ordem)) + 1, removido: true });
  const nova: Escala = { manha: {}, tarde: {} };
  for (const t of turnos) {
    const consumidas = new Set<string>();
    for (const s of snapshot) {
      const antes = foto.find(a => a.id === s.id);
      const origem = antes && rotuloSitio(antes, t);
      if (s.removido && (!origem || !Object.prototype.hasOwnProperty.call(grade[t], origem))) continue;
      const nome = rotuloSitio(s, t);
      if (Object.prototype.hasOwnProperty.call(nova[t], nome)) throw new Error(`Sítios diferentes usam o nome "${nome}" (${t}). Renomeie o sítio atual antes de salvar; nenhuma linha foi apagada.`);
      nova[t][nome] = origem && Object.prototype.hasOwnProperty.call(grade[t], origem) ? grade[t][origem].map(d => [...d]) : dias.map(() => []);
      if (origem) consumidas.add(origem);
    }
    for (const nome of Object.keys(grade[t])) if (!consumidas.has(nome)) {
      throw new Error(`A linha "${nome}" não consta da fotografia dos sítios. A grade não foi salva.`);
    }
  }
  return { grade: nova, sitios: snapshot };
}

/** JSONB não preserva a ordem das chaves do objeto; a ordem histórica está
 *  na fotografia. Percorre só as linhas existentes, sem criar ou renomear. */
export function ordenarGradeFotografada(grade: Escala, foto?: SitioSnapshot[] | null): Escala {
  if (!foto) return grade;
  const ordenada: Escala = { manha: {}, tarde: {} };
  for (const t of turnos) {
    for (const s of [...foto].sort((a, b) => a.ordem - b.ordem)) {
      const n = rotuloSitio(s, t);
      if (Object.prototype.hasOwnProperty.call(grade[t], n)) ordenada[t][n] = grade[t][n];
    }
    for (const n of Object.keys(grade[t])) ordenada[t][n] = grade[t][n];
  }
  return ordenada;
}
