import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useWorkContext } from '../../context/WorkContext';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { mensagemErroGravacao } from '../../lib/errosGravacao';
import { RoleBadge } from '../auth/RoleBadge';
import { useMarcarSujo } from '../../lib/modal';

export function MeusDadosTab() {
  const { user, profile, refreshProfile } = useAuth();
  const { unidadesDisponiveis } = useWorkContext();
  const [nome, setNome] = useState(profile?.nome ?? '');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [sucesso, setSucesso] = useState(false);
  useMarcarSujo(!!profile && nome.trim() !== (profile.nome ?? ''));
  if (!profile) return <p role="alert">Não foi possível carregar seu perfil. Entre novamente.</p>;
  return <form className="max-w-lg space-y-5" onSubmit={async e => {
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
      : <div aria-label="Seu avatar" className="w-16 h-16 rounded-full bg-caneta-100 text-caneta-800 font-bold flex items-center justify-center text-xl">{(profile.nome || profile.email)[0]?.toUpperCase()}</div>}
    <label className="block text-sm font-medium text-slate-700">E-mail<input className="mt-1 block w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700" readOnly value={profile.email} /></label>
    <label className="block text-sm font-medium text-slate-700">Identificador Interno (UUID)
      <div className="mt-1 flex rounded-md shadow-sm">
        <input className="block w-full rounded-none rounded-l-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 font-mono" readOnly value={profile.id} />
        <button
          type="button"
          onClick={() => { navigator.clipboard.writeText(profile.id); alert('UUID copiado!'); }}
          className="relative -ml-px inline-flex items-center space-x-2 rounded-r-md border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 focus:border-caneta-500 focus:outline-none focus:ring-1 focus:ring-caneta-500"
        >
          Copiar
        </button>
      </div>
    </label>
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
      <dt className="font-medium text-slate-700">Papel</dt><dd><RoleBadge role={profile.role} /></dd>
      <dt className="font-medium text-slate-700">Unidade de saúde</dt><dd>{profile.unidade_id ? unidadesDisponiveis.find(u => u.id === profile.unidade_id)?.nome ?? 'Unidade indisponível' : 'Sem unidade vinculada'}</dd>
    </dl>
    <label className="block text-sm font-medium text-slate-700">Nome<input required value={nome} onChange={e => { setNome(e.target.value); setSucesso(false); }} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-caneta-500 focus:outline-none focus:ring-2 focus:ring-caneta-500" /></label>
    {!isSupabaseConfigured && <p className="text-sm text-slate-600">Salvar dados não está disponível no modo demonstração.</p>}
    {erro && <p role="alert" className="rounded-md border-l-4 border-marca-rigida bg-red-50 px-3 py-2 text-sm text-red-900">{erro}</p>}
    {sucesso && <p role="status" className="text-sm font-bold text-caneta-700">Nome salvo.</p>}
    <button disabled={salvando || !nome.trim() || !isSupabaseConfigured} className="rounded-md bg-caneta-600 px-4 py-2 text-sm font-bold text-white hover:bg-caneta-700 disabled:opacity-50">{salvando ? 'Salvando...' : 'Salvar nome'}</button>
  </form>;
}
