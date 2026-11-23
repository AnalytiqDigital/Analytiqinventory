import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useNavigate, useLocation, MemoryRouter } from 'react-router-dom';
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

function BackButton(): JSX.Element {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(-1)}>
      Go back
    </button>
  );
}

function LocationProbe(): JSX.Element {
  const location = useLocation();
  return <output data-testid="location">{location.search}</output>;
}

function renderPage(initialEntries = ['/pos']): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <QueryClientProvider client={client}>
        <BackButton />
        <LocationProbe />
        <PosPage />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe('PosPage product grid', () => {
  beforeEach(() => {
    window.innerWidth = 1280;
    products.mockReset();
    categories.mockResolvedValue({ ok: true, items: [] });
    tables.mockResolvedValue({ ok: true, items: [] });
    customers.mockResolvedValue({ ok: true, items: [] });
    loyaltySettings.mockResolvedValue({ ok: true, settings: null });
    businessProfile.mockResolvedValue({ ok: false });
    products.mockImplementation(async ({ page, pageSize }: { page: number; pageSize: number }) => {
      const all = Array.from({ length: 30 }, (_, i) => product(i + 1));
      const start = (page - 1) * pageSize;
      return { ok: true, items: all.slice(start, start + pageSize), total: all.length };
    });
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

  it('shows a bounded desktop page with a working page strip', async () => {
    renderPage();

    await screen.findByText('Product 1');
    expect(screen.getByText('Product 20')).toBeInTheDocument();
    expect(screen.queryByText('Product 21')).not.toBeInTheDocument();
    expect(screen.getByText('Page 1 of 2 · 30 items')).toBeInTheDocument();
    expect(products).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 20 }));

    await userEvent.click(screen.getByRole('button', { name: 'Next page' }));

    await screen.findByText('Product 26');
    expect(screen.queryByText('Product 1')).not.toBeInTheDocument();
    expect(screen.getByText('Page 2 of 2 · 30 items')).toBeInTheDocument();
    await waitFor(() =>
      expect(products).toHaveBeenCalledWith(expect.objectContaining({ page: 2, pageSize: 20 }))
    );

    await userEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    await screen.findByText('Product 1');
  });

  it('reads filters from the URL and restores them with Back', async () => {
    products.mockImplementation(async ({ page }: { page: number }) => ({
      ok: true,
      items: [product((page - 1) * 20 + 1)],
      total: 40,
    }));

    renderPage(['/pos?search=rice&category=cat-1', '/pos?search=rice&category=cat-1&page=2']);

    await screen.findByText('Product 21');
    expect(products).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'rice', categoryId: 'cat-1', page: 2, pageSize: 20 })
    );
    expect(screen.getByLabelText('Search products')).toHaveValue('rice');

    await userEvent.click(screen.getByRole('button', { name: 'Go back' }));
    await waitFor(() =>
      expect(products).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'rice', categoryId: 'cat-1', page: 1, pageSize: 20 })
      )
    );
    expect(screen.getByTestId('location')).toHaveTextContent('search=rice');
  });

  it('debounces search into the URL, resets the page, and keeps the old tiles while loading', async () => {
    products.mockImplementation(({ page, search }: { page: number; search: string }) => {
      if (search === 'milk' && page === 1) {
        // Hold the request open to check that placeholder data stays on screen.
        return new Promise(() => {});
      }
      return Promise.resolve({ ok: true, items: [product((page - 1) * 20 + 1)], total: 40 });
    });

    renderPage(['/pos?page=2']);
    await screen.findByText('Product 21');

    await userEvent.type(screen.getByLabelText('Search products'), 'milk');
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('search=milk'), {
      timeout: 2000,
    });
    expect(screen.getByTestId('location')).not.toHaveTextContent('page=2');

    // Placeholder data keeps the previous page visible while the new query loads.
    expect(screen.getByText('Product 21')).toBeInTheDocument();

    await waitFor(() =>
      expect(products).toHaveBeenCalledWith(expect.objectContaining({ search: 'milk', page: 1 }))
    );
  });

  it('opens the mobile cart as a bottom sheet with its own Pay action', async () => {
    window.innerWidth = 375;
    renderPage();
    await screen.findByText('Product 1');

    await userEvent.click(screen.getByRole('button', { name: 'View cart, 0 items' }));

    expect(screen.getByRole('dialog', { name: 'Cart' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Pay/ }).length).toBeGreaterThan(1);
  });
});
