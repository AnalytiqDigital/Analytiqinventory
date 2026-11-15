import { Bell, Menu, Moon, Plus, Search, Sun } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../../stores/notifications';
import { useSession } from '../../stores/session';
import { useTheme } from '../../stores/theme';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { AccountMenu } from './AccountMenu';
import { NotificationPanel } from './NotificationPanel';

export function Topbar({ onMenu }: { onMenu: () => void }): JSX.Element {
 const { mode, toggle } = useTheme();
 const unread = useNotifications((s) => s.items.filter((i) => !i.read).length);
 const user = useSession((s) => s.user);
 const canSell = useSession((s) => s.can('sales.create'));
 const [panel, setPanel] = useState<'none' | 'notifications' | 'account'>('none');
 const [search, setSearch] = useState('');
 const searchRef = useRef<HTMLInputElement>(null);
 const navigate = useNavigate();

 // Press "/" anywhere to jump to search.
 useEffect(() => {
 const onKey = (e: KeyboardEvent): void => {
 const target = e.target as HTMLElement;
 if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
 e.preventDefault();
 searchRef.current?.focus();
 }
 };
 window.addEventListener('keydown', onKey);
 return () => window.removeEventListener('keydown', onKey);
 }, []);

 const submitSearch = (e: React.FormEvent): void => {
 e.preventDefault();
 const q = search.trim();
 if (!q) return;
 navigate(`/pos?search=${encodeURIComponent(q)}`);
 setSearch('');
 };

 return (
 <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
 <Button variant="ghost" size="sm" className="md:hidden" onClick={onMenu} aria-label="Open navigation">
 <Menu className="h-5 w-5" />
 </Button>
 <form
 onSubmit={submitSearch}
 className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm transition-colors focus-within:border-brand-400 focus-within:bg-white sm:flex dark:border-slate-700 dark:bg-slate-800 dark:focus-within:bg-slate-900"
 >
 <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
 <input
 ref={searchRef}
 className="w-48 bg-transparent outline-none placeholder:text-slate-400 dark:text-white"
 placeholder="Search products…  ( / )"
 aria-label="Search products"
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 />
 </form>
 <div className="ml-auto flex items-center gap-1.5">
 <Badge className="mr-1 hidden border-emerald-200 bg-emerald-50 text-emerald-700 lg:inline-flex dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
 Offline ready
 </Badge>
 {canSell ? (
 <Button size="sm" onClick={() => navigate('/pos')} className="hidden sm:inline-flex">
 <Plus className="h-4 w-4" />
 New sale
 </Button>
 ) : null}
 <Button variant="ghost" size="sm" onClick={toggle} aria-label={mode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>
 {mode === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
 </Button>
 <div className="relative">
 <Button variant="ghost" size="sm" onClick={() => setPanel(panel === 'notifications' ? 'none' : 'notifications')} aria-label="Notifications">
 <Bell className="h-5 w-5" />
 {unread > 0 ? (
 <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
 {unread}
 </span>
 ) : null}
 </Button>
 {panel === 'notifications' ? <NotificationPanel onClose={() => setPanel('none')} /> : null}
 </div>
 <div className="relative">
 <Button variant="ghost" size="sm" onClick={() => setPanel(panel === 'account' ? 'none' : 'account')} aria-label="Account menu">
 <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-xs font-bold text-white">
 {user?.name.slice(0, 1).toUpperCase() ?? '?'}
 </span>
 </Button>
 {panel === 'account' ? <AccountMenu onClose={() => setPanel('none')} /> : null}
 </div>
 </div>
 </header>
 );
}
