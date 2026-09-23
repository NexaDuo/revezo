import { supabase, isSupabaseConfigured } from './supabase';
import { exigirUnidade } from './db';
export const TAMANHO_PAGINA = 10;
export interface Pagina<T> { linhas: T[]; total: number }
export interface FiltroPagina { pagina: number; busca: string; colunasBusca?: string[]; ordem?: string; crescente?: boolean }
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
  if (!isSupabaseConfigured) return paginarMemoria(dadosDemo(tabela, unidadeId), filtro);
  let query = supabase.from(tabela).select('*', { count: 'exact' });
  if (escopo === 'unidade') query = query.eq('unidade_id', exigirUnidade(unidadeId));
  if (filtro.busca && filtro.colunasBusca?.length) {
    const termo = filtro.busca.replace(/\\/g, '\\\\').replace(/[%_]/g, '\\$&');
    // Quoting protects commas and parentheses in PostgREST's OR grammar.
    const pattern = JSON.stringify(`%${termo}%`);
    query = query.or(filtro.colunasBusca.map(c => `${c}.ilike.${pattern}`).join(','));
  }
  query = query.order(filtro.ordem ?? 'id', { ascending: filtro.crescente ?? true }).order('id');
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
