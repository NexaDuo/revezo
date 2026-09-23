/** Traduz erros do banco sem expor detalhes internos na interface. */
export function mensagemErroGravacao(error: { code?: string; message?: string }): string {
  const mensagens: Record<string, string> = {
    '23505': 'Já existe um registro com esse nome curto/ordem nesta unidade',
    '23514': 'Valor fora do permitido',
    '42501': 'Sem permissão para esta unidade',
  };
  if (error?.code) return mensagens[error.code] || `Não foi possível salvar. Código: ${error.code}`;
  return error?.message || 'Não foi possível salvar.';
}
