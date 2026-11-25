import { describe, expect, it } from 'vitest';
import { describeIpcError } from './errors';

describe('describeIpcError', () => {
  it('unpacks a zod issue array into one readable line', () => {
    const raw = JSON.stringify([
      {
        code: 'too_big',
        path: ['pageSize'],
        message: 'Number must be less than or equal to 200',
      },
    ]);
    expect(describeIpcError(new Error(raw), 'Could not load products')).toBe(
      'pageSize: Number must be less than or equal to 200'
    );
  });

  it('joins several issues with semicolons', () => {
    const raw = JSON.stringify([
      { path: ['name'], message: 'Product name is required' },
      { path: ['unit'], message: 'Unit is required' },
    ]);
    expect(describeIpcError(raw, 'fallback')).toBe(
      'name: Product name is required; unit: Unit is required'
    );
  });

  it('passes plain messages through and falls back on empty input', () => {
    expect(describeIpcError('Database is locked', 'fallback')).toBe('Database is locked');
    expect(describeIpcError('   ', 'fallback')).toBe('fallback');
    expect(describeIpcError(undefined, 'fallback')).toBe('fallback');
  });

  it('keeps raw text that only looks like JSON', () => {
    expect(describeIpcError('[not really json', 'fallback')).toBe('[not really json');
  });
});
