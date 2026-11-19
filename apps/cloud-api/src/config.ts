import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const CLOUD_CONFIG = 'CLOUD_CONFIG';

export interface CloudConfig {
  paystackSecretKey: string;
  orderStorePath: string;
  licensePrivateKeyPem: string;
  /** Fallback lifetime when a plan does not define its own. */
  licenseDays: number;
  websiteUrl: string;
  allowedOrigin: string;
}

/** Accepts a PEM inline (with `\n` escapes) or a path to a key file. */
function privateKeyFromEnv(env: NodeJS.ProcessEnv): string {
  const inline = env.LICENSE_PRIVATE_KEY?.trim();
  if (inline) return inline.replace(/\\n/g, '\n');
  const file = env.LICENSE_PRIVATE_KEY_PATH?.trim();
  if (!file) return '';
  try {
    return readFileSync(file, 'utf8');
  } catch {
    // A missing key only disables issuance; health and checkout stay up so the
    // misconfiguration is visible rather than crashing the process.
    return '';
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): CloudConfig {
  const websiteUrl = (env.WEBSITE_URL?.trim() || 'http://localhost:3000').replace(/\/+$/, '');
  const days = Number(env.LICENSE_DAYS ?? 365);
  return {
    paystackSecretKey: env.PAYSTACK_SECRET_KEY?.trim() ?? '',
    orderStorePath: env.ORDER_STORE_PATH?.trim() || join(process.cwd(), 'data', 'orders.json'),
    licensePrivateKeyPem: privateKeyFromEnv(env),
    licenseDays: Number.isFinite(days) && days > 0 ? Math.floor(days) : 365,
    websiteUrl,
    allowedOrigin: env.CORS_ORIGIN?.trim() || websiteUrl,
  };
}
