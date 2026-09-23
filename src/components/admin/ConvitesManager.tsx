import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { useWorkContext } from '../../context/WorkContext';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { listarPagina } from '../../lib/paginacao';
import { DataTable } from '../DataTable';
import { RecordForm } from '../RecordForm';
export function ConvitesManager() {
 const {user,profile,isAdmin,isCoordenador} = useAuth(); const {unidadeId,unidadesDisponiveis} = useWorkContext();
 const [destino,setDestino] = useState<string | null>(null); const unidade = isAdmin ? destino ?? unidadeId : profile?.unidade_id ?? null;
 const client = useQueryClient(); const invalidar = () => client.invalidateQueries({queryKey:['convites',unidade]});
 if (!isCoordenador) return null;
 if (!isSupabaseConfigured) return <p className="p-4">Convites indisponíveis na demonstração offline.</p>;
 return <section aria-label="Convites" className="p-4 space-y-3">
 <p>O acesso será vinculado quando a pessoa entrar com este e-mail. Não é enviado e-mail automático.</p>
 {isAdmin && <label>Unidade do convite<select value={unidade ?? ''} onChange={e=>setDestino(e.target.value)}><option value="">Selecione</option>{unidadesDisponiveis.map(u=><option key={u.id} value={u.id}>{u.nome}</option>)}</select></label>}
 <DataTable<any> titulo="Convites por e-mail" queryKey={['convites',unidade]} getRowId={r=>r.id}
 fetchPage={f=>listarPagina('convites',unidade,{...f,ordem:'created_at',crescente:false})} podeEditar={!!unidade}
 columns={[{key:'email',header:'E-mail',searchable:true},{key:'role',header:'Papel'},{key:'aceito_em',header:'Estado',render:r=>r.aceito_em?'Aceito':'Pendente'}]}
 renderForm={(r,fechar)=><RecordForm inicial={r??{email:'',role:'visualizador'}} fechar={fechar} textoSalvar={r?'Salvar':'Criar convite'} textoExcluir="Revogar convite"
 fields={[{key:'email',label:'E-mail do convite',type:'email',required:true,disabled:!!r?.aceito_em},{key:'role',label:'Papel do convite',disabled:!!r?.aceito_em,options:[['visualizador','Visualizador'],['coordenador','Coordenador'],...(isAdmin?[['admin','Administrador'] as [string,string]]:[])]}]}
 salvar={async d=>{
 if (r?.aceito_em) throw new Error('Este convite já foi aceito.');
 const payload={email:d.email.trim().toLowerCase(),role:d.role};
 const q=r?supabase.from('convites').update(payload).eq('id',r.id).eq('unidade_id',unidade!).is('aceito_em',null):supabase.from('convites').insert({...payload,unidade_id:unidade,convidado_por:user.id});
 const {data,error}=await q.select('id');if(error)throw error;if(!data?.length)throw new Error('Nenhum convite gravado. Verifique sua permissão.');await invalidar();
 }} excluir={r&&!r.aceito_em?async()=>{const {data,error}=await supabase.from('convites').delete().eq('id',r.id).eq('unidade_id',unidade!).is('aceito_em',null).select('id');if(error)throw error;if(!data?.length)throw new Error('Nenhum convite revogado; ele pode ter sido aceito ou você perdeu acesso.');await invalidar();}:undefined} />}
 /></section>;
}
