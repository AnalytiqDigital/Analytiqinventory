import { ipc } from './ipc';
import type { ProductRow } from '../types/global';

/** The API rejects anything above this, so every "give me all products" caller pages at it. */
export const PRODUCTS_PAGE_SIZE = 200;
/** Safety stop: 200 x 100 = 20,000 products, far beyond any single till. */
const MAX_PAGES = 100;

export interface AllProductsResult {
  ok: boolean;
  items: ProductRow[];
  error?: string;
}

/**
 * Load every product matching `search`, paging through the API's 200-row cap.
 * Pages are fetched in order so the list arrives in the server's sort order.
 */
export async function fetchAllProducts(search = ''): Promise<AllProductsResult> {
  const items: ProductRow[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const res = await ipc.products({ search, page, pageSize: PRODUCTS_PAGE_SIZE });
    if (!res.ok) return { ok: false, items, error: res.error ?? 'Could not load products' };
    const batch = (res.items ?? []) as ProductRow[];
    items.push(...batch);
    const total = typeof res.total === 'number' ? res.total : items.length;
    if (batch.length < PRODUCTS_PAGE_SIZE || items.length >= total) {
      return { ok: true, items };
    }
  }
  return { ok: true, items };
}

/** Throwing variant for react-query queryFns. */
export async function loadAllProducts(search = ''): Promise<ProductRow[]> {
  const res = await fetchAllProducts(search);
  if (!res.ok) throw new Error(res.error ?? 'Could not load products');
  return res.items;
}
