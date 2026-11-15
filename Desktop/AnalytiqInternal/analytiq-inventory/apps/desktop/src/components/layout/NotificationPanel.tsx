import { useNotifications } from '../../stores/notifications';
import { Button } from '../ui/button';

export function NotificationPanel({ onClose }: { onClose: () => void }): JSX.Element {
  const { items, markAllRead, clear } = useNotifications();

  return (
    <div className="absolute right-0 top-10 z-40 w-80 rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900" role="dialog" aria-label="Notifications">
      <div className="flex items-center justify-between px-2 py-1">
        <p className="text-sm font-semibold text-slate-900 dark:text-white">Notifications</p>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={markAllRead}>
            Mark read
          </Button>
          <Button variant="ghost" size="sm" onClick={clear}>
            Clear
          </Button>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="px-2 py-6 text-center text-xs text-slate-500">No notifications yet.</p>
      ) : (
        <ul className="max-h-80 space-y-1 overflow-y-auto">
          {items.map((n) => (
            <li
              key={n.id}
              className={`rounded-lg px-3 py-2 text-xs ${n.read ? 'text-slate-500' : 'bg-slate-50 text-slate-800 dark:bg-slate-800 dark:text-slate-100'}`}
            >
              <p className="font-medium">{n.title}</p>
              {n.body ? <p className="mt-0.5">{n.body}</p> : null}
            </li>
          ))}
        </ul>
      )}
      <Button variant="ghost" size="sm" className="mt-1 w-full" onClick={onClose}>
        Close
      </Button>
    </div>
  );
}
