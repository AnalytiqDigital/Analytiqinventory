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
    if (typeof state === 'string' && typeof lga === 'string' && lga.length > 0 && !isValidLga(state, lga)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['lga'], message: 'That LGA is not in the selected state' });
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
