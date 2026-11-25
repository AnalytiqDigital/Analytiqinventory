// Thermal receipt printing (Xprinter XP-58 / XP-80 and any Windows driver).
//
// The renderer builds the receipt HTML (see src/lib/receipt.ts); this module
// prints it through a hidden BrowserWindow with the OS driver, silently, at the
// configured roll width. It never touches the network and works identically in
// primary and LAN client mode — each till prints on its own printer.

import { BrowserWindow, dialog, ipcMain } from 'electron';
import log from 'electron-log';
import { writeFile } from 'node:fs/promises';

const MICRONS_PER_MM = 1000;
const ALLOWED_WIDTHS_MM = new Set([58, 76, 80]);
const MAX_HTML_LENGTH = 500_000;
const MAX_COPIES = 5;

interface PrintRequest {
  html: string;
  printerName?: string;
  paperWidthMm?: number;
  copies?: number;
}

interface PrintResult {
  ok: boolean;
  error?: string;
  code?: string;
}

interface SavePdfRequest extends PrintRequest {
  /** Suggested file name, e.g. "receipt-RCP-000123". */
  fileName?: string;
}

interface SavePdfResult extends PrintResult {
  canceled?: boolean;
  path?: string;
}

function fail(error: string, code: string): PrintResult {
  return { ok: false, error, code };
}

function parseRequest(raw: unknown): PrintRequest {
  if (!raw || typeof raw !== 'object') throw new Error('Print request is invalid');
  const input = raw as Record<string, unknown>;
  if (typeof input.html !== 'string' || input.html.trim().length === 0) {
    throw new Error('Nothing to print');
  }
  if (input.html.length > MAX_HTML_LENGTH) throw new Error('Receipt is too large to print');
  const width = typeof input.paperWidthMm === 'number' ? input.paperWidthMm : 80;
  const copies = typeof input.copies === 'number' ? input.copies : 1;
  return {
    html: input.html,
    printerName: typeof input.printerName === 'string' ? input.printerName.trim() : '',
    paperWidthMm: ALLOWED_WIDTHS_MM.has(width) ? width : 80,
    copies: Math.min(Math.max(Math.round(copies), 1), MAX_COPIES),
  };
}

function printOnce(
  win: BrowserWindow,
  options: Electron.WebContentsPrintOptions
): Promise<{ success: boolean; failureReason?: string }> {
  return new Promise((resolve) => {
    win.webContents.print(options, (success, failureReason) => {
      resolve({ success, failureReason });
    });
  });
}

async function printReceiptHtml(request: PrintRequest): Promise<PrintResult> {
  const widthMicrons = (request.paperWidthMm ?? 80) * MICRONS_PER_MM;
  const win = new BrowserWindow({
    show: false,
    width: 480,
    height: 960,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(request.html)}`);
    const deviceName = request.printerName || undefined;
    const base: Electron.WebContentsPrintOptions = {
      silent: true,
      printBackground: true,
      deviceName,
      copies: request.copies ?? 1,
      margins: { marginType: 'none' },
    };
    // Driver-specific page sizes: Xprinter drivers accept a custom 58/76/80 mm
    // width. If the driver refuses it, retry once with its default paper so a
    // sale is never blocked by a size negotiation.
    const sized = await printOnce(win, {
      ...base,
      pageSize: { width: widthMicrons, height: 297 * MICRONS_PER_MM },
    });
    if (sized.success) return { ok: true };
    log.warn(
      `Receipt print failed (${sized.failureReason ?? 'unknown'}); retrying with default page size`
    );
    const plain = await printOnce(win, base);
    if (plain.success) return { ok: true };
    return fail(
      plain.failureReason || sized.failureReason || 'The printer rejected the job',
      'PRINT_FAILED'
    );
  } catch (err: unknown) {
    return fail(err instanceof Error ? err.message : String(err), 'PRINT_FAILED');
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

/** Safe default name for the save dialog, stripped of path-hostile characters. */
function pdfFileName(raw: string | undefined, fallback: string): string {
  const base = (raw ?? '').trim() || fallback;
  const safe = base.replace(/[\\/:*?"<>|]+/g, '-').slice(0, 120);
  return safe.toLowerCase().endsWith('.pdf') ? safe : `${safe}.pdf`;
}

// Saving is only ever done when the operator asks for it: the receipt is
// rendered to PDF and the save dialog is shown once. Cancelling it is a
// success — nothing is written and no error is raised.
async function saveReceiptPdf(request: SavePdfRequest): Promise<SavePdfResult> {
  const widthMicrons = (request.paperWidthMm ?? 80) * MICRONS_PER_MM;
  const win = new BrowserWindow({
    show: false,
    width: 480,
    height: 960,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(request.html)}`);
    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: { width: widthMicrons, height: 297 * MICRONS_PER_MM },
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    });
    const parent = BrowserWindow.getFocusedWindow() ?? undefined;
    const options: Electron.SaveDialogOptions = {
      title: 'Save receipt',
      defaultPath: pdfFileName(request.fileName, 'receipt'),
      filters: [{ name: 'PDF document', extensions: ['pdf'] }],
    };
    const picked = parent
      ? await dialog.showSaveDialog(parent, options)
      : await dialog.showSaveDialog(options);
    if (picked.canceled || !picked.filePath) return { ok: true, canceled: true };
    await writeFile(picked.filePath, pdf);
    return { ok: true, path: picked.filePath };
  } catch (err: unknown) {
    return fail(err instanceof Error ? err.message : String(err), 'PDF_SAVE_FAILED');
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

export function registerPrinterHandlers(): void {
  ipcMain.handle('printer:list', async () => {
    try {
      const win = BrowserWindow.getAllWindows()[0] ?? BrowserWindow.getAllWindows()[1];
      if (!win) return { ok: true, printers: [] };
      const printers = await win.webContents.getPrintersAsync();
      return {
        ok: true,
        printers: printers.map((p) => ({
          name: p.name,
          displayName: p.displayName,
          isDefault: p.isDefault,
          status: p.status,
        })),
      };
    } catch (err: unknown) {
      return {
        ...fail(err instanceof Error ? err.message : String(err), 'PRINTER_LIST_FAILED'),
        printers: [],
      };
    }
  });

  ipcMain.handle('printer:print', async (_event, raw: unknown) => {
    const started = Date.now();
    try {
      const result = await printReceiptHtml(parseRequest(raw));
      log.info(`Receipt print ${result.ok ? 'ok' : 'failed'} in ${Date.now() - started}ms`);
      return result;
    } catch (err: unknown) {
      return fail(err instanceof Error ? err.message : String(err), 'INVALID_PRINT_REQUEST');
    }
  });

  ipcMain.handle('printer:save-pdf', async (_event, raw: unknown) => {
    try {
      const input = raw as Record<string, unknown>;
      const parsed = parseRequest(raw);
      const fileName = typeof input.fileName === 'string' ? input.fileName : undefined;
      const result = await saveReceiptPdf({ ...parsed, fileName });
      log.info(
        result.canceled
          ? 'Receipt PDF save cancelled'
          : `Receipt PDF ${result.ok ? `saved to ${result.path}` : `failed: ${result.error}`}`
      );
      return result;
    } catch (err: unknown) {
      return fail(err instanceof Error ? err.message : String(err), 'INVALID_PDF_REQUEST');
    }
  });
}
