import { afterEach, describe, expect, it, vi } from 'vitest';

const products = vi.fn();

vi.mock('./ipc', () => ({ ipc: { products: (...args: unknown[]) => products(...args) } }));

const { PRODUCTS_PAGE_SIZE, fetchAllProducts, loadAllProducts } = await import('./products');

function row(id: string) {
  return { id, name: id } as never;
}

function page(ids: string[], total: number) {
  return { ok: true, items: ids.map(row), total };
}

describe('fetchAllProducts', () => {
  afterEach(() => {
    products.mockReset();
  });

  it('asks for the API maximum rather than a size the validator rejects', () => {
    expect(PRODUCTS_PAGE_SIZE).toBe(200);
  });

  it('stops after a short page and returns everything', async () => {
    products.mockResolvedValueOnce(page(['a', 'b'], 2));
    const res = await fetchAllProducts('para');
    expect(res.ok).toBe(true);
    expect(res.items.map((p) => p.id)).toEqual(['a', 'b']);
    expect(products).toHaveBeenCalledTimes(1);
    expect(products).toHaveBeenCalledWith({ search: 'para', page: 1, pageSize: 200 });
  });

  it('pages until the total is reached', async () => {
    const first = Array.from({ length: PRODUCTS_PAGE_SIZE }, (_, i) => `p${i}`);
    const second = ['tail'];
    products
      .mockResolvedValueOnce(page(first, first.length + second.length))
      .mockResolvedValueOnce(page(second, first.length + second.length));
    const res = await fetchAllProducts();
    expect(res.items).toHaveLength(first.length + 1);
    expect(products).toHaveBeenNthCalledWith(2, { search: '', page: 2, pageSize: 200 });
  });

  it('reports the failure instead of throwing', async () => {
    products.mockResolvedValueOnce({ ok: false, items: [], error: 'Database is locked' });
    const res = await fetchAllProducts();
    expect(res.ok).toBe(false);
    expect(res.error).toBe('Database is locked');
  });
});

describe('loadAllProducts', () => {
  afterEach(() => {
    products.mockReset();
  });

  it('throws the API message so the error state can show it', async () => {
    products.mockResolvedValueOnce({ ok: false, items: [], error: 'Not signed in' });
    await expect(loadAllProducts()).rejects.toThrow('Not signed in');
  });
});
