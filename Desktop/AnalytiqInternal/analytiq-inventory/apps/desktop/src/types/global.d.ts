export interface SessionUser {
  id: string;
  businessId: string;
  name: string;
  email: string;
  permissions: string[];
  /** `businesses.type` - drives which modules the app shows. */
  businessType: string;
}

export interface RealtimeEvent {
  type: string;
  payload: unknown;
}

export interface AnalytiqApi {
  ping: () => Promise<string>;
  getVersion: () => Promise<string>;
  log: (level: 'info' | 'warn' | 'error', message: string) => Promise<void>;
  /** LAN mode: subscribe to server pushes; no-op in primary mode. */
  realtimeSubscribe: (callback: (event: RealtimeEvent) => void) => void;
  realtimeUnsubscribe: () => void;
  authStatus: () => Promise<{ setupComplete: boolean; error?: string }>;
  authSetup: (input: unknown) => Promise<{ ok: boolean; error?: string; code?: string }>;
  authLogin: (input: unknown) => Promise<{
    ok: boolean;
    user?: SessionUser;
    expiresAt?: string;
    error?: string;
    code?: string;
  }>;
  authLogout: () => Promise<{ ok: boolean }>;
  authMe: () => Promise<{ user: SessionUser | null }>;
  categories: () => Promise<{ ok: boolean; items?: Category[]; error?: string; code?: string }>;
  categoryCreate: (input: unknown) => Promise<{ ok: boolean; error?: string; code?: string }>;
  products: (
    query: unknown
  ) => Promise<{ ok: boolean; items: ProductRow[]; total: number; error?: string; code?: string }>;
  productGet: (
    id: string
  ) => Promise<{ ok: boolean; product?: ProductDetail; error?: string; code?: string }>;
  productCreate: (
    input: unknown
  ) => Promise<{ ok: boolean; id?: string; error?: string; code?: string }>;
  productByBarcode: (
    code: string
  ) => Promise<{ ok: boolean; product?: ProductRow | null; error?: string; code?: string }>;
  productUpdate: (
    id: string,
    patch: unknown
  ) => Promise<{ ok: boolean; error?: string; code?: string }>;
  productArchive: (id: string) => Promise<{ ok: boolean; error?: string; code?: string }>;
  productRestore: (id: string) => Promise<{ ok: boolean; error?: string; code?: string }>;
  stockLevels: (query: unknown) => Promise<{
    ok: boolean;
    items: StockLevelRow[];
    total: number;
    error?: string;
    code?: string;
  }>;
  stockAdjust: (
    input: unknown
  ) => Promise<{ ok: boolean; qtyAfter?: number; error?: string; code?: string }>;
  stockCount: (
    input: unknown
  ) => Promise<{ ok: boolean; qtyAfter?: number; error?: string; code?: string }>;
  stockMovements: (
    query: unknown
  ) => Promise<{ ok: boolean; items: MovementRow[]; total: number; error?: string; code?: string }>;
  saleCreate: (input: unknown) => Promise<{
    ok: boolean;
    id?: string;
    receiptNo?: string;
    totalKobo?: number;
    changeKobo?: number;
    error?: string;
    code?: string;
  }>;
  sales: (query: unknown) => Promise<{
    ok: boolean;
    items: SaleSummaryRow[];
    total: number;
    error?: string;
    code?: string;
  }>;
  saleGet: (
    id: string
  ) => Promise<{ ok: boolean; sale?: SaleDetail; error?: string; code?: string }>;
  saleRefund: (
    id: string,
    input: unknown
  ) => Promise<{ ok: boolean; error?: string; code?: string }>;
  saleVoid: (id: string, input: unknown) => Promise<{ ok: boolean; error?: string; code?: string }>;
  taxCategories: () => Promise<{
    ok: boolean;
    items: TaxCategory[];
    defaultId?: string;
    error?: string;
    code?: string;
  }>;
  taxCategoryCreate: (
    input: unknown
  ) => Promise<{ ok: boolean; category?: TaxCategory; error?: string; code?: string }>;
  taxCategoryUpdate: (
    id: string,
    patch: unknown
  ) => Promise<{ ok: boolean; category?: TaxCategory; error?: string; code?: string }>;
  tables: (
    query: unknown
  ) => Promise<{ ok: boolean; items: DiningTable[]; error?: string; code?: string }>;
  tableCreate: (
    input: unknown
  ) => Promise<{ ok: boolean; table?: DiningTable; error?: string; code?: string }>;
  tableUpdate: (
    id: string,
    patch: unknown
  ) => Promise<{ ok: boolean; table?: DiningTable; error?: string; code?: string }>;
  tableSetStatus: (
    id: string,
    input: unknown
  ) => Promise<{ ok: boolean; table?: DiningTable; error?: string; code?: string }>;
  tableDelete: (id: string) => Promise<{ ok: boolean; error?: string; code?: string }>;

  // --- Batch 6: customers, suppliers, purchasing ---
  customers: (query: unknown) => Promise<{
    ok: boolean;
    items: CustomerRow[];
    total: number;
    outstandingKobo: number;
    error?: string;
    code?: string;
  }>;
  customersGet: (
    id: string
  ) => Promise<{ ok: boolean; customer?: CustomerRow; error?: string; code?: string }>;
  customersCreate: (
    input: unknown
  ) => Promise<{ ok: boolean; id?: string; error?: string; code?: string }>;
  customersUpdate: (
    id: string,
    patch: unknown
  ) => Promise<{ ok: boolean; error?: string; code?: string }>;
  customersArchive: (id: string) => Promise<{ ok: boolean; error?: string; code?: string }>;
  customersPayments: (
    id: string
  ) => Promise<{ ok: boolean; items: CustomerPaymentRow[]; error?: string; code?: string }>;
  customersPayment: (
    input: unknown
  ) => Promise<{ ok: boolean; id?: string; balanceKobo?: number; error?: string; code?: string }>;

  suppliers: (
    query: unknown
  ) => Promise<{ ok: boolean; items: SupplierRow[]; total: number; error?: string; code?: string }>;
  suppliersCreate: (
    input: unknown
  ) => Promise<{ ok: boolean; id?: string; error?: string; code?: string }>;
  suppliersUpdate: (
    id: string,
    patch: unknown
  ) => Promise<{ ok: boolean; error?: string; code?: string }>;
  suppliersArchive: (id: string) => Promise<{ ok: boolean; error?: string; code?: string }>;

  purchases: (
    query: unknown
  ) => Promise<{ ok: boolean; items: PurchaseRow[]; total: number; error?: string; code?: string }>;
  purchasesCreate: (
    input: unknown
  ) => Promise<{ ok: boolean; id?: string; reference?: string; error?: string; code?: string }>;
  purchasesReceive: (
    id: string
  ) => Promise<{ ok: boolean; stockLines?: number; error?: string; code?: string }>;
  purchasesCancel: (id: string) => Promise<{ ok: boolean; error?: string; code?: string }>;

  // --- Batch 9: reports and analytics ---
  reportsSummary: (
    query: unknown
  ) => Promise<{ ok: boolean; summary?: ReportsSummary; error?: string; code?: string }>;

  // --- Batch 12: backups ---
  backups: () => Promise<{
    ok: boolean;
    dir?: string;
    items?: BackupRow[];
    error?: string;
    code?: string;
  }>;
  backupCreate: () => Promise<{
    ok: boolean;
    backup?: BackupRow;
    pruned?: number;
    error?: string;
    code?: string;
  }>;
  backupRestore: (name: string) => Promise<{
    ok: boolean;
    restored?: BackupRow;
    safetyBackup?: BackupRow;
    error?: string;
    code?: string;
  }>;
  backupDelete: (
    name: string
  ) => Promise<{ ok: boolean; removed?: string; error?: string; code?: string }>;
  backupReveal: () => Promise<{ ok: boolean; error?: string; code?: string }>;

  // --- Batch 10: offline license ---
  licenseStatus: () => Promise<{
    ok: boolean;
    status?: LicenseStatus;
    error?: string;
    code?: string;
  }>;
  licenseActivate: (
    key: string
  ) => Promise<{ ok: boolean; status?: LicenseStatus; error?: string; code?: string }>;

  // --- Batch 12: update check + safe external links ---
  updateCheck: () => Promise<UpdateCheck>;
  openExternal: (url: string) => Promise<{ ok: boolean; error?: string; code?: string }>;

  // --- Batch 8: locations + hub sync ---
  locations: () => Promise<{ ok: boolean; items: LocationRow[]; error?: string; code?: string }>;
  locationCreate: (
    input: unknown
  ) => Promise<{ ok: boolean; location?: LocationRow; error?: string; code?: string }>;
  locationUpdate: (
    id: string,
    patch: unknown
  ) => Promise<{ ok: boolean; location?: LocationRow; error?: string; code?: string }>;
  syncStatus: () => Promise<{ ok: boolean; status?: SyncStatus; error?: string; code?: string }>;
  syncConfigure: (
    input: unknown
  ) => Promise<{ ok: boolean; settings?: SyncSettings; error?: string; code?: string }>;
  syncNow: () => Promise<{
    ok: boolean;
    pushed?: number;
    pulled?: number;
    finishedAt?: string;
    error?: string;
    code?: string;
  }>;

  // --- Batch 11: AI + WhatsApp automation ---
  automationSettings: () => Promise<{
    ok: boolean;
    settings?: AutomationSettingsView;
    error?: string;
    code?: string;
  }>;
  automationSave: (
    input: unknown
  ) => Promise<{ ok: boolean; settings?: AutomationSettingsView; error?: string; code?: string }>;
  automationMessages: (
    limit?: number
  ) => Promise<{ ok: boolean; messages?: AutomationMessage[]; error?: string; code?: string }>;
  automationTest: (input: {
    body: string;
  }) => Promise<{ ok: boolean; message?: AutomationMessage; error?: string; code?: string }>;
  automationRun: () => Promise<{
    ok: boolean;
    result?: AutomationRunResult;
    error?: string;
    code?: string;
  }>;

  // --- Batch 13: bulk import + receipt header ---
  businessProfile: () => Promise<{
    ok: boolean;
    business?: BusinessProfile | null;
    error?: string;
    code?: string;
  }>;
  importProducts: (input: unknown) => Promise<ImportResponse>;
  importPurchases: (input: unknown) => Promise<ImportResponse>;
  importSales: (input: unknown) => Promise<ImportResponse>;

  // --- Batch 13: thermal receipt printing ---
  printerList: () => Promise<{
    ok: boolean;
    printers?: PrinterInfo[];
    error?: string;
    code?: string;
  }>;
  printerPrint: (input: PrinterPrintInput) => Promise<{ ok: boolean; error?: string; code?: string }>;
}

export interface PrinterInfo {
  name: string;
  displayName: string;
  isDefault: boolean;
  status?: number;
}

export interface PrinterPrintInput {
  html: string;
  printerName?: string;
  paperWidthMm?: number;
  copies?: number;
}

export interface BusinessProfile {
  id: string;
  name: string;
  type: string;
  address: string;
  phone: string;
  email: string;
  state: string;
  lga: string;
  currency: string;
  taxLabel: string;
  taxRateBps: number;
}

export interface ImportIssue {
  row: number;
  message: string;
  code?: string;
}

export interface ImportResponse {
  ok: boolean;
  created: number;
  failed: number;
  errors: ImportIssue[];
  error?: string;
  code?: string;
}

export interface LocationRow {
  id: string;
  name: string;
  address: string;
  state: string;
  lga: string;
  isDefault: boolean;
  version: number;
}

export interface SyncSettings {
  url: string;
  key: string;
  enabled: boolean;
}

export interface SyncStatus {
  settings: SyncSettings;
  lastPushAt: string | null;
  lastPullAt: string | null;
  lastError: string | null;
}

export interface AutomationSettingsView {
  whatsappEnabled: boolean;
  whatsappPhoneId: string;
  whatsappTokenSet: boolean;
  whatsappTo: string;
  whatsappTemplate: string;
  whatsappLang: string;
  aiEnabled: boolean;
  aiBaseUrl: string;
  aiApiKeySet: boolean;
  aiModel: string;
  lowStockEnabled: boolean;
  dailySummaryEnabled: boolean;
  dailySummaryHour: number;
  lastLowStockOn: string;
  lastSummaryOn: string;
}

export type AutomationMessageStatus = 'queued' | 'sent' | 'failed' | 'dry_run';

export interface AutomationMessage {
  id: string;
  kind: string;
  channel: string;
  toAddress: string;
  body: string;
  status: AutomationMessageStatus;
  error: string;
  createdAt: string;
  sentAt: string | null;
}

export interface AutomationRunResult {
  queued: number;
  sent: number;
  failed: number;
  dryRun: number;
  skipped: string[];
}

export interface UpdateCheck {
  ok: boolean;
  configured: boolean;
  currentVersion: string;
  latestVersion?: string;
  updateAvailable?: boolean;
  url?: string;
  notes?: string;
  error?: string;
  code?: string;
}

export type LicenseState = 'active' | 'trial' | 'expired' | 'invalid' | 'unlicensed';

export interface LicenseStatus {
  state: LicenseState;
  reason: string | null;
  plan: string | null;
  business: string | null;
  licenseId: string | null;
  expiresAt: string | null;
  daysLeft: number | null;
  trialEndsAt: string | null;
  installId: string;
  usable: boolean;
}

export interface BackupRow {
  name: string;
  sizeBytes: number;
  createdAt: string;
}

export interface ReportsSummary {
  range: { from: string; to: string; locationId: string | null };
  sales: {
    transactions: number;
    subtotalKobo: number;
    discountKobo: number;
    taxKobo: number;
    grossKobo: number;
    netKobo: number;
    refundCount: number;
    refundsKobo: number;
    voidCount: number;
    cogsKobo: number;
    grossProfitKobo: number;
    averageBasketKobo: number;
  };
  payments: Array<{ method: string; count: number; amountKobo: number }>;
  daily: Array<{ date: string; transactions: number; grossKobo: number; taxKobo: number }>;
  topProducts: Array<{
    productId: string;
    name: string;
    qty: number;
    revenueKobo: number;
    profitKobo: number;
  }>;
  topCustomers: Array<{
    customerId: string | null;
    name: string;
    transactions: number;
    totalKobo: number;
  }>;
  cashiers: Array<{
    customerId: string | null;
    name: string;
    transactions: number;
    totalKobo: number;
  }>;
  inventory: {
    productCount: number;
    lowStockCount: number;
    costValueKobo: number;
    retailValueKobo: number;
  };
  purchases: { receivedCount: number; receivedKobo: number };
  credit: { outstandingKobo: number; activeCustomers: number };
}

export interface CustomerRow {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  note: string;
  creditLimitKobo: number;
  isActive: boolean;
  balanceKobo: number;
  createdAt: string;
}

export interface SupplierRow {
  id: string;
  name: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  note: string;
  isActive: boolean;
  purchaseCount: number;
  createdAt: string;
}

export interface CustomerPaymentRow {
  id: string;
  amountKobo: number;
  method: string;
  reference: string;
  saleId: string | null;
  createdAt: string;
  userName: string | null;
}

export interface PurchaseRow {
  id: string;
  reference: string;
  status: string;
  supplierId: string | null;
  supplierName: string | null;
  locationId: string;
  locationName: string;
  subtotalKobo: number;
  taxKobo: number;
  totalKobo: number;
  amountPaidKobo: number;
  note: string;
  receivedAt: string | null;
  receivedByName: string | null;
  createdAt: string;
  items: PurchaseItemRow[];
}

export interface PurchaseItemRow {
  id: string;
  productId: string;
  productName: string;
  sku: string | null;
  qty: number;
  unitCostKobo: number;
  lineTotalKobo: number;
}

export type PaymentMethod = 'cash' | 'transfer' | 'pos' | 'credit';

export interface SaleItemRow {
  id: string;
  productId: string;
  productName: string;
  sku: string | null;
  qty: number;
  unitPriceKobo: number;
  lineDiscountKobo: number;
  lineTotalKobo: number;
}

export interface SalePaymentRow {
  id: string;
  method: PaymentMethod;
  amountKobo: number;
  reference: string;
}

export interface SaleSummaryRow {
  id: string;
  receiptNo: string;
  locationName: string;
  cashierName: string | null;
  status: 'completed' | 'refunded' | 'voided';
  totalKobo: number;
  amountPaidKobo: number;
  tableName: string | null;
  createdAt: string;
  itemCount: number;
}

export interface SaleDetail extends SaleSummaryRow {
  locationId: string;
  cashierId: string | null;
  subtotalKobo: number;
  lineDiscountKobo: number;
  headerDiscountKobo: number;
  taxKobo: number;
  changeKobo: number;
  tableId: string | null;
  tableName: string | null;
  items: SaleItemRow[];
  payments: SalePaymentRow[];
  reversal: { reason: string; reversedBy: string | null; createdAt: string } | null;
}

export interface Category {
  id: string;
  name: string;
  description: string;
}

export interface ProductRow {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  categoryId: string | null;
  categoryName: string | null;
  unit: string;
  costPriceKobo: number;
  sellingPriceKobo: number;
  reorderLevel: number;
  imagePath: string;
  taxCategoryId: string | null;
  isActive: number;
  onHand: number;
  lowStock: boolean;
}

export interface StockLevelRow {
  productId: string;
  productName: string;
  sku: string | null;
  reorderLevel: number;
  locationId: string;
  locationName: string;
  onHand: number;
  low: boolean;
}

export interface MovementRow {
  id: string;
  kind: string;
  qtyDelta: number;
  qtyAfter: number;
  reason: string;
  createdAt: string;
  productId: string;
  productName: string;
  sku: string | null;
  locationId: string;
  locationName: string;
  userName: string | null;
}

export interface ProductDetail extends ProductRow {
  levels: Array<{ locationId: string; locationName: string; onHand: number }>;
}

export interface TaxCategory {
  id: string;
  name: string;
  rateBps: number;
  isDefault: boolean;
}

export interface DiningTable {
  id: string;
  locationId: string;
  locationName: string;
  name: string;
  seats: number;
  status: 'free' | 'occupied';
  note: string;
}

declare global {
  interface Window {
    analytiq?: AnalytiqApi;
  }
}

export {};
