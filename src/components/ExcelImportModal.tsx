import React, { useState, useEffect } from 'react';
import { X, FileSpreadsheet, UploadCloud } from 'lucide-react';
import { Pessoa, StatusDisponibilidade } from '../lib/solver/types';
import {
  parseExcel,
  analisar,
  MESES,
  descobrirAno,
  semanasDoMes,
  nomesCurtos,
  classificar,
} from '../lib/excelParser';

interface ExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  baseEquipe: Pessoa[];
  onApply: (
    equipe: Pessoa[],
    disp: Record<string, StatusDisponibilidade[]>,
    diasRotulos: string[],
    semana: { data_inicio: string; data_fim: string; origem: { arquivo?: string; aba?: string; semana?: string } }
  ) => void;
}

export const ExcelImportModal: React.FC<ExcelImportModalProps> = ({ isOpen, onClose, baseEquipe, onApply }) => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [uteis, setUteis] = useState<any[]>([]);
  const [selAba, setSelAba] = useState<number>(0);
  const [selSemana, setSelSemana] = useState<number>(0);
  
  const [linhasParsed, setLinhasParsed] = useState<any[]>([]);
  const [ano, setAno] = useState<number>(0);
  const [semanas, setSemanas] = useState<any[]>([]);
  const [codigos, setCodigos] = useState<string[]>([]);
  
  // reset on close
  useEffect(() => {
    if (!isOpen) {
      setFile(null);
      setUteis([]);
      setError(null);
      setLoading(false);
    }
  }, [isOpen]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setLoading(true);
    setError(null);
    try {
      const abas = await parseExcel(f);
      const ut = abas
        .map((a, i) => ({ ...a, i, info: analisar(a.celulas) }))
        .filter(a => a.info && a.info.pessoas.length >= 4 && Object.keys(a.info.colDia).length >= 20 && MESES[a.nome.toUpperCase().slice(0, 3)]);
        
      if (!ut.length) {
        setError("Não achei nenhuma aba com grade de nomes × dias.");
        setLoading(false);
        return;
      }
      
      const hoje = new Date();
      let sel = ut.findIndex(a => MESES[a.nome.toUpperCase().slice(0, 3)] === hoje.getMonth() + 1);
      if (sel < 0) sel = ut.length - 1;
      
      setUteis(ut);
      setSelAba(sel);
      setSelSemana(0);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (uteis.length > 0) {
      const aba = uteis[selAba];
      const info = aba.info;
      const mes = MESES[aba.nome.toUpperCase().slice(0, 3)] || new Date().getMonth() + 1;
      
      // guess ano from file name if possible, simple regex:
      const anoArquivo = file ? +(file.name.match(/20\d{2}/)?.[0] || 0) : null;
      const calcAno = descobrirAno(mes, info.marcadores, anoArquivo);
      setAno(calcAno);
      
      const sems = semanasDoMes(calcAno, mes);
      setSemanas(sems);
      
      if (selSemana >= sems.length) setSelSemana(0);
      
      const sem = sems[selSemana] || sems[0];
      const curtos = nomesCurtos(info.pessoas, baseEquipe);
      
      const cods = new Set<string>();
      const linhas = info.pessoas.map((p: any, i: number) => {
        const status = sem.dias.map((d: number) => {
          const bruto = p.status[d] || "";
          if (bruto) cods.add(bruto.toUpperCase());
          return classificar(bruto);
        });
        return { p, curto: curtos[i], status };
      });
      
      setLinhasParsed(linhas);
      setCodigos(Array.from(cods).sort());
    }
  }, [uteis, selAba, selSemana, file, baseEquipe]);

  const handleApply = () => {
    if (!semanas[selSemana]) return;
    const sem = semanas[selSemana];
    const newEquipe = linhasParsed.map(l => ({
      n: l.curto,
      c: l.p.c,
      t: l.p.t,
      completo: l.p.nome,
      horario: l.p.horario,
    })) as Pessoa[];
    
    for (const extra of [
      { n: "Leticia", c: "enf", t: "ambos", fixo: "Ensino" },
      { n: "Allan", c: "enf", t: "ambos", isentoAcoes: true, custoExtra: 3 },
    ]) {
      if (!newEquipe.some(p => p.n === extra.n)) newEquipe.push(extra as Pessoa);
    }
    
    const newDisp: Record<string, StatusDisponibilidade[]> = {};
    for (const l of linhasParsed) {
      newDisp[l.curto] = l.status;
    }
    for (const p of newEquipe) {
      if (!newDisp[p.n]) newDisp[p.n] = sem.rotulos.map(() => "OK");
    }
    
    onApply(newEquipe, newDisp, sem.rotulos, {
      data_inicio: sem.inicio,
      data_fim: sem.fim,
      origem: { arquivo: file?.name, aba: String(selAba ?? ''), semana: sem.label },
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
            Importar planilha (.xlsx)
          </h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-5 flex-1 overflow-y-auto">
          <p className="text-sm text-slate-600 mb-4">
            Escolha a planilha da escala mensal. Eu leio a aba do mês, as seções manhã/tarde/noite,
            a categoria de cada um e os códigos de plantão, folga e férias — você só confere e aplica.
          </p>
          
          <div className="mb-6">
            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-300 rounded-xl cursor-pointer bg-slate-50 hover:bg-slate-100">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <UploadCloud className="w-8 h-8 text-slate-400 mb-2" />
                <p className="text-sm text-slate-600">
                  <span className="font-semibold text-emerald-600">Clique para selecionar</span> ou arraste o .xlsx
                </p>
              </div>
              <input type="file" className="hidden" accept=".xlsx" onChange={handleFileChange} />
            </label>
          </div>
          
          {loading && <p className="text-sm text-slate-500">Lendo...</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          
          {uteis.length > 0 && !loading && !error && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-4 text-sm bg-slate-50 p-3 rounded-lg border border-slate-200">
                <label className="flex items-center gap-2 font-medium text-slate-700">
                  Aba do Mês:
                  <select 
                    value={selAba} 
                    onChange={e => setSelAba(Number(e.target.value))}
                    className="border-slate-300 rounded-md py-1 px-2 text-slate-700"
                  >
                    {uteis.map((a, i) => (
                      <option key={i} value={i}>{a.nome}</option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2 font-medium text-slate-700">
                  Semana:
                  <select 
                    value={selSemana} 
                    onChange={e => setSelSemana(Number(e.target.value))}
                    className="border-slate-300 rounded-md py-1 px-2 text-slate-700"
                  >
                    {semanas.map((w, i) => (
                      <option key={i} value={i}>{w.label}</option>
                    ))}
                  </select>
                </label>
                <div className="text-slate-500 ml-auto">
                  {ano} · {linhasParsed.length} profissionais · códigos: {codigos.join(", ") || "nenhum"}
                </div>
              </div>
              
              <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-xs">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-700 uppercase">
                    <tr>
                      <th className="px-3 py-2 border-b">Na Planilha</th>
                      <th className="px-3 py-2 border-b">Vira</th>
                      <th className="px-3 py-2 border-b text-center">Turno</th>
                      {semanas[selSemana]?.rotulos.map((r: string, i: number) => (
                        <th key={i} className="px-3 py-2 border-b text-center">{r.split(" ")[1]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {linhasParsed.map((l, i) => (
                      <tr key={i} className="border-b last:border-0 hover:bg-slate-50">
                        <td className="px-3 py-2 text-slate-500">{l.p.nome}</td>
                        <td className="px-3 py-2">
                          <span className="font-semibold text-slate-800">{l.curto}</span>
                          <span className="ml-1 text-[10px] text-slate-400 uppercase">{l.p.c === 'enf' ? 'enf' : 'téc'}</span>
                        </td>
                        <td className="px-3 py-2 text-center text-slate-500">{l.p.t === 'noite' ? '16h' : l.p.t}</td>
                        {l.status.map((s: string, idx: number) => (
                          <td key={idx} className={`px-3 py-2 text-center font-medium ${s === 'OK' ? 'text-slate-300' : (s === 'P' ? 'text-emerald-600' : 'text-red-500')}`}>
                            {s === 'OK' ? '·' : s}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        
        <div className="p-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50">
            Cancelar
          </button>
          <button 
            onClick={handleApply} 
            disabled={uteis.length === 0}
            className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
          >
            Aplicar semana {semanas[selSemana]?.label || ''}
          </button>
        </div>
      </div>
    </div>
  );
};
