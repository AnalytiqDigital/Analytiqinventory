import type { Metadata } from 'next';
import { DocsNav } from '../../../components/DocsNav';
import { SUPPORT_WHATSAPP_LABEL, whatsappUrl } from '../../../lib/site';

export const metadata: Metadata = {
  title: 'Daily use guide — AnalytIQ',
  description:
    'How to sell, manage stock, record credit, print receipts and read reports in AnalytIQ Inventory & POS.',
};

export default function UsagePage() {
  return (
    <main className="docs-page">
      <div className="container">
        <div className="docs-head">
          <span className="eyebrow">Daily use</span>
          <h1>Run a normal shop day in AnalytIQ</h1>
          <p>
            This guide follows the order most shops work in: set up products, sell, receive stock,
            handle credit, then close the day with reports and a backup.
          </p>
        </div>
        <div className="docs-grid">
          <DocsNav current="/docs/usage" />
          <div className="prose">
            <h2 id="products">Add products and prices</h2>
            <ol>
              <li>
                Open <strong>Products → Add product</strong>.
              </li>
              <li>
                Enter the name, selling price and cost price. Cost price is used for profit reports.
              </li>
              <li>
                Add a SKU and barcode if you have them, choose a category, and set a reorder level.
              </li>
              <li>
                Save, then use <strong>Inventory → Adjust stock</strong> to enter opening stock.
              </li>
            </ol>
            <p>
              Have a long price list? Use <strong>Import CSV</strong> on the Products page to add
              hundreds of products at once. Download the template first.
            </p>

            <h2 id="sell">Make a sale</h2>
            <ol>
              <li>
                Open <strong>Sell</strong>. Search by name or scan a barcode to add items to the
                cart.
              </li>
              <li>Adjust quantity, or apply a line or cart discount if allowed.</li>
              <li>
                Choose <strong>Pay</strong> and select the tender: cash, transfer, POS or customer
                credit. Split a payment across more than one method if needed.
              </li>
              <li>
                Print or skip the receipt. Stock is reduced immediately and the sale appears in
                Reports.
              </li>
            </ol>
            <p>
              To reverse a mistake, open <strong>Sell → Sales history</strong>, find the receipt and
              choose Refund or Void. Stock is put back automatically.
            </p>

            <h2 id="stock">Receive stock and order more</h2>
            <ol>
              <li>
                Open <strong>Purchases → New purchase order</strong> and choose the supplier.
              </li>
              <li>Add the items and quantities you ordered.</li>
              <li>
                When the goods arrive, open the order and choose <strong>Receive</strong>. Stock and
                cost prices update.
              </li>
            </ol>
            <p>
              The <strong>Reports → Stock alerts</strong> tab lists every product at or below its
              reorder level, with a suggested order quantity.
            </p>

            <h2 id="credit">Customer credit</h2>
            <ol>
              <li>
                On the Sell screen choose <strong>Credit</strong> as the tender and pick the
                customer.
              </li>
              <li>
                When they pay, open <strong>Customers</strong>, find the customer and choose{' '}
                <strong>Record payment</strong>.
              </li>
              <li>
                Open the customer to see their balance and payment history, or print a statement.
              </li>
            </ol>

            <h2 id="reports">Read your reports</h2>
            <p>
              Open <strong>Reports</strong> and pick a date range. The tabs cover:
            </p>
            <ul>
              <li>
                <strong>Overview</strong> — gross sales, tax, discounts, profit, payments, top
                products, customers and cashiers.
              </li>
              <li>
                <strong>Products</strong> — quantity sold, revenue, profit, stock on hand and stock
                value per product.
              </li>
              <li>
                <strong>Weekly</strong> — week-by-week sales, expenses and net profit.
              </li>
              <li>
                <strong>Stock alerts</strong> — what needs reordering, with shortfall and suggested
                order.
              </li>
            </ul>
            <p>Use Export CSV to open any report in Excel or share it with your accountant.</p>

            <h2 id="finance">Record expenses and see profit</h2>
            <ol>
              <li>
                Open <strong>Finance → Add expense</strong>.
              </li>
              <li>
                Choose a category (rent, transport, salaries, etc.), enter the amount and date.
              </li>
              <li>
                The profit statement shows gross sales, cost of goods sold, gross profit, expenses
                and net profit for the range you choose.
              </li>
            </ol>

            <h2 id="staff">Add staff and control permissions</h2>
            <ol>
              <li>
                Open <strong>Staff → Add staff</strong>, enter their name, email and a temporary
                password, and choose a role.
              </li>
              <li>
                Edit the role permissions in the matrix below the staff list — for example, let a
                cashier sell but not see profit reports.
              </li>
              <li>
                If someone leaves, deactivate their account. To help them back in later, use Reset
                password; current sessions are signed out.
              </li>
            </ol>
            <div className="callout">
              <strong>Guard rails:</strong> you cannot deactivate yourself or remove the last
              account that can manage staff. The Administrator role always keeps staff and settings
              access.
            </div>

            <h2 id="printing">Print receipts and scan barcodes</h2>
            <p>
              Set your printer, paper width and copies in <strong>Settings → Printing</strong>. Use
              the system print dialog as a fallback if silent printing is unavailable. Barcode
              scanners work as keyboard input on the Sell screen.
            </p>

            <h2 id="backups">Back up and restore</h2>
            <p>
              Go to <strong>Settings → Backups</strong> to take an immediate backup or restore a
              previous one. Automatic daily backups run while the app is open. Copy the backup file
              to a flash drive or cloud folder at least once a week.
            </p>

            <h2 id="closing">Close the day</h2>
            <ol>
              <li>
                Check Sales history for the day and reconcile cash against the payment totals.
              </li>
              <li>Review Stock alerts and raise purchase orders for what sold out.</li>
              <li>Record any expenses paid from the shop till.</li>
              <li>Take a backup if there were unusual changes.</li>
            </ol>

            <div className="callout green">
              <strong>Need training for your staff?</strong> Message{' '}
              <a
                href={whatsappUrl('Hi AnalytIQ, I would like staff training for the app.')}
                target="_blank"
                rel="noreferrer"
              >
                {SUPPORT_WHATSAPP_LABEL} on WhatsApp
              </a>{' '}
              and we will arrange a walkthrough.
            </div>

            <div className="docs-next">
              <a className="btn btn-outline" href="/docs/installation">
                Back to installation
              </a>
              <a className="btn btn-primary" href="/checkout">
                Buy a licence
              </a>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
