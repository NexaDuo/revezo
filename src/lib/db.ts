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

// ---------------------------------------------------------------------------
// Grades semanais (escalas_semanais) — várias versões por semana, uma ativa.
//
// Gerar + salvar cria uma linha NOVA, que vira a ativa (a anterior fica
// "substituída"). Salvar uma grade aberta atualiza a PRÓPRIA linha pelo id e
// não mexe em qual é a ativa. A troca da ativa é atômica no banco
// (`salvar_escala_nova` / `ativar_escala`); o modo demonstração imita o mesmo
// comportamento no localStorage.
// ---------------------------------------------------------------------------

export interface EscalaSalva {
  id: string;
  unidade_id?: string;
  titulo: string;
  data_inicio: string;
  data_fim: string;
  dias: string[];
  grade: ScheduleResult['escala'];
  rodape?: string[];
  violacoes: ScheduleResult['violacoes'];
  score: number;
  status?: string;
  ativa: boolean;
  substituida_em: string | null;
  created_at: string;
  updated_at?: string;
}

export interface DadosEscala {
  titulo: string;
  data_inicio: string;
  data_fim: string;
  dias: string[];
  resultado: ScheduleResult;
  rodape?: string[];
}

const CHAVE_DEMO_ESCALAS = 'demo_escalas';

function campos(d: Pick<DadosEscala, 'resultado' | 'dias'>) {
  return {
    dias: d.dias,
    grade: d.resultado.escala,
    violacoes: d.resultado.violacoes,
    score: Math.round(d.resultado.score),
    status: d.resultado.violacoes.some(v => v.hard) ? 'rascunho' : 'validada',
  };
}

/** Leitor tolerante: entradas gravadas antes das versões não têm `ativa` —
 *  eram uma por semana, então valem como ativas. */
function lerDemoEscalas(): EscalaSalva[] {
  try {
    const lidas = JSON.parse(localStorage.getItem(CHAVE_DEMO_ESCALAS) || '[]');
    return lidas.map((e: any) => ({
      ...e,
      ativa: e.ativa ?? true,
      substituida_em: e.substituida_em ?? null,
      updated_at: e.updated_at ?? e.created_at,
    }));
  } catch { throw new Error('Não foi possível ler as escalas do armazenamento local.'); }
}
function gravarDemoEscalas(todas: EscalaSalva[]) {
  try { localStorage.setItem(CHAVE_DEMO_ESCALAS, JSON.stringify(todas)); }
  catch { throw new Error('Não foi possível salvar as escalas no armazenamento local.'); }
}

async function invalidarEscalas(unidadeId: string | null) {
  await queryClient.invalidateQueries({ queryKey: ['escalas_semanais', unidadeId] });
}

/** Grava uma grade recém-gerada como versão NOVA e a torna a ativa da semana. */
export async function salvarEscalaNova(unidadeId: string | null, d: DadosEscala): Promise<EscalaSalva> {
  let nova: EscalaSalva;
  if (isSupabaseConfigured) {
    const c = campos(d);
    const { data, error } = await supabase.rpc('salvar_escala_nova', {
      p_unidade_id: exigirUnidade(unidadeId),
      p_titulo: d.titulo,
      p_data_inicio: d.data_inicio,
      p_data_fim: d.data_fim,
      p_dias: c.dias,
      p_grade: c.grade,
      p_rodape: d.rodape ?? [],
      p_violacoes: c.violacoes,
      p_score: c.score,
      p_status: c.status,
    });
    if (error) throw error;
    if (!data?.id) throw new Error('O servidor não devolveu a grade salva.');
    nova = data as EscalaSalva;
  } else {
    const agora = new Date().toISOString();
    const todas = lerDemoEscalas().map(e => e.data_inicio === d.data_inicio && e.ativa
      ? { ...e, ativa: false, substituida_em: agora } : e);
    nova = {
      id: crypto.randomUUID(), titulo: d.titulo, data_inicio: d.data_inicio, data_fim: d.data_fim,
      rodape: d.rodape ?? [], ...campos(d), ativa: true, substituida_em: null, created_at: agora, updated_at: agora,
    };
    gravarDemoEscalas([...todas, nova]);
  }
  await invalidarEscalas(unidadeId);
  return nova;
}

/** Regrava uma versão existente PELO ID. Não cria linha e não troca a ativa. */
export async function atualizarEscala(id: string, unidadeId: string | null, d: Pick<DadosEscala, 'resultado' | 'dias'>): Promise<EscalaSalva> {
  let salva: EscalaSalva;
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('escalas_semanais')
      .update(campos(d))
      .eq('id', id)
      .eq('unidade_id', exigirUnidade(unidadeId))
      .select('*');
    if (error) throw error;
    // UPDATE barrado pela RLS devolve sucesso com zero linhas (AGENTS.md).
    if (!data || data.length === 0) {
      throw new Error('Nada foi atualizado: a grade pode ter sido removida, estar em outra unidade ou você não tem permissão.');
    }
    salva = data[0] as EscalaSalva;
  } else {
    const todas = lerDemoEscalas();
    const i = todas.findIndex(e => e.id === id);
    if (i < 0) throw new Error('Nada foi atualizado: grade não encontrada.');
    salva = todas[i] = { ...todas[i], ...campos(d), updated_at: new Date().toISOString() };
    gravarDemoEscalas(todas);
  }
  await invalidarEscalas(unidadeId);
  return salva;
}

/** Torna esta versão a ativa da semana; a ativa anterior vira substituída. */
export async function ativarEscala(id: string, unidadeId: string | null): Promise<EscalaSalva> {
  let ativa: EscalaSalva;
  if (isSupabaseConfigured) {
    exigirUnidade(unidadeId);
    const { data, error } = await supabase.rpc('ativar_escala', { p_id: id });
    if (error) throw error;
    if (!data?.id) throw new Error('O servidor não confirmou a troca da grade ativa.');
    ativa = data as EscalaSalva;
  } else {
    const todas = lerDemoEscalas();
    const alvo = todas.find(e => e.id === id);
    if (!alvo) throw new Error('Grade não encontrada.');
    const agora = new Date().toISOString();
    const novas = todas.map(e => e.id === id ? { ...e, ativa: true, substituida_em: null }
      : e.data_inicio === alvo.data_inicio && e.ativa ? { ...e, ativa: false, substituida_em: agora } : e);
    gravarDemoEscalas(novas);
    ativa = novas.find(e => e.id === id)!;
  }
  await invalidarEscalas(unidadeId);
  return ativa;
}

/** Todas as versões da unidade: semana mais recente primeiro; dentro da
 *  semana, a ativa primeiro e depois as mais novas. */
export function ordenarVersoes(a: EscalaSalva, b: EscalaSalva) {
  return b.data_inicio.localeCompare(a.data_inicio)
    || Number(b.ativa) - Number(a.ativa)
    || (b.created_at ?? '').localeCompare(a.created_at ?? '');
}

export async function loadSchedules(unidadeId: string | null): Promise<EscalaSalva[]> {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('escalas_semanais')
      .select('*')
      .eq('unidade_id', exigirUnidade(unidadeId))
      .order('data_inicio', { ascending: false });

    if (error) throw error;
    return (data || []) as EscalaSalva[];
  }
  return lerDemoEscalas().sort(ordenarVersoes);
}

/** A grade ATIVA de uma semana, ou `null` se a semana não tem grade salva. */
export async function carregarEscala(dataInicio: string, unidadeId: string | null): Promise<EscalaSalva | null> {
  if (!isSupabaseConfigured) {
    return lerDemoEscalas().find(e => e.data_inicio === dataInicio && e.ativa) ?? null;
  }
  const { data, error } = await supabase
    .from('escalas_semanais')
    .select('*')
    .eq('unidade_id', exigirUnidade(unidadeId))
    .eq('data_inicio', dataInicio)
    .eq('ativa', true)
    .maybeSingle();
  if (error) throw error;
  return (data as EscalaSalva) ?? null;
}

/** Uma versão específica, pelo id — da unidade e da semana em contexto. */
export async function carregarEscalaPorId(id: string, dataInicio: string, unidadeId: string | null): Promise<EscalaSalva | null> {
  if (!isSupabaseConfigured) {
    return lerDemoEscalas().find(e => e.id === id && e.data_inicio === dataInicio) ?? null;
  }
  const { data, error } = await supabase
    .from('escalas_semanais')
    .select('*')
    .eq('unidade_id', exigirUnidade(unidadeId))
    .eq('data_inicio', dataInicio)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as EscalaSalva) ?? null;
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
export const updateProibicao = (id: string, i: any, unidadeId: string | null) => atualizar('proibicoes', id, i, unidadeId);
export const deleteProibicao = (id: string, unidadeId: string | null) => remover('proibicoes', id, unidadeId);

export const getDuplasProibidas = (unidadeId: string | null) => listar('duplas_proibidas', 'pessoa_a', unidadeId);
export const addDuplaProibida   = (i: any, unidadeId: string | null) => inserir('duplas_proibidas', i, unidadeId);
export const updateDuplaProibida = (id: string, i: any, unidadeId: string | null) => atualizar('duplas_proibidas', id, i, unidadeId);
export const deleteDuplaProibida = (id: string, unidadeId: string | null) => remover('duplas_proibidas', id, unidadeId);

export const addColocacaoFixa    = (i: any, unidadeId: string | null) => inserir('colocacoes_fixas', i, unidadeId);
export const updateColocacaoFixa = (id: string, i: any, unidadeId: string | null) => atualizar('colocacoes_fixas', id, i, unidadeId);
export const deleteColocacaoFixa = (id: string, unidadeId: string | null) => remover('colocacoes_fixas', id, unidadeId);

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
