import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useWorkContext } from '../../context/WorkContext';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { mensagemErroGravacao } from '../../lib/errosGravacao';
import { RoleBadge } from '../auth/RoleBadge';

export function MeusDadosTab() {
  const { user, profile, refreshProfile } = useAuth();
  const { unidadesDisponiveis } = useWorkContext();
  const [nome, setNome] = useState(profile?.nome ?? '');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [sucesso, setSucesso] = useState(false);
  if (!profile) return <p role="alert">Não foi possível carregar seu perfil. Entre novamente.</p>;
  return <form className="p-6 space-y-5" onSubmit={async e => {
    e.preventDefault(); setErro(''); setSucesso(false); setSalvando(true);
    try {
      if (!isSupabaseConfigured) throw new Error('Salvar dados não está disponível no modo demonstração.');
      const { data, error } = await supabase.from('profiles').update({ nome: nome.trim() }).eq('id', user.id).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('Nenhum perfil foi atualizado. Verifique sua permissão.');
      await refreshProfile();
      setSucesso(true);
    } catch (e: any) { setErro(mensagemErroGravacao(e)); }
    finally { setSalvando(false); }
  }}>
    {profile.avatar_url
      ? <img src={profile.avatar_url} alt="Seu avatar" className="w-16 h-16 rounded-full object-cover" />
      : <div aria-label="Seu avatar" className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-xl">{(profile.nome || profile.email)[0]?.toUpperCase()}</div>}
    <label className="block">E-mail<input className="block border rounded p-2 w-full bg-slate-50" readOnly value={profile.email} /></label>
    <div>Papel: <RoleBadge role={profile.role} /></div>
    <p>Unidade: {profile.unidade_id ? unidadesDisponiveis.find(u => u.id === profile.unidade_id)?.nome ?? 'Unidade indisponível' : 'Sem unidade vinculada'}</p>
    <label className="block">Nome<input required value={nome} onChange={e => { setNome(e.target.value); setSucesso(false); }} className="block border rounded p-2 w-full" /></label>
    {!isSupabaseConfigured && <p>Salvar dados não está disponível no modo demonstração.</p>}
    {erro && <p role="alert" className="text-red-700">{erro}</p>}
    {sucesso && <p role="status">Nome salvo.</p>}
    <button disabled={salvando || !nome.trim() || !isSupabaseConfigured} className="border rounded px-4 py-2 disabled:opacity-50">{salvando ? 'Salvando...' : 'Salvar nome'}</button>
  </form>;
}
