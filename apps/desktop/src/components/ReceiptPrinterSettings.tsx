import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Printer, RefreshCw, ScanBarcode } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { ipc } from '../lib/ipc';
import { printSale } from '../lib/printing';
import { sampleTestSale, type ReceiptWidthMm } from '../lib/receipt';
import { usePrinter } from '../stores/printer';

const WIDTHS: ReceiptWidthMm[] = [58, 76, 80];

export function ReceiptPrinterSettings(): JSX.Element {
  const printerName = usePrinter((s) => s.printerName);
  const paperWidthMm = usePrinter((s) => s.paperWidthMm);
  const autoPrint = usePrinter((s) => s.autoPrint);
  const copies = usePrinter((s) => s.copies);
  const setPrinterName = usePrinter((s) => s.setPrinterName);
  const setPaperWidth = usePrinter((s) => s.setPaperWidth);
  const setAutoPrint = usePrinter((s) => s.setAutoPrint);
  const setCopies = usePrinter((s) => s.setCopies);

  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const printersQuery = useQuery({
    queryKey: ['printers'],
    queryFn: async () => {
      const res = await ipc.printerList();
      return res;
    },
    staleTime: 30_000,
  });

  const businessQuery = useQuery({
    queryKey: ['business-profile'],
    queryFn: async () => {
      const res = await ipc.businessProfile();
      return res.ok ? (res.business ?? null) : null;
    },
  });

  async function testPrint(): Promise<void> {
    setTesting(true);
    setResult(null);
    const outcome = await printSale(
      sampleTestSale(businessQuery.data ?? null),
      businessQuery.data ?? null
    );
    setTesting(false);
    setResult(
      outcome.ok
        ? outcome.usedFallback
          ? 'Test receipt opened in the system print dialog.'
          : 'Test receipt sent to the printer.'
        : (outcome.error ?? 'Could not print the test receipt')
    );
  }

  const printers = printersQuery.data?.printers ?? [];
  const listUnavailable = printersQuery.data && !printersQuery.data.ok;

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>Receipt printer</CardTitle>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void printersQuery.refetch()}
          disabled={printersQuery.isFetching}
        >
          <RefreshCw className="h-4 w-4" />
          Find printers
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-slate-600 dark:text-slate-300">
          Works with Xprinter XP-58/XP-80 and any printer installed in Windows. Receipts print
          silently from the till that made the sale, including tills connected to a LAN server.
        </p>

        {listUnavailable ? (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
            The printer list is only available in the desktop app.
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Printer
            <select
              className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal normal-case tracking-normal text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              value={printerName}
              onChange={(event) => setPrinterName(event.target.value)}
            >
              <option value="">Windows default printer</option>
              {printers.map((printer) => (
                <option key={printer.name} value={printer.name}>
                  {printer.displayName || printer.name}
                  {printer.isDefault ? ' (default)' : ''}
                </option>
              ))}
              {printerName && !printers.some((p) => p.name === printerName) ? (
                <option value={printerName}>{printerName} (not detected now)</option>
              ) : null}
            </select>
          </label>

          <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Copies per receipt
            <Input
              className="mt-1"
              type="number"
              min={1}
              max={3}
              value={copies}
              onChange={(event) => setCopies(Number(event.target.value) || 1)}
            />
          </label>
        </div>

        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Paper width
          </p>
          <div className="flex flex-wrap gap-2">
            {WIDTHS.map((width) => (
              <Button
                key={width}
                size="sm"
                variant={paperWidthMm === width ? 'primary' : 'secondary'}
                onClick={() => setPaperWidth(width)}
              >
                {width} mm
              </Button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-200">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300"
            checked={autoPrint}
            onChange={(event) => setAutoPrint(event.target.checked)}
          />
          Print the receipt automatically after each sale
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => void testPrint()} disabled={testing}>
            <Printer className="h-4 w-4" />
            {testing ? 'Printing…' : 'Test print'}
          </Button>
          {result ? <span className="text-slate-600 dark:text-slate-300">{result}</span> : null}
        </div>

        <div className="flex items-start gap-2 rounded-xl bg-slate-50 px-4 py-3 text-slate-600 dark:bg-slate-900/60 dark:text-slate-300">
          <ScanBarcode className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Barcode scanners need no setup: point the gun at a barcode on the Sell screen or scan
            into the product search. Exact barcode and SKU matches are added to the cart
            automatically.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
