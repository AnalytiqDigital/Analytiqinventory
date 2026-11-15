import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');

describe('batch 1 scaffold', () => {
  it('has workspace files', () => {
    for (const f of ['package.json', 'pnpm-workspace.yaml', 'turbo.json', 'tsconfig.base.json']) {
      expect(existsSync(join(root, f)), f).toBe(true);
    }
  });
  it('has all apps and packages', () => {
    for (const d of ['apps/desktop', 'apps/local-server', 'apps/cloud-api', 'apps/website']) {
      expect(existsSync(join(root, d, 'package.json')), d).toBe(true);
    }
    for (const p of ['shared-types', 'validation', 'business-logic', 'database', 'sync-engine', 'licensing-sdk', 'shared-ui']) {
      expect(existsSync(join(root, 'packages', p, 'package.json')), p).toBe(true);
    }
  });
  it('electron main uses secure defaults', () => {
    const main = readFileSync(join(root, 'apps/desktop/electron/main.ts'), 'utf8');
    expect(main).toContain('contextIsolation: true');
    expect(main).toContain('nodeIntegration: false');
  });
  it('no secrets committed', () => {
    const env = readFileSync(join(root, 'apps/cloud-api/.env.example'), 'utf8');
    expect(env).not.toMatch(/sk_live|sk_test_[A-Za-z0-9]{10,}/);
  });
});
