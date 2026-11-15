import { create } from 'zustand';
import { ipc } from '../lib/ipc';
import type { SessionUser } from '../types/global';

interface SessionState {
  user: SessionUser | null;
  checked: boolean;
  refresh: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
  can: (permission: string) => boolean;
}

export const useSession = create<SessionState>((set, get) => ({
  user: null,
  checked: false,
  refresh: async () => {
    const { user } = await ipc.authMe();
    set({ user: user ?? null, checked: true });
  },
  signIn: async (email, password) => {
    const result = await ipc.authLogin({ email, password });
    if (result.ok && result.user) {
      set({ user: result.user, checked: true });
      return { ok: true };
    }
    return { ok: false, error: result.error ?? 'Sign in failed' };
  },
  signOut: async () => {
    await ipc.authLogout();
    set({ user: null });
  },
  can: (permission) => get().user?.permissions.includes(permission) ?? false,
}));
