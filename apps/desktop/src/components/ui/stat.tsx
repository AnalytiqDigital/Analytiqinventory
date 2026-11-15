import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Card, CardContent } from './card';

const TONES = {
 brand: 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300',
 emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
 amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
 sky: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
 violet: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
} as const;

export type StatTone = keyof typeof TONES;

export function Stat({
 icon: Icon,
 label,
 value,
 sub,
 tone = 'brand',
 onClick,
}: {
 icon: LucideIcon;
 label: string;
 value: string;
 sub?: string;
 tone?: StatTone;
 onClick?: () => void;
}): JSX.Element {
 return (
 <Card
 onClick={onClick}
 className={cn(
 'shadow-card transition-transform hover:-translate-y-0.5',
 onClick && 'cursor-pointer hover:shadow-pop',
 )}
 >
 <CardContent className="flex items-start gap-3">
 <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', TONES[tone])}>
 <Icon className="h-5 w-5" aria-hidden />
 </span>
 <span className="min-w-0">
 <span className="block truncate text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
 <span className="block truncate text-xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-white">
 {value}
 </span>
 {sub ? <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{sub}</span> : null}
 </span>
 </CardContent>
 </Card>
 );
}
