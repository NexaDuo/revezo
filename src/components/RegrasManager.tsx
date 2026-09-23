import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWorkContext } from '../context/WorkContext';
import { addRegra, updateRegra, deleteRegra } from '../lib/db';
import { listarPagina } from '../lib/paginacao';
import { mensagemErroGravacao } from '../lib/errosGravacao';
import { DataTable } from './DataTable';
import { RecordForm } from './RecordForm';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
export function RegrasManager() {
 const { unidadeId, podeGravar: canEdit, isLoading } = useWorkContext();
 const client = useQueryClient();
 const [erro, setErro] = useState(''); const [salvando, setSalvando] = useState<string | null>(null);
 const invalidar = () => client.invalidateQueries({ queryKey: ['regras_config', unidadeId] });
 async function alternar(r: any, campo: 'ativa' | 'rigida') {
   if (!canEdit || salvando) return;
   setSalvando(r.id); setErro('');
   try { await updateRegra(r.id, { [campo]: !r[campo] }, unidadeId); await invalidar(); }
   catch (e: any) { setErro(mensagemErroGravacao(e)); } finally { setSalvando(null); }
 }
 return <div className="space-y-3">
 {erro && <p role="alert" className="rounded-md border-l-4 border-marca-rigida bg-white px-3 py-2 text-sm text-red-900">{erro}</p>}
 <DataTable<any> titulo="Regras" descricao="Desligar uma regra aqui muda a próxima geração da grade. Rígida bloqueia (peso 100); alerta apenas avisa (peso 1)." queryKey={['regras_config', unidadeId]} enabled={!isLoading}
 fetchPage={f => listarPagina('regras_config', unidadeId, {...f, ordem: 'ordem'})} getRowId={r => r.id} podeEditar={canEdit}
 columns={[
 {key:'nome', header:'Regra', searchable:true, render:r => <><span className="font-bold">{r.nome}</span><span className="block text-xs text-slate-500">{r.chave}</span></>},
 {key:'descricao', header:'Descrição', searchable:true},
 {key:'rigida', header:'Severidade', render:r => (                  <button
                    onClick={() => alternar(r, 'rigida')}
                    disabled={!canEdit || salvando === r.id}
                    title={canEdit ? 'Alternar entre rígida e alerta' : 'Somente leitura'}
                    data-testid={`regra-severidade-${r.chave}`}
                    className={`inline-flex align-middle items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-sm font-bold text-slate-900 hover:underline disabled:cursor-not-allowed disabled:no-underline ${
                      r.rigida ? 'marca-rigida' : 'marca-alerta'
                    }`}
                  >
                    {r.rigida ? <ShieldCheck className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                    {r.rigida ? 'Rígida' : 'Alerta'}
                  </button>)},
 {key:'ativa', header:'Estado', render:r => (                  <button
                    onClick={() => alternar(r, 'ativa')}
                    disabled={!canEdit || salvando === r.id}
                    aria-pressed={r.ativa}
                    data-testid={`regra-toggle-${r.chave}`}
                    className={`relative align-middle w-11 h-6 rounded-full transition-colors disabled:cursor-not-allowed ${
                      r.ativa ? 'bg-caneta-600' : 'bg-slate-300'
                    }`}
                  >
                    {/* `left-0.5` fixa a posição de repouso dentro da trilha —
                        sem ela, o span parte do centro do botão (conteúdo
                        vazio, sem largura própria) e o translate-x-5 (20px)
                        empurra o polegar para fora da trilha de 44px. */}
                    <span
                      data-testid={`regra-toggle-knob-${r.chave}`}
                      className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                        r.ativa ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>)}
 ]}
 renderForm={(r, fechar) => <RecordForm inicial={r ?? { chave:'', nome:'', descricao:'', ativa:true, rigida:true, ordem:1 }} fechar={fechar}
 fields={[{key:'chave',label:'Chave',required:true,disabled:!!r},{key:'nome',label:'Nome',required:true},{key:'descricao',label:'Descrição'},{key:'ativa',label:'Ativa',type:'checkbox'},{key:'rigida',label:'Rígida',type:'checkbox'},{key:'ordem',label:'Ordem',type:'number',required:true}]}
 salvar={async d => { const payload = {chave:d.chave.trim(),nome:d.nome.trim(),descricao:d.descricao,ativa:d.ativa,rigida:d.rigida,ordem:d.ordem}; if (!payload.nome || !payload.chave || !Number.isInteger(payload.ordem)) throw new Error('Informe chave, nome e ordem válida.'); if (r) await updateRegra(r.id,payload,unidadeId); else await addRegra(payload,unidadeId); await invalidar(); }}
 excluir={r ? async () => { await deleteRegra(r.id,unidadeId); await invalidar(); } : undefined} />}
 />
 </div>;
}
