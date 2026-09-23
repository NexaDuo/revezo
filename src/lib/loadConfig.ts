import { supabase } from './supabase';
import { Config } from './solver/types';
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
  unidadeId: string | null
): Promise<ConfigCarregada> {
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

    const { config, avisos } = montarConfig({
      equipe: eq.data,
      sitios: st.data as LinhaSitio[],
      regras: rg.data || [],
      proibicoes: pr.data || [],
      duplas: dp.data || [],
      fixas: cf.data || [],
    });
    return { doBanco: true, avisos, config };
  } catch (e: any) {
    return {
      config: defaultConfig,
      doBanco: false,
      avisos: [`Falha ao ler a configuração da unidade (${e?.message || e}): geração bloqueada.`],
    };
  }
}
