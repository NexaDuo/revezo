import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useWorkContext } from '../context/WorkContext';
import { getSitios, addSitio, updateSitio, deleteSitio } from '../lib/db';
import { Edit2, Trash2, Plus, Save, X } from 'lucide-react';

export const SitiosManager: React.FC = () => {
  const { isAdmin, isCoordenador } = useAuth();
  const { unidadeId, isLoading: unidadeCarregando } = useWorkContext();
  const canEdit = isAdmin || isCoordenador;
  const [sitios, setSitios] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});

  useEffect(() => {
    // Mesma regra do EquipeManager: sem esperar o WorkContext, a consulta sai
    // com `unidadeId` nulo enquanto o perfil ainda está sendo resolvido.
    if (unidadeCarregando) return;
    fetchData();
  }, [unidadeId, unidadeCarregando]);

  const fetchData = async () => {
    setLoading(true);
    setErro(null);
    try {
      const data = await getSitios(unidadeId);
      setSitios(data);
    } catch (error: any) {
      console.error(error);
      setErro(error?.message || 'Não foi possível carregar os sítios.');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    const newItem = { nome: '', categoria: 'geral', turnos: ['manha', 'tarde'] };
    setEditForm(newItem);
    setEditingId('new');
  };

  const handleEdit = (item: any) => {
    setEditForm(item);
    setEditingId(item.id);
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleSave = async () => {
    setErro(null);
    try {
      if (editingId === 'new') {
        await addSitio(editForm, unidadeId);
      } else {
        await updateSitio(editingId!, editForm, unidadeId);
      }
      setEditingId(null);
      fetchData();
    } catch (error: any) {
      console.error(error);
      setErro(error?.message || 'Não foi possível salvar.');
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza?')) {
      setErro(null);
      try {
        await deleteSitio(id, unidadeId);
        fetchData();
      } catch (error: any) {
        console.error(error);
        setErro(error?.message || 'Não foi possível excluir.');
      }
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-base font-bold text-slate-900">Gerenciar Sítios</h2>
        {canEdit && !editingId && (
          <button onClick={handleAdd} className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold">
            <Plus className="w-4 h-4" />
            Novo
          </button>
        )}
      </div>

      {erro && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {erro}
        </div>
      )}

      {loading || unidadeCarregando ? (
        <div className="text-sm text-slate-500">Carregando...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Nome</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Categoria</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Turnos (JSON)</th>
                {canEdit && <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 uppercase">Ações</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white text-sm">
              {editingId === 'new' && (
                <tr>
                  <td className="px-4 py-2">
                    <input className="w-full border rounded p-1" value={editForm.nome} onChange={e => setEditForm({...editForm, nome: e.target.value})} />
                  </td>
                  <td className="px-4 py-2">
                    <input className="w-full border rounded p-1" value={editForm.categoria} onChange={e => setEditForm({...editForm, categoria: e.target.value})} />
                  </td>
                  <td className="px-4 py-2">
                    <input className="w-full border rounded p-1" value={JSON.stringify(editForm.turnos)} onChange={e => {
                      try { setEditForm({...editForm, turnos: JSON.parse(e.target.value)}) } catch {}
                    }} />
                  </td>
                  <td className="px-4 py-2 text-right flex justify-end gap-2">
                    <button onClick={handleSave} className="text-emerald-600"><Save className="w-4 h-4" /></button>
                    <button onClick={handleCancel} className="text-red-600"><X className="w-4 h-4" /></button>
                  </td>
                </tr>
              )}
              {sitios.map(item => (
                <tr key={item.id}>
                  {editingId === item.id ? (
                    <>
                      <td className="px-4 py-2">
                        <input className="w-full border rounded p-1" value={editForm.nome} onChange={e => setEditForm({...editForm, nome: e.target.value})} />
                      </td>
                      <td className="px-4 py-2">
                        <input className="w-full border rounded p-1" value={editForm.categoria} onChange={e => setEditForm({...editForm, categoria: e.target.value})} />
                      </td>
                      <td className="px-4 py-2">
                        <input className="w-full border rounded p-1" value={JSON.stringify(editForm.turnos)} onChange={e => {
                          try { setEditForm({...editForm, turnos: JSON.parse(e.target.value)}) } catch {}
                        }} />
                      </td>
                      <td className="px-4 py-2 text-right flex justify-end gap-2">
                        <button onClick={handleSave} className="text-emerald-600"><Save className="w-4 h-4" /></button>
                        <button onClick={handleCancel} className="text-red-600"><X className="w-4 h-4" /></button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-2">{item.nome}</td>
                      <td className="px-4 py-2">{item.categoria}</td>
                      <td className="px-4 py-2">{JSON.stringify(item.turnos)}</td>
                      {canEdit && (
                        <td className="px-4 py-2 text-right flex justify-end gap-2">
                          <button onClick={() => handleEdit(item)} className="text-blue-600"><Edit2 className="w-4 h-4" /></button>
                          <button onClick={() => handleDelete(item.id)} className="text-red-600"><Trash2 className="w-4 h-4" /></button>
                        </td>
                      )}
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
