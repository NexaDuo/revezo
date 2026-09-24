import { useState } from 'react';
import { RegrasManager } from './RegrasManager';
import { RestricoesManager } from './RestricoesManager';

export function RegrasView() {
  const [ativa, setAba] = useState<'regras' | 'restricoes'>('regras');
  
  return (
    <div className="space-y-6">
      <div className="flex justify-center">
        <div role="tablist" aria-label="Regras e Conferência" className="flex shrink-0 gap-1 overflow-x-auto overflow-y-hidden border-b border-slate-200 px-4 [scrollbar-width:none]">
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
            aria-selected={ativa === 'restricoes'}
            className={'whitespace-nowrap border-b-2 px-4 py-2.5 text-sm ' + (ativa === 'restricoes' ? 'border-caneta-600 font-bold text-slate-900' : 'border-transparent font-medium text-slate-600 hover:text-slate-900 hover:border-slate-300')}
            onClick={() => setAba('restricoes')}
          >
            Restrições da Unidade
          </button>
        </div>
      </div>
      
      <div role="tabpanel" className="focus-visible:outline-none">
        {ativa === 'regras' ? <RegrasManager /> : <RestricoesManager />}
      </div>
    </div>
  );
}
