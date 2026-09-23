import { DataTable } from './components/DataTable';
import { listarPagina, paginarMemoria } from './lib/paginacao';
import React, { useState } from 'react';
import { Link, Routes, Route, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { useWorkContext } from './context/WorkContext';
import { RoleBadge } from './components/auth/RoleBadge';
import { LoginModal } from './components/auth/LoginModal';
import { ConfiguracoesModal } from './components/settings/ConfiguracoesModal';
import { SidebarProvider, Sidebar, MobileMenuButton } from './components/layout/Sidebar';
import {
  Calendar,
  FileSpreadsheet,
  Download,
  Sparkles,
  LogIn,
  LogOut,
  Settings,
  Database,
  Info,
} from 'lucide-react';

import { fetchEquipe } from './lib/fetchData';
import { generateSchedule, defaultConfig, Escala, Violacao, validar } from './lib/solver';
import { ScheduleGrid } from './components/ScheduleGrid';
import { ExcelImportModal } from './components/ExcelImportModal';
import { EquipeManager } from './components/EquipeManager';
import { SitiosManager } from './components/SitiosManager';
import { RegrasManager } from './components/RegrasManager';
import { DisponibilidadeManager } from './components/DisponibilidadeManager';
import { Pessoa, StatusDisponibilidade } from './lib/solver/types';
import { loadSchedules, salvarDisponibilidade, carregarDisponibilidade, carregarEscala } from './lib/db';
import { semanaAnterior, sextaDaEscala } from './lib/sextaAnterior';
import { carregarConfigUnidade } from './lib/loadConfig';

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
  const [currentConfig, setCurrentConfig] = useState<any>(null);
  const [violacoes, setViolacoes] = useState<Violacao[]>([]);
  const [score, setScore] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const navigate = useNavigate();
  const semanaAbrir = React.useRef<any>(null);
  const [avisos, setAvisos] = useState<string[]>([]);

  React.useEffect(() => {
    setEscala(null); setCurrentConfig(null); setViolacoes([]); setScore(null);
    setEquipeOverride(null); setDispOverride(null); setDiasOverride(null); setAvisos([]);
    setIsExcelModalOpen(false); setIsGenerating(false);
    const salva = semanaAbrir.current;
    if (salva?.data_inicio === semanaInicio) {
      setEscala(salva.grade); setViolacoes(salva.violacoes ?? []); setScore(salva.score);
      setDiasOverride(salva.dias); semanaAbrir.current = null;
    }
  }, [unidadeId, semanaInicio]);

  const handleUpdateEscala = (novaEscala: Escala) => {
    setEscala(novaEscala);
    if (currentConfig) {
      const novasViolacoes = validar(currentConfig, novaEscala);
      setViolacoes(novasViolacoes);
      const novoScore = novasViolacoes.reduce((a, x) => a + (x.hard ? 100 : 1), 0);
      setScore(novoScore);
    }
  };

  const contextoAtual = React.useRef('');
  contextoAtual.current = `${unidadeId}:${semanaInicio}`;
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
      // A configuração (equipe, sítios, regras ligadas/desligadas, proibições,
      // duplas e fixas) vem da unidade em contexto. É isto que faz o painel de
      // Regras valer de verdade: desligar uma regra ali muda a geração aqui.
      const base = await carregarConfigUnidade(isSupabaseConfigured, unidadeId);
      if (contextoGeracao !== contextoAtual.current) return;
      const msgs = [...base.avisos];
      if (isSupabaseConfigured && !base.doBanco) { setAvisos(msgs); return; }

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
          setAvisos(msgs);
          return;
        }
        const f = await fetchEquipe(isSupabaseConfigured);
        if (contextoGeracao !== contextoAtual.current) return;
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
          if (contextoGeracao !== contextoAtual.current) return;
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
          setAvisos(msgs);
          return;
        }
      }

      // "Sexta ≠ segunda" só vale com a escala da semana anterior em mãos.
      // Sem ela a regra não tem estado: avisar, nunca fingir que aplicou.
      let sextaAnterior = base.config.sextaAnterior;
      if (base.config.regras.sextaSegunda.on) {
        const anterior = semanaAnterior(semanaInicio);
        try {
          const salva = await carregarEscala(anterior, unidadeId);
          if (contextoGeracao !== contextoAtual.current) return;
          const sexta = sextaDaEscala(salva?.grade, salva?.dias);
          if (sexta) {
            sextaAnterior = sexta;
            msgs.push(`Regra "sexta ≠ segunda" usando a escala salva da semana de ${anterior}.`);
          } else {
            msgs.push(
              salva
                ? `A escala salva da semana de ${anterior} não tem sexta-feira: a regra "sexta ≠ segunda" não foi aplicada.`
                : `Sem escala salva da semana de ${anterior}: a regra "sexta ≠ segunda" não foi aplicada.`
            );
          }
        } catch (e: any) {
          msgs.push(`Não consegui ler a escala da semana de ${anterior} (${e?.message || e}): a regra "sexta ≠ segunda" não foi aplicada.`);
        }
      }

      dias = dias || base.config.dias;
      const config = { ...base.config, equipe, disp, dias, sextaAnterior };
      setAvisos(msgs);
      const result = generateSchedule(config);
      setEscala(result.escala);
      setViolacoes(result.violacoes);
      setScore(result.score);
      setCurrentConfig(config);
    } catch (e) {
      console.error(e);
      if (contextoGeracao !== contextoAtual.current) return;
      setAvisos([`Falha ao gerar a grade: ${(e as any)?.message || e}`]);
    } finally {
      if (contextoGeracao === contextoAtual.current) setIsGenerating(false);
    }
  };

  const paginas = <>

          <Route index element={
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
              {/* Conferência e ações pertencem apenas à grade e não vão para o papel. */}
              <div data-print-hide className="flex flex-wrap items-center justify-between gap-3 print:hidden">
                <div
                  data-testid="indicador-score"
                  role={violacoes.some(v => v.hard) ? 'alert' : 'status'}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold ${score === null
                    ? 'border-slate-200 bg-slate-50 text-slate-600'
                    : violacoes.some(v => v.hard)
                      ? 'border-red-600 bg-red-100 text-red-900'
                      : score === 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        : 'border-amber-300 bg-amber-50 text-amber-900'}`}
                >
                  {score === null ? 'Nenhuma grade gerada — conferência pendente.' : (
                    <>{violacoes.filter(v => v.hard).length} rígidas · {violacoes.filter(v => !v.hard).length} alerta{violacoes.filter(v => !v.hard).length !== 1 ? 's' : ''} (Score: {Math.round(score)})</>
                  )}
                </div>
                <div role="toolbar" aria-label="Ações da grade" data-print-hide className="flex flex-wrap items-center gap-2 print:hidden">
                  {/* Ações permitidas para Coordenador ou Admin */}
                  {(podeGravar || visitante) ? (
                    <>
                      {podeGravar && <button
                        className="flex items-center gap-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors border border-slate-300"
                        onClick={() => setIsExcelModalOpen(true)}
                      >
                        <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
                        <span>Importar Planilha (.xlsx)</span>
                      </button>}

                      <button
                        onClick={() => handleGerarGrade()}
                        disabled={isGenerating || unidadeCarregando || !unidadeId}
                        className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors disabled:opacity-50"
                      >
                        <Sparkles className="w-4 h-4 text-emerald-200" />
                        <span>{isGenerating ? 'Gerando...' : 'Gerar Grade'}</span>
                      </button>

                      <button
                        onClick={() => window.print()}
                        disabled={!escala}
                        className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors disabled:opacity-50"
                      >
                        <Download className="w-4 h-4 text-slate-300" />
                        <span>Imprimir / Salvar PDF</span>
                      </button>
                    </>
                  ) : (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-500 rounded-lg text-xs">
                      <Info className="w-3.5 h-3.5" />
                      <span>Modo Leitura: Faça login como Coordenador de Escala para editar.</span>
                    </div>
                  )}
                </div>
              </div>

              {avisos.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 print:hidden">
                  <p className="text-xs font-bold text-amber-900">Atenção aos dados desta grade</p>
                  <ul className="mt-1 space-y-0.5">
                    {avisos.map((a, i) => (
                      <li key={i} className="text-xs text-amber-800">• {a}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex flex-wrap gap-3 items-center justify-between pb-3 border-b border-slate-100 print:hidden">
                <h2 className="text-base font-bold text-slate-900 flex flex-wrap items-center gap-2">
                  <span>Grade Interativa (Manhã & Tarde)</span>
                  <span className="text-xs font-normal text-slate-500">Arrastar & Soltar ativo</span>
                </h2>
                <div className="flex items-center gap-3 text-xs">
                  <span className="flex items-center gap-1.5 text-slate-600">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                    Regra Rígida (Bloqueia)
                  </span>
                  <span className="flex items-center gap-1.5 text-slate-600">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                    Alerta
                  </span>
                  <span className="flex items-center gap-1.5 text-slate-600">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                    Conforme
                  </span>
                </div>
              </div>

              {/* Aviso de integração do solver ou Grade renderizada */}
              {!escala ? (
                <div data-print-hide className="print:hidden p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300 space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 mx-auto flex items-center justify-center font-bold">
                    <Calendar className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">Nenhuma grade gerada</h3>
                  <p className="text-xs text-slate-600 max-w-lg mx-auto">
                    Clique em "Gerar Grade" para visualizar a escala gerada pelo solver.
                  </p>
                </div>
              ) : (
                <ScheduleGrid escala={escala} violacoes={violacoes} dias={currentConfig?.dias || diasOverride || defaultConfig.dias} onUpdateEscala={handleUpdateEscala} />
              )}
            </div>
          } />

          <Route path="regras" element={<RegrasManager />} />
          <Route path="equipe" element={<EquipeManager />} />
          <Route path="sitios" element={<SitiosManager />} />
          <Route path="disponibilidade" element={<DisponibilidadeManager />} />
          <Route path="historico" element={
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
              <h2 className="text-base font-bold text-slate-900">Histórico de Escalas Salvas</h2>
              <p className="text-xs text-slate-500">
                Semanas persistidas na nuvem via Supabase. A escala anterior alimenta a regra sexta-para-segunda automaticamente.
              </p>
              <DataTable<any> titulo="Histórico" queryKey={['escalas_semanais', unidadeId]} enabled={!unidadeCarregando}
                fetchPage={async f => isSupabaseConfigured ? listarPagina('escalas_semanais', unidadeId, {...f, ordem:'data_inicio', crescente:false}) : paginarMemoria(await loadSchedules(unidadeId), f)}
                getRowId={s => s.id} columns={[{key:'titulo',header:'Título',searchable:true},{key:'data_inicio',header:'Início'},{key:'data_fim',header:'Fim'}]}
                onRowClick={s => {
                  semanaAbrir.current = s;
                  if (s.data_inicio === semanaInicio) {
                    setEscala(s.grade); setViolacoes(s.violacoes ?? []); setScore(s.score); setDiasOverride(s.dias); setCurrentConfig(null); semanaAbrir.current = null;
                  }
                  const unidade = unidadesDisponiveis.find(u => u.id === unidadeId);
                  if (unidade) navigate(`/${unidade.slug}/${s.data_inicio}`);
                }} />
            </div>
          } />
          </>;

  return (
    <SidebarProvider>
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Barra superior de navegação */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-xs print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-28 md:h-16 flex flex-wrap md:flex-nowrap items-center gap-3 py-2">
          {/* Logo & Marca */}
          <div className="flex items-center gap-3">
            <MobileMenuButton />
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white font-black text-xl shadow-md shadow-emerald-100">
              R
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg tracking-tight text-slate-900">Revezo</span>
                <span className="text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.2 rounded">
                  v0.1
                </span>
              </div>
              {visitante ? <p className="text-[9px] sm:text-xs text-slate-600">Visitante — somente leitura</p> : <p className="hidden xl:block text-xs text-slate-400 -mt-0.5">Escala de Sítio de Enfermagem</p>}
            </div>
          </div>

          <div className="order-last md:order-none w-full md:w-auto min-w-0 flex items-center gap-3 text-xs">
            <label className="min-w-0 flex-1 md:flex-none">
              <span className="block text-slate-500">Hospital</span>
              {podeEscolherUnidade ? (
                <select aria-label="Hospital" value={unidadeId ?? ''} onChange={e => setUnidadeId(e.target.value)} className="w-full md:max-w-48 rounded border border-slate-300 p-1">
                  {!unidadeId && <option value="">Selecione</option>}
                  {unidadesDisponiveis.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
                </select>
              ) : <span className="block truncate md:max-w-44 font-semibold">{unidadesDisponiveis.find(u => u.id === unidadeId)?.nome ?? (unidadeCarregando ? 'Carregando hospital...' : 'Entre para escolher hospital')}</span>}
            </label>
            <label className="shrink-0">
              <span className="block text-slate-500">Semana</span>
              <select aria-label="Semana" value={semanaInicio} disabled={!unidadeId || contextoInvalido} onChange={e => setSemanaInicio(e.target.value)} className="rounded border border-slate-300 p-1">
                {semanas.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          </div>

          {/* Área de Autenticação & Perfil */}
          <div className="ml-auto flex items-center gap-2">
            {user ? (
              <div className="flex items-center gap-3">
                {/* Configurações do usuário logado */}
                  <button
                    aria-label="Configurações"
                    onClick={() => setIsConfiguracoesOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Configurações</span>
                  </button>

                {/* Perfil & Papel */}
                <div className="flex items-center gap-2.5 pl-2 sm:border-l sm:border-slate-200">
                  {profile?.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt={profile.nome || ''}
                      className="w-8 h-8 rounded-full border border-slate-200 object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-xs">
                      {(profile?.nome || profile?.email || 'U')[0]}
                    </div>
                  )}
                  <div className="hidden lg:block text-left">
                    <p className="text-xs font-semibold text-slate-900 leading-tight">
                      {profile?.nome || profile?.email}
                    </p>
                    <div className="mt-0.5">
                      <RoleBadge role={role} showIcon={true} />
                    </div>
                  </div>
                  <div className="hidden sm:block lg:hidden">
                    <RoleBadge role={role} showIcon={true} />
                  </div>
                </div>

                {/* Logout */}
                <button
                  onClick={() => signOut()}
                  title="Sair"
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsLoginModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-all"
              >
                <LogIn className="w-4 h-4" />
                <span>Entrar<span className="hidden sm:inline"> com Google</span></span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Alerta de Status do Supabase */}
      {!isSupabaseConfigured && (
        <div className="bg-amber-500 text-white text-xs py-2 px-4 text-center font-medium flex items-center justify-center gap-2 print:hidden">
          <Database className="w-4 h-4" />
          <span>
            <strong>Projeto Supabase criado:</strong> Adicione as credenciais no arquivo <code>.env</code> (VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY) para ativar a sincronização na nuvem e o Google OAuth oficial.
          </span>
        </div>
      )}

      {authError && <p role="alert" data-print-hide className="bg-amber-50 p-3 text-amber-900 print:hidden">{authError}</p>}
      {visitante && <p data-print-hide className="bg-slate-100 p-3 text-sm print:hidden">Modo visitante: entre para salvar</p>}
      {/* Alerta de unidade de trabalho não resolvida — WorkContext falhou alto
          em vez de inventar uma unidade default. */}
      {erroUnidade && (
        <div className="bg-red-600 text-white text-xs py-2 px-4 text-center font-medium flex items-center justify-center gap-2 print:hidden">
          <Database className="w-4 h-4" />
          <span>{erroUnidade} {visitante && <button className="underline" onClick={() => setIsLoginModalOpen(true)}>Entrar para acessar</button>} <Link className="underline" to={caminhoPadrao}>Ir para contexto válido</Link></span>
        </div>
      )}

      <div className="flex-1 flex min-h-0">
      <Sidebar />

      {/* Conteúdo Principal */}
      <main className="flex-1 min-w-0 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {contextoInvalido ? <p role="alert">Corrija o contexto da URL para continuar.</p> : <>
        {!unidadeCarregando && !erroUnidade && unidadeId && !disponibilidades.some(s => s.data_inicio === semanaInicio) && tela !== 'disponibilidade' && (
          <p role="status" data-print-hide className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900 print:hidden">Nenhuma disponibilidade salva para a semana de {semanaInicio}. Importe a planilha ou confira a Disponibilidade.</p>
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
