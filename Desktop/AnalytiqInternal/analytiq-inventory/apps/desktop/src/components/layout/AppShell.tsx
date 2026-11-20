import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { NAV_SECTIONS, visibleNavItems } from './nav';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useSession } from '../../stores/session';
import { useRealtime } from '../../hooks/useRealtime';
import { cn } from '../../lib/cn';

export function AppShell(): JSX.Element {
 const [mobileOpen, setMobileOpen] = useState(false);
 const can = useSession((s) => s.can);
 const businessType = useSession((s) => s.user?.businessType);
 const modules = useSession((s) => s.user?.modules);
 const visible = visibleNavItems(businessType, can, modules);
 useRealtime();

 return (
 <div className="flex min-h-screen bg-orange-50/50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
 <Sidebar />
 {mobileOpen ? (
 <div className="fixed inset-0 z-40 animate-fade-in md:hidden" role="dialog" aria-label="Navigation">
 <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
 <nav className="absolute left-0 top-0 h-full w-72 animate-slide-up overflow-y-auto bg-white p-4 dark:bg-slate-900" aria-label="Mobile">
 {NAV_SECTIONS.map((section) => {
 const items = visible.filter((i) => i.section === section);
 if (items.length === 0) return null;
 return (
 <div key={section} className="mb-3">
 <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">{section}</p>
 {items.map((item) => (
 <NavLink
 key={item.to}
 to={item.to}
 onClick={() => setMobileOpen(false)}
 className={({ isActive }) =>
 cn(
 'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300',
 isActive ? 'bg-brand-600 text-white dark:bg-brand-500' : '',
 )
 }
 >
 <item.icon className="h-5 w-5" aria-hidden />
 {item.label}
 </NavLink>
 ))}
 </div>
 );
 })}
 </nav>
 </div>
 ) : null}
 <div className="flex min-w-0 flex-1 flex-col">
 <Topbar onMenu={() => setMobileOpen(true)} />
 <main className="flex-1 overflow-y-auto p-4 sm:p-6">
 <div className="mx-auto w-full max-w-6xl animate-fade-in">
 <Outlet />
 </div>
 </main>
 </div>
 </div>
 );
}
