import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

// Batch 3 entities. Conventions: UUID text PKs, business_id / location_id
// scoping, created_at / updated_at timestamps, version for syncable rows.

function timestamps() {
  return {
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  };
}

export const businesses = sqliteTable('businesses', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  address: text('address').notNull().default(''),
  phone: text('phone').notNull(),
  email: text('email').notNull(),
  state: text('state').notNull().default(''),
  lga: text('lga').notNull().default(''),
  currency: text('currency').notNull().default('NGN'),
  taxLabel: text('tax_label').notNull().default('VAT'),
  taxRateBps: integer('tax_rate_bps').notNull().default(750),
  version: integer('version').notNull().default(1),
  ...timestamps(),
});

export type Business = typeof businesses.$inferSelect;

export const locations = sqliteTable('locations', {
  id: text('id').primaryKey(),
  businessId: text('business_id')
    .notNull()
    .references(() => businesses.id),
  name: text('name').notNull(),
  address: text('address').notNull().default(''),
  state: text('state').notNull().default(''),
  lga: text('lga').notNull().default(''),
  isDefault: integer('is_default').notNull().default(0),
  version: integer('version').notNull().default(1),
  ...timestamps(),
});

export type Location = typeof locations.$inferSelect;

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id')
      .notNull()
      .references(() => businesses.id),
    name: text('name').notNull(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    isActive: integer('is_active').notNull().default(1),
    failedAttempts: integer('failed_attempts').notNull().default(0),
    lockedUntil: integer('locked_until', { mode: 'timestamp' }),
    version: integer('version').notNull().default(1),
    ...timestamps(),
  },
  (t) => ({
    usersBusinessEmailUnique: uniqueIndex('users_business_email_unique').on(t.businessId, t.email),
  }),
);

export type User = typeof users.$inferSelect;

export const roles = sqliteTable('roles', {
  id: text('id').primaryKey(),
  businessId: text('business_id')
    .notNull()
    .references(() => businesses.id),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  isSystem: integer('is_system').notNull().default(0),
  ...timestamps(),
});

export type Role = typeof roles.$inferSelect;

export const permissions = sqliteTable('permissions', {
  key: text('key').primaryKey(),
  description: text('description').notNull().default(''),
});

export type Permission = typeof permissions.$inferSelect;

export const rolePermissions = sqliteTable('role_permissions', {
  roleId: text('role_id')
    .notNull()
    .references(() => roles.id),
  permissionKey: text('permission_key')
    .notNull()
    .references(() => permissions.key),
});

export const userRoles = sqliteTable('user_roles', {
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  roleId: text('role_id')
    .notNull()
    .references(() => roles.id),
  businessId: text('business_id')
    .notNull()
    .references(() => businesses.id),
});

export const devices = sqliteTable('devices', {
  id: text('id').primaryKey(),
  businessId: text('business_id')
    .notNull()
    .references(() => businesses.id),
  name: text('name').notNull(),
  platform: text('platform').notNull().default('windows'),
  appVersion: text('app_version').notNull().default(''),
  locationId: text('location_id').references(() => locations.id),
  revoked: integer('revoked').notNull().default(0),
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp' }),
  version: integer('version').notNull().default(1),
  ...timestamps(),
});

export type Device = typeof devices.$inferSelect;

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  businessId: text('business_id')
    .notNull()
    .references(() => businesses.id),
  tokenHash: text('token_hash').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  revokedAt: integer('revoked_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export type Session = typeof sessions.$inferSelect;

export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(),
  businessId: text('business_id').notNull(),
  userId: text('user_id'),
  action: text('action').notNull(),
  entity: text('entity').notNull(),
  entityId: text('entity_id'),
  details: text('details').notNull().default('{}'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export type AuditLog = typeof auditLogs.$inferSelect;

// --- Batch 4: products + inventory ledger -----------------------------------
// Ledger rule: stock on hand is ALWAYS derived from `stock_movements`.
// No balance column is ever overwritten; adjustments/counts append rows.

export const categories = sqliteTable(
  'categories',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id')
      .notNull()
      .references(() => businesses.id),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    version: integer('version').notNull().default(1),
    ...timestamps(),
  },
  (t) => ({
    categoriesBusinessNameUnique: uniqueIndex('categories_business_name_unique').on(t.businessId, t.name),
  }),
);

export type Category = typeof categories.$inferSelect;

export const products = sqliteTable(
  'products',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id')
      .notNull()
      .references(() => businesses.id),
    name: text('name').notNull(),
    sku: text('sku'),
    barcode: text('barcode'),
    categoryId: text('category_id').references(() => categories.id),
    unit: text('unit').notNull().default('pcs'),
    costPriceKobo: integer('cost_price_kobo').notNull().default(0),
    sellingPriceKobo: integer('selling_price_kobo').notNull().default(0),
    reorderLevel: integer('reorder_level').notNull().default(0),
imagePath: text('image_path').notNull().default(''),
taxCategoryId: text('tax_category_id').references(() => taxCategories.id),
    isActive: integer('is_active').notNull().default(1),
    version: integer('version').notNull().default(1),
    ...timestamps(),
  },
  (t) => ({
    productsBusinessSkuUnique: uniqueIndex('products_business_sku_unique').on(t.businessId, t.sku),
    productsBusinessBarcodeUnique: uniqueIndex('products_business_barcode_unique').on(
      t.businessId,
      t.barcode,
    ),
    productsBusinessNameIdx: index('products_business_name_idx').on(t.businessId, t.name),
    productsCategoryIdx: index('products_category_idx').on(t.categoryId),
  }),
);

export type Product = typeof products.$inferSelect;

// --- Restaurant pack: tax categories, product images, dining tables ---------
// Tax categories are named rates (e.g. Food 7.5%, Alcohol 10%, Exempt 0%)
// assigned per product. NULL tax_category_id falls back to the business
// default rate, so pre-existing products and tests are unaffected.

export const taxCategories = sqliteTable(
 'tax_categories',
 {
 id: text('id').primaryKey(),
 businessId: text('business_id')
 .notNull()
 .references(() => businesses.id),
 name: text('name').notNull(),
 rateBps: integer('rate_bps').notNull().default(0),
 isDefault: integer('is_default').notNull().default(0),
 version: integer('version').notNull().default(1),
 ...timestamps(),
 },
 (t) => ({
 taxCategoriesBusinessNameUnique: uniqueIndex('tax_categories_business_name_unique').on(
 t.businessId,
 t.name,
 ),
 }),
);

export type TaxCategory = typeof taxCategories.$inferSelect;

export const stockMovements = sqliteTable(
  'stock_movements',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id')
      .notNull()
      .references(() => businesses.id),
    productId: text('product_id')
      .notNull()
      .references(() => products.id),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id),
    kind: text('kind').notNull(),
    qtyDelta: integer('qty_delta').notNull(),
    qtyAfter: integer('qty_after').notNull(),
    reason: text('reason').notNull().default(''),
    userId: text('user_id').references(() => users.id),
    version: integer('version').notNull().default(1),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => ({
    movementsBusinessProductIdx: index('movements_business_product_idx').on(t.businessId, t.productId),
    movementsLocationIdx: index('movements_location_idx').on(t.locationId),
    movementsCreatedIdx: index('movements_created_idx').on(t.createdAt),
  }),
);

export type StockMovement = typeof stockMovements.$inferSelect;

// --- Batch 5: POS + cash register -------------------------------------------
// Sales are atomic transactions with reversal records, never deletes.
// Each completed sale appends `sale` rows to stock_movements (negative
// qty_delta). Refunds/voids append offsetting `return` rows.
// Money in integer kobo. Discounts in kobo (line + header). Tax in kobo.

// Dining tables for restaurant mode. status is 'free' | 'occupied'.
// currentSaleId is informational (the sale that occupied it); occupancy is
// flipped in the same transaction as saleCreate, released on completion.

export const diningTables = sqliteTable(
'dining_tables',
{
id: text('id').primaryKey(),
businessId: text('business_id')
.notNull()
.references(() => businesses.id),
locationId: text('location_id')
.notNull()
.references(() => locations.id),
name: text('name').notNull(),
seats: integer('seats').notNull().default(4),
status: text('status').notNull().default('free'),
note: text('note').notNull().default(''),
version: integer('version').notNull().default(1),
...timestamps(),
},
(t) => ({
diningTablesLocationNameUnique: uniqueIndex('dining_tables_location_name_unique').on(
t.locationId,
t.name,
),
}),
);

export type DiningTable = typeof diningTables.$inferSelect;

export const sales = sqliteTable(
 'sales',
 {
 id: text('id').primaryKey(),
 businessId: text('business_id')
 .notNull()
 .references(() => businesses.id),
 locationId: text('location_id')
 .notNull()
 .references(() => locations.id),
 receiptNo: text('receipt_no').notNull(),
 cashierId: text('cashier_id').references(() => users.id),
 status: text('status').notNull().default('completed'),
 subtotalKobo: integer('subtotal_kobo').notNull().default(0),
 lineDiscountKobo: integer('line_discount_kobo').notNull().default(0),
 headerDiscountKobo: integer('header_discount_kobo').notNull().default(0),
 taxKobo: integer('tax_kobo').notNull().default(0),
 totalKobo: integer('total_kobo').notNull().default(0),
 amountPaidKobo: integer('amount_paid_kobo').notNull().default(0),
 changeKobo: integer('change_kobo').notNull().default(0),
tableId: text('table_id').references(() => diningTables.id),
 version: integer('version').notNull().default(1),
 ...timestamps(),
 },
 (t) => ({
 salesBusinessReceiptUnique: uniqueIndex('sales_business_receipt_unique').on(t.businessId, t.receiptNo),
 salesBusinessCreatedIdx: index('sales_business_created_idx').on(t.businessId, t.createdAt),
 salesLocationIdx: index('sales_location_idx').on(t.locationId),
 }),
);

export type Sale = typeof sales.$inferSelect;

export const saleItems = sqliteTable(
 'sale_items',
 {
 id: text('id').primaryKey(),
 saleId: text('sale_id')
 .notNull()
 .references(() => sales.id),
 productId: text('product_id')
 .notNull()
 .references(() => products.id),
 qty: integer('qty').notNull(),
 unitPriceKobo: integer('unit_price_kobo').notNull(),
 lineDiscountKobo: integer('line_discount_kobo').notNull().default(0),
 lineTotalKobo: integer('line_total_kobo').notNull(),
 },
 (t) => ({
 saleItemsSaleIdx: index('sale_items_sale_idx').on(t.saleId),
 }),
);

export type SaleItem = typeof saleItems.$inferSelect;

export const salePayments = sqliteTable(
 'sale_payments',
 {
 id: text('id').primaryKey(),
 saleId: text('sale_id')
 .notNull()
 .references(() => sales.id),
 method: text('method').notNull(),
 amountKobo: integer('amount_kobo').notNull(),
 reference: text('reference').notNull().default(''),
 },
 (t) => ({
 salePaymentsSaleIdx: index('sale_payments_sale_idx').on(t.saleId),
 }),
);

export type SalePayment = typeof salePayments.$inferSelect;

export const saleReversals = sqliteTable('sale_reversals', {
 id: text('id').primaryKey(),
 saleId: text('sale_id')
 .notNull()
 .references(() => sales.id),
 reason: text('reason').notNull(),
 reversedBy: text('reversed_by').references(() => users.id),
 createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export type SaleReversal = typeof saleReversals.$inferSelect;

export const appSettings = sqliteTable('app_settings', {
  businessId: text('business_id')
    .notNull()
    .references(() => businesses.id),
  key: text('key').notNull(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const schemaMeta = sqliteTable('schema_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});
