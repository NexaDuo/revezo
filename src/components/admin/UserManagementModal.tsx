import { ConvitesManager } from './ConvitesManager';
import React, { useEffect, useState } from 'react';
import { useAuth, DEMO_UNIDADE_ID } from '../../context/AuthContext';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { UserProfile, UserRole } from '../../types/auth';
import { RoleBadge } from '../auth/RoleBadge';
import { X, ShieldCheck, UserCog, CheckCircle2, XCircle, Search } from 'lucide-react';

interface UserManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UserManagementModal: React.FC<UserManagementModalProps> = ({ isOpen, onClose }) => {
  const { profile, isAdmin, isCoordenador, updateUserRole, toggleUserActive } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);

  const loadUsers = async () => {
    setIsLoadingUsers(true);
    setErro(null);
    if (!isSupabaseConfigured) {
      // Mock data para demonstração
      setUsers([
        profile || {
          id: '1',
          unidade_id: DEMO_UNIDADE_ID,
          email: 'michele.ferreira@saude.gov.br',
          nome: 'Michele Ferreira',
          avatar_url: null,
          role: 'coordenador',
          ativo: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: '2',
          unidade_id: DEMO_UNIDADE_ID,
          email: 'alexandre.machado@nexaduo.com',
          nome: 'Alexandre Machado',
          avatar_url: null,
          role: 'admin',
          ativo: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: '3',
          unidade_id: DEMO_UNIDADE_ID,
          email: 'enfermeira.plantonista@saude.gov.br',
          nome: 'Carolina Feijó',
          avatar_url: null,
          role: 'visualizador',
          ativo: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]);
      setIsLoadingUsers(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data as UserProfile[]);
    } catch (err: any) {
      setErro(`Não foi possível carregar usuários: ${err?.message || err}`);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (isOpen && isCoordenador) {
      loadUsers();
    }
  }, [isOpen, profile?.id, profile?.unidade_id, isCoordenador]);

  if (!isOpen || !isCoordenador) return null;

  const filteredUsers = users.filter(u =>
    (u.nome?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 pb-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center text-white shadow-md shadow-purple-200">
              <UserCog className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Gestão de Acessos & Papéis</h2>
              <p className="text-xs text-slate-500">Defina quem coordena as escalas e quem administra a unidade</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto">
        <ConvitesManager />
        {erro && <p role="alert">{erro}</p>}
        {/* Search bar */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nome ou e-mail..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
          />
        </div>

        {/* User list */}
        <div className="flex-1 overflow-y-auto p-6 divide-y divide-slate-100">
          {isLoadingUsers ? (
            <div className="text-center py-8 text-slate-400 text-sm">Carregando usuários...</div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">Nenhum usuário encontrado.</div>
          ) : (
            filteredUsers.map(u => (
              <div key={u.id} className="py-4 first:pt-0 last:pb-0 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  {u.avatar_url ? (
                    <img
                      src={u.avatar_url}
                      alt={u.nome || u.email}
                      className="w-10 h-10 rounded-full object-cover border border-slate-200"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-slate-200 text-slate-700 font-bold flex items-center justify-center text-sm uppercase">
                      {(u.nome || u.email)[0]}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900 truncate">
                        {u.nome || 'Sem nome informado'}
                      </span>
                      {u.id === profile?.id && (
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">
                          você
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 truncate">{u.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <RoleBadge role={u.role} showIcon={false} />

                  {/* Role select */}
                  {isAdmin && <select
                    value={u.role}
                    disabled={u.id === profile?.id} // Impede de revogar o próprio admin
                    onChange={async e => {
                      const newRole = e.target.value as UserRole;
                      await updateUserRole(u.id, newRole);
                      loadUsers();
                    }}
                    className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 font-medium focus:ring-2 focus:ring-purple-500 focus:outline-none disabled:opacity-50"
                  >
                    <option value="coordenador">Coordenador de Escala</option>
                    <option value="admin">Administrador</option>
                    <option value="visualizador">Visualizador (Somente Leitura)</option>
                  </select>}

                  {/* Status Toggle */}
                  {isAdmin && <button
                    disabled={u.id === profile?.id}
                    onClick={async () => {
                      await toggleUserActive(u.id, u.ativo);
                      loadUsers();
                    }}
                    title={u.ativo ? 'Desativar usuário' : 'Ativar usuário'}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded disabled:opacity-50"
                  >
                    {u.ativo ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-500" />
                    )}
                  </button>}
                </div>
              </div>
            ))
          )}
        </div>

        </div>
        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-purple-600" />
            <span>Apenas administradores podem promover ou revogar coordenadores.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-slate-700 font-medium transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
