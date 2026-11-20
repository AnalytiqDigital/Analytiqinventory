// One cache entry for tax categories. The Products and Sell screens expect a
// list while the settings screen edits the same records; a second query
// function returning a different shape under this key made .find() crash
// whenever the settings screen populated the cache first.

import { ipc } from './ipc';
import type { TaxCategory } from '../types/global';

export const TAX_CATEGORIES_KEY = ['tax-categories'] as const;

export async function fetchTaxCategories(): Promise<TaxCategory[]> {
  const res = await ipc.taxCategories();
  if (!res.ok) throw new Error(res.error ?? 'Could not load tax categories');
  return res.items ?? [];
}
