/** `disponibilidade_semanal.dados` é gravado por `equipe.id`, não pelo nome
 *  curto: renomear alguém na Equipe não pode desligar a pessoa da própria
 *  disponibilidade. O resto do app (solver, validador, telas) continua falando
 *  em nome curto; a tradução acontece só aqui, na fronteira com o banco.
 *
 *  Leitura tolerante: grade legada (chave = nome) passa como veio. Chave que
 *  não resolve (id de pessoa excluída, nome fora da Equipe, nome ambíguo) é
 *  mantida intacta, e o aviso "nomes fora da equipe" de `montarConfigSemana`
 *  mostra na tela. Nunca descartar em silêncio. */

export interface PessoaRef { id: string; nome_curto: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const pareceId = (k: string) => UUID.test(k);

/** nome curto → id, só quando o nome é único na unidade. */
function idsPorNome(equipe: PessoaRef[]) {
  const cont = new Map<string, number>();
  for (const p of equipe) cont.set(p.nome_curto.trim(), (cont.get(p.nome_curto.trim()) ?? 0) + 1);
  return new Map(equipe.filter(p => cont.get(p.nome_curto.trim()) === 1).map(p => [p.nome_curto.trim(), p.id]));
}

export function dadosParaIds<T>(dados: Record<string, T>, equipe: PessoaRef[]): Record<string, T> {
  const porNome = idsPorNome(equipe);
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(dados)) {
    const chave = pareceId(k) ? k : porNome.get(k.trim()) ?? k;
    // Duas linhas para a mesma pessoa (nome + id): a por nome é a mais nova
    // (vem da tela), então ganha.
    if (!(chave in out) || !pareceId(k)) out[chave] = v;
  }
  return out;
}

export function dadosParaNomes<T>(dados: Record<string, T>, equipe: PessoaRef[]): Record<string, T> {
  const porId = new Map(equipe.map(p => [p.id, p.nome_curto]));
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(dados)) {
    const nome = pareceId(k) ? porId.get(k) : undefined;
    out[nome && !(nome in out) ? nome : k] = v;
  }
  return out;
}
