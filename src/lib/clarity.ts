/**
 * Identificação da sessão no Microsoft Clarity (tag carregada em index.html).
 *
 * LGPD: só vai para a Microsoft o uuid do usuário (id do Supabase Auth, igual
 * a `profiles.id`), o papel e o slug da unidade. Nunca e-mail, nome ou qualquer
 * outro dado pessoal de profissional de saúde: para saber quem é o usuário de
 * uma sessão com erro, procure o uuid em `profiles`. Por isso o "friendly name"
 * também é o uuid, e não o nome da pessoa. A gravação da tela em si é
 * mascarada por `data-clarity-mask` no `<body>`.
 *
 * O Clarity não tem "des-identificar": `identify` vale para o resto da sessão
 * e `set` acumula valores na tag. Quem separa uma pessoa da próxima é o
 * `signOut` do AuthContext, que recarrega a página e abre sessão nova.
 */

type ClarityFn = (comando: string, ...args: unknown[]) => void;

declare global {
  interface Window {
    clarity?: ClarityFn;
  }
}

function chamar(comando: string, ...args: unknown[]) {
  // O snippet define uma fila (`window.clarity`) antes do script carregar;
  // com adblock ou sem a tag, não há função e a chamada só é pulada.
  try {
    if (typeof window !== 'undefined' && typeof window.clarity === 'function') window.clarity(comando, ...args);
  } catch {
    // Telemetria nunca pode derrubar a tela.
  }
}

/** Chamar só quando o uuid muda (login, restauração de sessão). */
export function identificarNoClarity(usuarioId: string) {
  chamar('identify', usuarioId, undefined, undefined, usuarioId);
  chamar('set', 'usuario_id', usuarioId);
}

/** Tags que mudam durante a sessão (papel, unidade); valor ausente não é enviado. */
export function marcarNoClarity(tag: 'papel' | 'unidade', valor: string | null | undefined) {
  if (valor) chamar('set', tag, valor);
}
