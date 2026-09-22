import { supabase } from './supabase';
import { Pessoa, Categoria, Turno, StatusDisponibilidade } from './solver/types';
import { DIAS } from './solver/defaultConfig';
import mockData from '../../docs/referencia/disponibilidade_03a07.json';

/** Equipe de demonstração, derivada do fixture do caso-origem. */
function equipeDemo(): Pessoa[] {
  const equipe: Pessoa[] = mockData.disponibilidade.map((d: any) => ({
    n: d.nome,
    c: d.categoria === 'enfermeiro' ? 'enf' : 'tec',
    t: (d.turno === 'manhã' ? 'manha' : d.turno) as Turno,
  }));

  // Posto fixo e isenção de Ações são propriedades da pessoa, não regras no código.
  if (!equipe.find(p => p.n === 'Leticia'))
    equipe.push({ n: 'Leticia', c: 'enf', t: 'ambos', fixo: 'Ensino' });
  if (!equipe.find(p => p.n === 'Allan'))
    equipe.push({ n: 'Allan', c: 'enf', t: 'ambos', isentoAcoes: true, custoExtra: 3 });

  return equipe;
}

function dispDemo(): Record<string, StatusDisponibilidade[]> {
  const disp: Record<string, StatusDisponibilidade[]> = {};
  for (const d of mockData.disponibilidade as any[]) {
    disp[d.nome] = (Object.values(d.status) as string[]).slice(0, DIAS.length) as StatusDisponibilidade[];
  }
  return disp;
}

/** Preenche com "OK" quem não tem disponibilidade informada, para o solver não
 *  tratar ausência de dado como ausência da pessoa. */
function completarDisp(equipe: Pessoa[], disp: Record<string, StatusDisponibilidade[]>) {
  for (const p of equipe) {
    if (!disp[p.n]) disp[p.n] = DIAS.map(() => 'OK');
  }
  return disp;
}

export interface DadosEquipe {
  equipe: Pessoa[];
  disp: Record<string, StatusDisponibilidade[]>;
  /** O que o produto NÃO sabe sobre estes dados. Tem que chegar na tela:
   *  disponibilidade presumida em silêncio escala gente em dia de folga. */
  avisos: string[];
}

export async function fetchEquipe(isSupabaseConfigured: boolean): Promise<DadosEquipe> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.from('profiles').select('*').eq('ativo', true);
      if (!error && data && data.length > 0) {
        const equipe: Pessoa[] = data.map((p: any) => ({
          n: p.nome || p.email.split('@')[0],
          c: (p.categoria || 'tec') as Categoria,
          t: (p.turno || 'manha') as Turno,
          fixo: p.fixo || undefined,
          isentoAcoes: p.isento_acoes || undefined,
          custoExtra: p.custo_extra ?? undefined,
        }));
        // Não existe fonte de folgas/férias ainda. Presumir "todo mundo livre"
        // é aceitável como estado inicial, mas NUNCA em silêncio.
        return {
          equipe,
          disp: completarDisp(equipe, {}),
          avisos: [
            `Sem dados de folga/férias: os ${equipe.length} profissionais foram tratados ` +
            `como disponíveis nos ${DIAS.length} dias. Importe a planilha do mês antes de publicar.`,
          ],
        };
      }
    } catch (e) {
      console.error('Error fetching from Supabase', e);
    }
  }

  const equipe = equipeDemo();
  return {
    equipe,
    disp: completarDisp(equipe, dispDemo()),
    avisos: [
      'Modo demonstração: equipe e disponibilidade vêm do exemplo da semana 03–07/08, ' +
      'não de dados reais.',
    ],
  };
}
