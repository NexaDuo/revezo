import React, { useState } from 'react';
import { Escala, Violacao } from '../lib/solver/types';
import { canon } from '../lib/solver/utils';
import { useWorkContext } from '../context/WorkContext';
import { saveSchedule } from '../lib/db';

interface ScheduleGridProps {
  escala: Escala;
  violacoes: Violacao[];
  dias: string[];
  onUpdateEscala?: (novaEscala: Escala) => void;
}

export const ScheduleGrid: React.FC<ScheduleGridProps> = ({ escala, violacoes, dias, onUpdateEscala }) => {
  const [soltarEm, setSoltarEm] = useState<string | null>(null);
  const { podeGravar, visitante, unidadeId, semanaInicio, revalidarSemanas } = useWorkContext();
  const getViolacoes = (turno: string, sitio: string, d: number) => {
    return violacoes.filter(v => v.turno === turno && canon(v.sitio) === canon(sitio) && v.d === d);
  };

  
  const renderTurno = (turno: 'manha' | 'tarde', titulo: string) => {
    const sourceData = escala[turno] || {};
    const sitios = Object.keys(sourceData);
    const canEdit = podeGravar || visitante;

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
    const faixa = turno === 'manha' ? 'bg-manha text-manha-tinta' : 'bg-tarde text-tarde-tinta';

    return (
      <div className="mb-8 overflow-x-auto">
        <h3 className="mb-2 flex items-center gap-2 text-base font-bold text-slate-900">
          <span aria-hidden="true" className={`h-3 w-6 rounded-sm ${faixa}`} />
          {titulo}
        </h3>
        <table className="w-full min-w-[720px] table-fixed border-collapse bg-white text-sm">
          <thead>
            <tr className={faixa}>
              <th className="w-44 border border-slate-300 px-3 py-2 text-left font-bold">Sítio</th>
              {dias.map((d, i) => (
                <th key={i} className="border border-slate-300 px-3 py-2 text-left font-bold">{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sitios.map(s => (
              <tr key={s}>
                <td className="border border-slate-300 bg-slate-50 px-3 py-2 font-bold text-slate-800">{s}</td>
                {dias.map((_, d) => {
                  const nomes = sourceData[s][d] || [];
                  const vs = getViolacoes(turno, s, d);
                  const marca = vs.some(v => v.hard) ? 'marca-rigida' : vs.length ? 'marca-alerta' : '';
                  const alvo = `${turno}|${s}|${d}`;

                  return (
                    <td
                      key={d}
                      style={{ '--dia': d } as React.CSSProperties}
                      className={`preencher-dia border border-slate-300 px-3 py-2 align-top ${soltarEm === alvo ? 'bg-caneta-50 outline outline-2 -outline-offset-2 outline-caneta-500' : ''}`}
                      onDrop={canEdit ? (e) => { setSoltarEm(null); handleDrop(e, turno, s, d); } : undefined}
                      onDragOver={canEdit ? (e) => { handleDragOver(e); if (soltarEm !== alvo) setSoltarEm(alvo); } : undefined}
                      onDragLeave={canEdit ? () => setSoltarEm(atual => atual === alvo ? null : atual) : undefined}
                    >
                      {nomes.map((nome, i) => (
                        <div
                          key={i}
                          className={`w-fit rounded-sm px-1 font-medium leading-6 text-slate-900 ${marca} ${canEdit ? 'cursor-grab hover:bg-slate-100 active:cursor-grabbing' : ''}`}
                          draggable={canEdit}
                          onDragStart={canEdit ? (e) => handleDragStart(e, nome, turno, s, d) : undefined}
                          onDragEnd={() => setSoltarEm(null)}
                        >
                          {nome}
                        </div>
                      ))}
                      {vs.length > 0 && (
                        <ul data-print-hide="true" className={`mt-1 space-y-0.5 text-xs ${vs.some(v => v.hard) ? 'text-red-800' : 'text-slate-600'}`}>
                          {vs.map((v, i) => <li key={i}>{v.msg}</li>)}
                        </ul>
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
      // A chave da semana é a segunda-feira EM CONTEXTO (WorkContext), não uma
      // recalculada de `new Date()` aqui dentro — senão salvar sempre grava na
      // semana corrente, mesmo quando a grade gerada era de outra semana.
      const [ano, mes, dia] = semanaInicio.split('-').map(Number);
      const segunda = new Date(ano, (mes || 1) - 1, dia || 1);
      const sexta = new Date(segunda);
      sexta.setDate(segunda.getDate() + 4);
      const iso = (d: Date) => {
        const dd = (n: number) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${dd(d.getMonth() + 1)}-${dd(d.getDate())}`;
      };

      const score = violacoes.reduce((a, v) => a + (v.hard ? 100 : 1), 0);
      await saveSchedule(
        unidadeId,
        { escala, violacoes, score },
        `Escala de ${iso(segunda)} a ${iso(sexta)}`,
        iso(segunda), iso(sexta), dias
      );
      revalidarSemanas();
      const rigidas = violacoes.filter(v => v.hard).length;
      alert(rigidas
        ? `Escala salva como rascunho: ainda tem ${rigidas} violação(ões) rígida(s).`
        : 'Escala salva e marcada como validada.');
    } catch (e: any) {
      console.error(e);
      alert('Erro ao salvar escala: ' + (e.message || JSON.stringify(e)));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div>
      {renderTurno('manha', 'Manhã')}
      {renderTurno('tarde', 'Tarde')}

      {podeGravar && (
        <div className="mt-6 flex justify-end print:hidden">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 rounded-md bg-caneta-600 px-4 py-2 text-sm font-bold text-white hover:bg-caneta-700 disabled:opacity-50"
          >
            {isSaving ? 'Salvando...' : 'Salvar e Publicar'}
          </button>
        </div>
      )}
    </div>
  );
};
