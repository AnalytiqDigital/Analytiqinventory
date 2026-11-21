import { Navigate, Outlet } from 'react-router-dom';
import type { OptionalModule } from '@analytiq/validation';
import { hasModule } from './layout/nav';
import { useSession } from '../stores/session';

/**
 * Route guard for optional modules. A pharmacy that navigates to /tables
 * (a bookmark, a stale link) lands on the dashboard instead of a dead screen.
 */
export function RequireModule({ module }: { module: OptionalModule }): JSX.Element {
 const businessType = useSession((s) => s.user?.businessType);
 const modules = useSession((s) => s.user?.modules);
 if (!hasModule(businessType, module, modules)) return <Navigate to="/" replace />;
 return <Outlet />;
}
