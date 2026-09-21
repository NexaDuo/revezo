import React, { useState } from 'react';
import { Escala, Violacao } from '../lib/solver/types';
import { canon } from '../lib/solver/utils';
import { useAuth } from '../context/AuthContext';
import { saveSchedule } from '../lib/db';

interface ScheduleGridProps {
  escala: Escala;
  violacoes: Violacao[];
  dias: string[];
}

export const ScheduleGrid: React.FC<ScheduleGridProps> = ({ escala, violacoes, dias }) => {
  const getViolacoes = (turno: string, sitio: string, d: number) => {
    return violacoes.filter(v => v.turno === turno && canon(v.sitio) === canon(sitio) && v.d === d);
  };

  const renderTurno = (turno: 'manha' | 'tarde' | 'noite', titulo: string) => {
    // Treat noite as a dummy for UI if solver doesn't output it natively
    const isNoite = turno === 'noite';
    const sourceData = isNoite ? {} : (escala[turno as 'manha' | 'tarde'] || {});
    const sitios = Object.keys(sourceData);

    if (isNoite) {
      // Just for UI requirement "M, T, N"
      return (
        <div className="mb-6 overflow-x-auto">
          <h3 className="text-md font-bold mb-2">Noite (N)</h3>
          <table className="w-full border-collapse border border-slate-200">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-200 p-2 text-left">Sítio</th>
                {dias.map((d, i) => (
                  <th key={i} className="border border-slate-200 p-2">{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-slate-200 p-2 font-semibold bg-slate-50 text-xs w-48 text-gray-400">Sem sítios noturnos</td>
                {dias.map((_, i) => <td key={i} className="border border-slate-200 p-2"></td>)}
              </tr>
            </tbody>
          </table>
        </div>
      );
    }

    if (sitios.length === 0) return null;

    return (
      <div className="mb-6 overflow-x-auto">
        <h3 className="text-md font-bold mb-2">{titulo}</h3>
        <table className="w-full border-collapse border border-slate-200">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-200 p-2 text-left">Sítio</th>
              {dias.map((d, i) => (
                <th key={i} className="border border-slate-200 p-2">{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sitios.map(s => (
              <tr key={s}>
                <td className="border border-slate-200 p-2 font-semibold bg-slate-50 text-xs w-48">{s}</td>
                {dias.map((_, d) => {
                  const nomes = sourceData[s][d] || [];
                  const vs = getViolacoes(turno, s, d);
                  const isHard = vs.some(v => v.hard);
                  const isSoft = vs.some(v => !v.hard);
                  const bgClass = isHard ? 'bg-red-100' : (isSoft ? 'bg-yellow-100' : '');

                  return (
                    <td key={d} className={`border border-slate-200 p-2 ${bgClass}`}>
                      {nomes.map((nome, i) => (
                        <div key={i} className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded m-0.5">
                          {nome}
                        </div>
                      ))}
                      {vs.length > 0 && (
                        <div className="text-[10px] text-red-600 mt-1">
                          {vs.map((v, i) => <div key={i}>• {v.msg}</div>)}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const { isAdmin, isCoordenador } = useAuth();
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const dataInicio = new Date().toISOString().split('T')[0];
      const dataFim = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      await saveSchedule({ escala, violacoes, score: 0 }, `Semana salva em ${new Date().toLocaleDateString()}`, dataInicio, dataFim);
      alert('Escala salva com sucesso!');
    } catch (e) {
      console.error(e);
      alert('Erro ao salvar escala.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div>
      {renderTurno('manha', 'Manhã (M)')}
      {renderTurno('tarde', 'Tarde (T)')}
      {renderTurno('noite', 'Noite (N)')}

      {(isAdmin || isCoordenador) && (
        <div className="mt-6 flex justify-end">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-colors disabled:opacity-50"
          >
            {isSaving ? 'Salvando...' : 'Salvar e Publicar'}
          </button>
        </div>
      )}
    </div>
  );
};
