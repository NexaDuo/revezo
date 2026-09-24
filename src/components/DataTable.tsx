import React, { useEffect, useId, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Pencil, Plus, Search, X, RefreshCw, HelpCircle } from 'lucide-react';
import { TAMANHO_PAGINA, type Pagina } from '../lib/paginacao';
import { AVISO_NAO_SALVO, ModalSujoContext, useFecharAoClicarFora } from '../lib/modal';
import { useDebounce } from '../lib/useDebounce';

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
  searchable?: boolean;
}

const FOCAVEIS = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]';

/** Modal de edição de registro: Esc fecha, Tab fica preso dentro e o foco
 *  volta para quem abriu. */
export function TableModal({ titulo, fechar, sujo = false, children }: { titulo: string; fechar: () => void; sujo?: boolean; children: React.ReactNode }) {
  const fora = useFecharAoClicarFora(fechar, sujo);
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
    <div {...fora.fundo} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        className="max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-lg bg-white p-6 shadow-xl focus:outline-none"
      >
        <div className="flex items-center justify-between gap-4">
          <h2 id={id} className="text-xl font-extrabold tracking-tight text-slate-900">{titulo}</h2>
          <button aria-label="Fechar" onClick={fechar} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        {fora.bloqueado && <p role="status" className="rounded-md border-l-4 border-marca bg-white px-3 py-2 text-sm text-slate-800">{AVISO_NAO_SALVO}</p>}
        <ModalSujoContext.Provider value={fora.marcarSujo}>{children}</ModalSujoContext.Provider>
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
  /** Uma frase sob o título: o que esta lista controla. */
  descricao?: React.ReactNode;
  /** Filtros extras, na linha da busca (à esquerda dela). */
  filtros?: React.ReactNode;
  enabled?: boolean;
  podeEditar?: boolean | ((r: T) => boolean);
  podeCriar?: boolean;
  /** Quem controla o próprio modal passa `onEdit`; os demais usam `renderForm`. */
  onEdit?: (r: T | null) => void;
  onRowClick?: (r: T) => void;
  /** Rótulo do botão que acompanha `onRowClick`. */
  textoAbrir?: string;
  renderForm?: (r: T | null, fechar: () => void) => React.ReactNode;
}

/** Tabela padrão do Revezo: 10 registros por página buscados no servidor,
 *  busca no servidor, edição em modal e cache do React Query por
 *  `[tabela, unidade, página, busca]`. Trocar de unidade remonta o componente. */
export function DataTable<T>(props: Props<T>) {
  return <TableContent key={JSON.stringify(props.queryKey)} {...props} />;
}

function TableContent<T>({
  queryKey, fetchPage, columns, getRowId, titulo, descricao, filtros, enabled = true,
  podeEditar = false, podeCriar = true, onEdit, onRowClick, textoAbrir = 'Abrir semana', renderForm,
}: Props<T>) {
  const [pagina, setPagina] = useState(1);
  const [busca, setBusca] = useState('');
  const buscaDebounced = useDebounce(busca, 300);
  const [editor, setEditor] = useState<{ registro: T | null } | null>(null);

  const query = useQuery({
    queryKey: [...queryKey, pagina, buscaDebounced],
    queryFn: () => fetchPage({ pagina, busca: buscaDebounced, colunasBusca: columns.filter(c => c.searchable).map(c => c.key) }),
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
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="titulo-lista text-2xl font-extrabold tracking-tight text-slate-900">
              {titulo} <span className="font-medium text-slate-500">({total})</span>
            </h2>
            {descricao && (
              <div className="group relative inline-flex items-center mt-1">
                <HelpCircle className="h-5 w-5 text-slate-400 hover:text-slate-600 transition-colors cursor-help" aria-hidden="true" />
                <div role="tooltip" className="pointer-events-none absolute left-0 top-full mt-2 w-64 sm:w-80 rounded-md bg-slate-800 px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 z-50">
                  {descricao}
                  <div className="absolute bottom-full left-2 -mb-px border-4 border-transparent border-b-slate-800" />
                </div>
              </div>
            )}
          </div>
        </div>
        {(filtros || buscaPesquisavel || (podeEditar && podeCriar)) && (
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
            {filtros}
            {buscaPesquisavel && (
              <div className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  aria-label={`Buscar ${titulo}`}
                  placeholder="Buscar"
                  value={busca}
                  onChange={e => { setBusca(e.target.value); setPagina(1); }}
                  className="w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm placeholder:text-slate-500 focus:border-caneta-500 focus:outline-none focus:ring-2 focus:ring-caneta-500"
                />
              </div>
            )}
            <button
              onClick={() => query.refetch()}
              title="Atualizar tabela"
              aria-label="Atualizar tabela"
              className="flex shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
            >
              <RefreshCw className={`h-4 w-4 ${query.isFetching ? 'animate-spin text-caneta-600' : ''}`} />
            </button>
            {podeEditar && podeCriar && (
              <button
                onClick={() => editar(null)}
                className="flex shrink-0 items-center gap-2 rounded-md bg-caneta-600 px-3.5 py-2 text-sm font-bold text-white hover:bg-caneta-700"
              >
                <Plus className="h-4 w-4" />
                <span>Novo</span>
              </button>
            )}
          </div>
        )}
      </div>

      {query.isError && (
        <p role="alert" className="rounded-md border-l-4 border-marca-rigida bg-white px-3 py-2 text-sm text-red-900">
          Não foi possível carregar: {query.error.message}{' '}
          <button onClick={() => query.refetch()} className="font-semibold underline">Tentar novamente</button>
        </p>
      )}

      {query.isPending ? (
        <p className="py-6 text-center text-sm text-slate-600">Carregando...</p>
      ) : query.data && (
        <>
          <div className="overflow-x-auto border-y border-slate-300">
            <table className="w-full text-left text-[15px] text-slate-800">
              <thead className="border-b border-slate-300 text-sm text-slate-600">
                <tr>
                  {columns.map(c => <th key={c.key} className="whitespace-nowrap px-3 py-2.5 font-bold">{c.header}</th>)}
                  {temAcoes && <th className="px-3 py-2.5"><span className="sr-only">Ações</span></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {query.data.linhas.length ? query.data.linhas.map(r => (
                  <tr
                    key={getRowId(r)}
                    className={`hover:bg-white ${permitido(r) || onRowClick ? 'cursor-pointer' : ''}`}
                    onClick={e => {
                      if ((e.target as HTMLElement).closest('button,input,select,a')) return;
                      if (permitido(r)) editar(r); else onRowClick?.(r);
                    }}
                  >
                    {columns.map(c => (
                      <td key={c.key} className="px-3 py-2.5">
                        {c.render ? c.render(r) : String((r as any)[c.key] ?? '—')}
                      </td>
                    ))}
                    {temAcoes && (
                      <td className="whitespace-nowrap px-3 py-2.5 text-right">
                        {permitido(r) && (
                          <button
                            aria-label="Editar"
                            onClick={() => editar(r)}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-bold text-caneta-700 hover:bg-caneta-50"
                          >
                            <Pencil className="h-3.5 w-3.5" />Editar
                          </button>
                        )}
                        {onRowClick && (
                          <button
                            onClick={() => onRowClick(r)}
                            className="rounded-md px-2 py-1 text-sm font-bold text-caneta-700 hover:bg-caneta-50"
                          >
                            {textoAbrir}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={columns.length + (temAcoes ? 1 : 0)} className="px-3 py-10 text-center text-slate-600">
                      Nenhum registro encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
            <span>
              Mostrando {total ? (pagina - 1) * TAMANHO_PAGINA + 1 : 0} a {Math.min(pagina * TAMANHO_PAGINA, total)} de {total}
            </span>
            <div className="flex items-center gap-2">
              <button
                aria-label="Página anterior"
                disabled={pagina <= 1}
                onClick={() => setPagina(p => p - 1)}
                className="rounded-md p-1 hover:bg-slate-200/60 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span>Página {pagina} de {paginas}</span>
              <button
                aria-label="Próxima página"
                disabled={pagina >= paginas}
                onClick={() => setPagina(p => p + 1)}
                className="rounded-md p-1 hover:bg-slate-200/60 disabled:cursor-not-allowed disabled:opacity-30"
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
