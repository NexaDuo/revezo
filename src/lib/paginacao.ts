import { supabase, isSupabaseConfigured } from './supabase';
import { exigirUnidade, getEquipes } from './db';
export const TAMANHO_PAGINA = 10;
export interface Pagina<T> { linhas: T[]; total: number }
export interface FiltroPagina {
  pagina: number; busca: string; colunasBusca?: string[]; ordem?: string; crescente?: boolean;
  /** Colunas UUID cuja busca deve usar o nome curto atual da equipe. */
  colunasPessoa?: string[];
  /** Critérios extras depois de `ordem`, antes do desempate final por id. */
  desempate?: { coluna: string; crescente: boolean }[];
  /** Select para o PostgREST. Default: '*' */
  select?: string;
}
const demo = new Map<string, any[]>();
export function dadosDemo(tabela: string, unidadeId: string | null, iniciais: any[] = []) {
  const chave = JSON.stringify([tabela, unidadeId]);
  if (!demo.has(chave)) demo.set(chave, iniciais);
  return demo.get(chave)!;
}
export function paginarMemoria<T>(dados: T[], { pagina, busca, colunasBusca = [] }: FiltroPagina): Pagina<T> {
  const filtrados = dados.filter(item => !busca || colunasBusca.some(c => String((item as any)[c] ?? '').toLocaleLowerCase().includes(busca.toLocaleLowerCase())));
  return { linhas: filtrados.slice((pagina - 1) * TAMANHO_PAGINA, pagina * TAMANHO_PAGINA), total: filtrados.length };
}
export async function listarPagina<T = any>(tabela: string, unidadeId: string | null, filtro: FiltroPagina, escopo: 'unidade' | 'global' = 'unidade'): Promise<Pagina<T>> {
  const colunasPessoa = filtro.colunasPessoa ?? [];
  const ids = filtro.busca && colunasPessoa.length
    ? (await getEquipes(unidadeId)).filter(p => p.nome_curto.toLocaleLowerCase().includes(filtro.busca.toLocaleLowerCase())).map(p => p.id)
    : [];
  if (!isSupabaseConfigured) {
    const dados = dadosDemo(tabela, unidadeId);
    const filtrados = dados.filter(r => !filtro.busca || (filtro.colunasBusca ?? []).some(c =>
      colunasPessoa.includes(c) ? ids.includes(r[c]) : String(r[c] ?? '').toLocaleLowerCase().includes(filtro.busca.toLocaleLowerCase())));
    return paginarMemoria(filtrados, { ...filtro, busca: '' });
  }
  let query = supabase.from(tabela).select(filtro.select || '*', { count: 'exact' });
  if (escopo === 'unidade') query = query.eq('unidade_id', exigirUnidade(unidadeId));
  if (filtro.busca && filtro.colunasBusca?.length) {
    const termo = filtro.busca.replace(/\\/g, '\\\\').replace(/[%_]/g, '\\$&');
    // Quoting protects commas and parentheses in PostgREST's OR grammar.
    const pattern = JSON.stringify(`%${termo}%`);
    const condicoes = filtro.colunasBusca.filter(c => !colunasPessoa.includes(c)).map(c => `${c}.ilike.${pattern}`);
    if (ids.length) condicoes.push(...colunasPessoa.map(c => `${c}.in.(${ids.map(id => JSON.stringify(id)).join(',')})`));
    if (!condicoes.length) return { linhas: [], total: 0 };
    query = query.or(condicoes.join(','));
  }
  query = query.order(filtro.ordem ?? 'id', { ascending: filtro.crescente ?? true });
  for (const d of filtro.desempate ?? []) query = query.order(d.coluna, { ascending: d.crescente });
  query = query.order('id');
  const { data, count, error } = await query.range((filtro.pagina - 1) * TAMANHO_PAGINA, filtro.pagina * TAMANHO_PAGINA - 1);
  if (error) throw error;
  if (count === null) throw new Error('O servidor não informou o total de registros.');
  return { linhas: (data ?? []) as T[], total: count };
}

/** Próxima `ordem` livre da unidade. A tela só tem uma página em mãos, então
 *  o máximo precisa vir do servidor. */
export async function proximaOrdem(tabela: string, unidadeId: string | null): Promise<number> {
  if (!isSupabaseConfigured) {
    const ordens = dadosDemo(tabela, unidadeId).map(r => Number(r.ordem) || 0);
    return (ordens.length ? Math.max(...ordens) : 0) + 1;
  }
  const { data, error } = await supabase.from(tabela).select('ordem')
    .eq('unidade_id', exigirUnidade(unidadeId))
    .order('ordem', { ascending: false }).limit(1);
  if (error) throw error;
  return (Number(data?.[0]?.ordem) || 0) + 1;
}
