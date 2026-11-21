import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Button } from '../ui/button';
import { ipc } from '../../lib/ipc';
import { RENEW_URL, renewalNotice } from '../../lib/licence';
import type { LicenseStatus } from '../../types/global';

export function LicenseBanner(): JSX.Element | null {
  const location = useLocation();
  const [status, setStatus] = useState<LicenseStatus | null>(null);

  useEffect(() => {
    void (async () => {
      const result = await ipc.licenseStatus();
      if (result.ok && result.status) setStatus(result.status);
    })();
  }, [location.pathname]);

  const notice = status ? renewalNotice(status) : null;
  if (!notice) return null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-100"
    >
      <p>
        <span className="font-semibold">{notice.title}.</span> {notice.body}
      </p>
      <Button size="sm" variant="secondary" onClick={() => void ipc.openExternal(RENEW_URL)}>
        {notice.action}
      </Button>
    </div>
  );
}
