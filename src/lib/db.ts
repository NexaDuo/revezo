import { ScheduleResult } from './solver/types';
import { supabase, isSupabaseConfigured } from './supabase';

/** Unidade do usuário logado. Toda escrita no domínio é escopada por ela —
 *  as tabelas têm `unidade_id not null` e RLS por unidade. */
export async function minhaUnidade(): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return null;
  const { data } = await supabase
    .from('profiles').select('unidade_id').eq('id', auth.user.id).maybeSingle();
  return data?.unidade_id ?? null;
}

async function exigirUnidade(): Promise<string> {
  const u = await minhaUnidade();
  if (!u) throw new Error('Seu perfil não está vinculado a nenhuma unidade. Peça a um admin para vincular.');
  return u;
}

export async function saveSchedule(
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
    payload.unidade_id = await exigirUnidade();
    // uma semana por unidade: regravar substitui, em vez de duplicar
    const { error } = await supabase
      .from('escalas_semanais')
      .upsert([payload], { onConflict: 'unidade_id,data_inicio' });
    if (error) throw error;
  } else {
    const existingStr = localStorage.getItem('demo_escalas');
    const existing = existingStr ? JSON.parse(existingStr) : [];
    const i = existing.findIndex((e: any) => e.data_inicio === dataInicio);
    const entry = { ...payload, id: String(Date.now()), created_at: new Date().toISOString() };
    if (i >= 0) existing[i] = entry; else existing.push(entry);
    localStorage.setItem('demo_escalas', JSON.stringify(existing));
  }
}

export async function loadSchedules() {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('escalas_semanais')
      .select('*')
      .order('data_inicio', { ascending: false });
      
    if (error) throw error;
    return data || [];
  } else {
    const existingStr = localStorage.getItem('demo_escalas');
    const data = existingStr ? JSON.parse(existingStr) : [];
    // Ordem decrescente
    return data.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }
}
async function listar(tabela: string, ordem: string) {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase.from(tabela).select('*').order(ordem);
  if (error) throw error;
  return data || [];
}

async function inserir(tabela: string, item: any) {
  if (!isSupabaseConfigured) return;
  const unidade_id = await exigirUnidade();
  const { data, error } = await supabase.from(tabela).insert([{ ...item, unidade_id }]).select();
  if (error) throw error;
  return data?.[0];
}

async function atualizar(tabela: string, id: string, item: any) {
  if (!isSupabaseConfigured) return;
  // unidade_id nunca vem do formulário: mover linha de unidade é operação de admin
  const { unidade_id: _ignorado, ...campos } = item;
  const { data, error } = await supabase.from(tabela).update(campos).eq('id', id).select();
  if (error) throw error;
  return data?.[0];
}

async function remover(tabela: string, id: string) {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from(tabela).delete().eq('id', id);
  if (error) throw error;
}

export const getEquipes   = () => listar('equipe', 'ordem');
export const addEquipe    = (i: any) => inserir('equipe', i);
export const updateEquipe = (id: string, i: any) => atualizar('equipe', id, i);
export const deleteEquipe = (id: string) => remover('equipe', id);

export const getSitios    = () => listar('sitios', 'ordem');
export const addSitio     = (i: any) => inserir('sitios', i);
export const updateSitio  = (id: string, i: any) => atualizar('sitios', id, i);
export const deleteSitio  = (id: string) => remover('sitios', id);

export const getRegras    = () => listar('regras_config', 'ordem');
export const addRegra     = (i: any) => inserir('regras_config', i);
export const updateRegra  = (id: string, i: any) => atualizar('regras_config', id, i);
export const deleteRegra  = (id: string) => remover('regras_config', id);

export const getProibicoes = () => listar('proibicoes', 'pessoa_curto');
export const addProibicao  = (i: any) => inserir('proibicoes', i);
export const deleteProibicao = (id: string) => remover('proibicoes', id);

export const getDuplasProibidas = () => listar('duplas_proibidas', 'pessoa_a');
export const addDuplaProibida   = (i: any) => inserir('duplas_proibidas', i);
export const deleteDuplaProibida = (id: string) => remover('duplas_proibidas', id);
