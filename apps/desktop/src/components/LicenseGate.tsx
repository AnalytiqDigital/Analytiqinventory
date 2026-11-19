import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { LoadingState } from './ui/states';
import { ipc } from '../lib/ipc';

// Business screens are only reachable while the trial or a license key is
// usable. The check is repeated on navigation so a newly activated copy
// unlocks without restarting the app.
export function LicenseGate(): JSX.Element {
  const location = useLocation();
  const [state, setState] = useState<'checking' | 'usable' | 'blocked'>('checking');

  useEffect(() => {
    let active = true;
    void (async () => {
      const result = await ipc.licenseStatus();
      if (!active) return;
      // Browser preview and unreachable LAN servers have no license state to
      // report; the gate must not lock those out.
      if (!result.ok || !result.status) {
        setState('usable');
        return;
      }
      setState(result.status.usable ? 'usable' : 'blocked');
    })();
    return () => {
      active = false;
    };
  }, [location.pathname]);

  if (state === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState label="Checking license…" />
      </div>
    );
  }
  if (state === 'blocked') return <Navigate to="/license" replace />;
  return <Outlet />;
}
