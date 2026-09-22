import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getRegras, updateRegra, deleteRegra, addRegra } from '../lib/db';
import { DataTable, Column } from './DataTable';
import { Trash2, X, Save, Plus } from 'lucide-react';

interface Regra {
  id: string;
  nome: string;
  tipo: string;
  ativa: boolean;
  parametros: any;
}

export const RegrasManager: React.FC = () => {
  const { isAdmin, isCoordenador } = useAuth();
  const canEdit = isAdmin || isCoordenador;
  
  const [regras, setRegras] = useState<Regra[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingRegra, setEditingRegra] = useState<Regra | null>(null);
  const [jsonStr, setJsonStr] = useState<string>('');
  
  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getRegras();
      setRegras(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openEdit = (item: Regra) => {
    setEditingRegra(item);
    setJsonStr(JSON.stringify(item.parametros, null, 2));
  };

  const handleBulkDelete = async () => {
    if (!isAdmin) return;
    if (confirm(`Tem certeza que deseja excluir ${selectedIds.length} regra(s)?`)) {
      try {
        for (const id of selectedIds) {
          await deleteRegra(id);
        }
        setSelectedIds([]);
        loadData();
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRegra) return;
    
    let parsedParams = {};
    try {
      parsedParams = JSON.parse(jsonStr);
    } catch (e) {
      alert("JSON de parâmetros inválido.");
      return;
    }

    try {
      if (editingRegra.id === '') {
        await addRegra({
          nome: editingRegra.nome,
          tipo: editingRegra.tipo,
          ativa: editingRegra.ativa,
          parametros: parsedParams
        });
      } else {
        await updateRegra(editingRegra.id, {
          nome: editingRegra.nome,
          tipo: editingRegra.tipo,
          ativa: editingRegra.ativa,
          parametros: parsedParams
        });
      }
      setEditingRegra(null);
      loadData();
    } catch (e) {
      console.error(e);
      alert("Erro ao salvar regra.");
    }
  };

  const columns: Column<Regra>[] = [
    { key: 'nome', header: 'Nome', searchable: true },
    { key: 'tipo', header: 'Tipo', searchable: true, render: (item) => (
      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${item.tipo === 'hard' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
        {item.tipo.toUpperCase()}
      </span>
    ) },
    { key: 'ativa', header: 'Status', render: (item) => (
      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${item.ativa ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-800'}`}>
        {item.ativa ? 'Ativa' : 'Inativa'}
      </span>
    ) },
    { key: 'parametros', header: 'Parâmetros', render: (item) => (
      <span className="text-xs text-slate-500 font-mono">
        {JSON.stringify(item.parametros)}
      </span>
    ) }
  ];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Gerenciador de Regras</h2>
          <p className="text-xs text-slate-500">Configuração das regras de validação da escala.</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && selectedIds.length > 0 && (
            <button
              onClick={handleBulkDelete}
              className="flex items-center gap-2 px-3 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-sm font-semibold transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Excluir Selecionados ({selectedIds.length})
            </button>
          )}
          {canEdit && (
            <button
              onClick={() => {
                setEditingRegra({ id: '', nome: '', tipo: 'alert', ativa: true, parametros: {} });
                setJsonStr('{}');
              }}
              className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg text-sm font-semibold transition-colors"
            >
              <Plus className="w-4 h-4" />
              Adicionar Nova Regra
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8 text-slate-500">Carregando...</div>
      ) : (
        <DataTable
          data={regras}
          columns={columns}
          canEdit={canEdit}
          onRowClick={(item) => canEdit && openEdit(item)}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          getRowId={(item) => item.id}
        />
      )}

      {/* Edit Modal */}
      {editingRegra && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800">{editingRegra.id === '' ? 'Adicionar Regra' : 'Editar Regra'}</h3>
              <button onClick={() => setEditingRegra(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nome</label>
                <input type="text" value={editingRegra.nome} disabled={editingRegra.id !== ''} onChange={(e) => setEditingRegra({...editingRegra, nome: e.target.value})} className={`w-full px-3 py-2 border border-slate-200 rounded-lg text-sm ${editingRegra.id !== '' ? 'bg-slate-50 text-slate-500' : 'bg-white text-slate-900 focus:ring-2 focus:ring-emerald-500'}`} />
              </div>
              {editingRegra.id === '' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tipo</label>
                  <select value={editingRegra.tipo} onChange={(e) => setEditingRegra({...editingRegra, tipo: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500">
                    <option value="alert">Alerta</option>
                    <option value="hard">Rígida</option>
                  </select>
                </div>
              )}
              
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="ativa"
                  checked={editingRegra.ativa}
                  onChange={(e) => setEditingRegra({...editingRegra, ativa: e.target.checked})}
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                <label htmlFor="ativa" className="text-sm font-medium text-slate-700">Regra Ativa</label>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Parâmetros (JSON)</label>
                <textarea
                  rows={4}
                  value={jsonStr}
                  onChange={(e) => setJsonStr(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
                <p className="text-xs text-slate-500 mt-1">Insira um JSON válido. (Ex: {`{"max": 5}`})</p>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingRegra(null)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg flex items-center gap-2 shadow-sm"
                >
                  <Save className="w-4 h-4" />
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
