import { Pessoa, Turno, StatusDisponibilidade } from './solver/types';
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
  if (isSupabaseConfigured) throw new Error('Carregue a equipe pelo contexto da unidade.');

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
