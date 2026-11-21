import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Building2,
  ClipboardCheck,
  DatabaseBackup,
  KeyRound,
  LifeBuoy,
  Printer,
  ScanBarcode,
  ShoppingCart,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { ipc } from '../lib/ipc';
import type { BackupRow, BusinessProfile, LicenseStatus, PrinterInfo } from '../types/global';

interface Diagnostics {
  version: string;
  business: BusinessProfile | null;
  license: LicenseStatus | null;
  printers: PrinterInfo[];
  backups: BackupRow[];
}

async function loadDiagnostics(): Promise<Diagnostics> {
  const [version, business, license, printers, backups] = await Promise.all([
    ipc.getVersion(),
    ipc.businessProfile(),
    ipc.licenseStatus(),
    ipc.printerList(),
    ipc.backups(),
  ]);
  return {
    version,
    business: business.business ?? null,
    license: license.status ?? null,
    printers: printers.printers ?? [],
    backups: backups.items ?? [],
  };
}

const STEPS = [
  {
    title: '1. Add your products',
    body: 'Go to Products → New product, or use Import CSV to add many at once. Barcodes are optional; SKUs must be unique.',
  },
  {
    title: '2. Load your opening stock',
    body: 'Enter opening stock when creating a product, or use Inventory → Adjust for stock you already have on the shelf.',
  },
  {
    title: '3. Set prices and tax',
    body: 'Prices are entered in naira. Set the VAT rate under Settings; every sale records tax separately for reports.',
  },
  {
    title: '4. Sell from the POS',
    body: 'Point of Sale → search or scan a product, take payment (cash, transfer, card, credit) and print or share the receipt.',
  },
  {
    title: '5. Back up daily',
    body: 'Settings → Backup lets you take a snapshot now and restore it later. Automatic snapshots run once a day while the app is open.',
  },
];

export function HelpPage(): JSX.Element {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const diagnosticsQuery = useQuery({ queryKey: ['diagnostics'], queryFn: loadDiagnostics });
  const diagnostics = diagnosticsQuery.data;

  async function copyDiagnostics(): Promise<void> {
    if (!diagnostics) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(diagnostics, null, 2));
      setCopied(true);
      setCopyError(null);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError('The clipboard is blocked. Select the text below and copy it manually.');
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Help &amp; Support</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Getting started, hardware tips and the details to send your support desk.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" /> Quick start
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3">
              {STEPS.map((step) => (
                <li key={step.title}>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {step.title}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{step.body}</p>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ScanBarcode className="h-4 w-4" /> Barcode scanner
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
              <p>
                Any USB or Bluetooth scanner that types like a keyboard works out of the box. Click
                the search box on the POS and scan; the product is added and the box is cleared for
                the next scan.
              </p>
              <p>
                If a scan does nothing, test the scanner in Notepad first — it should type the code
                followed by Enter. If it does, check that the product&apos;s barcode is exactly the
                same digits.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Printer className="h-4 w-4" /> Xprinter and receipt printers
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
              <p>
                Install the printer with its Windows driver, then choose it under Settings → Receipt
                printer. Pick 58 mm or 80 mm paper to match the roll in the machine.
              </p>
              <p>
                If receipts print blank, open Windows printer settings and print a test page first.
                Silent printing only works with installed Windows drivers; PDF &quot;printers&quot;
                are not supported.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DatabaseBackup className="h-4 w-4" /> Your data
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
            <p>
              Everything lives in one SQLite file on this computer. Copy backups to a USB drive or
              another computer regularly.
            </p>
            <p>
              Multi-till setups: one computer runs as the primary and the others connect through
              Settings → Branch sync. Reports on the primary see every till.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" /> Licence and support
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
            <p>
              Your licence key is entered once under Licence. Keep the key safe — you will need it
              if the app is reinstalled.
            </p>
            <p>
              WhatsApp support:{' '}
              <span className="font-medium">0803 917 1767</span> · Calls:{' '}
              <span className="font-medium">0812 431 4217</span>. Send a short description of the
              problem and attach the diagnostics below. Support hours: Monday–Saturday, 9:00–18:00
              WAT.
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                void ipc.openExternal(
                  'https://wa.me/2348039171767?text=Hi%20AnalytIQ%2C%20I%20need%20help%20with%20the%20app.'
                )
              }
            >
              <LifeBuoy className="h-4 w-4" /> Message support on WhatsApp
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LifeBuoy className="h-4 w-4" /> Diagnostics
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {diagnosticsQuery.isLoading ? (
            <p className="text-sm text-slate-500">Gathering app details…</p>
          ) : null}
          {diagnostics ? (
            <>
              <div className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
                <div>
                  <p className="text-xs text-slate-500">App version</p>
                  <p className="font-medium">{diagnostics.version}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Business</p>
                  <p className="font-medium">{diagnostics.business?.name ?? 'Not set up'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Licence</p>
                  <p className="font-medium">
                    {diagnostics.license ? (diagnostics.license.state ?? 'active') : 'Unavailable'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Printers found</p>
                  <p className="font-medium">{diagnostics.printers.length}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge>
                  <Building2 className="mr-1 h-3 w-3" />{' '}
                  {diagnostics.business?.currency?.toUpperCase() ?? 'NGN'}
                </Badge>
                <Badge>
                  <DatabaseBackup className="mr-1 h-3 w-3" /> {diagnostics.backups.length} backups
                </Badge>
                {diagnostics.printers.map((printer) => (
                  <Badge key={printer.name}>
                    <Printer className="mr-1 h-3 w-3" /> {printer.displayName}
                    {printer.isDefault ? ' (default)' : ''}
                  </Badge>
                ))}
              </div>
              <Button variant="secondary" size="sm" onClick={() => void copyDiagnostics()}>
                <ClipboardCheck className="h-4 w-4" /> {copied ? 'Copied' : 'Copy diagnostics'}
              </Button>
              {copyError ? <p className="text-xs text-red-600">{copyError}</p> : null}
              <pre className="max-h-56 overflow-auto rounded-xl bg-slate-100 p-3 text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {JSON.stringify(diagnostics, null, 2)}
              </pre>
            </>
          ) : null}
          {diagnosticsQuery.isError ? (
            <p className="text-sm text-red-600">{(diagnosticsQuery.error as Error).message}</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
