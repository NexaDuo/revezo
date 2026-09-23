import { dadosDemo } from './paginacao';
import { queryClient } from './queryClient';
import { ScheduleResult } from './solver/types';
import { supabase, isSupabaseConfigured } from './supabase';

/** Unidade do usuário logado. Toda escrita no domínio é escopada por ela —
 *  as tabelas têm `unidade_id not null` e RLS por unidade. Usado só como
 *  valor inicial do `WorkContext`: o resto do arquivo recebe a unidade
 *  explícita, nunca a lê de novo por conta própria. */
export async function minhaUnidade(): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return null;
  const { data } = await supabase
    .from('profiles').select('unidade_id').eq('id', auth.user.id).maybeSingle();
  return data?.unidade_id ?? null;
}

/** Nenhuma função aqui embaixo assume unidade: quem chama tem que trazer o
 *  `unidadeId` do `WorkContext`. Sem unidade resolvida, falha alto — nunca
 *  um default silencioso que grava (ou lê) na unidade errada. */
export function exigirUnidade(unidadeId: string | null | undefined): string {
  if (!unidadeId) {
    throw new Error('Nenhuma unidade selecionada. Peça a um admin para vincular seu perfil a uma unidade.');
  }
  return unidadeId;
}

export async function saveSchedule(
  unidadeId: string | null,
  resultado: ScheduleResult,
  titulo: string,
  dataInicio: string,
  dataFim: string,
  dias: string[] = [],
  rodape: string[] = []
) {
  const payload: Record<string, any> = {
    titulo,
    data_inicio: dataInicio,
    data_fim: dataFim,
    dias,
    grade: resultado.escala,
    rodape,
    violacoes: resultado.violacoes,
    score: Math.round(resultado.score),
    status: resultado.violacoes.some(v => v.hard) ? 'rascunho' : 'validada',
  };

  if (isSupabaseConfigured) {
    payload.unidade_id = exigirUnidade(unidadeId);
    // uma semana por unidade: regravar substitui, em vez de duplicar
    const { error } = await supabase
      .from('escalas_semanais')
      .upsert([payload], { onConflict: 'unidade_id,data_inicio' });
    if (error) throw error;
  } else {
    try {
      const existingStr = localStorage.getItem('demo_escalas');
      const existing = existingStr ? JSON.parse(existingStr) : [];
      const i = existing.findIndex((e: any) => e.data_inicio === dataInicio);
      const entry = { ...payload, id: String(Date.now()), created_at: new Date().toISOString() };
      if (i >= 0) existing[i] = entry; else existing.push(entry);
      localStorage.setItem('demo_escalas', JSON.stringify(existing));
    } catch { throw new Error('Não foi possível salvar as escalas no armazenamento local.'); }
  }
  await queryClient.invalidateQueries({ queryKey: ['escalas_semanais', unidadeId] });
}

export async function loadSchedules(unidadeId: string | null) {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('escalas_semanais')
      .select('*')
      .eq('unidade_id', exigirUnidade(unidadeId))
      .order('data_inicio', { ascending: false });

    if (error) throw error;
    return data || [];
  } else {
    try {
      const existingStr = localStorage.getItem('demo_escalas');
      const data = existingStr ? JSON.parse(existingStr) : [];
      // Ordem decrescente
      return data.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } catch { throw new Error('Não foi possível ler as escalas do armazenamento local.'); }
  }
}
/** A escala salva de uma semana específica, ou `null` se não houver. */
export async function carregarEscala(dataInicio: string, unidadeId: string | null) {
  if (!isSupabaseConfigured) {
    return (await loadSchedules(unidadeId)).find((e: any) => e.data_inicio === dataInicio) ?? null;
  }
  const { data, error } = await supabase
    .from('escalas_semanais')
    .select('data_inicio, dias, grade')
    .eq('unidade_id', exigirUnidade(unidadeId))
    .eq('data_inicio', dataInicio)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

async function listar(tabela: string, ordem: string, unidadeId: string | null) {
  if (!isSupabaseConfigured) return [...dadosDemo(tabela, unidadeId)].sort((a,b) => a[ordem] > b[ordem] ? 1 : -1);
  const { data, error } = await supabase
    .from(tabela)
    .select('*')
    .eq('unidade_id', exigirUnidade(unidadeId))
    .order(ordem);
  if (error) throw error;
  return data || [];
}

async function inserir(tabela: string, item: any, unidadeId: string | null) {
  if (!isSupabaseConfigured) { const row = { ...item, id: crypto.randomUUID() }; dadosDemo(tabela, unidadeId).push(row); return row; }
  const unidade_id = exigirUnidade(unidadeId);
  const { data, error } = await supabase.from(tabela).insert([{ ...item, unidade_id }]).select();
  if (error) throw error;
  return data?.[0];
}

async function atualizar(tabela: string, id: string, item: any, unidadeId: string | null) {
  if (!isSupabaseConfigured) { const row = dadosDemo(tabela, unidadeId).find(r => r.id === id); if (!row) throw new Error('Registro não encontrado.'); Object.assign(row, item); return row; }
  // unidade_id nunca vem do formulário: mover linha de unidade é operação de admin
  const { unidade_id: _ignorado, ...campos } = item;
  const { data, error } = await supabase
    .from(tabela)
    .update(campos)
    .eq('id', id)
    .eq('unidade_id', exigirUnidade(unidadeId))
    .select('id');
  if (error) throw error;
  // Um UPDATE filtrado por RLS ou pelo `.eq('unidade_id', …)` que não bate com
  // nenhuma linha não é erro do PostgREST — devolve sucesso com zero linhas.
  // Reportar "salvo" nesse caso é exatamente a falha silenciosa que a lição
  // de RLS do AGENTS.md pede para nunca acontecer.
  if (!data || data.length === 0) {
    throw new Error('Nada foi atualizado: o registro pode ter sido movido para outra unidade ou removido.');
  }
  return data[0];
}

async function remover(tabela: string, id: string, unidadeId: string | null) {
  if (!isSupabaseConfigured) { const rows = dadosDemo(tabela, unidadeId); const i = rows.findIndex(r => r.id === id); if (i < 0) throw new Error('Registro não encontrado.'); rows.splice(i, 1); return; }
  const { data, error } = await supabase
    .from(tabela)
    .delete()
    .eq('id', id)
    .eq('unidade_id', exigirUnidade(unidadeId))
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('Nada foi excluído: o registro pode já ter sido removido ou estar em outra unidade.');
  }
}

export const getEquipes   = (unidadeId: string | null) => listar('equipe', 'ordem', unidadeId);
export const addEquipe    = (i: any, unidadeId: string | null) => inserir('equipe', i, unidadeId);
export const updateEquipe = (id: string, i: any, unidadeId: string | null) => atualizar('equipe', id, i, unidadeId);
export const deleteEquipe = (id: string, unidadeId: string | null) => remover('equipe', id, unidadeId);

export const getSitios    = (unidadeId: string | null) => listar('sitios', 'ordem', unidadeId);
export const addSitio     = (i: any, unidadeId: string | null) => inserir('sitios', i, unidadeId);
export const updateSitio  = (id: string, i: any, unidadeId: string | null) => atualizar('sitios', id, i, unidadeId);
export const deleteSitio  = (id: string, unidadeId: string | null) => remover('sitios', id, unidadeId);

export const getRegras    = (unidadeId: string | null) => listar('regras_config', 'ordem', unidadeId);
export const addRegra     = (i: any, unidadeId: string | null) => inserir('regras_config', i, unidadeId);
export const updateRegra  = (id: string, i: any, unidadeId: string | null) => atualizar('regras_config', id, i, unidadeId);
export const deleteRegra  = (id: string, unidadeId: string | null) => remover('regras_config', id, unidadeId);

export const getProibicoes = (unidadeId: string | null) => listar('proibicoes', 'pessoa_curto', unidadeId);
export const addProibicao  = (i: any, unidadeId: string | null) => inserir('proibicoes', i, unidadeId);
export const deleteProibicao = (id: string, unidadeId: string | null) => remover('proibicoes', id, unidadeId);

export const getDuplasProibidas = (unidadeId: string | null) => listar('duplas_proibidas', 'pessoa_a', unidadeId);
export const addDuplaProibida   = (i: any, unidadeId: string | null) => inserir('duplas_proibidas', i, unidadeId);
export const deleteDuplaProibida = (id: string, unidadeId: string | null) => remover('duplas_proibidas', id, unidadeId);

// ---------------------------------------------------------------------------
// Disponibilidade semanal (o que a planilha .xlsx importa)
// ---------------------------------------------------------------------------

export interface SemanaDisponibilidade {
  id?: string;
  data_inicio: string;
  data_fim: string;
  dias: string[];
  dados: Record<string, string[]>;
  origem?: { arquivo?: string; aba?: string; semana?: string };
  updated_at?: string;
}

const CHAVE_DEMO = 'demo_disponibilidade';

function lerDemo(): SemanaDisponibilidade[] {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_DEMO) || '[]');
  } catch {
    return [];
  }
}

/** Grava a disponibilidade de uma semana. Reimportar a mesma semana
 *  SOBRESCREVE — a chave é (unidade, data_inicio). */
export async function salvarDisponibilidade(s: SemanaDisponibilidade, unidadeId: string | null) {
  if (!isSupabaseConfigured) {
    const todas = lerDemo().filter(x => x.data_inicio !== s.data_inicio);
    todas.push({ ...s, updated_at: new Date().toISOString() });
    try { localStorage.setItem(CHAVE_DEMO, JSON.stringify(todas)); }
    catch { throw new Error('Não foi possível salvar a disponibilidade no armazenamento local.'); }
    return;
  }

  const unidade_id = exigirUnidade(unidadeId);
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from('disponibilidade_semanal').upsert(
    [{
      unidade_id,
      data_inicio: s.data_inicio,
      data_fim: s.data_fim,
      dias: s.dias,
      dados: s.dados,
      origem: s.origem ?? {},
      atualizado_por: auth?.user?.id ?? null,
    }],
    { onConflict: 'unidade_id,data_inicio' }
  );
  if (error) throw error;
}

export async function listarDisponibilidades(unidadeId: string | null): Promise<SemanaDisponibilidade[]> {
  if (!isSupabaseConfigured) {
    return lerDemo().sort((a, b) => b.data_inicio.localeCompare(a.data_inicio));
  }
  const { data, error } = await supabase
    .from('disponibilidade_semanal')
    .select('*')
    .eq('unidade_id', exigirUnidade(unidadeId))
    .order('data_inicio', { ascending: false });
  if (error) throw error;
  return (data || []) as SemanaDisponibilidade[];
}

export async function carregarDisponibilidade(dataInicio: string, unidadeId: string | null): Promise<SemanaDisponibilidade | null> {
  if (!isSupabaseConfigured) {
    return lerDemo().find(x => x.data_inicio === dataInicio) ?? null;
  }
  const { data, error } = await supabase
    .from('disponibilidade_semanal')
    .select('*')
    .eq('unidade_id', exigirUnidade(unidadeId))
    .eq('data_inicio', dataInicio)
    .maybeSingle();
  if (error) throw error;
  return (data as SemanaDisponibilidade) ?? null;
}

export async function excluirDisponibilidade(dataInicio: string, unidadeId: string | null) {
  if (!isSupabaseConfigured) {
    try { localStorage.setItem(
      CHAVE_DEMO,
      JSON.stringify(lerDemo().filter(x => x.data_inicio !== dataInicio))
    ); } catch { throw new Error('Não foi possível excluir a disponibilidade do armazenamento local.'); }
    return;
  }
  const { data, error } = await supabase
    .from('disponibilidade_semanal')
    .delete()
    .eq('unidade_id', exigirUnidade(unidadeId))
    .eq('data_inicio', dataInicio)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('Nada foi excluído: a semana pode já ter sido removida ou estar em outra unidade.');
  }
}
