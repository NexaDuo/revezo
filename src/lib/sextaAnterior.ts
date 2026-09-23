import { Escala, SextaAnterior } from './solver/types';

/** Segunda-feira anterior a `semanaInicio` (YYYY-MM-DD), no mesmo formato.
 *  Aritmética em UTC para não escorregar um dia no horário de verão. */
export function semanaAnterior(semanaInicio: string): string {
  const d = new Date(`${semanaInicio}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().slice(0, 10);
}

const normalizar = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Quem estava em cada sítio na sexta da grade salva. Devolve `null` se a
 *  grade não tem sexta — aí a regra "sexta ≠ segunda" não tem de onde tirar
 *  o estado, e quem chama precisa avisar em vez de fingir que aplicou. */
export function sextaDaEscala(grade: Escala | null | undefined, dias: string[] | null | undefined): SextaAnterior | null {
  if (!grade || !dias?.length) return null;
  const nomes = dias.map(normalizar);
  let idx = nomes.length - 1;
  while (idx >= 0 && !nomes[idx].startsWith('sexta')) idx--;
  if (idx < 0) return null;
  const sexta: SextaAnterior = { manha: {}, tarde: {} };
  for (const turno of ['manha', 'tarde'] as const) {
    for (const [sitio, porDia] of Object.entries(grade[turno] || {})) {
      const quem = porDia?.[idx] || [];
      if (quem.length) sexta[turno][sitio] = [...quem];
    }
  }
  return sexta;
}
