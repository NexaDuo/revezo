import React, { useState } from 'react';
import { useLocation, Routes, Route, Link } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { useWorkContext } from './context/WorkContext';
import { RoleBadge } from './components/auth/RoleBadge';
import { LoginModal } from './components/auth/LoginModal';
import { UserManagementModal } from './components/admin/UserManagementModal';
import { 
  Calendar, 
  Users, 
  CheckCircle, 
  FileSpreadsheet, 
  Download, 
  Sparkles, 
  LogIn, 
  LogOut, 
  Shield, 
  Database,
  Info,
  Layers, MapPin, CalendarCheck
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
import { loadSchedules, salvarDisponibilidade, carregarDisponibilidade } from './lib/db';
import { carregarConfigUnidade } from './lib/loadConfig';

export const App: React.FC = () => {
  const { user, profile, role, isAdmin, isCoordenador, signOut, isSupabaseConfigured } = useAuth();
  const { unidadeId, semanaInicio, erro: erroUnidade, isLoading: unidadeCarregando } = useWorkContext();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isUserManagementOpen, setIsUserManagementOpen] = useState(false);
  const location = useLocation();
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [equipeOverride, setEquipeOverride] = useState<Pessoa[] | null>(null);
  const [dispOverride, setDispOverride] = useState<Record<string, StatusDisponibilidade[]> | null>(null);
  const [diasOverride, setDiasOverride] = useState<string[] | null>(null);

  const [escala, setEscala] = useState<Escala | null>(null);
  const [currentConfig, setCurrentConfig] = useState<any>(null);
  const [violacoes, setViolacoes] = useState<Violacao[]>([]);
  const [score, setScore] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [avisos, setAvisos] = useState<string[]>([]);

  // rótulo da semana em contexto (segunda a sexta). Era uma string literal
  // "Semana 03 a 07 de Agosto / 2026" no meio do JSX; depois virou `new Date()`
  // — as duas formas ignoravam qual semana estava realmente selecionada.
  // Agora deriva de `semanaInicio` (WorkContext), a mesma data que decide o
  // que "Gerar Grade" carrega.
  const tituloSemana = React.useMemo(() => {
    const [ano, mes, dia] = semanaInicio.split('-').map(Number);
    const segunda = new Date(ano, (mes || 1) - 1, dia || 1);
    const sexta = new Date(segunda);
    sexta.setDate(segunda.getDate() + 4);
    const dd = (d: Date) => String(d.getDate()).padStart(2, '0');
    const nomeMes = sexta.toLocaleDateString('pt-BR', { month: 'long' });
    return `Semana ${dd(segunda)} a ${dd(sexta)} de ${nomeMes} / ${sexta.getFullYear()}`;
  }, [semanaInicio]);


  const handleUpdateEscala = (novaEscala: Escala) => {
    setEscala(novaEscala);
    if (currentConfig) {
      const novasViolacoes = validar(currentConfig, novaEscala);
      setViolacoes(novasViolacoes);
      const novoScore = novasViolacoes.reduce((a, x) => a + (x.hard ? 100 : 1), 0);
      setScore(novoScore);
    }
  };

  React.useEffect(() => {
    if (location.pathname === '/historico' && !unidadeCarregando) {
      loadSchedules(unidadeId).then(setSchedules).catch(console.error);
    }
  }, [location.pathname, unidadeId, unidadeCarregando]);

  const handleGerarGrade = async (eq?: Pessoa[], dp?: Record<string, StatusDisponibilidade[]>, ds?: string[]) => {
    if (!unidadeId) {
      // Sem unidade resolvida não há o que gerar — e não existe unidade
      // "padrão" segura para inventar aqui (WorkContext já mostra o erro).
      setAvisos([erroUnidade || 'Nenhuma unidade selecionada: não é possível gerar a grade.']);
      return;
    }
    setIsGenerating(true);
    try {
      // A configuração (equipe, sítios, regras ligadas/desligadas, proibições,
      // duplas e fixas) vem da unidade em contexto. É isto que faz o painel de
      // Regras valer de verdade: desligar uma regra ali muda a geração aqui.
      const base = await carregarConfigUnidade(isSupabaseConfigured, unidadeId);
      const msgs = [...base.avisos];

      let equipe = eq || equipeOverride || base.config.equipe;
      let disp = dp || dispOverride;
      let dias = ds || diasOverride;

      // Garante um roster para trabalhar antes de olhar para a disponibilidade:
      // em modo demonstração (e em qualquer unidade nova sem Equipe cadastrada)
      // `base.config.equipe` é vazio de propósito. Usa só a LISTA de nomes do
      // exemplo do caso-origem — nunca a disponibilidade dele, que é de uma
      // semana fixa (03–07/08) sem relação com a semana em contexto.
      if (!equipe.length) {
        const f = await fetchEquipe(isSupabaseConfigured);
        equipe = f.equipe;
        msgs.push(
          isSupabaseConfigured
            ? 'Nenhuma equipe cadastrada para esta unidade: usando os nomes do exemplo do caso-origem só para navegar.'
            : 'Modo demonstração: a equipe vem do exemplo do caso-origem, não de dados reais.'
        );
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
          setAvisos(msgs);
          return;
        }
      }

      dias = dias || base.config.dias;
      const config = { ...base.config, equipe, disp, dias };
      setAvisos(msgs);
      const result = generateSchedule(config);
      setEscala(result.escala);
      setViolacoes(result.violacoes);
      setScore(result.score);
      setCurrentConfig(config);
    } catch (e) {
      console.error(e);
      setAvisos([`Falha ao gerar a grade: ${(e as any)?.message || e}`]);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Barra superior de navegação */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-xs print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo & Marca */}
          <div className="flex items-center gap-3">
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
              <p className="text-xs text-slate-400 -mt-0.5">Escala de Sítio de Enfermagem</p>
            </div>
          </div>

          {/* Abas de Navegação */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
            <Link
              to="/"
              className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                location.pathname === '/'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Calendar className="w-3.5 h-3.5 text-emerald-600" />
              Grade da Semana
            </Link>
            <Link
              to="/regras"
              className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                location.pathname === '/regras'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
              Regras & Conferência
            </Link>
            <Link
              to="/equipe"
              className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                location.pathname === '/equipe'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5 text-emerald-600" />
              Equipe{currentConfig?.equipe?.length ? ` (${currentConfig.equipe.length})` : ''}
            </Link>
            <Link
              to="/sitios"
              className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                location.pathname === '/sitios'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <MapPin className="w-3.5 h-3.5 text-emerald-600" />
              Sítios
            </Link>
            <Link
              to="/disponibilidade"
              className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                location.pathname === '/disponibilidade'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CalendarCheck className="w-3.5 h-3.5 text-emerald-600" />
              Disponibilidade
            </Link>
            <Link
              to="/historico"
              className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                location.pathname === '/historico'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-emerald-600" />
              Histórico
            </Link>
          </nav>

          {/* Área de Autenticação & Perfil */}
          <div className="flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-3">
                {/* Botão de Administração (apenas para admin) */}
                {isAdmin && (
                  <button
                    onClick={() => setIsUserManagementOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors"
                  >
                    <Shield className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Gestão de Usuários</span>
                  </button>
                )}

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
                  <div className="lg:hidden">
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
                <span>Entrar com Google</span>
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

      {/* Alerta de unidade de trabalho não resolvida — WorkContext falhou alto
          em vez de inventar uma unidade default. */}
      {erroUnidade && (
        <div className="bg-red-600 text-white text-xs py-2 px-4 text-center font-medium flex items-center justify-center gap-2 print:hidden">
          <Database className="w-4 h-4" />
          <span>{erroUnidade}</span>
        </div>
      )}

      {/* Conteúdo Principal */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Barra de Ações do Coordenador de Escala */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1
                className="text-lg font-bold text-slate-900"
                data-testid="titulo-semana"
                data-semana-inicio={semanaInicio}
              >
                {tituloSemana}
              </h1>
              {score !== null ? (
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${score === 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                  {violacoes.filter(v => v.hard).length} rígidas · {violacoes.filter(v => !v.hard).length} alerta{violacoes.filter(v => !v.hard).length !== 1 ? 's' : ''} (Score: {Math.round(score)})
                </span>
              ) : (
                <span className="text-xs bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded-full">
                  Pronto para gerar
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Grade oficial: 9 sítios × 5 dias (seg–sex) × 2 turnos (manhã / tarde)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 print:hidden">
            {/* Ações permitidas para Coordenador ou Admin */}
            {isCoordenador ? (
              <>
                <button 
                  className="flex items-center gap-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors border border-slate-300"
                  onClick={() => setIsExcelModalOpen(true)}
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
                  <span>Importar Planilha (.xlsx)</span>
                </button>

                <button 
                  onClick={() => handleGerarGrade()}
                  disabled={isGenerating}
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

        {/* Exibição da Aba Ativa */}
        <Routes>
          <Route path="/" element={
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 print:hidden">
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
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
                <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300 space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 mx-auto flex items-center justify-center font-bold">
                    <Calendar className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">Módulo de Grade Semanal Pronto para Port</h3>
                  <p className="text-xs text-slate-600 max-w-lg mx-auto">
                    Clique em "Gerar Grade" para visualizar a escala gerada pelo solver.
                  </p>
                </div>
              ) : (
                <ScheduleGrid escala={escala} violacoes={violacoes} dias={diasOverride || defaultConfig.dias} onUpdateEscala={handleUpdateEscala} />
              )}
            </div>
          } />

          <Route path="/regras" element={<RegrasManager />} />
          <Route path="/equipe" element={<EquipeManager />} />
          <Route path="/sitios" element={<SitiosManager />} />
          <Route path="/disponibilidade" element={<DisponibilidadeManager />} />
          <Route path="/historico" element={
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
              <h2 className="text-base font-bold text-slate-900">Histórico de Escalas Salvas</h2>
              <p className="text-xs text-slate-500">
                Semanas persistidas na nuvem via Supabase. A escala anterior alimenta a regra sexta-para-segunda automaticamente.
              </p>
              {schedules.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400 border border-slate-100 rounded-xl">
                  Nenhuma outra semana arquivada ainda.
                </div>
              ) : (
                <ul className="space-y-3">
                  {schedules.map((sched, index) => (
                    <li key={sched.id || index} className="p-4 border border-slate-200 rounded-xl flex justify-between items-center bg-slate-50">
                      <div>
                        <h3 className="font-semibold text-sm text-slate-800">{sched.titulo}</h3>
                        <p className="text-xs text-slate-500">Início: {sched.data_inicio} | Fim: {sched.data_fim}</p>
                      </div>
                      <div className="text-xs text-slate-400">
                        Criado em {new Date(sched.created_at).toLocaleDateString()}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          } />
        </Routes>
      </main>

      {/* Modais de Autenticação e Administração */}

      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
      />

      <UserManagementModal
        isOpen={isUserManagementOpen}
        onClose={() => setIsUserManagementOpen(false)}
      />

      <ExcelImportModal
        isOpen={isExcelModalOpen}
        onClose={() => setIsExcelModalOpen(false)}
        baseEquipe={defaultConfig.equipe}
        onApply={async (equipe, disp, dias, semana) => {
          setEquipeOverride(equipe);
          setDispOverride(disp);
          setDiasOverride(dias);

          // A disponibilidade importada precisa sobreviver ao reload: até aqui
          // ela vivia só no estado do React. Reimportar a mesma semana
          // sobrescreve (chave: unidade + data_inicio).
          const extras: string[] = [];
          try {
            await salvarDisponibilidade({
              data_inicio: semana.data_inicio,
              data_fim: semana.data_fim,
              dias,
              dados: disp as Record<string, string[]>,
              origem: semana.origem,
            }, unidadeId);
            extras.push(`Disponibilidade da semana ${semana.origem.semana ?? ''} salva — dá para conferir e corrigir na aba Disponibilidade.`);
          } catch (e: any) {
            extras.push(`A grade foi gerada, mas a disponibilidade NÃO foi salva: ${e?.message || e}. Ao recarregar, esses dados se perdem.`);
          }

          await handleGerarGrade(equipe, disp, dias);
          setAvisos(a => [...a, ...extras]);
        }}
      />
    </div>
  );
};
