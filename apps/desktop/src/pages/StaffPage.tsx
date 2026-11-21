import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Pencil, Plus, ShieldCheck, UserCheck, UserX } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { TD, TH, THead, TRow, Table } from '../components/ui/table';
import { ErrorState, LoadingState } from '../components/ui/states';
import { Modal } from '../components/ui/modal';
import { Stat } from '../components/ui/stat';
import { ipc } from '../lib/ipc';
import type { StaffMember, StaffRole } from '../types/global';

const PERMISSION_OPTIONS = [
  { key: 'sales.create', label: 'Create sales at POS' },
  { key: 'sales.refund', label: 'Refund completed sales' },
  { key: 'sales.view', label: 'View sales history' },
  { key: 'products.manage', label: 'Manage products' },
  { key: 'inventory.adjust', label: 'Adjust stock and counts' },
  { key: 'inventory.view', label: 'View stock levels' },
  { key: 'purchases.manage', label: 'Manage purchases' },
  { key: 'customers.manage', label: 'Manage customers and credit' },
  { key: 'suppliers.manage', label: 'Manage suppliers' },
  { key: 'reports.view', label: 'View reports' },
  { key: 'finance.manage', label: 'Record expenses and view profit' },
  { key: 'staff.manage', label: 'Manage staff and permissions' },
  { key: 'settings.manage', label: 'Manage settings' },
] as const;

const LOCKED_FOR_ADMIN = new Set(['staff.manage', 'settings.manage']);

interface StaffFormValues {
  name: string;
  email: string;
  password: string;
  roleId: string;
  isActive: boolean;
}

const BLANK: StaffFormValues = {
  name: '',
  email: '',
  password: '',
  roleId: '',
  isActive: true,
};

export function StaffPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'users' | 'roles'>('users');
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [values, setValues] = useState<StaffFormValues>(BLANK);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [resetting, setResetting] = useState<StaffMember | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [roleId, setRoleId] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string[]>>({});

  const staffQuery = useQuery({
    queryKey: ['staff'],
    queryFn: async () => {
      const res = await ipc.staff();
      if (!res.ok) throw new Error(res.error ?? 'Could not load staff');
      return res.items;
    },
  });

  const rolesQuery = useQuery({
    queryKey: ['staff-roles'],
    queryFn: async () => {
      const res = await ipc.staffRoles();
      if (!res.ok) throw new Error(res.error ?? 'Could not load roles');
      return res.items;
    },
  });

  const staff = staffQuery.data ?? [];
  const roles = rolesQuery.data ?? [];
  const selectedRoleId = roleId || roles[0]?.id || '';
  const selectedRole: StaffRole | undefined = roles.find((r) => r.id === selectedRoleId);
  const currentPermissions = drafts[selectedRoleId] ?? selectedRole?.permissions ?? [];

  useEffect(() => {
    if (values.roleId === '' && roles.length > 0 && modalMode === 'create') {
      setValues((v) => ({
        ...v,
        roleId: roles.find((r) => r.name === 'Cashier')?.id ?? roles[0]?.id ?? '',
      }));
    }
  }, [roles, modalMode, values.roleId]);

  const invalidate = (): Promise<unknown> => queryClient.invalidateQueries({ queryKey: ['staff'] });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const name = values.name.trim();
      if (name.length < 2) throw new Error('Enter the staff name');
      const roleIdValue = values.roleId || roles[0]?.id;
      if (!roleIdValue) throw new Error('Choose a role');
      if (modalMode === 'create') {
        const email = values.email.trim();
        if (!email.includes('@')) throw new Error('Enter a valid email');
        if (values.password.length < 8) throw new Error('Use at least 8 characters');
        const res = await ipc.staffCreate({
          name,
          email,
          password: values.password,
          roleId: roleIdValue,
        });
        if (!res.ok) throw new Error(res.error ?? 'Could not add the staff member');
        return;
      }
      if (!editing) throw new Error('Nothing to edit');
      const res = await ipc.staffUpdate(editing.id, {
        name,
        roleId: roleIdValue,
        isActive: values.isActive,
      });
      if (!res.ok) throw new Error(res.error ?? 'Could not update the staff member');
    },
    onSuccess: async () => {
      setModalMode(null);
      setEditing(null);
      setValues(BLANK);
      await invalidate();
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async (member: StaffMember) => {
      const res = await ipc.staffUpdate(member.id, { isActive: !member.isActive });
      if (!res.ok) throw new Error(res.error ?? 'Could not update the account');
    },
    onSuccess: () => {
      setActionError(null);
      void invalidate();
    },
    onError: (e: Error) => setActionError(e.message),
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      if (!resetting) throw new Error('Choose a staff member');
      if (newPassword.length < 8) throw new Error('Use at least 8 characters');
      const res = await ipc.staffResetPassword(resetting.id, newPassword);
      if (!res.ok) throw new Error(res.error ?? 'Could not reset the password');
    },
    onSuccess: () => {
      setResetting(null);
      setNewPassword('');
      setActionError(null);
    },
    onError: (e: Error) => setActionError(e.message),
  });

  const roleMutation = useMutation({
    mutationFn: async () => {
      if (!selectedRole) throw new Error('Choose a role');
      const res = await ipc.staffRolePermissions(selectedRole.id, currentPermissions);
      if (!res.ok) throw new Error(res.error ?? 'Could not save permissions');
    },
    onSuccess: async () => {
      setActionError(null);
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[selectedRoleId];
        return next;
      });
      await queryClient.invalidateQueries({ queryKey: ['staff-roles'] });
    },
    onError: (e: Error) => setActionError(e.message),
  });

  function openCreate(): void {
    setModalMode('create');
    setEditing(null);
    setFormError(null);
    setValues({
      ...BLANK,
      roleId: roles.find((r) => r.name === 'Cashier')?.id ?? roles[0]?.id ?? '',
    });
  }

  function openEdit(member: StaffMember): void {
    setModalMode('edit');
    setEditing(member);
    setFormError(null);
    setValues({
      name: member.name,
      email: member.email,
      password: '',
      roleId: member.roleId ?? '',
      isActive: member.isActive,
    });
  }

  function togglePermission(key: string): void {
    if (selectedRole?.name === 'Administrator' && LOCKED_FOR_ADMIN.has(key)) return;
    const next = currentPermissions.includes(key)
      ? currentPermissions.filter((p) => p !== key)
      : [...currentPermissions, key];
    setDrafts((prev) => ({ ...prev, [selectedRoleId]: next }));
  }

  const activeCount = staff.filter((s) => s.isActive).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Users &amp; Roles</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Add staff, reset passwords and decide what each role can do.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Button
            size="sm"
            variant={tab === 'users' ? 'primary' : 'secondary'}
            onClick={() => setTab('users')}
          >
            Users
          </Button>
          <Button
            size="sm"
            variant={tab === 'roles' ? 'primary' : 'secondary'}
            onClick={() => setTab('roles')}
          >
            Roles
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> Add staff
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat icon={UserCheck} label="Staff accounts" value={String(staff.length)} tone="brand" />
        <Stat icon={UserCheck} label="Active" value={String(activeCount)} tone="emerald" />
        <Stat
          icon={ShieldCheck}
          label="Roles"
          value={String(roles.length)}
          sub="Administrator, Manager, Cashier"
          tone="violet"
        />
      </div>

      {actionError ? <ErrorState message={actionError} /> : null}
      {staffQuery.isLoading ? <LoadingState label="Loading staff…" /> : null}
      {staffQuery.isError ? (
        <ErrorState
          message={(staffQuery.error as Error).message}
          onRetry={() => void staffQuery.refetch()}
        />
      ) : null}

      {tab === 'users' && staffQuery.isSuccess ? (
        <Card>
          <CardHeader>
            <CardTitle>Staff accounts</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TRow>
                  <TH>Name</TH>
                  <TH>Email</TH>
                  <TH>Role</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Actions</TH>
                </TRow>
              </THead>
              <tbody>
                {staff.map((member) => (
                  <TRow key={member.id}>
                    <TD className="font-medium">{member.name}</TD>
                    <TD className="text-slate-500 dark:text-slate-400">{member.email}</TD>
                    <TD>{member.roleName || '—'}</TD>
                    <TD>
                      <Badge
                        className={
                          member.isActive
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                            : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                        }
                      >
                        {member.isActive ? 'Active' : 'Deactivated'}
                      </Badge>
                    </TD>
                    <TD>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(member)}>
                          <Pencil className="h-4 w-4" /> Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setResetting(member);
                            setNewPassword('');
                          }}
                        >
                          <KeyRound className="h-4 w-4" /> Password
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={toggleMutation.isPending}
                          onClick={() => toggleMutation.mutate(member)}
                        >
                          {member.isActive ? (
                            <>
                              <UserX className="h-4 w-4" /> Deactivate
                            </>
                          ) : (
                            <>
                              <UserCheck className="h-4 w-4" /> Activate
                            </>
                          )}
                        </Button>
                      </div>
                    </TD>
                  </TRow>
                ))}
              </tbody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {tab === 'roles' ? (
        <Card>
          <CardHeader>
            <CardTitle>Role permissions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-1">
              {roles.map((role) => (
                <Button
                  key={role.id}
                  size="sm"
                  variant={role.id === selectedRoleId ? 'primary' : 'secondary'}
                  onClick={() => setRoleId(role.id)}
                >
                  {role.name}
                  <span className="ml-1 text-xs opacity-70">({role.userCount})</span>
                </Button>
              ))}
            </div>
            {selectedRole ? (
              <>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {selectedRole.description}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {PERMISSION_OPTIONS.map((option) => {
                    const locked =
                      selectedRole.name === 'Administrator' && LOCKED_FOR_ADMIN.has(option.key);
                    const checked = currentPermissions.includes(option.key);
                    return (
                      <label
                        key={option.key}
                        className="flex items-start gap-2 rounded-xl border border-slate-100 px-3 py-2 text-sm dark:border-slate-800"
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={checked}
                          disabled={locked}
                          onChange={() => togglePermission(option.key)}
                        />
                        <span>
                          <span className="block text-slate-700 dark:text-slate-200">
                            {option.label}
                          </span>
                          <span className="block text-[11px] text-slate-400">{option.key}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Administrator always keeps staff and settings management.
                  </p>
                  <Button
                    disabled={roleMutation.isPending || drafts[selectedRoleId] === undefined}
                    onClick={() => roleMutation.mutate()}
                  >
                    Save {selectedRole.name} permissions
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-500">No roles found.</p>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Modal
        open={modalMode !== null}
        title={modalMode === 'edit' ? 'Edit staff member' : 'Add staff member'}
        onClose={() => setModalMode(null)}
      >
        <div className="space-y-3">
          <Input
            label="Full name"
            value={values.name}
            onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
          />
          {modalMode === 'create' ? (
            <>
              <Input
                label="Email"
                type="email"
                value={values.email}
                onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
              />
              <Input
                label="Password (at least 8 characters)"
                type="password"
                value={values.password}
                onChange={(e) => setValues((v) => ({ ...v, password: e.target.value }))}
              />
            </>
          ) : null}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Role
            </label>
            <select
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
              value={values.roleId}
              onChange={(e) => setValues((v) => ({ ...v, roleId: e.target.value }))}
            >
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </div>
          {modalMode === 'edit' ? (
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={values.isActive}
                onChange={(e) => setValues((v) => ({ ...v, isActive: e.target.checked }))}
              />
              Account is active
            </label>
          ) : null}
          {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalMode(null)}>
              Cancel
            </Button>
            <Button disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              {modalMode === 'edit' ? 'Save changes' : 'Add staff'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={resetting !== null}
        title={`Reset password${resetting ? ` — ${resetting.name}` : ''}`}
        onClose={() => setResetting(null)}
      >
        <div className="space-y-3">
          <Input
            label="New password (at least 8 characters)"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <p className="text-xs text-slate-500">
            Their current sessions are signed out immediately.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setResetting(null)}>
              Cancel
            </Button>
            <Button disabled={resetMutation.isPending} onClick={() => resetMutation.mutate()}>
              Set password
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
