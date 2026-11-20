import { describe, expect, it } from 'vitest';
import { CORE_MODULES, isRestaurant, resolveModules } from './index';

describe('business-type module gating', () => {
  it('gives every business the core modules', () => {
    for (const type of ['retail', 'restaurant', 'pharmacy', 'services', 'other']) {
      const modules = resolveModules(type);
      for (const core of CORE_MODULES) expect(modules.has(core)).toBe(true);
    }
  });

  it('only restaurants get tables by default', () => {
    expect(resolveModules('restaurant').has('tables')).toBe(true);
    for (const type of ['retail', 'supermarket', 'pharmacy', 'wholesale', 'services', 'other']) {
      expect(resolveModules(type).has('tables')).toBe(false);
    }
  });

  it('services businesses do not get suppliers by default', () => {
    expect(resolveModules('services').has('suppliers')).toBe(false);
    expect(resolveModules('retail').has('suppliers')).toBe(true);
  });

  it('installs expenses for every business type by default', () => {
    for (const type of [
      'retail',
      'supermarket',
      'wholesale',
      'restaurant',
      'bar',
      'pharmacy',
      'electronics',
      'boutique',
      'services',
      'other',
    ]) {
      expect(resolveModules(type).has('expenses')).toBe(true);
    }
    expect(resolveModules('retail', { expenses: false }).has('expenses')).toBe(false);
  });

  it('an override can switch a module on', () => {
    expect(resolveModules('retail').has('tables')).toBe(false);
    expect(resolveModules('retail', { tables: true }).has('tables')).toBe(true);
  });

  it('an override can switch a module off', () => {
    expect(resolveModules('restaurant').has('tables')).toBe(true);
    expect(resolveModules('restaurant', { tables: false }).has('tables')).toBe(false);
  });

  it('an unknown business type falls back to the "other" preset', () => {
    const modules = resolveModules('not-a-real-type');
    expect(modules.has('pos')).toBe(true);
    expect(modules.has('tables')).toBe(false);
  });

  it('isRestaurant identifies the restaurant type only', () => {
    expect(isRestaurant('restaurant')).toBe(true);
    expect(isRestaurant('retail')).toBe(false);
  });
});
