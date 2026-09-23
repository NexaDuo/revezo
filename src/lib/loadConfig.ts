import { fotografarSitios, inferirFotografia, orfaosDaGrade, sitiosDemo, rotuloSitio, type SitioSnapshot } from './sitiosSnapshot';
import { supabase } from './supabase';
import { Config, Escala } from './solver/types';
import { defaultConfig } from './solver/defaultConfig';
import { montarConfig, LinhaSitio } from './montarConfig';

// Compatibilidade com o importador; o mapeamento permanece puro.
export { pessoaDaLinha } from './montarConfig';

/** O que foi carregado do banco e o que o produto não sabe. */
export interface ConfigCarregada {
  config: Config;
  avisos: string[];
  /** true = veio do Supabase; false = caiu no defaultConfig do caso-origem. */
  doBanco: boolean;
  sitios: SitioSnapshot[];
  atuais: SitioSnapshot[];
}

/**
 * Carrega a configuração do solver da unidade recebida explicitamente (vem do
 * `WorkContext`, nunca inferida aqui). Se o Supabase não estiver configurado,
 * a unidade não for resolvível ou não tiver dados, devolve o `defaultConfig`
 * do caso-origem — sempre com aviso, porque gerar escala com a equipe errada
 * é exatamente a falha silenciosa que o produto não pode ter.
 *
 * Aqui só a leitura; linhas -> Config é `montarConfig` (puro, testável sem `.env`).
 */
export async function carregarConfigUnidade(
  isSupabaseConfigured: boolean,
  unidadeId: string | null,
  historica?: { grade: Escala; sitios?: SitioSnapshot[] | null },
  permitirCadastroVazio = false
): Promise<ConfigCarregada> {
  if (!isSupabaseConfigured) {
    const atuais = sitiosDemo(defaultConfig);
    const sitios = historica ? historica.sitios ?? inferirFotografia(historica.grade, atuais) : atuais;
    const avisos = ['Supabase não configurado: usando a configuração de demonstração do caso-origem.'];
    let config = defaultConfig;
    if (historica) {
      const nome = (n: string, t: 'manha' | 'tarde' = 'manha') => {
        const id = atuais.find(s => rotuloSitio(s, t) === n)?.id;
        const s = sitios.find(s => s.id === id);
        if (!s) avisos.push(`Regra aponta para sítio fora da fotografia: ${n}.`);
        return s ? rotuloSitio(s, t) : n;
      };
      const estrutura = montarConfig({ equipe: [], sitios, regras: [], proibicoes: [], duplas: [], fixas: [] }).config;
      config = { ...defaultConfig, sitios: estrutura.sitios, sitiosTec: estrutura.sitiosTec,
        acoes: estrutura.acoes, prioridadeDupla: estrutura.prioridadeDupla,
        equipe: defaultConfig.equipe.map(p => ({ ...p, fixo: p.fixo && nome(p.fixo), fixoTarde: p.fixo && nome(p.fixoTarde || p.fixo, 'tarde') })),
        fixas: defaultConfig.fixas.map(f => ({ ...f, s: nome(f.s, f.t) })),
        proibicoes: defaultConfig.proibicoes.map(p => ({ ...p, sitio: nome(p.sitio) })),
      };
      limitarConferencia(config, historica.grade, sitios);
      avisarOrfaos(avisos, historica.grade, sitios, atuais);
    }
    return { config, doBanco: false, avisos, sitios, atuais };
  }

  if (!unidadeId) {
    return {
      config: defaultConfig,
      doBanco: false, sitios: sitiosDemo(defaultConfig), atuais: sitiosDemo(defaultConfig),
      avisos: ['Nenhuma unidade selecionada: usando a configuração de demonstração do caso-origem.'],
    };
  }

  try {
    const [eq, st, rg, pr, dp, cf] = await Promise.all([
      supabase.from('equipe').select('*').eq('unidade_id', unidadeId).order('ordem'),
      supabase.from('sitios').select('*').eq('unidade_id', unidadeId).order('ordem'),
      supabase.from('regras_config').select('*').eq('unidade_id', unidadeId).order('ordem'),
      supabase.from('proibicoes').select('*').eq('unidade_id', unidadeId),
      supabase.from('duplas_proibidas').select('*').eq('unidade_id', unidadeId),
      supabase.from('colocacoes_fixas').select('*').eq('unidade_id', unidadeId),
    ]);

    const erro = [eq, st, rg, pr, dp, cf].find(r => r.error)?.error;
    if (erro) throw erro;

    if (!historica && !permitirCadastroVazio && (!eq.data?.some(p => p.ativo) || !st.data?.length)) {
      return {
        config: defaultConfig,
        doBanco: false, sitios: sitiosDemo(defaultConfig), atuais: sitiosDemo(defaultConfig),
        avisos: ['A unidade não tem equipe ou sítios cadastrados: geração bloqueada.'],
      };
    }

    const atuais = fotografarSitios(st.data as LinhaSitio[]);
    const sitios = historica ? historica.sitios ?? inferirFotografia(historica.grade, atuais) : atuais;
    const { config, avisos } = montarConfig({
      equipe: eq.data || [],
      sitios,
      regras: rg.data || [],
      proibicoes: pr.data || [],
      duplas: dp.data || [],
      fixas: cf.data || [],
    });
    if (historica) {
      limitarConferencia(config, historica.grade, sitios);
      avisarOrfaos(avisos, historica.grade, sitios, atuais);
    }
    return { doBanco: true, avisos, config, sitios, atuais };
  } catch (e: any) {
    return {
      config: defaultConfig,
      doBanco: false, sitios: sitiosDemo(defaultConfig), atuais: sitiosDemo(defaultConfig),
      avisos: [`Falha ao ler a configuração da unidade (${e?.message || e}): geração bloqueada.`],
    };
  }
}

function limitarConferencia(config: Config, grade: Escala, sitios: SitioSnapshot[]) {
  for (const t of ['manha', 'tarde'] as const) {
    config.sitios[t] = config.sitios[t].filter(s => Object.prototype.hasOwnProperty.call(grade[t], s.n)
      && !sitios.some(l => l.id.startsWith('legado:') && rotuloSitio(l, t) === s.n));
  }
}

export function avisarOrfaos(avisos: string[], grade: Escala, sitios: SitioSnapshot[], atuais: SitioSnapshot[]) {
  const orfaos = orfaosDaGrade(grade, sitios, atuais);
  if (orfaos.length) avisos.push(`A grade salva usa sítios que não existem mais: ${orfaos.join(', ')} — confira as linhas preservadas antes de salvar.`);
}
