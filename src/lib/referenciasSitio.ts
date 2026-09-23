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

/** Nome atual do sítio para as tabelas de Equipe e Regras, que guardam só o id.
 *  Falha de leitura não pode parecer dado corrompido: "não foi possível
 *  carregar" é diferente de "sítio não encontrado". Se a lista já está em
 *  cache (um refetch falhou depois), o nome em cache vale mais que o erro. */
export function nomeDoSitio(
  sitios: { data?: { id: string; nome: string }[]; isLoading: boolean; isError: boolean },
  id: string | null | undefined
): string {
  if (!id) return '—';
  const s = (sitios.data ?? []).find(x => x.id === id);
  if (s) return s.nome;
  if (sitios.isError) return 'Não foi possível carregar os sítios';
  return sitios.isLoading ? '…' : 'Sítio não encontrado';
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
