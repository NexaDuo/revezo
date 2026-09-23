import React, { createContext, useContext, useEffect, useState } from 'react';
import { queryClient } from '../lib/queryClient';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { AuthContextType, UserProfile, UserRole } from '../types/auth';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Unidade fixa do modo demonstração (sem Supabase configurado). WorkContext
// reusa esta constante para resolver `unidadeId` sem chamada de rede.
export const DEMO_UNIDADE_ID = 'demo-unidade-1';

// Marca a saída pelo botão "Sair", que já recarrega por conta própria; o
// listener de auth só recarrega nas saídas que vêm de fora desta aba.
let saindoPeloBotao = false;

// Perfil de demonstração quando o Supabase ainda não foi configurado
const DEMO_PROFILE: UserProfile = {
  id: 'demo-user-1',
  unidade_id: DEMO_UNIDADE_ID,
  email: 'coordenacao@exemplo.invalid',
  nome: 'Coordenação Demonstração',
  avatar_url: null,
  role: 'coordenador',
  ativo: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<UserRole>('visualizador');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = async (userId: string, retries = 3, delay = 500): Promise<UserProfile | null> => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        if (retries > 0) {
          console.warn(`Perfil não encontrado, tentando novamente em ${delay}ms...`, error.message);
          await new Promise(resolve => setTimeout(resolve, delay));
          return fetchProfile(userId, retries - 1, delay * 1.5);
        }
        console.warn('Erro ao carregar perfil do Supabase:', error.message);
        return null;
      }
      return data as UserProfile;
    } catch (err: any) {
      console.error('Falha na busca de perfil:', err);
      return null;
    }
  };

  const refreshProfile = async () => {
    if (!user) return;
    const userProfile = await fetchProfile(user.id);
    if (!userProfile) throw new Error("Não foi possível atualizar seu perfil. Reabra as configurações para tentar novamente.");
    if (userProfile) {
      setProfile(userProfile);
      setRole(userProfile.role);
    }
  };

  useEffect(() => {
    if (!isSupabaseConfigured) {
      // Modo Mock/Demo para desenvolvimento inicial sem travar a tela
      setUser({ id: 'demo-user-1', email: 'coordenacao@exemplo.invalid' });
      setProfile(DEMO_PROFILE);
      setRole(DEMO_PROFILE.role);
      setIsLoading(false);
      return;
    }

    let disposed = false;
    let revision = 0;
    let accepted: { id: string; promise: Promise<void> } | null = null;
    const applySession = async (session: any) => {
      const current = ++revision;
      if (!session?.user) {
        accepted = null;
        setUser(null); setProfile(null); setRole('visualizador'); setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setUser(session.user);
      if (accepted?.id !== session.user.id) {
        accepted = { id: session.user.id, promise: (async () => {
          try {
            const { error } = await supabase.rpc('aceitar_convite');
            if (error) throw error;
          } catch (e: any) {
            if (!disposed) setError(`Não foi possível aceitar o convite: ${e?.message || e}`);
          }
        })() };
      }
      await accepted!.promise;
      const p = await fetchProfile(session.user.id);
      if (disposed || current !== revision) return;
      setProfile(p); setRole(p?.role ?? 'visualizador'); setIsLoading(false);
      if (!p) setError('Não foi possível carregar seu perfil. Entre novamente.');
    };
    // O callback de auth não pode aguardar chamadas Supabase: ele detém o lock da sessão.
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let usuarioAtual: string | null | undefined;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // Troca de usuário (login, logout, outra conta no mesmo computador do
      // hospital) não pode reaproveitar listas em cache do usuário anterior.
      const usuario = session?.user?.id ?? null;
      // Saída que não veio do nosso "Sair" (outra aba, refresh token recusado):
      // recarrega para o Clarity abrir sessão nova, como no signOut. Só se esta
      // aba tinha usuário (identificado no Clarity); a página recarregada começa
      // sem usuário, então não entra em laço.
      if (_event === 'SIGNED_OUT' && usuarioAtual && !saindoPeloBotao) {
        window.location.assign(import.meta.env.BASE_URL);
        return;
      }
      if (usuarioAtual !== undefined && usuario !== usuarioAtual) queryClient.clear();
      usuarioAtual = usuario;
      const timer = setTimeout(() => { timers.delete(timer); if (!disposed) void applySession(session); }, 0);
      timers.add(timer);
    });
    return () => {
      disposed = true;
      timers.forEach(clearTimeout);
      subscription.unsubscribe();
    };
  }, []);

  /** Login por e-mail e senha. Contas criadas pelo provider `email` (as que
   *  não vieram do Google) só conseguem entrar por aqui. */
  const signInWithPassword = async (email: string, password: string) => {
    try {
      setError(null);
      if (!isSupabaseConfigured) {
        setError('Supabase não configurado: login por e-mail indisponível em modo demonstração.');
        return false;
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return true;
    } catch (err: any) {
      console.error('Erro no login por e-mail:', err);
      setError(
        err?.message === 'Invalid login credentials'
          ? 'E-mail ou senha inválidos.'
          : err?.message || 'Falha ao autenticar.'
      );
      return false;
    }
  };

  const signInWithGoogle = async () => {
    try {
      setError(null);
      if (!isSupabaseConfigured) {
        // No modo demo, apenas simula login com admin
        setRole(r => r === 'admin' ? 'coordenador' : 'admin');
        return;
      }

      // Sempre a raiz do app (local e GitHub Pages /revezo/), que é o que está na
      // allow-list do Supabase. Não volta para a tela funda de onde saiu: o
      // WorkContext leva à unidade padrão do perfil.
      const redirectUrl = window.location.origin + import.meta.env.BASE_URL;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) throw error;
    } catch (err: any) {
      console.error('Erro no login Google:', err);
      setError(err.message || 'Falha ao autenticar com o Google.');
    }
  };

  const signOut = async () => {
    try {
      if (isSupabaseConfigured) {
        saindoPeloBotao = true;
        const { error: global } = await supabase.auth.signOut();
        // Rede fora ou 5xx: a sessão no servidor fica, mas este computador
        // precisa sair de qualquer jeito (computador compartilhado).
        if (global) {
          const { error: local } = await supabase.auth.signOut({ scope: 'local' });
          if (local) {
            saindoPeloBotao = false;
            setError(`Não foi possível sair: ${local.message}. Feche o navegador para encerrar a sessão.`);
            return;
          }
        }
      }
      setUser(null);
      setProfile(null);
      setRole('visualizador');
      // Recarregar a página inteira: o Clarity não tem "des-identificar", e sem
      // isso a gravação continuaria marcada com o uuid de quem saiu (computador
      // compartilhado no hospital). Também descarta estado em memória da conta.
      if (isSupabaseConfigured) window.location.assign(import.meta.env.BASE_URL);
    } catch (err: any) {
      console.error('Erro ao sair:', err);
    }
  };

  const updateUserRole = async (userId: string, newRole: UserRole): Promise<boolean> => {
    try {
      if (!isSupabaseConfigured) {
        // Mock update
        if (profile && profile.id === userId) {
          setProfile({ ...profile, role: newRole });
          setRole(newRole);
        }
        return true;
      }

      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole, updated_at: new Date().toISOString() })
        .eq('id', userId);

      if (error) throw error;
      await refreshProfile();
      return true;
    } catch (err: any) {
      console.error('Erro ao atualizar papel do usuário:', err);
      alert('Falha ao atualizar papel: ' + err.message);
      return false;
    }
  };

  const toggleUserActive = async (userId: string, currentStatus: boolean): Promise<boolean> => {
    try {
      if (!isSupabaseConfigured) {
        if (profile && profile.id === userId) {
          setProfile({ ...profile, ativo: !currentStatus });
        }
        return true;
      }

      const { error } = await supabase
        .from('profiles')
        .update({ ativo: !currentStatus, updated_at: new Date().toISOString() })
        .eq('id', userId);

      if (error) throw error;
      await refreshProfile();
      return true;
    } catch (err: any) {
      console.error('Erro ao alternar status do usuário:', err);
      alert('Falha ao alterar status: ' + err.message);
      return false;
    }
  };

  const isAdmin = !!profile?.ativo && role === 'admin';
  const isCoordenador = !!profile?.ativo && (role === 'admin' || role === 'coordenador');

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        role,
        isAdmin,
        isCoordenador,
        isLoading,
        error,
        signInWithGoogle,
        signInWithPassword,
        signOut,
        refreshProfile,
        updateUserRole,
        toggleUserActive,
        isSupabaseConfigured,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return context;
};
