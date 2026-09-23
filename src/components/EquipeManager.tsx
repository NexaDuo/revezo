import React, { useState, useEffect } from 'react';
import { useWorkContext } from '../context/WorkContext';
import { getEquipes, addEquipe, updateEquipe, deleteEquipe } from '../lib/db';
import { mensagemErroGravacao } from '../lib/errosGravacao';
import { Edit2, Trash2, Plus, Save, X } from 'lucide-react';

export const EquipeManager: React.FC = () => {
  const { podeGravar, unidadeId, isLoading: unidadeCarregando } = useWorkContext();
  const canEdit = podeGravar;
  const [equipes, setEquipes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});

  useEffect(() => {
    // WorkContext ainda resolvendo a unidade (perfil carregando): esperar em
    // vez de consultar com `unidadeId` nulo, que lança "nenhuma unidade
    // selecionada" mesmo quando a unidade está a um instante de existir.
    if (unidadeCarregando) return;
    fetchData();
  }, [unidadeId, unidadeCarregando]);

  const fetchData = async () => {
    setLoading(true);
    setErro(null);
    try {
      const data = await getEquipes(unidadeId);
      setEquipes(data);
    } catch (error: any) {
      console.error(error);
      setErro(error?.message || 'Não foi possível carregar a equipe.');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    const newItem = { nome: '', nome_curto: '', categoria: 'tec', turno_base: 'manha', fixo_sitio: '', isento_acoes: false, custo_extra: 0, ativo: true, ordem: equipes.length ? Math.max(...equipes.map(item => item.ordem)) + 1 : 1 };
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
    if (!editForm.nome_curto?.trim()) {
      setErro('Informe o nome curto.');
      return;
    }
    if (editForm.custo_extra === '' || !Number.isFinite(Number(editForm.custo_extra))) {
      setErro('Informe um número válido para custo extra.');
      return;
    }
    if (editForm.ordem === '' || !Number.isInteger(Number(editForm.ordem))) {
      setErro('Informe um número válido para ordem.');
      return;
    }
    // Apenas colunas editáveis; campos de sistema não voltam no payload.
    const payload = {
      nome: editForm.nome.trim(),
      nome_curto: editForm.nome_curto.trim(),
      categoria: editForm.categoria,
      turno_base: editForm.turno_base,
      fixo_sitio: editForm.fixo_sitio?.trim() || null,
      isento_acoes: editForm.isento_acoes,
      custo_extra: Number(editForm.custo_extra),
      ativo: editForm.ativo,
      ordem: Number(editForm.ordem),
    };
    try {
      if (editingId === 'new') {
        await addEquipe(payload, unidadeId);
      } else {
        await updateEquipe(editingId!, payload, unidadeId);
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
        await deleteEquipe(id, unidadeId);
        fetchData();
      } catch (error: any) {
        console.error(error);
        setErro(error?.message || 'Não foi possível excluir.');
      }
    }
  };

  const renderEditCells = () => (
    <>
      <td className="px-4 py-2"><input aria-label="Nome" type="text" className="w-full border rounded p-1" value={editForm.nome ?? ''} onChange={e => setEditForm({...editForm, nome: e.target.value})} /></td>
      <td className="px-4 py-2"><input aria-label="Nome curto" type="text" className="w-full border rounded p-1" value={editForm.nome_curto ?? ''} onChange={e => setEditForm({...editForm, nome_curto: e.target.value})} /></td>
      <td className="px-4 py-2"><select aria-label="Categoria" className="w-full border rounded p-1" value={editForm.categoria} onChange={e => setEditForm({...editForm, categoria: e.target.value})}><option value="enf">Enfermeira</option><option value="tec">Técnica</option></select></td>
      <td className="px-4 py-2"><select aria-label="Turno base" className="w-full border rounded p-1" value={editForm.turno_base} onChange={e => setEditForm({...editForm, turno_base: e.target.value})}><option value="manha">Manhã</option><option value="tarde">Tarde</option><option value="noite">Noite</option><option value="ambos">Ambos</option></select></td>
      <td className="px-4 py-2"><input aria-label="Sítio fixo" type="text" className="w-full border rounded p-1" value={editForm.fixo_sitio ?? ''} onChange={e => setEditForm({...editForm, fixo_sitio: e.target.value})} /></td>
      <td className="px-4 py-2"><input aria-label="Isento de Ações" type="checkbox" checked={!!editForm.isento_acoes} onChange={e => setEditForm({...editForm, isento_acoes: e.target.checked})} /></td>
      <td className="px-4 py-2"><input aria-label="Custo extra" type="number" step="any" className="w-full border rounded p-1" value={editForm.custo_extra ?? ''} onChange={e => setEditForm({...editForm, custo_extra: e.target.value})} /></td>
      <td className="px-4 py-2"><input aria-label="Ativo" type="checkbox" checked={!!editForm.ativo} onChange={e => setEditForm({...editForm, ativo: e.target.checked})} /></td>
      <td className="px-4 py-2"><input aria-label="Ordem" type="number" className="w-full border rounded p-1" value={editForm.ordem ?? ''} onChange={e => setEditForm({...editForm, ordem: e.target.value})} /></td>
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
        <h2 className="text-base font-bold text-slate-900">Gerenciar Equipe</h2>
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
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Nome</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Nome curto</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Categoria</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Turno base</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Sítio fixo</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Isento de Ações</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Custo extra</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Ativo</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Ordem</th>
                {canEdit && <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 uppercase">Ações</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white text-sm">
              {editingId === 'new' && <tr>{renderEditCells()}</tr>}
              {equipes.map(item => (
                <tr key={item.id}>
                  {editingId === item.id ? renderEditCells() : (
                    <>
                      <td className="px-4 py-2">{item.nome ?? '—'}</td>
                      <td className="px-4 py-2">{item.nome_curto ?? '—'}</td>
                      <td className="px-4 py-2">{({ 'enf': 'Enfermeira', 'tec': 'Técnica' } as Record<string, string>)[item.categoria]}</td>
                      <td className="px-4 py-2">{({ 'manha': 'Manhã', 'tarde': 'Tarde', 'noite': 'Noite', 'ambos': 'Ambos' } as Record<string, string>)[item.turno_base]}</td>
                      <td className="px-4 py-2">{item.fixo_sitio ?? '—'}</td>
                      <td className="px-4 py-2">{item.isento_acoes ? 'Sim' : 'Não'}</td>
                      <td className="px-4 py-2">{item.custo_extra ?? '—'}</td>
                      <td className="px-4 py-2">{item.ativo ? 'Sim' : 'Não'}</td>
                      <td className="px-4 py-2">{item.ordem ?? '—'}</td>
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
