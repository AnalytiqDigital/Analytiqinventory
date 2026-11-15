import { Rocket } from 'lucide-react';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';

export function PlaceholderPage({ title, batch }: { title: string; batch: string }): JSX.Element {
 return (
 <div className="space-y-4">
 <div className="flex flex-wrap items-center justify-between gap-2">
 <div>
 <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
 <p className="mt-0.5 text-sm text-slate-500">Scheduled for a later batch</p>
 </div>
 <Badge className="border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
 {batch}
 </Badge>
 </div>
 <Card className="shadow-card">
 <CardContent>
 <div className="flex animate-fade-in flex-col items-center justify-center gap-2 px-6 py-14 text-center">
 <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-100 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300">
 <Rocket className="h-7 w-7" aria-hidden />
 </span>
 <p className="text-base font-bold text-slate-800 dark:text-slate-100">{title} is on the roadmap</p>
 <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">
 This screen arrives in {batch}. Your data model already reserves space for it — nothing you do now will need redoing.
 </p>
 </div>
 </CardContent>
 </Card>
 </div>
 );
}
