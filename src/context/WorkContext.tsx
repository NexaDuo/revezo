import React, { createContext, useContext, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth, DEMO_UNIDADE_ID } from './AuthContext';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { listarDisponibilidades, loadSchedules, SemanaDisponibilidade } from '../lib/db';

export interface UnidadeOption { id: string; nome: string; slug: string }
const UNIDADE_DEMO: UnidadeOption = { id: DEMO_UNIDADE_ID, nome: 'Unidade Demonstração (offline)', slug: 'demonstracao' };
const SEM_DISPONIBILIDADES: SemanaDisponibilidade[] = [];
const TELAS = ['', 'regras', 'equipe', 'sitios', 'disponibilidade', 'historico'];

export function segundaAtualISO(): string {
  const hoje = new Date();
  hoje.setDate(hoje.getDate() - ((hoje.getDay() + 6) % 7));
  const dd = (n: number) => String(n).padStart(2, '0');
  return `${hoje.getFullYear()}-${dd(hoje.getMonth() + 1)}-${dd(hoje.getDate())}`;
}
function semanaValida(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const data = new Date(`${iso}T12:00:00Z`);
  return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === iso && data.getUTCDay() === 1;
}

export interface WorkContextType {
  unidadeId: string | null;
  setUnidadeId: (id: string) => void;
  unidadesDisponiveis: UnidadeOption[];
  podeEscolherUnidade: boolean;
  semanaInicio: string;
  setSemanaInicio: (iso: string) => void;
  isLoading: boolean;
  erro: string | null;
  contextoInvalido: boolean;
  caminhoPadrao: string;
  caminhoTela: (tela: string) => string;
  tela: string;
  semanas: string[];
  disponibilidades: SemanaDisponibilidade[];
  revalidarSemanas: () => void;
}
const WorkContext = createContext<WorkContextType | undefined>(undefined);

export const WorkProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile, isAdmin, isLoading: authLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [unidades, setUnidades] = useState<{ chave: string; lista: UnidadeOption[]; erro: string | null }>();
  const [revisao, setRevisao] = useState(0);
  const [lista, setLista] = useState<{ chave: string; disponibilidades: SemanaDisponibilidade[]; escalas: string[]; erro: string | null }>();
  // A identidade do perfil invalida consultas antigas, sem resetar a URL em refresh de token.
  const chavePerfil = `${profile?.id ?? ''}:${profile?.unidade_id ?? ''}:${isAdmin}`;
  useEffect(() => {
    if (authLoading) return;
    let cancelado = false;
    (async () => {
      let lista: UnidadeOption[] = [];
      let erro: string | null = null;
      try {
        if (!isSupabaseConfigured) lista = [UNIDADE_DEMO];
        else if (profile) {
          if (!profile.unidade_id) throw new Error('Seu perfil não está vinculado a nenhuma unidade. Peça a um admin para vincular.');
          const result = await supabase.from('unidades').select('id, nome, slug').order('nome');
          if (result.error) throw result.error;
          lista = result.data || [];
        }
      } catch (e: any) { erro = `Falha ao carregar as unidades disponíveis: ${e?.message || e}`; }
      if (!cancelado) setUnidades({ chave: chavePerfil, lista, erro });
    })();
    return () => { cancelado = true; };
  }, [authLoading, chavePerfil]);
  const unidadesDisponiveis = unidades?.chave === chavePerfil ? unidades.lista : [];
  const partes = location.pathname.replace(/^\/+|\/+$/g, '').split('/');
  const antiga = partes.length === 1 && TELAS.includes(partes[0]);
  const tela = antiga ? partes[0] : partes.slice(2).join('/');
  const padrao = unidadesDisponiveis.find(u => u.id === (isSupabaseConfigured ? profile?.unidade_id : DEMO_UNIDADE_ID));
  const unidade = antiga ? padrao : unidadesDisponiveis.find(u => u.slug === partes[0]);
  const unidadeConsulta = unidade ?? padrao;
  const chaveLista = `${chavePerfil}:${unidadeConsulta?.id ?? ''}:${revisao}`;
  useEffect(() => {
    if (!unidadeConsulta) return;
    let cancelado = false;
    (async () => {
      try {
        const [disponibilidades, escalas] = await Promise.all([
          listarDisponibilidades(unidadeConsulta.id), loadSchedules(unidadeConsulta.id),
        ]);
        if (!cancelado) setLista({ chave: chaveLista, disponibilidades, escalas: escalas.map((s: any) => s.data_inicio), erro: null });
      } catch (e: any) {
        if (!cancelado) setLista({ chave: chaveLista, disponibilidades: [], escalas: [], erro: `Falha ao carregar semanas: ${e?.message || e}` });
      }
    })();
    return () => { cancelado = true; };
  }, [chaveLista]);
  const revalidarSemanas = React.useCallback(() => setRevisao(r => r + 1), []);
  const dados = lista?.chave === chaveLista ? lista : undefined;
  const atual = segundaAtualISO();
  const semanaPadrao = dados?.disponibilidades.find(s => semanaValida(s.data_inicio))?.data_inicio ?? atual;
  const semanaInicio = antiga ? semanaPadrao : partes[1] ?? '';
  const caminho = (slug: string, semana: string, destino: string) => `/${slug}/${semana}${destino ? `/${destino}` : ''}`;
  const caminhoPadrao = padrao ? caminho(padrao.slug, atual, TELAS.includes(tela) ? tela : '') : '/';
  const isLoading = authLoading || unidades?.chave !== chavePerfil || (!!unidadeConsulta && !dados);
  const contextoInvalido = !antiga && !isLoading && (!unidade || !semanaValida(semanaInicio) || !TELAS.includes(tela));
  const erro = unidades?.erro || dados?.erro || (contextoInvalido
    ? !unidade ? 'Hospital inexistente ou sem acesso para este usuário.'
      : !semanaValida(semanaInicio) ? 'Semana inválida: informe uma segunda-feira no formato YYYY-MM-DD.' : 'Tela inexistente.'
    : null);
  useEffect(() => {
    if (antiga && unidade && !isLoading && !erro) navigate(caminho(unidade.slug, semanaPadrao, tela), { replace: true });
  }, [antiga, unidade, isLoading, erro, semanaPadrao, tela, navigate]);
  const caminhoTela = (destino: string) => unidade && !contextoInvalido ? caminho(unidade.slug, semanaInicio, destino.replace(/^\//, '')) : destino || '/';
  return <WorkContext.Provider value={{
    unidadeId: contextoInvalido ? null : unidade?.id ?? null,
    unidadesDisponiveis, podeEscolherUnidade: isAdmin, semanaInicio,
    setUnidadeId: id => { const u = unidadesDisponiveis.find(u => u.id === id); if (u) navigate(caminho(u.slug, semanaInicio, tela)); },
    setSemanaInicio: iso => { if (unidade) navigate(caminho(unidade.slug, iso, tela)); },
    isLoading, erro, contextoInvalido, caminhoPadrao, caminhoTela, tela,
    semanas: [...new Set([atual, ...(semanaValida(semanaInicio) ? [semanaInicio] : []), ...(dados?.disponibilidades.map(s => s.data_inicio) ?? []), ...(dados?.escalas ?? [])])].filter(semanaValida).sort().reverse(),
    disponibilidades: dados?.disponibilidades ?? SEM_DISPONIBILIDADES, revalidarSemanas,
  }}>{children}</WorkContext.Provider>;
};
export const useWorkContext = () => {
  const context = useContext(WorkContext);
  if (!context) throw new Error('useWorkContext deve ser usado dentro de um WorkProvider');
  return context;
};
