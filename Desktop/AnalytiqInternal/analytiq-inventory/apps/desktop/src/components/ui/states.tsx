import { AlertTriangle, Inbox, type LucideIcon } from 'lucide-react';
import { Button } from './button';

export function LoadingState({ label = 'Loading…' }: { label?: string }): JSX.Element {
 return (
 <div className="flex items-center justify-center gap-3 py-10 text-sm text-slate-500" role="status">
 <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
 {label}
 </div>
 );
}

function StateShell({
 icon: Icon,
 tone,
 title,
 hint,
 children,
}: {
 icon: LucideIcon;
 tone: string;
 title: string;
 hint?: string;
 children?: React.ReactNode;
}): JSX.Element {
 return (
 <div className="flex animate-fade-in flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-12 text-center dark:border-slate-700 dark:bg-slate-900/60">
 <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tone}`}>
 <Icon className="h-6 w-6" aria-hidden />
 </span>
 <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</p>
 {hint ? <p className="max-w-sm text-xs text-slate-500 dark:text-slate-400">{hint}</p> : null}
 {children}
 </div>
 );
}

export function EmptyState({
 title,
 hint,
 actionLabel,
 onAction,
}: {
 title: string;
 hint?: string;
 actionLabel?: string;
 onAction?: () => void;
}): JSX.Element {
 return (
 <StateShell icon={Inbox} tone="bg-brand-100 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300" title={title} hint={hint}>
 {actionLabel && onAction ? (
 <Button variant="secondary" size="sm" className="mt-2" onClick={onAction}>
 {actionLabel}
 </Button>
 ) : null}
 </StateShell>
 );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }): JSX.Element {
 return (
 <div
 className="flex animate-fade-in flex-col items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-6 py-10 text-center dark:border-red-900 dark:bg-red-950/40"
 role="alert"
 >
 <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-300">
 <AlertTriangle className="h-6 w-6" aria-hidden />
 </span>
 <p className="text-sm font-medium text-red-700 dark:text-red-300">{message}</p>
 {onRetry ? (
 <Button variant="secondary" size="sm" className="mt-1" onClick={onRetry}>
 Try again
 </Button>
 ) : null}
 </div>
 );
}

export function ConfirmDialog({
 open,
 title,
 message,
 confirmLabel = 'Confirm',
 onConfirm,
 onCancel,
}: {
 open: boolean;
 title: string;
 message: string;
 confirmLabel?: string;
 onConfirm: () => void;
 onCancel: () => void;
}): JSX.Element | null {
 if (!open) return null;
 return (
 <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]" role="alertdialog" aria-modal="true" aria-label={title}>
 <div className="w-full max-w-sm animate-scale-in rounded-2xl bg-white p-6 shadow-pop dark:bg-slate-900">
 <h2 className="text-base font-bold text-slate-900 dark:text-white">{title}</h2>
 <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{message}</p>
 <div className="mt-5 flex justify-end gap-2">
 <Button variant="secondary" onClick={onCancel}>
 Cancel
 </Button>
 <Button variant="danger" onClick={onConfirm}>
 {confirmLabel}
 </Button>
 </div>
 </div>
 </div>
 );
}
