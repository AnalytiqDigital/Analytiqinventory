import { zodResolver } from '@hookform/resolvers/zod';
import {
  NIGERIA_STATES,
  lgasForState,
  setupSchema,
  type SetupInput,
} from '@analytiq/validation';
import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { ErrorState } from '../components/ui/states';
import { ipc } from '../lib/ipc';
import { useSession } from '../stores/session';

const STEPS = [
  { key: 'business', label: 'Business', hint: 'Tell us about your shop' },
  { key: 'location', label: 'Location', hint: 'Where do you sell?' },
  { key: 'admin', label: 'Administrator', hint: 'Create your sign-in' },
] as const;

const BUSINESS_TYPES = [
  { value: 'retail', label: 'Retail', icon: '🏪', blurb: 'Shop & provisions' },
  { value: 'supermarket', label: 'Supermarket', icon: '🛒', blurb: 'Grocery & mart' },
  { value: 'restaurant', label: 'Restaurant', icon: '🍽️', blurb: 'Food & drinks' },
  { value: 'pharmacy', label: 'Pharmacy', icon: '💊', blurb: 'Drugs & care' },
  { value: 'wholesale', label: 'Wholesale', icon: '📦', blurb: 'Bulk & distribution' },
  { value: 'services', label: 'Services', icon: '💼', blurb: 'Salon, repair…' },
  { value: 'other', label: 'Other', icon: '✨', blurb: 'Something else' },
] as const;

const CURRENCIES = ['NGN', 'USD', 'EUR', 'GBP', 'GHS', 'KES', 'ZAR'] as const;

const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { id: string; label: string; error?: string }
>(function Select({ id, label, error, children, ...props }, ref): JSX.Element {
  return (
    <div className="w-full">
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
        {label}
      </label>
      <select
        ref={ref}
        id={id}
        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
        {...props}
      >
        {children}
      </select>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
});

export function SetupPage(): JSX.Element {
  const [step, setStep] = useState(0);
  const [serverError, setServerError] = useState<string | null>(null);
  const navigate = useNavigate();
  const refresh = useSession((s) => s.refresh);

  const form = useForm<SetupInput>({
    resolver: zodResolver(setupSchema),
    mode: 'onTouched',
    reValidateMode: 'onChange',
    defaultValues: {
      business: {
        name: '',
        type: 'retail',
        address: '',
        state: undefined as unknown as SetupInput['business']['state'],
        lga: '',
        phone: '',
        email: '',
        currency: 'NGN',
        taxLabel: 'VAT',
        taxRateBps: 750,
      },
      location: {
        name: 'Main Store',
        address: '',
        state: undefined as unknown as SetupInput['location']['state'],
        lga: '',
      },
      admin: { name: '', email: '', password: '' },
    },
  });

  const businessState = form.watch('business.state');
  const locationState = form.watch('location.state');
  const businessType = form.watch('business.type');
  const taxBps = form.watch('business.taxRateBps') ?? 750;

  const businessLgas = useMemo(() => (businessState ? lgasForState(businessState) : []), [businessState]);
  const locationLgas = useMemo(() => (locationState ? lgasForState(locationState) : []), [locationState]);

// Clear a stale LGA whenever its state changes so a value from another
// state can't get stuck in the form.
useEffect(() => {
  form.setValue('business.lga', '', { shouldValidate: false });
}, [businessState]);
useEffect(() => {
  form.setValue('location.lga', '', { shouldValidate: false });
}, [locationState]);

  const next = async (): Promise<void> => {
    const field = STEPS[step]?.key ?? 'business';
    const valid = await form.trigger(field as 'business' | 'location' | 'admin');
    if (valid) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    const result = await ipc.authSetup(values);
    if (!result.ok) {
      setServerError(result.error ?? 'Setup failed');
      return;
    }
    const login = await ipc.authLogin({ email: values.admin.email, password: values.admin.password });
    if (!login.ok) {
      navigate('/login', { replace: true });
      return;
    }
    await refresh();
    navigate('/', { replace: true });
  });

  const bizErr = form.formState.errors.business;
  const locErr = form.formState.errors.location;
  const admErr = form.formState.errors.admin;

  return (
    <div className="mx-auto w-full max-w-2xl p-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-xl text-white">
              📊
            </span>
            <div>
              <CardTitle>Welcome — set up your business</CardTitle>
              <p className="text-xs text-slate-500">{STEPS[step]?.hint}</p>
            </div>
          </div>
          {/* Progress bar */}
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-600 transition-all duration-300"
              style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
            />
          </div>
          <ol className="mt-2 flex gap-2 text-xs" aria-label="Setup progress">
            {STEPS.map((s, i) => (
              <li
                key={s.key}
                className={`rounded-full px-3 py-1 ${
                  i === step
                    ? 'bg-brand-600 text-white shadow-sm dark:bg-brand-500'
                    : i < step
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'
                      : 'bg-slate-100 text-slate-500 dark:bg-slate-800'
                }`}
              >
                {i < step ? '✓ ' : `${i + 1}. `}
                {s.label}
              </li>
            ))}
          </ol>
        </CardHeader>
        <CardContent>
          {serverError ? <ErrorState message={serverError} /> : null}
          <form onSubmit={onSubmit} className="mt-4 space-y-4">
            {step === 0 ? (
              <>
                <Input label="Business name" placeholder="e.g. Apex Empire Stores" {...form.register('business.name')} error={bizErr?.name?.message} />
                <div>
                  <p className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">What kind of business is it?</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {BUSINESS_TYPES.map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => form.setValue('business.type', t.value, { shouldValidate: true })}
                        className={`rounded-xl border p-2 text-left transition ${
                          businessType === t.value
                            ? 'border-brand-600 bg-brand-600 text-white shadow-sm dark:border-brand-500 dark:bg-brand-500'
                            : 'border-slate-200 hover:border-slate-400 dark:border-slate-700'
                        }`}
                      >
                        <span className="text-lg">{t.icon}</span>
                        <span className="block text-xs font-semibold">{t.label}</span>
                        <span className={`block truncate text-[10px] ${businessType === t.value ? 'opacity-70' : 'text-slate-500'}`}>
                          {t.blurb}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Select id="biz-state" label="State" {...form.register('business.state')} error={bizErr?.state?.message}>
                    <option value="">— Select state —</option>
                    {NIGERIA_STATES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </Select>
                  <Select
                    id="biz-lga"
                    label="Local Government Area"
                    disabled={!businessState}
                    {...form.register('business.lga')}
                    error={bizErr?.lga?.message}
                  >
                    <option value="">{businessState ? '— Select LGA —' : '— Pick a state first —'}</option>
                    {businessLgas.map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </Select>
                </div>
                <Input label="Street address" placeholder="Shop 12, Market Road…" {...form.register('business.address')} error={bizErr?.address?.message} />
                <div className="grid grid-cols-2 gap-4">
                  <Input label="Phone" placeholder="+234…" {...form.register('business.phone')} error={bizErr?.phone?.message} />
                  <Input label="Email" type="email" placeholder="you@business.ng" {...form.register('business.email')} error={bizErr?.email?.message} />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <Select id="biz-currency" label="Currency" {...form.register('business.currency')} error={bizErr?.currency?.message}>
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </Select>
                  <Input label="Tax label" placeholder="VAT" {...form.register('business.taxLabel')} error={bizErr?.taxLabel?.message} />
                  <div className="w-full">
                    <label htmlFor="biz-tax" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                      Tax rate <span className="text-slate-400">({((taxBps ?? 0) / 100).toFixed(2)}%)</span>
                    </label>
                    <div className="flex h-10 items-center gap-2">
                      <input
                        id="biz-tax"
                        type="range"
                        min={0}
                        max={2000}
                        step={25}
                        value={taxBps}
                        onChange={(e) => form.setValue('business.taxRateBps', Number(e.target.value), { shouldValidate: true })}
                        className="w-full accent-brand-600"
                      />
                    </div>
                    {bizErr?.taxRateBps?.message ? <p className="mt-1 text-xs text-red-600">{bizErr.taxRateBps.message}</p> : null}
                  </div>
                </div>
              </>
            ) : null}
            {step === 1 ? (
              <>
                <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  🏬 Your <strong>default location</strong> is where stock lives and sales happen. You can add more branches later.
                </div>
                <Input label="Location name" placeholder="e.g. Main Store, Abuja Branch" {...form.register('location.name')} error={locErr?.name?.message} />
                <div className="grid grid-cols-2 gap-4">
                  <Select id="loc-state" label="State" {...form.register('location.state')} error={locErr?.state?.message}>
                    <option value="">— Select state —</option>
                    {NIGERIA_STATES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </Select>
                  <Select
                    id="loc-lga"
                    label="Local Government Area"
                    disabled={!locationState}
                    {...form.register('location.lga')}
                    error={locErr?.lga?.message}
                  >
                    <option value="">{locationState ? '— Select LGA —' : '— Pick a state first —'}</option>
                    {locationLgas.map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </Select>
                </div>
                <Input label="Street address" placeholder="Shop address…" {...form.register('location.address')} error={locErr?.address?.message} />
                <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    defaultChecked
                    onChange={(e) => {
                      if (e.target.checked && businessState) {
                        form.setValue('location.state', businessState, { shouldValidate: true });
                        form.setValue('location.lga', '', { shouldValidate: true });
                      }
                    }}
                    className="h-4 w-4 accent-brand-600"
                  />
                  Same state as my business
                </label>
              </>
            ) : null}
            {step === 2 ? (
              <>
                <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  🔐 This account has full access. You can add cashiers and managers later from Staff.
                </div>
                <Input label="Your full name" placeholder="e.g. Adaeze Okafor" {...form.register('admin.name')} error={admErr?.name?.message} />
                <Input label="Email (used to sign in)" type="email" placeholder="you@example.ng" {...form.register('admin.email')} error={admErr?.email?.message} />
                <Input label="Password (min 8 chars, letters + numbers)" type="password" {...form.register('admin.password')} error={admErr?.password?.message} />
              </>
            ) : null}
            <div className="flex justify-between pt-2">
              <Button type="button" variant="secondary" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
                ← Back
              </Button>
              {step < STEPS.length - 1 ? (
                <Button type="button" onClick={next}>
                  Continue →
                </Button>
              ) : (
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? 'Setting up…' : '🎉 Complete setup'}
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
