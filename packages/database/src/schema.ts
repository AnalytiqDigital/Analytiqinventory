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
  })
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
    categoriesBusinessNameUnique: uniqueIndex('categories_business_name_unique').on(
      t.businessId,
      t.name
    ),
  })
);

export type Category = typeof categories.$inferSelect;

// --- Batch 16: shop-floor masters -------------------------------------------
// Brands, selling units, warranties and customer groups are optional lookups.
// A product keeps its free-text `unit` (existing data keeps working) and may
// additionally point at a unit record; the product form offers the units list.
// Deleting masters is not supported — they are archived so products keep their
// reference.

export const brands = sqliteTable(
  'brands',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id')
      .notNull()
      .references(() => businesses.id),
    name: text('name').notNull(),
    note: text('note').notNull().default(''),
    isActive: integer('is_active').notNull().default(1),
    version: integer('version').notNull().default(1),
    ...timestamps(),
  },
  (t) => ({
    brandsBusinessNameUnique: uniqueIndex('brands_business_name_unique').on(t.businessId, t.name),
  })
);

export type Brand = typeof brands.$inferSelect;

export const units = sqliteTable(
  'units',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id')
      .notNull()
      .references(() => businesses.id),
    name: text('name').notNull(),
    shortName: text('short_name').notNull().default(''),
    note: text('note').notNull().default(''),
    isActive: integer('is_active').notNull().default(1),
    version: integer('version').notNull().default(1),
    ...timestamps(),
  },
  (t) => ({
    unitsBusinessNameUnique: uniqueIndex('units_business_name_unique').on(t.businessId, t.name),
  })
);

export type Unit = typeof units.$inferSelect;

export const warranties = sqliteTable(
  'warranties',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id')
      .notNull()
      .references(() => businesses.id),
    name: text('name').notNull(),
    /** Length in days; 0 means "no fixed term". */
    durationDays: integer('duration_days').notNull().default(0),
    note: text('note').notNull().default(''),
    isActive: integer('is_active').notNull().default(1),
    version: integer('version').notNull().default(1),
    ...timestamps(),
  },
  (t) => ({
    warrantiesBusinessNameUnique: uniqueIndex('warranties_business_name_unique').on(
      t.businessId,
      t.name
    ),
  })
);

export type Warranty = typeof warranties.$inferSelect;

export const customerGroups = sqliteTable(
  'customer_groups',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id')
      .notNull()
      .references(() => businesses.id),
    name: text('name').notNull(),
    note: text('note').notNull().default(''),
    isActive: integer('is_active').notNull().default(1),
    version: integer('version').notNull().default(1),
    ...timestamps(),
  },
  (t) => ({
    customerGroupsBusinessNameUnique: uniqueIndex('customer_groups_business_name_unique').on(
      t.businessId,
      t.name
    ),
  })
);

export type CustomerGroup = typeof customerGroups.$inferSelect;

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
    brandId: text('brand_id').references(() => brands.id),
    warrantyId: text('warranty_id').references(() => warranties.id),
    unit: text('unit').notNull().default('pcs'),
    costPriceKobo: integer('cost_price_kobo').notNull().default(0),
    sellingPriceKobo: integer('selling_price_kobo').notNull().default(0),
    reorderLevel: integer('reorder_level').notNull().default(0),
    imagePath: text('image_path').notNull().default(''),
    taxCategoryId: text('tax_category_id').references(() => taxCategories.id),
    /** Pharmacy/provisions: stock is tracked per batch with an expiry date. */
    trackBatches: integer('track_batches').notNull().default(0),
    /** Expiry alert window; 0 means "only alert once expired". */
    nearExpiryDays: integer('near_expiry_days').notNull().default(30),
    isActive: integer('is_active').notNull().default(1),
    version: integer('version').notNull().default(1),
    ...timestamps(),
  },
  (t) => ({
    productsBusinessSkuUnique: uniqueIndex('products_business_sku_unique').on(t.businessId, t.sku),
    productsBusinessBarcodeUnique: uniqueIndex('products_business_barcode_unique').on(
      t.businessId,
      t.barcode
    ),
    productsBusinessNameIdx: index('products_business_name_idx').on(t.businessId, t.name),
    productsCategoryIdx: index('products_category_idx').on(t.categoryId),
  })
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
      t.name
    ),
  })
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
    /** Batch consumed/added by this movement; NULL for unbatched products. */
    batchId: text('batch_id'),
    userId: text('user_id').references(() => users.id),
    version: integer('version').notNull().default(1),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => ({
    movementsBusinessProductIdx: index('movements_business_product_idx').on(
      t.businessId,
      t.productId
    ),
    movementsLocationIdx: index('movements_location_idx').on(t.locationId),
    movementsCreatedIdx: index('movements_created_idx').on(t.createdAt),
  })
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
      t.name
    ),
  })
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
    /** Service flow: dine_in | takeaway | delivery. */
    orderType: text('order_type').notNull().default('takeaway'),
    waiterName: text('waiter_name').notNull().default(''),
    serviceChargeKobo: integer('service_charge_kobo').notNull().default(0),
    tipKobo: integer('tip_kobo').notNull().default(0),
    tableId: text('table_id').references(() => diningTables.id),
    customerId: text('customer_id').references(() => customers.id),
    loyaltyPointsRedeemed: integer('loyalty_points_redeemed').notNull().default(0),
    loyaltyDiscountKobo: integer('loyalty_discount_kobo').notNull().default(0),
    loyaltyPointsEarned: integer('loyalty_points_earned').notNull().default(0),
    /** Source-system reference for imported sales; null for till sales. */
    externalRef: text('external_ref'),
    version: integer('version').notNull().default(1),
    ...timestamps(),
  },
  (t) => ({
    salesBusinessReceiptUnique: uniqueIndex('sales_business_receipt_unique').on(
      t.businessId,
      t.receiptNo
    ),
    salesBusinessCreatedIdx: index('sales_business_created_idx').on(t.businessId, t.createdAt),
    salesLocationIdx: index('sales_location_idx').on(t.locationId),
  })
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
  })
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
  })
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

// --- Batch 6: customers, suppliers, purchasing ------------------------------
// Customers exist for credit sales and receipts. Walk-in sales stay
// customer-less (sales.customer_id NULL), so nothing here is required to sell.
// A customer's balance is DERIVED (credit sales minus payments), never stored,
// so it can never drift out of sync with the ledger.
//
// Purchases are two-phase: created as `draft`, then `received` (which appends
// `purchase` rows to stock_movements and refreshes product cost price) or
// `cancelled`. Receiving is idempotent-guarded: only a draft can be received.

export const customers = sqliteTable(
  'customers',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id')
      .notNull()
      .references(() => businesses.id),
    name: text('name').notNull(),
    phone: text('phone').notNull().default(''),
    email: text('email').notNull().default(''),
    address: text('address').notNull().default(''),
    note: text('note').notNull().default(''),
    creditLimitKobo: integer('credit_limit_kobo').notNull().default(0),
    priceTierId: text('price_tier_id'),
    groupId: text('group_id').references(() => customerGroups.id),
    isActive: integer('is_active').notNull().default(1),
    version: integer('version').notNull().default(1),
    ...timestamps(),
  },
  (t) => ({
    customersBusinessNameIdx: index('customers_business_name_idx').on(t.businessId, t.name),
    customersBusinessPhoneIdx: index('customers_business_phone_idx').on(t.businessId, t.phone),
  })
);

export type Customer = typeof customers.$inferSelect;

export const suppliers = sqliteTable(
  'suppliers',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id')
      .notNull()
      .references(() => businesses.id),
    name: text('name').notNull(),
    contactName: text('contact_name').notNull().default(''),
    phone: text('phone').notNull().default(''),
    email: text('email').notNull().default(''),
    address: text('address').notNull().default(''),
    note: text('note').notNull().default(''),
    isActive: integer('is_active').notNull().default(1),
    version: integer('version').notNull().default(1),
    ...timestamps(),
  },
  (t) => ({
    suppliersBusinessNameIdx: index('suppliers_business_name_idx').on(t.businessId, t.name),
  })
);

export type Supplier = typeof suppliers.$inferSelect;

export const purchases = sqliteTable(
  'purchases',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id')
      .notNull()
      .references(() => businesses.id),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id),
    supplierId: text('supplier_id').references(() => suppliers.id),
    reference: text('reference').notNull(),
    status: text('status').notNull().default('draft'),
    subtotalKobo: integer('subtotal_kobo').notNull().default(0),
    taxKobo: integer('tax_kobo').notNull().default(0),
    totalKobo: integer('total_kobo').notNull().default(0),
    amountPaidKobo: integer('amount_paid_kobo').notNull().default(0),
    note: text('note').notNull().default(''),
    receivedBy: text('received_by').references(() => users.id),
    receivedAt: integer('received_at', { mode: 'timestamp' }),
    version: integer('version').notNull().default(1),
    ...timestamps(),
  },
  (t) => ({
    purchasesBusinessRefUnique: uniqueIndex('purchases_business_ref_unique').on(
      t.businessId,
      t.reference
    ),
    purchasesBusinessCreatedIdx: index('purchases_business_created_idx').on(
      t.businessId,
      t.createdAt
    ),
    purchasesSupplierIdx: index('purchases_supplier_idx').on(t.supplierId),
  })
);

export type Purchase = typeof purchases.$inferSelect;

export const purchaseItems = sqliteTable(
  'purchase_items',
  {
    id: text('id').primaryKey(),
    purchaseId: text('purchase_id')
      .notNull()
      .references(() => purchases.id),
    productId: text('product_id')
      .notNull()
      .references(() => products.id),
    qty: integer('qty').notNull(),
    unitCostKobo: integer('unit_cost_kobo').notNull(),
    lineTotalKobo: integer('line_total_kobo').notNull(),
    batchNo: text('batch_no').notNull().default(''),
    expiryDate: integer('expiry_date', { mode: 'timestamp' }),
  },
  (t) => ({
    purchaseItemsPurchaseIdx: index('purchase_items_purchase_idx').on(t.purchaseId),
  })
);

export type PurchaseItem = typeof purchaseItems.$inferSelect;

// Money received against a customer's credit. saleId is set when the payment
// settles a specific sale, NULL for a general account payment.
export const customerPayments = sqliteTable(
  'customer_payments',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id')
      .notNull()
      .references(() => businesses.id),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    saleId: text('sale_id').references(() => sales.id),
    amountKobo: integer('amount_kobo').notNull(),
    method: text('method').notNull().default('cash'),
    reference: text('reference').notNull().default(''),
    userId: text('user_id').references(() => users.id),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => ({
    customerPaymentsCustomerIdx: index('customer_payments_customer_idx').on(t.customerId),
    customerPaymentsBusinessCreatedIdx: index('customer_payments_business_created_idx').on(
      t.businessId,
      t.createdAt
    ),
  })
);

export type CustomerPayment = typeof customerPayments.$inferSelect;

export const schemaMeta = sqliteTable('schema_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// --- Batch 8: multi-branch sync ---------------------------------------------
// sync_state: per-business connection settings and push/pull cursors.
// sync_records: the relay's snapshot log (newest row per entity, monotonic seq).
// Composite primary keys and the seq index live in 0008_batch8_sync.sql; the
// sync service uses raw SQL against both tables.

export const syncState = sqliteTable('sync_state', {
  businessId: text('business_id').notNull(),
  key: text('key').notNull(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const syncRecords = sqliteTable('sync_records', {
  businessId: text('business_id').notNull(),
  entity: text('entity').notNull(),
  entityId: text('entity_id').notNull(),
  version: integer('version').notNull(),
  updatedAt: integer('updated_at').notNull(),
  seq: integer('seq').notNull(),
  data: text('data').notNull(),
});

export type SyncStateRow = typeof syncState.$inferSelect;
export type SyncRecordRow = typeof syncRecords.$inferSelect;

// --- Batch 11: AI + WhatsApp automation -------------------------------------
// One settings row per business and an outbox of every generated message.
// Credentials are stored in this local database only; no sync entity includes
// either table, so they never leave the installation.

export const automationSettings = sqliteTable('automation_settings', {
  businessId: text('business_id').primaryKey(),
  whatsappEnabled: integer('whatsapp_enabled').notNull().default(0),
  whatsappPhoneId: text('whatsapp_phone_id').notNull().default(''),
  whatsappToken: text('whatsapp_token').notNull().default(''),
  whatsappTo: text('whatsapp_to').notNull().default(''),
  whatsappTemplate: text('whatsapp_template').notNull().default(''),
  whatsappLang: text('whatsapp_lang').notNull().default('en'),
  aiEnabled: integer('ai_enabled').notNull().default(0),
  aiBaseUrl: text('ai_base_url').notNull().default(''),
  aiApiKey: text('ai_api_key').notNull().default(''),
  aiModel: text('ai_model').notNull().default('gpt-4o-mini'),
  lowStockEnabled: integer('low_stock_enabled').notNull().default(0),
  dailySummaryEnabled: integer('daily_summary_enabled').notNull().default(0),
  dailySummaryHour: integer('daily_summary_hour').notNull().default(20),
  lastLowStockOn: text('last_low_stock_on').notNull().default(''),
  lastSummaryOn: text('last_summary_on').notNull().default(''),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export type AutomationSettingsRow = typeof automationSettings.$inferSelect;

export const automationMessages = sqliteTable('automation_messages', {
  id: text('id').primaryKey(),
  businessId: text('business_id').notNull(),
  kind: text('kind').notNull(),
  channel: text('channel').notNull().default('whatsapp'),
  toAddress: text('to_address').notNull().default(''),
  body: text('body').notNull(),
  status: text('status').notNull().default('queued'),
  error: text('error').notNull().default(''),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  sentAt: integer('sent_at', { mode: 'timestamp' }),
});

export type AutomationMessageRow = typeof automationMessages.$inferSelect;

// --- Batch 14: finance (expenses) -------------------------------------------
// Expenses are an audited money-out ledger (create, update and delete each
// write an audit row). Profit is never stored: the finance reports subtract
// expenses from sales gross profit at read time.

export const expenses = sqliteTable(
  'expenses',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id')
      .notNull()
      .references(() => businesses.id),
    locationId: text('location_id').references(() => locations.id),
    category: text('category').notNull(),
    note: text('note').notNull().default(''),
    amountKobo: integer('amount_kobo').notNull(),
    paidAt: integer('paid_at', { mode: 'timestamp' }).notNull(),
    createdBy: text('created_by'),
    /** Cash/bank account the expense was paid from; null = business cash default. */
    accountId: text('account_id'),
    version: integer('version').notNull().default(1),
    ...timestamps(),
  },
  (t) => ({
    expensesBusinessPaid: index('expenses_business_paid_idx').on(t.businessId, t.paidAt),
  })
);

export type ExpenseRow = typeof expenses.$inferSelect;

// --- Batch 15: business pack ------------------------------------------------
// Batches/expiry, wholesale price tiers, loyalty + CRM, counter returns,
// branch transfers, debtor reminders and encrypted off-PC backups.

export const productBatches = sqliteTable(
  'product_batches',
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
    batchNo: text('batch_no').notNull().default(''),
    /** Date printed on the pack as the manufacturing date (optional). */
    manufacturedDate: integer('manufactured_date', { mode: 'timestamp' }),
    expiryDate: integer('expiry_date', { mode: 'timestamp' }),
    note: text('note').notNull().default(''),
    version: integer('version').notNull().default(1),
    ...timestamps(),
  },
  (t) => ({
    productBatchesExpiryIdx: index('product_batches_business_expiry_idx').on(
      t.businessId,
      t.expiryDate
    ),
    productBatchesProductIdx: index('product_batches_product_location_idx').on(
      t.productId,
      t.locationId
    ),
  })
);

export type ProductBatch = typeof productBatches.$inferSelect;

export const priceTiers = sqliteTable(
  'price_tiers',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id')
      .notNull()
      .references(() => businesses.id),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    isDefault: integer('is_default').notNull().default(0),
    version: integer('version').notNull().default(1),
    ...timestamps(),
  },
  (t) => ({
    priceTiersNameUnique: uniqueIndex('price_tiers_business_name_unique').on(t.businessId, t.name),
  })
);

export type PriceTier = typeof priceTiers.$inferSelect;

export const productPrices = sqliteTable(
  'product_prices',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id')
      .notNull()
      .references(() => businesses.id),
    productId: text('product_id')
      .notNull()
      .references(() => products.id),
    priceTierId: text('price_tier_id')
      .notNull()
      .references(() => priceTiers.id),
    priceKobo: integer('price_kobo').notNull(),
    ...timestamps(),
  },
  (t) => ({
    productPricesUnique: uniqueIndex('product_prices_product_tier_unique').on(
      t.productId,
      t.priceTierId
    ),
    productPricesTierIdx: index('product_prices_tier_idx').on(t.priceTierId),
  })
);

export type ProductPrice = typeof productPrices.$inferSelect;

export const customerNotes = sqliteTable(
  'customer_notes',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id')
      .notNull()
      .references(() => businesses.id),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    body: text('body').notNull(),
    createdBy: text('created_by'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => ({
    customerNotesIdx: index('customer_notes_customer_idx').on(t.customerId, t.createdAt),
  })
);

export type CustomerNote = typeof customerNotes.$inferSelect;

export const loyaltyEntries = sqliteTable(
  'loyalty_entries',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id')
      .notNull()
      .references(() => businesses.id),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    saleId: text('sale_id'),
    kind: text('kind').notNull(),
    points: integer('points').notNull(),
    reason: text('reason').notNull().default(''),
    createdBy: text('created_by'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => ({
    loyaltyEntriesCustomerIdx: index('loyalty_entries_customer_idx').on(t.customerId, t.createdAt),
    loyaltyEntriesSaleKind: uniqueIndex('loyalty_entries_sale_kind_unique').on(t.saleId, t.kind),
  })
);

export type LoyaltyEntry = typeof loyaltyEntries.$inferSelect;

export const saleReturns = sqliteTable(
  'sale_returns',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id')
      .notNull()
      .references(() => businesses.id),
    saleId: text('sale_id')
      .notNull()
      .references(() => sales.id),
    locationId: text('location_id').notNull(),
    receiptNo: text('receipt_no').notNull(),
    kind: text('kind').notNull().default('refund'),
    reason: text('reason').notNull(),
    refundKobo: integer('refund_kobo').notNull().default(0),
    refundMethod: text('refund_method').notNull().default('cash'),
    exchangeSaleId: text('exchange_sale_id'),
    createdBy: text('created_by'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => ({
    saleReturnsBusinessIdx: index('sale_returns_business_idx').on(t.businessId, t.createdAt),
    saleReturnsSaleIdx: index('sale_returns_sale_idx').on(t.saleId),
  })
);

export type SaleReturnRow = typeof saleReturns.$inferSelect;

export const saleReturnItems = sqliteTable(
  'sale_return_items',
  {
    id: text('id').primaryKey(),
    returnId: text('return_id')
      .notNull()
      .references(() => saleReturns.id),
    saleItemId: text('sale_item_id')
      .notNull()
      .references(() => saleItems.id),
    productId: text('product_id')
      .notNull()
      .references(() => products.id),
    qty: integer('qty').notNull(),
    refundKobo: integer('refund_kobo').notNull().default(0),
  },
  (t) => ({
    saleReturnItemsIdx: index('sale_return_items_return_idx').on(t.returnId),
  })
);

export type SaleReturnItemRow = typeof saleReturnItems.$inferSelect;

export const stockTransfers = sqliteTable(
  'stock_transfers',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id')
      .notNull()
      .references(() => businesses.id),
    reference: text('reference').notNull(),
    fromLocationId: text('from_location_id')
      .notNull()
      .references(() => locations.id),
    toLocationId: text('to_location_id')
      .notNull()
      .references(() => locations.id),
    note: text('note').notNull().default(''),
    createdBy: text('created_by'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => ({
    stockTransfersRefUnique: uniqueIndex('stock_transfers_business_reference_unique').on(
      t.businessId,
      t.reference
    ),
  })
);

export type StockTransfer = typeof stockTransfers.$inferSelect;

export const stockTransferItems = sqliteTable(
  'stock_transfer_items',
  {
    id: text('id').primaryKey(),
    transferId: text('transfer_id')
      .notNull()
      .references(() => stockTransfers.id),
    productId: text('product_id')
      .notNull()
      .references(() => products.id),
    qty: integer('qty').notNull(),
  },
  (t) => ({
    stockTransferItemsIdx: index('stock_transfer_items_transfer_idx').on(t.transferId),
  })
);

export type StockTransferItem = typeof stockTransferItems.$inferSelect;

export const debtorReminders = sqliteTable(
  'debtor_reminders',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id')
      .notNull()
      .references(() => businesses.id),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    balanceKobo: integer('balance_kobo').notNull(),
    status: text('status').notNull().default('queued'),
    error: text('error').notNull().default(''),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    sentAt: integer('sent_at', { mode: 'timestamp' }),
  },
  (t) => ({
    debtorRemindersIdx: index('debtor_reminders_business_idx').on(t.businessId, t.createdAt),
  })
);

export type DebtorReminderRow = typeof debtorReminders.$inferSelect;

export const backupUploads = sqliteTable(
  'backup_uploads',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id')
      .notNull()
      .references(() => businesses.id),
    fileName: text('file_name').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    status: text('status').notNull().default('queued'),
    error: text('error').notNull().default(''),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => ({
    backupUploadsIdx: index('backup_uploads_business_idx').on(t.businessId, t.createdAt),
  })
);

export type BackupUploadRow = typeof backupUploads.$inferSelect;

// --- Batch 16: stock adjustments and purchase returns -----------------------
// A stock adjustment is a document: a header plus signed lines. Every line
// writes one `adjust` stock movement, so the ledger stays the single source of
// on-hand truth. Purchase returns point back at the received purchase and take
// stock out; supplier payable is derived as purchases minus payments minus
// returns, never stored.

export const stockAdjustments = sqliteTable(
  'stock_adjustments',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id')
      .notNull()
      .references(() => businesses.id),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id),
    reference: text('reference').notNull(),
    reason: text('reason').notNull(),
    note: text('note').notNull().default(''),
    createdBy: text('created_by'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => ({
    stockAdjustmentsRefUnique: uniqueIndex('stock_adjustments_business_reference_unique').on(
      t.businessId,
      t.reference
    ),
    stockAdjustmentsBusinessCreatedIdx: index('stock_adjustments_business_created_idx').on(
      t.businessId,
      t.createdAt
    ),
  })
);

export type StockAdjustment = typeof stockAdjustments.$inferSelect;

export const stockAdjustmentItems = sqliteTable(
  'stock_adjustment_items',
  {
    id: text('id').primaryKey(),
    adjustmentId: text('adjustment_id')
      .notNull()
      .references(() => stockAdjustments.id),
    productId: text('product_id')
      .notNull()
      .references(() => products.id),
    movementId: text('movement_id').references(() => stockMovements.id),
    qtyDelta: integer('qty_delta').notNull(),
    note: text('note').notNull().default(''),
  },
  (t) => ({
    stockAdjustmentItemsIdx: index('stock_adjustment_items_adjustment_idx').on(t.adjustmentId),
  })
);

export type StockAdjustmentItem = typeof stockAdjustmentItems.$inferSelect;

export const purchaseReturns = sqliteTable(
  'purchase_returns',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id')
      .notNull()
      .references(() => businesses.id),
    purchaseId: text('purchase_id')
      .notNull()
      .references(() => purchases.id),
    supplierId: text('supplier_id').references(() => suppliers.id),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id),
    reference: text('reference').notNull(),
    reason: text('reason').notNull(),
    note: text('note').notNull().default(''),
    totalKobo: integer('total_kobo').notNull().default(0),
    createdBy: text('created_by'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => ({
    purchaseReturnsRefUnique: uniqueIndex('purchase_returns_business_reference_unique').on(
      t.businessId,
      t.reference
    ),
    purchaseReturnsBusinessCreatedIdx: index('purchase_returns_business_created_idx').on(
      t.businessId,
      t.createdAt
    ),
  })
);

export type PurchaseReturn = typeof purchaseReturns.$inferSelect;

export const purchaseReturnItems = sqliteTable(
  'purchase_return_items',
  {
    id: text('id').primaryKey(),
    returnId: text('return_id')
      .notNull()
      .references(() => purchaseReturns.id),
    productId: text('product_id')
      .notNull()
      .references(() => products.id),
    qty: integer('qty').notNull(),
    unitCostKobo: integer('unit_cost_kobo').notNull(),
    lineTotalKobo: integer('line_total_kobo').notNull(),
  },
  (t) => ({
    purchaseReturnItemsIdx: index('purchase_return_items_return_idx').on(t.returnId),
  })
);

export type PurchaseReturnItem = typeof purchaseReturnItems.$inferSelect;

// --- Batch 17: cash & bank accounts -----------------------------------------
// Every movement of money lands in one account ledger, so the shop can see
// what is physically in the drawer, the bank and the POS settlement account.

export const accounts = sqliteTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id')
      .notNull()
      .references(() => businesses.id),
    name: text('name').notNull(),
    /** cash | bank | pos | mobile */
    kind: text('kind').notNull(),
    openingBalanceKobo: integer('opening_balance_kobo').notNull().default(0),
    isDefault: integer('is_default').notNull().default(0),
    archived: integer('archived').notNull().default(0),
    version: integer('version').notNull().default(1),
    ...timestamps(),
  },
  (t) => ({
    accountsBusinessNameUnique: uniqueIndex('accounts_business_name_unique').on(
      t.businessId,
      t.name
    ),
    accountsBusinessIdx: index('accounts_business_idx').on(t.businessId),
  })
);

export type Account = typeof accounts.$inferSelect;

export const accountTransactions = sqliteTable(
  'account_transactions',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id')
      .notNull()
      .references(() => businesses.id),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id),
    /** sale | refund | expense | expense_reversal | customer_payment |
     *  transfer_in | transfer_out | adjustment | sale_void */
    kind: text('kind').notNull(),
    /** Signed: positive money in, negative money out. */
    amountKobo: integer('amount_kobo').notNull(),
    reference: text('reference').notNull().default(''),
    note: text('note').notNull().default(''),
    /** sale | refund | expense | customer_payment | transfer | manual */
    source: text('source').notNull().default(''),
    sourceId: text('source_id'),
    userId: text('user_id'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => ({
    accountTxAccountIdx: index('account_tx_account_created_idx').on(t.accountId, t.createdAt),
    accountTxBusinessIdx: index('account_tx_business_created_idx').on(t.businessId, t.createdAt),
    accountTxSourceIdx: index('account_tx_source_idx').on(t.source, t.sourceId),
  })
);

export type AccountTransaction = typeof accountTransactions.$inferSelect;

