import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UtensilsCrossed } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { ErrorState, LoadingState } from '../ui/states';
import { ipc } from '../../lib/ipc';

/** Default service charge for dine-in bills; the till can override per sale. */
export function RestaurantSettingsCard(): JSX.Element {
  const queryClient = useQueryClient();
  const [pct, setPct] = useState('0');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const settingsQuery = useQuery({
    queryKey: ['restaurant-settings'],
    queryFn: async () => {
      const res = await ipc.restaurantSettings();
      if (!res.ok) throw new Error(res.error ?? 'Could not load restaurant settings');
      return res.settings ?? { serviceChargeBp: 0 };
    },
  });

  useEffect(() => {
    if (!settingsQuery.data || ready) return;
    const bp = settingsQuery.data.serviceChargeBp ?? 0;
    setPct((bp / 100).toFixed(2).replace(/\.?0+$/, ''));
    setReady(true);
  }, [settingsQuery.data, ready]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const value = Number(pct);
      if (!Number.isFinite(value) || value < 0 || value > 50) {
        throw new Error('Enter a service charge between 0 and 50%');
      }
      const res = await ipc.restaurantSettingsSet({
        serviceChargeBp: Math.round(value * 100),
      });
      if (!res.ok) throw new Error(res.error ?? 'Could not save the service charge');
    },
    onSuccess: async () => {
      setSaved(true);
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['restaurant-settings'] });
    },
    onError: (e: Error) => {
      setSaved(false);
      setError(e.message);
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UtensilsCrossed className="h-4 w-4" /> Restaurant service charge
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {settingsQuery.isPending ? <LoadingState label="Reading restaurant settings…" /> : null}
        {settingsQuery.isError ? (
          <ErrorState message={(settingsQuery.error as Error).message} />
        ) : null}
        {settingsQuery.data ? (
          <>
            <p className="text-slate-600 dark:text-slate-300">
              The Sell screen pre-fills this percentage on every restaurant bill. Waiters can change
              it per sale, and tips are added separately.
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-40">
                <Input
                  label="Service charge %"
                  name="service-charge-pct"
                  inputMode="decimal"
                  value={pct}
                  onChange={(e) => {
                    setSaved(false);
                    setPct(e.target.value.replace(/[^0-9.]/g, ''));
                  }}
                />
              </div>
              <Button disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                {saveMutation.isPending ? 'Saving…' : 'Save'}
              </Button>
              {saved ? <span className="text-sm text-emerald-600">Saved</span> : null}
            </div>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
