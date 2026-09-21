import React from 'react';
import { UserRole } from '../../types/auth';
import { Shield, UserCheck, Eye } from 'lucide-react';

interface RoleBadgeProps {
  role: UserRole;
  showIcon?: boolean;
}

export const RoleBadge: React.FC<RoleBadgeProps> = ({ role, showIcon = true }) => {
  switch (role) {
    case 'admin':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-200">
          {showIcon && <Shield className="w-3.5 h-3.5 text-purple-600" />}
          Administrador
        </span>
      );
    case 'coordenador':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
          {showIcon && <UserCheck className="w-3.5 h-3.5 text-emerald-600" />}
          Coordenador de Escala
        </span>
      );
    case 'visualizador':
    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
          {showIcon && <Eye className="w-3.5 h-3.5 text-slate-500" />}
          Visualizador
        </span>
      );
  }
};
