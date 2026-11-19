import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { ErrorState, LoadingState } from '../components/ui/states';
import { ipc } from '../lib/ipc';
import { useSession } from '../stores/session';
import type { LicenseStatus } from '../types/global';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function stateLabel(status: LicenseStatus): { label: string; className: string } {
  if (status.state === 'active') {
    return { label: 'Licensed', className: 'bg-emerald-100 text-emerald-800' };
  }
  if (status.state === 'trial') {
    return { label: 'Trial', className: 'bg-amber-100 text-amber-800' };
  }
  if (status.state === 'expired') {
    return { label: 'Expired', className: 'bg-red-100 text-red-800' };
  }
  return { label: 'Not activated', className: 'bg-slate-200 text-slate-700' };
}

export function LicensePage(): JSX.Element {
  const navigate = useNavigate();
  const signOut = useSession((s) => s.signOut);
  const canActivate = useSession((s) => s.can('settings.manage'));
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void (async () => {
      const result = await ipc.licenseStatus();
      if (result.ok && result.status) setStatus(result.status);
      else setLoadError(result.error ?? 'Could not read the license state');
      setLoading(false);
    })();
  }, []);

  const activate = async (): Promise<void> => {
    setError(null);
    if (key.trim().length === 0) {
      setError('Paste the license key you received by email.');
      return;
    }
    setBusy(true);
    const result = await ipc.licenseActivate(key.trim());
    setBusy(false);
    if (!result.ok || !result.status) {
      setError(result.error ?? 'That key could not be activated.');
      return;
    }
    setStatus(result.status);
    if (result.status.usable) navigate('/', { replace: true });
  };

  const copyInstallId = async (): Promise<void> => {
    if (!status) return;
    try {
      await navigator.clipboard.writeText(status.installId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Copy is unavailable — select the installation id manually.');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
      <div className="w-full max-w-2xl space-y-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-500 text-xl font-black text-white shadow-lg">
            A
          </span>
          <div>
            <p className="text-base font-bold leading-tight tracking-tight">AnalytIQ</p>
            <p className="text-xs text-slate-500">License and activation</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>This installation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? <LoadingState label="Reading license state…" /> : null}
            {loadError ? <ErrorState message={loadError} /> : null}

            {status ? (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <Badge className={stateLabel(status).className}>{stateLabel(status).label}</Badge>
                  {status.plan ? <Badge>Plan: {status.plan}</Badge> : null}
                  {status.business ? <Badge>{status.business}</Badge> : null}
                  {status.state === 'trial' && status.daysLeft !== null ? (
                    <span className="text-sm text-slate-600">
                      {status.daysLeft} day{status.daysLeft === 1 ? '' : 's'} left in the trial
                      {status.trialEndsAt ? ` (ends ${formatDate(status.trialEndsAt)})` : ''}
                    </span>
                  ) : null}
                  {status.state === 'active' && status.expiresAt ? (
                    <span className="text-sm text-slate-600">
                      Renews before {formatDate(status.expiresAt)}
                    </span>
                  ) : null}
                  {status.state === 'active' && !status.expiresAt ? (
                    <span className="text-sm text-slate-600">Perpetual license</span>
                  ) : null}
                </div>

                {status.reason ? (
                  <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
                    {status.reason}
                  </p>
                ) : null}

                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-slate-500">License id</dt>
                    <dd className="font-medium">{status.licenseId ?? 'Not issued yet'}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Expires</dt>
                    <dd className="font-medium">
                      {status.expiresAt ? formatDate(status.expiresAt) : 'Never (perpetual)'}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-slate-500">Installation id</dt>
                    <dd className="flex flex-wrap items-center gap-2 font-mono text-xs">
                      <span className="break-all rounded-lg bg-slate-100 px-2 py-1 dark:bg-slate-800">
                        {status.installId}
                      </span>
                      <Button variant="ghost" size="sm" onClick={() => void copyInstallId()}>
                        {copied ? 'Copied' : 'Copy'}
                      </Button>
                    </dd>
                    <p className="mt-1 text-xs text-slate-500">
                      Send this id when a key should be locked to this computer.
                    </p>
                  </div>
                </dl>
              </>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Activate a license key</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {error ? <ErrorState message={error} /> : null}
            {!canActivate ? (
              <p className="text-sm text-slate-600">
                Only an administrator can activate this copy. Sign in with an administrator account,
                or contact support.
              </p>
            ) : (
              <>
                <textarea
                  value={key}
                  onChange={(event) => setKey(event.target.value)}
                  rows={4}
                  spellCheck={false}
                  placeholder="ANQ1.…"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200 dark:border-slate-700 dark:bg-slate-900"
                />
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => void activate()} disabled={busy}>
                    {busy ? 'Checking key…' : 'Activate this computer'}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => void signOut().then(() => navigate('/login', { replace: true }))}
                  >
                    Sign out
                  </Button>
                </div>
                <p className="text-xs text-slate-500">
                  Activation is offline: the key is checked on this computer and never sent
                  anywhere.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
