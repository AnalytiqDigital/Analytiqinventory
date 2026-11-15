import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark';

interface ThemeState {
  mode: ThemeMode;
  toggle: () => void;
  set: (mode: ThemeMode) => void;
}

function initialMode(): ThemeMode {
  try {
    const stored = localStorage.getItem('analytiq-theme');
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // ignore storage errors (e.g. privacy mode)
  }
  return 'light';
}

function applyMode(mode: ThemeMode): void {
  document.documentElement.classList.toggle('dark', mode === 'dark');
  try {
    localStorage.setItem('analytiq-theme', mode);
  } catch {
    // ignore storage errors
  }
}

applyMode(initialMode());

export const useTheme = create<ThemeState>((set) => ({
  mode: initialMode(),
  toggle: () =>
    set((s) => {
      const next: ThemeMode = s.mode === 'dark' ? 'light' : 'dark';
      applyMode(next);
      return { mode: next };
    }),
  set: (mode) => {
    applyMode(mode);
    set({ mode });
  },
}));
