import type { LinhaSitio } from './montarConfig';
import type { Config, Escala } from './solver/types';
import { canon } from './solver/utils';

export type SitioSnapshot = LinhaSitio & {
  removido?: boolean;
  /** Ausente = fotografia antiga; null = não há linha neste turno. */
  linhas?: Record<'manha' | 'tarde', string | null>;
};
export const rotuloSitio = (s: LinhaSitio, t: 'manha' | 'tarde') => t === 'manha' ? s.nome : s.nome_tarde || s.nome;
export const linhaSitio = (s: SitioSnapshot, t: 'manha' | 'tarde') => s.linhas ? s.linhas[t] : rotuloSitio(s, t);
const turnos = ['manha', 'tarde'] as const;

/** Seleciona apenas os campos públicos da fotografia, sem metadados da unidade. */
export function fotografarSitios(linhas: SitioSnapshot[]): SitioSnapshot[] {
  return [...linhas].sort((a, b) => a.ordem - b.ordem).map(s => ({
    id: s.id, ordem: s.ordem, nome: s.nome, nome_tarde: s.nome_tarde,
    categoria_permitida: s.categoria_permitida, opcional: s.opcional,
    prioridade_dupla: s.prioridade_dupla, ...(s.linhas ? { linhas: { ...s.linhas } } : {}), ...(s.removido ? { removido: true } : {}),
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

/** Prefixo do ID local dado a uma linha de grade antiga que não casou com
 *  nenhum sítio do cadastro. Persiste na fotografia ao salvar. */
export const PREFIXO_LEGADO = 'legado:';

/** Forma canônica para casar grade antiga com o cadastro: ignora caixa,
 *  acentos e espaços repetidos, além das equivalências de `canon`. */
export const nomeCanonico = (s: string) =>
  canon(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Legado: reserva todos os nomes exatos antes de tentar canon, por turno.
 *  Nunca altera chaves nem conteúdo. Identidades desconhecidas não são
 *  casadas novamente por nome ao salvar: recebem um ID local persistente.
 *  A ordem segue o cadastro atual; linhas órfãs vêm no fim. */
export function inferirFotografia(grade: Escala, atuais: SitioSnapshot[]): SitioSnapshot[] {
  const linhas = new Map<string, SitioSnapshot>();
  for (const t of turnos) {
    const chaves = Object.keys(grade[t] || {});
    const usados = new Set<string>();
    const pares = new Map<string, SitioSnapshot>();
    // Só uma candidatura inequívoca pode consumir uma linha. Exatos têm
    // prioridade global sobre canon, independentemente da ordem das chaves.
    for (const exato of [true, false]) {
      const candidatos = new Map(chaves.filter(c => !pares.has(c)).map(chave => [chave,
        atuais.filter(s => !usados.has(s.id) && (exato
          ? rotuloSitio(s, t) === chave : nomeCanonico(rotuloSitio(s, t)) === nomeCanonico(chave))),
      ]));
      for (const [chave, lista] of candidatos) {
        if (lista.length !== 1) continue;
        const s = lista[0];
        if ([...candidatos.values()].filter(ls => ls.some(a => a.id === s.id)).length !== 1) continue;
        pares.set(chave, s); usados.add(s.id);
      }
    }
    for (const chave of chaves) {
      const s = pares.get(chave);
      const id = s?.id ?? `${PREFIXO_LEGADO}${chave}`;
      const linha: SitioSnapshot = linhas.get(id) ?? { ...(s ?? {
        id, nome: chave, nome_tarde: chave, categoria_permitida: 'ambos',
        opcional: true, prioridade_dupla: null, removido: true,
      }), ordem: 0, linhas: { manha: null, tarde: null } };
      linha.linhas![t] = chave;
      if (t === 'manha') linha.nome = chave;
      else linha.nome_tarde = chave;
      linhas.set(id, linha);
    }
  }
  const ordemAtual = new Map(atuais.map(s => [s.id, s.ordem]));
  const chegada = [...linhas.keys()];
  return [...linhas.values()]
    .sort((a, b) => (ordemAtual.get(a.id) ?? Infinity) - (ordemAtual.get(b.id) ?? Infinity)
      || chegada.indexOf(a.id) - chegada.indexOf(b.id))
    .map((s, ordem) => ({ ...s, ordem }));
}

/** Fotografia salva confrontada com o cadastro de agora: o sítio que sumiu do
 *  cadastro depois do salvamento passa a constar como removido. Não altera
 *  nomes, linhas nem ordem. */
export function marcarRemovidos(foto: SitioSnapshot[], atuais: SitioSnapshot[]): SitioSnapshot[] {
  const ids = new Set(atuais.map(s => s.id));
  return foto.map(s => s.removido || ids.has(s.id) ? s : { ...s, removido: true });
}

/** Por turno, cada linha da grade sem sítio vivo no cadastro e o motivo, para
 *  a tela e para o aviso. Com `atuais`, também detecta sítio apagado e nome
 *  de grade antiga que casa com mais de um sítio. */
export function linhasOrfas(grade: Escala, foto: SitioSnapshot[], atuais?: SitioSnapshot[]): Record<'manha' | 'tarde', Record<string, string>> {
  const ids = atuais && new Set(atuais.map(s => s.id));
  const r: Record<'manha' | 'tarde', Record<string, string>> = { manha: {}, tarde: {} };
  for (const t of turnos) for (const n of Object.keys(grade[t] || {})) {
    const s = foto.find(s => linhaSitio(s, t) === n);
    if (!s) r[t][n] = 'linha sem fotografia de sítio';
    else if (s.id.startsWith(PREFIXO_LEGADO)) {
      const iguais = (atuais ?? []).filter(a => turnos.some(u => nomeCanonico(rotuloSitio(a, u)) === nomeCanonico(n))).length;
      r[t][n] = iguais > 1
        ? `grade antiga: o nome casa com ${iguais} sítios do cadastro`
        : 'grade antiga: sem sítio correspondente no cadastro';
    } else if (s.removido || (ids && !ids.has(s.id))) r[t][n] = 'sítio excluído do cadastro';
  }
  return r;
}

/** Grade com fotografia: confronta com o cadastro de agora. Grade antiga
 *  (`sitios = NULL`): reconcilia os IDs pelo nome exato ou canônico; o que não
 *  casar vira linha órfã preservada, com aviso. */
export function fotografiaHistorica(historica: { grade: Escala; sitios?: SitioSnapshot[] | null }, atuais: SitioSnapshot[]) {
  return historica.sitios ? marcarRemovidos(historica.sitios, atuais) : inferirFotografia(historica.grade, atuais);
}

/** Aviso de tela com cada linha órfã e o motivo; null se não houver. */
export function avisoOrfaos(grade: Escala, sitios: SitioSnapshot[], atuais: SitioSnapshot[]): string | null {
  const r = linhasOrfas(grade, sitios, atuais);
  const motivos = new Map<string, string>();
  for (const t of turnos) for (const [n, m] of Object.entries(r[t])) if (!motivos.has(n)) motivos.set(n, m);
  return motivos.size
    ? `A grade salva usa sítios removidos ou sem correspondência inequívoca: ${[...motivos].map(([n, m]) => `${n} (${m})`).join(', ')} — confira as linhas preservadas antes de salvar.`
    : null;
}

export function orfaosDaGrade(grade: Escala, foto: SitioSnapshot[], atuais: SitioSnapshot[]): string[] {
  const r = linhasOrfas(grade, foto, atuais);
  return [...new Set(turnos.flatMap(t => Object.keys(r[t])))];
}

/** Somente salvar promove a fotografia para o cadastro atual. Não perde
 *  conteúdo em colisões (ex.: nome de um sítio excluído reutilizado). */
export function atualizarFotografia(grade: Escala, foto: SitioSnapshot[], atuais: SitioSnapshot[], dias: string[]) {
  const snapshot = fotografarSitios(atuais);
  for (const s of foto) if (!atuais.some(a => a.id === s.id)) snapshot.push({ ...s, ordem: Math.max(-1, ...snapshot.map(l => l.ordem)) + 1, removido: true });
  for (const s of snapshot) s.linhas = { manha: null, tarde: null };
  const nova: Escala = { manha: {}, tarde: {} };
  for (const t of turnos) {
    const consumidas = new Set<string>();
    for (const s of snapshot) {
      const antes = foto.find(a => a.id === s.id);
      const origem = antes && linhaSitio(antes, t);
      if (s.removido && (!origem || !Object.prototype.hasOwnProperty.call(grade[t], origem))) continue;
      const nome = rotuloSitio(s, t);
      if (Object.prototype.hasOwnProperty.call(nova[t], nome)) throw new Error(`Sítios diferentes usam o nome "${nome}" (${t}). Renomeie o sítio atual antes de salvar; nenhuma linha foi apagada.`);
      s.linhas![t] = nome;
      nova[t][nome] = origem && Object.prototype.hasOwnProperty.call(grade[t], origem) ? grade[t][origem].map(d => [...d]) : dias.map(() => []);
      if (origem && Object.prototype.hasOwnProperty.call(grade[t], origem)) {
        if (consumidas.has(origem)) throw new Error(`A linha "${origem}" (${t}) pertence a mais de um sítio. A grade não foi salva.`);
        consumidas.add(origem);
      }
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
      const n = linhaSitio(s, t);
      if (n !== null && Object.prototype.hasOwnProperty.call(grade[t], n)) ordenada[t][n] = grade[t][n];
    }
    for (const n of Object.keys(grade[t])) ordenada[t][n] = grade[t][n];
  }
  return ordenada;
}

/** A mesma cobertura na abertura e após salvar, inclusive sítios removidos.
 * Uma linha sem fotografia impede anunciar uma conferência completa. */
export function configDaFotografia(config: Config, grade: Escala, foto: SitioSnapshot[]): Config {
  const sitios: Config['sitios'] = { manha: [], tarde: [] };
  for (const t of turnos) {
    for (const s of [...foto].sort((a, b) => a.ordem - b.ordem)) {
      const n = linhaSitio(s, t);
      if (n === null || !Object.prototype.hasOwnProperty.call(grade[t], n)) continue;
      if (sitios[t].some(l => l.n === n)) throw new Error(`Conferência incompleta: linha "${n}" (${t}) associada a mais de um sítio.`);
      sitios[t].push({ n, quem: s.categoria_permitida, opcional: s.opcional });
    }
    for (const n of Object.keys(grade[t])) {
      if (!sitios[t].some(s => s.n === n)) throw new Error(`Conferência incompleta: linha "${n}" (${t}) sem fotografia.`);
    }
  }
  return { ...config, sitios, sitiosTec: [...new Set(foto.filter(s => s.categoria_permitida === 'tec')
    .flatMap(s => turnos.flatMap(t => linhaSitio(s, t) ?? [])))] };
}
