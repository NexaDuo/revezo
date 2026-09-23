import { useState, type ReactNode } from 'react';
import { mensagemErroGravacao } from '../lib/errosGravacao';
export interface FormField { key: string; label: string; type?: 'text' | 'number' | 'checkbox' | 'email'; options?: [string, string][]; required?: boolean; disabled?: boolean }
/** Form state lives inside the modal, including write failures. */
export function RecordForm({ inicial, fields, salvar, excluir, fechar, children, textoSalvar = 'Salvar', textoExcluir = 'Excluir' }: {
  inicial: any; fields: FormField[]; salvar: (dados: any) => Promise<void>; excluir?: () => Promise<void>; fechar: () => void;
  children?: ReactNode; textoSalvar?: string; textoExcluir?: string;
}) {
  const [dados, setDados] = useState({ ...inicial }); const [erro, setErro] = useState(''); const [ocupado, setOcupado] = useState(false);
  async function executar(acao: () => Promise<void>) {
    if (ocupado) return;
    setOcupado(true); setErro('');
    try { await acao(); fechar(); } catch (e: any) { setErro(mensagemErroGravacao(e)); } finally { setOcupado(false); }
  }
  return <form className="space-y-4" onSubmit={e => { e.preventDefault(); void executar(() => salvar(dados)); }}>
    {erro && <p role="alert" className="rounded-md border-l-4 border-marca-rigida bg-red-50 px-3 py-2 text-sm text-red-900">{erro}</p>}
    <fieldset disabled={ocupado} className="space-y-3">{fields.map(f => <label key={f.key}>{f.label}{f.options ? <select aria-label={f.label} disabled={f.disabled} value={dados[f.key] ?? ''} onChange={e => setDados({ ...dados, [f.key]: e.target.value })}>{f.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select> : <input aria-label={f.label} required={f.required} disabled={f.disabled} type={f.type ?? 'text'} {...(f.type === 'checkbox' ? { checked: !!dados[f.key] } : { value: dados[f.key] ?? '' })} onChange={e => setDados({ ...dados, [f.key]: f.type === 'checkbox' ? e.target.checked : f.type === 'number' ? e.target.value === '' ? '' : Number(e.target.value) : e.target.value })} />}</label>)}{children}</fieldset>
    <div className="flex flex-wrap justify-end gap-2 pt-2"><button disabled={ocupado} type="submit">{textoSalvar}</button><button type="button" onClick={fechar}>Cancelar</button>{excluir && <button data-perigo disabled={ocupado} type="button" onClick={() => { if (confirm('Tem certeza?')) void executar(excluir); }}>{textoExcluir}</button>}</div>
  </form>;
}
