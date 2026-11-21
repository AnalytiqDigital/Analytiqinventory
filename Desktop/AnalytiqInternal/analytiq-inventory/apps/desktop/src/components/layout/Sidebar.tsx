import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { ChevronDown, WifiOff } from 'lucide-react';
import { useSession } from '../../stores/session';
import { cn } from '../../lib/cn';
import { NAV_GROUPS, visibleNavItems } from './nav';

const COLLAPSE_KEY = 'analytiq.nav.collapsed';

function readCollapsed(): Set<string> {
  try {
    const raw = window.localStorage.getItem(COLLAPSE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

export function Sidebar(): JSX.Element {
  const can = useSession((s) => s.can);
  const businessType = useSession((s) => s.user?.businessType);
  const modules = useSession((s) => s.user?.modules);
  const visible = visibleNavItems(businessType, can, modules);
  const [collapsed, setCollapsed] = useState<Set<string>>(readCollapsed);

  useEffect(() => {
    try {
      window.localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...collapsed]));
    } catch {
      // Storage can be disabled; collapse state is a convenience only.
    }
  }, [collapsed]);

  function toggle(group: string): void {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }

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
          <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Inventory &amp; POS</p>
        </div>
      </div>
      <nav className="flex-1 space-y-3 overflow-y-auto px-3 pb-4" aria-label="Primary">
        {NAV_GROUPS.map((group) => {
          const items = visible.filter((i) => i.group === group);
          if (items.length === 0) return null;
          const isCollapsed = group !== 'Main' && collapsed.has(group);
          return (
            <div key={group}>
              {group === 'Main' ? null : (
                <button
                  type="button"
                  onClick={() => toggle(group)}
                  aria-expanded={!isCollapsed}
                  className="flex w-full items-center justify-between rounded-lg px-3 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  {group}
                  <ChevronDown
                    className={cn('h-3.5 w-3.5 transition-transform', isCollapsed && '-rotate-90')}
                    aria-hidden
                  />
                </button>
              )}
              {isCollapsed ? null : (
                <div className="space-y-0.5">
                  {items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) =>
                        cn(
                          'group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-brand-50 hover:text-brand-900 dark:text-slate-100 dark:hover:bg-slate-800 dark:hover:text-white',
                          isActive &&
                            'bg-brand-600 text-white shadow-sm hover:bg-brand-600 hover:text-white dark:bg-brand-500 dark:hover:bg-brand-500 dark:hover:text-white'
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
              )}
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
