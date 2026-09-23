/**
 * Identificação da sessão no Microsoft Clarity (tag carregada em index.html).
 *
 * LGPD: só vai para a Microsoft o uuid do perfil (`profiles.id`, igual ao id
 * do usuário no Supabase Auth), o papel e o slug da unidade. Nunca e-mail,
 * nome ou qualquer outro dado pessoal de profissional de saúde: para saber
 * quem é o usuário de uma sessão com erro, procure o uuid em `profiles`.
 * Por isso o "friendly name" também é o uuid, e não o nome da pessoa.
 */

type ClarityFn = (comando: string, ...args: unknown[]) => void;

declare global {
  interface Window {
    clarity?: ClarityFn;
  }
}

export interface IdentidadeClarity {
  usuarioId: string;
  papel?: string | null;
  unidade?: string | null;
}

function chamar(comando: string, ...args: unknown[]) {
  // O snippet define uma fila (`window.clarity`) antes do script carregar;
  // com adblock ou sem a tag, não há função e a identificação só é pulada.
  try {
    if (typeof window !== 'undefined' && typeof window.clarity === 'function') window.clarity(comando, ...args);
  } catch {
    // Telemetria nunca pode derrubar a tela.
  }
}

export function identificarNoClarity({ usuarioId, papel, unidade }: IdentidadeClarity) {
  chamar('identify', usuarioId, undefined, undefined, usuarioId);
  chamar('set', 'usuario_id', usuarioId);
  if (papel) chamar('set', 'papel', papel);
  if (unidade) chamar('set', 'unidade', unidade);
}

/** Logout: não reidentifica; só esvazia as tags da sessão. */
export function limparClarity() {
  chamar('set', 'usuario_id', '');
  chamar('set', 'papel', '');
  chamar('set', 'unidade', '');
}
