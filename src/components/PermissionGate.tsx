import { temPermissao, Permission } from '../lib/permissions';
import { UserRole } from '../types';

interface Props {
  permission: Permission;
  role: UserRole;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function PermissionGate({ permission, role, children, fallback = null }: Props) {
  return temPermissao(role, permission) ? <>{children}</> : <>{fallback}</>;
}
