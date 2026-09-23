import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useWorkContext } from '../../context/WorkContext';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { UserRole } from '../../types/auth';

interface Convite { id: string; email: string; role: UserRole; aceito_em: string | null }

export function ConvitesManager() {
  const { user, profile, isAdmin, isCoordenador } = useAuth();
  const { unidadeId, unidadesDisponiveis } = useWorkContext();
  const [destino, setDestino] = useState(unidadeId ?? '');
  const unidade = isAdmin ? destino : profile?.unidade_id;
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('visualizador');
  const [convites, setConvites] = useState<Convite[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [revisao, setRevisao] = useState(0);
  useEffect(() => {
    let cancelado = false;
    setConvites([]); setErro(null);
    if (isSupabaseConfigured && unidade && isCoordenador) {
      void (async () => {
        const { data, error } = await supabase.from('convites').select('id,email,role,aceito_em')
          .eq('unidade_id', unidade).order('created_at', { ascending: false });
        if (cancelado) return;
        if (error) setErro(`Não foi possível listar convites: ${error.message}`);
        else setConvites(data ?? []);
      })();
    }
    return () => { cancelado = true; };
  }, [unidade, isCoordenador, revisao]);
  if (!isCoordenador) return null;
  if (!isSupabaseConfigured) return <p className="p-4">Convites indisponíveis na demonstração offline.</p>;

  const criar = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!unidade || ocupado) return;
    setOcupado(true); setErro(null);
    try {
      const { error } = await supabase.from('convites').insert({
        email: email.trim().toLowerCase(), role, unidade_id: unidade, convidado_por: user.id,
      });
      if (error) throw error;
      setEmail(''); setRevisao(r => r + 1);
    } catch (e: any) { setErro(`Não foi possível criar convite: ${e?.message || e}`); }
    finally { setOcupado(false); }
  };
  const revogar = async (id: string) => {
    setOcupado(true); setErro(null);
    try {
      const { data, error } = await supabase.from('convites').delete().eq('id', id)
        .eq('unidade_id', unidade!).is('aceito_em', null).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('Nenhum convite revogado; ele pode ter sido aceito ou você perdeu acesso.');
      setRevisao(r => r + 1);
    } catch (e: any) { setErro(`Não foi possível revogar convite: ${e?.message || e}`); }
    finally { setOcupado(false); }
  };
  return <section className="p-6 space-y-3 border-b" aria-label="Convites">
    <h3 className="font-semibold">Convites por e-mail</h3>
    <p className="text-xs text-slate-600">O acesso será vinculado quando a pessoa entrar com este e-mail. Não é enviado e-mail automático.</p>
    {erro && <p role="alert" className="text-red-700">{erro}</p>}
    <form onSubmit={criar} className="flex flex-wrap gap-3 items-end">
      <label>E-mail do convite<input required type="email" value={email} onChange={e => setEmail(e.target.value)} className="block border rounded p-2" /></label>
      <label>Papel do convite<select value={role} onChange={e => setRole(e.target.value as UserRole)} className="block border rounded p-2">
        <option value="visualizador">Visualizador</option><option value="coordenador">Coordenador</option>
        {isAdmin && <option value="admin">Administrador</option>}
      </select></label>
      {isAdmin ? <label>Unidade do convite<select required value={destino} onChange={e => setDestino(e.target.value)} className="block border rounded p-2">
        <option value="">Selecione</option>{unidadesDisponiveis.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
      </select></label> : <p>Unidade: {unidadesDisponiveis.find(u => u.id === unidade)?.nome ?? 'Sem unidade vinculada'}</p>}
      <button disabled={ocupado || !unidade} className="rounded bg-purple-700 text-white p-2 disabled:opacity-50">Criar convite</button>
    </form>
    <ul>{convites.map(c => <li key={c.id} className="flex gap-3 py-2 flex-wrap">
      <span>{c.email} · {c.role} · {c.aceito_em ? 'Aceito' : 'Pendente'}</span>
      {!c.aceito_em && <button disabled={ocupado} onClick={() => revogar(c.id)} className="underline">Revogar convite</button>}
    </li>)}</ul>
  </section>;
}
