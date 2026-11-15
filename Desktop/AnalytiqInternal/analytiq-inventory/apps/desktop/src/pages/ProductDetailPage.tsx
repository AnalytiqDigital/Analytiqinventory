import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { TD, TH, THead, TRow, Table } from '../components/ui/table';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/states';
import { ipc } from '../lib/ipc';
import { formatKobo } from '../lib/money';
import { ProductThumb } from '../lib/product-media';
import type { MovementRow, ProductDetail } from '../types/global';

export function ProductDetailPage(): JSX.Element {
  const { id = '' } = useParams();

  const productQuery = useQuery({
    queryKey: ['product', id],
    queryFn: async () => {
      const res = await ipc.productGet(id);
      if (!res.ok || !res.product) throw new Error(res.error ?? 'Product not found');
      return res.product as ProductDetail;
    },
  });

  const movementsQuery = useQuery({
    queryKey: ['movements', id],
    queryFn: async () => {
      const res = await ipc.stockMovements({ productId: id, page: 1, pageSize: 50 });
      if (!res.ok) throw new Error(res.error ?? 'Could not load movements');
      return res.items as MovementRow[];
    },
  });

  if (productQuery.isLoading) return <LoadingState label="Loading product…" />;
  if (productQuery.isError) {
    return (
      <div className="space-y-4">
        <Link to="/products" className="text-sm text-slate-500 hover:underline">
          ← Back to products
        </Link>
        <ErrorState message={(productQuery.error as Error).message} onRetry={() => void productQuery.refetch()} />
      </div>
    );
  }

  const p = productQuery.data;
  if (!p) return <LoadingState label="Loading product…" />;
  return (
    <div className="space-y-4">
      <Link to="/products" className="text-sm text-slate-500 hover:underline">
        ← Back to products
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{p.name}</h1>
        <ProductThumb imagePath={p.imagePath} name={p.name} size="lg" />
 {p.isActive === 1 ? <Badge>Active</Badge> : <Badge>Archived</Badge>}
        {p.lowStock ? <Badge>Low stock</Badge> : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader><CardTitle>On hand (all locations)</CardTitle></CardHeader>
          <CardContent><p className="text-lg font-semibold">{p.onHand} {p.unit}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Selling price</CardTitle></CardHeader>
          <CardContent><p className="text-lg font-semibold">{formatKobo(p.sellingPriceKobo)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Cost price</CardTitle></CardHeader>
          <CardContent><p className="text-lg font-semibold">{formatKobo(p.costPriceKobo)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Reorder level</CardTitle></CardHeader>
          <CardContent><p className="text-lg font-semibold">{p.reorderLevel} {p.unit}</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Details</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div><dt className="text-slate-500">SKU</dt><dd>{p.sku ?? '—'}</dd></div>
            <div><dt className="text-slate-500">Barcode</dt><dd>{p.barcode ?? '—'}</dd></div>
            <div><dt className="text-slate-500">Category</dt><dd>{p.categoryName ?? '—'}</dd></div>
            <div><dt className="text-slate-500">Unit</dt><dd>{p.unit}</dd></div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Stock by location</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <THead><TRow><TH>Location</TH><TH>On hand</TH></TRow></THead>
            <tbody>
              {p.levels.map((l) => (
                <TRow key={l.locationId}><TD>{l.locationName}</TD><TD>{l.onHand} {p.unit}</TD></TRow>
              ))}
            </tbody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent movements</CardTitle></CardHeader>
        <CardContent>
          {movementsQuery.isLoading ? <LoadingState label="Loading movements…" /> : null}
          {movementsQuery.isError ? <ErrorState message={(movementsQuery.error as Error).message} /> : null}
          {movementsQuery.isSuccess && movementsQuery.data.length === 0 ? (
            <EmptyState title="No movements yet" hint="Adjustments, counts and sales will appear here." />
          ) : null}
          {movementsQuery.isSuccess && movementsQuery.data.length > 0 ? (
            <Table>
              <THead><TRow><TH>Date</TH><TH>Kind</TH><TH>Change</TH><TH>After</TH><TH>Reason</TH></TRow></THead>
              <tbody>
                {movementsQuery.data.map((m) => (
                  <TRow key={m.id}>
                    <TD>{new Date(m.createdAt).toLocaleString()}</TD>
                    <TD><Badge>{m.kind}</Badge></TD>
                    <TD>{m.qtyDelta > 0 ? `+${m.qtyDelta}` : m.qtyDelta}</TD>
                    <TD>{m.qtyAfter}</TD>
                    <TD>{m.reason || '—'}</TD>
                  </TRow>
                ))}
              </tbody>
            </Table>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
