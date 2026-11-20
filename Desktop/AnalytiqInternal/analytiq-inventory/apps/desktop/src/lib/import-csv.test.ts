import { describe, expect, it } from 'vitest';
import { buildImport, parseCsv, templateCsv } from './import-csv';

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, commas and CRLF', () => {
    const rows = parseCsv('name,note\r\n"Indomie, 70g","He said ""hi"""\r\n');
    expect(rows).toEqual([
      ['name', 'note'],
      ['Indomie, 70g', 'He said "hi"'],
    ]);
  });

  it('handles quoted newlines and a trailing blank line', () => {
    expect(parseCsv('a,b\n"line1\nline2",x\n\n')).toEqual([
      ['a', 'b'],
      ['line1\nline2', 'x'],
    ]);
  });

  it('drops a UTF-8 BOM', () => {
    expect(parseCsv('\uFEFFname\nAda\n')[0]).toEqual(['name']);
  });
});

describe('buildImport', () => {
  it('maps the product template with naira converted to kobo', () => {
    const result = buildImport('products', templateCsv('products'));
    expect(result.errors).toEqual([]);
    expect(result.totalRows).toBe(1);
    expect(result.rows[0]).toMatchObject({
      name: 'Indomie 70g',
      sku: 'IND-70',
      barcode: '6151100012345',
      category: 'Noodles',
      costPriceKobo: 32000,
      sellingPriceKobo: 45000,
      reorderLevel: 10,
      openingStock: 100,
    });
  });

  it('maps purchases and reads the received flag', () => {
    const result = buildImport('purchases', templateCsv('purchases'));
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      reference: 'PUR-1001',
      supplier: 'Peak Foods',
      qty: 240,
      unitCostKobo: 30000,
      taxKobo: 0,
      received: true,
    });
  });

  it('maps historical sales', () => {
    const result = buildImport('sales', templateCsv('sales'));
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      receipt: 'INV-0001',
      sku: 'IND-70',
      qty: 2,
      unitPriceKobo: 45000,
      lineDiscountKobo: 0,
      tender: 'cash',
    });
  });

  it('reports the row number for bad amounts and quantities', () => {
    const csv = 'name,sku,selling_price,opening_stock\nGood,SKU-1,450.00,4\nBad,SKU-2,four,2.5\n';
    const result = buildImport('products', csv);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]).toEqual({ row: 3, message: expect.stringContaining('selling_price') });
    expect(result.errors[1]).toEqual({ row: 3, message: expect.stringContaining('opening_stock') });
  });

  it('refuses a file without the required columns', () => {
    const result = buildImport('purchases', 'reference,supplier\nP1,Acme\n');
    expect(result.rows).toEqual([]);
    expect(result.errors[0]?.message).toContain('sku');
    expect(result.errors[0]?.message).toContain('unit_cost');
  });

  it('accepts friendly header aliases', () => {
    const result = buildImport('products', 'name,cost,saleprice,stock\nRice,1000,1500,20\n');
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      costPriceKobo: 100000,
      sellingPriceKobo: 150000,
      openingStock: 20,
    });
  });

  it('flags an unknown tender', () => {
    const result = buildImport(
      'sales',
      'receipt,date,sku,qty,unit_price,tender\nINV-9,,SKU-1,1,100,cheque\n'
    );
    expect(result.errors[0]?.message).toContain('tender');
  });

  it('maps the opening stock template and branch alias', () => {
    const result = buildImport('opening-stock', templateCsv('opening-stock'));
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({ sku: 'IND-70', barcode: '', qty: 100, location: '' });

    const aliased = buildImport('opening-stock', 'sku,branch,qty\nIND-70,Main Store,12\n');
    expect(aliased.errors).toEqual([]);
    expect(aliased.rows[0]).toMatchObject({ location: 'Main Store', qty: 12 });
  });

  it('needs a way to identify the product on an opening stock row', () => {
    const result = buildImport('opening-stock', 'sku,barcode,name,qty\n,,,5\n');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toContain('sku, barcode or product name');
  });

  it('maps contacts and rejects an unknown type', () => {
    const ok = buildImport('contacts', templateCsv('contacts'));
    expect(ok.errors).toEqual([]);
    expect(ok.rows[0]).toMatchObject({
      name: 'Ada Obi',
      type: 'customer',
      group: 'Wholesale',
    });
    expect(ok.rows[1]).toMatchObject({ name: 'Peak Foods', type: 'supplier' });

    const bad = buildImport('contacts', 'name,type\nAcme,partner\n');
    expect(bad.errors[0]?.message).toContain('customer or supplier');
  });
});
