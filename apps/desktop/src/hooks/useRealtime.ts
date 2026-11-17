import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ipc } from '../lib/ipc';

// LAN clients receive server pushes; the primary emits nothing, so this hook
// is a no-op there. Bursts (e.g. a sale + inventory event) collapse into one
// refetch pass so a busy register does not thrash every mounted query.
export function useRealtime(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    ipc.realtimeSubscribe(() => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        void queryClient.invalidateQueries({ refetchType: 'active' });
      }, 400);
    });
    return () => {
      if (timer) clearTimeout(timer);
      ipc.realtimeUnsubscribe();
    };
  }, [queryClient]);
}
