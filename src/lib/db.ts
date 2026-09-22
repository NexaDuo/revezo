import { ScheduleResult } from './solver/types';
import { supabase, isSupabaseConfigured } from './supabase';

export async function saveSchedule(escala: ScheduleResult, titulo: string, dataInicio: string, dataFim: string) {
  const payload = {
    titulo,
    data_inicio: dataInicio,
    data_fim: dataFim,
    grade: escala,
  };

  if (isSupabaseConfigured) {
    const { error } = await supabase
      .from('escalas_semanais')
      .insert([payload]);
    
    if (error) throw error;
  } else {
    // Fallback para localStorage
    const existingStr = localStorage.getItem('demo_escalas');
    const existing = existingStr ? JSON.parse(existingStr) : [];
    const newEntry = {
      ...payload,
      id: Date.now().toString(),
      created_at: new Date().toISOString()
    };
    existing.push(newEntry);
    localStorage.setItem('demo_escalas', JSON.stringify(existing));
  }
}

export async function loadSchedules() {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('escalas_semanais')
      .select('*')
      .order('created_at', { ascending: false });
      
    if (error) throw error;
    return data || [];
  } else {
    const existingStr = localStorage.getItem('demo_escalas');
    const data = existingStr ? JSON.parse(existingStr) : [];
    // Ordem decrescente
    return data.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }
}
export async function getEquipes() {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.from('equipe').select('*').order('nome');
    if (error) throw error;
    return data || [];
  }
  return [];
}
export async function addEquipe(item: any) {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.from('equipe').insert([item]).select();
    if (error) throw error;
    return data?.[0];
  }
}
export async function updateEquipe(id: string, item: any) {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.from('equipe').update(item).eq('id', id).select();
    if (error) throw error;
    return data?.[0];
  }
}
export async function deleteEquipe(id: string) {
  if (isSupabaseConfigured) {
    const { error } = await supabase.from('equipe').delete().eq('id', id);
    if (error) throw error;
  }
}

export async function getSitios() {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.from('sitios').select('*').order('nome');
    if (error) throw error;
    return data || [];
  }
  return [];
}
export async function addSitio(item: any) {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.from('sitios').insert([item]).select();
    if (error) throw error;
    return data?.[0];
  }
}
export async function updateSitio(id: string, item: any) {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.from('sitios').update(item).eq('id', id).select();
    if (error) throw error;
    return data?.[0];
  }
}
export async function deleteSitio(id: string) {
  if (isSupabaseConfigured) {
    const { error } = await supabase.from('sitios').delete().eq('id', id);
    if (error) throw error;
  }
}
export async function getRegras() {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.from('regras_config').select('*').order('nome');
    if (error) throw error;
    return data || [];
  }
  return [];
}
export async function addRegra(item: any) {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.from('regras_config').insert([item]).select();
    if (error) throw error;
    return data?.[0];
  }
}
export async function updateRegra(id: string, item: any) {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.from('regras_config').update(item).eq('id', id).select();
    if (error) throw error;
    return data?.[0];
  }
}
export async function deleteRegra(id: string) {
  if (isSupabaseConfigured) {
    const { error } = await supabase.from('regras_config').delete().eq('id', id);
    if (error) throw error;
  }
}
