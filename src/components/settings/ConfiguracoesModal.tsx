import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { MeusDadosTab } from './MeusDadosTab';
import { UsuariosTab } from './UsuariosTab';
import { UnidadesTab } from './UnidadesTab';
import { ConvitesManager } from '../admin/ConvitesManager';
import { AVISO_NAO_SALVO, ModalSujoContext, useFecharAoClicarFora } from '../../lib/modal';

export function ConfiguracoesModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  return isOpen ? <ModalAberto onClose={onClose} /> : null;
}

function ModalAberto({ onClose }: { onClose: () => void }) {
  const { isAdmin, isCoordenador } = useAuth();
  const [aba, setAba] = useState('dados');
  const dialog = useRef<HTMLDivElement>(null);
  const fechar = useRef(onClose);
  fechar.current = onClose;
  const abas = [{ id: 'dados', nome: 'Meus dados' }, ...(isCoordenador ? [{ id: 'usuarios', nome: 'Usuários' }, { id: 'convites', nome: 'Convites' }] : []), ...(isAdmin ? [{ id: 'unidades', nome: 'Unidades' }] : [])];
  const fora = useFecharAoClicarFora(onClose);
  const ativa = abas.some(a => a.id === aba) ? aba : 'dados';
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    return () => { document.body.style.overflow = overflow; anterior?.focus(); };
  }, []);
  return createPortal(<div {...fora.fundo} className="fixed inset-0 z-50 bg-slate-950/50 sm:p-6 flex items-center justify-center print:hidden">
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="configuracoes-titulo" tabIndex={-1}
      className="bg-white w-full h-[100dvh] sm:h-[85vh] max-w-5xl sm:rounded-lg shadow-xl flex flex-col overflow-hidden outline-none"
      onKeyDown={e => {
        if (e.key === 'Escape') { e.stopPropagation(); fechar.current(); }
        if (e.key === 'Tab') {
          const itens = Array.from(dialog.current!.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex="0"]')).filter(el => el.tabIndex >= 0 && el.getClientRects().length);
          const primeiro = itens[0], ultimo = itens[itens.length - 1];
          if (e.shiftKey && (document.activeElement === primeiro || document.activeElement === dialog.current)) { e.preventDefault(); ultimo?.focus(); }
          else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro?.focus(); }
        }
      }}>
      <div className="px-6 pt-5 pb-3 flex justify-between items-center">
        <h2 id="configuracoes-titulo" className="text-xl font-extrabold tracking-tight text-slate-900">Configurações</h2>
        <button aria-label="Fechar" onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-100"><X className="w-5 h-5" /></button>
      </div>
      {fora.bloqueado && <p role="status" className="mx-6 mb-3 rounded-md border-l-4 border-marca bg-white px-3 py-2 text-sm text-slate-800">{AVISO_NAO_SALVO}</p>}
      <div role="tablist" aria-label="Configurações" className="flex gap-1 overflow-x-auto border-b border-slate-200 px-4">
        {abas.map((a, i) => <button key={a.id} id={'tab-' + a.id} role="tab" aria-selected={ativa === a.id} aria-controls={'painel-' + a.id} tabIndex={ativa === a.id ? 0 : -1}
          className={'-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm ' + (ativa === a.id ? 'border-caneta-600 font-bold text-slate-900' : 'border-transparent font-medium text-slate-600 hover:text-slate-900')}
          onClick={() => setAba(a.id)} onKeyDown={e => {
            const index = e.key === 'ArrowRight' ? (i + 1) % abas.length : e.key === 'ArrowLeft' ? (i + abas.length - 1) % abas.length : e.key === 'Home' ? 0 : e.key === 'End' ? abas.length - 1 : -1;
            if (index >= 0) { e.preventDefault(); setAba(abas[index].id); document.getElementById('tab-' + abas[index].id)?.focus(); }
          }}>{a.nome}</button>)}
      </div>
      <div role="tabpanel" id={'painel-' + ativa} aria-labelledby={'tab-' + ativa} tabIndex={0} className="overflow-y-auto flex-1 min-h-0 p-6 focus-visible:outline-none">
        <ModalSujoContext.Provider value={fora.marcarSujo}>
          {ativa === 'dados' ? <MeusDadosTab /> : ativa === 'usuarios' ? <UsuariosTab /> : ativa === 'convites' ? <ConvitesManager /> : <UnidadesTab />}
        </ModalSujoContext.Provider>
      </div>
    </div>
  </div>, document.body);
}
