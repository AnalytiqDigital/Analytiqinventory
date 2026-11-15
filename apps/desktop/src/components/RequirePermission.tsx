import type { ReactNode } from 'react';
import { useSession } from '../stores/session';

export function RequirePermission({
  permission,
  fallback,
  children,
}: {
  permission: string;
  fallback?: ReactNode;
  children: ReactNode;
}): JSX.Element {
  const can = useSession((s) => s.can);
  if (!can(permission)) {
    return <>{fallback ?? null}</>;
  }
  return <>{children}</>;
}
