import { create } from 'zustand';

export interface NotificationItem {
  id: string;
  title: string;
  body?: string;
  kind: 'info' | 'success' | 'warning' | 'error';
  createdAt: number;
  read: boolean;
}

interface NotificationState {
  items: NotificationItem[];
  push: (n: Omit<NotificationItem, 'id' | 'createdAt' | 'read'>) => void;
  markAllRead: () => void;
  clear: () => void;
}

let seq = 0;

export const useNotifications = create<NotificationState>((set) => ({
  items: [],
  push: (n) =>
    set((s) => ({
      items: [
        {
          ...n,
          id: `${Date.now()}-${(seq += 1)}`,
          createdAt: Date.now(),
          read: false,
        },
        ...s.items,
      ].slice(0, 50),
    })),
  markAllRead: () => set((s) => ({ items: s.items.map((i) => ({ ...i, read: true })) })),
  clear: () => set({ items: [] }),
}));
