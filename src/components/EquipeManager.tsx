import { DataTable, TableModal } from './DataTable';
import { listarPagina, proximaOrdem } from '../lib/paginacao';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { useWorkContext } from '../context/WorkContext';
import { addEquipe, updateEquipe, deleteEquipe, getSitios } from '../lib/db';
import { mensagemErroGravacao } from '../lib/errosGravacao';

export const EquipeManager: React.FC = () => { const { unidadeId } = useWorkContext(); return <EquipeContent key={unidadeId} />; };
const EquipeContent: React.FC = () => {
  const { podeGravar, unidadeId, isLoading: unidadeCarregando } = useWorkContext();
  const canEdit = podeGravar;
  const client = useQueryClient();
  const [erro, setErro] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});

  // Posto fixo grava o ID do sítio (FK) e mostra o nome atual: renomear o
  // sítio não deixa a pessoa apontando para um nome que não existe mais.
  const sitios = useQuery({ queryKey: ['sitios', unidadeId, 'opcoes'], queryFn: () => getSitios(unidadeId), enabled: !unidadeCarregando && !!unidadeId });
  const nomeSitio = (id: string | null) => {
    if (!id) return '—';
    const s = (sitios.data ?? []).find((x: any) => x.id === id);
    return s ? s.nome : sitios.isLoading ? '…' : 'Sítio não encontrado';
  };

  const fetchData = () => client.invalidateQueries({ queryKey: ['equipe', unidadeId] });
  const handleAdd = async () => {
    setErro(null);
    let ordem = 1;
    try { ordem = await proximaOrdem('equipe', unidadeId); }
    catch (e: any) { setErro(mensagemErroGravacao(e)); }
    const newItem = { nome: '', nome_curto: '', categoria: 'tec', turno_base: 'manha', fixo_sitio_id: '', isento_acoes: false, custo_extra: 0, ativo: true, ordem };
    setEditForm(newItem);
    setEditingId('new');
  };

  const handleEdit = (item: any) => {
    setErro(null);
    setEditForm({...item});
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
      fixo_sitio_id: editForm.fixo_sitio_id || null,
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
      <label>Nome<input aria-label="Nome" type="text" value={editForm.nome ?? ''} onChange={e => setEditForm({...editForm, nome: e.target.value})} /></label>
      <label>Nome curto<input aria-label="Nome curto" type="text" value={editForm.nome_curto ?? ''} onChange={e => setEditForm({...editForm, nome_curto: e.target.value})} /></label>
      <label>Categoria<select aria-label="Categoria" value={editForm.categoria} onChange={e => setEditForm({...editForm, categoria: e.target.value})}><option value="enf">Enfermeira</option><option value="tec">Técnica</option></select></label>
      <label>Turno base<select aria-label="Turno base" value={editForm.turno_base} onChange={e => setEditForm({...editForm, turno_base: e.target.value})}><option value="manha">Manhã</option><option value="tarde">Tarde</option><option value="noite">Noite</option><option value="ambos">Ambos</option></select></label>
      <label>Sítio fixo<select aria-label="Sítio fixo" value={editForm.fixo_sitio_id ?? ''} onChange={e => setEditForm({...editForm, fixo_sitio_id: e.target.value})}>
        <option value="">Nenhum</option>
        {(sitios.data ?? []).map((s: any) => <option key={s.id} value={s.id}>{s.nome}</option>)}
      </select></label>
      {sitios.isError && <p role="alert" className="text-sm text-red-900">Não foi possível carregar os sítios desta unidade para escolher o posto fixo.</p>}
      <label>Isento de Ações<input aria-label="Isento de Ações" type="checkbox" checked={!!editForm.isento_acoes} onChange={e => setEditForm({...editForm, isento_acoes: e.target.checked})} /></label>
      <label>Custo extra<input aria-label="Custo extra" type="number" step="any" value={editForm.custo_extra ?? ''} onChange={e => setEditForm({...editForm, custo_extra: e.target.value})} /></label>
      <label>Ativo<input aria-label="Ativo" type="checkbox" checked={!!editForm.ativo} onChange={e => setEditForm({...editForm, ativo: e.target.checked})} /></label>
      <label>Ordem<input aria-label="Ordem" type="number" value={editForm.ordem ?? ''} onChange={e => setEditForm({...editForm, ordem: e.target.value})} /></label>
      <div className="flex flex-wrap justify-end gap-2 pt-2">
        {editingId !== 'new' && <button data-perigo type="button" onClick={() => handleDelete(editingId!)}>Excluir</button>}
        <button type="button" onClick={handleCancel}>Cancelar</button>
        <button type="submit" onClick={handleSave}>Salvar</button>
      </div>
    </>
  );

  return <>
    <DataTable queryKey={['equipe', unidadeId]} enabled={!unidadeCarregando}
      fetchPage={f => listarPagina('equipe', unidadeId, {...f, ordem: 'ordem'})}
      titulo="Equipe" getRowId={(r: any) => r.id} podeEditar={canEdit}
      onEdit={r => r ? handleEdit(r) : handleAdd()} columns={[{ key: 'nome', header: 'Nome', searchable: true, render: (item: any) => <>{item.nome ?? '—'}</> },{ key: 'nome_curto', header: 'Nome curto', searchable: true, render: (item: any) => <>{item.nome_curto ?? '—'}</> },{ key: 'categoria', header: 'Categoria', searchable: false, render: (item: any) => <>{({ 'enf': 'Enfermeira', 'tec': 'Técnica' } as Record<string, string>)[item.categoria]}</> },{ key: 'turno_base', header: 'Turno base', searchable: false, render: (item: any) => <>{({ 'manha': 'Manhã', 'tarde': 'Tarde', 'noite': 'Noite', 'ambos': 'Ambos' } as Record<string, string>)[item.turno_base]}</> },{ key: 'fixo_sitio_id', header: 'Sítio fixo', searchable: false, render: (item: any) => <>{nomeSitio(item.fixo_sitio_id)}</> },{ key: 'isento_acoes', header: 'Isento de Ações', searchable: false, render: (item: any) => <>{item.isento_acoes ? 'Sim' : 'Não'}</> },{ key: 'custo_extra', header: 'Custo extra', searchable: false, render: (item: any) => <>{item.custo_extra ?? '—'}</> },{ key: 'ativo', header: 'Ativo', searchable: false, render: (item: any) => <>{item.ativo ? 'Sim' : 'Não'}</> },{ key: 'ordem', header: 'Ordem', searchable: false, render: (item: any) => <>{item.ordem ?? '—'}</> }]} />
    {editingId && canEdit && <TableModal key={unidadeId} titulo={editingId === 'new' ? 'Novo registro' : 'Editar registro'} fechar={handleCancel}>
      {erro && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">{erro}</p>}
      <div className="grid gap-3">{renderEditCells()}</div>
    </TableModal>}
  </>;
};
