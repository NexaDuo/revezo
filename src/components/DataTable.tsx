import React, { useEffect, useId, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Pencil, Plus, Search, X } from 'lucide-react';
import { TAMANHO_PAGINA, type Pagina } from '../lib/paginacao';

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
  searchable?: boolean;
}

const FOCAVEIS = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]';

/** Modal de edição de registro: Esc fecha, Tab fica preso dentro e o foco
 *  volta para quem abriu. */
export function TableModal({ titulo, fechar, children }: { titulo: string; fechar: () => void; children: React.ReactNode }) {
  const fecharRef = useRef(fechar);
  fecharRef.current = fechar;
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const listener = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        fecharRef.current();
      }
      if (e.key === 'Tab') {
        e.stopImmediatePropagation();
        const focaveis = Array.from(ref.current?.querySelectorAll<HTMLElement>(FOCAVEIS) ?? []);
        const primeiro = focaveis[0], ultimo = focaveis[focaveis.length - 1];
        const ativo = document.activeElement;
        if (e.shiftKey && (ativo === primeiro || ativo === ref.current)) { e.preventDefault(); ultimo?.focus(); }
        else if (!e.shiftKey && (ativo === ultimo || ativo === ref.current)) { e.preventDefault(); primeiro?.focus(); }
      }
    };
    document.addEventListener('keydown', listener, true);
    return () => {
      document.removeEventListener('keydown', listener, true);
      if (anterior?.isConnected) anterior.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        className="max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-2xl bg-white p-6 shadow-xl focus:outline-none"
      >
        <div className="flex items-center justify-between gap-4">
          <h2 id={id} className="text-lg font-semibold text-slate-900">{titulo}</h2>
          <button aria-label="Fechar" onClick={fechar} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

interface Props<T> {
  queryKey: readonly [string, string | null];
  fetchPage: (f: { pagina: number; busca: string; colunasBusca: string[] }) => Promise<Pagina<T>>;
  columns: Column<T>[];
  getRowId: (r: T) => string;
  titulo: string;
  enabled?: boolean;
  podeEditar?: boolean | ((r: T) => boolean);
  podeCriar?: boolean;
  /** Quem controla o próprio modal passa `onEdit`; os demais usam `renderForm`. */
  onEdit?: (r: T | null) => void;
  onRowClick?: (r: T) => void;
  renderForm?: (r: T | null, fechar: () => void) => React.ReactNode;
}

/** Tabela padrão do Revezo: 10 registros por página buscados no servidor,
 *  busca no servidor, edição em modal e cache do React Query por
 *  `[tabela, unidade, página, busca]`. Trocar de unidade remonta o componente. */
export function DataTable<T>(props: Props<T>) {
  return <TableContent key={JSON.stringify(props.queryKey)} {...props} />;
}

function TableContent<T>({
  queryKey, fetchPage, columns, getRowId, titulo, enabled = true,
  podeEditar = false, podeCriar = true, onEdit, onRowClick, renderForm,
}: Props<T>) {
  const [pagina, setPagina] = useState(1);
  const [busca, setBusca] = useState('');
  const [editor, setEditor] = useState<{ registro: T | null } | null>(null);

  const query = useQuery({
    queryKey: [...queryKey, pagina, busca],
    queryFn: () => fetchPage({ pagina, busca, colunasBusca: columns.filter(c => c.searchable).map(c => c.key) }),
    enabled,
  });
  const total = query.data?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / TAMANHO_PAGINA));

  // Excluir o último registro da última página deixaria a tela numa página vazia.
  useEffect(() => { if (query.data && pagina > paginas) setPagina(paginas); }, [query.data, pagina, paginas]);

  const editar = (r: T | null) => { if (onEdit) onEdit(r); else setEditor({ registro: r }); };
  const permitido = (r: T) => typeof podeEditar === 'function' ? podeEditar(r) : podeEditar;
  const temAcoes = !!podeEditar || !!onRowClick;
  const buscaPesquisavel = columns.some(c => c.searchable);

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">{titulo} ({total})</h2>
        {podeEditar && podeCriar && (
          <button
            onClick={() => editar(null)}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" />
            <span>Novo</span>
          </button>
        )}
      </div>

      {buscaPesquisavel && (
        <div className="relative max-w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            aria-label={`Buscar ${titulo}`}
            placeholder="Buscar..."
            value={busca}
            onChange={e => { setBusca(e.target.value); setPagina(1); }}
            className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      )}

      {query.isError && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          Não foi possível carregar: {query.error.message}{' '}
          <button onClick={() => query.refetch()} className="font-semibold underline">Tentar novamente</button>
        </p>
      )}

      {query.isPending ? (
        <p className="py-6 text-center text-sm text-slate-500">Carregando...</p>
      ) : query.data && (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-900">
                <tr>
                  {columns.map(c => <th key={c.key} className="px-4 py-3 font-semibold">{c.header}</th>)}
                  {temAcoes && <th className="px-4 py-3 font-semibold"><span className="sr-only">Ações</span></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {query.data.linhas.length ? query.data.linhas.map(r => (
                  <tr
                    key={getRowId(r)}
                    className={`hover:bg-slate-50 ${permitido(r) || onRowClick ? 'cursor-pointer' : ''}`}
                    onClick={e => {
                      if ((e.target as HTMLElement).closest('button,input,select,a')) return;
                      if (permitido(r)) editar(r); else onRowClick?.(r);
                    }}
                  >
                    {columns.map(c => (
                      <td key={c.key} className="px-4 py-3">
                        {c.render ? c.render(r) : String((r as any)[c.key] ?? '—')}
                      </td>
                    ))}
                    {temAcoes && (
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        {permitido(r) && (
                          <button
                            aria-label="Editar"
                            onClick={() => editar(r)}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                          >
                            <Pencil className="h-3.5 w-3.5" />Editar
                          </button>
                        )}
                        {onRowClick && (
                          <button
                            onClick={() => onRowClick(r)}
                            className="rounded-lg px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                          >
                            Abrir semana
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={columns.length + (temAcoes ? 1 : 0)} className="px-4 py-8 text-center text-slate-500">
                      Nenhum registro encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
            <span>
              Mostrando {total ? (pagina - 1) * TAMANHO_PAGINA + 1 : 0} a {Math.min(pagina * TAMANHO_PAGINA, total)} de {total}
            </span>
            <div className="flex items-center gap-2">
              <button
                aria-label="Página anterior"
                disabled={pagina <= 1}
                onClick={() => setPagina(p => p - 1)}
                className="rounded p-1 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span>Página {pagina} de {paginas}</span>
              <button
                aria-label="Próxima página"
                disabled={pagina >= paginas}
                onClick={() => setPagina(p => p + 1)}
                className="rounded p-1 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>
        </>
      )}

      {editor && renderForm && (
        <TableModal titulo={editor.registro ? `Editar — ${titulo}` : `Novo — ${titulo}`} fechar={() => setEditor(null)}>
          {renderForm(editor.registro, () => setEditor(null))}
        </TableModal>
      )}
    </section>
  );
}
