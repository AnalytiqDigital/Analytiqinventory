import { create } from 'zustand';
import type { ReceiptWidthMm } from '../lib/receipt';

interface PrinterState {
  /** Empty string = the Windows default printer. */
  printerName: string;
  paperWidthMm: ReceiptWidthMm;
  autoPrint: boolean;
  copies: number;
  setPrinterName: (name: string) => void;
  setPaperWidth: (width: ReceiptWidthMm) => void;
  setAutoPrint: (enabled: boolean) => void;
  setCopies: (copies: number) => void;
}

const STORAGE_KEY = 'analytiq-printer';

interface Persisted {
  printerName: string;
  paperWidthMm: ReceiptWidthMm;
  autoPrint: boolean;
  copies: number;
}

function load(): Persisted {
  const fallback: Persisted = { printerName: '', paperWidthMm: 80, autoPrint: true, copies: 1 };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    const width = parsed.paperWidthMm === 58 ? 58 : parsed.paperWidthMm === 76 ? 76 : 80;
    return {
      printerName: typeof parsed.printerName === 'string' ? parsed.printerName : '',
      paperWidthMm: width,
      autoPrint: parsed.autoPrint !== false,
      copies: Math.min(Math.max(Math.round(parsed.copies ?? 1), 1), 3),
    };
  } catch {
    return fallback;
  }
}

function save(state: Persisted): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota/private-mode errors: settings simply reset next launch
  }
}

const initial = load();

export const usePrinter = create<PrinterState>((set, get) => {
  const persist = (): void => {
    const { printerName, paperWidthMm, autoPrint, copies } = get();
    save({ printerName, paperWidthMm, autoPrint, copies });
  };
  return {
    ...initial,
    setPrinterName: (printerName) => {
      set({ printerName });
      persist();
    },
    setPaperWidth: (paperWidthMm) => {
      set({ paperWidthMm });
      persist();
    },
    setAutoPrint: (autoPrint) => {
      set({ autoPrint });
      persist();
    },
    setCopies: (value) => {
      set({ copies: Math.min(Math.max(Math.round(value), 1), 3) });
      persist();
    },
  };
});
