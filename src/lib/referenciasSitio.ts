import { Escala, Sitio } from './solver/types';
import { canon } from './solver/utils';

/** No banco, regras e pessoas apontam para sítio pelo ID (FK). O solver e o
 *  validador continuam trabalhando por nome, então quem carrega resolve o id
 *  para o nome ATUAL do sítio. Grades salvas, por outro lado, guardam o nome
 *  da época: um sítio renomeado depois vira uma linha "que não existe mais".
 *  Este módulo resolve e diz o que ficou órfão, para quem carrega avisar na
 *  tela em vez de descartar em silêncio. Sem Supabase aqui: é lógica pura. */

export interface RotulosSitio { id: string; nome: string; nome_tarde: string | null }

/** Rótulo que o sítio tem na grade daquele turno (`nome_tarde` cai para
 *  `nome`). Devolve `null` se o id não é de nenhum sítio carregado da unidade. */
export function indexarRotulos(linhas: RotulosSitio[]) {
  const porId = new Map(linhas.map(l => [l.id, l]));
  return (id: string | null | undefined, turno: 'manha' | 'tarde'): string | null => {
    const l = id ? porId.get(id) : undefined;
    if (!l) return null;
    return turno === 'tarde' ? (l.nome_tarde || l.nome) : l.nome;
  };
}

/** `"X" (11 regras), "Y" (1 regra)` — agrupado por sítio, na ordem em que apareceu. */
export function listarOrfas(sitios: string[], unidade: [string, string] = ['regra', 'regras']): string {
  const cont = new Map<string, number>();
  for (const s of sitios) cont.set(s, (cont.get(s) || 0) + 1);
  return [...cont].map(([s, n]) => `"${s}" (${n} ${n === 1 ? unidade[0] : unidade[1]})`).join(', ');
}

/** Sítios que a grade (salva ou da semana anterior) tem e a unidade não tem
 *  mais — sinal de sítio renomeado ou apagado depois que a grade foi gravada. */
export function sitiosForaDaUnidade(
  grade: Partial<Escala> | null | undefined,
  sitios: { manha: Sitio[]; tarde: Sitio[] }
): string[] {
  const fora = new Set<string>();
  for (const turno of ['manha', 'tarde'] as const) {
    const existentes = new Set(sitios[turno].map(s => canon(s.n)));
    for (const s of Object.keys(grade?.[turno] || {}))
      if (!existentes.has(canon(s))) fora.add(s);
  }
  return [...fora];
}
