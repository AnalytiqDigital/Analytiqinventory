import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, RotateCcw, Shapes } from 'lucide-react';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Modal } from '../components/ui/modal';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/states';
import { TD, TH, THead, TRow, Table } from '../components/ui/table';
import { ipc } from '../lib/ipc';
import type { MasterKind, MasterRow } from '../types/global';

type Tab = 'categories' | 'brands' | 'units' | 'warranties' | 'customer-groups';

const TABS: Array<{ key: Tab; label: string; hint: string }> = [
  { key: 'categories', label: 'Categories', hint: 'Group similar products together.' },
  { key: 'brands', label: 'Brands', hint: 'The maker or label printed on the pack.' },
  { key: 'units', label: 'Units', hint: 'Suggestions for the product unit field.' },
  { key: 'warranties', label: 'Warranties', hint: 'How long a sold item stays covered.' },
  { key: 'customer-groups', label: 'Customer Groups', hint: 'Segment customers for reports.' },
];

interface RowView {
  id: string;
  name: string;
  note: string;
  isActive: boolean;
  shortName?: string;
  durationDays?: number;
}

interface EditorState {
  id: string | null;
  name: string;
  note: string;
  shortName: string;
  durationDays: string;
}

const BLANK: EditorState = { id: null, name: '', note: '', shortName: '', durationDays: '0' };

function toMasterView(row: MasterRow): RowView {
  return {
    id: row.id,
    name: row.name,
    note: row.note,
    isActive: row.isActive,
    ...(row.shortName !== undefined ? { shortName: row.shortName } : {}),
    ...(row.durationDays !== undefined ? { durationDays: row.durationDays } : {}),
  };
}

export function MastersPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('categories');
  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await ipc.categories();
      if (!res.ok) throw new Error(res.error ?? 'Could not load categories');
      return (res.items ?? []).map<RowView>((c) => ({
        id: c.id,
        name: c.name,
        note: c.description,
        isActive: true,
      }));
    },
    enabled: tab === 'categories',
  });

  const mastersQuery = useQuery({
    queryKey: ['masters', tab],
    queryFn: async () => {
      const res = await ipc.mastersList(tab as MasterKind);
      if (!res.ok) throw new Error(res.error ?? 'Could not load this list');
      return (res.items ?? []).map(toMasterView);
    },
    enabled: tab !== 'categories',
  });

  const rows = (tab === 'categories' ? categoriesQuery.data : mastersQuery.data) ?? [];
  const loading = tab === 'categories' ? categoriesQuery.isLoading : mastersQuery.isLoading;
  const failed = tab === 'categories' ? categoriesQuery.isError : mastersQuery.isError;
  const errorMessage = (tab === 'categories' ? categoriesQuery.error : mastersQuery.error) as
    | Error
    | null;

  const filtered = rows.filter(
    (row) =>
      search.trim() === '' ||
      row.name.toLowerCase().includes(search.trim().toLowerCase()) ||
      row.note.toLowerCase().includes(search.trim().toLowerCase())
  );

  const invalidate = async (): Promise<void> => {
    if (tab === 'categories') await queryClient.invalidateQueries({ queryKey: ['categories'] });
    await queryClient.invalidateQueries({ queryKey: ['masters'] });
    await queryClient.invalidateQueries({ queryKey: ['products'] });
    await queryClient.invalidateQueries({ queryKey: ['customers'] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!editor) throw new Error('Nothing to save');
      const name = editor.name.trim();
      if (name.length < 2) throw new Error('Enter a name of at least 2 characters');
      if (tab === 'categories') {
        const payload = { name, description: editor.note.trim() };
        const res = editor.id
          ? await ipc.categoryUpdate(editor.id, payload)
          : await ipc.categoryCreate(payload);
        if (!res.ok) throw new Error(res.error ?? 'Could not save the category');
        return;
      }
      const kind = tab as MasterKind;
      const payload =
        tab === 'units'
          ? { name, note: editor.note.trim(), shortName: editor.shortName.trim() }
          : tab === 'warranties'
            ? {
                name,
                note: editor.note.trim(),
                durationDays: Math.max(0, Number(editor.durationDays) || 0),
              }
            : { name, note: editor.note.trim() };
      const res = editor.id
        ? await ipc.mastersUpdate(kind, editor.id, payload)
        : await ipc.mastersCreate(kind, payload);
      if (!res.ok) throw new Error(res.error ?? 'Could not save this item');
    },
    onSuccess: async () => {
      setEditor(null);
      setFormError(null);
      await invalidate();
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async (row: RowView) => {
      const res = await ipc.mastersUpdate(tab as MasterKind, row.id, { isActive: !row.isActive });
      if (!res.ok) throw new Error(res.error ?? 'Could not update this item');
    },
    onSuccess: () => invalidate(),
  });

  function openCreate(): void {
    setFormError(null);
    setEditor({ ...BLANK });
  }

  function openEdit(row: RowView): void {
    setFormError(null);
    setEditor({
      id: row.id,
      name: row.name,
      note: row.note,
      shortName: row.shortName ?? '',
      durationDays: String(row.durationDays ?? 0),
    });
  }

  const activeTab = TABS.find((t) => t.key === tab) ?? TABS[0]!;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Products setup</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Categories, brands, units, warranties and customer groups in one place.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> Add {activeTab.label.replace(/s$/, '')}
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-wrap gap-1">
          {TABS.map((item) => (
            <Button
              key={item.key}
              size="sm"
              variant={tab === item.key ? 'primary' : 'secondary'}
              onClick={() => {
                setTab(item.key);
                setSearch('');
              }}
            >
              {item.label}
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <Input
              label="Search"
              placeholder="Name or note…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <p className="flex items-center gap-1.5 pb-2 text-xs text-slate-500">
            <Shapes className="h-4 w-4" /> {activeTab.hint}
          </p>
        </CardContent>
      </Card>

      {failed ? (
        <ErrorState message={errorMessage?.message ?? 'Could not load this list'} />
      ) : loading ? (
        <LoadingState label="Loading…" />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={rows.length === 0 ? 'Nothing here yet' : 'No matches'}
          hint={
            rows.length === 0
              ? `Add your first ${activeTab.label.replace(/s$/, '').toLowerCase()} to use it on products and customers.`
              : 'Try a different search.'
          }
          actionLabel={rows.length === 0 ? 'Add one' : undefined}
          onAction={rows.length === 0 ? openCreate : undefined}
        />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto">
            <Table>
              <THead>
                <TRow>
                  <TH>Name</TH>
                  <TH>Details</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Actions</TH>
                </TRow>
              </THead>
              <tbody>
                {filtered.map((row) => (
                  <TRow key={row.id} className={row.isActive ? '' : 'opacity-60'}>
                    <TD className="font-medium">{row.name}</TD>
                    <TD className="text-slate-500 dark:text-slate-400">
                      {tab === 'units' && row.shortName
                        ? `${row.shortName} · ${row.note || '—'}`
                        : tab === 'warranties'
                          ? `${row.durationDays ?? 0} day${row.durationDays === 1 ? '' : 's'} · ${row.note || '—'}`
                          : row.note || '—'}
                    </TD>
                    <TD>
                      {row.isActive ? (
                        <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                          Active
                        </Badge>
                      ) : (
                        <Badge className="bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          Archived
                        </Badge>
                      )}
                    </TD>
                    <TD>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>
                          <Pencil className="h-4 w-4" /> Edit
                        </Button>
                        {tab === 'categories' ? null : (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={toggleMutation.isPending}
                            onClick={() => toggleMutation.mutate(row)}
                          >
                            <RotateCcw className="h-4 w-4" />
                            {row.isActive ? 'Archive' : 'Restore'}
                          </Button>
                        )}
                      </div>
                    </TD>
                  </TRow>
                ))}
              </tbody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Modal
        open={editor !== null}
        title={`${editor?.id ? 'Edit' : 'New'} ${activeTab.label.replace(/s$/, '').toLowerCase()}`}
        onClose={() => setEditor(null)}
      >
        {editor ? (
          <div className="space-y-3">
            <Input
              label="Name"
              value={editor.name}
              onChange={(e) => setEditor({ ...editor, name: e.target.value })}
            />
            {tab === 'units' ? (
              <Input
                label="Short name (optional)"
                placeholder="e.g. ctn"
                value={editor.shortName}
                onChange={(e) => setEditor({ ...editor, shortName: e.target.value })}
              />
            ) : null}
            {tab === 'warranties' ? (
              <Input
                label="Duration (days)"
                type="number"
                min={0}
                value={editor.durationDays}
                onChange={(e) => setEditor({ ...editor, durationDays: e.target.value })}
              />
            ) : null}
            <div>
              <label className="mb-1 block text-xs font-medium" htmlFor="master-note">
                {tab === 'categories' ? 'Description' : 'Note'} (optional)
              </label>
              <Input
                id="master-note"
                value={editor.note}
                onChange={(e) => setEditor({ ...editor, note: e.target.value })}
              />
            </div>
            {formError ? <p className="text-sm font-medium text-red-600">{formError}</p> : null}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => setEditor(null)}>
                Cancel
              </Button>
              <Button
                disabled={saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
              >
                {saveMutation.isPending ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
