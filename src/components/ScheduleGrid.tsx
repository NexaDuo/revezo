import React, { useState } from 'react';
import { Escala, Violacao } from '../lib/solver/types';
import { canon } from '../lib/solver/utils';
import { useWorkContext } from '../context/WorkContext';
import { X } from 'lucide-react';
import { validar } from '../lib/solver/validator';

interface ScheduleGridProps {
  escala: Escala;
  /** Por turno: linha sem sítio vivo no cadastro → motivo (fica na grade, com aviso). */
  linhasOrfas?: Record<'manha' | 'tarde', Record<string, string>>;
  violacoes: Violacao[];
  dias: string[];
  onUpdateEscala?: (novaEscala: Escala) => void;
  /** Quem decide se é versão nova ou atualização da aberta é o App. */
  onSalvar?: () => Promise<void>;
  textoSalvar?: string;
  /** Motivo para a grade estar só leitura agora (carregando, sem conferência). */
  bloqueio?: string | null;
  config?: import('../lib/solver/types').Config;
}

export const ScheduleGrid: React.FC<ScheduleGridProps> = ({ escala, linhasOrfas, violacoes, dias, onUpdateEscala, onSalvar, textoSalvar = 'Salvar e Publicar', bloqueio = null, config }) => {
  const [soltarEm, setSoltarEm] = useState<string | null>(null);
  const { podeGravar, visitante } = useWorkContext();
  const [candidatos, setCandidatos] = useState<{
    alvo: string; escala: Escala; config: ScheduleGridProps['config'];
    opcoes: { nome: string; rotulo: string; motivos: string; ordem: number }[];
  } | null>(null);
  const prepararCandidatos = (turno: 'manha' | 'tarde', sitio: string, d: number) => {
    const alvo = `${turno}|${sitio}|${d}`;
    if (!config || (candidatos?.alvo === alvo && candidatos.escala === escala && candidatos.config === config)) return;
    // O App entrega as violações da escala atual, já conferida a cada edição.
    const chave = (v: Violacao) => JSON.stringify([v.regra, v.turno, v.sitio, v.d, v.msg]);
    const atuais = new Set(violacoes.map(chave));
    const naCelula = escala[turno]?.[sitio]?.[d] || [];
    const opcoes = config.equipe.filter(p => !naCelula.includes(p.n)).map(p => {
      const simulada = structuredClone(escala);
      const linha = ((simulada[turno] ||= {})[sitio] ||= []);
      (linha[d] ||= []).push(p.n);
      const novas = validar(config, simulada).filter(v => !atuais.has(chave(v)) &&
        (v.msg.includes(p.n) || (v.turno === turno && v.sitio === sitio && v.d === d)));
      // O motivo mostrado é o da célula onde a pessoa vai entrar; o espelho em
      // outra célula (ex.: duplicidade na origem) só entra na contagem.
      const aqui = (v: Violacao) => v.turno === turno && canon(v.sitio) === canon(sitio) && v.d === d;
      const primeira = novas.find(v => v.hard && aqui(v)) || novas.find(v => v.hard) || novas.find(aqui) || novas[0];
      return {
        nome: p.n,
        rotulo: primeira ? `${p.n} — ${primeira.msg}${novas.length > 1 ? ` (+${novas.length - 1})` : ''}` : p.n,
        motivos: [...new Set(novas.map(v => v.msg))].join('\n'),
        ordem: novas.some(v => v.hard) ? 2 : novas.length ? 1 : 0,
      };
    }).sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome));
    setCandidatos({ alvo, escala, config, opcoes });
  };

  const getViolacoes = (turno: string, sitio: string, d: number) => {
    return violacoes.filter(v => v.turno === turno && canon(v.sitio) === canon(sitio) && v.d === d);
  };

  
  const renderTurno = (turno: 'manha' | 'tarde', titulo: string) => {
    const sourceData = escala[turno] || {};
    const sitios = Object.keys(sourceData);
    const canEdit = (podeGravar || visitante) && !bloqueio;

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
            {sitios.map(s => { const orfa = linhasOrfas?.[turno]?.[s]; return (
              <tr key={s} data-sitio-orfao={orfa ? 'true' : undefined}>
                <td className="border border-slate-300 bg-slate-50 px-3 py-2 font-bold text-slate-800" title={orfa ? `${orfa} — linha preservada` : undefined}>{s}
                  {orfa && <svg data-print-hide="true" aria-label={`${orfa} — linha preservada`} className="ml-1 inline h-4 w-4 text-amber-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3 2 21h20L12 3Z M12 9v5 M12 17v1" /></svg>}
                  {orfa && <span data-print-hide="true" className="mt-1 block text-xs font-normal text-amber-800">{orfa}</span>}
                </td>
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
                          className={`w-fit rounded-sm px-1 font-medium leading-6 text-slate-900 ${marca} ${canEdit ? 'cursor-grab hover:bg-slate-100 active:cursor-grabbing' : ''} group flex items-center gap-1`}
                          draggable={canEdit}
                          onDragStart={canEdit ? (e) => handleDragStart(e, nome, turno, s, d) : undefined}
                          onDragEnd={() => setSoltarEm(null)}
                        >
                          <span>{nome}</span>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!onUpdateEscala) return;
                                const novaEscala = JSON.parse(JSON.stringify(escala));
                                novaEscala[turno][s][d] = novaEscala[turno][s][d].filter((n: string) => n !== nome);
                                onUpdateEscala(novaEscala);
                              }}
                              className="hidden group-hover:flex items-center justify-center w-3.5 h-3.5 rounded-full text-slate-500 hover:bg-black/10 hover:text-red-700"
                              title="Remover"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          )}
                        </div>
                      ))}
                                            {canEdit && config && (
                        <div className="mt-1" data-print-hide="true">
                          <select
                            className="text-xs bg-transparent hover:bg-slate-50 border border-transparent hover:border-slate-200 rounded px-1 py-0.5 text-slate-500 hover:text-slate-700 w-full cursor-pointer focus:outline-none focus:ring-1 focus:ring-caneta-500 transition-colors"
                            aria-label={`Adicionar em ${s}, ${turno}, ${dias[d]}`}
                            onFocus={() => prepararCandidatos(turno, s, d)}
                            onMouseDown={() => prepararCandidatos(turno, s, d)}
                            value=""
                            onChange={(e) => {
                              if (!e.target.value || !onUpdateEscala) return;
                              const nome = e.target.value;
                              const novaEscala = JSON.parse(JSON.stringify(escala));
                              if (!novaEscala[turno]) novaEscala[turno] = {};
                              if (!novaEscala[turno][s]) novaEscala[turno][s] = [];
                              if (!novaEscala[turno][s][d]) novaEscala[turno][s][d] = [];
                              if (!novaEscala[turno][s][d].includes(nome)) {
                                novaEscala[turno][s][d].push(nome);
                                onUpdateEscala(novaEscala);
                              }
                            }}
                          >
                            <option value="">+ Adicionar</option>
                            {candidatos?.alvo === alvo && candidatos.escala === escala && candidatos.config === config &&
                              candidatos.opcoes.map(p => (
                                <option key={p.nome} value={p.nome} title={p.motivos || undefined}>{p.rotulo}</option>
                              ))}

                          </select>
                        </div>
                      )}
                      {vs.length > 0 && (
                        <ul data-print-hide="true" className={`mt-1 space-y-0.5 text-xs ${vs.some(v => v.hard) ? 'text-red-800' : 'text-slate-600'}`}>
                          {vs.map((v, i) => <li key={i}>{v.msg}</li>)}
                        </ul>
                      )}
                    </td>
                  );
                })}
              </tr>
            ); })}
          </tbody>
        </table>
      </div>
    );
  };
  const [isSaving, setIsSaving] = useState(false);
  const handleSave = async () => {
    if (!onSalvar) return;
    setIsSaving(true);
    try { await onSalvar(); } finally { setIsSaving(false); }
  };

  return (
    <div>
      {renderTurno('manha', 'Manhã')}
      {renderTurno('tarde', 'Tarde')}

      {podeGravar && onSalvar && (
        <div className="mt-6 flex flex-wrap items-center justify-end gap-3 print:hidden">
          {bloqueio && <p role="status" className="text-sm font-bold text-slate-700">{bloqueio}</p>}
          <button
            onClick={handleSave}
            disabled={isSaving || !!bloqueio}
            className="flex items-center gap-2 rounded-md bg-caneta-600 px-4 py-2 text-sm font-bold text-white hover:bg-caneta-700 disabled:opacity-50"
          >
            {isSaving ? 'Salvando...' : textoSalvar}
          </button>
        </div>
      )}
    </div>
  );
};
