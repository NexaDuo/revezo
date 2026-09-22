import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  listarDisponibilidades, carregarDisponibilidade, salvarDisponibilidade,
  excluirDisponibilidade, SemanaDisponibilidade,
} from '../lib/db';
import { Save, Trash2, CalendarDays, Info, Plus, X } from 'lucide-react';

/** Os códigos que o solver entende. Qualquer outro vindo da planilha é
 *  preservado e mostrado como desconhecido — não some em silêncio. */
const STATUS = [
  { cod: 'OK', rotulo: 'Trabalha',         cor: 'bg-white text-slate-700' },
  { cod: 'P',  rotulo: 'Plantão 12h',      cor: 'bg-blue-50 text-blue-800' },
  { cod: 'F',  rotulo: 'Folga',            cor: 'bg-slate-100 text-slate-500' },
  { cod: 'FC', rotulo: 'Folga compensada', cor: 'bg-slate-100 text-slate-500' },
  { cod: 'FE', rotulo: 'Férias',           cor: 'bg-amber-50 text-amber-800' },
  { cod: 'AT', rotulo: 'Atestado',         cor: 'bg-red-50 text-red-800' },
] as const;

const CONHECIDOS = new Set(STATUS.map(s => s.cod));
const corDe = (cod: string) =>
  STATUS.find(s => s.cod === cod)?.cor ?? 'bg-fuchsia-50 text-fuchsia-800';

const fmt = (iso: string) => {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
};

export const DisponibilidadeManager: React.FC = () => {
  const { isAdmin, isCoordenador } = useAuth();
  const canEdit = isAdmin || isCoordenador;

  const [semanas, setSemanas] = useState<SemanaDisponibilidade[]>([]);
  const [sel, setSel] = useState<string>('');
  const [atual, setAtual] = useState<SemanaDisponibilidade | null>(null);
  const [rascunho, setRascunho] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [novaPessoa, setNovaPessoa] = useState('');

  const carregarLista = async () => {
    setLoading(true);
    try {
      const lista = await listarDisponibilidades();
      setSemanas(lista);
      if (lista.length && !sel) setSel(lista[0].data_inicio);
      if (!lista.length) { setAtual(null); setRascunho({}); }
    } catch (e: any) {
      setMsg({ tipo: 'erro', texto: e?.message || 'Falha ao listar as semanas.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { carregarLista(); }, []);

  useEffect(() => {
    if (!sel) return;
    (async () => {
      try {
        const s = await carregarDisponibilidade(sel);
        setAtual(s);
        setRascunho(s ? JSON.parse(JSON.stringify(s.dados)) : {});
        setMsg(null);
      } catch (e: any) {
        setMsg({ tipo: 'erro', texto: e?.message || 'Falha ao carregar a semana.' });
      }
    })();
  }, [sel]);

  const pessoas = useMemo(() => Object.keys(rascunho).sort((a, b) => a.localeCompare(b)), [rascunho]);
  const dias = atual?.dias ?? [];

  const alterado = useMemo(
    () => !!atual && JSON.stringify(rascunho) !== JSON.stringify(atual.dados),
    [rascunho, atual]
  );

  const setCelula = (pessoa: string, d: number, cod: string) => {
    if (!canEdit) return;
    setRascunho(r => {
      const linha = [...(r[pessoa] ?? dias.map(() => 'OK'))];
      linha[d] = cod;
      return { ...r, [pessoa]: linha };
    });
  };

  const adicionarPessoa = () => {
    const nome = novaPessoa.trim();
    if (!nome || rascunho[nome]) return;
    setRascunho(r => ({ ...r, [nome]: dias.map(() => 'OK') }));
    setNovaPessoa('');
  };

  const salvar = async () => {
    if (!atual) return;
    setSalvando(true);
    setMsg(null);
    try {
      await salvarDisponibilidade({ ...atual, dados: rascunho });
      setAtual({ ...atual, dados: rascunho });
      setMsg({ tipo: 'ok', texto: 'Disponibilidade salva. A próxima geração da grade já usa estes dados.' });
      carregarLista();
    } catch (e: any) {
      setMsg({ tipo: 'erro', texto: e?.message || 'Falha ao salvar.' });
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async () => {
    if (!atual || !confirm(`Excluir a disponibilidade da semana de ${fmt(atual.data_inicio)}?`)) return;
    try {
      await excluirDisponibilidade(atual.data_inicio);
      setSel('');
      setAtual(null);
      setRascunho({});
      carregarLista();
    } catch (e: any) {
      setMsg({ tipo: 'erro', texto: e?.message || 'Falha ao excluir.' });
    }
  };

  const desconhecidos = useMemo(() => {
    const s = new Set<string>();
    for (const linha of Object.values(rascunho)) for (const c of linha) if (!CONHECIDOS.has(c as any)) s.add(c);
    return [...s];
  }, [rascunho]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Disponibilidade da semana</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Quem está de plantão, folga, férias ou atestado em cada dia. É o que a planilha
            importa e o que o solver usa para não escalar ninguém em dia de ausência.
          </p>
        </div>

        {semanas.length > 0 && (
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-slate-400" />
            <select
              value={sel}
              onChange={e => setSel(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-xl text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            >
              {semanas.map(s => (
                <option key={s.data_inicio} value={s.data_inicio}>
                  {fmt(s.data_inicio)} a {fmt(s.data_fim)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {msg && (
        <div className={`rounded-xl border px-3 py-2 text-xs ${
          msg.tipo === 'ok'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
            : 'border-red-200 bg-red-50 text-red-800'
        }`}>
          {msg.texto}
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-slate-500 text-sm">Carregando...</div>
      ) : !atual ? (
        <div className="p-8 text-center border border-dashed border-slate-300 rounded-xl space-y-2">
          <p className="text-sm font-semibold text-slate-800">Nenhuma semana importada ainda</p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Use <strong>Importar Planilha (.xlsx)</strong> na barra de ações. A semana escolhida
            é gravada aqui e pode ser corrigida à mão. Reimportar a mesma semana sobrescreve.
          </p>
        </div>
      ) : (
        <>
          {atual.origem?.arquivo && (
            <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <Info className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
              <p className="text-xs text-slate-600">
                Importado de <strong>{atual.origem.arquivo}</strong>
                {atual.origem.aba && <> · aba <strong>{atual.origem.aba}</strong></>}
                {atual.origem.semana && <> · semana <strong>{atual.origem.semana}</strong></>}
                {atual.updated_at && <> · atualizado em {new Date(atual.updated_at).toLocaleString('pt-BR')}</>}
              </p>
            </div>
          )}

          {desconhecidos.length > 0 && (
            <div className="rounded-xl border border-fuchsia-200 bg-fuchsia-50 px-3 py-2 text-xs text-fuchsia-900">
              Códigos que o motor não conhece, mantidos como vieram da planilha:{' '}
              <strong>{desconhecidos.join(', ')}</strong>. O solver trata tudo que não é
              OK/P como ausência — confira se é isso mesmo.
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="text-left text-[11px] uppercase tracking-wide text-slate-400 pb-2 pr-3">Profissional</th>
                  {dias.map((d, i) => (
                    <th key={i} className="text-[11px] uppercase tracking-wide text-slate-400 pb-2 px-1">{d}</th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pessoas.map(pessoa => (
                  <tr key={pessoa}>
                    <td className="py-1.5 pr-3 text-sm font-medium text-slate-800 whitespace-nowrap">{pessoa}</td>
                    {dias.map((_, d) => {
                      const cod = rascunho[pessoa]?.[d] ?? 'OK';
                      return (
                        <td key={d} className="py-1.5 px-1">
                          <select
                            value={CONHECIDOS.has(cod as any) ? cod : '__outro'}
                            disabled={!canEdit}
                            onChange={e => setCelula(pessoa, d, e.target.value)}
                            className={`w-full text-xs rounded-lg border border-slate-200 px-1.5 py-1 ${corDe(cod)} disabled:cursor-not-allowed`}
                          >
                            {STATUS.map(s => (
                              <option key={s.cod} value={s.cod}>{s.cod} — {s.rotulo}</option>
                            ))}
                            {!CONHECIDOS.has(cod as any) && <option value="__outro">{cod} (da planilha)</option>}
                          </select>
                        </td>
                      );
                    })}
                    <td className="py-1.5 pl-1">
                      {canEdit && (
                        <button
                          onClick={() => setRascunho(r => {
                            const { [pessoa]: _fora, ...resto } = r;
                            return resto;
                          })}
                          title={`Remover ${pessoa} desta semana`}
                          className="p-1 text-slate-300 hover:text-red-600 rounded"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {canEdit && (
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <input
                  value={novaPessoa}
                  onChange={e => setNovaPessoa(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && adicionarPessoa()}
                  placeholder="Nome curto (ex.: Dani P)"
                  className="px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
                <button
                  onClick={adicionarPessoa}
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl border border-slate-300"
                >
                  <Plus className="w-3.5 h-3.5" /> Adicionar
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={excluir}
                  className="flex items-center gap-1.5 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold rounded-xl border border-red-200"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Excluir semana
                </button>
                <button
                  onClick={salvar}
                  disabled={salvando || !alterado}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-sm disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  {salvando ? 'Salvando...' : alterado ? 'Salvar alterações' : 'Sem alterações'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
