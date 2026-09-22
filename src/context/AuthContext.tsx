import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { AuthContextType, UserProfile, UserRole } from '../types/auth';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Perfil de demonstração quando o Supabase ainda não foi configurado
const DEMO_PROFILE: UserProfile = {
  id: 'demo-user-1',
  email: 'michele.ferreira@saude.gov.br',
  nome: 'Michele Ferreira',
  avatar_url: 'https://images.unsplash.com/photo-1594824813571-638f02614d3f?w=150&auto=format&fit=crop&q=80',
  role: 'coordenador',
  ativo: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<UserRole>('coordenador');
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
    if (userProfile) {
      setProfile(userProfile);
      setRole(userProfile.role);
    }
  };

  useEffect(() => {
    if (!isSupabaseConfigured) {
      // Modo Mock/Demo para desenvolvimento inicial sem travar a tela
      setUser({ id: 'demo-user-1', email: 'michele.ferreira@saude.gov.br' });
      setProfile(DEMO_PROFILE);
      setRole(DEMO_PROFILE.role);
      setIsLoading(false);
      return;
    }

    // Inicializar sessão real do Supabase
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        const p = await fetchProfile(session.user.id);
        if (p) {
          setProfile(p);
          setRole(p.role);
        }
      }
      setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user) {
          setUser(session.user);
          const p = await fetchProfile(session.user.id);
          if (p) {
            setProfile(p);
            setRole(p.role);
          }
        } else {
          setUser(null);
          setProfile(null);
          setRole('visualizador');
        }
        setIsLoading(false);
      }
    );

    return () => {
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

      // Detecta a URL atual (funciona local e no GitHub Pages)
      const redirectUrl = window.location.origin + window.location.pathname;
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
        await supabase.auth.signOut();
      }
      setUser(null);
      setProfile(null);
      setRole('visualizador');
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

  const isAdmin = role === 'admin';
  const isCoordenador = role === 'admin' || role === 'coordenador';

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
