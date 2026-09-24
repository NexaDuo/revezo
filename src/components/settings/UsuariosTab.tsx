import { toast } from "../../lib/toast";
import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useWorkContext } from '../../context/WorkContext';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { dadosDemo, listarPagina } from '../../lib/paginacao';
import { DataTable } from '../DataTable';
import { Switch } from '../Switch';
import type { UserProfile } from '../../types/auth';
const PAPEIS: Record<string, string> = { admin: 'Administrador', coordenador: 'Coordenador de Escala', visualizador: 'Visualizador' };
function CopyableEmail({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-1.5 group">
      <span className="truncate">{email}</span>
      <button 
        onClick={(e) => {
          e.stopPropagation();
          navigator.clipboard.writeText(email);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-slate-400 hover:text-slate-600 rounded"
        title="Copiar E-mail"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

import { useMarcarSujo } from '../../lib/modal';
import { mensagemErroGravacao } from '../../lib/errosGravacao';

function UsuarioForm({ u, fechar, isAdmin, onSubmit }: {
  u: UserProfile; fechar: () => void; isAdmin: boolean;
  onSubmit: (dados: { nome: string, role: string, ativo: boolean }) => Promise<void>;
}) {
  const [nome, setNome] = useState(u.nome || '');
  const [role, setRole] = useState(u.role);
  const [ativo, setAtivo] = useState(u.ativo);
  
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  
  const original = JSON.stringify({ nome: u.nome || '', role: u.role, ativo: u.ativo });
  const atual = JSON.stringify({ nome, role, ativo });
  useMarcarSujo(atual !== original);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (ocupado) return;
    setOcupado(true);
    setErro('');
    try {
      await onSubmit({ nome, role, ativo });
      fechar();
    } catch (err: any) {
      setErro(mensagemErroGravacao(err));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {erro && (
        <div className="p-3 bg-red-50 text-red-900 border-l-4 border-marca-rigida text-sm rounded-md shadow-sm">
          {erro}
        </div>
      )}

      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
          {u.avatar_url ? (
            <img src={u.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0 ring-2 ring-white shadow-sm" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-sm text-slate-500 font-medium shrink-0 ring-2 ring-white shadow-sm">
              {u.nome?.charAt(0).toUpperCase() || u.email.charAt(0).toUpperCase() || '?'}
            </div>
          )}
          <div className="flex flex-col min-w-0 flex-1">
            <span className="font-semibold text-slate-900 truncate">{u.nome || 'Sem Nome'}</span>
            <span className="text-xs text-slate-500 truncate">{u.email}</span>
          </div>
          <button
            type="button"
            title="Copiar ID do Usuário (Clarity)"
            onClick={() => { navigator.clipboard.writeText(u.id); toast.success('ID copiado!'); }}
            className="hidden sm:block p-2 text-slate-400 hover:text-caneta-600 hover:bg-caneta-50 rounded-md transition-colors"
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>

        <fieldset disabled={ocupado} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Nome Completo</label>
            <input 
              type="text"
              value={nome}
              onChange={e => setNome(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-caneta-500 transition-shadow"
              placeholder="Nome do usuário"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Papel</label>
              <select
                value={role}
                onChange={e => setRole(e.target.value as any)}
                disabled={!isAdmin}
                className="w-full px-3 py-2 border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-caneta-500 disabled:bg-slate-100 disabled:text-slate-500 transition-shadow"
              >
                <option value="visualizador">Visualizador (Somente Leitura)</option>
                <option value="coordenador">Coordenador de Escala</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
            
            <div className="flex flex-col justify-end pb-1.5">
              <label className="flex items-center gap-2 cursor-pointer group">
                <Switch 
                  checked={ativo}
                  onChange={c => setAtivo(c)}
                />
                <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900 transition-colors">
                  Conta Ativa
                </span>
              </label>
            </div>
          </div>
        </fieldset>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 mt-6">
        <button
          type="button"
          onClick={fechar}
          disabled={ocupado}
          className="px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={ocupado || atual === original}
          className="px-4 py-2 text-sm font-semibold text-white bg-caneta-600 hover:bg-caneta-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          {ocupado ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </form>
  );
}

export function UsuariosTab() {
 const { profile, isAdmin, isCoordenador, refreshProfile, onlineUsers } = useAuth();
 const { unidadeId } = useWorkContext(); const client = useQueryClient();
 if (!isCoordenador) return null;
 const [salvando, setSalvando] = useState<string | null>(null);
 const escopo = isAdmin ? 'global' : 'unidade';
 const unidade = isAdmin ? unidadeId : profile?.unidade_id ?? null;
 const podeEditar = (u: UserProfile) => u.id !== profile?.id && (isAdmin || (u.unidade_id === profile?.unidade_id && u.role === 'visualizador'));
 if (!isSupabaseConfigured) dadosDemo('profiles', unidade, [
   {id:'demo-user-1',nome:'Pessoa Fictícia Alfa',email:'alfa@example.com',role:'visualizador',ativo:true,unidade_id:unidade},
   {id:'demo-usuario-2',nome:'Pessoa Fictícia Beta',email:'beta@example.com',role:'visualizador',ativo:true,unidade_id:unidade},
 ]);
 
 const alternarAtivo = async (u: UserProfile) => {
  if (!podeEditar(u)) return;
  setSalvando(u.id);
  try {
    const payload = { ativo: !u.ativo };
    if (isSupabaseConfigured) {
      let q = supabase.from('profiles').update(payload).eq('id',u.id);
      if (!isAdmin) q = q.eq('unidade_id',profile!.unidade_id!).eq('role','visualizador');
      const {error} = await q.select('id'); if (error) throw error;
    } else {
      const demoUser = dadosDemo('profiles',unidade).find(r=>r.id===u.id);
      if (demoUser) Object.assign(demoUser,payload);
    }
    await client.invalidateQueries({queryKey:['profiles']}); 
    await refreshProfile();
  } catch (e) {
    console.error('Erro ao alternar status', e);
    toast.error('Erro ao alterar status.');
  } finally {
    setSalvando(null);
  }
 };

 return <div className="space-y-3"><DataTable<UserProfile> titulo="Usuários" descricao="Apenas administradores podem promover ou revogar coordenadores." queryKey={['profiles', unidade]} podeCriar={false}
 fetchPage={f => listarPagina('profiles', unidade, {...f, ordem:'created_at',crescente:false}, escopo)} getRowId={u => u.id} podeEditar={podeEditar}
 columns={[
   {key:'nome',header:'Nome',searchable:true,render:u=>
     <div className="flex items-center gap-2">
       <div className="relative shrink-0 flex items-center justify-center">
         {u.avatar_url ? <img src={u.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" /> : <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-sm text-slate-500 shrink-0 font-medium">{u.nome?.charAt(0).toUpperCase() || '?'}</div>}
         {onlineUsers.has(u.id) && <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 ring-2 ring-white" title="Online" />}
       </div>
       <span className="font-medium whitespace-normal break-words">{u.nome}</span>
     </div>
   },
   {key:'email',header:'E-mail',searchable:true,className:'hidden sm:table-cell',render:u=><CopyableEmail email={u.email} />},
   {key:'role',header:'Papel',className:'hidden lg:table-cell',render:u=>PAPEIS[u.role] ?? u.role},

   {key:'ativo',header:'Ativo',className:'hidden sm:table-cell',render:u=>(
    <Switch 
      checked={u.ativo} 
      onChange={(_, e) => { e.stopPropagation(); void alternarAtivo(u); }} 
      disabled={!podeEditar(u) || salvando === u.id} 
      title={podeEditar(u) ? 'Alternar acesso' : 'Sem permissão'} 
    />
  )}
 ]}
 renderForm={(u, fechar) => u && <UsuarioForm u={u} fechar={fechar} isAdmin={isAdmin} onSubmit={async d => {
   if (!podeEditar(u)) throw new Error('Sem permissão para editar este usuário.');
   const payload = isAdmin ? {nome:d.nome,role:d.role,ativo:d.ativo} : {nome:d.nome,ativo:d.ativo};
   if (isSupabaseConfigured) {
     let q = supabase.from('profiles').update(payload).eq('id',u.id);
     if (!isAdmin) q = q.eq('unidade_id',profile!.unidade_id!).eq('role','visualizador');
     const {data,error} = await q.select('id'); if (error) throw error; if (!data?.length) throw new Error('Nenhum usuário atualizado. Verifique sua permissão.');
   } else Object.assign(dadosDemo('profiles',unidade).find(r=>r.id===u.id),payload);
   await client.invalidateQueries({queryKey:['profiles']}); await refreshProfile();
 }} />}
 /></div>;
}
