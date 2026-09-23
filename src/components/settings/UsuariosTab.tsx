import { useAuth } from '../../context/AuthContext';
import { useWorkContext } from '../../context/WorkContext';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { dadosDemo, listarPagina } from '../../lib/paginacao';
import { DataTable } from '../DataTable';
import { RecordForm } from '../RecordForm';
import type { UserProfile } from '../../types/auth';
const PAPEIS: Record<string, string> = { admin: 'Administrador', coordenador: 'Coordenador de Escala', visualizador: 'Visualizador' };
export function UsuariosTab() {
 const { profile, isAdmin, isCoordenador, refreshProfile } = useAuth();
 const { unidadeId } = useWorkContext(); const client = useQueryClient();
 if (!isCoordenador) return null;
 const escopo = isAdmin ? 'global' : 'unidade';
 const unidade = isAdmin ? unidadeId : profile?.unidade_id ?? null;
 const podeEditar = (u: UserProfile) => u.id !== profile?.id && (isAdmin || (u.unidade_id === profile?.unidade_id && u.role === 'visualizador'));
 if (!isSupabaseConfigured) dadosDemo('profiles', unidade, [
   {id:'demo-usuario-1',nome:'Pessoa Fictícia Alfa',email:'alfa@example.com',role:'visualizador',ativo:true,unidade_id:unidade},
   {id:'demo-usuario-2',nome:'Pessoa Fictícia Beta',email:'beta@example.com',role:'visualizador',ativo:true,unidade_id:unidade},
 ]);
 return <div className="space-y-3"><DataTable<UserProfile> titulo="Usuários" descricao="Apenas administradores podem promover ou revogar coordenadores." queryKey={['profiles', unidade]} podeCriar={false}
 fetchPage={f => listarPagina('profiles', unidade, {...f, ordem:'created_at',crescente:false}, escopo)} getRowId={u => u.id} podeEditar={podeEditar}
 columns={[{key:'nome',header:'Nome',searchable:true},{key:'email',header:'E-mail',searchable:true},{key:'role',header:'Papel',render:u=>PAPEIS[u.role] ?? u.role},{key:'ativo',header:'Ativo',render:u=>u.ativo?'Sim':'Não'}]}
 renderForm={(u, fechar) => u && <RecordForm inicial={u} fechar={fechar} fields={[
 {key:'role',label:'Papel',disabled:!isAdmin,options:[['visualizador','Visualizador (Somente Leitura)'],['coordenador','Coordenador de Escala'],['admin','Administrador']]},
 {key:'ativo',label:'Ativo',type:'checkbox'}]}
 salvar={async d => {
   if (!podeEditar(u)) throw new Error('Sem permissão para editar este usuário.');
   const payload = isAdmin ? {role:d.role,ativo:d.ativo} : {ativo:d.ativo};
   if (isSupabaseConfigured) {
     let q = supabase.from('profiles').update(payload).eq('id',u.id);
     if (!isAdmin) q = q.eq('unidade_id',profile!.unidade_id!).eq('role','visualizador');
     const {data,error} = await q.select('id'); if (error) throw error; if (!data?.length) throw new Error('Nenhum usuário atualizado. Verifique sua permissão.');
   } else Object.assign(dadosDemo('profiles',unidade).find(r=>r.id===u.id),payload);
   await client.invalidateQueries({queryKey:['profiles']}); await refreshProfile();
 }} />}
 /></div>;
}
