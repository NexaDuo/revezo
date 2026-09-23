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
        <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600">
          {showIcon && <Shield className="w-3.5 h-3.5 text-slate-500" />}
          Administrador
        </span>
      );
    case 'coordenador':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600">
          {showIcon && <UserCheck className="w-3.5 h-3.5 text-slate-500" />}
          Coordenador de Escala
        </span>
      );
    case 'visualizador':
    default:
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600">
          {showIcon && <Eye className="w-3.5 h-3.5 text-slate-500" />}
          Visualizador
        </span>
      );
  }
};
