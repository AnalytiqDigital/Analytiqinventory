// CSV parsing for bulk imports.
//
// Handles RFC 4180 (quoted fields, escaped quotes, CRLF) and maps the snake_case
// template columns to the camelCase row shapes the import services expect,
// converting naira text to integer kobo on the way.

import { importTemplates, type ImportKind } from '@analytiq/validation';
import { parseNairaToKobo } from './money';

export interface RowIssue {
  row: number;
  message: string;
}

export interface ImportBuild {
  rows: Record<string, unknown>[];
  errors: RowIssue[];
  headers: string[];
  /** First five data rows, for the preview table. */
  preview: string[][];
  totalRows: number;
}

const HEADER_ALIASES: Record<string, string> = {
  cost: 'cost_price',
  costprice: 'cost_price',
  sellingprice: 'selling_price',
  price: 'selling_price',
  saleprice: 'selling_price',
  reorder: 'reorder_level',
  reorderlevel: 'reorder_level',
  openingstock: 'opening_stock',
  stock: 'opening_stock',
  quantity: 'qty',
  taxcategory: 'tax_category',
  phone: 'supplier_phone',
  supplierphone: 'supplier_phone',
  unitcost: 'unit_cost',
  costpricekobo: 'unit_cost',
  unitprice: 'unit_price',
  sellingpricekobo: 'unit_price',
  discount: 'line_discount',
  receiptno: 'receipt',
  receipt_no: 'receipt',
  payment: 'tender',
  payment_method: 'tender',
  customer_name: 'customer',
  sku_or_barcode: 'sku',
  barcode_or_sku: 'sku',
  branch: 'location',
  store: 'location',
};

const REQUIRED_COLUMNS: Record<ImportKind, string[]> = {
  products: ['name'],
  purchases: ['reference', 'supplier', 'sku', 'qty', 'unit_cost'],
  sales: ['receipt', 'sku', 'qty', 'unit_price'],
  'opening-stock': ['qty'],
  contacts: ['name', 'type'],
};

const TENDERS = new Set(['cash', 'transfer', 'pos', 'credit']);

export function normalizeHeader(raw: string): string {
  const key = raw
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  return HEADER_ALIASES[key] ?? key;
}

export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.length > 1 || (cells[0] ?? '').trim() !== '');
}

function buildProducts(
  value: (name: string) => string,
  rowNo: number,
  errors: RowIssue[]
): Record<string, unknown> {
  return {
    name: value('name').trim(),
    sku: value('sku').trim(),
    barcode: value('barcode').trim(),
    category: value('category').trim(),
    unit: value('unit').trim() || 'pcs',
    costPriceKobo: toKobo(value('cost_price'), false, 'cost_price', rowNo, errors),
    sellingPriceKobo: toKobo(value('selling_price'), false, 'selling_price', rowNo, errors),
    reorderLevel: toInt(value('reorder_level'), false, 'reorder_level', rowNo, errors) ?? 0,
    openingStock: toInt(value('opening_stock'), false, 'opening_stock', rowNo, errors) ?? 0,
    taxCategory: value('tax_category').trim(),
  };
}

function buildPurchases(
  value: (name: string) => string,
  rowNo: number,
  errors: RowIssue[]
): Record<string, unknown> {
  return {
    reference: value('reference').trim(),
    supplier: value('supplier').trim(),
    supplierPhone: value('supplier_phone').trim(),
    date: value('date').trim(),
    sku: value('sku').trim(),
    qty: toInt(value('qty'), true, 'qty', rowNo, errors) ?? 0,
    unitCostKobo: toKobo(value('unit_cost'), true, 'unit_cost', rowNo, errors) ?? 0,
    taxKobo: toKobo(value('tax'), false, 'tax', rowNo, errors) ?? 0,
    note: value('note').trim(),
    received: toBool(value('received')),
  };
}

function buildSales(
  value: (name: string) => string,
  rowNo: number,
  errors: RowIssue[]
): Record<string, unknown> {
  const tender = value('tender').trim().toLowerCase() || 'cash';
  if (!TENDERS.has(tender)) {
    errors.push({ row: rowNo, message: `"tender" must be cash, transfer, pos or credit` });
  }
  const tax = value('tax').trim();
  return {
    receipt: value('receipt').trim(),
    date: value('date').trim(),
    sku: value('sku').trim(),
    qty: toInt(value('qty'), true, 'qty', rowNo, errors) ?? 0,
    unitPriceKobo: toKobo(value('unit_price'), true, 'unit_price', rowNo, errors) ?? 0,
    lineDiscountKobo: toKobo(value('line_discount'), false, 'line_discount', rowNo, errors) ?? 0,
    tender,
    customer: value('customer').trim(),
    taxKobo: tax ? (toKobo(tax, false, 'tax', rowNo, errors) ?? 0) : undefined,
  };
}

function buildOpeningStock(
  value: (name: string) => string,
  rowNo: number,
  errors: RowIssue[]
): Record<string, unknown> {
  const sku = value('sku').trim();
  const barcode = value('barcode').trim();
  const name = value('name').trim();
  if (!sku && !barcode && !name) {
    errors.push({ row: rowNo, message: 'Each row needs a sku, barcode or product name' });
  }
  return {
    sku,
    barcode,
    name,
    qty: toInt(value('qty'), true, 'qty', rowNo, errors) ?? 0,
    location: value('location').trim(),
  };
}

function buildContacts(
  value: (name: string) => string,
  rowNo: number,
  errors: RowIssue[]
): Record<string, unknown> {
  const type = value('type').trim().toLowerCase() || 'customer';
  if (type !== 'customer' && type !== 'supplier') {
    errors.push({ row: rowNo, message: `"type" must be customer or supplier` });
  }
  return {
    name: value('name').trim(),
    type: type === 'supplier' ? 'supplier' : 'customer',
    phone: value('phone').trim(),
    email: value('email').trim(),
    address: value('address').trim(),
    group: value('group').trim(),
  };
}

function toInt(
  raw: string,
  required: boolean,
  label: string,
  row: number,
  errors: RowIssue[]
): number | undefined {
  const value = raw.trim();
  if (!value) {
    if (required) errors.push({ row, message: `"${label}" is required` });
    return undefined;
  }
  if (!/^\d+$/.test(value)) {
    errors.push({ row, message: `"${label}" must be a whole number (got "${value}")` });
    return undefined;
  }
  return Number(value);
}

function toKobo(
  raw: string,
  required: boolean,
  label: string,
  row: number,
  errors: RowIssue[]
): number | undefined {
  const value = raw.trim();
  if (!value) {
    if (required) errors.push({ row, message: `"${label}" is required` });
    return undefined;
  }
  const kobo = parseNairaToKobo(value);
  if (kobo == null) {
    errors.push({ row, message: `"${label}" is not a valid amount (got "${value}")` });
    return undefined;
  }
  return kobo;
}

function toBool(raw: string): boolean {
  return /^(yes|true|1|y)$/i.test(raw.trim());
}

export function buildImport(kind: ImportKind, text: string): ImportBuild {
  const table = parseCsv(text);
  if (table.length === 0) {
    return {
      rows: [],
      errors: [{ row: 1, message: 'The file is empty' }],
      headers: [],
      preview: [],
      totalRows: 0,
    };
  }

  const headerRow = table[0]!;
  const headers = headerRow.map(normalizeHeader);
  const missing = REQUIRED_COLUMNS[kind].filter((column) => !headers.includes(column));
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [
        {
          row: 1,
          message: `Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Use the template.`,
        },
      ],
      headers,
      preview: [],
      totalRows: 0,
    };
  }

  const dataRows = table.slice(1);
  const errors: RowIssue[] = [];
  const rows: Record<string, unknown>[] = [];
  const preview: string[][] = [];
  let totalRows = 0;

  dataRows.forEach((cells, index) => {
    const rowNo = index + 2;
    if (cells.every((cell) => cell.trim() === '')) return;
    totalRows += 1;
    const map = new Map<string, string>();
    headers.forEach((header, column) => {
      map.set(header, cells[column] ?? '');
    });
    const value = (name: string): string => map.get(name) ?? '';

    // Collect every problem before deciding: the dialog blocks import while
    // any error is listed, so rows are only sent when the file is clean.
    rows.push(
      kind === 'products'
        ? buildProducts(value, rowNo, errors)
        : kind === 'purchases'
          ? buildPurchases(value, rowNo, errors)
          : kind === 'sales'
            ? buildSales(value, rowNo, errors)
            : kind === 'opening-stock'
              ? buildOpeningStock(value, rowNo, errors)
              : buildContacts(value, rowNo, errors)
    );
    if (preview.length < 5) preview.push(headers.map((header) => value(header)));
  });

  return { rows, errors, headers, preview, totalRows };
}

export function templateCsv(kind: ImportKind): string {
  return `${importTemplates[kind].join('\r\n')}\r\n`;
}
