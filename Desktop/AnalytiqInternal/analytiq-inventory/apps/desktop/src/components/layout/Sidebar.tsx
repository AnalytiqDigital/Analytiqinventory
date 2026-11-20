import { NavLink } from 'react-router-dom';
import { WifiOff } from 'lucide-react';
import { useSession } from '../../stores/session';
import { cn } from '../../lib/cn';
import { NAV_SECTIONS, visibleNavItems } from './nav';

export function Sidebar(): JSX.Element {
 const can = useSession((s) => s.can);
 const businessType = useSession((s) => s.user?.businessType);
 const modules = useSession((s) => s.user?.modules);
 const visible = visibleNavItems(businessType, can, modules);

 return (
 <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 md:flex">
 <div className="flex items-center gap-2.5 px-5 py-5">
 <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-base font-black text-white shadow-sm">
 A
 </div>
 <div className="min-w-0">
 <p className="truncate text-[15px] font-bold tracking-tight text-slate-900 dark:text-white">
 AnalytIQ
 </p>
 <p className="text-[11px] font-medium text-slate-500">Inventory &amp; POS</p>
 </div>
 </div>
 <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-4" aria-label="Primary">
 {NAV_SECTIONS.map((section) => {
 const items = visible.filter((i) => i.section === section);
 if (items.length === 0) return null;
 return (
 <div key={section}>
 <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
 {section}
 </p>
 <div className="space-y-0.5">
 {items.map((item) => (
 <NavLink
 key={item.to}
 to={item.to}
 className={({ isActive }) =>
 cn(
 'group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-brand-50 hover:text-brand-800 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white',
 isActive &&
 'bg-brand-600 text-white shadow-sm hover:bg-brand-600 hover:text-white dark:bg-brand-500 dark:hover:bg-brand-500 dark:hover:text-white',
 )
 }
 >
 <item.icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
 <span className="truncate">{item.label}</span>
 {item.unfinished ? (
 <span className="ml-auto rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
 Soon
 </span>
 ) : null}
 </NavLink>
 ))}
 </div>
 </div>
 );
 })}
 </nav>
 <div className="border-t border-slate-100 px-5 py-3 dark:border-slate-800">
 <p className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
 <WifiOff className="h-3.5 w-3.5" aria-hidden />
 Offline-first • data stays on this device
 </p>
 </div>
 </aside>
 );
}
