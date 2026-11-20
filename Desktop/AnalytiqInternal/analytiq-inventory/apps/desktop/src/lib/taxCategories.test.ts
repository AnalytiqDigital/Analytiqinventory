import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ taxCategories: vi.fn() }));

vi.mock('./ipc', () => ({ ipc: { taxCategories: mocks.taxCategories } }));

import { TAX_CATEGORIES_KEY, fetchTaxCategories } from './taxCategories';

describe('tax category query', () => {
  it('returns a plain array whatever the IPC response carries', async () => {
    mocks.taxCategories.mockResolvedValue({
      ok: true,
      items: [{ id: 'tax_1', name: 'VAT', rateBps: 750, isDefault: true }],
      defaultId: 'tax_1',
    });

    const rows = await fetchTaxCategories();
    expect(Array.isArray(rows)).toBe(true);
    expect(rows).toEqual([{ id: 'tax_1', name: 'VAT', rateBps: 750, isDefault: true }]);
    expect(TAX_CATEGORIES_KEY).toEqual(['tax-categories']);
  });

  it('throws the safe error message when the call fails', async () => {
    mocks.taxCategories.mockResolvedValue({ ok: false, items: [], error: 'Not signed in' });
    await expect(fetchTaxCategories()).rejects.toThrow('Not signed in');
  });
});
