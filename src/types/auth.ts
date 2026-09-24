export type UserRole = 'admin' | 'coordenador' | 'visualizador';

export interface UserProfile {
  id: string;
  unidade_id: string | null;
  email: string;
  nome: string | null;
  avatar_url: string | null;
  role: UserRole;
  ativo: boolean;
  created_at: string;
  updated_at: string;
  last_sign_in_at?: string;
}

export interface AuthState {
  user: any | null;
  profile: UserProfile | null;
  role: UserRole;
  isAdmin: boolean;
  isCoordenador: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface AuthContextType extends AuthState {
  signInWithGoogle: () => Promise<void>;

  signInWithPassword: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateUserRole: (userId: string, newRole: UserRole) => Promise<boolean>;
  toggleUserActive: (userId: string, currentStatus: boolean) => Promise<boolean>;
  isSupabaseConfigured: boolean;
  onlineUsers: Set<string>;
}
