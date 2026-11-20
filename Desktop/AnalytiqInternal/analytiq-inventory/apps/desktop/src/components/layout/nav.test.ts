import { describe, expect, it } from 'vitest';
import { hasModule, visibleNavItems } from './nav';

const allowAll = () => true;
const denyAll = () => false;

describe('nav module gating', () => {
  it('shows Tables to a restaurant', () => {
    const items = visibleNavItems('restaurant', allowAll);
    expect(items.some((i) => i.to === '/tables')).toBe(true);
  });

  it('hides Tables from a pharmacy, supermarket and service business', () => {
    for (const type of ['pharmacy', 'supermarket', 'retail', 'services', 'wholesale', 'other']) {
      const items = visibleNavItems(type, allowAll);
      expect(items.some((i) => i.to === '/tables')).toBe(false);
    }
  });

  it('hides Suppliers from a service business but keeps it for retail', () => {
    expect(visibleNavItems('services', allowAll).some((i) => i.to === '/suppliers')).toBe(false);
    expect(visibleNavItems('retail', allowAll).some((i) => i.to === '/suppliers')).toBe(true);
  });

  it('always keeps the core screens', () => {
    const items = visibleNavItems('pharmacy', allowAll);
    for (const to of ['/', '/pos', '/products', '/inventory']) {
      expect(items.some((i) => i.to === to)).toBe(true);
    }
  });

  it('still respects permissions on top of modules', () => {
    const items = visibleNavItems('restaurant', denyAll);
    expect(items.some((i) => i.to === '/tables')).toBe(false);
    expect(items.some((i) => i.to === '/pos')).toBe(false);
    // Items with no permission requirement survive.
    expect(items.some((i) => i.to === '/')).toBe(true);
  });

  it('treats an unknown business type as "other"', () => {
    const items = visibleNavItems('not-a-type', allowAll);
    expect(items.some((i) => i.to === '/tables')).toBe(false);
    expect(items.some((i) => i.to === '/pos')).toBe(true);
  });

  it('hasModule agrees with the nav', () => {
    expect(hasModule('restaurant', 'tables')).toBe(true);
    expect(hasModule('pharmacy', 'tables')).toBe(false);
  });

  it('honours the installed module list over the business defaults', () => {
    const installed = ['tables', 'expiry', 'loyalty'];
    expect(hasModule('pharmacy', 'tables', installed)).toBe(true);
    expect(hasModule('restaurant', 'tables', ['expiry'])).toBe(false);
    const items = visibleNavItems('pharmacy', allowAll, installed);
    expect(items.some((i) => i.to === '/tables')).toBe(true);
    expect(items.some((i) => i.to === '/batches')).toBe(true);
    expect(items.some((i) => i.to === '/transfers')).toBe(false);
  });

  it('shows the Phase B screens when their modules are installed', () => {
    const items = visibleNavItems('retail', allowAll, [
      'returns',
      'transfers',
      'priceTiers',
      'expiry',
      'customers',
    ]);
    for (const to of ['/returns', '/transfers', '/price-lists', '/batches', '/debtors']) {
      expect(items.some((i) => i.to === to)).toBe(true);
    }
  });

  it('hides the Phase B screens when their modules are off', () => {
    const items = visibleNavItems('retail', allowAll, ['customers']);
    for (const to of ['/returns', '/transfers', '/price-lists', '/batches']) {
      expect(items.some((i) => i.to === to)).toBe(false);
    }
  });

  it('shows Accounting only to staff with reports.view', () => {
    expect(visibleNavItems('retail', allowAll).some((i) => i.to === '/accounting')).toBe(true);
    expect(visibleNavItems('retail', denyAll).some((i) => i.to === '/accounting')).toBe(false);
  });

  it('shows Expenses only with finance.manage and the expenses module', () => {
    const financeOnly = (permission: string) => permission === 'finance.manage';
    expect(visibleNavItems('retail', financeOnly).some((i) => i.to === '/expenses')).toBe(true);
    expect(visibleNavItems('retail', allowAll, ['finance']).some((i) => i.to === '/expenses')).toBe(
      false
    );
    expect(visibleNavItems('retail', denyAll).some((i) => i.to === '/expenses')).toBe(false);
  });

  it('shows the Phase 1 screens for a retail shop', () => {
    const items = visibleNavItems('retail', allowAll);
    for (const to of ['/labels', '/masters', '/stock-adjustments', '/staff', '/purchase-returns']) {
      expect(items.some((i) => i.to === to)).toBe(true);
    }
  });

  it('keeps purchase returns behind the purchases module and permission', () => {
    expect(visibleNavItems('retail', allowAll, ['customers']).some((i) => i.to === '/purchase-returns')).toBe(
      false
    );
    const purchasesOnly = (permission: string) => permission === 'purchases.manage';
    expect(visibleNavItems('retail', purchasesOnly).some((i) => i.to === '/purchase-returns')).toBe(
      true
    );
    expect(visibleNavItems('retail', denyAll).some((i) => i.to === '/purchase-returns')).toBe(false);
  });

  it('keeps printing labels behind products.manage', () => {
    expect(visibleNavItems('retail', denyAll).some((i) => i.to === '/labels')).toBe(false);
    expect(visibleNavItems('retail', denyAll).some((i) => i.to === '/stock-adjustments')).toBe(false);
  });
});
