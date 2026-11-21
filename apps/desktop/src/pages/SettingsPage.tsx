import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Cloud,
  DatabaseBackup,
  Download,
  FolderOpen,
  HardDrive,
  KeyRound,
  MessageCircle,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { TD, TH, THead, TRow, Table } from '../components/ui/table';
import { ConfirmDialog, ErrorState, LoadingState } from '../components/ui/states';
import { Stat } from '../components/ui/stat';
import { useSession } from '../stores/session';
import { CloudBackupCard, LoyaltySettingsCard } from '../components/settings/BusinessPackCards';
import { BackupOffsiteCard } from '../components/settings/BackupOffsiteCard';
import { RestaurantSettingsCard } from '../components/settings/RestaurantSettingsCard';
import { hasModule } from '../components/layout/nav';
import { ipc } from '../lib/ipc';
import { ReceiptPrinterSettings } from '../components/ReceiptPrinterSettings';
import type {
  AutomationMessage,
  AutomationMessageStatus,
  BackupRow,
  LocationRow,
  UpdateCheck,
} from '../types/global';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isSafetyCopy(name: string): boolean {
  return name.startsWith('pre-restore-');
}

const AUTOMATION_STATUS: Record<AutomationMessageStatus, { label: string; className: string }> = {
  sent: {
    label: 'Sent',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  },
  dry_run: {
    label: 'Preview',
    className: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  },
  queued: {
    label: 'Queued',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  },
  failed: {
    label: 'Failed',
    className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  },
};

function messagePreview(message: AutomationMessage): string {
  const firstLine = message.body.split('\n')[0] ?? '';
  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}…` : firstLine;
}

export function SettingsPage(): JSX.Element {
  const queryClient = useQueryClient();
  const signOut = useSession((s) => s.signOut);
  const sessionUser = useSession((s) => s.user);
  const [restoreTarget, setRestoreTarget] = useState<BackupRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BackupRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const backupsQuery = useQuery({
    queryKey: ['backups'],
    queryFn: async () => {
      const res = await ipc.backups();
      if (!res.ok) throw new Error(res.error ?? 'Could not load backups');
      return { dir: res.dir ?? '', items: res.items ?? [] };
    },
  });

  const licenseQuery = useQuery({
    queryKey: ['license'],
    queryFn: async () => {
      const res = await ipc.licenseStatus();
      if (!res.ok || !res.status) throw new Error(res.error ?? 'Could not read the license');
      return res.status;
    },
  });

  const versionQuery = useQuery({
    queryKey: ['app-version'],
    queryFn: () => ipc.getVersion(),
  });

  const [updateResult, setUpdateResult] = useState<UpdateCheck | null>(null);
  const updateMutation = useMutation({
    mutationFn: () => ipc.updateCheck(),
    onSuccess: (result) => setUpdateResult(result),
    onError: (e: Error) =>
      setUpdateResult({ ok: false, configured: true, currentVersion: '', error: e.message }),
  });

  const invalidate = (): Promise<unknown> =>
    queryClient.invalidateQueries({ queryKey: ['backups'] });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await ipc.backupCreate();
      if (!res.ok) throw new Error(res.error ?? 'Could not create the backup');
      return res;
    },
    onSuccess: (res) => {
      setActionError(null);
      setNotice(
        `Backup ${res.backup?.name ?? 'created'} is ready${res.pruned ? ` (${res.pruned} old backup${res.pruned === 1 ? '' : 's'} removed)` : ''}.`
      );
      void invalidate();
    },
    onError: (e: Error) => {
      setNotice(null);
      setActionError(e.message);
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (backup: BackupRow) => {
      const res = await ipc.backupRestore(backup.name);
      if (!res.ok) throw new Error(res.error ?? 'Could not restore the backup');
      return res;
    },
    onSuccess: async () => {
      setRestoreTarget(null);
      // A restored database carries its own sessions, so sign in again.
      await signOut();
    },
    onError: (e: Error) => {
      setRestoreTarget(null);
      setActionError(e.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (backup: BackupRow) => {
      const res = await ipc.backupDelete(backup.name);
      if (!res.ok) throw new Error(res.error ?? 'Could not delete the backup');
    },
    onSuccess: () => {
      setDeleteTarget(null);
      setActionError(null);
      void invalidate();
    },
    onError: (e: Error) => {
      setDeleteTarget(null);
      setActionError(e.message);
    },
  });

  // --- Batch 8: locations ---
  const [locationName, setLocationName] = useState('');
  const [locationAddress, setLocationAddress] = useState('');

  const locationsQuery = useQuery({
    queryKey: ['locations'],
    queryFn: async () => {
      const res = await ipc.locations();
      if (!res.ok) throw new Error(res.error ?? 'Could not load locations');
      return res.items;
    },
  });

  const locationCreateMutation = useMutation({
    mutationFn: async () => {
      const res = await ipc.locationCreate({
        name: locationName,
        address: locationAddress,
      });
      if (!res.ok) throw new Error(res.error ?? 'Could not add the location');
    },
    onSuccess: () => {
      setActionError(null);
      setLocationName('');
      setLocationAddress('');
      void queryClient.invalidateQueries({ queryKey: ['locations'] });
    },
    onError: (e: Error) => setActionError(e.message),
  });

  const locationDefaultMutation = useMutation({
    mutationFn: async (location: LocationRow) => {
      const res = await ipc.locationUpdate(location.id, { isDefault: true });
      if (!res.ok) throw new Error(res.error ?? 'Could not change the default location');
    },
    onSuccess: () => {
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ['locations'] });
    },
    onError: (e: Error) => setActionError(e.message),
  });

  // --- Batch 8: hub sync. Empty local state means "show the saved value". ---
  const [syncUrl, setSyncUrl] = useState<string | null>(null);
  const [syncKey, setSyncKey] = useState<string | null>(null);
  const [syncEnabled, setSyncEnabled] = useState<boolean | null>(null);

  const syncQuery = useQuery({
    queryKey: ['sync-status'],
    queryFn: async () => {
      const res = await ipc.syncStatus();
      if (!res.ok || !res.status) throw new Error(res.error ?? 'Could not read sync settings');
      return res.status;
    },
  });

  const syncUrlValue = syncUrl ?? syncQuery.data?.settings.url ?? '';
  const syncKeyValue = syncKey ?? syncQuery.data?.settings.key ?? '';
  const syncEnabledValue = syncEnabled ?? syncQuery.data?.settings.enabled ?? false;

  const syncSaveMutation = useMutation({
    mutationFn: async () => {
      const res = await ipc.syncConfigure({
        url: syncUrlValue,
        key: syncKeyValue,
        enabled: syncEnabledValue,
      });
      if (!res.ok) throw new Error(res.error ?? 'Could not save sync settings');
    },
    onSuccess: () => {
      setActionError(null);
      setNotice('Sync settings saved.');
      setSyncUrl(null);
      setSyncKey(null);
      setSyncEnabled(null);
      void queryClient.invalidateQueries({ queryKey: ['sync-status'] });
    },
    onError: (e: Error) => setActionError(e.message),
  });

  const syncNowMutation = useMutation({
    mutationFn: async () => {
      const res = await ipc.syncNow();
      if (!res.ok) throw new Error(res.error ?? 'Sync failed');
      return res;
    },
    onSuccess: (res) => {
      setActionError(null);
      setNotice(`Sync finished: ${res.pushed ?? 0} pushed, ${res.pulled ?? 0} received.`);
      void queryClient.invalidateQueries();
    },
    onError: (e: Error) => {
      setNotice(null);
      setActionError(e.message);
      void queryClient.invalidateQueries({ queryKey: ['sync-status'] });
    },
  });

  // --- Batch 11: WhatsApp + AI automation. Secrets are write-only, so the
  // token and key inputs start blank and only replace what is saved when typed.
  const [autoDraft, setAutoDraft] = useState<{
    whatsappEnabled?: boolean;
    whatsappPhoneId?: string;
    whatsappToken?: string;
    whatsappTo?: string;
    whatsappTemplate?: string;
    whatsappLang?: string;
    aiEnabled?: boolean;
    aiBaseUrl?: string;
    aiApiKey?: string;
    aiModel?: string;
    lowStockEnabled?: boolean;
    dailySummaryEnabled?: boolean;
    dailySummaryHour?: number;
  }>({});
  const [testBody, setTestBody] = useState('Hello from AnalytIQ Inventory');

  const automationQuery = useQuery({
    queryKey: ['automation'],
    queryFn: async () => {
      const res = await ipc.automationSettings();
      if (!res.ok || !res.settings)
        throw new Error(res.error ?? 'Could not read automation settings');
      return res.settings;
    },
  });

  const automationMessagesQuery = useQuery({
    queryKey: ['automation-messages'],
    queryFn: async () => {
      const res = await ipc.automationMessages(20);
      if (!res.ok) throw new Error(res.error ?? 'Could not load automation messages');
      return res.messages ?? [];
    },
  });

  const saved = automationQuery.data;
  const auto = {
    whatsappEnabled: autoDraft.whatsappEnabled ?? saved?.whatsappEnabled ?? false,
    whatsappPhoneId: autoDraft.whatsappPhoneId ?? saved?.whatsappPhoneId ?? '',
    whatsappToken: autoDraft.whatsappToken ?? '',
    whatsappTo: autoDraft.whatsappTo ?? saved?.whatsappTo ?? '',
    whatsappTemplate: autoDraft.whatsappTemplate ?? saved?.whatsappTemplate ?? '',
    whatsappLang: autoDraft.whatsappLang ?? saved?.whatsappLang ?? 'en',
    aiEnabled: autoDraft.aiEnabled ?? saved?.aiEnabled ?? false,
    aiBaseUrl: autoDraft.aiBaseUrl ?? saved?.aiBaseUrl ?? '',
    aiApiKey: autoDraft.aiApiKey ?? '',
    aiModel: autoDraft.aiModel ?? saved?.aiModel ?? 'gpt-4o-mini',
    lowStockEnabled: autoDraft.lowStockEnabled ?? saved?.lowStockEnabled ?? false,
    dailySummaryEnabled: autoDraft.dailySummaryEnabled ?? saved?.dailySummaryEnabled ?? false,
    dailySummaryHour: autoDraft.dailySummaryHour ?? saved?.dailySummaryHour ?? 20,
  };
  const patchDraft = (patch: typeof autoDraft): void =>
    setAutoDraft((current) => ({ ...current, ...patch }));

  const automationSaveMutation = useMutation({
    mutationFn: async () => {
      const res = await ipc.automationSave(auto);
      if (!res.ok) throw new Error(res.error ?? 'Could not save automation settings');
    },
    onSuccess: () => {
      setActionError(null);
      setNotice('Automation settings saved.');
      setAutoDraft({});
      void queryClient.invalidateQueries({ queryKey: ['automation'] });
    },
    onError: (e: Error) => setActionError(e.message),
  });

  const automationTestMutation = useMutation({
    mutationFn: async () => {
      const res = await ipc.automationTest({ body: testBody });
      if (!res.ok || !res.message) throw new Error(res.error ?? 'Could not send the test message');
      return res.message;
    },
    onSuccess: (message) => {
      if (message.status === 'failed') {
        setNotice(null);
        setActionError(message.error || 'WhatsApp rejected the test message');
      } else if (message.status === 'dry_run') {
        setActionError(null);
        setNotice('Preview saved — WhatsApp is off, so nothing was sent.');
      } else {
        setActionError(null);
        setNotice('Test message sent.');
      }
      void queryClient.invalidateQueries({ queryKey: ['automation-messages'] });
    },
    onError: (e: Error) => {
      setNotice(null);
      setActionError(e.message);
    },
  });

  const automationRunMutation = useMutation({
    mutationFn: async () => {
      const res = await ipc.automationRun();
      if (!res.ok || !res.result) throw new Error(res.error ?? 'Could not run the automation');
      return res.result;
    },
    onSuccess: (result) => {
      setActionError(null);
      setNotice(
        result.queued === 0
          ? 'Nothing to send right now.'
          : `${result.queued} message${result.queued === 1 ? '' : 's'}: ${result.sent} sent, ${result.failed} failed, ${result.dryRun} preview${result.dryRun === 1 ? '' : 's'}.`
      );
      void queryClient.invalidateQueries({ queryKey: ['automation-messages'] });
    },
    onError: (e: Error) => {
      setNotice(null);
      setActionError(e.message);
    },
  });

  const items = backupsQuery.data?.items ?? [];
  const totalBytes = items.reduce((sum, item) => sum + item.sizeBytes, 0);
  const latest = items[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Protect your business data with local snapshots you can restore at any time.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={async () => {
              const res = await ipc.backupReveal();
              if (!res.ok) setActionError(res.error ?? 'Could not open the backups folder');
            }}
          >
            <FolderOpen className="h-4 w-4" /> Open folder
          </Button>
          <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
            <Plus className="h-4 w-4" /> Back up now
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          icon={DatabaseBackup}
          label="Backups"
          value={String(items.length)}
          sub="14 most recent kept automatically"
          tone="brand"
        />
        <Stat
          icon={ShieldCheck}
          label="Latest backup"
          value={latest ? new Date(latest.createdAt).toLocaleDateString() : 'None yet'}
          sub={latest ? new Date(latest.createdAt).toLocaleTimeString() : 'Back up today'}
          tone="emerald"
        />
        <Stat
          icon={HardDrive}
          label="Disk used"
          value={formatBytes(totalBytes)}
          sub={backupsQuery.data?.dir ?? ''}
          tone="sky"
        />
      </div>

      {notice ? (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
          {notice}
        </p>
      ) : null}
      {actionError ? <ErrorState message={actionError} /> : null}

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>License</CardTitle>
          <Link
            to="/license"
            className="inline-flex h-8 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <KeyRound className="h-4 w-4" /> Manage license
          </Link>
        </CardHeader>
        <CardContent className="text-sm">
          {licenseQuery.isLoading ? <LoadingState label="Reading license…" /> : null}
          {licenseQuery.isError ? (
            <ErrorState message={(licenseQuery.error as Error).message} />
          ) : null}
          {licenseQuery.data ? (
            <div className="flex flex-wrap items-center gap-3">
              <Badge
                className={
                  licenseQuery.data.usable
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                    : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
                }
              >
                {licenseQuery.data.state}
              </Badge>
              <span className="text-slate-600 dark:text-slate-300">
                {licenseQuery.data.state === 'active'
                  ? `${licenseQuery.data.business ?? 'Licensed'} — ${
                      licenseQuery.data.plan ?? 'standard'
                    } plan`
                  : licenseQuery.data.state === 'trial'
                    ? `Trial — ${licenseQuery.data.daysLeft ?? 0} day${
                        licenseQuery.data.daysLeft === 1 ? '' : 's'
                      } left`
                    : (licenseQuery.data.reason ?? 'Activate this copy to keep selling')}
              </span>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Updates</CardTitle>
          <span className="text-xs text-slate-500">
            {versionQuery.data ? `Version ${versionQuery.data}` : 'Version …'}
          </span>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-slate-600 dark:text-slate-300">
            Update checks only run when this installation is configured with an update feed, and
            nothing is downloaded automatically.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => updateMutation.mutate()}
              disabled={updateMutation.isPending}
            >
              <RefreshCw className="h-4 w-4" />
              {updateMutation.isPending ? 'Checking…' : 'Check for updates'}
            </Button>
            {updateResult?.updateAvailable && updateResult.url ? (
              <Button size="sm" onClick={() => void ipc.openExternal(updateResult.url ?? '')}>
                <Download className="h-4 w-4" /> Open download page
              </Button>
            ) : null}
          </div>
          {updateResult ? (
            updateResult.updateAvailable ? (
              <p className="rounded-xl bg-amber-50 px-4 py-3 text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
                Version {updateResult.latestVersion} is available.
                {updateResult.notes ? ` ${updateResult.notes}` : ''}
              </p>
            ) : updateResult.ok ? (
              <p className="text-emerald-700 dark:text-emerald-300">
                You are running the latest version ({updateResult.currentVersion}).
              </p>
            ) : (
              <p className="text-slate-600 dark:text-slate-300">
                {updateResult.error ?? 'Update check failed.'}
              </p>
            )
          ) : null}
        </CardContent>
      </Card>

      <ReceiptPrinterSettings />

      {hasModule(sessionUser?.businessType, 'tables', sessionUser?.modules) ? (
        <RestaurantSettingsCard />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Locations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            New stock and sales are recorded against the default location. Products, customers and
            the stock ledger are shared with every branch you connect through sync.
          </p>
          {locationsQuery.isLoading ? <LoadingState label="Loading locations…" /> : null}
          {locationsQuery.isError ? (
            <ErrorState message={(locationsQuery.error as Error).message} />
          ) : null}
          {locationsQuery.data && locationsQuery.data.length > 0 ? (
            <Table>
              <THead>
                <TRow>
                  <TH>Location</TH>
                  <TH>Address</TH>
                  <TH className="text-right">Default</TH>
                </TRow>
              </THead>
              <tbody>
                {locationsQuery.data.map((location) => (
                  <TRow key={location.id}>
                    <TD className="font-medium">{location.name}</TD>
                    <TD className="text-slate-500 dark:text-slate-400">
                      {location.address || '—'}
                    </TD>
                    <TD>
                      <div className="flex justify-end">
                        {location.isDefault ? (
                          <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                            Default
                          </Badge>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={locationDefaultMutation.isPending}
                            onClick={() => locationDefaultMutation.mutate(location)}
                          >
                            Make default
                          </Button>
                        )}
                      </div>
                    </TD>
                  </TRow>
                ))}
              </tbody>
            </Table>
          ) : null}
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              locationCreateMutation.mutate();
            }}
          >
            <div className="min-w-[180px] flex-1">
              <Input
                label="New location"
                placeholder="e.g. Ikeja branch"
                value={locationName}
                onChange={(event) => setLocationName(event.target.value)}
              />
            </div>
            <div className="min-w-[180px] flex-1">
              <Input
                label="Address"
                placeholder="Optional"
                value={locationAddress}
                onChange={(event) => setLocationAddress(event.target.value)}
              />
            </div>
            <Button
              type="submit"
              disabled={locationCreateMutation.isPending || locationName.trim().length < 2}
            >
              <Plus className="h-4 w-4" /> Add location
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Branch sync</CardTitle>
          <Badge
            className={
              syncQuery.data?.settings.enabled
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
            }
          >
            {syncQuery.data?.settings.enabled ? 'On' : 'Off'}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Connect this installation to a relay to share products, customers, suppliers, tables and
            stock movements between branches. Sales and purchases stay on the till that recorded
            them.
          </p>
          {syncQuery.isLoading ? <LoadingState label="Reading sync settings…" /> : null}
          {syncQuery.isError ? <ErrorState message={(syncQuery.error as Error).message} /> : null}
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              syncSaveMutation.mutate();
            }}
          >
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                label="Relay URL"
                placeholder="https://sync.example.com"
                value={syncUrlValue}
                onChange={(event) => setSyncUrl(event.target.value)}
              />
              <Input
                label="Sync key"
                type="password"
                placeholder="Shared secret"
                autoComplete="off"
                value={syncKeyValue}
                onChange={(event) => setSyncKey(event.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300"
                  checked={syncEnabledValue}
                  onChange={(event) => setSyncEnabled(event.target.checked)}
                />
                Keep this installation in sync automatically
              </label>
              <div className="flex gap-2">
                <Button type="submit" variant="secondary" disabled={syncSaveMutation.isPending}>
                  <Save className="h-4 w-4" /> Save
                </Button>
                <Button
                  type="button"
                  disabled={syncNowMutation.isPending || !syncEnabledValue}
                  onClick={() => syncNowMutation.mutate()}
                >
                  <Cloud className="h-4 w-4" />
                  {syncNowMutation.isPending ? 'Syncing…' : 'Sync now'}
                </Button>
              </div>
            </div>
          </form>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Last push:{' '}
            {syncQuery.data?.lastPushAt
              ? new Date(syncQuery.data.lastPushAt).toLocaleString()
              : 'Never'}{' '}
            · Last pull:{' '}
            {syncQuery.data?.lastPullAt
              ? new Date(syncQuery.data.lastPullAt).toLocaleString()
              : 'Never'}
          </p>
          {syncQuery.data?.lastError ? (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
              {syncQuery.data.lastError}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>WhatsApp &amp; AI alerts</CardTitle>
          <Badge
            className={
              auto.whatsappEnabled
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
            }
          >
            {auto.whatsappEnabled ? 'Sending' : 'Preview only'}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Low-stock alerts and a daily sales summary are written to an outbox first. With WhatsApp
            off they stay as previews, so you can see exactly what would be sent before connecting a
            number. Secrets are stored on this installation only and are never shown again after
            saving.
          </p>
          {automationQuery.isLoading ? <LoadingState label="Reading automation settings…" /> : null}
          {automationQuery.isError ? (
            <ErrorState message={(automationQuery.error as Error).message} />
          ) : null}

          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              automationSaveMutation.mutate();
            }}
          >
            <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              <label className="mb-2 flex items-center gap-2 font-medium text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300"
                  checked={auto.whatsappEnabled}
                  onChange={(event) => patchDraft({ whatsappEnabled: event.target.checked })}
                />
                <MessageCircle className="h-4 w-4" /> Send through WhatsApp
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  label="Phone number id"
                  placeholder="From the Meta WhatsApp dashboard"
                  value={auto.whatsappPhoneId}
                  onChange={(event) => patchDraft({ whatsappPhoneId: event.target.value })}
                />
                <Input
                  label="Access token"
                  type="password"
                  autoComplete="off"
                  placeholder={
                    saved?.whatsappTokenSet ? 'Saved — leave blank to keep' : 'Permanent token'
                  }
                  value={auto.whatsappToken}
                  onChange={(event) => patchDraft({ whatsappToken: event.target.value })}
                />
                <Input
                  label="Recipient"
                  placeholder="e.g. 2348012345678"
                  value={auto.whatsappTo}
                  onChange={(event) => patchDraft({ whatsappTo: event.target.value })}
                />
                <Input
                  label="Template name (optional)"
                  placeholder="e.g. shop_alerts"
                  value={auto.whatsappTemplate}
                  onChange={(event) => patchDraft({ whatsappTemplate: event.target.value })}
                />
                <Input
                  label="Template language"
                  placeholder="en"
                  value={auto.whatsappLang}
                  onChange={(event) => patchDraft({ whatsappLang: event.target.value })}
                />
              </div>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Meta only allows plain text within 24 hours of your last reply from that number. For
                unattended alerts, create a message template with one body variable and enter its
                name here; the alert text fills the variable.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              <label className="mb-2 flex items-center gap-2 font-medium text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300"
                  checked={auto.aiEnabled}
                  onChange={(event) => patchDraft({ aiEnabled: event.target.checked })}
                />
                <Sparkles className="h-4 w-4" /> Rewrite messages with AI
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  label="AI base URL"
                  placeholder="https://api.openai.com/v1"
                  value={auto.aiBaseUrl}
                  onChange={(event) => patchDraft({ aiBaseUrl: event.target.value })}
                />
                <Input
                  label="API key"
                  type="password"
                  autoComplete="off"
                  placeholder={saved?.aiApiKeySet ? 'Saved — leave blank to keep' : 'Optional'}
                  value={auto.aiApiKey}
                  onChange={(event) => patchDraft({ aiApiKey: event.target.value })}
                />
                <Input
                  label="Model"
                  placeholder="gpt-4o-mini"
                  value={auto.aiModel}
                  onChange={(event) => patchDraft({ aiModel: event.target.value })}
                />
              </div>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Works with any OpenAI-compatible chat endpoint. If the call fails, the plain message
                is sent unchanged.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              <p className="mb-2 font-medium text-slate-700 dark:text-slate-200">When to send</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300"
                    checked={auto.lowStockEnabled}
                    onChange={(event) => patchDraft({ lowStockEnabled: event.target.checked })}
                  />
                  Low-stock alert once a day
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300"
                    checked={auto.dailySummaryEnabled}
                    onChange={(event) => patchDraft({ dailySummaryEnabled: event.target.checked })}
                  />
                  Daily sales summary
                </label>
                <Input
                  label="Summary hour (0–23)"
                  type="number"
                  min={0}
                  max={23}
                  value={String(auto.dailySummaryHour)}
                  onChange={(event) =>
                    patchDraft({
                      dailySummaryHour: Math.min(23, Math.max(0, Number(event.target.value) || 0)),
                    })
                  }
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Last alert:{' '}
                {saved?.lastLowStockOn
                  ? new Date(saved.lastLowStockOn).toLocaleDateString()
                  : 'Never'}{' '}
                · Last summary:{' '}
                {saved?.lastSummaryOn
                  ? new Date(saved.lastSummaryOn).toLocaleDateString()
                  : 'Never'}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="submit"
                  variant="secondary"
                  disabled={automationSaveMutation.isPending}
                >
                  <Save className="h-4 w-4" /> Save
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={automationRunMutation.isPending}
                  onClick={() => automationRunMutation.mutate()}
                >
                  <Play className="h-4 w-4" />
                  {automationRunMutation.isPending ? 'Running…' : 'Run now'}
                </Button>
              </div>
            </div>
          </form>

          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[220px] flex-1">
              <Input
                label="Test message"
                value={testBody}
                onChange={(event) => setTestBody(event.target.value)}
              />
            </div>
            <Button
              type="button"
              disabled={automationTestMutation.isPending || testBody.trim().length === 0}
              onClick={() => automationTestMutation.mutate()}
            >
              <Send className="h-4 w-4" />
              {automationTestMutation.isPending ? 'Sending…' : 'Send test'}
            </Button>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="font-medium text-slate-700 dark:text-slate-200">Recent messages</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void automationMessagesQuery.refetch()}
                disabled={automationMessagesQuery.isFetching}
              >
                <RefreshCw className="h-4 w-4" /> Refresh
              </Button>
            </div>
            {automationMessagesQuery.isLoading ? <LoadingState label="Loading messages…" /> : null}
            {automationMessagesQuery.isError ? (
              <ErrorState message={(automationMessagesQuery.error as Error).message} />
            ) : null}
            {automationMessagesQuery.data && automationMessagesQuery.data.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-500">
                Nothing sent yet. Press <span className="font-medium">Run now</span> to generate the
                first alert.
              </p>
            ) : null}
            {automationMessagesQuery.data && automationMessagesQuery.data.length > 0 ? (
              <Table>
                <THead>
                  <TRow>
                    <TH>Message</TH>
                    <TH>Status</TH>
                    <TH>When</TH>
                  </TRow>
                </THead>
                <tbody>
                  {automationMessagesQuery.data.map((message) => {
                    const status = AUTOMATION_STATUS[message.status];
                    return (
                      <TRow key={message.id}>
                        <TD>
                          <div className="font-medium text-slate-700 dark:text-slate-200">
                            {message.kind === 'daily_summary'
                              ? 'Daily summary'
                              : message.kind === 'test'
                                ? 'Test message'
                                : 'Low stock'}
                          </div>
                          <div className="text-xs text-slate-500" title={message.body}>
                            {messagePreview(message)}
                          </div>
                        </TD>
                        <TD>
                          <Badge className={status.className}>{status.label}</Badge>
                          {message.error ? (
                            <div className="mt-1 text-xs text-red-600 dark:text-red-400">
                              {message.error}
                            </div>
                          ) : null}
                        </TD>
                        <TD className="whitespace-nowrap text-slate-500 dark:text-slate-400">
                          {new Date(message.createdAt).toLocaleString()}
                        </TD>
                      </TRow>
                    );
                  })}
                </tbody>
              </Table>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <LoyaltySettingsCard />
      <CloudBackupCard />
      <BackupOffsiteCard />

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Backups</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void backupsQuery.refetch()}
            disabled={backupsQuery.isFetching}
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
            A verified snapshot is taken automatically once a day while the app is open. A restore
            first saves the current data as a safety copy and then replaces everything with the
            chosen snapshot — you will need to sign in again afterwards.
          </p>

          {backupsQuery.isLoading ? <LoadingState label="Loading backups…" /> : null}
          {backupsQuery.isError ? (
            <ErrorState
              message={(backupsQuery.error as Error).message}
              onRetry={() => void backupsQuery.refetch()}
            />
          ) : null}
          {backupsQuery.isSuccess && items.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              No backups yet. Use “Back up now” to take the first snapshot.
            </p>
          ) : null}

          {backupsQuery.isSuccess && items.length > 0 ? (
            <Table>
              <THead>
                <TRow>
                  <TH>File</TH>
                  <TH>Type</TH>
                  <TH>Created</TH>
                  <TH className="text-right">Size</TH>
                  <TH className="text-right">Actions</TH>
                </TRow>
              </THead>
              <tbody>
                {items.map((backup) => (
                  <TRow key={backup.name}>
                    <TD className="font-mono text-xs">{backup.name}</TD>
                    <TD>
                      {isSafetyCopy(backup.name) ? (
                        <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                          Safety copy
                        </Badge>
                      ) : (
                        <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                          Snapshot
                        </Badge>
                      )}
                    </TD>
                    <TD>{new Date(backup.createdAt).toLocaleString()}</TD>
                    <TD className="text-right tabular-nums">{formatBytes(backup.sizeBytes)}</TD>
                    <TD>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={restoreMutation.isPending}
                          onClick={() => {
                            setActionError(null);
                            setRestoreTarget(backup);
                          }}
                        >
                          <RotateCcw className="h-4 w-4" /> Restore
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Delete ${backup.name}`}
                          disabled={deleteMutation.isPending}
                          onClick={() => {
                            setActionError(null);
                            setDeleteTarget(backup);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TD>
                  </TRow>
                ))}
              </tbody>
            </Table>
          ) : null}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={restoreTarget !== null}
        title="Restore this backup?"
        message={`Every sale, product and customer entered after ${restoreTarget ? new Date(restoreTarget.createdAt).toLocaleString() : 'this snapshot'} will be replaced by the snapshot. The current data is saved as a safety copy first, and you will be signed out.`}
        confirmLabel="Restore and sign out"
        onConfirm={() => {
          if (restoreTarget) restoreMutation.mutate(restoreTarget);
        }}
        onCancel={() => setRestoreTarget(null)}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete this backup?"
        message={`${deleteTarget?.name ?? 'This file'} will be permanently removed from disk. This cannot be undone.`}
        confirmLabel="Delete backup"
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
