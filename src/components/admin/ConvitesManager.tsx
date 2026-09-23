import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { useWorkContext } from '../../context/WorkContext';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { listarPagina } from '../../lib/paginacao';
import { DataTable } from '../DataTable';
import { RecordForm } from '../RecordForm';
const PAPEIS: Record<string, string> = { admin: 'Administrador', coordenador: 'Coordenador', visualizador: 'Visualizador' };
const dataCurta = (iso?: string | null) => iso ? new Date(iso).toLocaleDateString('pt-BR') : '—';
export function ConvitesManager() {
 const {user,profile,isAdmin,isCoordenador} = useAuth(); const {unidadesDisponiveis} = useWorkContext();
 // Admin vê todas as unidades por padrão e filtra se quiser; coordenador só a própria.
 const [filtro,setFiltro] = useState('');
 const unidade = isAdmin ? filtro || null : profile?.unidade_id ?? null;
 const client = useQueryClient(); const invalidar = () => client.invalidateQueries({queryKey:['convites']});
 const nomeUnidade = (id: string) => unidadesDisponiveis.find(u=>u.id===id)?.nome ?? id;
 if (!isCoordenador) return null;
 if (!isSupabaseConfigured) return <p className="text-sm text-slate-600">Convites indisponíveis na demonstração offline.</p>;
 return <section aria-label="Convites" className="space-y-4">
 <DataTable<any> titulo="Convites por e-mail" descricao="O acesso é vinculado quando a pessoa entra com este e-mail. Nenhum e-mail é enviado automaticamente. Um convite pendente reserva o e-mail (só pode haver um pendente por endereço) — inclusive quando a pessoa entrou e o convite não pôde ser aplicado (por exemplo, o e-mail já pertence a outra unidade); cancele-o para liberar o e-mail para um novo convite."
 queryKey={['convites', isAdmin ? filtro || 'todas' : unidade]} getRowId={r=>r.id}
 filtros={isAdmin && <select aria-label="Filtrar por unidade" value={filtro} onChange={e=>setFiltro(e.target.value)} className="w-full rounded-md border border-slate-300 bg-white py-2 pl-3 pr-8 text-sm sm:w-48"><option value="">Todas as unidades</option>{unidadesDisponiveis.map(u=><option key={u.id} value={u.id}>{u.nome}</option>)}</select>}
 fetchPage={f=>listarPagina('convites',unidade,{...f,ordem:'created_at',crescente:false}, isAdmin && !filtro ? 'global' : 'unidade')} podeEditar={isAdmin || !!unidade}
 columns={[{key:'email',header:'E-mail',searchable:true},...(isAdmin?[{key:'unidade_id',header:'Unidade',render:(r:any)=>nomeUnidade(r.unidade_id)}]:[]),{key:'role',header:'Papel',render:r=>PAPEIS[r.role] ?? r.role},{key:'created_at',header:'Criado em',render:r=>dataCurta(r.created_at)},{key:'aceito_em',header:'Estado',render:r=>r.aceito_em?`Aceito em ${dataCurta(r.aceito_em)}`:`Pendente desde ${dataCurta(r.created_at)}`}]}
 renderForm={(r,fechar)=><RecordForm inicial={r??{email:'',role:'visualizador',unidade_id:unidade??''}} fechar={fechar} textoSalvar={r?'Salvar':'Criar convite'} textoExcluir="Revogar convite"
 fields={[{key:'email',label:'E-mail do convite',type:'email',required:true,disabled:!!r?.aceito_em},
 ...(isAdmin?[{key:'unidade_id',label:'Unidade do convite',disabled:!!r,options:[['','Selecione'] as [string,string],...unidadesDisponiveis.map(u=>[u.id,u.nome] as [string,string])]}]:[]),
 {key:'role',label:'Papel do convite',disabled:!!r?.aceito_em,options:[['visualizador','Visualizador'],['coordenador','Coordenador'],...(isAdmin?[['admin','Administrador'] as [string,string]]:[])]}]}
 salvar={async d=>{
 if (r?.aceito_em) throw new Error('Este convite já foi aceito.');
 const destino = r ? r.unidade_id : isAdmin ? d.unidade_id : unidade;
 if (!destino) throw new Error('Escolha a unidade do convite.');
 const payload={email:d.email.trim().toLowerCase(),role:d.role};
 const q=r?supabase.from('convites').update(payload).eq('id',r.id).eq('unidade_id',destino).is('aceito_em',null):supabase.from('convites').insert({...payload,unidade_id:destino,convidado_por:user.id});
 const {data,error}=await q.select('id');if(error)throw error;if(!data?.length)throw new Error('Nenhum convite gravado. Verifique sua permissão.');await invalidar();
 }} excluir={r&&!r.aceito_em?async()=>{const {data,error}=await supabase.from('convites').delete().eq('id',r.id).eq('unidade_id',r.unidade_id).is('aceito_em',null).select('id');if(error)throw error;if(!data?.length)throw new Error('Nenhum convite revogado; ele pode ter sido aceito ou você perdeu acesso.');await invalidar();}:undefined} />}
 /></section>;
}
