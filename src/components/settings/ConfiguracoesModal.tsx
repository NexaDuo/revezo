import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { MeusDadosTab } from './MeusDadosTab';
import { UsuariosTab } from './UsuariosTab';
import { UnidadesTab } from './UnidadesTab';

export function ConfiguracoesModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  return isOpen ? <ModalAberto onClose={onClose} /> : null;
}

function ModalAberto({ onClose }: { onClose: () => void }) {
  const { isAdmin, isCoordenador } = useAuth();
  const [aba, setAba] = useState('dados');
  const dialog = useRef<HTMLDivElement>(null);
  const fechar = useRef(onClose);
  fechar.current = onClose;
  const abas = [{ id: 'dados', nome: 'Meus dados' }, ...(isCoordenador ? [{ id: 'usuarios', nome: 'Usuários' }] : []), ...(isAdmin ? [{ id: 'unidades', nome: 'Unidades' }] : [])];
  const ativa = abas.some(a => a.id === aba) ? aba : 'dados';
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    return () => { document.body.style.overflow = overflow; anterior?.focus(); };
  }, []);
  return createPortal(<div className="fixed inset-0 z-50 bg-black/50 sm:p-6 flex items-center justify-center print:hidden">
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
      <div className="p-5 flex justify-between items-center border-b">
        <h2 id="configuracoes-titulo" className="text-xl font-bold">Configurações</h2>
        <button aria-label="Fechar" onClick={onClose} className="p-2 rounded hover:bg-slate-100"><X className="w-5 h-5" /></button>
      </div>
      <div role="tablist" aria-label="Configurações" className="flex border-b px-3">
        {abas.map((a, i) => <button key={a.id} id={'tab-' + a.id} role="tab" aria-selected={ativa === a.id} aria-controls={'painel-' + a.id} tabIndex={ativa === a.id ? 0 : -1}
          className={'px-4 py-3 border-b-2 ' + (ativa === a.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-600')}
          onClick={() => setAba(a.id)} onKeyDown={e => {
            const index = e.key === 'ArrowRight' ? (i + 1) % abas.length : e.key === 'ArrowLeft' ? (i + abas.length - 1) % abas.length : e.key === 'Home' ? 0 : e.key === 'End' ? abas.length - 1 : -1;
            if (index >= 0) { e.preventDefault(); setAba(abas[index].id); document.getElementById('tab-' + abas[index].id)?.focus(); }
          }}>{a.nome}</button>)}
      </div>
      <div role="tabpanel" id={'painel-' + ativa} aria-labelledby={'tab-' + ativa} tabIndex={0} className="overflow-y-auto flex-1 min-h-0">
        {ativa === 'dados' ? <MeusDadosTab /> : ativa === 'usuarios' ? <UsuariosTab /> : <UnidadesTab />}
      </div>
    </div>
  </div>, document.body);
}
