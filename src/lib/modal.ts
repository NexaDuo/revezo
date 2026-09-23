import { createContext, useContext, useEffect, useRef, useState, type MouseEvent } from 'react';

/** Um formulário dentro do modal avisa quando tem alteração não salva. */
export const ModalSujoContext = createContext<(sujo: boolean) => void>(() => {});

/** Registra no modal mais próximo se `sujo` (há alteração não salva). */
export function useMarcarSujo(sujo: boolean) {
  const marcar = useContext(ModalSujoContext);
  useEffect(() => { marcar(sujo); return () => marcar(false); }, [sujo, marcar]);
}

/** Props para o fundo escurecido do modal: clicar fora fecha, desde que isso
 *  não jogue fora alteração não salva. O clique precisa começar e terminar no
 *  fundo — arrastar para selecionar texto e soltar fora não fecha — e clique em
 *  modal aninhado (que também é filho no DOM) não fecha o de trás. */
export function useFecharAoClicarFora(fechar: () => void, sujoExterno = false) {
  const [sujoInterno, setSujoInterno] = useState(false);
  const comecouNoFundo = useRef(false);
  // Clique fora com alteração pendente não fecha — e diz por quê na tela.
  const [bloqueado, setBloqueado] = useState(false);
  const sujo = sujoExterno || sujoInterno;
  return {
    sujo,
    marcarSujo: setSujoInterno,
    bloqueado: bloqueado && sujo,
    fundo: {
      onMouseDown: (e: MouseEvent) => { comecouNoFundo.current = e.target === e.currentTarget; },
      onClick: (e: MouseEvent) => {
        if (e.target === e.currentTarget && comecouNoFundo.current) {
          if (sujo) setBloqueado(true); else fechar();
        }
        comecouNoFundo.current = false;
      },
    },
  };
}

export const AVISO_NAO_SALVO = 'Há alterações não salvas: salve ou cancele para fechar.';
