import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PosPage } from './PosPage';
import { useSession } from '../stores/session';
import type { ProductRow } from '../types/global';

afterEach(cleanup);

const { products, categories, tables, customers, loyaltySettings, businessProfile } = vi.hoisted(
  () => ({
    products: vi.fn(),
    categories: vi.fn(),
    tables: vi.fn(),
    customers: vi.fn(),
    loyaltySettings: vi.fn(),
    businessProfile: vi.fn(),
  })
);

vi.mock('../lib/ipc', () => ({
  ipc: {
    products,
    categories,
    tables,
    customers,
    loyaltySettings,
    businessProfile,
    taxCategories: vi.fn().mockResolvedValue({ ok: true, items: [] }),
    restaurantSettings: vi.fn().mockResolvedValue({ ok: true, settings: null }),
    tierPrices: vi.fn().mockResolvedValue({ ok: true, items: [] }),
    loyaltyEntries: vi.fn().mockResolvedValue({ ok: true, balance: 0, items: [] }),
    productByBarcode: vi.fn().mockResolvedValue({ ok: false }),
    sales: vi.fn().mockResolvedValue({ ok: true, items: [], total: 0 }),
    saleCreate: vi.fn(),
    saleGet: vi.fn(),
    saleRefund: vi.fn(),
    saleVoid: vi.fn(),
  },
}));

function product(index: number): ProductRow {
  return {
    id: `prod-${index}`,
    name: `Product ${index}`,
    sku: `SKU-${index}`,
    barcode: null,
    categoryId: null,
    categoryName: null,
    brandId: null,
    brandName: null,
    warrantyId: null,
    warrantyName: null,
    unit: 'pcs',
    costPriceKobo: 100_00,
    sellingPriceKobo: 150_00,
    reorderLevel: 0,
    imagePath: '',
    taxCategoryId: null,
    trackBatches: false,
    nearExpiryDays: 30,
    isActive: 1,
    onHand: 10,
    lowStock: false,
  };
}

describe('PosPage product grid', () => {
  beforeEach(() => {
    products.mockReset();
    categories.mockResolvedValue({ ok: true, items: [] });
    tables.mockResolvedValue({ ok: true, items: [] });
    customers.mockResolvedValue({ ok: true, items: [] });
    loyaltySettings.mockResolvedValue({ ok: true, settings: null });
    businessProfile.mockResolvedValue({ ok: false });
    products.mockImplementation(
      async ({ page, pageSize }: { page: number; pageSize: number }) => {
        const all = Array.from({ length: 30 }, (_, i) => product(i + 1));
        const start = (page - 1) * pageSize;
        return { ok: true, items: all.slice(start, start + pageSize), total: all.length };
      }
    );
    useSession.setState({
      user: {
        id: 'user-1',
        businessId: 'business-1',
        name: 'Owner',
        email: 'owner@example.com',
        permissions: ['sales.create', 'sales.view', 'customers.manage'],
        businessType: 'retail',
        modules: ['products', 'inventory', 'reports', 'customers', 'loyalty'],
      },
      checked: true,
    });
  });

  it('shows five-by-five pages of products with working paging', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <PosPage />
      </QueryClientProvider>
    );

    await screen.findByText('Product 1');
    expect(screen.getByText('Product 25')).toBeInTheDocument();
    expect(screen.queryByText('Product 26')).not.toBeInTheDocument();
    expect(screen.getByText('Showing 1–25 of 30')).toBeInTheDocument();
    expect(products).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 25 }));

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    await screen.findByText('Product 26');
    expect(screen.queryByText('Product 1')).not.toBeInTheDocument();
    expect(screen.getByText('Showing 26–30 of 30')).toBeInTheDocument();
    await waitFor(() =>
      expect(products).toHaveBeenCalledWith(expect.objectContaining({ page: 2, pageSize: 25 }))
    );

    await userEvent.click(screen.getByRole('button', { name: 'Previous' }));
    await screen.findByText('Product 1');
  });
});
