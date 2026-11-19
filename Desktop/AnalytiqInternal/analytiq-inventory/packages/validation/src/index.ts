import { z } from 'zod';
import { NIGERIA_STATES, isValidLga } from './nigeria';

export { NIGERIA_STATES, NIGERIA_LGAS, lgasForState, isValidLga } from './nigeria';
export type { NigeriaState } from './nigeria';

export const uuidSchema = z.string().uuid();
export const koboAmountSchema = z.number().int().nonnegative();
export const currencySchema = z.string().length(3).default('NGN');

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export type Pagination = z.infer<typeof paginationSchema>;

// --- Batch 3: first-run setup + login -------------------------------------

export const businessTypeSchema = z.enum([
  'retail',
  'supermarket',
  'restaurant',
  'pharmacy',
  'wholesale',
  'services',
  'other',
]);

export const phoneSchema = z
  .string()
  .trim()
  .min(1, 'Phone number is required')
  .max(20, 'Phone number is too long')
  .regex(/^[0-9+\-\s()]+$/, 'Phone number contains invalid characters');

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password is too long')
  .regex(/[A-Za-z]/, 'Password must contain at least one letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

const stateSchema = z.enum(NIGERIA_STATES, { errorMap: () => ({ message: 'Select a state' }) });

const lgaSchema = z.string().trim().min(1, 'Select a local government area').max(100);

function withLgaCheck<T extends z.ZodRawShape>(shape: T) {
  return z.object(shape).superRefine((val, ctx) => {
    const rec = val as Record<string, unknown>;
    const state = rec.state as string | undefined;
    const lga = rec.lga as string | undefined;
    if (
      typeof state === 'string' &&
      typeof lga === 'string' &&
      lga.length > 0 &&
      !isValidLga(state, lga)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lga'],
        message: 'That LGA is not in the selected state',
      });
    }
  });
}

export const setupSchema = z.object({
  business: withLgaCheck({
    name: z.string().trim().min(2, 'Business name is required').max(120),
    type: businessTypeSchema,
    address: z.string().trim().max(500).default(''),
    state: stateSchema,
    lga: lgaSchema,
    phone: phoneSchema,
    email: z.string().trim().email('Enter a valid email address').max(254),
    currency: z
      .string()
      .trim()
      .length(3, 'Currency must be a 3-letter code')
      .transform((s) => s.toUpperCase())
      .default('NGN'),
    taxLabel: z.string().trim().min(1).max(20).default('VAT'),
    taxRateBps: z.coerce.number().int().min(0).max(10000).default(750),
  }),
  location: withLgaCheck({
    name: z.string().trim().min(2, 'Location name is required').max(120),
    address: z.string().trim().max(500).default(''),
    state: stateSchema,
    lga: lgaSchema,
  }),
  admin: z.object({
    name: z.string().trim().min(2, 'Administrator name is required').max(120),
    email: z.string().trim().email('Enter a valid email address').max(254),
    password: passwordSchema,
  }),
});

export type SetupInput = z.infer<typeof setupSchema>;

export const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address').max(254),
  password: z.string().min(1, 'Password is required').max(128),
});

export type LoginInput = z.infer<typeof loginSchema>;

// --- Batch 4: products + inventory ledger -----------------------------------

const MAX_KOBO = 999_999_999_999;

function nullableCode(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v == null || v === '' ? null : v));
}

export const categorySchema = z.object({
  name: z.string().trim().min(2, 'Category name is required').max(120),
  description: z.string().trim().max(500).default(''),
});

export type CategoryInput = z.infer<typeof categorySchema>;

export const productSchema = z.object({
  name: z.string().trim().min(2, 'Product name is required').max(200),
  sku: nullableCode(64),
  barcode: nullableCode(64),
  categoryId: z.string().trim().min(1).nullish(),
  unit: z.string().trim().min(1, 'Unit is required').max(20).default('pcs'),
  costPriceKobo: koboAmountSchema.max(MAX_KOBO).default(0),
  sellingPriceKobo: koboAmountSchema.max(MAX_KOBO).default(0),
  reorderLevel: z.coerce.number().int().min(0).max(1_000_000_000).default(0),
  openingStock: z.coerce.number().int().min(0).max(1_000_000_000).default(0),
  // Holds either a short path or an inline data: URL of a downscaled photo
  // (renderer caps the source at 8 MB, and the stored JPEG is far smaller), so no
  // character cap is applied — SQLite TEXT is unbounded and this stays offline.
  imagePath: z.string().trim().max(4_000_000).default(''),
  taxCategoryId: z.string().trim().min(1).nullish(),
});

export type ProductInput = z.infer<typeof productSchema>;

export const productUpdateSchema = productSchema.omit({ openingStock: true }).partial();

export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;

export const stockAdjustSchema = z.object({
  productId: z.string().trim().min(1, 'Product is required'),
  locationId: z.string().trim().min(1).nullish(),
  quantityDelta: z.coerce
    .number()
    .int()
    .min(-1_000_000_000)
    .max(1_000_000_000)
    .refine((n) => n !== 0, 'Quantity change cannot be zero'),
  reason: z.string().trim().min(3, 'Give a reason (min 3 characters)').max(500),
});

export type StockAdjustInput = z.infer<typeof stockAdjustSchema>;

export const stockCountSchema = z.object({
  productId: z.string().trim().min(1, 'Product is required'),
  locationId: z.string().trim().min(1).nullish(),
  countedQty: z.coerce.number().int().min(0).max(1_000_000_000),
  reason: z.string().trim().max(500).default(''),
});

export type StockCountInput = z.infer<typeof stockCountSchema>;

export const productListQuerySchema = z.object({
  search: z.string().trim().max(200).default(''),
  categoryId: z.string().trim().min(1).nullish(),
  includeInactive: z.coerce.boolean().default(false),
  locationId: z.string().trim().min(1).nullish(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export type ProductListQuery = z.infer<typeof productListQuerySchema>;

export const levelsQuerySchema = z.object({
  locationId: z.string().trim().min(1).nullish(),
  search: z.string().trim().max(200).default(''),
  lowOnly: z.coerce.boolean().default(false),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export type LevelsQuery = z.infer<typeof levelsQuerySchema>;

export const movementsQuerySchema = z.object({
  productId: z.string().trim().min(1).nullish(),
  locationId: z.string().trim().min(1).nullish(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export type MovementsQuery = z.infer<typeof movementsQuerySchema>;

// --- Batch 5: POS + cash register --------------------------------------------

export const PAYMENT_METHODS = ['cash', 'transfer', 'pos', 'credit'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const saleItemInputSchema = z.object({
  productId: z.string().trim().min(1, 'Product is required'),
  qty: z.coerce.number().int().min(1, 'Quantity must be at least 1').max(1_000_000),
  unitPriceKobo: koboAmountSchema.max(MAX_KOBO).nullish(),
  lineDiscountKobo: koboAmountSchema.max(MAX_KOBO).default(0),
});

export type SaleItemInput = z.infer<typeof saleItemInputSchema>;

export const salePaymentInputSchema = z.object({
  method: z.enum(PAYMENT_METHODS),
  amountKobo: koboAmountSchema.max(MAX_KOBO).refine((n) => n > 0, 'Amount must be positive'),
  reference: z.string().trim().max(200).default(''),
});

export type SalePaymentInput = z.infer<typeof salePaymentInputSchema>;

export const saleCreateSchema = z.object({
  locationId: z.string().trim().min(1).nullish(),
  items: z.array(saleItemInputSchema).min(1, 'Add at least one item').max(500),
  headerDiscountKobo: koboAmountSchema.max(MAX_KOBO).default(0),
  taxKobo: koboAmountSchema.max(MAX_KOBO).nullish(),
  payments: z.array(salePaymentInputSchema).min(1, 'Add at least one payment').max(10),
  tableId: z.string().trim().min(1).nullish(),
  customerId: z.string().trim().min(1).nullish(),
  /**
   * Backdating hook used by the CSV importer; defaults to now. The receipt
   * number and the stock rows are stamped with the same instant.
   */
  soldAt: z
    .string()
    .trim()
    .datetime({ offset: true, message: 'Sale date must be an ISO date/time' })
    .nullish(),
  /** Source reference for imported sales (idempotency key). */
  externalRef: z.string().trim().max(60).nullish(),
});

export type SaleCreateInput = z.infer<typeof saleCreateSchema>;

export const saleRefundSchema = z.object({
  reason: z.string().trim().min(3, 'Give a reason (min 3 characters)').max(500),
});

export type SaleRefundInput = z.infer<typeof saleRefundSchema>;

export const salesQuerySchema = z.object({
  locationId: z.string().trim().min(1).nullish(),
  status: z.enum(['completed', 'refunded', 'voided']).nullish(),
  search: z.string().trim().max(200).default(''),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export type SalesQuery = z.infer<typeof salesQuerySchema>;

// --- Restaurant pack: tax categories, dining tables, product images -----------

export const taxCategorySchema = z.object({
  name: z.string().trim().min(1, 'Tax category name is required').max(60),
  rateBps: z.coerce.number().int().min(0).max(10000),
  isDefault: z.coerce.boolean().default(false),
});

export type TaxCategoryInput = z.infer<typeof taxCategorySchema>;

export const taxCategoryUpdateSchema = taxCategorySchema.partial();

export type TaxCategoryUpdateInput = z.infer<typeof taxCategoryUpdateSchema>;

export const TABLE_STATUSES = ['free', 'occupied'] as const;
export type TableStatus = (typeof TABLE_STATUSES)[number];

export const tableSchema = z.object({
  locationId: z.string().trim().min(1).nullish(),
  name: z.string().trim().min(1, 'Table name is required').max(20),
  seats: z.coerce.number().int().min(1).max(50).default(4),
  note: z.string().trim().max(500).default(''),
});

export type TableInput = z.infer<typeof tableSchema>;

export const tableUpdateSchema = tableSchema.partial();

export type TableUpdateInput = z.infer<typeof tableUpdateSchema>;

export const tableStatusSchema = z.object({
  status: z.enum(TABLE_STATUSES),
  note: z.string().trim().max(500).default(''),
});

export type TableStatusInput = z.infer<typeof tableStatusSchema>;

export const tablesQuerySchema = z.object({
  locationId: z.string().trim().min(1).nullish(),
  status: z.enum(TABLE_STATUSES).nullish(),
});

export type TablesQuery = z.infer<typeof tablesQuerySchema>;

// --- Business-type module gating -----------------------------------------
// One engine, per-vertical presets. Every business gets the core modules; the
// type only decides which optional ones appear by default.

export type BusinessType = z.infer<typeof businessTypeSchema>;

/** Core modules every business needs, regardless of type. */
export const CORE_MODULES = ['pos', 'products', 'inventory', 'reports'] as const;

/** Optional modules that a business type can switch on. */
export const OPTIONAL_MODULES = [
  'tables',
  'taxCategories',
  'purchases',
  'suppliers',
  'customers',
  'finance',
] as const;

export type OptionalModule = (typeof OPTIONAL_MODULES)[number];
export type AppModule = (typeof CORE_MODULES)[number] | OptionalModule;

/** What `businesses.type` grants out of the box. */
const DEFAULT_MODULES: Record<BusinessType, OptionalModule[]> = {
  retail: ['taxCategories', 'purchases', 'suppliers', 'customers', 'finance'],
  supermarket: ['taxCategories', 'purchases', 'suppliers', 'customers', 'finance'],
  wholesale: ['taxCategories', 'purchases', 'suppliers', 'customers', 'finance'],
  restaurant: ['tables', 'taxCategories', 'purchases', 'suppliers', 'customers', 'finance'],
  pharmacy: ['taxCategories', 'purchases', 'suppliers', 'customers', 'finance'],
  services: ['taxCategories', 'purchases', 'customers', 'finance'],
  other: ['taxCategories', 'purchases', 'suppliers', 'customers', 'finance'],
};

/**
 * Resolve the modules a business has.
 * `overrides` are per-business switches stored in settings; an entry set to
 * `false` turns a default module off, `true` turns a non-default one on.
 */
export function resolveModules(
  type: string,
  overrides: Partial<Record<string, boolean>> = {}
): Set<AppModule> {
  const defaults = DEFAULT_MODULES[type as BusinessType] ?? DEFAULT_MODULES.other;
  const active = new Set<string>([...CORE_MODULES, ...defaults]);
  for (const [key, on] of Object.entries(overrides)) {
    if (on === true) active.add(key);
    if (on === false) active.delete(key);
  }
  return active as Set<AppModule>;
}

/** Does this business type use the restaurant pack (tables, etc.)? */
export function isRestaurant(type: string): boolean {
  return type === 'restaurant';
}

// --- Batch 6: customers, suppliers, purchasing ------------------------------

const optionalEmail = z
  .string()
  .trim()
  .max(254)
  .default('')
  .refine((v) => v === '' || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'Enter a valid email address');

const optionalPhone = z
  .string()
  .trim()
  .max(20)
  .default('')
  .refine((v) => v === '' || /^[0-9+\-\s()]+$/.test(v), 'Phone number contains invalid characters');

export const customerSchema = z.object({
  name: z.string().trim().min(1, 'Customer name is required').max(120),
  phone: optionalPhone,
  email: optionalEmail,
  address: z.string().trim().max(500).default(''),
  note: z.string().trim().max(500).default(''),
  creditLimitKobo: z.number().int().min(0).max(1_000_000_000_00).default(0),
});

export type CustomerInput = z.infer<typeof customerSchema>;

export const customerUpdateSchema = customerSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export type CustomerUpdateInput = z.infer<typeof customerUpdateSchema>;

export const customersQuerySchema = z.object({
  search: z.string().trim().max(120).default(''),
  includeInactive: z.boolean().default(false),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});

export type CustomersQuery = z.infer<typeof customersQuerySchema>;

export const supplierSchema = z.object({
  name: z.string().trim().min(1, 'Supplier name is required').max(120),
  contactName: z.string().trim().max(120).default(''),
  phone: optionalPhone,
  email: optionalEmail,
  address: z.string().trim().max(500).default(''),
  note: z.string().trim().max(500).default(''),
});

export type SupplierInput = z.infer<typeof supplierSchema>;

export const supplierUpdateSchema = supplierSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export type SupplierUpdateInput = z.infer<typeof supplierUpdateSchema>;

export const suppliersQuerySchema = z.object({
  search: z.string().trim().max(120).default(''),
  includeInactive: z.boolean().default(false),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});

export type SuppliersQuery = z.infer<typeof suppliersQuerySchema>;

export const PURCHASE_STATUSES = ['draft', 'received', 'cancelled'] as const;

export const purchaseItemSchema = z.object({
  productId: z.string().trim().min(1),
  qty: z.number().int().min(1, 'Quantity must be at least 1').max(1_000_000),
  unitCostKobo: z.number().int().min(0).max(1_000_000_000_00),
});

export type PurchaseItemInput = z.infer<typeof purchaseItemSchema>;

export const purchaseCreateSchema = z.object({
  supplierId: z.string().trim().min(1).nullish(),
  locationId: z.string().trim().min(1).nullish(),
  reference: z.string().trim().max(60).default(''),
  note: z.string().trim().max(500).default(''),
  taxKobo: z.number().int().min(0).max(1_000_000_000_00).default(0),
  amountPaidKobo: z.number().int().min(0).max(1_000_000_000_00).default(0),
  items: z.array(purchaseItemSchema).min(1, 'Add at least one item'),
});

export type PurchaseCreateInput = z.infer<typeof purchaseCreateSchema>;

export const purchasesQuerySchema = z.object({
  status: z.enum(PURCHASE_STATUSES).nullish(),
  supplierId: z.string().trim().min(1).nullish(),
  search: z.string().trim().max(120).default(''),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});

export type PurchasesQuery = z.infer<typeof purchasesQuerySchema>;

export const customerPaymentSchema = z.object({
  customerId: z.string().trim().min(1),
  saleId: z.string().trim().min(1).nullish(),
  amountKobo: z.number().int().min(1, 'Amount must be greater than zero').max(1_000_000_000_00),
  method: z.enum(['cash', 'transfer', 'pos']).default('cash'),
  reference: z.string().trim().max(120).default(''),
});

export type CustomerPaymentInput = z.infer<typeof customerPaymentSchema>;

// --- Batch 9: reporting + BI ------------------------------------------------

export const REPORT_PRESETS = ['today', '7d', '30d', 'month', 'year', 'custom'] as const;
export type ReportPreset = (typeof REPORT_PRESETS)[number];

export const reportQuerySchema = z.object({
  /** Inclusive lower bound. Defaults to the start of the current month. */
  from: z.coerce.date().optional(),
  /** Inclusive upper bound. Defaults to now. */
  to: z.coerce.date().optional(),
  locationId: z.string().trim().min(1).nullish(),
  topLimit: z.coerce.number().int().min(1).max(50).default(10),
});

export type ReportQuery = z.infer<typeof reportQuerySchema>;

// --- Batch 12: backup and restore ------------------------------------------

/** Backup file names are generated by the app; accept only that shape so a
 *  restore can never read an arbitrary path (no traversal, no other files). */
export const BACKUP_NAME_PATTERN = /^(?:analytiq-backup|pre-restore)-\d{8}-\d{9}\.db$/;

export const backupNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(BACKUP_NAME_PATTERN, 'Invalid backup file name');

export type BackupName = z.infer<typeof backupNameSchema>;

// --- Batch 8: locations, multi-branch and cloud sync ------------------------

export const locationSchema = withLgaCheck({
  name: z.string().trim().min(2, 'Location name is required').max(120),
  address: z.string().trim().max(500).default(''),
  state: stateSchema.or(z.literal('')).default(''),
  lga: z.string().trim().max(100).default(''),
});

export type LocationInput = z.infer<typeof locationSchema>;

export const locationUpdateSchema = z.object({
  name: z.string().trim().min(2, 'Location name is required').max(120).optional(),
  address: z.string().trim().max(500).optional(),
  isDefault: z.boolean().optional(),
});

export type LocationUpdateInput = z.infer<typeof locationUpdateSchema>;

export const syncConfigSchema = z.object({
  url: z
    .string()
    .trim()
    .max(300)
    .refine((value) => value === '' || /^https?:\/\//i.test(value), 'Use an http(s) URL'),
  key: z.string().trim().max(200),
  enabled: z.boolean(),
});

export type SyncConfigInput = z.infer<typeof syncConfigSchema>;

// --- Batch 11: AI + WhatsApp automation ------------------------------------

const httpUrlOrEmpty = z
  .string()
  .trim()
  .max(300)
  .refine((value) => value === '' || /^https?:\/\//i.test(value), 'Use an http(s) URL');

export const automationSettingsSchema = z.object({
  whatsappEnabled: z.boolean(),
  whatsappPhoneId: z.string().trim().max(64).default(''),
  whatsappToken: z.string().trim().max(600).default(''),
  whatsappTo: z.string().trim().max(32).default(''),
  whatsappTemplate: z
    .string()
    .trim()
    .max(64)
    .regex(/^[a-z0-9_]*$/i, 'Template names use letters, digits and underscores')
    .default(''),
  whatsappLang: z.string().trim().min(2).max(8).default('en'),
  aiEnabled: z.boolean(),
  aiBaseUrl: httpUrlOrEmpty.default(''),
  aiApiKey: z.string().trim().max(600).default(''),
  aiModel: z.string().trim().max(80).default('gpt-4o-mini'),
  lowStockEnabled: z.boolean(),
  dailySummaryEnabled: z.boolean(),
  dailySummaryHour: z.number().int().min(0, 'Pick an hour').max(23, 'Pick an hour'),
});

export type AutomationSettingsInput = z.infer<typeof automationSettingsSchema>;

export const automationTestSchema = z.object({
  body: z.string().trim().min(1, 'Write a message first').max(1000),
});

export type AutomationTestInput = z.infer<typeof automationTestSchema>;

// --- Bulk import (CSV) -------------------------------------------------------
// Row shapes for the importer. The renderer parses CSV text into these rows
// (naira -> kobo happens there) and the service re-validates every row before
// writing, so a hand-rolled REST call cannot bypass the rules.

const importText = (max: number) => z.string().trim().max(max).default('');
const importCode = z.string().trim().max(64).default('');
const importKobo = z.number().int().min(0).max(MAX_KOBO);
const importQty = z.number().int().min(1).max(1_000_000);

export const productImportRowSchema = z.object({
  name: z.string().trim().min(2, 'Product name is required').max(200),
  sku: importCode,
  barcode: importCode,
  category: importText(120),
  unit: z.string().trim().max(20).default('pcs'),
  costPriceKobo: importKobo.default(0),
  sellingPriceKobo: importKobo.default(0),
  reorderLevel: z.number().int().min(0).max(1_000_000_000).default(0),
  openingStock: z.number().int().min(0).max(1_000_000_000).default(0),
  taxCategory: importText(120),
});

export const productsImportSchema = z.object({
  rows: z
    .array(productImportRowSchema)
    .min(1, 'Nothing to import')
    .max(5000, 'Import 5000 rows at a time at most'),
});

export type ProductImportRow = z.infer<typeof productImportRowSchema>;
export type ProductsImportInput = z.infer<typeof productsImportSchema>;

export const purchaseImportRowSchema = z.object({
  reference: z.string().trim().min(1, 'Give each purchase a reference').max(60),
  supplier: z.string().trim().min(1, 'Supplier is required').max(120),
  supplierPhone: importText(20),
  date: importText(40),
  sku: z.string().trim().min(1, 'SKU or barcode is required').max(64),
  qty: importQty,
  unitCostKobo: importKobo,
  taxKobo: importKobo.default(0),
  note: importText(500),
  received: z.boolean().default(false),
});

export const purchasesImportSchema = z.object({
  rows: z
    .array(purchaseImportRowSchema)
    .min(1, 'Nothing to import')
    .max(5000, 'Import 5000 rows at a time at most'),
});

export type PurchaseImportRow = z.infer<typeof purchaseImportRowSchema>;
export type PurchasesImportInput = z.infer<typeof purchasesImportSchema>;

export const saleImportRowSchema = z.object({
  receipt: z.string().trim().min(1, 'Give each sale a reference').max(60),
  date: importText(40),
  sku: z.string().trim().min(1, 'SKU or barcode is required').max(64),
  qty: importQty,
  unitPriceKobo: importKobo,
  lineDiscountKobo: importKobo.default(0),
  tender: z.enum(PAYMENT_METHODS).default('cash'),
  customer: importText(120),
  taxKobo: importKobo.nullish(),
});

export const salesImportSchema = z.object({
  rows: z
    .array(saleImportRowSchema)
    .min(1, 'Nothing to import')
    .max(5000, 'Import 5000 rows at a time at most'),
});

export type SaleImportRow = z.infer<typeof saleImportRowSchema>;
export type SalesImportInput = z.infer<typeof salesImportSchema>;

/** Downloadable CSV templates, kept next to the schemas they must match. */
export const importTemplates = {
  products: [
    'name,sku,barcode,category,unit,cost_price,selling_price,reorder_level,opening_stock,tax_category',
    'Indomie 70g,IND-70,6151100012345,Noodles,pcs,320.00,450.00,10,100,',
  ],
  purchases: [
    'reference,supplier,supplier_phone,date,sku,qty,unit_cost,tax,note,received',
    'PUR-1001,Peak Foods,+2348012345678,2026-11-01,IND-70,240,300.00,0,November restock,yes',
  ],
  sales: [
    'receipt,date,sku,qty,unit_price,line_discount,tender,customer,tax',
    'INV-0001,2026-11-02,IND-70,2,450.00,0,cash,,0',
  ],
} as const;

export type ImportKind = keyof typeof importTemplates;

// --- Commercial plans ------------------------------------------------------
// Shared by the sales website (display) and the cloud API (what is charged), so
// the price on the page and the price at Paystack can never disagree. Amounts
// are kobo, matching the rest of the monorepo. `days` drives the issued key's
// expiry; re-purchasing later extends from the issue date, not the old expiry.

export const licensePlans = [
  {
    id: 'starter',
    name: 'Starter',
    tagline: 'For a single shop getting organised.',
    priceKobo: 2_500_000,
    days: 365,
    features: [
      '1 till and 1 location',
      'Up to 5 staff accounts',
      'Inventory, POS, receipts and reports',
      'Daily automatic backups',
    ],
  },
  {
    id: 'standard',
    name: 'Standard',
    tagline: 'For growing shops with more than one till.',
    priceKobo: 4_500_000,
    days: 365,
    features: [
      '3 tills and 2 locations',
      'Up to 15 staff accounts',
      'Everything in Starter',
      'WhatsApp low-stock alerts and daily summary',
      'Customer credit and supplier purchasing',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'For multi-branch businesses.',
    priceKobo: 8_500_000,
    days: 365,
    features: [
      'Unlimited tills and locations',
      'Unlimited staff accounts',
      'Everything in Standard',
      'Branch sync and a central stock ledger',
      'Priority support',
    ],
  },
] as const;

export type LicensePlan = (typeof licensePlans)[number];
export type LicensePlanId = LicensePlan['id'];

export const licensePlanIds = ['starter', 'standard', 'pro'] as const;

export function findLicensePlan(id: string): LicensePlan | undefined {
  return licensePlans.find((plan) => plan.id === id);
}

export const checkoutSchema = z.object({
  plan: z.enum(licensePlanIds),
  business: z.string().trim().min(2, 'Enter the business name').max(120),
  name: z.string().trim().max(120).default(''),
  email: z.string().trim().toLowerCase().email('Enter a valid email').max(200),
  phone: z.string().trim().max(32).default(''),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;
