import { supabase } from './supabase';
import {
  Config, Pessoa, Sitio, Regras, RegraConfig, Proibicao, DuplaProibida,
  ColocacaoFixa, ColocacaoFixaNaoAcoes, Categoria, Turno,
} from './solver/types';
import { defaultConfig, REGRAS_DEFAULT } from './solver/defaultConfig';

/** O que foi carregado do banco e o que o produto não sabe. */
export interface ConfigCarregada {
  config: Config;
  avisos: string[];
  /** true = veio do Supabase; false = caiu no defaultConfig do caso-origem. */
  doBanco: boolean;
}

type LinhaSitio = {
  ordem: number; nome: string; nome_tarde: string | null;
  categoria_permitida: 'enf' | 'tec' | 'ambos';
  opcional: boolean; prioridade_dupla: number | null;
};

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

/**
 * Carrega a configuração do solver da unidade recebida explicitamente (vem do
 * `WorkContext`, nunca inferida aqui). Se o Supabase não estiver configurado,
 * a unidade não for resolvível ou não tiver dados, devolve o `defaultConfig`
 * do caso-origem — sempre com aviso, porque gerar escala com a equipe errada
 * é exatamente a falha silenciosa que o produto não pode ter.
 */
export async function carregarConfigUnidade(
  isSupabaseConfigured: boolean,
  unidadeId: string | null
): Promise<ConfigCarregada> {
  const avisos: string[] = [];

  if (!isSupabaseConfigured) {
    return {
      config: defaultConfig,
      doBanco: false,
      avisos: ['Supabase não configurado: usando a configuração de demonstração do caso-origem.'],
    };
  }

  if (!unidadeId) {
    return {
      config: defaultConfig,
      doBanco: false,
      avisos: ['Nenhuma unidade selecionada: usando a configuração de demonstração do caso-origem.'],
    };
  }

  try {
    const [eq, st, rg, pr, dp, cf] = await Promise.all([
      supabase.from('equipe').select('*').eq('unidade_id', unidadeId).eq('ativo', true).order('ordem'),
      supabase.from('sitios').select('*').eq('unidade_id', unidadeId).order('ordem'),
      supabase.from('regras_config').select('*').eq('unidade_id', unidadeId).order('ordem'),
      supabase.from('proibicoes').select('*').eq('unidade_id', unidadeId),
      supabase.from('duplas_proibidas').select('*').eq('unidade_id', unidadeId),
      supabase.from('colocacoes_fixas').select('*').eq('unidade_id', unidadeId),
    ]);

    const erro = [eq, st, rg, pr, dp, cf].find(r => r.error)?.error;
    if (erro) throw erro;

    if (!eq.data?.length || !st.data?.length) {
      return {
        config: defaultConfig,
        doBanco: false,
        avisos: ['A unidade não tem equipe ou sítios cadastrados: usando a configuração de demonstração.'],
      };
    }

    const equipe: Pessoa[] = eq.data.map((p: any) => ({
      n: p.nome_curto,
      c: p.categoria as Categoria,
      t: p.turno_base as Turno,
      fixo: p.fixo_sitio || undefined,
      isentoAcoes: p.isento_acoes || undefined,
      custoExtra: Number(p.custo_extra) || undefined,
    }));

    const { manha, tarde, prioridadeDupla } = montarSitios(st.data as LinhaSitio[]);

    // Ações é o sítio misto; sem ele o solver não tem para onde mandar a
    // regra "1x por semana em Ações".
    const acoesSitio = (st.data as LinhaSitio[]).find(l => l.categoria_permitida === 'ambos');
    if (!acoesSitio) avisos.push('Nenhum sítio aceita as duas categorias — a regra de Ações não vai funcionar.');
    const acoes = acoesSitio?.nome || defaultConfig.acoes;

    const sitiosTec = (st.data as LinhaSitio[])
      .filter(l => l.categoria_permitida === 'tec')
      .map(l => l.nome);

    const proibicoes: Proibicao[] = (pr.data || []).map((x: any) => ({
      pessoa: x.pessoa_curto, sitio: x.sitio_nome,
    }));

    const duplasProibidas: DuplaProibida[] = (dp.data || []).map((x: any) => [x.pessoa_a, x.pessoa_b]);

    const fixas: ColocacaoFixa[] = (cf.data || [])
      .filter((x: any) => x.tipo === 'fixa_sitio')
      .map((x: any) => ({ p: x.pessoa_curto, d: x.dia, t: x.turno, s: x.sitio_nome }));

    const fixasNaoAcoes: ColocacaoFixaNaoAcoes[] = (cf.data || [])
      .filter((x: any) => x.tipo === 'fora_do')
      .map((x: any) => ({ p: x.pessoa_curto, d: x.dia, t: x.turno }));

    const regras = montarRegras(rg.data || [], avisos);

    // Uma fixa apontando para quem não está na equipe nunca fecha, e a
    // violação sai como se a pessoa tivesse sido esquecida.
    const nomes = new Set(equipe.map(p => p.n));
    const orfas = [...fixas.map(f => f.p), ...fixasNaoAcoes.map(f => f.p),
                   ...proibicoes.map(p => p.pessoa), ...duplasProibidas.flat()]
      .filter(n => !nomes.has(n));
    if (orfas.length)
      avisos.push(`Regras apontam para quem não está na equipe ativa: ${[...new Set(orfas)].join(', ')}.`);

    return {
      doBanco: true,
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
  } catch (e: any) {
    return {
      config: defaultConfig,
      doBanco: false,
      avisos: [`Falha ao ler a configuração da unidade (${e?.message || e}): usando a demonstração.`],
    };
  }
}
