import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CloudUpload, Sparkles } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { TD, TH, THead, TRow, Table } from '../ui/table';
import { ErrorState, LoadingState } from '../ui/states';
import { ipc } from '../../lib/ipc';
import { parseNairaToKobo } from '../../lib/money';

export function LoyaltySettingsCard(): JSX.Element {
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(false);
  const [earn, setEarn] = useState('10.00');
  const [value, setValue] = useState('1.00');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [ready, setReady] = useState(false);

  const settingsQuery = useQuery({
    queryKey: ['loyalty-settings'],
    queryFn: async () => {
      const res = await ipc.loyaltySettings();
      if (!res.ok) throw new Error(res.error ?? 'Could not load loyalty settings');
      return res.settings ?? null;
    },
  });

  useEffect(() => {
    if (!settingsQuery.data || ready) return;
    const s = settingsQuery.data;
    setEnabled(s.enabled);
    setEarn((s.earnKoboPerPoint / 100).toFixed(2));
    setValue((s.pointValueKobo / 100).toFixed(2));
    setReady(true);
  }, [settingsQuery.data, ready]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const earnKoboPerPoint = parseNairaToKobo(earn.trim() === '' ? '0' : earn);
      if (earnKoboPerPoint === null || earnKoboPerPoint < 100)
        throw new Error('Earn at most one point per ₦1 — enter 1.00 or more');
      const pointValueKobo = parseNairaToKobo(value.trim() === '' ? '0' : value);
      if (pointValueKobo === null || pointValueKobo < 1) throw new Error('Give each point a value');
      if (pointValueKobo >= earnKoboPerPoint)
        throw new Error('A point cannot be worth more than the spend that earns it');
      const res = await ipc.loyaltySettingsSet({ enabled, earnKoboPerPoint, pointValueKobo });
      if (!res.ok) throw new Error(res.error ?? 'Could not save loyalty settings');
    },
    onSuccess: async () => {
      setSaved(true);
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['loyalty-settings'] });
    },
    onError: (e: Error) => {
      setSaved(false);
      setError(e.message);
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" /> Loyalty points
        </CardTitle>
        <Badge
          className={
            enabled
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
          }
        >
          {enabled ? 'On' : 'Off'}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {settingsQuery.isPending ? <LoadingState label="Reading loyalty settings…" /> : null}
        {settingsQuery.isError ? <ErrorState message={(settingsQuery.error as Error).message} /> : null}
        {settingsQuery.isSuccess ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              saveMutation.mutate();
            }}
          >
            <label className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              Customers earn points on sales
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                label="Customer spends (₦) per point"
                inputMode="decimal"
                value={earn}
                onChange={(e) => setEarn(e.target.value)}
              />
              <Input
                label="One point is worth (₦)"
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Example: spend ₦{earn || '10.00'} → earn 1 point; 100 points pay ₦
              {((Number(value) || 1) * 100).toFixed(2)} off a later bill. Points are only earned on
              sales with a customer attached.
            </p>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {saved ? <p className="text-sm text-emerald-600">Loyalty settings saved.</p> : null}
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Saving…' : 'Save loyalty'}
              </Button>
            </div>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function CloudBackupCard(): JSX.Element {
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(false);
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [keepLocal, setKeepLocal] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const settingsQuery = useQuery({
    queryKey: ['cloud-backup-settings'],
    queryFn: async () => {
      const res = await ipc.cloudBackupSettings();
      if (!res.ok) throw new Error(res.error ?? 'Could not load cloud backup settings');
      return res.settings ?? null;
    },
  });

  const uploadsQuery = useQuery({
    queryKey: ['cloud-backup-uploads'],
    queryFn: async () => {
      const res = await ipc.cloudBackupUploads();
      if (!res.ok) throw new Error(res.error ?? 'Could not load uploads');
      return res.items ?? [];
    },
  });

  useEffect(() => {
    if (!settingsQuery.data || ready) return;
    const s = settingsQuery.data;
    setEnabled(s.enabled);
    setUrl(s.url);
    setKeepLocal(s.keepLocal);
    setReady(true);
  }, [settingsQuery.data, ready]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (enabled && url.trim() === '') throw new Error('Enter the https upload URL');
      const res = await ipc.cloudBackupSave({
        enabled,
        url: url.trim(),
        key: key.trim(),
        passphrase,
        keepLocal,
      });
      if (!res.ok) throw new Error(res.error ?? 'Could not save cloud backup settings');
    },
    onSuccess: async () => {
      setKey('');
      setPassphrase('');
      setNotice('Cloud backup settings saved.');
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['cloud-backup-settings'] });
    },
    onError: (e: Error) => {
      setNotice(null);
      setError(e.message);
    },
  });

  const runMutation = useMutation({
    mutationFn: async () => {
      const res = await ipc.cloudBackupRun();
      if (!res.ok) throw new Error(res.error ?? 'Backup failed');
      return res;
    },
    onSuccess: async (res) => {
      setError(null);
      setNotice(
        `Encrypted backup ${res.fileName ?? ''} created${res.uploaded ? ' and uploaded' : ' locally (upload skipped)'}.`
      );
      await queryClient.invalidateQueries({ queryKey: ['cloud-backup-uploads'] });
      await queryClient.invalidateQueries({ queryKey: ['backups'] });
    },
    onError: (e: Error) => {
      setNotice(null);
      setError(e.message);
    },
  });

  const settings = settingsQuery.data;

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <CloudUpload className="h-4 w-4" /> Encrypted cloud backup
        </CardTitle>
        <Badge
          className={
            settings?.enabled
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
          }
        >
          {settings?.enabled ? 'Enabled' : 'Off'}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          A daily copy of your database is encrypted (AES-256-GCM) on this PC and uploaded to a storage
          URL you control, like an S3 presigned link or your own server. If the PC dies, the backup can
          be decrypted here with the same passphrase.
        </p>
        {settingsQuery.isPending ? <LoadingState label="Reading cloud backup settings…" /> : null}
        {settingsQuery.isError ? <ErrorState message={(settingsQuery.error as Error).message} /> : null}
        {settingsQuery.isSuccess ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              saveMutation.mutate();
            }}
          >
            <label className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              Upload encrypted backups
            </label>
            <Input
              label="HTTPS upload URL"
              placeholder="https://storage.example.com/upload"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                label="Access key (optional)"
                type="password"
                autoComplete="off"
                placeholder={settings?.keySet ? 'Saved — leave blank to keep' : 'Bearer token or key'}
                value={key}
                onChange={(e) => setKey(e.target.value)}
              />
              <Input
                label="Encryption passphrase"
                type="password"
                autoComplete="off"
                placeholder={
                  settings?.passphraseSet ? 'Saved — leave blank to keep' : 'Long phrase, stored offline too'
                }
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300"
                checked={keepLocal}
                onChange={(e) => setKeepLocal(e.target.checked)}
              />
              Keep the unencrypted local backup as well
            </label>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {notice ? <p className="text-sm text-emerald-600">{notice}</p> : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => runMutation.mutate()}
                disabled={runMutation.isPending}
              >
                {runMutation.isPending ? 'Working…' : 'Back up now'}
              </Button>
              <Button type="submit" size="sm" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </form>
        ) : null}

        {(uploadsQuery.data ?? []).length > 0 ? (
          <div>
            <p className="mb-1 text-xs font-semibold text-slate-600 dark:text-slate-300">Recent uploads</p>
            <Table>
              <THead>
                <TRow>
                  <TH>File</TH>
                  <TH>Size</TH>
                  <TH>Status</TH>
                  <TH>When</TH>
                </TRow>
              </THead>
              <tbody>
                {(uploadsQuery.data ?? []).slice(0, 10).map((u) => (
                  <TRow key={u.id}>
                    <TD className="font-mono text-xs">{u.fileName}</TD>
                    <TD className="text-xs">{(u.sizeBytes / 1024 / 1024).toFixed(1)} MB</TD>
                    <TD className="text-xs">
                      <span className={u.status === 'failed' ? 'text-red-600' : 'text-emerald-600'}>
                        {u.status}
                      </span>
                      {u.error ? <span className="ml-1 text-slate-400">{u.error}</span> : null}
                    </TD>
                    <TD className="text-xs">{new Date(u.createdAt).toLocaleString()}</TD>
                  </TRow>
                ))}
              </tbody>
            </Table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
