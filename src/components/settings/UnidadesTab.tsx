import { useState } from 'react';
import { useWorkContext, type UnidadeOption } from '../../context/WorkContext';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { mensagemErroGravacao } from '../../lib/errosGravacao';

export const AVISO_PUBLICA = 'Qualquer pessoa, sem login, poderá ver equipe, sítios, disponibilidade e escalas desta unidade.';

function UnidadeRow({ unidade, salvar, ocupado }: {
  unidade: UnidadeOption; ocupado: boolean;
  salvar: (id: string, dados: { nome: string } | { publica: boolean }) => Promise<boolean>;
}) {
  const [nome, setNome] = useState(unidade.nome);
  const [confirmando, setConfirmando] = useState(false);
  return <section aria-label={unidade.nome} className="border rounded-lg p-4 space-y-3">
    <p className="text-sm text-slate-500">{unidade.slug} · {unidade.publica ? 'Pública' : 'Privada'}</p>
    <form className="flex flex-wrap gap-2 items-end" onSubmit={e => { e.preventDefault(); void salvar(unidade.id, { nome: nome.trim() }); }}>
      <label className="flex-1">Nome da unidade<input required className="block border rounded p-2 w-full" value={nome} onChange={e => setNome(e.target.value)} /></label>
      <button disabled={ocupado || !nome.trim()} className="border rounded p-2 disabled:opacity-50">Renomear</button>
    </form>
    <button disabled={ocupado} className="border rounded p-2 disabled:opacity-50" onClick={() => {
      if (!unidade.publica) setConfirmando(true);
      else void salvar(unidade.id, { publica: false });
    }}>{unidade.publica ? 'Tornar privada' : 'Tornar pública'}</button>
    {confirmando && <div className="bg-amber-50 border border-amber-300 rounded p-3 space-y-3">
      <p>{AVISO_PUBLICA}</p>
      <div className="flex gap-3">
        <button disabled={ocupado} className="border rounded p-2" onClick={async () => {
          if (await salvar(unidade.id, { publica: true })) setConfirmando(false);
        }}>Confirmar tornar pública</button>
        <button disabled={ocupado} onClick={() => setConfirmando(false)}>Cancelar</button>
      </div>
    </div>}
  </section>;
}

export function UnidadesTab() {
  const { unidadesDisponiveis, recarregarUnidades, erro: erroConsulta } = useWorkContext();
  const [nome, setNome] = useState('');
  const [slug, setSlug] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [sucesso, setSucesso] = useState('');
  async function gravar(id: string | null, dados: { nome: string; slug?: string } | { publica: boolean }) {
    setOcupado(true); setErro(''); setSucesso('');
    try {
      if (!isSupabaseConfigured) throw new Error('Salvar unidades não está disponível no modo demonstração.');
      const consulta = id ? supabase.from('unidades').update(dados).eq('id', id) : supabase.from('unidades').insert({ ...dados, publica: false });
      const { data, error } = await consulta.select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('Nenhuma unidade foi gravada. Verifique sua permissão.');
      recarregarUnidades();
      setSucesso('Unidade salva.');
      return true;
    } catch (e: any) { setErro(mensagemErroGravacao(e)); return false; }
    finally { setOcupado(false); }
  }
  return <div className="p-6 space-y-5">
    {erroConsulta && <p role="alert" className="text-red-700">{erroConsulta}</p>}
    {erro && <p role="alert" className="text-red-700">{erro}</p>}
    {sucesso && <p role="status">{sucesso}</p>}
    <form className="space-y-3 border-b pb-5" onSubmit={async e => {
      e.preventDefault();
      if (!/^[a-z0-9-]+$/.test(slug)) { setErro('Slug deve conter apenas letras minúsculas, números e hífens.'); return; }
      if (await gravar(null, { nome: nome.trim(), slug })) { setNome(''); setSlug(''); }
    }}>
      <h3 className="font-semibold">Nova unidade (privada)</h3>
      <label className="block">Nome da nova unidade<input required className="block border rounded p-2 w-full" value={nome} onChange={e => setNome(e.target.value)} /></label>
      <label className="block">Slug<input required pattern="[a-z0-9-]+" title="Use letras minúsculas, números e hífens." className="block border rounded p-2 w-full" value={slug} onChange={e => setSlug(e.target.value)} /></label>
      <button disabled={ocupado || !nome.trim()} className="border rounded p-2 disabled:opacity-50">Criar unidade</button>
    </form>
    {unidadesDisponiveis.map(u => <UnidadeRow key={u.id + u.nome} unidade={u} ocupado={ocupado} salvar={gravar} />)}
    {!unidadesDisponiveis.length && <p>Nenhuma unidade disponível.</p>}
  </div>;
}
