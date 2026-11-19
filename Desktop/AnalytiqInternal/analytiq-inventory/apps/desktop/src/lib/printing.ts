import { ipc } from './ipc';
import { buildReceiptHtml } from './receipt';
import { usePrinter } from '../stores/printer';
import type { BusinessProfile, SaleDetail } from '../types/global';

export interface PrintOutcome {
  ok: boolean;
  error?: string;
  /** True when the silent print path was unavailable and the system dialog opened instead. */
  usedFallback?: boolean;
}

function openPrintWindow(html: string, title: string): boolean {
  const win = window.open('', '_blank', 'width=380,height=640');
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  win.document.title = `Receipt ${title}`;
  win.focus();
  win.print();
  return true;
}

/** Print a sale on the configured thermal printer, falling back to the OS dialog. */
export async function printSale(
  sale: SaleDetail,
  business: BusinessProfile | null
): Promise<PrintOutcome> {
  const { printerName, paperWidthMm, copies } = usePrinter.getState();
  const html = buildReceiptHtml(sale, business, { widthMm: paperWidthMm });

  if (typeof window !== 'undefined' && window.analytiq) {
    const result = await ipc.printerPrint({
      html,
      printerName: printerName || undefined,
      paperWidthMm,
      copies,
    });
    if (result.ok) return { ok: true };
    // A driver failure should not lose the receipt: offer the OS dialog.
    if (openPrintWindow(html, sale.receiptNo)) return { ok: true, usedFallback: true };
    return { ok: false, error: result.error ?? 'The printer rejected the job' };
  }

  if (openPrintWindow(html, sale.receiptNo)) return { ok: true, usedFallback: true };
  return { ok: false, error: 'Printing is unavailable in this window' };
}
