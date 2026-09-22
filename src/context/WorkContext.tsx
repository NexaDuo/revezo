import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth, DEMO_UNIDADE_ID } from './AuthContext';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { listarDisponibilidades } from '../lib/db';

/** Uma unidade que o usuário pode escolher como contexto de trabalho. */
export interface UnidadeOption {
  id: string;
  nome: string;
}

const UNIDADE_DEMO: UnidadeOption = { id: DEMO_UNIDADE_ID, nome: 'Unidade Demonstração (offline)' };

export interface WorkContextType {
  /** Unidade ativa. Toda leitura/escrita de domínio é escopada por ela. */
  unidadeId: string | null;
  setUnidadeId: (id: string) => void;
  /** Unidades que o usuário pode escolher: todas para admin, só a própria
   *  para coordenador/visualizador — decorre da RLS de `unidades`, não é
   *  recalculado aqui. */
  unidadesDisponiveis: UnidadeOption[];
  /** admin → seletor vira dropdown (Fase 3); os demais veem rótulo estático. */
  podeEscolherUnidade: boolean;
  /** Segunda-feira da semana de referência, ISO `YYYY-MM-DD`. */
  semanaInicio: string;
  setSemanaInicio: (iso: string) => void;
  isLoading: boolean;
  erro: string | null;
}

const WorkContext = createContext<WorkContextType | undefined>(undefined);

/** Segunda-feira da semana corrente, em ISO local (sem depender de fuso UTC). */
function segundaAtualISO(): string {
  const hoje = new Date();
  const segunda = new Date(hoje);
  segunda.setDate(hoje.getDate() - ((hoje.getDay() + 6) % 7));
  const dd = (n: number) => String(n).padStart(2, '0');
  return `${segunda.getFullYear()}-${dd(segunda.getMonth() + 1)}-${dd(segunda.getDate())}`;
}

export const WorkProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile, isAdmin, isLoading: authLoading } = useAuth();

  const [unidadeId, setUnidadeId] = useState<string | null>(null);
  const [unidadesDisponiveis, setUnidadesDisponiveis] = useState<UnidadeOption[]>([]);
  const [semanaInicio, setSemanaInicio] = useState<string>(() => segundaAtualISO());
  const [isLoading, setIsLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // Unidades já resolvidas: evita reconsultar `listarDisponibilidades` toda
  // vez que o efeito abaixo roda por outro motivo (ex.: profile mudou de
  // referência sem mudar de unidade).
  const semanaResolvidaPara = useRef<Set<string>>(new Set());

  // Resolve a unidade ativa e a lista do que o usuário pode escolher.
  useEffect(() => {
    if (authLoading) return;
    let cancelado = false;

    (async () => {
      setIsLoading(true);
      setErro(null);

      if (!isSupabaseConfigured) {
        // Modo demonstração: unidade fixa, sem chamada de rede — o app não
        // pode travar em modo demo esperando uma unidade que não existe.
        if (!cancelado) {
          setUnidadesDisponiveis([UNIDADE_DEMO]);
          setUnidadeId(DEMO_UNIDADE_ID);
          setIsLoading(false);
        }
        return;
      }

      if (!profile) {
        // Sessão ainda carregando o perfil ou usuário deslogado: sem unidade
        // ainda, mas isso não é erro — só estado transitório.
        if (!cancelado) {
          setUnidadeId(null);
          setUnidadesDisponiveis([]);
          setIsLoading(false);
        }
        return;
      }

      if (!profile.unidade_id) {
        // Falhar alto: perfil sem unidade não pode virar uma unidade
        // inventada. Fica explícito na tela até um admin vincular.
        if (!cancelado) {
          setErro('Seu perfil não está vinculado a nenhuma unidade. Peça a um admin para vincular.');
          setUnidadeId(null);
          setUnidadesDisponiveis([]);
          setIsLoading(false);
        }
        return;
      }

      try {
        // A RLS de `unidades` já faz o trabalho: admin enxerga todas as
        // linhas (is_admin() na policy), coordenador/visualizador só a
        // própria. Não há regra de papel para duplicar aqui.
        const { data, error } = await supabase.from('unidades').select('id, nome').order('nome');
        if (error) throw error;
        if (!cancelado) {
          setUnidadesDisponiveis((data || []) as UnidadeOption[]);
          setUnidadeId(profile.unidade_id);
        }
      } catch (e: any) {
        if (!cancelado) {
          // A unidade do próprio perfil ainda é um contexto válido mesmo se
          // a lista de opções falhar — não bloqueia o uso do produto.
          setErro(`Falha ao carregar as unidades disponíveis: ${e?.message || e}`);
          setUnidadeId(profile.unidade_id);
          setUnidadesDisponiveis([]);
        }
      } finally {
        if (!cancelado) setIsLoading(false);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [authLoading, profile]);

  // Semana inicial: a última disponibilidade salva na unidade ativa, senão a
  // segunda-feira corrente. Só roda uma vez por unidade — depois disso a
  // semana é o que o usuário escolher (Fase 3), não algo que se recalcula
  // sozinho a cada render.
  useEffect(() => {
    if (!unidadeId || semanaResolvidaPara.current.has(unidadeId)) return;
    let cancelado = false;

    (async () => {
      semanaResolvidaPara.current.add(unidadeId);
      try {
        const salvas = await listarDisponibilidades(unidadeId);
        if (!cancelado && salvas.length) {
          setSemanaInicio(salvas[0].data_inicio);
        }
      } catch {
        // Sem disponibilidade salva ainda (ou falha de leitura): mantém a
        // segunda-feira corrente já calculada no estado inicial.
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [unidadeId]);

  const value = useMemo<WorkContextType>(
    () => ({
      unidadeId,
      setUnidadeId,
      unidadesDisponiveis,
      podeEscolherUnidade: isAdmin,
      semanaInicio,
      setSemanaInicio,
      isLoading,
      erro,
    }),
    [unidadeId, unidadesDisponiveis, isAdmin, semanaInicio, isLoading, erro]
  );

  return <WorkContext.Provider value={value}>{children}</WorkContext.Provider>;
};

export const useWorkContext = () => {
  const context = useContext(WorkContext);
  if (!context) {
    throw new Error('useWorkContext deve ser usado dentro de um WorkProvider');
  }
  return context;
};
