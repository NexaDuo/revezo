import { supabase } from './supabase';
import {
  Config, Pessoa, Sitio, Regras, RegraConfig, Proibicao, DuplaProibida,
  ColocacaoFixa, ColocacaoFixaNaoAcoes, Categoria, Turno,
} from './solver/types';
import { defaultConfig, REGRAS_DEFAULT } from './solver/defaultConfig';
import { indexarRotulos, listarOrfas } from './referenciasSitio';

/** O que foi carregado do banco e o que o produto não sabe. */
export interface ConfigCarregada {
  config: Config;
  avisos: string[];
  /** true = veio do Supabase; false = caiu no defaultConfig do caso-origem. */
  doBanco: boolean;
}

type LinhaSitio = {
  id: string; ordem: number; nome: string; nome_tarde: string | null;
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
        avisos: ['A unidade não tem equipe ou sítios cadastrados: geração bloqueada.'],
      };
    }

    // Regras e pessoas apontam para o sítio por id (FK); o solver trabalha por
    // nome. Resolver aqui para o nome ATUAL, no rótulo do turno — renomear um
    // sítio não deixa nada órfão. Um id que não resolve (sítio fora do que foi
    // lido) é avisado na tela, nunca descartado em silêncio.
    const rotulo = indexarRotulos(st.data as LinhaSitio[]);

    const postosOrfaos: string[] = [];
    const equipe: Pessoa[] = eq.data.map((p: any) => {
      const fixo = p.fixo_sitio_id ? rotulo(p.fixo_sitio_id, 'manha') : null;
      if (p.fixo_sitio_id && !fixo) postosOrfaos.push(p.nome_curto);
      return {
        n: p.nome_curto,
        c: p.categoria as Categoria,
        t: p.turno_base as Turno,
        fixo: fixo || undefined,
        isentoAcoes: p.isento_acoes || undefined,
        custoExtra: Number(p.custo_extra) || undefined,
      };
    });
    if (postosOrfaos.length)
      avisos.push(`Posto fixo aponta para sítio que não foi encontrado nesta unidade: ${postosOrfaos.join(', ')} — escalada(s) como se não tivessem posto fixo. Confira o sítio fixo em Equipe.`);

    const { manha, tarde, prioridadeDupla } = montarSitios(st.data as LinhaSitio[]);

    // Ações é o sítio misto; sem ele o solver não tem para onde mandar a
    // regra "1x por semana em Ações".
    const acoesSitio = (st.data as LinhaSitio[]).find(l => l.categoria_permitida === 'ambos');
    if (!acoesSitio) avisos.push('Nenhum sítio aceita as duas categorias — a regra de Ações não vai funcionar.');
    const acoes = acoesSitio?.nome || defaultConfig.acoes;

    const sitiosTec = (st.data as LinhaSitio[])
      .filter(l => l.categoria_permitida === 'tec')
      .flatMap(l => l.nome_tarde ? [l.nome, l.nome_tarde] : [l.nome]);

    // Proibição vale para o sítio inteiro: entra com os dois rótulos (manhã e
    // tarde), senão um sítio com `nome_tarde` escaparia à tarde.
    const proibicoesOrfas: string[] = [];
    const proibicoes: Proibicao[] = (pr.data || []).flatMap((x: any) => {
      const manhaN = rotulo(x.sitio_id, 'manha'), tardeN = rotulo(x.sitio_id, 'tarde');
      if (!manhaN || !tardeN) { proibicoesOrfas.push(String(x.sitio_id)); return []; }
      return [...new Set([manhaN, tardeN])].map(sitio => ({ pessoa: x.pessoa_curto, sitio }));
    });
    if (proibicoesOrfas.length)
      avisos.push(`Proibições apontam para sítio que não foi encontrado nesta unidade: ${listarOrfas(proibicoesOrfas)} — foram ignoradas. Confira o sítio em Regras.`);

    const duplasProibidas: DuplaProibida[] = (dp.data || []).map((x: any) => [x.pessoa_a, x.pessoa_b]);

    const fixasOrfas: string[] = [];
    const fixas: ColocacaoFixa[] = (cf.data || [])
      .filter((x: any) => x.tipo === 'fixa_sitio')
      .flatMap((x: any) => {
        const s = rotulo(x.sitio_id, x.turno);
        if (!s) { fixasOrfas.push(String(x.sitio_id)); return []; }
        return [{ p: x.pessoa_curto, d: x.dia, t: x.turno, s }];
      });
    if (fixasOrfas.length)
      avisos.push(`Colocações fixas apontam para sítio que não foi encontrado nesta unidade: ${listarOrfas(fixasOrfas)} — foram ignoradas. Confira o sítio em Regras.`);

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
      avisos: [`Falha ao ler a configuração da unidade (${e?.message || e}): geração bloqueada.`],
    };
  }
}
