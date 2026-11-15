import { beforeEach, describe, expect, it } from 'vitest';
import { useTheme } from './theme';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove('dark');
  useTheme.getState().set('light');
});

describe('theme store', () => {
  it('toggles between light and dark', () => {
    expect(useTheme.getState().mode).toBe('light');
    useTheme.getState().toggle();
    expect(useTheme.getState().mode).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    useTheme.getState().toggle();
    expect(useTheme.getState().mode).toBe('light');
  });
});
