import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ipc } from '../lib/ipc';
import { useSession } from '../stores/session';
import { LoadingState } from './ui/states';

export function RequireAuth(): JSX.Element {
  const user = useSession((s) => s.user);
  const checked = useSession((s) => s.checked);
  const refresh = useSession((s) => s.refresh);
  const location = useLocation();
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null);

  useEffect(() => {
    void (async () => {
      const status = await ipc.authStatus();
      setSetupComplete(status.setupComplete);
      if (status.setupComplete) await refresh();
      else useSession.setState({ checked: true });
    })();
  }, [refresh]);

  if (setupComplete === null || !checked) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState label="Starting AnalytIQ…" />
      </div>
    );
  }

  if (!setupComplete) return <Navigate to="/setup" replace />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}
