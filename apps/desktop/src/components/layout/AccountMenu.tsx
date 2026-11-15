import { useNavigate } from 'react-router-dom';
import { useSession } from '../../stores/session';
import { Button } from '../ui/button';

export function AccountMenu({ onClose }: { onClose: () => void }): JSX.Element {
  const user = useSession((s) => s.user);
  const signOut = useSession((s) => s.signOut);
  const navigate = useNavigate();

  return (
    <div className="absolute right-0 top-10 z-40 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900" role="dialog" aria-label="Account">
      <div className="px-3 py-2">
        <p className="text-sm font-semibold text-slate-900 dark:text-white">{user?.name ?? 'Signed out'}</p>
        <p className="text-xs text-slate-500">{user?.email ?? 'No active session'}</p>
        {user ? (
          <p className="mt-1 text-[11px] text-slate-400">
            {user.permissions.length} permission{user.permissions.length === 1 ? '' : 's'}
          </p>
        ) : null}
      </div>
      <div className="space-y-1">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={() => {
            onClose();
            navigate('/settings');
          }}
        >
          Profile &amp; settings
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={() => {
            void signOut().then(() => navigate('/login', { replace: true }));
            onClose();
          }}
        >
          Sign out
        </Button>
      </div>
    </div>
  );
}
