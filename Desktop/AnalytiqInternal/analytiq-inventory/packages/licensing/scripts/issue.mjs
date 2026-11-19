#!/usr/bin/env node
// Issue an offline license key with the vendor's private key.
//
//   pnpm --filter @analytiq/licensing build
//   pnpm --filter @analytiq/licensing issue -- --business "Ada Stores" --plan standard --days 365
//   pnpm --filter @analytiq/licensing issue -- --business "Ada Stores" --device <install id>
//
// Options:
//   --business <name>   required
//   --plan <name>       default: standard
//   --days <n>          days until expiry; omit for a perpetual key
//   --device <id>       bind to one installation (copy the id from the app's
//                       License screen); omit for any installation
//   --key <path>        private key PEM (default: .secrets/license-private.pem)
//   --json              print the full payload as JSON

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const [name, inline] = arg.slice(2).split('=');
    if (name === 'json') {
      out.json = true;
      continue;
    }
    out[name] = inline ?? argv[i + 1];
    if (inline === undefined) i += 1;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (!args.business) {
  console.error(
    'Usage: pnpm --filter @analytiq/licensing issue -- --business "Name" [--plan standard] [--days 365] [--device <install id>] [--json]'
  );
  process.exit(1);
}

const keyPath = resolve(args.key ?? join(here, '..', '..', '..', '.secrets', 'license-private.pem'));
if (!existsSync(keyPath)) {
  console.error(
    `Private key not found at ${keyPath}.\nRun: pnpm --filter @analytiq/licensing keygen`
  );
  process.exit(1);
}

let issueLicense;
try {
  ({ issueLicense } = await import('../dist/index.js'));
} catch {
  console.error('Build the package first: pnpm --filter @analytiq/licensing build');
  process.exit(1);
}

const days = args.days === undefined ? 0 : Number(args.days);
if (!Number.isFinite(days) || days < 0) {
  console.error('--days must be a non-negative number');
  process.exit(1);
}

const result = issueLicense({
  business: args.business,
  plan: args.plan,
  days,
  device: args.device ?? null,
  privateKeyPem: readFileSync(keyPath, 'utf8'),
});

if (args.json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(result.key);
  console.error(
    `\nBusiness: ${result.payload.business}\nPlan: ${result.payload.plan}\n` +
      `Expires: ${result.payload.expires ?? 'never'}\nInstall: ${result.payload.device ?? 'any'}`
  );
}
