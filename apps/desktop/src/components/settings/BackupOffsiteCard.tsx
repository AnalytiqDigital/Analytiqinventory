import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FolderOpen, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { ErrorState, LoadingState } from '../ui/states';
import { ipc } from '../../lib/ipc';

function formatDate(iso: string | null): string {
  if (!iso) return 'not yet';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

export function BackupOffsiteCard(): JSX.Element {
  const queryClient = useQueryClient();
  const statusQuery = useQuery({
    queryKey: ['backup-offsite'],
    queryFn: async () => {
      const result = await ipc.offsiteBackupStatus();
      if (!result.ok || !result.status) {
        throw new Error(result.error ?? 'Could not read the off-disk backup setting');
      }
      return result.status;
    },
  });

  const choose = useMutation({
    mutationFn: async () => {
      const result = await ipc.chooseOffsiteBackup();
      if (!result.ok && !result.canceled) {
        throw new Error(result.error ?? 'Could not use that folder');
      }
      return result;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['backup-offsite'] }),
  });

  const status = statusQuery.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Off-disk backup</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {statusQuery.isLoading ? <LoadingState label="Checking the backup folder…" /> : null}
        {statusQuery.isError ? (
          <ErrorState
            message={(statusQuery.error as Error).message}
            onRetry={() => void statusQuery.refetch()}
          />
        ) : null}

        {status && !status.configured ? (
          <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-100">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <div>
              <p className="font-semibold">Backups are only on this PC</p>
              <p>
                If this computer is lost or its disk fails, every snapshot is lost with it. Choose a
                folder on a USB drive, external disk or synced folder.
              </p>
            </div>
          </div>
        ) : null}

        {status && status.configured ? (
          <div
            className={
              status.exists && !status.sameDrive
                ? 'flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-100'
                : 'flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-100'
            }
          >
            {status.exists && !status.sameDrive ? (
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            ) : (
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            )}
            <div>
              <p className="font-semibold">
                {!status.exists
                  ? 'The off-disk folder is not available'
                  : status.sameDrive
                    ? 'This folder is on the same drive'
                    : 'Copied off this PC'}
              </p>
              <p>
                {!status.exists
                  ? 'The drive may be unplugged. Reconnect it, or choose another folder.'
                  : status.sameDrive
                    ? 'A disk failure would take both copies. A USB drive, external disk or synced folder is safer.'
                    : `New snapshots are copied to ${status.dir}.`}
              </p>
              <p className="mt-1 text-xs">
                {status.dir} · last copy {formatDate(status.lastCopyAt)}
              </p>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => choose.mutate()}
            disabled={choose.isPending || statusQuery.isLoading}
          >
            <FolderOpen className="h-4 w-4" />
            {status?.configured ? 'Change folder' : 'Choose a folder'}
          </Button>
          {choose.isError ? (
            <span className="text-xs text-red-600">{(choose.error as Error).message}</span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
