import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Printer, Tag } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/states';
import { TD, TH, THead, TRow, Table } from '../components/ui/table';
import { ipc } from '../lib/ipc';
import { ean13Modules } from '../lib/ean13';
import { formatKobo } from '../lib/money';
import type { BusinessProfile, ProductRow } from '../types/global';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Inline SVG: 95 modules of EAN-13, or empty when the code is not EAN-13. */
export function barcodeSvg(code: string): string {
  const modules = ean13Modules(code);
  if (!modules) return '';
  let bars = '';
  for (let i = 0; i < modules.length; i += 1) {
    if (modules[i] === '1') {
      bars += `<rect x="${i}" y="0" width="1" height="40" />`;
    }
  }
  return `<svg viewBox="0 0 95 40" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" fill="#000">${bars}</svg>`;
}

export function labelHtml(product: ProductRow, businessName: string, currency: string): string {
  const svg = barcodeSvg(product.barcode ?? '');
  const barcodeBlock = svg
    ? `<div class="barcode">${svg}</div><div class="code">${escapeHtml(product.barcode ?? '')}</div>`
    : product.barcode
      ? `<div class="code">${escapeHtml(product.barcode)}</div>`
      : '<div class="code">&nbsp;</div>';
  return `<div class="label">
    <div class="store">${escapeHtml(businessName)}</div>
    <div class="name">${escapeHtml(product.name)}</div>
    <div class="price">${escapeHtml(formatKobo(product.sellingPriceKobo, currency))}</div>
    ${barcodeBlock}
  </div>`;
}

export function labelsDocument(labelsHtml: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Product labels</title><style>
    @page { size: A4; margin: 8mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000; }
    .sheet { display: flex; flex-wrap: wrap; gap: 3mm; }
    .label { width: 50mm; height: 30mm; padding: 2mm; border: 1px dashed #cbd5e1; display: flex; flex-direction: column; overflow: hidden; }
    .store { font-size: 7.5pt; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .name { margin-top: 1mm; font-size: 8pt; line-height: 1.15; }
    .price { margin-top: auto; font-size: 11pt; font-weight: 800; }
    .barcode { margin-top: 1mm; height: 11mm; }
    .barcode svg { display: block; width: 100%; height: 100%; }
    .code { font-size: 6.5pt; letter-spacing: 1.5px; text-align: center; }
    @media print { .label { border-color: transparent; } }
  </style></head><body><div class="sheet">${labelsHtml}</div></body></html>`;
}

function printHtml(html: string): boolean {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc) {
    frame.remove();
    return false;
  }
  doc.open();
  doc.write(html);
  doc.close();
  window.setTimeout(() => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => frame.remove(), 2000);
  }, 250);
  return true;
}

export function PrintLabelsPage(): JSX.Element {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [onlyCoded, setOnlyCoded] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [copies, setCopies] = useState<Record<string, string>>({});
  const [defaultCopies, setDefaultCopies] = useState('1');
  const [printError, setPrintError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const productsQuery = useQuery({
    queryKey: ['products', 'labels', debounced],
    queryFn: async () => {
      const res = await ipc.products({ search: debounced, page: 1, pageSize: 500 });
      if (!res.ok) throw new Error(res.error ?? 'Could not load products');
      return res.items as ProductRow[];
    },
  });

  const profileQuery = useQuery({
    queryKey: ['business-profile'],
    queryFn: async () => {
      const res = await ipc.businessProfile();
      return res.ok ? ((res.business ?? null) as BusinessProfile | null) : null;
    },
  });

  const products = useMemo(() => {
    const items = productsQuery.data ?? [];
    return onlyCoded ? items.filter((p) => Boolean(p.barcode)) : items;
  }, [productsQuery.data, onlyCoded]);

  const chosen = useMemo(
    () =>
      products.filter(
        (product) => selected[product.id] && Number(copies[product.id] ?? defaultCopies) > 0
      ),
    [products, selected, copies, defaultCopies]
  );

  const totalLabels = chosen.reduce(
    (sum, product) => sum + Number(copies[product.id] ?? defaultCopies),
    0
  );

  function toggleAll(): void {
    if (chosen.length > 0 && products.every((p) => selected[p.id])) {
      setSelected({});
      return;
    }
    setSelected(Object.fromEntries(products.map((p) => [p.id, true])));
  }

  function printLabels(): void {
    setPrintError(null);
    if (chosen.length === 0) {
      setPrintError('Tick at least one product to print its label.');
      return;
    }
    const business = profileQuery.data;
    const labels: string[] = [];
    for (const product of chosen) {
      const count = Number(copies[product.id] ?? defaultCopies);
      for (let i = 0; i < count; i += 1) {
        labels.push(labelHtml(product, business?.name ?? 'AnalytIQ', business?.currency ?? 'NGN'));
      }
    }
    const opened = printHtml(labelsDocument(labels.join('')));
    if (!opened) setPrintError('This window cannot open the print preview. Use the desktop app.');
  }

  const allTicked = products.length > 0 && products.every((p) => selected[p.id]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Print Labels</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Shelf and product labels with price and EAN-13 barcode, laid out for A4 sticker sheets.
          </p>
        </div>
        <Button onClick={printLabels} disabled={chosen.length === 0}>
          <Printer className="h-4 w-4" />
          Print {totalLabels > 0 ? `${totalLabels} label${totalLabels === 1 ? '' : 's'}` : 'labels'}
        </Button>
      </div>

      {printError ? (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
          {printError}
        </div>
      ) : null}

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <Input
              label="Search products"
              placeholder="Name, SKU or barcode"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="w-40">
            <Input
              label="Copies per product"
              inputMode="numeric"
              value={defaultCopies}
              onChange={(event) =>
                setDefaultCopies(event.target.value.replace(/[^\d]/g, '') || '1')
              }
            />
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300"
              checked={onlyCoded}
              onChange={(event) => setOnlyCoded(event.target.checked)}
            />
            Only products with a barcode
          </label>
        </CardContent>
      </Card>

      {productsQuery.isLoading ? (
        <LoadingState label="Loading products…" />
      ) : productsQuery.isError ? (
        <ErrorState
          message={(productsQuery.error as Error).message}
          onRetry={() => void productsQuery.refetch()}
        />
      ) : products.length === 0 ? (
        <EmptyState
          title="No products to label"
          hint="Add products with a selling price, then print their labels here."
        />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto">
            <Table>
              <THead>
                <TRow>
                  <TH className="w-10">
                    <input
                      type="checkbox"
                      aria-label="Select all products"
                      className="h-4 w-4 rounded border-slate-300"
                      checked={allTicked}
                      onChange={toggleAll}
                    />
                  </TH>
                  <TH>Product</TH>
                  <TH>Barcode</TH>
                  <TH className="text-right">Price</TH>
                  <TH className="w-24">Copies</TH>
                </TRow>
              </THead>
              <tbody>
                {products.map((product) => (
                  <TRow key={product.id}>
                    <TD>
                      <input
                        type="checkbox"
                        aria-label={`Select ${product.name}`}
                        className="h-4 w-4 rounded border-slate-300"
                        checked={Boolean(selected[product.id])}
                        onChange={(event) =>
                          setSelected((current) => ({
                            ...current,
                            [product.id]: event.target.checked,
                          }))
                        }
                      />
                    </TD>
                    <TD>
                      <span className="font-medium">{product.name}</span>
                      {product.sku ? (
                        <span className="block text-xs text-slate-500">SKU {product.sku}</span>
                      ) : null}
                    </TD>
                    <TD className="font-mono text-xs text-slate-600 dark:text-slate-300">
                      {product.barcode ? (
                        <span className="inline-flex items-center gap-1">
                          <Tag className="h-3.5 w-3.5" aria-hidden />
                          {product.barcode}
                          {ean13Modules(product.barcode) ? null : (
                            <span className="text-amber-600">(not EAN-13)</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-slate-400">No barcode</span>
                      )}
                    </TD>
                    <TD className="text-right tabular-nums">
                      {formatKobo(product.sellingPriceKobo, profileQuery.data?.currency ?? 'NGN')}
                    </TD>
                    <TD>
                      <input
                        aria-label={`Copies for ${product.name}`}
                        inputMode="numeric"
                        className="h-9 w-16 rounded-lg border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                        value={copies[product.id] ?? defaultCopies}
                        onChange={(event) =>
                          setCopies((current) => ({
                            ...current,
                            [product.id]: event.target.value.replace(/[^\d]/g, '') || '0',
                          }))
                        }
                      />
                    </TD>
                  </TRow>
                ))}
              </tbody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
