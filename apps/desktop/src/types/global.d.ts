export interface SessionUser {
  id: string;
  businessId: string;
  name: string;
  email: string;
  permissions: string[];
 /** `businesses.type` - drives which modules the app shows. */
 businessType: string;
}

export interface AnalytiqApi {
  ping: () => Promise<string>;
  getVersion: () => Promise<string>;
  log: (level: 'info' | 'warn' | 'error', message: string) => Promise<void>;
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
  products: (query: unknown) => Promise<{ ok: boolean; items: ProductRow[]; total: number; error?: string; code?: string }>;
  productGet: (id: string) => Promise<{ ok: boolean; product?: ProductDetail; error?: string; code?: string }>;
  productCreate: (input: unknown) => Promise<{ ok: boolean; id?: string; error?: string; code?: string }>;
  productUpdate: (id: string, patch: unknown) => Promise<{ ok: boolean; error?: string; code?: string }>;
  productArchive: (id: string) => Promise<{ ok: boolean; error?: string; code?: string }>;
  productRestore: (id: string) => Promise<{ ok: boolean; error?: string; code?: string }>;
  stockLevels: (query: unknown) => Promise<{ ok: boolean; items: StockLevelRow[]; total: number; error?: string; code?: string }>;
  stockAdjust: (input: unknown) => Promise<{ ok: boolean; qtyAfter?: number; error?: string; code?: string }>;
  stockCount: (input: unknown) => Promise<{ ok: boolean; qtyAfter?: number; error?: string; code?: string }>;
  stockMovements: (query: unknown) => Promise<{ ok: boolean; items: MovementRow[]; total: number; error?: string; code?: string }>;
  saleCreate: (input: unknown) => Promise<{ ok: boolean; id?: string; receiptNo?: string; totalKobo?: number; changeKobo?: number; error?: string; code?: string }>;
  sales: (query: unknown) => Promise<{ ok: boolean; items: SaleSummaryRow[]; total: number; error?: string; code?: string }>;
  saleGet: (id: string) => Promise<{ ok: boolean; sale?: SaleDetail; error?: string; code?: string }>;
  saleRefund: (id: string, input: unknown) => Promise<{ ok: boolean; error?: string; code?: string }>;
  saleVoid: (id: string, input: unknown) => Promise<{ ok: boolean; error?: string; code?: string }>;
 taxCategories: () => Promise<{ ok: boolean; items: TaxCategory[]; defaultId?: string; error?: string; code?: string }>;
 taxCategoryCreate: (input: unknown) => Promise<{ ok: boolean; category?: TaxCategory; error?: string; code?: string }>;
 taxCategoryUpdate: (id: string, patch: unknown) => Promise<{ ok: boolean; category?: TaxCategory; error?: string; code?: string }>;
 tables: (query: unknown) => Promise<{ ok: boolean; items: DiningTable[]; error?: string; code?: string }>;
 tableCreate: (input: unknown) => Promise<{ ok: boolean; table?: DiningTable; error?: string; code?: string }>;
 tableUpdate: (id: string, patch: unknown) => Promise<{ ok: boolean; table?: DiningTable; error?: string; code?: string }>;
 tableSetStatus: (id: string, input: unknown) => Promise<{ ok: boolean; table?: DiningTable; error?: string; code?: string }>;
 tableDelete: (id: string) => Promise<{ ok: boolean; error?: string; code?: string }>;
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
