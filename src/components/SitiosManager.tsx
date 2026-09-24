import { DataTable, TableModal } from './DataTable';
import { Switch } from './Switch';
import { listarPagina, proximaOrdem } from '../lib/paginacao';
import { useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { useWorkContext } from '../context/WorkContext';
import { addSitio, updateSitio, deleteSitio } from '../lib/db';
import { mensagemErroGravacao } from '../lib/errosGravacao';

export const SitiosManager: React.FC = () => { const { unidadeId } = useWorkContext(); return <SitiosContent key={unidadeId} />; };
const SitiosContent: React.FC = () => {
  const { podeGravar, unidadeId, isLoading: unidadeCarregando } = useWorkContext();
  const canEdit = podeGravar;
  const client = useQueryClient();
  const [erro, setErro] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [original, setOriginal] = useState('{}');

  const fetchData = () => client.invalidateQueries({ queryKey: ['sitios', unidadeId] });
  const handleAdd = async () => {
    setErro(null);
    let ordem = 1;
    try { ordem = await proximaOrdem('sitios', unidadeId); }
    catch (e: any) { setErro(mensagemErroGravacao(e)); }
    const newItem = { nome: '', nome_tarde: '', categoria_permitida: 'ambos', opcional: false, prioridade_dupla: '', ordem };
    setEditForm(newItem);
    setOriginal(JSON.stringify(newItem));
    setEditingId('new');
  };

  const handleEdit = (item: any) => {
    setErro(null);
    setEditForm({...item});
    setOriginal(JSON.stringify({...item}));
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
        setEditingId(null);
        fetchData();
      } catch (error: any) {
        console.error(error);
        setErro(mensagemErroGravacao(error));
      }
    }
  };

  const renderEditCells = () => (
    <>
      <label>Ordem<input aria-label="Ordem" type="number" value={editForm.ordem ?? ''} onChange={e => setEditForm({...editForm, ordem: e.target.value})} /></label>
      <label>Nome<input aria-label="Nome" type="text" value={editForm.nome ?? ''} onChange={e => setEditForm({...editForm, nome: e.target.value})} /></label>
      <label>Nome à tarde<input aria-label="Nome à tarde" type="text" value={editForm.nome_tarde ?? ''} onChange={e => setEditForm({...editForm, nome_tarde: e.target.value})} /></label>
      <label>Categoria permitida<select aria-label="Categoria permitida" value={editForm.categoria_permitida} onChange={e => setEditForm({...editForm, categoria_permitida: e.target.value})}><option value="enf">Enf</option><option value="tec">Téc</option><option value="ambos">Ambos</option></select></label>
      <label className="flex items-center gap-2 cursor-pointer">
        <Switch aria-label="Opcional" checked={!!editForm.opcional} onChange={c => setEditForm({...editForm, opcional: c})} />
        <span className="text-sm font-medium text-slate-700">Opcional</span>
      </label>
      <label>Prioridade de dupla<input aria-label="Prioridade de dupla" type="number" value={editForm.prioridade_dupla ?? ''} onChange={e => setEditForm({...editForm, prioridade_dupla: e.target.value})} /></label>
      <div className="flex flex-wrap justify-end gap-2 pt-2">
        {editingId !== 'new' && <button data-perigo type="button" onClick={() => handleDelete(editingId!)}>Excluir</button>}
        <button type="button" onClick={handleCancel}>Cancelar</button>
        <button type="submit" onClick={handleSave}>Salvar</button>
      </div>
    </>
  );

  return <>
    <DataTable queryKey={['sitios', unidadeId]} enabled={!unidadeCarregando}
      fetchPage={f => listarPagina('sitios', unidadeId, {...f, ordem: 'ordem'})}
      titulo="Sítios" getRowId={(r: any) => r.id} podeEditar={canEdit}
      onEdit={r => r ? handleEdit(r) : handleAdd()} columns={[{ key: 'ordem', header: 'Ordem', searchable: false, render: (item: any) => <>{item.ordem ?? '—'}</> },{ key: 'nome', header: 'Nome', searchable: true, render: (item: any) => <>{item.nome ?? '—'}</> },{ key: 'nome_tarde', header: 'Nome à tarde', searchable: true, render: (item: any) => <>{item.nome_tarde ?? '—'}</> },{ key: 'categoria_permitida', header: 'Categoria permitida', searchable: false, render: (item: any) => <>{({ 'enf': 'Enf', 'tec': 'Téc', 'ambos': 'Ambos' } as Record<string, string>)[item.categoria_permitida]}</> },{ key: 'opcional', header: 'Opcional', searchable: false, render: (item: any) => <>{item.opcional ? 'Sim' : 'Não'}</> },{ key: 'prioridade_dupla', header: 'Prioridade de dupla', searchable: false, render: (item: any) => <>{item.prioridade_dupla ?? '—'}</> }]} />
    {editingId && canEdit && <TableModal key={unidadeId} titulo={editingId === 'new' ? 'Novo registro' : 'Editar registro'} fechar={handleCancel} sujo={JSON.stringify(editForm) !== original}>
      {erro && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">{erro}</p>}
      <div className="grid gap-3">{renderEditCells()}</div>
    </TableModal>}
  </>;
};
