import { useEffect, useState } from 'react';
import { Download, FileSpreadsheet, Upload } from 'lucide-react';
import { Button } from './ui/button';
import { Modal } from './ui/modal';
import { ipc } from '../lib/ipc';
import { buildImport, templateCsv, type ImportBuild } from '../lib/import-csv';
import type { ImportKind } from '@analytiq/validation';
import type { ImportResponse } from '../types/global';

const TITLES: Record<ImportKind, string> = {
  products: 'Import products',
  purchases: 'Import purchases',
  sales: 'Import sales',
};

const MAX_ROWS = 5000;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

export function ImportDialog({
  open,
  kind,
  onClose,
  onImported,
}: {
  open: boolean;
  kind: ImportKind;
  onClose: () => void;
  onImported: () => void;
}): JSX.Element {
  const [fileName, setFileName] = useState('');
  const [build, setBuild] = useState<ImportBuild | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResponse | null>(null);

  useEffect(() => {
    if (open) return;
    setFileName('');
    setBuild(null);
    setFileError(null);
    setImporting(false);
    setResult(null);
  }, [open]);

  async function onFile(file: File | undefined): Promise<void> {
    setFileError(null);
    setResult(null);
    setBuild(null);
    setFileName(file?.name ?? '');
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setFileError('That file is larger than 5 MB. Split it into smaller files.');
      return;
    }
    try {
      const parsed = buildImport(kind, await file.text());
      if (parsed.totalRows > MAX_ROWS) {
        setFileError(`Import ${MAX_ROWS} rows at a time at most.`);
      }
      setBuild(parsed);
    } catch (err: unknown) {
      setFileError(err instanceof Error ? err.message : 'Could not read that file');
    }
  }

  function downloadTemplate(): void {
    const blob = new Blob([templateCsv(kind)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${kind}-template.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function runImport(): Promise<void> {
    if (!build || build.errors.length > 0 || build.rows.length === 0) return;
    setImporting(true);
    setResult(null);
    const payload = { rows: build.rows };
    const res =
      kind === 'products'
        ? await ipc.importProducts(payload)
        : kind === 'purchases'
          ? await ipc.importPurchases(payload)
          : await ipc.importSales(payload);
    setImporting(false);
    setResult(res);
    if (res.created > 0) onImported();
  }

  const blocked = !build || build.errors.length > 0 || build.rows.length === 0;
  const tooMany = (build?.totalRows ?? 0) > MAX_ROWS;
  const shownErrors = build?.errors.slice(0, 20) ?? [];
  const serverErrors = result?.errors.slice(0, 20) ?? [];

  return (
    <Modal open={open} title={TITLES[kind]} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <p className="text-slate-600 dark:text-slate-300">
          Upload a CSV file with one row per{' '}
          {kind === 'products' ? 'product' : kind === 'purchases' ? 'purchase line' : 'sale line'}.
          Amounts are in naira (e.g. 450 or 1,250.50).{' '}
          {kind === 'sales'
            ? 'Rows that share a receipt number are imported as one sale.'
            : kind === 'purchases'
              ? 'Rows that share a reference become one purchase.'
              : 'New categories are created automatically.'}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
            <Upload className="h-4 w-4" />
            Choose CSV file
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(event) => void onFile(event.target.files?.[0])}
            />
          </label>
          <Button variant="ghost" size="sm" onClick={downloadTemplate}>
            <Download className="h-4 w-4" />
            Download template
          </Button>
          {fileName ? (
            <span className="inline-flex items-center gap-1 text-slate-500">
              <FileSpreadsheet className="h-4 w-4" />
              {fileName}
            </span>
          ) : null}
        </div>

        {fileError ? <p className="font-medium text-red-600">{fileError}</p> : null}

        {build && build.headers.length > 0 ? (
          <div className="space-y-2">
            <p className="text-slate-600 dark:text-slate-300">
              {build.totalRows} row{build.totalRows === 1 ? '' : 's'} found
              {build.errors.length > 0 ? ` · ${build.errors.length} problem(s) to fix` : ''}.
            </p>
            {build.preview.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    <tr>
                      {build.headers.map((header) => (
                        <th key={header} className="whitespace-nowrap px-2 py-1 font-semibold">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {build.preview.map((cells, index) => (
                      <tr key={index} className="border-t border-slate-100 dark:border-slate-800">
                        {cells.map((cell, column) => (
                          <td key={column} className="whitespace-nowrap px-2 py-1">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {build.totalRows > 5 ? (
              <p className="text-xs text-slate-500">Showing the first 5 rows.</p>
            ) : null}
          </div>
        ) : null}

        {shownErrors.length > 0 ? (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-red-700 dark:bg-red-950/40 dark:text-red-300">
            <p className="font-semibold">Fix these before importing:</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              {shownErrors.map((error, index) => (
                <li key={index}>
                  Row {error.row}: {error.message}
                </li>
              ))}
            </ul>
            {build && build.errors.length > shownErrors.length ? (
              <p className="mt-1">and {build.errors.length - shownErrors.length} more…</p>
            ) : null}
          </div>
        ) : null}

        {result ? (
          <div
            className={
              result.failed > 0
                ? 'rounded-xl bg-amber-50 px-4 py-3 text-amber-900 dark:bg-amber-900/20 dark:text-amber-200'
                : 'rounded-xl bg-emerald-50 px-4 py-3 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
            }
          >
            {result.ok ? (
              <p className="font-semibold">
                Imported {result.created} {kind === 'products' ? 'product' : 'record'}
                {result.created === 1 ? '' : 's'}
                {result.failed > 0 ? ` · ${result.failed} failed` : ''}.
              </p>
            ) : (
              <p className="font-semibold">{result.error ?? 'Import failed'}</p>
            )}
            {serverErrors.length > 0 ? (
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm">
                {serverErrors.map((error, index) => (
                  <li key={index}>
                    Row {error.row}: {error.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            {result && result.created > 0 ? 'Done' : 'Cancel'}
          </Button>
          <Button onClick={() => void runImport()} disabled={blocked || importing || tooMany}>
            <Upload className="h-4 w-4" />
            {importing ? 'Importing…' : 'Import'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
