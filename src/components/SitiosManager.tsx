import React, { useState, useEffect } from 'react';
import { useWorkContext } from '../context/WorkContext';
import { getSitios, addSitio, updateSitio, deleteSitio } from '../lib/db';
import { mensagemErroGravacao } from '../lib/errosGravacao';
import { Edit2, Trash2, Plus, Save, X } from 'lucide-react';

export const SitiosManager: React.FC = () => {
  const { podeGravar, unidadeId, isLoading: unidadeCarregando } = useWorkContext();
  const canEdit = podeGravar;
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
    const newItem = { nome: '', nome_tarde: '', categoria_permitida: 'ambos', opcional: false, prioridade_dupla: '', ordem: sitios.length ? Math.max(...sitios.map(item => item.ordem)) + 1 : 1 };
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
    if (!editForm.nome?.trim()) {
      setErro('Informe o nome.');
      return;
    }
    if (editForm.ordem === '' || !Number.isInteger(Number(editForm.ordem))) {
      setErro('Informe um número válido para ordem.');
      return;
    }
    if (editForm.prioridade_dupla !== '' && editForm.prioridade_dupla != null && !Number.isInteger(Number(editForm.prioridade_dupla))) {
      setErro('Informe um número válido para prioridade de dupla.');
      return;
    }
    // Apenas colunas editáveis; campos de sistema não voltam no payload.
    const payload = {
      ordem: Number(editForm.ordem),
      nome: editForm.nome.trim(),
      nome_tarde: editForm.nome_tarde?.trim() || null,
      categoria_permitida: editForm.categoria_permitida,
      opcional: editForm.opcional,
      prioridade_dupla: editForm.prioridade_dupla === '' || editForm.prioridade_dupla == null ? null : Number(editForm.prioridade_dupla),
    };
    try {
      if (editingId === 'new') {
        await addSitio(payload, unidadeId);
      } else {
        await updateSitio(editingId!, payload, unidadeId);
      }
      setEditingId(null);
      fetchData();
    } catch (error: any) {
      console.error(error);
      setErro(mensagemErroGravacao(error));
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

  const renderEditCells = () => (
    <>
      <td className="px-4 py-2"><input aria-label="Ordem" type="number" className="w-full border rounded p-1" value={editForm.ordem ?? ''} onChange={e => setEditForm({...editForm, ordem: e.target.value})} /></td>
      <td className="px-4 py-2"><input aria-label="Nome" type="text" className="w-full border rounded p-1" value={editForm.nome ?? ''} onChange={e => setEditForm({...editForm, nome: e.target.value})} /></td>
      <td className="px-4 py-2"><input aria-label="Nome à tarde" type="text" className="w-full border rounded p-1" value={editForm.nome_tarde ?? ''} onChange={e => setEditForm({...editForm, nome_tarde: e.target.value})} /></td>
      <td className="px-4 py-2"><select aria-label="Categoria permitida" className="w-full border rounded p-1" value={editForm.categoria_permitida} onChange={e => setEditForm({...editForm, categoria_permitida: e.target.value})}><option value="enf">Enf</option><option value="tec">Téc</option><option value="ambos">Ambos</option></select></td>
      <td className="px-4 py-2"><input aria-label="Opcional" type="checkbox" checked={!!editForm.opcional} onChange={e => setEditForm({...editForm, opcional: e.target.checked})} /></td>
      <td className="px-4 py-2"><input aria-label="Prioridade de dupla" type="number" className="w-full border rounded p-1" value={editForm.prioridade_dupla ?? ''} onChange={e => setEditForm({...editForm, prioridade_dupla: e.target.value})} /></td>
      <td className="px-4 py-2 text-right">
        <div className="flex justify-end gap-2">
          <button aria-label="Salvar" onClick={handleSave} className="text-emerald-600"><Save className="w-4 h-4" /></button>
          <button aria-label="Cancelar" onClick={handleCancel} className="text-red-600"><X className="w-4 h-4" /></button>
        </div>
      </td>
    </>
  );

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
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
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
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Ordem</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Nome</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Nome à tarde</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Categoria permitida</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Opcional</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Prioridade de dupla</th>
                {canEdit && <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 uppercase">Ações</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white text-sm">
              {editingId === 'new' && <tr>{renderEditCells()}</tr>}
              {sitios.map(item => (
                <tr key={item.id}>
                  {editingId === item.id ? renderEditCells() : (
                    <>
                      <td className="px-4 py-2">{item.ordem ?? '—'}</td>
                      <td className="px-4 py-2">{item.nome ?? '—'}</td>
                      <td className="px-4 py-2">{item.nome_tarde ?? '—'}</td>
                      <td className="px-4 py-2">{({ 'enf': 'Enf', 'tec': 'Téc', 'ambos': 'Ambos' } as Record<string, string>)[item.categoria_permitida]}</td>
                      <td className="px-4 py-2">{item.opcional ? 'Sim' : 'Não'}</td>
                      <td className="px-4 py-2">{item.prioridade_dupla ?? '—'}</td>
                      {canEdit && (
                        <td className="px-4 py-2 text-right flex justify-end gap-2">
                          <button aria-label="Editar" onClick={() => handleEdit(item)} className="text-blue-600"><Edit2 className="w-4 h-4" /></button>
                          <button aria-label="Excluir" onClick={() => handleDelete(item.id)} className="text-red-600"><Trash2 className="w-4 h-4" /></button>
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
