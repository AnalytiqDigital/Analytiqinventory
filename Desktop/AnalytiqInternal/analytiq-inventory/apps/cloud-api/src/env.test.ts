import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadEnvFile } from './env';

const dir = mkdtempSync(join(tmpdir(), 'analytiq-env-'));
const envPath = join(dir, '.env');

afterEach(() => {
  delete process.env.ANALYTIQ_TEST_A;
  delete process.env.ANALYTIQ_TEST_B;
});

describe('loadEnvFile', () => {
  it('loads plain and quoted values and skips comments and blanks', () => {
    writeFileSync(envPath, '# comment\n\nANALYTIQ_TEST_A=hello\nANALYTIQ_TEST_B="two words"\n');
    loadEnvFile(envPath);
    expect(process.env.ANALYTIQ_TEST_A).toBe('hello');
    expect(process.env.ANALYTIQ_TEST_B).toBe('two words');
  });

  it('never overrides variables already set in the environment', () => {
    process.env.ANALYTIQ_TEST_A = 'existing';
    writeFileSync(envPath, 'ANALYTIQ_TEST_A=from-file\n');
    loadEnvFile(envPath);
    expect(process.env.ANALYTIQ_TEST_A).toBe('existing');
  });

  it('does nothing when the file does not exist', () => {
    expect(() => loadEnvFile(join(dir, 'missing.env'))).not.toThrow();
  });
});
