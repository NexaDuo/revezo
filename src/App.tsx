import { DataTable } from './components/DataTable';
import { listarPagina, paginarMemoria } from './lib/paginacao';
import React, { useState } from 'react';
import { Link, Routes, Route, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { useWorkContext } from './context/WorkContext';
import { RoleBadge } from './components/auth/RoleBadge';
import { LoginModal } from './components/auth/LoginModal';
import { ConfiguracoesModal } from './components/settings/ConfiguracoesModal';
import { SidebarProvider, Sidebar, MobileMenuButton } from './components/layout/Sidebar';
import {
  FileSpreadsheet,
  Printer,
  Sparkles,
  LogIn,
  LogOut,
  Settings,
  Info,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import { formatarSemana } from './lib/datas';

import { fetchEquipe } from './lib/fetchData';
import { generateSchedule, defaultConfig, Escala, Violacao, validar } from './lib/solver';
import type { Config } from './lib/solver/types';
import { canon } from './lib/solver/utils';
import { ScheduleGrid } from './components/ScheduleGrid';
import { ExcelImportModal } from './components/ExcelImportModal';
import { EquipeManager } from './components/EquipeManager';
import { SitiosManager } from './components/SitiosManager';
import { RegrasManager } from './components/RegrasManager';
import { RestricoesManager } from './components/RestricoesManager';
import { DisponibilidadeManager } from './components/DisponibilidadeManager';
import { Pessoa, StatusDisponibilidade } from './lib/solver/types';
import { loadSchedules, salvarDisponibilidade, carregarDisponibilidade, carregarEscala, carregarEscalaPorId, salvarEscalaNova, atualizarEscala, ativarEscala, ordenarVersoes, EscalaSalva } from './lib/db';
import { semanaAnterior, sextaDaEscala } from './lib/sextaAnterior';
import { carregarConfigUnidade } from './lib/loadConfig';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Mesma pontuação do validador: rígida = 100, alerta = 1. */
const pontuar = (vs: Violacao[]) => vs.reduce((a, v) => a + (v.hard ? 100 : 1), 0);
/** Soma dias a uma data YYYY-MM-DD, em UTC (sem escorregar no horário de verão). */
function somarDias(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** Sítios que a grade salva tem e a unidade não tem mais (renomeado ou
 *  apagado depois da gravação). O validador só percorre os sítios da unidade,
 *  então quem está nessas linhas não é conferido — isso tem que ir para a tela.
 *  TODO: trocar por `sitiosForaDaUnidade` de `src/lib/referenciasSitio.ts`
 *  quando o PR #33 (fix/renomear-sitio) entrar; a semântica é a mesma. */
function sitiosForaDaUnidade(grade: Partial<Escala> | null | undefined, sitios: Config['sitios']): string[] {
  const fora = new Set<string>();
  for (const turno of ['manha', 'tarde'] as const) {
    const existentes = new Set(sitios[turno].map(s => canon(s.n)));
    for (const s of Object.keys(grade?.[turno] || {})) if (!existentes.has(canon(s))) fora.add(s);
  }
  return [...fora];
}
const dataHora = (iso?: string | null) => iso
  ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

export const App: React.FC = () => {
  const { user, profile, role, error: authError, signOut, isSupabaseConfigured } = useAuth();
  const { podeGravar, visitante, unidadeId, semanaInicio, erro: erroUnidade, isLoading: unidadeCarregando, contextoInvalido, caminhoPadrao, tela, semanas, disponibilidades, unidadesDisponiveis, podeEscolherUnidade, setUnidadeId, setSemanaInicio, revalidarSemanas } = useWorkContext();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isConfiguracoesOpen, setIsConfiguracoesOpen] = useState(false);

  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [equipeOverride, setEquipeOverride] = useState<Pessoa[] | null>(null);
  const [dispOverride, setDispOverride] = useState<Record<string, StatusDisponibilidade[]> | null>(null);
  const [diasOverride, setDiasOverride] = useState<string[] | null>(null);

  const [escala, setEscala] = useState<Escala | null>(null);
  const [currentConfig, setCurrentConfig] = useState<Config | null>(null);
  const [violacoes, setViolacoes] = useState<Violacao[]>([]);
  const [score, setScore] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // `?escala=<id>` endereça uma versão específica; sem ele, a semana abre a ativa.
  const escalaPedida = searchParams.get('escala');
  // Versão salva aberta na tela. `null` com grade na tela = geração nova, ainda não salva.
  const [versao, setVersao] = useState<EscalaSalva | null>(null);
  const [modificada, setModificada] = useState(false);
  const [cargaGrade, setCargaGrade] = useState<{ carregando: boolean; erro: string | null }>({ carregando: false, erro: null });
  const [mensagemSalvar, setMensagemSalvar] = useState<{ erro: boolean; texto: string } | null>(null);
  const [erroHistorico, setErroHistorico] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  // `semanas` vem da mais recente para a mais antiga.
  const semanaVizinha = (passo: -1 | 1) => {
    const i = semanas.indexOf(semanaInicio);
    return i < 0 ? undefined : semanas[i - passo];
  };

  const contextoAtual = React.useRef('');
  contextoAtual.current = `${unidadeId}:${semanaInicio}:${escalaPedida ?? ''}`;

  /** Monta a Config da semana em contexto: unidade, disponibilidade salva e a
   *  sexta da grade ATIVA da semana anterior. Serve para gerar e para conferir
   *  uma grade salva. `config: null` = bloqueado; o motivo está em `avisos`.
   *  Quem chama descarta o resultado se o contexto mudou no meio. */
  const montarConfig = async (eq?: Pessoa[], dp?: Record<string, StatusDisponibilidade[]>, ds?: string[] | null):
    Promise<{ config: Config | null; avisos: string[] }> => {
    // A configuração (equipe, sítios, regras ligadas/desligadas, proibições,
    // duplas e fixas) vem da unidade em contexto. É isto que faz o painel de
    // Regras valer de verdade: desligar uma regra ali muda a geração aqui.
    const base = await carregarConfigUnidade(isSupabaseConfigured, unidadeId);
    const msgs = [...base.avisos];
    if (isSupabaseConfigured && !base.doBanco) return { config: null, avisos: msgs };

    let equipe = eq || equipeOverride || base.config.equipe;
    let disp = dp || dispOverride;
    let dias = ds || diasOverride;

    // O roster online vem exclusivamente da equipe da unidade; perfis de
    // acesso não são funcionários. O fallback abaixo é apenas offline.
    if (!equipe.length) {
      if (isSupabaseConfigured) {
        msgs.push(
          'Geração bloqueada: esta unidade não tem Equipe cadastrada. Cadastre a equipe da unidade ' +
          '(aba Equipe) antes de gerar a grade.'
        );
        return { config: null, avisos: msgs };
      }
      const f = await fetchEquipe(isSupabaseConfigured);
      equipe = f.equipe;
      msgs.push('Modo demonstração: a equipe vem do exemplo do caso-origem, não de dados reais.');
    }

    // Sem disponibilidade em memória, usar a semana EM CONTEXTO — não mais
    // "a última salva, seja qual for". Se a semana escolhida não tem nada
    // salvo (ou a leitura falhar), a geração BLOQUEIA: presumir "todo mundo
    // disponível" para rodar o solver é a alucinação de dado que o produto
    // não pode cometer sozinho — a coordenadora precisa saneiar a semana
    // (importar a planilha ou preencher a aba Disponibilidade) antes de ter
    // qualquer grade na mão, não só ser avisada depois de já ter uma.
    if (!disp) {
      try {
        const salva = await carregarDisponibilidade(semanaInicio, unidadeId);
        if (salva) {
          disp = salva.dados as Record<string, StatusDisponibilidade[]>;
          dias = dias || salva.dias;
          msgs.push(`Usando a disponibilidade salva da semana de ${salva.data_inicio} a ${salva.data_fim}.`);
        }
      } catch (e: any) {
        msgs.push(`Não consegui ler a disponibilidade salva (${e?.message || e}).`);
      }

      if (!disp) {
        msgs.push(
          `Geração bloqueada: sem disponibilidade confiável para a semana de ${semanaInicio}. ` +
          `Importe a planilha ou preencha a aba Disponibilidade antes de gerar a grade.`
        );
        return { config: null, avisos: msgs };
      }
    }

    // "Sexta ≠ segunda" só vale com a escala da semana anterior em mãos — a
    // versão ATIVA dela. Sem ela a regra não tem estado: avisar, nunca fingir
    // que aplicou.
    let sextaAnterior = base.config.sextaAnterior;
    if (base.config.regras.sextaSegunda.on) {
      const anterior = semanaAnterior(semanaInicio);
      try {
        const salva = await carregarEscala(anterior, unidadeId);
        const sexta = sextaDaEscala(salva?.grade, salva?.dias);
        if (sexta) {
          sextaAnterior = sexta;
          msgs.push(`Regra "sexta ≠ segunda" usando a grade ativa da semana de ${anterior}.`);
        } else {
          msgs.push(
            salva
              ? `A grade ativa da semana de ${anterior} não tem sexta-feira: a regra "sexta ≠ segunda" não foi aplicada.`
              : `Sem escala salva da semana de ${anterior}: a regra "sexta ≠ segunda" não foi aplicada.`
          );
        }
      } catch (e: any) {
        msgs.push(`Não consegui ler a escala da semana de ${anterior} (${e?.message || e}): a regra "sexta ≠ segunda" não foi aplicada.`);
      }
    }

    dias = dias || base.config.dias;
    return { config: { ...base.config, equipe, disp, dias, sextaAnterior }, avisos: msgs };
  };

  // Entrar numa semana (seletor, setas, URL ou Histórico) abre a grade salva:
  // a versão pedida em `?escala=` ou, sem ela, a ativa. Junto vem a Config da
  // semana, para que arrastar refaça a conferência.
  React.useEffect(() => {
    setEscala(null); setCurrentConfig(null); setViolacoes([]); setScore(null);
    setEquipeOverride(null); setDispOverride(null); setDiasOverride(null); setAvisos([]);
    setIsExcelModalOpen(false); setIsGenerating(false);
    setVersao(null); setModificada(false); setMensagemSalvar(null); setErroHistorico(null);
    setCargaGrade({ carregando: false, erro: null });
    if (!unidadeId || !semanaInicio) return;
    const contexto = contextoAtual.current;
    let cancelado = false;
    const vivo = () => !cancelado && contexto === contextoAtual.current;
    (async () => {
      setCargaGrade({ carregando: true, erro: null });
      let salva: EscalaSalva | null;
      try {
        if (escalaPedida && !UUID.test(escalaPedida)) throw new Error('o identificador da versão na URL é inválido');
        salva = escalaPedida
          ? await carregarEscalaPorId(escalaPedida, semanaInicio, unidadeId)
          : await carregarEscala(semanaInicio, unidadeId);
      } catch (e: any) {
        if (vivo()) setCargaGrade({ carregando: false, erro: `Não consegui carregar a grade salva desta semana (${e?.message || e}).` });
        return;
      }
      if (!vivo()) return;
      if (!salva) {
        setCargaGrade({ carregando: false, erro: escalaPedida ? 'A versão pedida na URL não existe nesta unidade e semana.' : null });
        return;
      }
      setEscala(salva.grade); setViolacoes(salva.violacoes ?? []); setScore(salva.score);
      setDiasOverride(salva.dias); setVersao(salva);
      setCargaGrade({ carregando: false, erro: null });

      let m: { config: Config | null; avisos: string[] };
      try { m = await montarConfig(undefined, undefined, salva.dias); }
      catch (e: any) { m = { config: null, avisos: [`Falha ao montar a configuração da semana: ${e?.message || e}`] }; }
      if (!vivo()) return;
      if (!m.config) {
        setAvisos([...m.avisos,
          'A grade salva foi aberta sem a configuração da semana: arrastar NÃO refaz a conferência, e as marcas mostradas são as da hora em que ela foi salva.']);
        return;
      }
      // Sítio criado (ou renomeado) depois da gravação não tem linha na grade
      // salva: entra vazio, senão o validador não tem o que percorrer.
      const grade: Escala = JSON.parse(JSON.stringify(salva.grade ?? {}));
      for (const turno of ['manha', 'tarde'] as const) {
        grade[turno] = grade[turno] || {};
        for (const s of m.config.sitios[turno]) grade[turno][s.n] = grade[turno][s.n] || m.config.dias.map(() => []);
      }
      let vs: Violacao[];
      try { vs = validar(m.config, grade); }
      catch (e: any) {
        setAvisos([...m.avisos, `Não consegui conferir a grade salva (${e?.message || e}): arrastar NÃO refaz a conferência.`]);
        return;
      }
      const agora = pontuar(vs);
      const orfaos = sitiosForaDaUnidade(salva.grade, m.config.sitios);
      setEscala(grade); setCurrentConfig(m.config); setViolacoes(vs); setScore(agora);
      setAvisos([...m.avisos,
        ...(orfaos.length ? [`A grade salva usa sítios que não existem mais: ${orfaos.join(', ')} — as pessoas nessas linhas não são conferidas.`] : []),
        ...(agora !== salva.score
        ? [`Conferência refeita com as regras e a disponibilidade de agora: score salvo ${salva.score}, agora ${agora}.`] : [])]);
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unidadeId, semanaInicio, escalaPedida]);

  const handleUpdateEscala = (novaEscala: Escala) => {
    setEscala(novaEscala);
    setModificada(true);
    setMensagemSalvar(null);
    if (currentConfig) {
      const novasViolacoes = validar(currentConfig, novaEscala);
      setViolacoes(novasViolacoes);
      setScore(pontuar(novasViolacoes));
    }
  };

  const handleGerarGrade = async (eq?: Pessoa[], dp?: Record<string, StatusDisponibilidade[]>, ds?: string[]) => {
    if (!unidadeId) {
      // Sem unidade resolvida não há o que gerar — e não existe unidade
      // "padrão" segura para inventar aqui (WorkContext já mostra o erro).
      setAvisos([erroUnidade || 'Nenhuma unidade selecionada: não é possível gerar a grade.']);
      return;
    }
    const contextoGeracao = contextoAtual.current;
    setIsGenerating(true);
    try {
      const { config, avisos: msgs } = await montarConfig(eq, dp, ds);
      if (contextoGeracao !== contextoAtual.current) return;
      setAvisos(msgs);
      if (!config) return;
      const result = generateSchedule(config);
      setEscala(result.escala);
      setViolacoes(result.violacoes);
      setScore(result.score);
      setCurrentConfig(config);
      // Grade gerada é sempre versão nova: salvar cria outra linha.
      setVersao(null); setModificada(true); setMensagemSalvar(null); setCargaGrade({ carregando: false, erro: null });
    } catch (e) {
      console.error(e);
      if (contextoGeracao !== contextoAtual.current) return;
      setAvisos([`Falha ao gerar a grade: ${(e as any)?.message || e}`]);
    } finally {
      if (contextoGeracao === contextoAtual.current) setIsGenerating(false);
    }
  };

  /** Grade nova → versão nova (vira a ativa). Grade aberta → atualiza a
   *  própria linha pelo id, sem trocar a ativa. */
  const handleSalvar = async () => {
    if (!escala) return;
    const contexto = contextoAtual.current;
    const dias = currentConfig?.dias || diasOverride || defaultConfig.dias;
    const resultado = { escala, violacoes, score: pontuar(violacoes) };
    const rigidas = violacoes.filter(v => v.hard).length;
    const situacao = rigidas ? ` Rascunho: ainda tem ${rigidas} violação(ões) rígida(s).` : ' Marcada como validada.';
    setMensagemSalvar(null);
    try {
      let salva: EscalaSalva;
      if (versao) {
        salva = await atualizarEscala(versao.id, unidadeId, { resultado, dias });
      } else {
        const fim = somarDias(semanaInicio, 4);
        salva = await salvarEscalaNova(unidadeId, {
          titulo: `Escala de ${semanaInicio} a ${fim}`, data_inicio: semanaInicio, data_fim: fim, dias, resultado,
        });
      }
      revalidarSemanas();
      if (contexto !== contextoAtual.current) return;
      setVersao(salva); setModificada(false);
      setMensagemSalvar({ erro: false, texto: (versao
        ? `Alterações salvas nesta versão${salva.ativa ? ' (a ativa da semana)' : ' — a versão ativa da semana não mudou'}.`
        : 'Nova versão salva: agora é a ativa desta semana.') + situacao });
      // A URL apontava para outra versão; a nova é a ativa, que a semana abre sem parâmetro.
      if (!versao && escalaPedida) setSearchParams({}, { replace: true });
    } catch (e: any) {
      console.error(e);
      if (contexto !== contextoAtual.current) return;
      setMensagemSalvar({ erro: true, texto: `A grade NÃO foi salva: ${e?.message || e}` });
    }
  };

  const handleAtivar = async (alvo: EscalaSalva) => {
    setErroHistorico(null);
    try {
      const ativa = await ativarEscala(alvo.id, unidadeId);
      revalidarSemanas();
      // A versão aberta na grade pode ter acabado de ganhar ou perder o posto.
      setVersao(v => !v || v.data_inicio !== ativa.data_inicio ? v
        : v.id === ativa.id ? { ...v, ativa: true, substituida_em: null }
        : v.ativa ? { ...v, ativa: false, substituida_em: new Date().toISOString() } : v);
      if (versao?.id === ativa.id) setMensagemSalvar({ erro: false, texto: 'Esta versão agora é a ativa da semana.' });
    } catch (e: any) {
      const msg = `Não consegui tornar a versão ativa: ${e?.message || e}`;
      setErroHistorico(msg);
      if (versao?.id === alvo.id) setMensagemSalvar({ erro: true, texto: msg });
    }
  };

  const paginas = <>

          <Route index element={
            <div className="space-y-5">
              {/* Conferência e ações pertencem apenas à grade e não vão para o papel. */}
              <div data-print-hide className="flex flex-wrap items-center justify-between gap-3 print:hidden">
                <div
                  data-testid="indicador-score"
                  role={violacoes.some(v => v.hard) ? 'alert' : 'status'}
                  className={`rounded-md border-l-4 px-3 py-2 text-sm font-bold ${score === null
                    ? 'border-slate-300 bg-white text-slate-600'
                    : violacoes.some(v => v.hard)
                      ? 'border-marca-rigida bg-red-100 text-red-900'
                      : score === 0 ? 'border-caneta-600 bg-white text-caneta-800'
                        : 'border-marca bg-white text-slate-900'}`}
                >
                  {score === null ? 'Nenhuma grade gerada — conferência pendente.' : (
                    <>{violacoes.filter(v => v.hard).length} rígidas · {violacoes.filter(v => !v.hard).length} alerta{violacoes.filter(v => !v.hard).length !== 1 ? 's' : ''} (Score: {Math.round(score)})</>
                  )}
                </div>
                <div role="toolbar" aria-label="Ações da grade" data-print-hide className="flex flex-wrap items-center gap-2 print:hidden">
                  {(podeGravar || visitante) ? (
                    <>
                      {podeGravar && <button
                        className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200/60"
                        onClick={() => setIsExcelModalOpen(true)}
                      >
                        <FileSpreadsheet className="h-4 w-4" />
                        <span>Importar Planilha (.xlsx)</span>
                      </button>}

                      <button
                        onClick={() => window.print()}
                        disabled={!escala}
                        className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 hover:bg-slate-100 disabled:opacity-40"
                      >
                        <Printer className="h-4 w-4" />
                        <span>Imprimir / Salvar PDF</span>
                      </button>

                      <button
                        onClick={() => handleGerarGrade()}
                        disabled={isGenerating || unidadeCarregando || !unidadeId}
                        className="flex items-center gap-2 rounded-md bg-caneta-600 px-4 py-2 text-sm font-bold text-white hover:bg-caneta-700 disabled:opacity-50"
                      >
                        <Sparkles className="h-4 w-4" />
                        <span>{isGenerating ? 'Gerando...' : 'Gerar Grade'}</span>
                      </button>
                    </>
                  ) : (
                    <p className="flex items-center gap-1.5 text-sm text-slate-600">
                      <Info className="h-4 w-4" />
                      Somente leitura: entre como coordenação para editar.
                    </p>
                  )}
                </div>
              </div>

              {avisos.length > 0 && (
                <div className="rounded-md border-l-4 border-marca bg-white px-4 py-3 print:hidden">
                  <p className="text-sm font-bold text-slate-900">Atenção aos dados desta grade</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-slate-700">
                    {avisos.map((a, i) => <li key={i}>{a}</li>)}
                  </ul>
                </div>
              )}

              {cargaGrade.erro && (
                <p role="alert" data-print-hide className="rounded-md border-l-4 border-marca-rigida bg-white px-3 py-2 text-sm font-bold text-red-900 print:hidden">
                  {cargaGrade.erro}
                </p>
              )}

              {escala && (
                <div data-testid="versao-grade" data-versao-id={versao?.id} data-print-hide className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border-l-4 bg-white px-3 py-2 text-sm print:hidden ${!versao ? 'border-slate-400' : versao.ativa ? 'border-caneta-600' : 'border-marca'}`}>
                  {!versao ? (
                    <span><b>Grade nova, ainda não salva.</b> Salvar cria uma nova versão e a torna a ativa desta semana.</span>
                  ) : versao.ativa ? (
                    <span><b>Versão ativa</b> · salva em {dataHora(versao.created_at)}{versao.updated_at && versao.updated_at !== versao.created_at && <> · atualizada em {dataHora(versao.updated_at)}</>}</span>
                  ) : (
                    <>
                      <span><b>Versão substituída em {dataHora(versao.substituida_em)}</b>: editar e salvar muda só esta versão, não a ativa.</span>
                      {podeGravar && <button type="button" onClick={() => handleAtivar(versao)} className="font-bold text-caneta-700 underline">Tornar ativa</button>}
                      <button type="button" onClick={() => setSearchParams({})} className="font-bold text-caneta-700 underline">Abrir a versão ativa</button>
                    </>
                  )}
                  {modificada && versao && <span className="font-bold text-amber-800">Alterações não salvas.</span>}
                </div>
              )}

              {mensagemSalvar && (
                <p role={mensagemSalvar.erro ? 'alert' : 'status'} data-print-hide className={`rounded-md border-l-4 bg-white px-3 py-2 text-sm print:hidden ${mensagemSalvar.erro ? 'border-marca-rigida font-bold text-red-900' : 'border-caneta-600 text-slate-800'}`}>
                  {mensagemSalvar.texto}
                </p>
              )}

              {!escala ? (
                <div data-print-hide className="print:hidden rounded-lg border border-dashed border-slate-300 px-6 py-12 text-center">
                  <p className="text-lg font-bold text-slate-900">{cargaGrade.carregando ? 'Carregando a grade salva...' : 'Nenhuma grade gerada'}</p>
                  <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">
                    Clique em "Gerar Grade" para visualizar a escala gerada pelo solver.
                  </p>
                </div>
              ) : (
                <>
                  <p data-print-hide className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600 print:hidden">
                    <span>Arraste um nome para trocar de sítio ou de dia.</span>
                    <span><span className="marca-rigida px-1 text-slate-900">Regra rígida</span> bloqueia</span>
                    <span><span className="marca-alerta px-1 text-slate-900">Alerta</span> só avisa</span>
                  </p>
                  <ScheduleGrid escala={escala} violacoes={violacoes} dias={currentConfig?.dias || diasOverride || defaultConfig.dias} onUpdateEscala={handleUpdateEscala}
                    onSalvar={handleSalvar} textoSalvar={versao ? 'Salvar nesta versão' : 'Salvar e Publicar'} />
                </>
              )}
            </div>
          } />

          <Route path="regras" element={<div className="space-y-12"><RegrasManager /><RestricoesManager /></div>} />
          <Route path="equipe" element={<EquipeManager />} />
          <Route path="sitios" element={<SitiosManager />} />
          <Route path="disponibilidade" element={<DisponibilidadeManager />} />
          <Route path="historico" element={
            <div className="space-y-3">
              {erroHistorico && <p role="alert" className="rounded-md border-l-4 border-marca-rigida bg-white px-3 py-2 text-sm font-bold text-red-900">{erroHistorico}</p>}
              <DataTable<EscalaSalva> titulo="Histórico" descricao={'Todas as versões salvas desta unidade. Cada semana tem uma versão ativa: é ela que abre na grade e que a regra "sexta ≠ segunda" usa na semana seguinte.'} queryKey={['escalas_semanais', unidadeId]} enabled={!unidadeCarregando}
                fetchPage={async f => isSupabaseConfigured
                  ? listarPagina<EscalaSalva>('escalas_semanais', unidadeId, { ...f, ordem: 'data_inicio', crescente: false,
                      desempate: [{ coluna: 'ativa', crescente: false }, { coluna: 'created_at', crescente: false }] })
                  : paginarMemoria((await loadSchedules(unidadeId)).sort(ordenarVersoes), f)}
                getRowId={s => s.id} textoAbrir="Abrir versão"
                columns={[
                  { key: 'titulo', header: 'Título', searchable: true },
                  { key: 'ativa', header: 'Situação', render: s => s.ativa
                    ? <span className="rounded-sm bg-caneta-100 px-1.5 py-0.5 text-sm font-bold text-caneta-800">Ativa</span>
                    : <span className="text-sm text-slate-600">Substituída em {dataHora(s.substituida_em)}</span> },
                  { key: 'created_at', header: 'Criada', render: s => dataHora(s.created_at) },
                  { key: 'updated_at', header: 'Atualizada', render: s => dataHora(s.updated_at ?? s.created_at) },
                  { key: 'score', header: 'Score', render: s => String(s.score ?? '—') },
                  { key: 'acoes_versao', header: '', render: s => !s.ativa && podeGravar
                    ? <button type="button" onClick={() => handleAtivar(s)} className="rounded-md px-2 py-1 text-sm font-bold text-caneta-700 hover:bg-caneta-50">Tornar ativa</button>
                    : null },
                ]}
                onRowClick={s => {
                  const unidade = unidadesDisponiveis.find(u => u.id === unidadeId);
                  if (unidade) navigate(`/${unidade.slug}/${s.data_inicio}?escala=${s.id}`);
                }} />
            </div>
          } />
          </>;

  return (
    <SidebarProvider>
    <div className="min-h-screen flex flex-col">
      {/* Cabeçalho = título da folha: hospital e semana, como no papel. */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 print:hidden">
        <div className="px-4 sm:px-6 h-28 md:h-16 flex flex-wrap md:flex-nowrap items-center gap-x-6 gap-y-1 py-2">
          <div className="flex items-center gap-2 md:w-52 md:shrink-0">
            <MobileMenuButton />
            <span className="text-xl font-extrabold tracking-tight text-caneta-700">Revezo</span>
            {visitante && <span className="text-xs text-slate-500">Visitante — somente leitura</span>}
          </div>

          <div className="order-last md:order-none w-full md:w-auto min-w-0 flex items-end gap-4">
            <label className="min-w-0 flex-1 md:flex-none">
              <span className="sr-only md:not-sr-only block text-xs text-slate-500">Hospital</span>
              {podeEscolherUnidade ? (
                <select aria-label="Hospital" value={unidadeId ?? ''} onChange={e => setUnidadeId(e.target.value)} className="w-full md:max-w-56 truncate border-0 bg-transparent p-0 pr-6 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-caneta-500 rounded-sm">
                  {!unidadeId && <option value="">Selecione</option>}
                  {unidadesDisponiveis.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
                </select>
              ) : <span className="block truncate md:max-w-56 text-sm font-bold">{unidadesDisponiveis.find(u => u.id === unidadeId)?.nome ?? (unidadeCarregando ? 'Carregando hospital...' : 'Entre para escolher hospital')}</span>}
            </label>
            <div className="shrink-0">
            <span aria-hidden="true" className="hidden md:block pl-7 text-xs text-slate-500">Semana</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Semana anterior"
                disabled={!semanaVizinha(-1) || !unidadeId || contextoInvalido}
                onClick={() => setSemanaInicio(semanaVizinha(-1)!)}
                className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <label>
                <span className="sr-only">Semana</span>
                <select aria-label="Semana" value={semanaInicio} disabled={!unidadeId || contextoInvalido} onChange={e => setSemanaInicio(e.target.value)} className="border-0 bg-transparent p-0 pr-6 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-caneta-500 rounded-sm">
                  {semanas.map(s => <option key={s} value={s}>{formatarSemana(s)}</option>)}
                </select>
              </label>
              <button
                type="button"
                aria-label="Próxima semana"
                disabled={!semanaVizinha(1) || !unidadeId || contextoInvalido}
                onClick={() => setSemanaInicio(semanaVizinha(1)!)}
                className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {user ? (
              <>
                <button
                  aria-label="Configurações"
                  onClick={() => setIsConfiguracoesOpen(true)}
                  className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-bold text-slate-700 hover:bg-slate-100"
                >
                  <Settings className="h-4 w-4" />
                  <span className="hidden sm:inline">Configurações</span>
                </button>
                <div className="flex items-center gap-2.5 pl-3 sm:border-l sm:border-slate-200">
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                  ) : (
                    <div aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full bg-caneta-100 text-sm font-bold text-caneta-800">
                      {(profile?.nome || profile?.email || 'U')[0]}
                    </div>
                  )}
                  <div className="hidden lg:block leading-tight">
                    <p className="text-sm font-bold text-slate-900">{profile?.nome || profile?.email}</p>
                    <RoleBadge role={role} />
                  </div>
                </div>
                <button onClick={() => signOut()} title="Sair" aria-label="Sair" className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900">
                  <LogOut className="h-4 w-4" />
                </button>
              </>
            ) : (
              <button
                onClick={() => setIsLoginModalOpen(true)}
                className="flex items-center gap-2 rounded-md bg-caneta-600 px-4 py-2 text-sm font-bold text-white hover:bg-caneta-700"
              >
                <LogIn className="h-4 w-4" />
                <span>Entrar<span className="hidden sm:inline"> com Google</span></span>
              </button>
            )}
          </div>
        </div>

      </header>

      {/* Uma linha de situação, não faixas coloridas empilhadas. Erro de
          contexto continua na tela — falhar alto, mas sem gritar. */}
      {(!isSupabaseConfigured || authError || visitante || erroUnidade) && (
        <div data-print-hide className="space-y-1 border-b border-slate-200 bg-white/60 px-4 py-2 text-sm sm:px-6 print:hidden">
          {erroUnidade && (
            <p className="flex flex-wrap items-center gap-x-3 font-bold text-red-800">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{erroUnidade}</span>
              {visitante && <button className="underline" onClick={() => setIsLoginModalOpen(true)}>Entrar para acessar</button>}
              <Link className="underline" to={caminhoPadrao}>Ir para contexto válido</Link>
            </p>
          )}
          {authError && <p role="alert" className="text-amber-900">{authError}</p>}
          {visitante && <p className="text-slate-600">Modo visitante: entre para salvar</p>}
          {!isSupabaseConfigured && (
            <p className="text-slate-600">Modo demonstração: sem conexão com o banco, nada é salvo.</p>
          )}
        </div>
      )}

      <div className="flex-1 flex min-h-0">
      <Sidebar />

      {/* Conteúdo Principal */}
      <main className="flex-1 min-w-0 max-w-7xl w-full px-4 sm:px-6 lg:px-10 py-6 space-y-6">
        {contextoInvalido ? <p role="alert">Corrija o contexto da URL para continuar.</p> : <>
        {!unidadeCarregando && !erroUnidade && unidadeId && !disponibilidades.some(s => s.data_inicio === semanaInicio) && tela !== 'disponibilidade' && (
          <p role="status" data-print-hide className="rounded-md border-l-4 border-marca bg-white px-3 py-2 text-sm text-slate-800 print:hidden">Nenhuma disponibilidade salva para a semana de {semanaInicio}. Importe a planilha ou confira a Disponibilidade.</p>
        )}
        {/* Exibição da Aba Ativa */}
        <Routes>
          <Route path="/:slug/:semana">{paginas}</Route>
          {paginas}
        </Routes>
        </>}
      </main>
      </div>

      {/* Modais de Autenticação e Administração */}

      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
      />

      <ConfiguracoesModal
        isOpen={isConfiguracoesOpen}
        onClose={() => setIsConfiguracoesOpen(false)}
      />

      <ExcelImportModal
        isOpen={isExcelModalOpen}
        onClose={() => setIsExcelModalOpen(false)}
        baseEquipe={defaultConfig.equipe}
        onApply={async (equipe, disp, dias, semana) => {


          // A disponibilidade importada precisa sobreviver ao reload: até aqui
          // ela vivia só no estado do React. Reimportar a mesma semana
          // sobrescreve (chave: unidade + data_inicio).
          if (!podeGravar) throw new Error('Modo visitante: entre para salvar');
          const extras: string[] = [];
          try {
            await salvarDisponibilidade({
              data_inicio: semana.data_inicio,
              data_fim: semana.data_fim,
              dias,
              dados: disp as Record<string, string[]>,
              origem: semana.origem,
            }, unidadeId);
            revalidarSemanas();
            setSemanaInicio(semana.data_inicio);
            extras.push(`Disponibilidade da semana ${semana.origem.semana ?? ''} salva — dá para conferir e corrigir na aba Disponibilidade.`);
          } catch (e: any) {
            extras.push(`A disponibilidade NÃO foi salva: ${e?.message || e}. Ao recarregar, esses dados se perdem.`);
          }

          if (semana.data_inicio === semanaInicio) {
            setEquipeOverride(equipe); setDispOverride(disp); setDiasOverride(dias);
            await handleGerarGrade(equipe, disp, dias);
          }
          setAvisos(a => [...a, ...extras]);
        }}
      />
    </div>
    </SidebarProvider>
  );
};
