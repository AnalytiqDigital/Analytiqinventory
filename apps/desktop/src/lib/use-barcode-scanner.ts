// Keyboard-wedge barcode scanners (Xprinter and most USB/Bluetooth guns) type
// the barcode as very fast keystrokes and finish with Enter. This hook turns
// that burst into a single scan callback while ignoring normal typing.

import { useEffect, useRef } from 'react';

export interface ScanBufferOptions {
  minLength?: number;
  /** Max delay between two keystrokes of the same scan, in ms. */
  maxGapMs?: number;
}

export class ScanBuffer {
  private chars = '';
  private lastAt = 0;
  private readonly minLength: number;
  private readonly maxGapMs: number;

  constructor(options: ScanBufferOptions = {}) {
    this.minLength = options.minLength ?? 4;
    this.maxGapMs = options.maxGapMs ?? 80;
  }

  /** Feed one key; returns the barcode when Enter completes a valid scan. */
  push(key: string, at: number): string | null {
    if (key === 'Enter') {
      const gap = at - this.lastAt;
      const code = this.chars.trim();
      this.reset();
      if (code.length >= this.minLength && gap <= this.maxGapMs) return code;
      return null;
    }
    if (this.chars && at - this.lastAt > this.maxGapMs) this.chars = '';
    this.chars += key;
    this.lastAt = at;
    return null;
  }

  reset(): void {
    this.chars = '';
    this.lastAt = 0;
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export function useBarcodeScanner(onScan: (code: string) => void, enabled = true): void {
  const callback = useRef(onScan);
  callback.current = onScan;

  useEffect(() => {
    if (!enabled) return;
    const buffer = new ScanBuffer();
    function onKeyDown(event: KeyboardEvent): void {
      if (event.ctrlKey || event.metaKey || event.altKey) {
        buffer.reset();
        return;
      }
      if (event.key === 'Enter') {
        const code = buffer.push('Enter', event.timeStamp);
        if (code) {
          event.preventDefault();
          callback.current(code);
        }
        return;
      }
      if (event.key.length !== 1) {
        buffer.reset();
        return;
      }
      // While the user types in a form field, leave the buffer alone; the
      // scanner code path is handled by the focused field's own Enter handler.
      if (isTypingTarget(event.target)) {
        buffer.reset();
        return;
      }
      buffer.push(event.key, event.timeStamp);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
