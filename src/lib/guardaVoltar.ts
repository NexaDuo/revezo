/** Guarda do voltar/avançar do navegador.
 *
 *  `BrowserRouter` não tem `useBlocker`. Listeners de `popstate` no mesmo alvo
 *  rodam na ordem de registro, e este módulo é importado por `main.tsx` antes
 *  de o router montar: o listener abaixo roda antes do dele. Quando a guarda
 *  devolve `true`, a propagação para e o router nunca vê a troca de URL.
 *  (Em captura não serve: o router e o React já teriam renderizado a rota
 *  nova antes, entre um listener e outro.) */
type Guarda = (e: PopStateEvent) => boolean;

let guarda: Guarda | null = null;

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', e => {
    if (guarda?.(e)) e.stopImmediatePropagation();
  });
}

/** `null` desliga. Só uma guarda por vez (a grade é a única que precisa). */
export function definirGuardaVoltar(g: Guarda | null) {
  guarda = g;
}
