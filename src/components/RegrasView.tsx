import { useSearchParams } from 'react-router-dom';
import { RegrasManager } from './RegrasManager';
import { RestricoesManager } from './RestricoesManager';

export type AbaRegras = 'regras' | 'proibicoes' | 'duplas' | 'fixas';
const ABAS: AbaRegras[] = ['regras', 'proibicoes', 'duplas', 'fixas'];

export function RegrasView() {
  // A aba mora na URL: a tela é remontada quando a sessão/unidade termina de
  // carregar, e um useState local voltava para "Regras" depois do clique.
  const [params, setParams] = useSearchParams();
  const ativa = ABAS.find(a => a === params.get('aba')) ?? 'regras';
  const setAba = (aba: AbaRegras) => setParams(p => {
    const n = new URLSearchParams(p);
    if (aba === 'regras') n.delete('aba'); else n.set('aba', aba);
    return n;
  }, { replace: true });

  return (
    <div className="space-y-6">
      <div className="flex justify-center">
        <div role="tablist" aria-label="Regras e Restrições" className="flex shrink-0 gap-1 overflow-x-auto overflow-y-hidden border-b border-slate-200 px-4 [scrollbar-width:none]">
          <button
            role="tab"
            aria-selected={ativa === 'regras'}
            className={'whitespace-nowrap border-b-2 px-4 py-2.5 text-sm ' + (ativa === 'regras' ? 'border-caneta-600 font-bold text-slate-900' : 'border-transparent font-medium text-slate-600 hover:text-slate-900 hover:border-slate-300')}
            onClick={() => setAba('regras')}
          >
            Regras
          </button>
          <button
            role="tab"
            aria-selected={ativa === 'proibicoes'}
            className={'whitespace-nowrap border-b-2 px-4 py-2.5 text-sm ' + (ativa === 'proibicoes' ? 'border-caneta-600 font-bold text-slate-900' : 'border-transparent font-medium text-slate-600 hover:text-slate-900 hover:border-slate-300')}
            onClick={() => setAba('proibicoes')}
          >
            Proibições por sítio
          </button>
          <button
            role="tab"
            aria-selected={ativa === 'duplas'}
            className={'whitespace-nowrap border-b-2 px-4 py-2.5 text-sm ' + (ativa === 'duplas' ? 'border-caneta-600 font-bold text-slate-900' : 'border-transparent font-medium text-slate-600 hover:text-slate-900 hover:border-slate-300')}
            onClick={() => setAba('duplas')}
          >
            Duplas proibidas
          </button>
          <button
            role="tab"
            aria-selected={ativa === 'fixas'}
            className={'whitespace-nowrap border-b-2 px-4 py-2.5 text-sm ' + (ativa === 'fixas' ? 'border-caneta-600 font-bold text-slate-900' : 'border-transparent font-medium text-slate-600 hover:text-slate-900 hover:border-slate-300')}
            onClick={() => setAba('fixas')}
          >
            Colocações fixas
          </button>
        </div>
      </div>
      
      <div role="tabpanel" className="focus-visible:outline-none">
        {ativa === 'regras' ? <RegrasManager /> : <RestricoesManager aba={ativa} />}
      </div>
    </div>
  );
}
