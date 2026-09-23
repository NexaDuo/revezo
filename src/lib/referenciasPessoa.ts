/** Nome atual para regras persistidas por FK; distingue falha de leitura de órfão. */
export function nomeDaPessoa(
  equipe: { data?: { id: string; nome_curto: string; ativo?: boolean }[]; isLoading: boolean; isError: boolean },
  id: string | null | undefined
): string {
  const p = equipe.data?.find(p => p.id === id);
  if (p) return p.nome_curto + (p.ativo === false ? ' (inativa)' : '');
  if (equipe.isError) return 'Não foi possível carregar a equipe';
  return equipe.isLoading ? '…' : 'Pessoa não encontrada';
}
