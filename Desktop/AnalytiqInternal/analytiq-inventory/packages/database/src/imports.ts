// Batch 13: bulk import (CSV) — products, purchases and sales.
//
// CONTRACT: the renderer parses CSV text into typed rows (naira -> kobo) and
// POSTs them here. Every row is re-validated by the shared Zod schemas. An
// import never half-writes a set of rows it could have rejected up front:
// products and purchases are validated as a whole and then written inside one
// transaction. Historical sales go through `createSale` row-group by row-group
// (each group is already atomic), so a bad group is reported without losing
// the rest.

import {
  importTemplates,
  productsImportSchema,
  purchasesImportSchema,
  salesImportSchema,
  type PaymentMethod,
  type PurchaseImportRow,
  type SaleImportRow,
} from '@analytiq/validation';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { newId } from './auth';
import type { LocalDb } from './connection';
import { requirePermission } from './permissions';
import { writeAuditSync } from './service';
import { createSale } from './sales';
import {
  categories,
  customers,
  products,
  purchaseItems,
  purchases,
  sales,
  stockMovements,
  suppliers,
  taxCategories,
} from './schema';

export interface ImportIssue {
  /** 1-based row number in the uploaded file (header counts as row 1). */
  row: number;
  message: string;
  code?: string;
}

export interface ImportResult {
  created: number;
  failed: number;
  errors: ImportIssue[];
}

function codedError(message: string, code: string): Error {
  const err = new Error(message);
  (err as NodeJS.ErrnoException).code = code;
  return err;
}

function keyOf(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Accepts ISO datetimes (`2026-11-03T14:05:00+01:00`), plain dates
 * (`2026-11-03`), `2026-11-03 14:05` and `03/11/2026 [14:05]`. Returns null
 * when the text is not a real date. Date-only values land at noon local time
 * so a report grouped by day cannot drift across a DST boundary.
 */
export function parseImportDate(input: string): Date | null {
  const s = input.trim();
  if (!s) return null;
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2}))?$/.exec(s);
  if (dmy) {
    const [, d, m, y, hh, mm] = dmy;
    const date = new Date(
      Number(y),
      Number(m) - 1,
      Number(d),
      hh === undefined ? 12 : Number(hh),
      mm === undefined ? 0 : Number(mm)
    );
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const iso =
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(s);
  if (!iso) return null;
  const [, y, m, d, hh, mm, ss, zone] = iso;
  if (hh === undefined) {
    const date = new Date(Number(y), Number(m) - 1, Number(d), 12, 0, 0);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const stamp = `${y}-${m}-${d}T${hh}:${mm}:${ss ?? '00'}${zone ?? ''}`;
  const date = new Date(stamp);
  return Number.isNaN(date.getTime()) ? null : date;
}

function iso(d: Date): string {
  return d.toISOString();
}

// --- products ----------------------------------------------------------------

export async function importProducts(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  raw: unknown
): Promise<ImportResult> {
  requirePermission(new Set(grants), 'products.manage');
  const input = productsImportSchema.parse(raw);
  const rows = input.rows;
  const issues: ImportIssue[] = [];

  const existingCats = await local.db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(eq(categories.businessId, businessId));
  const catByName = new Map(existingCats.map((c) => [keyOf(c.name), c.id]));

  const taxCats = await local.db
    .select({ id: taxCategories.id, name: taxCategories.name })
    .from(taxCategories)
    .where(eq(taxCategories.businessId, businessId));
  const taxByName = new Map(taxCats.map((t) => [keyOf(t.name), t.id]));

  const existingProducts = await local.db
    .select({ sku: products.sku, barcode: products.barcode })
    .from(products)
    .where(eq(products.businessId, businessId));
  const usedSku = new Set(existingProducts.filter((p) => p.sku).map((p) => p.sku as string));
  const usedBarcode = new Set(
    existingProducts.filter((p) => p.barcode).map((p) => p.barcode as string)
  );

  const seenSku = new Map<string, number>();
  const seenBarcode = new Map<string, number>();

  rows.forEach((row, index) => {
    const line = index + 2;
    const sku = row.sku.trim();
    const barcode = row.barcode.trim();
    if (sku) {
      if (usedSku.has(sku))
        issues.push({ row: line, code: 'SKU_EXISTS', message: `SKU "${sku}" already exists` });
      if (seenSku.has(sku)) {
        issues.push({
          row: line,
          code: 'SKU_DUPLICATE',
          message: `SKU "${sku}" repeats row ${seenSku.get(sku)}`,
        });
      } else {
        seenSku.set(sku, line);
      }
    }
    if (barcode) {
      if (usedBarcode.has(barcode)) {
        issues.push({
          row: line,
          code: 'BARCODE_EXISTS',
          message: `Barcode "${barcode}" already exists`,
        });
      }
      if (seenBarcode.has(barcode)) {
        issues.push({
          row: line,
          code: 'BARCODE_DUPLICATE',
          message: `Barcode "${barcode}" repeats row ${seenBarcode.get(barcode)}`,
        });
      } else {
        seenBarcode.set(barcode, line);
      }
    }
    if (row.taxCategory && !taxByName.has(keyOf(row.taxCategory))) {
      issues.push({
        row: line,
        code: 'TAX_CATEGORY_NOT_FOUND',
        message: `Tax category "${row.taxCategory}" does not exist — create it first`,
      });
    }
  });

  if (issues.length > 0) return { created: 0, failed: issues.length, errors: issues };

  const locationRow = local.raw
    .prepare(
      'SELECT id FROM locations WHERE business_id = ? ORDER BY is_default DESC, name LIMIT 1'
    )
    .get(businessId) as { id: string } | undefined;
  if (!locationRow) throw codedError('No location set up for this business', 'NO_LOCATION');
  const locationId = locationRow.id;

  const timestamp = new Date();
  const write = local.raw.transaction(() => {
    for (const row of rows) {
      const categoryName = row.category.trim();
      let categoryId: string | null = null;
      if (categoryName) {
        const key = keyOf(categoryName);
        const existing = catByName.get(key);
        if (existing) {
          categoryId = existing;
        } else {
          categoryId = newId('cat');
          local.db
            .insert(categories)
            .values({
              id: categoryId,
              businessId,
              name: categoryName,
              description: '',
              version: 1,
              createdAt: timestamp,
              updatedAt: timestamp,
            })
            .run();
          catByName.set(key, categoryId);
        }
      }

      const productId = newId('prd');
      local.db
        .insert(products)
        .values({
          id: productId,
          businessId,
          name: row.name.trim(),
          sku: row.sku.trim() || null,
          barcode: row.barcode.trim() || null,
          categoryId,
          unit: row.unit.trim() || 'pcs',
          costPriceKobo: row.costPriceKobo,
          sellingPriceKobo: row.sellingPriceKobo,
          reorderLevel: row.reorderLevel,
          imagePath: '',
          taxCategoryId: row.taxCategory ? (taxByName.get(keyOf(row.taxCategory)) ?? null) : null,
          isActive: 1,
          version: 1,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .run();

      if (row.openingStock > 0) {
        local.db
          .insert(stockMovements)
          .values({
            id: newId('mov'),
            businessId,
            productId,
            locationId,
            kind: 'opening',
            qtyDelta: row.openingStock,
            qtyAfter: row.openingStock,
            reason: 'Opening stock (import)',
            userId,
            version: 1,
            createdAt: timestamp,
          })
          .run();
      }
    }
    writeAuditSync(local, {
      businessId,
      userId,
      action: 'product.import',
      entity: 'product',
      details: { rows: rows.length },
    });
  });
  write();

  return { created: rows.length, failed: 0, errors: [] };
}

// --- purchases ----------------------------------------------------------------

interface PurchaseGroup {
  reference: string;
  rows: Array<{ row: number; line: PurchaseImportRow }>;
}

export async function importPurchases(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  raw: unknown
): Promise<ImportResult> {
  requirePermission(new Set(grants), 'purchases.manage');
  const input = purchasesImportSchema.parse(raw);
  const issues: ImportIssue[] = [];

  const groups = new Map<string, PurchaseGroup>();
  input.rows.forEach((line, index) => {
    const reference = line.reference.trim();
    const group = groups.get(reference) ?? { reference, rows: [] };
    group.rows.push({ row: index + 2, line });
    groups.set(reference, group);
  });

  const refs = [...groups.keys()];
  const existingRefs = refs.length
    ? await local.db
        .select({ reference: purchases.reference })
        .from(purchases)
        .where(and(eq(purchases.businessId, businessId), inArray(purchases.reference, refs)))
    : [];
  const takenRefs = new Set(existingRefs.map((r) => r.reference));

  const supplierRows = await local.db
    .select({ id: suppliers.id, name: suppliers.name })
    .from(suppliers)
    .where(eq(suppliers.businessId, businessId));
  const supplierByName = new Map(supplierRows.map((s) => [keyOf(s.name), s.id]));

  const productRows = await local.db
    .select({ id: products.id, sku: products.sku, barcode: products.barcode })
    .from(products)
    .where(eq(products.businessId, businessId));
  const productByCode = new Map<string, string>();
  for (const p of productRows) {
    if (p.sku) productByCode.set(p.sku, p.id);
    if (p.barcode) productByCode.set(p.barcode, p.id);
  }

  for (const group of groups.values()) {
    if (takenRefs.has(group.reference)) {
      issues.push({
        row: group.rows[0]?.row ?? 2,
        code: 'PURCHASE_REFERENCE_EXISTS',
        message: `Purchase ${group.reference} already exists`,
      });
    }
    for (const { row, line } of group.rows) {
      if (!productByCode.has(line.sku.trim())) {
        issues.push({
          row,
          code: 'PRODUCT_NOT_FOUND',
          message: `No product with SKU or barcode "${line.sku}"`,
        });
      }
    }
  }

  if (issues.length > 0) return { created: 0, failed: issues.length, errors: issues };

  const locationRow = local.raw
    .prepare(
      'SELECT id FROM locations WHERE business_id = ? ORDER BY is_default DESC, name LIMIT 1'
    )
    .get(businessId) as { id: string } | undefined;
  if (!locationRow) throw codedError('No location set up for this business', 'NO_LOCATION');
  const locationId = locationRow.id;
  const fallbackDate = new Date();

  const write = local.raw.transaction(() => {
    for (const group of groups.values()) {
      const first = group.rows[0]!.line;
      const supplierName = first.supplier.trim();
      let supplierId = supplierByName.get(keyOf(supplierName)) ?? null;
      if (!supplierId) {
        supplierId = newId('sup');
        local.db
          .insert(suppliers)
          .values({
            id: supplierId,
            businessId,
            name: supplierName,
            phone: first.supplierPhone.trim(),
            isActive: 1,
            version: 1,
            createdAt: fallbackDate,
            updatedAt: fallbackDate,
          })
          .run();
        supplierByName.set(keyOf(supplierName), supplierId);
      }

      const when = parseImportDate(first.date) ?? fallbackDate;
      const lines = group.rows.map(({ line }) => ({
        productId: productByCode.get(line.sku.trim())!,
        qty: line.qty,
        unitCostKobo: line.unitCostKobo,
        lineTotalKobo: line.qty * line.unitCostKobo,
      }));
      const subtotal = lines.reduce((sum, l) => sum + l.lineTotalKobo, 0);
      const taxKobo = group.rows[0]!.line.taxKobo;
      const total = subtotal + taxKobo;
      const received = group.rows[0]!.line.received;
      const purchaseId = newId('pur');

      local.db
        .insert(purchases)
        .values({
          id: purchaseId,
          businessId,
          locationId,
          supplierId,
          reference: group.reference,
          status: received ? 'received' : 'draft',
          subtotalKobo: subtotal,
          taxKobo,
          totalKobo: total,
          amountPaidKobo: received ? total : 0,
          note: first.note.trim(),
          receivedBy: received ? userId : null,
          receivedAt: received ? when : null,
          version: 1,
          createdAt: when,
          updatedAt: when,
        })
        .run();

      for (const line of lines) {
        local.db
          .insert(purchaseItems)
          .values({
            id: newId('pui'),
            purchaseId,
            productId: line.productId,
            qty: line.qty,
            unitCostKobo: line.unitCostKobo,
            lineTotalKobo: line.lineTotalKobo,
          })
          .run();
      }

      if (received) {
        for (const line of lines) {
          const cur = local.raw
            .prepare(
              'SELECT COALESCE(SUM(qty_delta), 0) AS qty FROM stock_movements WHERE business_id = ? AND product_id = ? AND location_id = ?'
            )
            .get(businessId, line.productId, locationId) as { qty: number };
          local.db
            .insert(stockMovements)
            .values({
              id: newId('mov'),
              businessId,
              productId: line.productId,
              locationId,
              kind: 'purchase',
              qtyDelta: line.qty,
              qtyAfter: cur.qty + line.qty,
              reason: `Purchase ${group.reference}`,
              userId,
              version: 1,
              createdAt: when,
            })
            .run();
          local.db
            .update(products)
            .set({ costPriceKobo: line.unitCostKobo, updatedAt: when })
            .where(eq(products.id, line.productId))
            .run();
        }
      }

      writeAuditSync(local, {
        businessId,
        userId,
        action: 'purchase.import',
        entity: 'purchase',
        entityId: purchaseId,
        details: { reference: group.reference, lines: lines.length, received },
      });
    }
  });
  write();

  return { created: groups.size, failed: 0, errors: [] };
}

// --- sales --------------------------------------------------------------------

interface SaleGroup {
  receipt: string;
  rows: Array<{ row: number; line: SaleImportRow }>;
}

export async function importSales(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  raw: unknown
): Promise<ImportResult> {
  requirePermission(new Set(grants), 'sales.create');
  const input = salesImportSchema.parse(raw);
  const issues: ImportIssue[] = [];

  const groups = new Map<string, SaleGroup>();
  input.rows.forEach((line, index) => {
    const receipt = line.receipt.trim();
    const group = groups.get(receipt) ?? { receipt, rows: [] };
    group.rows.push({ row: index + 2, line });
    groups.set(receipt, group);
  });

  const refs = [...groups.keys()];
  const alreadyImported = refs.length
    ? await local.db
        .select({ ref: sales.externalRef })
        .from(sales)
        .where(
          and(
            eq(sales.businessId, businessId),
            inArray(sales.externalRef, refs),
            isNotNull(sales.externalRef)
          )
        )
    : [];
  const takenRefs = new Set(alreadyImported.map((r) => r.ref as string));

  const productRows = await local.db
    .select({
      id: products.id,
      sku: products.sku,
      barcode: products.barcode,
      isActive: products.isActive,
    })
    .from(products)
    .where(eq(products.businessId, businessId));
  const productByCode = new Map<string, { id: string; active: boolean }>();
  for (const p of productRows) {
    if (p.sku) productByCode.set(p.sku, { id: p.id, active: p.isActive === 1 });
    if (p.barcode) productByCode.set(p.barcode, { id: p.id, active: p.isActive === 1 });
  }

  const customerRows = await local.db
    .select({ id: customers.id, name: customers.name })
    .from(customers)
    .where(eq(customers.businessId, businessId));
  const customerByName = new Map(customerRows.map((c) => [keyOf(c.name), c.id]));

  // Pre-compute each group's money so the payment covers the total exactly.
  const prepared: Array<{
    group: SaleGroup;
    soldAt: string | null;
    items: Array<{
      productId: string;
      qty: number;
      unitPriceKobo: number;
      lineDiscountKobo: number;
    }>;
    totalKobo: number;
    tender: PaymentMethod;
    customerName: string;
  }> = [];

  for (const group of groups.values()) {
    if (takenRefs.has(group.receipt)) {
      issues.push({
        row: group.rows[0]?.row ?? 2,
        code: 'SALE_REFERENCE_EXISTS',
        message: `Sale ${group.receipt} has already been imported`,
      });
      continue;
    }
    const first = group.rows[0]!.line;
    const when = first.date.trim() ? parseImportDate(first.date) : null;
    if (first.date.trim() && !when) {
      issues.push({
        row: group.rows[0]!.row,
        code: 'BAD_DATE',
        message: `Cannot read date "${first.date}"`,
      });
      continue;
    }
    let totalKobo = 0;
    const items: Array<{
      productId: string;
      qty: number;
      unitPriceKobo: number;
      lineDiscountKobo: number;
    }> = [];
    for (const { row, line } of group.rows) {
      const product = productByCode.get(line.sku.trim());
      if (!product) {
        issues.push({
          row,
          code: 'PRODUCT_NOT_FOUND',
          message: `No product with SKU or barcode "${line.sku}"`,
        });
        continue;
      }
      if (!product.active) {
        issues.push({
          row,
          code: 'PRODUCT_ARCHIVED',
          message: `Product "${line.sku}" is archived`,
        });
        continue;
      }
      const gross = line.qty * line.unitPriceKobo;
      const discount = Math.min(line.lineDiscountKobo, gross);
      totalKobo += gross - discount;
      items.push({
        productId: product.id,
        qty: line.qty,
        unitPriceKobo: line.unitPriceKobo,
        lineDiscountKobo: discount,
      });
    }
    if (items.length === 0) continue;
    prepared.push({
      group,
      soldAt: when ? iso(when) : null,
      items,
      totalKobo,
      tender: first.tender,
      customerName: first.customer.trim(),
    });
  }

  if (issues.length > 0) return { created: 0, failed: issues.length, errors: issues };

  // Credit rows need a customer with enough headroom. Create missing customers
  // with a limit equal to everything the file puts on their account.
  const creditByName = new Map<string, number>();
  for (const p of prepared) {
    if (p.tender !== 'credit' || !p.customerName) continue;
    creditByName.set(
      keyOf(p.customerName),
      (creditByName.get(keyOf(p.customerName)) ?? 0) + p.totalKobo
    );
  }

  const created: string[] = [];
  for (const p of prepared) {
    const customerKey = keyOf(p.customerName);
    let customerId: string | null = customerKey ? (customerByName.get(customerKey) ?? null) : null;
    if (customerKey && !customerId) {
      customerId = newId('cus');
      const limit = creditByName.get(customerKey) ?? 0;
      const timestamp = new Date();
      local.db
        .insert(customers)
        .values({
          id: customerId,
          businessId,
          name: p.customerName,
          creditLimitKobo: limit,
          isActive: 1,
          version: 1,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .run();
      customerByName.set(customerKey, customerId);
      writeAuditSync(local, {
        businessId,
        userId,
        action: 'customer.import',
        entity: 'customer',
        entityId: customerId,
        details: { name: p.customerName, creditLimitKobo: limit },
      });
    }

    try {
      const result = await createSale(local, businessId, userId, grants, {
        items: p.items,
        payments: [{ method: p.tender, amountKobo: p.totalKobo }],
        taxKobo: 0,
        customerId,
        soldAt: p.soldAt,
        externalRef: p.group.receipt,
      });
      created.push(result.receiptNo);
    } catch (err) {
      const coded = err as NodeJS.ErrnoException;
      issues.push({
        row: p.group.rows[0]?.row ?? 2,
        code: typeof coded.code === 'string' ? coded.code : 'IMPORT_FAILED',
        message: `Sale ${p.group.receipt}: ${(err as Error).message}`,
      });
    }
  }

  if (created.length > 0) {
    writeAuditSync(local, {
      businessId,
      userId,
      action: 'sale.import',
      entity: 'sale',
      details: { sales: created.length, failed: issues.length },
    });
  }

  return { created: created.length, failed: issues.length, errors: issues };
}

export const IMPORT_TEMPLATES = importTemplates;

export type ImportKind = keyof typeof IMPORT_TEMPLATES;
