import {
  Config, Pessoa, Sitio, Regras, RegraConfig, Proibicao, DuplaProibida,
  ColocacaoFixa, ColocacaoFixaNaoAcoes, Categoria, Turno,
} from './solver/types';
import { defaultConfig, REGRAS_DEFAULT } from './solver/defaultConfig';
import { indexarRotulos } from './referenciasSitio';

/** Linhas das tabelas da unidade, como o PostgREST devolve. Sítio é
 *  referenciado por id: `equipe.fixo_sitio_id`, `proibicoes.sitio_id`,
 *  `colocacoes_fixas.sitio_id`. */
export interface LinhasUnidade {
  equipe: any[];
  sitios: LinhaSitio[];
  regras: any[];
  proibicoes: any[];
  duplas: any[];
  fixas: any[];
}

export type LinhaSitio = {
  id: string; ordem: number; nome: string; nome_tarde: string | null;
  categoria_permitida: 'enf' | 'tec' | 'ambos';
  opcional: boolean; prioridade_dupla: number | null;
};

const DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const TURNO = { manha: 'manhã', tarde: 'tarde' } as Record<string, string>;

/** Monta as duas listas de sítios (manhã/tarde) a partir das linhas da unidade.
 *  `nome_tarde` faz o sítio mudar de rótulo à tarde sendo o MESMO sítio para as
 *  regras — é o que `canon()` normaliza do outro lado. */
function montarSitios(linhas: LinhaSitio[]): { manha: Sitio[]; tarde: Sitio[]; prioridadeDupla: string[] } {
  const ordenadas = [...linhas].sort((a, b) => a.ordem - b.ordem);
  const manha: Sitio[] = ordenadas.map(l => ({
    n: l.nome, quem: l.categoria_permitida, opcional: l.opcional,
  }));
  const tarde: Sitio[] = ordenadas.map(l => ({
    n: l.nome_tarde || l.nome, quem: l.categoria_permitida, opcional: l.opcional,
  }));
  const prioridadeDupla = ordenadas
    .filter(l => l.prioridade_dupla != null)
    .sort((a, b) => (a.prioridade_dupla! - b.prioridade_dupla!))
    .map(l => l.nome_tarde || l.nome);
  return { manha, tarde, prioridadeDupla };
}

/** As linhas de `regras_config` ligam/desligam cada regra. Chaves desconhecidas
 *  são ignoradas com aviso — nunca silenciosamente. */
function montarRegras(linhas: any[], avisos: string[]): Regras {
  const regras: Regras = JSON.parse(JSON.stringify(REGRAS_DEFAULT));
  const conhecidas = new Set(Object.keys(regras));
  for (const l of linhas) {
    if (!conhecidas.has(l.chave)) {
      avisos.push(`Regra "${l.chave}" existe no banco mas o motor não a conhece — ignorada.`);
      continue;
    }
    const alvo = regras[l.chave as keyof Regras] as RegraConfig;
    alvo.on = !!l.ativa;
    alvo.hard = !!l.rigida;
    if (l.descricao) alvo.txt = l.descricao;
  }
  const desligadas = Object.entries(regras).filter(([, r]) => !(r as RegraConfig).on).map(([k]) => k);
  if (desligadas.length)
    avisos.push(`Regras desligadas nesta grade: ${desligadas.join(', ')}.`);
  return regras;
}

/** Linha da Equipe → Pessoa, com nome para casar a planilha e posto por ID. */
export function pessoaDaLinha(p: any, rotulo: ReturnType<typeof indexarRotulos>): Pessoa {
  const fixo = p.fixo_sitio_id ? rotulo(p.fixo_sitio_id, 'manha') : null;
  const fixoTarde = p.fixo_sitio_id ? rotulo(p.fixo_sitio_id, 'tarde') : null;
  return {
    n: p.nome_curto,
    c: p.categoria as Categoria,
    t: p.turno_base as Turno,
    fixo: fixo || undefined,
    fixoTarde: fixo && fixoTarde && fixoTarde !== fixo ? fixoTarde : undefined,
    isentoAcoes: p.isento_acoes || undefined,
    custoExtra: Number(p.custo_extra) || undefined,
    completo: p.nome || undefined,
  };
}

/**
 * Linhas da unidade -> `Config` do solver. Lógica pura (sem Supabase), para
 * ser testada sem `.env`.
 *
 * Regras e pessoas apontam para o sítio por id (FK); o solver trabalha por
 * nome. Aqui o id vira o nome ATUAL, no rótulo de cada turno — renomear um
 * sítio não deixa nada órfão. Um id que não resolve (sítio fora do que foi
 * lido) vira aviso na tela, nunca é descartado em silêncio.
 */
export function montarConfig(l: LinhasUnidade): { config: Config; avisos: string[] } {
  const avisos: string[] = [];
  const rotulo = indexarRotulos(l.sitios);
  const porId = new Map(l.equipe.map(p => [p.id, p]));
  const pessoa = (id: string, regra: string): string | null => {
    const p = porId.get(id);
    if (p && p.ativo !== false) return p.nome_curto;
    avisos.push(`${regra}: ${p ? `pessoa inativa (${p.nome_curto})` : 'pessoa não encontrada na equipe desta unidade'} — regra ignorada. Confira a pessoa em Regras e Equipe.`);
    return null;
  };
  const quando = (x: any) => `${porId.get(x.pessoa_id)?.nome_curto ?? 'Pessoa não encontrada'} (${DIAS[x.dia] ?? `dia ${x.dia}`}, ${TURNO[x.turno] ?? x.turno})`;

  // Posto fixo vale nos dois turnos: guarda o rótulo de cada um, porque o
  // sítio pode ter outro nome à tarde.
  const postosOrfaos: string[] = [];
  const equipe: Pessoa[] = l.equipe.filter(p => p.ativo !== false).map((p: any) => {
    const pessoa = pessoaDaLinha(p, rotulo);
    if (p.fixo_sitio_id && !pessoa.fixo) postosOrfaos.push(p.nome_curto);
    return pessoa;
  });
  if (postosOrfaos.length)
    avisos.push(`Posto fixo aponta para sítio que não foi encontrado nesta unidade: ${postosOrfaos.join(', ')} — escalada(s) como se não tivessem posto fixo. Confira o sítio fixo em Equipe.`);

  const { manha, tarde, prioridadeDupla } = montarSitios(l.sitios);

  // Ações é o sítio misto; sem ele o solver não tem para onde mandar a
  // regra "1x por semana em Ações".
  const acoesSitio = l.sitios.find(s => s.categoria_permitida === 'ambos');
  if (!acoesSitio) avisos.push('Nenhum sítio aceita as duas categorias — a regra de Ações não vai funcionar.');
  const acoes = acoesSitio?.nome || defaultConfig.acoes;

  const sitiosTec = l.sitios
    .filter(s => s.categoria_permitida === 'tec')
    .flatMap(s => s.nome_tarde ? [s.nome, s.nome_tarde] : [s.nome]);

  // Proibição vale para o sítio inteiro: entra com os dois rótulos (manhã e
  // tarde), senão um sítio com `nome_tarde` escaparia à tarde.
  const proibicoesOrfas: string[] = [];
  const proibicoes: Proibicao[] = l.proibicoes.flatMap((x: any) => {
    const nome = pessoa(x.pessoa_id, 'Proibição');
    if (!nome) return [];
    const manhaN = rotulo(x.sitio_id, 'manha'), tardeN = rotulo(x.sitio_id, 'tarde');
    if (!manhaN || !tardeN) { proibicoesOrfas.push(nome); return []; }
    return [...new Set([manhaN, tardeN])].map(sitio => ({ pessoa: nome, sitio }));
  });
  if (proibicoesOrfas.length)
    avisos.push(`Proibições apontam para sítio que não foi encontrado nesta unidade: ${proibicoesOrfas.join(', ')} — foram ignoradas. Confira o sítio em Regras.`);

  const duplasProibidas: DuplaProibida[] = l.duplas.flatMap((x: any) => {
    const a = pessoa(x.pessoa_a_id, 'Dupla proibida (primeira pessoa)');
    const b = pessoa(x.pessoa_b_id, 'Dupla proibida (segunda pessoa)');
    return a && b ? [[a, b] as DuplaProibida] : [];
  });

  const fixasOrfas: string[] = [];
  const fixas: ColocacaoFixa[] = l.fixas
    .filter((x: any) => x.tipo === 'fixa_sitio')
    .flatMap((x: any) => {
      const nome = pessoa(x.pessoa_id, `Colocação fixa (${quando(x)})`);
      if (!nome) return [];
      const s = rotulo(x.sitio_id, x.turno);
      if (!s) { fixasOrfas.push(quando(x)); return []; }
      return [{ p: nome, d: x.dia, t: x.turno, s }];
    });
  if (fixasOrfas.length)
    avisos.push(`Colocações fixas apontam para sítio que não foi encontrado nesta unidade (${fixasOrfas.length} regra${fixasOrfas.length > 1 ? 's' : ''}): ${fixasOrfas.join(', ')} — foram ignoradas. Confira o sítio em Regras.`);

  const fixasNaoAcoes: ColocacaoFixaNaoAcoes[] = l.fixas
    .filter((x: any) => x.tipo === 'fora_do')
    .flatMap((x: any) => {
      const nome = pessoa(x.pessoa_id, `Fora das Ações (${quando(x)})`);
      return nome ? [{ p: nome, d: x.dia, t: x.turno }] : [];
    });

  const regras = montarRegras(l.regras, avisos);

  // Uma fixa apontando para quem não está na equipe nunca fecha, e a
  // violação sai como se a pessoa tivesse sido esquecida.
  const nomes = new Set(equipe.map(p => p.n));
  const orfas = [...fixas.map(f => f.p), ...fixasNaoAcoes.map(f => f.p),
                 ...proibicoes.map(p => p.pessoa), ...duplasProibidas.flat()]
    .filter(n => !nomes.has(n));
  if (orfas.length)
    avisos.push(`Regras apontam para quem não está na equipe ativa: ${[...new Set(orfas)].join(', ')}.`);

  return {
    avisos,
    config: {
      ...defaultConfig,
      equipe,
      acoes,
      sitios: { manha, tarde },
      sitiosTec,
      prioridadeDupla: prioridadeDupla.length ? prioridadeDupla : defaultConfig.prioridadeDupla,
      proibicoes,
      duplasProibidas,
      fixas,
      fixasNaoAcoes,
      regras,
    },
  };
}
