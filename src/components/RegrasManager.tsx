import React, { useEffect, useState } from 'react';
import { useWorkContext } from '../context/WorkContext';
import { getRegras, updateRegra } from '../lib/db';
import { AlertTriangle, ShieldCheck, Info } from 'lucide-react';

/** Uma linha de `regras_config`. A `chave` casa 1:1 com `Regras` em
 *  src/lib/solver/types.ts — é por ela que o motor encontra a regra. */
interface Regra {
  id: string;
  chave: string;
  nome: string;
  descricao: string | null;
  ativa: boolean;
  rigida: boolean;
  ordem: number;
}

export const RegrasManager: React.FC = () => {
  const { podeGravar, unidadeId, isLoading: unidadeCarregando } = useWorkContext();
  const canEdit = podeGravar;

  const [regras, setRegras] = useState<Regra[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setErro(null);
    try {
      setRegras((await getRegras(unidadeId)) as Regra[]);
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível carregar as regras.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Sem esperar o WorkContext resolver, `unidadeId` chega nulo aqui durante
    // o carregamento do perfil e `getRegras` lança "nenhuma unidade
    // selecionada" — um erro real virando falso positivo por causa da ordem
    // de renderização, não da falta de unidade de fato.
    if (unidadeCarregando) return;
    loadData();
  }, [unidadeId, unidadeCarregando]);

  /** Gravação otimista com reversão: se o banco recusar, a chave volta ao
   *  estado anterior e o erro aparece — nunca um toggle que mente. */
  const alternar = async (r: Regra, campo: 'ativa' | 'rigida') => {
    if (!canEdit) return;
    const anterior = r[campo];
    const novo = !anterior;
    setSalvando(r.id);
    setErro(null);
    setRegras(rs => rs.map(x => (x.id === r.id ? { ...x, [campo]: novo } : x)));
    try {
      await updateRegra(r.id, { [campo]: novo }, unidadeId);
    } catch (e: any) {
      setRegras(rs => rs.map(x => (x.id === r.id ? { ...x, [campo]: anterior } : x)));
      setErro(e?.message || 'Não foi possível gravar a alteração.');
    } finally {
      setSalvando(null);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Gerenciador de Regras</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Desligar uma regra aqui muda a próxima geração da grade. Serve para descobrir
          na prática quais regras são inegociáveis: desligue uma e veja se a escala melhora.
        </p>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
        <Info className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
        <p className="text-xs text-slate-600">
          <strong>Rígida</strong> bloqueia e pinta a célula de vermelho (peso 100 na
          pontuação do solver). <strong>Alerta</strong> apenas avisa, em amarelo (peso 1).
          Quem é proibido de quê se cadastra em Equipe, não aqui.
        </p>
      </div>

      {erro && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {erro}
        </div>
      )}

      {loading || unidadeCarregando ? (
        <div className="text-center py-8 text-slate-500 text-sm">Carregando...</div>
      ) : regras.length === 0 ? (
        <div className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-300 rounded-xl">
          Nenhuma regra cadastrada para esta unidade. A grade vai usar os padrões do motor.
        </div>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
              <th className="pb-2 font-semibold">Regra</th>
              <th className="pb-2 font-semibold w-28">Severidade</th>
              <th className="pb-2 font-semibold w-24">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {regras.map(r => (
              <tr key={r.id} className={r.ativa ? '' : 'opacity-50'}>
                <td className="py-3 pr-4">
                  <div className="text-sm font-semibold text-slate-900">{r.nome}</div>
                  <div className="text-xs text-slate-500">{r.descricao}</div>
                  <code className="text-[10px] text-slate-400">{r.chave}</code>
                </td>
                <td className="py-3">
                  <button
                    onClick={() => alternar(r, 'rigida')}
                    disabled={!canEdit || salvando === r.id}
                    title={canEdit ? 'Alternar entre rígida e alerta' : 'Somente leitura'}
                    data-testid={`regra-severidade-${r.chave}`}
                    className={`inline-flex align-middle items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold border transition-colors disabled:cursor-not-allowed ${
                      r.rigida
                        ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                        : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                    }`}
                  >
                    {r.rigida ? <ShieldCheck className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                    {r.rigida ? 'Rígida' : 'Alerta'}
                  </button>
                </td>
                <td className="py-3">
                  <button
                    onClick={() => alternar(r, 'ativa')}
                    disabled={!canEdit || salvando === r.id}
                    aria-pressed={r.ativa}
                    data-testid={`regra-toggle-${r.chave}`}
                    className={`relative align-middle w-11 h-6 rounded-full transition-colors disabled:cursor-not-allowed ${
                      r.ativa ? 'bg-emerald-500' : 'bg-slate-300'
                    }`}
                  >
                    {/* `left-0.5` fixa a posição de repouso dentro da trilha —
                        sem ela, o span parte do centro do botão (conteúdo
                        vazio, sem largura própria) e o translate-x-5 (20px)
                        empurra o polegar para fora da trilha de 44px. */}
                    <span
                      data-testid={`regra-toggle-knob-${r.chave}`}
                      className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                        r.ativa ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};
