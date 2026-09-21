import { supabase } from './supabase';
import { Pessoa, Categoria, Turno, StatusDisponibilidade } from './solver/types';
import mockData from '../../docs/referencia/disponibilidade_03a07.json';

export async function fetchEquipe(isSupabaseConfigured: boolean): Promise<{ equipe: Pessoa[], disp: Record<string, StatusDisponibilidade[]> }> {
  let equipe: Pessoa[] = [];
  let disp: Record<string, StatusDisponibilidade[]> = {};

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.from('profiles').select('*').eq('ativo', true);
      if (!error && data && data.length > 0) {
        equipe = data.map((p: any) => ({
          n: p.nome || p.email.split('@')[0],
          c: (p.categoria || 'tec') as Categoria,
          t: (p.turno || 'manha') as Turno,
          fixo: p.fixo || undefined
        }));
      }
    } catch (e) {
      console.error('Error fetching from Supabase', e);
    }
  }

  if (equipe.length === 0) {
    equipe = mockData.disponibilidade.map((d: any) => ({
      n: d.nome,
      c: d.categoria === 'enfermeiro' ? 'enf' : 'tec',
      t: (d.turno === 'manhã' ? 'manha' : d.turno) as Turno,
    }));
    
    // Add Leticia and Allan if missing
    if (!equipe.find(p => p.n === 'Leticia')) equipe.push({ n: 'Leticia', c: 'enf', t: 'ambos', fixo: 'Ensino' });
    if (!equipe.find(p => p.n === 'Allan')) equipe.push({ n: 'Allan', c: 'enf', t: 'ambos' });
  }

  mockData.disponibilidade.forEach((d: any) => {
    // Pad with "F" for Saturday and Sunday
    disp[d.nome] = [...(Object.values(d.status) as string[]), 'F', 'F'] as StatusDisponibilidade[];
  });
  
  // Fill missing disp
  equipe.forEach(p => {
    if (!disp[p.n]) {
      disp[p.n] = ['OK', 'OK', 'OK', 'OK', 'OK', 'F', 'F'];
    }
  });

  return { equipe, disp };
}
