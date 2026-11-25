import { ipc } from './ipc';
import { buildKitchenTicketHtml, buildReceiptHtml } from './receipt';
import { usePrinter } from '../stores/printer';
import type { BusinessProfile, SaleDetail } from '../types/global';

export interface PrintOutcome {
  ok: boolean;
  error?: string;
  /** True when printing was unavailable and the receipt PDF was offered instead. */
  usedFallback?: boolean;
  /** Set for saves: the operator dismissed the save dialog, so nothing was written. */
  canceled?: boolean;
  /** Where a saved PDF was written. */
  path?: string;
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

/**
 * Print a sale on the configured thermal printer.
 *
 * Only ever prints silently: if the driver rejects the job we return the error
 * so the operator can choose Save PDF or fix the printer. We deliberately do
 * not pop the OS print dialog here — on a machine with no real printer that
 * dialog defaults to "Save as PDF" and blocks (or re-prompts) after a sale.
 */
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
    return {
      ok: false,
      error: `${result.error ?? 'The printer rejected the job'} — use Save PDF instead.`,
    };
  }

  if (openPrintWindow(html, sale.receiptNo)) return { ok: true, usedFallback: true };
  return { ok: false, error: 'Printing is unavailable in this window' };
}

/**
 * Save the receipt as a PDF. Saving is always the operator's choice: the save
 * dialog appears once, and dismissing it is a normal outcome, not an error.
 */
export async function saveSalePdf(
  sale: SaleDetail,
  business: BusinessProfile | null
): Promise<PrintOutcome> {
  const { paperWidthMm } = usePrinter.getState();
  const html = buildReceiptHtml(sale, business, { widthMm: paperWidthMm });

  if (typeof window !== 'undefined' && window.analytiq) {
    const result = await ipc.printerSavePdf({
      html,
      paperWidthMm,
      fileName: `receipt-${sale.receiptNo}.pdf`,
    });
    if (result.ok) return { ok: true, canceled: result.canceled, path: result.path };
    return { ok: false, error: result.error ?? 'Could not save the receipt PDF' };
  }

  if (openPrintWindow(html, sale.receiptNo)) return { ok: true, usedFallback: true };
  return { ok: false, error: 'Saving is unavailable in this window' };
}

/** Print the kitchen copy, on the kitchen printer when one is configured. */
export async function printKitchenTicket(sale: SaleDetail): Promise<PrintOutcome> {
  const { kitchenPrinterName, printerName, paperWidthMm } = usePrinter.getState();
  const html = buildKitchenTicketHtml(sale, { widthMm: paperWidthMm });

  if (typeof window !== 'undefined' && window.analytiq) {
    const result = await ipc.printerPrint({
      html,
      printerName: kitchenPrinterName || printerName || undefined,
      paperWidthMm,
      copies: 1,
    });
    if (result.ok) return { ok: true };
    return { ok: false, error: result.error ?? 'The kitchen printer rejected the job' };
  }

  if (openPrintWindow(html, `${sale.receiptNo} (kitchen)`))
    return { ok: true, usedFallback: true };
  return { ok: false, error: 'Printing is unavailable in this window' };
}
