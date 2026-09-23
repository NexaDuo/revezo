const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
  'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** "21 a 25 de setembro" para a semana (segunda a sexta) que começa em `inicioISO`;
 *  "29 de setembro a 3 de outubro" quando vira o mês. Datas inválidas voltam como vieram. */
export function formatarSemana(inicioISO: string): string {
  const [ano, mes, dia] = inicioISO.split('-').map(Number);
  if (!ano || !mes || !dia) return inicioISO;
  const inicio = new Date(Date.UTC(ano, mes - 1, dia));
  const fim = new Date(Date.UTC(ano, mes - 1, dia + 4));
  const mesInicio = MESES[inicio.getUTCMonth()], mesFim = MESES[fim.getUTCMonth()];
  return mesInicio === mesFim
    ? `${inicio.getUTCDate()} a ${fim.getUTCDate()} de ${mesFim}`
    : `${inicio.getUTCDate()} de ${mesInicio} a ${fim.getUTCDate()} de ${mesFim}`;
}
