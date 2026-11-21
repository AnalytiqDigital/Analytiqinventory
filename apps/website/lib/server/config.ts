import { readFileSync } from 'node:fs';

export interface WebConfig {
  paystackSecretKey: string;
  licensePrivateKeyPem: string;
  licenseDays: number;
  /** Production site origin. Blank uses the origin of the incoming request. */
  websiteUrl: string;
  /** Google Apps Script web-app URL for email, leads and activation records. */
  appsScriptUrl: string;
  appsScriptSecret: string;
  resendApiKey: string;
  emailFrom: string;
}

function read(env: NodeJS.ProcessEnv, name: string): string {
  return env[name]?.trim() ?? '';
}

function privateKeyFromEnv(env: NodeJS.ProcessEnv): string {
  const inline = read(env, 'LICENSE_PRIVATE_KEY');
  if (inline) return inline.replace(/\\n/g, '\n');
  const file = read(env, 'LICENSE_PRIVATE_KEY_PATH');
  if (!file) return '';
  try {
    return readFileSync(file, 'utf8');
  } catch {
    // A missing key only disables issuance, matching the cloud API.
    return '';
  }
}

export function loadWebConfig(env: NodeJS.ProcessEnv = process.env): WebConfig {
  const days = Number(read(env, 'LICENSE_DAYS') || 365);
  return {
    paystackSecretKey: read(env, 'PAYSTACK_SECRET_KEY'),
    licensePrivateKeyPem: privateKeyFromEnv(env),
    licenseDays: Number.isFinite(days) && days > 0 ? Math.floor(days) : 365,
    websiteUrl: read(env, 'WEBSITE_URL').replace(/\/+$/, ''),
    appsScriptUrl: read(env, 'APPS_SCRIPT_URL'),
    appsScriptSecret: read(env, 'APPS_SCRIPT_SECRET'),
    resendApiKey: read(env, 'RESEND_API_KEY'),
    emailFrom: read(env, 'EMAIL_FROM'),
  };
}
