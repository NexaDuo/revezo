import { useWorkContext } from '../../context/WorkContext';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Calendar, CheckCircle, Users, MapPin, CalendarCheck, Layers,
  ChevronLeft, ChevronRight, Menu, X,
} from 'lucide-react';

const COLLAPSE_KEY = 'revezo:sidebar-collapsed';

/** Lê o estado colapsado salvo. Pode falhar (aba anônima, storage
 *  desabilitado) — a tela precisa renderizar (expandida) mesmo assim. */
function lerColapsado(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

function salvarColapsado(v: boolean) {
  try {
    localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0');
  } catch {
    // Storage indisponível: o estado só não sobrevive ao reload. Não é
    // motivo para quebrar a navegação.
  }
}

interface SidebarContextType {
  collapsed: boolean;
  toggleCollapsed: () => void;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export const SidebarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [collapsed, setCollapsed] = useState<boolean>(() => lerColapsado());
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev;
      salvarColapsado(next);
      return next;
    });
  };

  return (
    <SidebarContext.Provider value={{ collapsed, toggleCollapsed, mobileOpen, setMobileOpen }}>
      {children}
    </SidebarContext.Provider>
  );
};

const MQ_DESKTOP = '(min-width: 768px)'; // breakpoint `md` do Tailwind

/** true em telas md+, onde a sidebar fica em fluxo. matchMedia pode faltar
 *  (ambiente sem DOM completo): assume desktop, que é o layout sem drawer. */
function useDesktop(): boolean {
  const [desktop, setDesktop] = useState(() => {
    try { return window.matchMedia(MQ_DESKTOP).matches; } catch { return true; }
  });
  useEffect(() => {
    let mq: MediaQueryList;
    try { mq = window.matchMedia(MQ_DESKTOP); } catch { return; }
    const onChange = () => setDesktop(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return desktop;
}

function useSidebarState() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error('useSidebarState deve ser usado dentro de um SidebarProvider');
  return ctx;
}

/** Botão hambúrguer, para o header. Só aparece abaixo de `md` — hoje não
 *  existe menu nenhum nesse tamanho de tela. */
export const MobileMenuButton: React.FC = () => {
  const { mobileOpen, setMobileOpen } = useSidebarState();
  return (
    <button
      type="button"
      className="md:hidden p-2 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors print:hidden"
      aria-label={mobileOpen ? 'Fechar menu' : 'Abrir menu'}
      aria-expanded={mobileOpen}
      onClick={() => setMobileOpen(!mobileOpen)}
    >
      {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
    </button>
  );
};

const ROTAS = [
  { to: '/', label: 'Grade da Semana', icon: Calendar },
  { to: '/regras', label: 'Regras & Conferência', icon: CheckCircle },
  { to: '/equipe', label: 'Equipe', icon: Users },
  { to: '/sitios', label: 'Sítios', icon: MapPin },
  { to: '/disponibilidade', label: 'Disponibilidade', icon: CalendarCheck },
  { to: '/historico', label: 'Histórico', icon: Layers },
] as const;

export const Sidebar: React.FC = () => {
  const { collapsed: colapsadoSalvo, toggleCollapsed, mobileOpen, setMobileOpen } = useSidebarState();
  const location = useLocation();
  const { caminhoTela } = useWorkContext();
  const desktop = useDesktop();
  const asideRef = useRef<HTMLElement>(null);

  // Recolher é coisa de desktop: no celular o drawer sempre abre com rótulos,
  // senão quem recolheu no computador fica sem como expandir no telefone.
  const collapsed = desktop && colapsadoSalvo;
  const drawerFechado = !desktop && !mobileOpen;

  // Esc fecha o drawer off-canvas — só faz sentido enquanto ele está aberto.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mobileOpen, setMobileOpen]);

  // Drawer fechado fica fora da ordem de tab e da árvore de acessibilidade
  // (só o transform o tirava da tela, não do teclado). Ao abrir, o foco entra
  // no primeiro link.
  useEffect(() => {
    const el = asideRef.current;
    if (!el) return;
    el.inert = drawerFechado;
    if (!desktop && mobileOpen) el.querySelector<HTMLElement>('a')?.focus();
  }, [drawerFechado, desktop, mobileOpen]);

  // Trocar de rota no modo off-canvas fecha o drawer — senão ele fica aberto
  // por cima da tela seguinte.
  useEffect(() => {
    setMobileOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  return (
    <>
      {/* Overlay do modo off-canvas (< md). Começa abaixo do header para não
          cobrir o botão que fecha o menu. */}
      {mobileOpen && (
        <div
          className="fixed inset-x-0 top-28 md:top-16 bottom-0 bg-slate-900/40 z-40 md:hidden print:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        ref={asideRef}
        className={`
          bg-slate-50 border-r border-slate-200 shrink-0 print:hidden
          flex flex-col
          fixed top-28 md:top-16 bottom-0 left-0 z-50
          md:sticky md:h-[calc(100vh-4rem)]
          transition-all duration-200
          ${collapsed ? 'w-16' : 'w-60'}
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        <nav aria-label="Navegação principal" className="flex-1 py-3 space-y-1 px-2 overflow-y-auto">
          {ROTAS.map(({ to, label, icon: Icon }) => {
            const ativo = location.pathname.replace(/\/$/, '') === caminhoTela(to).replace(/\/$/, '');
            return (
              <Link
                key={to}
                to={caminhoTela(to)}
                aria-label={label}
                aria-current={ativo ? 'page' : undefined}
                title={collapsed ? label : undefined}
                className={`
                  relative flex items-center gap-3 px-3 py-2.5 rounded-md text-[15px] transition-colors
                  ${ativo
                    ? 'bg-white font-bold text-slate-900 before:absolute before:inset-y-1.5 before:left-0 before:w-1 before:rounded-full before:bg-caneta-600'
                    : 'font-medium text-slate-600 hover:bg-slate-200/60 hover:text-slate-900'}
                  ${collapsed ? 'justify-center' : ''}
                `}
              >
                <Icon className={`w-[18px] h-[18px] shrink-0 ${ativo ? 'text-caneta-600' : 'text-slate-500'}`} />
                {!collapsed && <span className="truncate">{label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Colapsar/expandir — só faz sentido em telas md+, onde a sidebar
            fica em fluxo (não off-canvas). */}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}
          className="hidden md:flex items-center justify-center gap-2 m-2 p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 rounded-md transition-colors"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : (
            <>
              <ChevronLeft className="w-4 h-4" />
              <span className="text-sm font-medium">Recolher</span>
            </>
          )}
        </button>
      </aside>
    </>
  );
};
