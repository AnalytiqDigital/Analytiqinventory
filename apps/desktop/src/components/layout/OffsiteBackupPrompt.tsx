import { useEffect, useState } from 'react';
import { Button } from '../ui/button';
import { Modal } from '../ui/modal';
import { ipc } from '../../lib/ipc';
import type { OffsiteBackupStatus } from '../../types/global';

export function OffsiteBackupPrompt(): JSX.Element | null {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<OffsiteBackupStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const result = await ipc.offsiteBackupStatus();
      if (!alive || !result.ok || !result.status) return;
      setStatus(result.status);
      if (!result.status.configured && !result.status.prompted) setOpen(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const choose = async (): Promise<void> => {
    setError(null);
    setBusy(true);
    const result = await ipc.chooseOffsiteBackup();
    setBusy(false);
    if (result.ok) {
      if (result.status) setStatus(result.status);
      setOpen(false);
      return;
    }
    if (!result.canceled) setError(result.error ?? 'Could not use that folder');
  };

  const later = async (): Promise<void> => {
    setBusy(true);
    await ipc.skipOffsiteBackup();
    setBusy(false);
    setOpen(false);
  };

  if (!status) return null;

  return (
    <Modal open={open} title="Keep a backup off this PC" onClose={() => void later()}>
      <div className="space-y-4 text-sm text-slate-600 dark:text-slate-300">
        <p>
          A verified snapshot is saved on this computer every day. If the PC is stolen or its disk
          fails, those snapshots go with it.
        </p>
        <p>
          Choose a folder on a USB stick, external drive or a synced folder (for example OneDrive).
          Each new snapshot is copied there automatically.
        </p>
        {error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700 dark:bg-red-900/30 dark:text-red-200">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => void later()} disabled={busy}>
            Not now
          </Button>
          <Button onClick={() => void choose()} disabled={busy}>
            {busy ? 'Opening…' : 'Choose a folder'}
          </Button>
        </div>
        <p className="text-xs text-slate-500">
          You can change this later in Settings → Backups. Backups are never uploaded by this step.
        </p>
      </div>
    </Modal>
  );
}
