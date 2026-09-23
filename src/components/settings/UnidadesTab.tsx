import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { useWorkContext, type UnidadeOption } from '../../context/WorkContext';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { listarPagina, paginarMemoria } from '../../lib/paginacao';
import { mensagemErroGravacao } from '../../lib/errosGravacao';
import { DataTable } from '../DataTable';
import { RecordForm } from '../RecordForm';
export const AVISO_PUBLICA = 'Qualquer pessoa, sem login, poderá ver equipe, sítios, disponibilidade e escalas desta unidade.';
function UnidadeForm({unidade,fechar,salvar}: {unidade:UnidadeOption|null;fechar:()=>void;salvar:(id:string|null,dados:any)=>Promise<void>}) {
 const [confirmando,setConfirmando]=useState(false);const [erro,setErro]=useState('');const [ocupado,setOcupado]=useState(false);
 async function publicar(publica:boolean) {setOcupado(true);setErro('');try{await salvar(unidade!.id,{publica});fechar();}catch(e:any){setErro(mensagemErroGravacao(e));}finally{setOcupado(false);}}
 return <div className="space-y-4">
 <RecordForm inicial={unidade??{nome:'',slug:''}} fechar={fechar} textoSalvar={unidade?'Renomear':'Criar unidade'}
 fields={[{key:'nome',label:unidade?'Nome da unidade':'Nome da nova unidade',required:true},...(!unidade?[{key:'slug',label:'Slug',required:true}]:[])]}
 salvar={async d=>{if(!d.nome.trim())throw new Error('Informe o nome.');if(!unidade&&!/^[a-z0-9-]+$/.test(d.slug))throw new Error('Slug deve conter apenas letras minúsculas, números e hífens.');await salvar(unidade?.id??null,unidade?{nome:d.nome.trim()}:{nome:d.nome.trim(),slug:d.slug,publica:false});}} />
 {erro&&<p role="alert">{erro}</p>}
 {unidade&&<><p>{unidade.slug} · {unidade.publica?'Pública':'Privada'}</p><button disabled={ocupado} onClick={()=>unidade.publica?void publicar(false):setConfirmando(true)}>{unidade.publica?'Tornar privada':'Tornar pública'}</button>
 {confirmando&&<div className="bg-amber-50 p-3"><p>{AVISO_PUBLICA}</p><button disabled={ocupado} onClick={()=>publicar(true)}>Confirmar tornar pública</button><button onClick={()=>setConfirmando(false)}>Cancelar</button></div>}</>}
 </div>;
}
export function UnidadesTab() {
 const {unidadeId,unidadesDisponiveis,recarregarUnidades}=useWorkContext();const {isAdmin}=useAuth();const client=useQueryClient();
 async function salvar(id:string|null,dados:any) {
 if(!isSupabaseConfigured)throw new Error('Salvar unidades não está disponível no modo demonstração.');
 const q=id?supabase.from('unidades').update(dados).eq('id',id):supabase.from('unidades').insert(dados);
 const {data,error}=await q.select('id');if(error)throw error;if(!data?.length)throw new Error('Nenhuma unidade foi gravada. Verifique sua permissão.');
 await client.invalidateQueries({queryKey:['unidades']});recarregarUnidades();
 }
 return <DataTable<UnidadeOption> titulo="Unidades" queryKey={['unidades',unidadeId]} getRowId={u=>u.id} podeEditar={isAdmin}
 fetchPage={f=>isSupabaseConfigured?listarPagina('unidades',unidadeId,{...f,ordem:'nome'},'global'):Promise.resolve(paginarMemoria(unidadesDisponiveis,f))}
 columns={[{key:'nome',header:'Nome',searchable:true},{key:'slug',header:'Slug',searchable:true},{key:'publica',header:'Visibilidade',render:u=>u.publica?'Pública':'Privada'}]}
 renderForm={(u,fechar)=><UnidadeForm unidade={u} fechar={fechar} salvar={salvar}/>} />;
}
