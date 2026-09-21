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
