import React, { useState, useMemo } from 'react';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
  searchable?: boolean;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  onRowClick?: (item: T) => void;
  canEdit?: boolean;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  itemsPerPage?: number;
  getRowId: (item: T) => string;
}

export function DataTable<T>({
  data,
  columns,
  onRowClick,
  canEdit = false,
  selectedIds = [],
  onSelectionChange,
  itemsPerPage = 10,
  getRowId
}: DataTableProps<T>) {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const filteredData = useMemo(() => {
    if (!searchTerm) return data;
    const lowerSearch = searchTerm.toLowerCase();
    return data.filter((item) => {
      return columns
        .filter((col) => col.searchable)
        .some((col) => {
          const val = (item as any)[col.key];
          return String(val).toLowerCase().includes(lowerSearch);
        });
    });
  }, [data, columns, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredData.length / itemsPerPage));
  const currentPageData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredData.slice(start, start + itemsPerPage);
  }, [filteredData, currentPage, itemsPerPage]);

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!onSelectionChange) return;
    if (e.target.checked) {
      const allIds = currentPageData.map(getRowId);
      const newSelected = Array.from(new Set([...selectedIds, ...allIds]));
      onSelectionChange(newSelected);
    } else {
      const pageIds = currentPageData.map(getRowId);
      const newSelected = selectedIds.filter(id => !pageIds.includes(id));
      onSelectionChange(newSelected);
    }
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    if (!onSelectionChange) return;
    if (checked) {
      onSelectionChange([...selectedIds, id]);
    } else {
      onSelectionChange(selectedIds.filter((sId) => sId !== id));
    }
  };

  const allPageSelected = currentPageData.length > 0 && currentPageData.every((item) => selectedIds.includes(getRowId(item)));
  const somePageSelected = currentPageData.some((item) => selectedIds.includes(getRowId(item)));

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 w-64"
          />
        </div>
      </div>

      <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-900">
            <tr>
              {canEdit && onSelectionChange && (
                <th className="px-4 py-3 w-12 text-center">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    ref={input => {
                      if (input) {
                        input.indeterminate = !allPageSelected && somePageSelected;
                      }
                    }}
                    onChange={handleSelectAll}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                </th>
              )}
              {columns.map((col) => (
                <th key={col.key} className="px-4 py-3 font-semibold">{col.header}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {currentPageData.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (canEdit ? 1 : 0)} className="px-4 py-8 text-center text-slate-500">
                  Nenhum registro encontrado.
                </td>
              </tr>
            ) : (
              currentPageData.map((item) => {
                const id = getRowId(item);
                const isSelected = selectedIds.includes(id);
                return (
                  <tr
                    key={id}
                    onClick={() => canEdit && onRowClick?.(item)}
                    className={`hover:bg-slate-50 transition-colors ${canEdit && onRowClick ? 'cursor-pointer' : ''} ${isSelected ? 'bg-emerald-50' : ''}`}
                  >
                    {canEdit && onSelectionChange && (
                      <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => handleSelectRow(id, e.target.checked)}
                          className="rounded text-emerald-600 focus:ring-emerald-500"
                        />
                      </td>
                    )}
                    {columns.map((col) => (
                      <td key={col.key} className="px-4 py-3">
                        {col.render ? col.render(item) : (item as any)[col.key]}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-500">
        <div>
          Mostrando {((currentPage - 1) * itemsPerPage) + 1} a {Math.min(currentPage * itemsPerPage, filteredData.length)} de {filteredData.length} registros
        </div>
        <div className="flex items-center gap-2">
          <button
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            className="p-1 rounded hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span>Página {currentPage} de {totalPages}</span>
          <button
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            className="p-1 rounded hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
