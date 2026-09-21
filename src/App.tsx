import React, { useState } from 'react';
import { useAuth } from './context/AuthContext';
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
  Layers
} from 'lucide-react';

export const App: React.FC = () => {
  const { user, profile, role, isAdmin, isCoordenador, signOut, isSupabaseConfigured } = useAuth();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isUserManagementOpen, setIsUserManagementOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'grade' | 'equipe' | 'regras' | 'historico'>('grade');

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Barra superior de navegação */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-xs">
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
            <button
              onClick={() => setActiveTab('grade')}
              className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'grade'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Calendar className="w-3.5 h-3.5 text-emerald-600" />
              Grade da Semana
            </button>
            <button
              onClick={() => setActiveTab('regras')}
              className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'regras'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
              Regras & Conferência
            </button>
            <button
              onClick={() => setActiveTab('equipe')}
              className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'equipe'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5 text-emerald-600" />
              Equipe (21)
            </button>
            <button
              onClick={() => setActiveTab('historico')}
              className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'historico'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-emerald-600" />
              Histórico
            </button>
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
        <div className="bg-amber-500 text-white text-xs py-2 px-4 text-center font-medium flex items-center justify-center gap-2">
          <Database className="w-4 h-4" />
          <span>
            <strong>Projeto Supabase criado:</strong> Adicione as credenciais no arquivo <code>.env</code> (VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY) para ativar a sincronização na nuvem e o Google OAuth oficial.
          </span>
        </div>
      )}

      {/* Conteúdo Principal */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Barra de Ações do Coordenador de Escala */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-slate-900">
                Semana 03 a 07 de Agosto / 2026
              </h1>
              <span className="text-xs bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded-full">
                0 rígidas · 1 alerta
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Grade oficial: 9 sítios × 5 dias (seg–sex) × 2 turnos (manhã / tarde)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Ações permitidas para Coordenador ou Admin */}
            {isCoordenador ? (
              <>
                <button 
                  className="flex items-center gap-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors border border-slate-300"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
                  <span>Importar Planilha (.xlsx)</span>
                </button>

                <button 
                  className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
                >
                  <Sparkles className="w-4 h-4 text-emerald-200" />
                  <span>Gerar com Solver (350 reinícios)</span>
                </button>

                <button 
                  className="flex items-center gap-2 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
                >
                  <Download className="w-4 h-4 text-blue-200" />
                  <span>Baixar Word (.docx)</span>
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

        {/* Exibição da Aba Ativa */}
        {activeTab === 'grade' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
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

            {/* Aviso de integração do solver */}
            <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 mx-auto flex items-center justify-center font-bold">
                <Calendar className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">Módulo de Grade Semanal Pronto para Port</h3>
              <p className="text-xs text-slate-600 max-w-lg mx-auto">
                O solver determinístico (350 reinícios), o validador de regras e o gerador de DOCX OOXML estão documentados em <code className="bg-slate-200 px-1 py-0.5 rounded">docs/referencia/editor_escala.html</code> e serão conectados aos componentes React tipados.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'regras' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
            <h2 className="text-base font-bold text-slate-900">Motor de Regras & Validação</h2>
            <p className="text-xs text-slate-500">
              Mesma função pontua o solver, colore as células e gera a conferência em tempo real.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 space-y-1.5">
                <span className="text-xs font-bold text-emerald-800 uppercase tracking-wide">Regras Rígidas (Hard)</span>
                <p className="text-xs text-slate-700">Disponibilidade (F/FC/FE/AT), Turno-base, Categoria do sítio, Maria fora da Vacina, Plantão não repete sítio, Dias seguidos, Sexta-para-Segunda, Dupla Vanessa+Dani P, Colocações fixas.</p>
              </div>
              <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/50 space-y-1.5">
                <span className="text-xs font-bold text-amber-800 uppercase tracking-wide">Alertas (Soft)</span>
                <p className="text-xs text-slate-700">Ações 1x na semana por profissional, Cobertura total dos sítios, Alternância 16h (Regina/Jomalba).</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'equipe' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
            <h2 className="text-base font-bold text-slate-900">Equipe da Unidade (~21 Profissionais)</h2>
            <p className="text-xs text-slate-500">
              Configuração central gerenciada no Supabase. Coordenadores podem editar profissionais e turnos-base.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <span className="text-xs font-bold text-slate-800">Enfermeiras Manhã</span>
                <p className="text-xs text-slate-600">May, Shana, Ana Cláudia, Sandra</p>
              </div>
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <span className="text-xs font-bold text-slate-800">Enfermeiras Tarde & Noite</span>
                <p className="text-xs text-slate-600">Michele (13h30), Fernanda, Carolina K, Carol V (16h), Letícia (Ensino), Allan</p>
              </div>
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <span className="text-xs font-bold text-slate-800">Técnicos de Enfermagem</span>
                <p className="text-xs text-slate-600">Vanessa, Maria, Andressa, Dani P, Luciana, Fabiano, Dani J, Nicole, Paula, Regina (16h), Jomalba (16h)</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'historico' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
            <h2 className="text-base font-bold text-slate-900">Histórico de Escalas Salvas</h2>
            <p className="text-xs text-slate-500">
              Semanas persistidas na nuvem via Supabase. A escala anterior alimenta a regra sexta-para-segunda automaticamente.
            </p>
            <div className="p-6 text-center text-xs text-slate-400 border border-slate-100 rounded-xl">
              Nenhuma outra semana arquivada ainda.
            </div>
          </div>
        )}
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
    </div>
  );
};
