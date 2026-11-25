export interface SessionUser {
  id: string;
  businessId: string;
  name: string;
  email: string;
  permissions: string[];
  /** `businesses.type` - drives which modules the app shows. */
  businessType: string;
  /** Installed modules: the type preset plus this business's switches. */
  modules: string[];
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
  categoryUpdate: (
    id: string,
    patch: unknown
  ) => Promise<{ ok: boolean; category?: Category; error?: string; code?: string }>;
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

  // --- Batch 16: masters, stock adjustments, purchase returns, menu reports ---
  mastersList: (
    kind: MasterKind
  ) => Promise<{ ok: boolean; items?: MasterRow[]; error?: string; code?: string }>;
  mastersCreate: (
    kind: MasterKind,
    input: unknown
  ) => Promise<{ ok: boolean; item?: MasterRow; error?: string; code?: string }>;
  mastersUpdate: (
    kind: MasterKind,
    id: string,
    patch: unknown
  ) => Promise<{ ok: boolean; item?: MasterRow; error?: string; code?: string }>;
  stockAdjustments: (
    query: unknown
  ) => Promise<{
    ok: boolean;
    items: StockAdjustmentRow[];
    total: number;
    error?: string;
    code?: string;
  }>;
  stockAdjustmentCreate: (
    input: unknown
  ) => Promise<{ ok: boolean; id?: string; reference?: string; error?: string; code?: string }>;
  purchaseReturns: (
    query: unknown
  ) => Promise<{
    ok: boolean;
    items: PurchaseReturnRow[];
    total: number;
    error?: string;
    code?: string;
  }>;
  purchaseReturnCreate: (
    input: unknown
  ) => Promise<{
    ok: boolean;
    id?: string;
    reference?: string;
    totalKobo?: number;
    error?: string;
    code?: string;
  }>;
  reportsMenu: (
    query: unknown
  ) => Promise<{ ok: boolean; report?: MenuReports; error?: string; code?: string }>;

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
  offsiteBackupStatus: () => Promise<{
    ok: boolean;
    status?: OffsiteBackupStatus;
    error?: string;
    code?: string;
  }>;
  chooseOffsiteBackup: () => Promise<{
    ok: boolean;
    canceled?: boolean;
    status?: OffsiteBackupStatus;
    error?: string;
    code?: string;
  }>;
  skipOffsiteBackup: () => Promise<{
    ok: boolean;
    status?: OffsiteBackupStatus;
    error?: string;
    code?: string;
  }>;

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
  licenseDeactivate: () => Promise<{
    ok: boolean;
    status?: LicenseStatus;
    error?: string;
    code?: string;
  }>;

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
  importOpeningStock: (input: unknown) => Promise<ImportResponse>;
  importContacts: (input: unknown) => Promise<ImportResponse>;

  // --- Batch 14: staff, role permissions and expenses ---
  staff: () => Promise<{ ok: boolean; items: StaffMember[]; error?: string; code?: string }>;
  staffCreate: (
    input: unknown
  ) => Promise<{ ok: boolean; staff?: StaffMember; error?: string; code?: string }>;
  staffUpdate: (
    id: string,
    patch: unknown
  ) => Promise<{ ok: boolean; staff?: StaffMember; error?: string; code?: string }>;
  staffResetPassword: (
    id: string,
    password: string
  ) => Promise<{ ok: boolean; error?: string; code?: string }>;
  staffRoles: () => Promise<{ ok: boolean; items: StaffRole[]; error?: string; code?: string }>;
  staffRolePermissions: (
    id: string,
    permissions: string[]
  ) => Promise<{ ok: boolean; role?: StaffRole; error?: string; code?: string }>;
  expenses: (query: unknown) => Promise<{
    ok: boolean;
    items: ExpenseRow[];
    totalKobo: number;
    error?: string;
    code?: string;
  }>;
  expenseCreate: (
    input: unknown
  ) => Promise<{ ok: boolean; expense?: ExpenseRow; error?: string; code?: string }>;
  expenseUpdate: (
    id: string,
    patch: unknown
  ) => Promise<{ ok: boolean; expense?: ExpenseRow; error?: string; code?: string }>;
  expenseDelete: (id: string) => Promise<{ ok: boolean; error?: string; code?: string }>;

  // --- Batch 13: thermal receipt printing ---
  printerList: () => Promise<{
    ok: boolean;
    printers?: PrinterInfo[];
    error?: string;
    code?: string;
  }>;
  printerPrint: (
    input: PrinterPrintInput
  ) => Promise<{ ok: boolean; error?: string; code?: string }>;
  printerSavePdf: (
    input: PrinterPrintInput & { fileName?: string }
  ) => Promise<{ ok: boolean; error?: string; code?: string; canceled?: boolean; path?: string }>;

  // --- Batch 15: business pack ---
  modulesView: () => Promise<{
    ok: boolean;
    businessType?: string;
    modules?: string[];
    overrides?: Record<string, boolean>;
    error?: string;
    code?: string;
  }>;
  modulesSet: (input: unknown) => Promise<{
    ok: boolean;
    businessType?: string;
    modules?: string[];
    overrides?: Record<string, boolean>;
    error?: string;
    code?: string;
  }>;
  batches: (query: unknown) => Promise<{
    ok: boolean;
    items: BatchRow[];
    total: number;
    expiringCount: number;
    expiredCount: number;
    error?: string;
    code?: string;
  }>;
  batchIntake: (
    input: unknown
  ) => Promise<{ ok: boolean; batchId?: string; qtyAfter?: number; error?: string; code?: string }>;
  expiryAlerts: (
    withinDays?: number
  ) => Promise<{ ok: boolean; items: BatchRow[]; error?: string; code?: string }>;
  priceTiers: () => Promise<{
    ok: boolean;
    items: PriceTierRow[];
    error?: string;
    code?: string;
  }>;
  priceTierCreate: (
    input: unknown
  ) => Promise<{ ok: boolean; id?: string; error?: string; code?: string }>;
  priceTierUpdate: (
    id: string,
    patch: unknown
  ) => Promise<{ ok: boolean; error?: string; code?: string }>;
  priceTierDelete: (id: string) => Promise<{ ok: boolean; error?: string; code?: string }>;
  tierPrices: (
    id: string
  ) => Promise<{ ok: boolean; items: TierPriceRow[]; error?: string; code?: string }>;
  tierPricesSet: (
    id: string,
    prices: unknown
  ) => Promise<{ ok: boolean; saved?: number; error?: string; code?: string }>;
  loyaltySettings: () => Promise<{
    ok: boolean;
    settings?: LoyaltySettings;
    error?: string;
    code?: string;
  }>;
  loyaltySettingsSet: (
    input: unknown
  ) => Promise<{ ok: boolean; settings?: LoyaltySettings; error?: string; code?: string }>;
  loyaltyEntries: (customerId: string) => Promise<{
    ok: boolean;
    items: LoyaltyEntryRow[];
    balance: number;
    error?: string;
    code?: string;
  }>;
  loyaltyAdjust: (
    input: unknown
  ) => Promise<{ ok: boolean; balance?: number; error?: string; code?: string }>;
  customerNotes: (
    customerId: string
  ) => Promise<{ ok: boolean; items: CustomerNoteRow[]; error?: string; code?: string }>;
  customerNoteAdd: (
    id: string,
    note: unknown
  ) => Promise<{ ok: boolean; note?: CustomerNoteRow; error?: string; code?: string }>;
  customerVisitSummary: (customerId: string) => Promise<{
    ok: boolean;
    summary?: { visits: number; spentKobo: number; lastVisitAt: string | null };
    error?: string;
    code?: string;
  }>;
  returnLookup: (
    receiptNo: string
  ) => Promise<{ ok: boolean; sale?: SaleDetail; error?: string; code?: string }>;
  returnCreate: (input: unknown) => Promise<{
    ok: boolean;
    id?: string;
    refundKobo?: number;
    fullyReturned?: boolean;
    error?: string;
    code?: string;
  }>;
  returnsList: (query: unknown) => Promise<{
    ok: boolean;
    items: SaleReturnRow[];
    total: number;
    error?: string;
    code?: string;
  }>;
  transfers: (query: unknown) => Promise<{
    ok: boolean;
    items: StockTransferRow[];
    total: number;
    error?: string;
    code?: string;
  }>;
  transferCreate: (input: unknown) => Promise<{
    ok: boolean;
    id?: string;
    reference?: string;
    error?: string;
    code?: string;
  }>;
  debtors: (query: unknown) => Promise<{
    ok: boolean;
    items: DebtorRow[];
    totalKobo: number;
    error?: string;
    code?: string;
  }>;
  debtorRemind: (
    input: unknown
  ) => Promise<{ ok: boolean; result?: DebtorReminderResult; error?: string; code?: string }>;
  cloudBackupSettings: () => Promise<{
    ok: boolean;
    settings?: CloudBackupSettingsView;
    error?: string;
    code?: string;
  }>;
  cloudBackupSave: (input: unknown) => Promise<{
    ok: boolean;
    settings?: CloudBackupSettingsView;
    error?: string;
    code?: string;
  }>;
  cloudBackupRun: () => Promise<{
    ok: boolean;
    fileName?: string;
    sizeBytes?: number;
    uploaded?: boolean;
    error?: string;
    code?: string;
  }>;
  cloudBackupUploads: () => Promise<{
    ok: boolean;
    items: CloudUploadRow[];
    error?: string;
    code?: string;
  }>;

  // --- Batch 17: cash & bank accounts + restaurant service flow ---
  accounts: (query?: unknown) => Promise<{
    ok: boolean;
    items: AccountRow[];
    totalKobo: number;
    error?: string;
    code?: string;
  }>;
  accountCreate: (
    input: unknown
  ) => Promise<{ ok: boolean; account?: AccountRow; error?: string; code?: string }>;
  accountUpdate: (
    id: string,
    patch: unknown
  ) => Promise<{ ok: boolean; account?: AccountRow; error?: string; code?: string }>;
  accountTransfer: (
    input: unknown
  ) => Promise<{ ok: boolean; id?: string; error?: string; code?: string }>;
  accountAdjust: (
    input: unknown
  ) => Promise<{ ok: boolean; id?: string; balanceKobo?: number; error?: string; code?: string }>;
  accountTransactions: (query: unknown) => Promise<{
    ok: boolean;
    items: AccountTransactionRow[];
    moneyInKobo: number;
    moneyOutKobo: number;
    error?: string;
    code?: string;
  }>;
  accountPaymentMap: () => Promise<{
    ok: boolean;
    map: Partial<Record<'cash' | 'transfer' | 'pos', string>>;
    error?: string;
    code?: string;
  }>;
  accountPaymentMapSet: (input: unknown) => Promise<{
    ok: boolean;
    map?: Partial<Record<'cash' | 'transfer' | 'pos', string>>;
    error?: string;
    code?: string;
  }>;
  restaurantSettings: () => Promise<{
    ok: boolean;
    settings?: { serviceChargeBp: number };
    error?: string;
    code?: string;
  }>;
  restaurantSettingsSet: (input: unknown) => Promise<{
    ok: boolean;
    settings?: { serviceChargeBp: number };
    error?: string;
    code?: string;
  }>;
}

export interface BatchRow {
  id: string;
  productId: string;
  productName: string;
  sku: string | null;
  unit: string;
  batchNo: string;
  expiryDate: string | null;
  manufacturedDate: string | null;
  locationId: string;
  locationName: string;
  remaining: number;
  onHand: number;
  nearExpiryDays: number;
  status: 'expired' | 'expiring' | 'ok' | 'empty';
}

export interface PriceTierRow {
  id: string;
  name: string;
  description: string;
  isDefault: boolean;
  customerCount: number;
  priceCount: number;
}

export interface TierPriceRow {
  productId: string;
  name: string;
  sku: string | null;
  unit: string;
  sellingPriceKobo: number;
  tierPriceKobo: number | null;
}

export interface LoyaltySettings {
  enabled: boolean;
  earnKoboPerPoint: number;
  pointValueKobo: number;
}

export interface LoyaltyEntryRow {
  id: string;
  kind: string;
  points: number;
  reason: string;
  saleId: string | null;
  createdAt: string;
  userName: string | null;
}

export interface CustomerNoteRow {
  id: string;
  body: string;
  createdAt: string;
  userName: string | null;
}

export interface SaleReturnRow {
  id: string;
  receiptNo: string;
  saleId: string;
  kind: string;
  reason: string;
  refundKobo: number;
  refundMethod: string;
  createdAt: string;
  userName: string | null;
  itemCount: number;
}

export interface StockTransferRow {
  id: string;
  reference: string;
  fromLocationId: string;
  fromLocationName: string;
  toLocationId: string;
  toLocationName: string;
  note: string;
  createdAt: string;
  items: Array<{ productId: string; productName: string; sku: string | null; qty: number }>;
}

export interface DebtorRow {
  customerId: string;
  name: string;
  phone: string;
  balanceKobo: number;
  lastReminderAt: string | null;
}

export interface DebtorReminderResult {
  attempted: number;
  sent: number;
  dryRun: number;
  failed: number;
  skipped: number;
  errors: string[];
}

export interface CloudBackupSettingsView {
  enabled: boolean;
  url: string;
  keepLocal: boolean;
  keySet: boolean;
  passphraseSet: boolean;
}

export interface CloudUploadRow {
  id: string;
  fileName: string;
  sizeBytes: number;
  status: string;
  error: string;
  createdAt: string;
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

export interface OffsiteBackupStatus {
  configured: boolean;
  prompted: boolean;
  dir: string | null;
  exists: boolean;
  sameDrive: boolean;
  lastCopyAt: string | null;
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
  weekly: Array<{
    weekStart: string;
    transactions: number;
    grossKobo: number;
    taxKobo: number;
    cogsKobo: number;
    grossProfitKobo: number;
    expensesKobo: number;
    netProfitKobo: number;
  }>;
  topProducts: Array<{
    productId: string;
    name: string;
    qty: number;
    revenueKobo: number;
    profitKobo: number;
  }>;
  products: Array<{
    productId: string;
    name: string;
    sku: string;
    qty: number;
    revenueKobo: number;
    profitKobo: number;
    onHand: number;
    reorderLevel: number;
    costValueKobo: number;
    retailValueKobo: number;
  }>;
  stockAlerts: Array<{
    productId: string;
    name: string;
    sku: string;
    onHand: number;
    reorderLevel: number;
    shortfall: number;
    suggestedOrder: number;
    costValueKobo: number;
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
  expenses: {
    totalKobo: number;
    count: number;
    byCategory: Array<{ category: string; count: number; amountKobo: number }>;
  };
  finance: { expensesKobo: number; netProfitKobo: number };
}

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  roleId: string | null;
  roleName: string;
  createdAt: string;
}

export interface StaffRole {
  id: string;
  name: string;
  description: string;
  isSystem: boolean;
  permissions: string[];
  userCount: number;
}

export interface ExpenseRow {
  id: string;
  category: string;
  note: string;
  amountKobo: number;
  paidAt: string;
  locationId: string | null;
  accountId: string | null;
  accountName: string;
  createdBy: string | null;
  createdByName: string;
  createdAt: string;
}

export type AccountKind = 'cash' | 'bank' | 'pos' | 'mobile';

export interface AccountRow {
  id: string;
  name: string;
  kind: AccountKind;
  openingBalanceKobo: number;
  balanceKobo: number;
  isDefault: boolean;
  archived: boolean;
  createdAt: string;
}

export interface AccountTransactionRow {
  id: string;
  accountId: string;
  accountName: string;
  kind: string;
  amountKobo: number;
  reference: string;
  note: string;
  source: string;
  sourceId: string | null;
  createdAt: string;
}

export interface CustomerRow {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  note: string;
  creditLimitKobo: number;
  priceTierId: string | null;
  priceTierName: string | null;
  groupId: string | null;
  groupName: string | null;
  loyaltyPoints: number;
  isActive: boolean;
  balanceKobo: number;
  createdAt: string;
}

export type MasterKind = 'brands' | 'units' | 'warranties' | 'customer-groups';

export interface MasterRow {
  id: string;
  name: string;
  note: string;
  shortName?: string;
  durationDays?: number;
  isActive: boolean;
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
  batchNo: string;
  expiryDate: string | null;
}

export interface StockAdjustmentItemRow {
  id: string;
  productId: string;
  productName: string;
  sku: string | null;
  qtyDelta: number;
  note: string;
}

export interface StockAdjustmentRow {
  id: string;
  reference: string;
  locationId: string;
  locationName: string;
  reason: string;
  note: string;
  createdBy: string | null;
  createdByName: string;
  createdAt: string;
  items: StockAdjustmentItemRow[];
}

export interface PurchaseReturnItemRow {
  id: string;
  productId: string;
  productName: string;
  sku: string | null;
  qty: number;
  unitCostKobo: number;
  lineTotalKobo: number;
}

export interface PurchaseReturnRow {
  id: string;
  reference: string;
  purchaseId: string;
  purchaseReference: string;
  supplierName: string | null;
  reason: string;
  note: string;
  totalKobo: number;
  createdByName: string;
  createdAt: string;
  items: PurchaseReturnItemRow[];
}

export interface MenuReports {
  range: { from: string; to: string; locationId: string | null };
  purchaseSale: {
    daily: Array<{
      date: string;
      salesCount: number;
      salesKobo: number;
      purchaseCount: number;
      purchaseKobo: number;
    }>;
    salesCount: number;
    salesKobo: number;
    purchaseCount: number;
    purchaseKobo: number;
  };
  tax: {
    outputKobo: number;
    inputKobo: number;
    netKobo: number;
    daily: Array<{ date: string; outputKobo: number; inputKobo: number }>;
  };
  customers: Array<{
    customerId: string;
    name: string;
    phone: string;
    groupName: string;
    transactions: number;
    spendKobo: number;
    balanceKobo: number;
  }>;
  suppliers: Array<{
    supplierId: string;
    name: string;
    purchasesKobo: number;
    paidKobo: number;
    returnsKobo: number;
    balanceKobo: number;
  }>;
  receivablesKobo: number;
  payablesKobo: number;
  customerGroups: Array<{
    groupId: string;
    name: string;
    customers: number;
    salesKobo: number;
    creditKobo: number;
  }>;
  stockAdjustments: Array<{
    id: string;
    reference: string;
    date: string;
    locationName: string;
    reason: string;
    lines: number;
    qtyNet: number;
  }>;
  productPurchases: Array<{
    productId: string;
    name: string;
    sku: string;
    qty: number;
    costKobo: number;
  }>;
  purchasePayments: Array<{
    id: string;
    reference: string;
    supplierName: string;
    receivedAt: string;
    totalKobo: number;
    paidKobo: number;
    returnsKobo: number;
    balanceKobo: number;
  }>;
  sellPayments: Array<{ method: string; count: number; amountKobo: number }>;
  registers: Array<{
    locationId: string;
    locationName: string;
    transactions: number;
    grossKobo: number;
    taxKobo: number;
    cashKobo: number;
    transferKobo: number;
    posKobo: number;
    creditKobo: number;
  }>;
  salesReps: Array<{
    userId: string | null;
    name: string;
    transactions: number;
    grossKobo: number;
    discountKobo: number;
    taxKobo: number;
    refundsKobo: number;
  }>;
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
  orderType: string;
  waiterName: string;
  serviceChargeKobo: number;
  tipKobo: number;
  tableId: string | null;
  tableName: string | null;
  customerId: string | null;
  customerName: string | null;
  externalRef: string | null;
  loyaltyPointsRedeemed: number;
  loyaltyDiscountKobo: number;
  loyaltyPointsEarned: number;
  items: SaleItemRow[];
  payments: SalePaymentRow[];
  returns: Array<{
    id: string;
    kind: string;
    reason: string;
    refundKobo: number;
    refundMethod: string;
    createdAt: string;
    itemCount: number;
  }>;
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
  brandId: string | null;
  brandName: string | null;
  warrantyId: string | null;
  warrantyName: string | null;
  unit: string;
  costPriceKobo: number;
  sellingPriceKobo: number;
  reorderLevel: number;
  imagePath: string;
  taxCategoryId: string | null;
  trackBatches: boolean;
  nearExpiryDays: number;
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
