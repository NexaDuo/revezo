import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { X, ShieldAlert, Sparkles, Mail, Lock, LogIn } from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose }) => {
  const { signInWithGoogle, signInWithPassword, isSupabaseConfigured, error } = useAuth();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [entrando, setEntrando] = useState(false);

  const entrarComSenha = async (e: React.FormEvent) => {
    e.preventDefault();
    setEntrando(true);
    const ok = await signInWithPassword(email.trim(), senha);
    setEntrando(false);
    if (ok) onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="p-6 pb-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-bold text-xl shadow-md shadow-emerald-200">
              R
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Entrar no Revezo</h2>
              <p className="text-xs text-slate-500">Gestão & Editor de Escala de Sítio</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-600 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-slate-800">
              <Sparkles className="w-4 h-4 text-emerald-600" />
              <span>Papéis e Níveis de Acesso:</span>
            </div>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong>Coordenador de Escala:</strong> Pode gerar a grade com o solver, editar arrastando e imprimir a escala em PDF.</li>
              <li><strong>Administrador:</strong> Gerencia permissões de usuários, regras da unidade e equipe.</li>
              <li><strong>Visualizador:</strong> Só leitura — é o papel de quem acaba de entrar.</li>
            </ul>
          </div>

          {!isSupabaseConfigured && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-800">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong>Modo Demonstração:</strong> O Supabase ainda não foi configurado no arquivo <code className="bg-amber-100 px-1 py-0.5 rounded">.env</code>. Clicar no botão simulará o login localmente com perfil coordenador/admin.
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">
              {error}
            </div>
          )}

          <form onSubmit={entrarComSenha} className="space-y-3">
            <label className="block">
              <span className="text-xs font-semibold text-slate-700">E-mail</span>
              <div className="mt-1 relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="voce@exemplo.com"
                  className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
            </label>

            <label className="block">
              <span className="text-xs font-semibold text-slate-700">Senha</span>
              <div className="mt-1 relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={senha}
                  onChange={e => setSenha(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
            </label>

            <button
              type="submit"
              disabled={entrando}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl shadow-sm transition-all active:scale-[0.99] disabled:opacity-60"
            >
              <LogIn className="w-4 h-4" />
              <span>{entrando ? 'Entrando...' : 'Entrar'}</span>
            </button>
          </form>

          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-slate-200" />
            <span className="text-[11px] uppercase tracking-wide text-slate-400">ou</span>
            <span className="h-px flex-1 bg-slate-200" />
          </div>

          <button
            onClick={async () => {
              await signInWithGoogle();
              onClose();
            }}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white hover:bg-slate-50 text-slate-700 font-medium rounded-xl border border-slate-300 shadow-sm hover:shadow transition-all duration-150 active:scale-[0.99]"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Continuar com o Google</span>
          </button>
        </div>

        {/* Footer note */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 text-center text-xs text-slate-400">
          Acesso restrito à equipe da unidade de saúde.
        </div>
      </div>
    </div>
  );
};
