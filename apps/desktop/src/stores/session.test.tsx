import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSession } from './session';
import { ipc } from '../lib/ipc';

vi.mock('../lib/ipc', () => ({
  ipc: {
    authMe: vi.fn(),
    authLogin: vi.fn(),
    authLogout: vi.fn(),
  },
}));

const mocked = vi.mocked(ipc);

beforeEach(() => {
  useSession.setState({ user: null, checked: false });
  vi.resetAllMocks();
});

describe('session store', () => {
  it('grants permission only when present', () => {
    useSession.setState({
      user: { id: 'u', businessId: 'b', name: 'A', email: 'a@b.ng', permissions: ['sales.create'] },
    });
    expect(useSession.getState().can('sales.create')).toBe(true);
    expect(useSession.getState().can('staff.manage')).toBe(false);
  });

  it('signIn stores the user on success', async () => {
    const user = { id: 'u', businessId: 'b', name: 'A', email: 'a@b.ng', permissions: [] };
    mocked.authLogin.mockResolvedValue({ ok: true, user });
    const result = await useSession.getState().signIn('a@b.ng', 'Admin1234');
    expect(result.ok).toBe(true);
    expect(useSession.getState().user).toEqual(user);
  });

  it('signIn surfaces server errors', async () => {
    mocked.authLogin.mockResolvedValue({ ok: false, error: 'Invalid email or password' });
    const result = await useSession.getState().signIn('a@b.ng', 'wrong');
    expect(result.ok).toBe(false);
    expect(useSession.getState().user).toBeNull();
  });
});
