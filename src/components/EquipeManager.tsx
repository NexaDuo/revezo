import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useWorkContext } from '../context/WorkContext';
import { getEquipes, addEquipe, updateEquipe, deleteEquipe } from '../lib/db';
import { Edit2, Trash2, Plus, Save, X } from 'lucide-react';

export const EquipeManager: React.FC = () => {
  const { isAdmin, isCoordenador } = useAuth();
  const { unidadeId } = useWorkContext();
  const canEdit = isAdmin || isCoordenador;
  const [equipes, setEquipes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});

  useEffect(() => {
    fetchData();
  }, [unidadeId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await getEquipes(unidadeId);
      setEquipes(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    const newItem = { nome: '', cargo: 'TEC', turno_base: 'manha', carga_horaria: 40 };
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
    try {
      if (editingId === 'new') {
        await addEquipe(editForm, unidadeId);
      } else {
        await updateEquipe(editingId!, editForm, unidadeId);
      }
      setEditingId(null);
      fetchData();
    } catch (error) {
      console.error(error);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza?')) {
      try {
        await deleteEquipe(id, unidadeId);
        fetchData();
      } catch (error) {
        console.error(error);
      }
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-base font-bold text-slate-900">Gerenciar Equipe</h2>
        {canEdit && !editingId && (
          <button onClick={handleAdd} className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold">
            <Plus className="w-4 h-4" />
            Novo
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-sm text-slate-500">Carregando...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Nome</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Cargo</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Turno Base</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Carga Horária</th>
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
                    <input className="w-full border rounded p-1" value={editForm.cargo} onChange={e => setEditForm({...editForm, cargo: e.target.value})} />
                  </td>
                  <td className="px-4 py-2">
                    <input className="w-full border rounded p-1" value={editForm.turno_base} onChange={e => setEditForm({...editForm, turno_base: e.target.value})} />
                  </td>
                  <td className="px-4 py-2">
                    <input type="number" className="w-full border rounded p-1" value={editForm.carga_horaria} onChange={e => setEditForm({...editForm, carga_horaria: parseInt(e.target.value, 10)})} />
                  </td>
                  <td className="px-4 py-2 text-right flex justify-end gap-2">
                    <button onClick={handleSave} className="text-emerald-600"><Save className="w-4 h-4" /></button>
                    <button onClick={handleCancel} className="text-red-600"><X className="w-4 h-4" /></button>
                  </td>
                </tr>
              )}
              {equipes.map(item => (
                <tr key={item.id}>
                  {editingId === item.id ? (
                    <>
                      <td className="px-4 py-2">
                        <input className="w-full border rounded p-1" value={editForm.nome} onChange={e => setEditForm({...editForm, nome: e.target.value})} />
                      </td>
                      <td className="px-4 py-2">
                        <input className="w-full border rounded p-1" value={editForm.cargo} onChange={e => setEditForm({...editForm, cargo: e.target.value})} />
                      </td>
                      <td className="px-4 py-2">
                        <input className="w-full border rounded p-1" value={editForm.turno_base} onChange={e => setEditForm({...editForm, turno_base: e.target.value})} />
                      </td>
                      <td className="px-4 py-2">
                        <input type="number" className="w-full border rounded p-1" value={editForm.carga_horaria} onChange={e => setEditForm({...editForm, carga_horaria: parseInt(e.target.value, 10)})} />
                      </td>
                      <td className="px-4 py-2 text-right flex justify-end gap-2">
                        <button onClick={handleSave} className="text-emerald-600"><Save className="w-4 h-4" /></button>
                        <button onClick={handleCancel} className="text-red-600"><X className="w-4 h-4" /></button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-2">{item.nome}</td>
                      <td className="px-4 py-2">{item.cargo}</td>
                      <td className="px-4 py-2">{item.turno_base}</td>
                      <td className="px-4 py-2">{item.carga_horaria}</td>
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
