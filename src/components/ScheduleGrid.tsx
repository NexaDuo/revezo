import React, { useState } from 'react';
import { Escala, Violacao } from '../lib/solver/types';
import { canon } from '../lib/solver/utils';
import { useAuth } from '../context/AuthContext';
import { saveSchedule } from '../lib/db';

interface ScheduleGridProps {
  escala: Escala;
  violacoes: Violacao[];
  dias: string[];
  onUpdateEscala?: (novaEscala: Escala) => void;
}

export const ScheduleGrid: React.FC<ScheduleGridProps> = ({ escala, violacoes, dias, onUpdateEscala }) => {
  const { isAdmin, isCoordenador } = useAuth();
  const getViolacoes = (turno: string, sitio: string, d: number) => {
    return violacoes.filter(v => v.turno === turno && canon(v.sitio) === canon(sitio) && v.d === d);
  };

  
  const renderTurno = (turno: 'manha' | 'tarde', titulo: string) => {
    const sourceData = escala[turno] || {};
    const sitios = Object.keys(sourceData);
    const canEdit = isAdmin || isCoordenador;

    const handleDragStart = (e: React.DragEvent, nome: string, sourceTurno: string, sourceSitio: string, sourceD: number) => {
      e.dataTransfer.setData('application/json', JSON.stringify({ nome, sourceTurno, sourceSitio, sourceD }));
    };

    const handleDrop = (e: React.DragEvent, targetTurno: string, targetSitio: string, targetD: number) => {
      e.preventDefault();
      if (!onUpdateEscala) return;
      
      try {
        const data = JSON.parse(e.dataTransfer.getData('application/json'));
        const { nome, sourceTurno, sourceSitio, sourceD } = data;
        
        if (sourceTurno === targetTurno && sourceSitio === targetSitio && sourceD === targetD) {
          return;
        }

        const novaEscala = JSON.parse(JSON.stringify(escala));
        
        // Remover da origem
        const sourceList = novaEscala[sourceTurno][sourceSitio][sourceD] || [];
        novaEscala[sourceTurno][sourceSitio][sourceD] = sourceList.filter((n: string) => n !== nome);

        // Adicionar no destino
        if (!novaEscala[targetTurno]) novaEscala[targetTurno] = {};
        if (!novaEscala[targetTurno][targetSitio]) novaEscala[targetTurno][targetSitio] = [];
        if (!novaEscala[targetTurno][targetSitio][targetD]) novaEscala[targetTurno][targetSitio][targetD] = [];
        
        if (!novaEscala[targetTurno][targetSitio][targetD].includes(nome)) {
          novaEscala[targetTurno][targetSitio][targetD].push(nome);
        }

        onUpdateEscala(novaEscala);
      } catch (err) {
        console.error('Error handling drop', err);
      }
    };

    const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
    };

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
                    <td 
                      key={d} 
                      className={`border border-slate-200 p-2 ${bgClass}`}
                      onDrop={canEdit ? (e) => handleDrop(e, turno, s, d) : undefined}
                      onDragOver={canEdit ? handleDragOver : undefined}
                    >
                      {nomes.map((nome, i) => (
                        <div 
                          key={i} 
                          className={`inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded m-0.5 ${canEdit ? 'cursor-move' : ''}`}
                          draggable={canEdit}
                          onDragStart={canEdit ? (e) => handleDragStart(e, nome, turno, s, d) : undefined}
                        >
                          {nome}
                        </div>
                      ))}
                      {vs.length > 0 && (
                        <div data-print-hide="true" className="text-[10px] text-red-600 mt-1">
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
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const dataInicio = new Date().toISOString().split('T')[0];
      const dataFim = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      await saveSchedule({ escala, violacoes, score: 0 }, `Semana salva em ${new Date().toLocaleDateString()}`, dataInicio, dataFim);
      alert('Escala salva com sucesso!');
    } catch (e: any) {
      console.error(e);
      alert('Erro ao salvar escala: ' + (e.message || JSON.stringify(e)));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div>
      {renderTurno('manha', 'Manhã (M)')}
      {renderTurno('tarde', 'Tarde (T)')}

      {(isAdmin || isCoordenador) && (
        <div className="mt-6 flex justify-end print:hidden">
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
