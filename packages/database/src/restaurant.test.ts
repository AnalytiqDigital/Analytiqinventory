import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeLocalDb, openLocalDb, type LocalDb } from './connection';
import { createProduct, getProduct } from './inventory';
import { runMigrations } from './migrate';
import { createSale, getSale } from './sales';
import { runSetup } from './service';
import {
 createTable,
 deleteTable,
 listTables,
 setTableStatus,
 updateTable,
} from './tables';
import {
 createTaxCategory,
 ensureDefaultTaxCategory,
 listTaxCategories,
 updateTaxCategory,
} from './taxCategories';

const GRANTS = [
 'products.manage',
 'inventory.adjust',
 'inventory.view',
 'sales.create',
 'sales.refund',
 'sales.view',
 'settings.manage',
];

function setupInput() {
 return {
 business: {
 name: 'Test Mart',
 type: 'retail',
 address: '',
 state: 'Lagos',
 lga: 'Ikeja',
 phone: '+2348012345678',
 email: 'info@testmart.ng',
 currency: 'ngn',
 taxLabel: 'VAT',
 taxRateBps: 750,
 },
 location: { name: 'Main Store', address: '', state: 'Lagos', lga: 'Ikeja' },
 admin: { name: 'Ada Admin', email: 'ada@testmart.ng', password: 'Admin1234' },
 };
}

describe('restaurant pack', () => {
 let dir: string;
 let local: LocalDb;
 let businessId: string;
 let userId: string;

 beforeEach(async () => {
 dir = mkdtempSync(join(tmpdir(), 'analytiq-restaurant-'));
 runMigrations(join(dir, 'local.db'));
 local = openLocalDb(join(dir, 'local.db'));
 ({ businessId, userId } = await runSetup(local, setupInput()));
 });

 afterEach(() => {
 closeLocalDb(local);
 });

 it('creates and lists tax categories, seeded with a default', async () => {
 const seeded = await ensureDefaultTaxCategory(local, businessId);
 expect(seeded.name).toBe('Standard');
 expect(seeded.rateBps).toBe(750);

 const food = await createTaxCategory(local, businessId, userId, GRANTS, {
 name: 'Food',
 rateBps: 750,
 });
 const alcohol = await createTaxCategory(local, businessId, userId, GRANTS, {
 name: 'Alcohol',
 rateBps: 1000,
 });
 expect(food.rateBps).toBe(750);
 expect(alcohol.rateBps).toBe(1000);

 const all = await listTaxCategories(local, businessId);
 expect(all.map((c) => c.name).sort()).toEqual(['Alcohol', 'Food', 'Standard']);

 await expect(
 createTaxCategory(local, businessId, userId, GRANTS, { name: 'Food', rateBps: 500 }),
 ).rejects.toMatchObject({ code: 'TAX_CATEGORY_EXISTS' });

 const updated = await updateTaxCategory(local, businessId, userId, GRANTS, food.id, {
 rateBps: 500,
 });
 expect(updated.rateBps).toBe(500);

 await expect(
 createTaxCategory(local, businessId, userId, [], { name: 'Nope', rateBps: 100 }),
 ).rejects.toMatchObject({ code: 'FORBIDDEN' });
 });

 it('applies per-category tax rates on sale lines', async () => {
 const food = await createTaxCategory(local, businessId, userId, GRANTS, {
 name: 'Food',
 rateBps: 750,
 });
 const alcohol = await createTaxCategory(local, businessId, userId, GRANTS, {
 name: 'Alcohol',
 rateBps: 1000,
 });
 const { id: riceId } = await createProduct(local, businessId, userId, GRANTS, {
 name: 'Jollof Rice',
 sellingPriceKobo: 10000,
 taxCategoryId: food.id,
 openingStock: 50,
 });
 const { id: beerId } = await createProduct(local, businessId, userId, GRANTS, {
 name: 'Lager',
 sellingPriceKobo: 20000,
 taxCategoryId: alcohol.id,
 openingStock: 50,
 });
 const { id: plainId } = await createProduct(local, businessId, userId, GRANTS, {
 name: 'Plain Item',
 sellingPriceKobo: 10000,
 openingStock: 50,
 });

 const res = await createSale(
 local,
 businessId,
 userId,
 GRANTS,
 {
 items: [
 { productId: riceId, qty: 1 },
 { productId: beerId, qty: 1 },
 { productId: plainId, qty: 1 },
 ],
 payments: [{ method: 'cash', amountKobo: 50000 }],
 },
 );
 // Food 10000×7.5% = 750, Alcohol 20000×10% = 2000, fallback 10000×7.5% = 750
 // subtotal 40000 + tax 3500 = 43500
 expect(res.totalKobo).toBe(43500);
 });

 it('creates products with images and tax categories', async () => {
 const food = await createTaxCategory(local, businessId, userId, GRANTS, {
 name: 'Food',
 rateBps: 750,
 });
 const { id } = await createProduct(local, businessId, userId, GRANTS, {
 name: 'Burger',
 sellingPriceKobo: 50000,
 imagePath: 'product-images/burger.png',
 taxCategoryId: food.id,
 openingStock: 10,
 });
 const detail = await getProduct(local, businessId, id);
 expect(detail.imagePath).toBe('product-images/burger.png');
 expect(detail.taxCategoryId).toBe(food.id);

 await expect(
 createProduct(local, businessId, userId, GRANTS, {
 name: 'Bad Tax',
 sellingPriceKobo: 100,
 taxCategoryId: 'tax_missing',
 }),
 ).rejects.toMatchObject({ code: 'TAX_CATEGORY_NOT_FOUND' });
 });

 it('manages tables and tags sales with the table name', async () => {
 const t1 = await createTable(local, businessId, userId, GRANTS, { name: 'T1', seats: 4 });
 expect(t1.status).toBe('free');
 const t2 = await createTable(local, businessId, userId, GRANTS, { name: 'T2', seats: 2 });
 expect((await listTables(local, businessId, {})).map((t) => t.name).sort()).toEqual([
 'T1',
 'T2',
 ]);

 await expect(
 createTable(local, businessId, userId, GRANTS, { name: 'T1', seats: 6 }),
 ).rejects.toMatchObject({ code: 'TABLE_EXISTS' });

 const renamed = await updateTable(local, businessId, userId, GRANTS, t2.id, { name: 'T3' });
 expect(renamed.name).toBe('T3');

 const { id: prodId } = await createProduct(local, businessId, userId, GRANTS, {
 name: 'Tea',
 sellingPriceKobo: 10000,
 openingStock: 20,
 });
 const sale = await createSale(local, businessId, userId, GRANTS, {
 items: [{ productId: prodId, qty: 1 }],
 payments: [{ method: 'cash', amountKobo: 20000 }],
 tableId: t1.id,
 });
 // Payment completes the sale, so the table is free again afterwards.
 expect((await listTables(local, businessId, {})).find((t) => t.id === t1.id)?.status).toBe(
 'free',
 );
 const detail = await getSale(local, businessId, GRANTS, sale.id);
 expect(detail.tableId).toBe(t1.id);
 expect(detail.tableName).toBe('T1');

 await expect(
 createSale(local, businessId, userId, GRANTS, {
 items: [{ productId: prodId, qty: 1 }],
 payments: [{ method: 'cash', amountKobo: 20000 }],
 tableId: 'tbl_missing',
 }),
 ).rejects.toMatchObject({ code: 'TABLE_NOT_FOUND' });

 // Occupied tables block new sales and cannot be removed.
 await setTableStatus(local, businessId, userId, GRANTS, t1.id, { status: 'occupied' });
 await expect(
 createSale(local, businessId, userId, GRANTS, {
 items: [{ productId: prodId, qty: 1 }],
 payments: [{ method: 'cash', amountKobo: 20000 }],
 tableId: t1.id,
 }),
 ).rejects.toMatchObject({ code: 'TABLE_OCCUPIED' });
 await expect(deleteTable(local, businessId, userId, GRANTS, t1.id)).rejects.toMatchObject({
 code: 'TABLE_OCCUPIED',
 });
 await setTableStatus(local, businessId, userId, GRANTS, t1.id, { status: 'free' });
 await expect(deleteTable(local, businessId, userId, GRANTS, t1.id)).rejects.toMatchObject({
 code: 'TABLE_HAS_SALES',
 });
 await deleteTable(local, businessId, userId, GRANTS, t2.id);
 expect((await listTables(local, businessId, {})).map((t) => t.name)).toEqual(['T1']);
 });
});
