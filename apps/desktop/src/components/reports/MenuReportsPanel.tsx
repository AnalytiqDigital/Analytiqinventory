import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Stat } from '../ui/stat';
import { TD, TH, THead, TRow, Table } from '../ui/table';
import { Banknote, Landmark, Percent, ShoppingCart } from 'lucide-react';
import { formatKobo } from '../../lib/money';
import type { MenuReports } from '../../types/global';

export type MenuReportTab =
  | 'purchase-sale'
  | 'tax'
  | 'suppliers-customers'
  | 'customer-groups'
  | 'adjustments'
  | 'product-purchases'
  | 'purchase-payments'
  | 'sell-payments'
  | 'registers'
  | 'sales-reps';

function Empty({ message }: { message: string }): JSX.Element {
  return <p className="py-6 text-center text-sm text-slate-500">{message}</p>;
}

export function MenuReportsPanel({
  tab,
  report,
}: {
  tab: MenuReportTab;
  report: MenuReports;
}): JSX.Element {
  if (tab === 'purchase-sale') {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            icon={ShoppingCart}
            label="Sales"
            value={formatKobo(report.purchaseSale.salesKobo)}
            sub={`${report.purchaseSale.salesCount} sales`}
            tone="emerald"
          />
          <Stat
            icon={Banknote}
            label="Purchases"
            value={formatKobo(report.purchaseSale.purchaseKobo)}
            sub={`${report.purchaseSale.purchaseCount} purchases`}
            tone="brand"
          />
          <Stat
            icon={Landmark}
            label="Balance"
            value={formatKobo(report.purchaseSale.salesKobo - report.purchaseSale.purchaseKobo)}
            sub="sales minus purchases"
            tone={report.purchaseSale.salesKobo >= report.purchaseSale.purchaseKobo ? 'emerald' : 'amber'}
          />
          <Stat
            icon={Percent}
            label="Days with activity"
            value={String(report.purchaseSale.daily.length)}
            sub={report.range.from.slice(0, 10) + ' to ' + report.range.to.slice(0, 10)}
            tone="sky"
          />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Day by day</CardTitle>
          </CardHeader>
          <CardContent>
            {report.purchaseSale.daily.length === 0 ? (
              <Empty message="No sales or purchases in this period." />
            ) : (
              <Table>
                <THead>
                  <TRow>
                    <TH>Date</TH>
                    <TH className="text-right">Sales</TH>
                    <TH className="text-right">Sales value</TH>
                    <TH className="text-right">Purchases</TH>
                    <TH className="text-right">Purchase value</TH>
                    <TH className="text-right">Difference</TH>
                  </TRow>
                </THead>
                <tbody>
                  {report.purchaseSale.daily.map((row) => (
                    <TRow key={row.date}>
                      <TD className="font-medium">{row.date}</TD>
                      <TD className="tabular-nums text-right">{row.salesCount}</TD>
                      <TD className="tabular-nums text-right">{formatKobo(row.salesKobo)}</TD>
                      <TD className="tabular-nums text-right">{row.purchaseCount}</TD>
                      <TD className="tabular-nums text-right">{formatKobo(row.purchaseKobo)}</TD>
                      <TD className="tabular-nums text-right">
                        {formatKobo(row.salesKobo - row.purchaseKobo)}
                      </TD>
                    </TRow>
                  ))}
                </tbody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (tab === 'tax') {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat icon={Percent} label="Output tax (sales)" value={formatKobo(report.tax.outputKobo)} tone="emerald" />
          <Stat icon={Percent} label="Input tax (purchases)" value={formatKobo(report.tax.inputKobo)} tone="brand" />
          <Stat
            icon={Landmark}
            label="Net tax position"
            value={formatKobo(report.tax.netKobo)}
            sub={report.tax.netKobo >= 0 ? 'payable' : 'credit carried'}
            tone={report.tax.netKobo >= 0 ? 'amber' : 'emerald'}
          />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Tax by day</CardTitle>
          </CardHeader>
          <CardContent>
            {report.tax.daily.length === 0 ? (
              <Empty message="No tax was recorded in this period." />
            ) : (
              <Table>
                <THead>
                  <TRow>
                    <TH>Date</TH>
                    <TH className="text-right">Output tax</TH>
                    <TH className="text-right">Input tax</TH>
                    <TH className="text-right">Net</TH>
                  </TRow>
                </THead>
                <tbody>
                  {report.tax.daily.map((row) => (
                    <TRow key={row.date}>
                      <TD className="font-medium">{row.date}</TD>
                      <TD className="tabular-nums text-right">{formatKobo(row.outputKobo)}</TD>
                      <TD className="tabular-nums text-right">{formatKobo(row.inputKobo)}</TD>
                      <TD className="tabular-nums text-right">
                        {formatKobo(row.outputKobo - row.inputKobo)}
                      </TD>
                    </TRow>
                  ))}
                </tbody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (tab === 'suppliers-customers') {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Stat
            icon={Landmark}
            label="Receivables (customers owe you)"
            value={formatKobo(report.receivablesKobo)}
            tone="amber"
          />
          <Stat
            icon={Landmark}
            label="Payables (you owe suppliers)"
            value={formatKobo(report.payablesKobo)}
            tone="brand"
          />
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Customers</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {report.customers.length === 0 ? (
                <Empty message="No customers with activity in this period." />
              ) : (
                <Table>
                  <THead>
                    <TRow>
                      <TH>Customer</TH>
                      <TH>Group</TH>
                      <TH className="text-right">Sales</TH>
                      <TH className="text-right">Spend</TH>
                      <TH className="text-right">Owes</TH>
                    </TRow>
                  </THead>
                  <tbody>
                    {report.customers.map((row) => (
                      <TRow key={row.customerId}>
                        <TD>
                          <span className="font-medium">{row.name}</span>
                          {row.phone ? (
                            <span className="block text-xs text-slate-500">{row.phone}</span>
                          ) : null}
                        </TD>
                        <TD className="text-slate-500">{row.groupName || '—'}</TD>
                        <TD className="tabular-nums text-right">{row.transactions}</TD>
                        <TD className="tabular-nums text-right">{formatKobo(row.spendKobo)}</TD>
                        <TD className="tabular-nums text-right">{formatKobo(row.balanceKobo)}</TD>
                      </TRow>
                    ))}
                  </tbody>
                </Table>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Suppliers</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {report.suppliers.length === 0 ? (
                <Empty message="No supplier activity in this period." />
              ) : (
                <Table>
                  <THead>
                    <TRow>
                      <TH>Supplier</TH>
                      <TH className="text-right">Purchases</TH>
                      <TH className="text-right">Paid</TH>
                      <TH className="text-right">Returns</TH>
                      <TH className="text-right">Balance</TH>
                    </TRow>
                  </THead>
                  <tbody>
                    {report.suppliers.map((row) => (
                      <TRow key={row.supplierId}>
                        <TD className="font-medium">{row.name}</TD>
                        <TD className="tabular-nums text-right">{formatKobo(row.purchasesKobo)}</TD>
                        <TD className="tabular-nums text-right">{formatKobo(row.paidKobo)}</TD>
                        <TD className="tabular-nums text-right">{formatKobo(row.returnsKobo)}</TD>
                        <TD className="tabular-nums text-right">{formatKobo(row.balanceKobo)}</TD>
                      </TRow>
                    ))}
                  </tbody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (tab === 'customer-groups') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sales and credit by customer group</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {report.customerGroups.length === 0 ? (
            <Empty message="No customer groups yet. Add groups under Units, Brands & Groups." />
          ) : (
            <Table>
              <THead>
                <TRow>
                  <TH>Group</TH>
                  <TH className="text-right">Customers</TH>
                  <TH className="text-right">Sales</TH>
                  <TH className="text-right">Credit owed</TH>
                </TRow>
              </THead>
              <tbody>
                {report.customerGroups.map((row) => (
                  <TRow key={row.groupId}>
                    <TD className="font-medium">{row.name}</TD>
                    <TD className="tabular-nums text-right">{row.customers}</TD>
                    <TD className="tabular-nums text-right">{formatKobo(row.salesKobo)}</TD>
                    <TD className="tabular-nums text-right">{formatKobo(row.creditKobo)}</TD>
                  </TRow>
                ))}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>
    );
  }

  if (tab === 'adjustments') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Stock adjustments in this period</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {report.stockAdjustments.length === 0 ? (
            <Empty message="No stock adjustments in this period." />
          ) : (
            <Table>
              <THead>
                <TRow>
                  <TH>Reference</TH>
                  <TH>Date</TH>
                  <TH>Branch</TH>
                  <TH>Reason</TH>
                  <TH className="text-right">Lines</TH>
                  <TH className="text-right">Net quantity</TH>
                </TRow>
              </THead>
              <tbody>
                {report.stockAdjustments.map((row) => (
                  <TRow key={row.id}>
                    <TD className="font-medium">{row.reference}</TD>
                    <TD className="text-slate-500">{row.date}</TD>
                    <TD>{row.locationName}</TD>
                    <TD>{row.reason}</TD>
                    <TD className="tabular-nums text-right">{row.lines}</TD>
                    <TD
                      className={`tabular-nums text-right font-semibold ${
                        row.qtyNet >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {row.qtyNet > 0 ? `+${row.qtyNet}` : row.qtyNet}
                    </TD>
                  </TRow>
                ))}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>
    );
  }

  if (tab === 'product-purchases') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Products purchased in this period</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {report.productPurchases.length === 0 ? (
            <Empty message="No purchased stock in this period." />
          ) : (
            <Table>
              <THead>
                <TRow>
                  <TH>Product</TH>
                  <TH>SKU</TH>
                  <TH className="text-right">Quantity</TH>
                  <TH className="text-right">Cost</TH>
                </TRow>
              </THead>
              <tbody>
                {report.productPurchases.map((row) => (
                  <TRow key={row.productId}>
                    <TD className="font-medium">{row.name}</TD>
                    <TD className="text-slate-500">{row.sku || '—'}</TD>
                    <TD className="tabular-nums text-right">{row.qty}</TD>
                    <TD className="tabular-nums text-right">{formatKobo(row.costKobo)}</TD>
                  </TRow>
                ))}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>
    );
  }

  if (tab === 'purchase-payments') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Money owed on received purchases</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {report.purchasePayments.length === 0 ? (
            <Empty message="No received purchases in this period." />
          ) : (
            <Table>
              <THead>
                <TRow>
                  <TH>Purchase</TH>
                  <TH>Supplier</TH>
                  <TH>Received</TH>
                  <TH className="text-right">Total</TH>
                  <TH className="text-right">Paid</TH>
                  <TH className="text-right">Returns</TH>
                  <TH className="text-right">Balance</TH>
                </TRow>
              </THead>
              <tbody>
                {report.purchasePayments.map((row) => (
                  <TRow key={row.id}>
                    <TD className="font-medium">{row.reference}</TD>
                    <TD>{row.supplierName || 'Walk-in'}</TD>
                    <TD className="text-slate-500">{row.receivedAt.slice(0, 10)}</TD>
                    <TD className="tabular-nums text-right">{formatKobo(row.totalKobo)}</TD>
                    <TD className="tabular-nums text-right">{formatKobo(row.paidKobo)}</TD>
                    <TD className="tabular-nums text-right">{formatKobo(row.returnsKobo)}</TD>
                    <TD className="tabular-nums text-right font-semibold">
                      {formatKobo(row.balanceKobo)}
                    </TD>
                  </TRow>
                ))}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>
    );
  }

  if (tab === 'sell-payments') {
    const total = report.sellPayments.reduce((sum, row) => sum + row.amountKobo, 0);
    return (
      <Card>
        <CardHeader>
          <CardTitle>How customers paid</CardTitle>
        </CardHeader>
        <CardContent>
          {report.sellPayments.length === 0 ? (
            <Empty message="No payments in this period." />
          ) : (
            <Table>
              <THead>
                <TRow>
                  <TH>Method</TH>
                  <TH className="text-right">Payments</TH>
                  <TH className="text-right">Amount</TH>
                  <TH className="text-right">Share</TH>
                </TRow>
              </THead>
              <tbody>
                {report.sellPayments.map((row) => (
                  <TRow key={row.method}>
                    <TD className="font-medium capitalize">{row.method}</TD>
                    <TD className="tabular-nums text-right">{row.count}</TD>
                    <TD className="tabular-nums text-right">{formatKobo(row.amountKobo)}</TD>
                    <TD className="tabular-nums text-right">
                      {total > 0 ? `${Math.round((row.amountKobo / total) * 100)}%` : '0%'}
                    </TD>
                  </TRow>
                ))}
                <TRow>
                  <TD className="font-semibold">Total</TD>
                  <TD />
                  <TD className="tabular-nums text-right font-semibold">{formatKobo(total)}</TD>
                  <TD />
                </TRow>
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>
    );
  }

  if (tab === 'registers') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sales by register (branch)</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {report.registers.length === 0 ? (
            <Empty message="No sales in this period." />
          ) : (
            <Table>
              <THead>
                <TRow>
                  <TH>Register</TH>
                  <TH className="text-right">Sales</TH>
                  <TH className="text-right">Gross</TH>
                  <TH className="text-right">Tax</TH>
                  <TH className="text-right">Cash</TH>
                  <TH className="text-right">Transfer</TH>
                  <TH className="text-right">POS</TH>
                  <TH className="text-right">Credit</TH>
                </TRow>
              </THead>
              <tbody>
                {report.registers.map((row) => (
                  <TRow key={row.locationId}>
                    <TD className="font-medium">{row.locationName}</TD>
                    <TD className="tabular-nums text-right">{row.transactions}</TD>
                    <TD className="tabular-nums text-right">{formatKobo(row.grossKobo)}</TD>
                    <TD className="tabular-nums text-right">{formatKobo(row.taxKobo)}</TD>
                    <TD className="tabular-nums text-right">{formatKobo(row.cashKobo)}</TD>
                    <TD className="tabular-nums text-right">{formatKobo(row.transferKobo)}</TD>
                    <TD className="tabular-nums text-right">{formatKobo(row.posKobo)}</TD>
                    <TD className="tabular-nums text-right">{formatKobo(row.creditKobo)}</TD>
                  </TRow>
                ))}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sales representative report</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {report.salesReps.length === 0 ? (
          <Empty message="No sales in this period." />
        ) : (
          <Table>
            <THead>
              <TRow>
                <TH>Sales rep</TH>
                <TH className="text-right">Sales</TH>
                <TH className="text-right">Gross</TH>
                <TH className="text-right">Discounts</TH>
                <TH className="text-right">Tax</TH>
                <TH className="text-right">Refunds</TH>
              </TRow>
            </THead>
            <tbody>
              {report.salesReps.map((row) => (
                <TRow key={row.userId ?? row.name}>
                  <TD className="font-medium">{row.name}</TD>
                  <TD className="tabular-nums text-right">{row.transactions}</TD>
                  <TD className="tabular-nums text-right">{formatKobo(row.grossKobo)}</TD>
                  <TD className="tabular-nums text-right">{formatKobo(row.discountKobo)}</TD>
                  <TD className="tabular-nums text-right">{formatKobo(row.taxKobo)}</TD>
                  <TD className="tabular-nums text-right">{formatKobo(row.refundsKobo)}</TD>
                </TRow>
              ))}
            </tbody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
