# Offline license keys

AnalytIQ is sold with **offline, signed license keys**. A key is created once by
the vendor and pasted into the app on the customer's computer. Nothing is sent
over the network: the app only needs the vendor's **public** key to check the
signature.

- Package: `packages/licensing`
- Embedded public key: `packages/licensing/src/publicKey.ts`
- Signing material: `.secrets/license-private.pem` (git-ignored, never shipped)

## How a key works

```
ANQ1.<payload>.<signature>
```

- `ANQ1` — format marker. Anything else is rejected before parsing.
- `payload` — base64url JSON: `{ v, id, business, plan, issued, expires, device }`.
  `expires: null` means perpetual; `device: null` means any installation.
- `signature` — base64url Ed25519 signature over the raw payload bytes.

The app verifies the signature with the embedded public key, then checks:

1. **Device** — if the payload names an installation id, it must match this
   install's id (`schema_meta['license.install_id']`).
2. **Expiry** — a key is valid through the end of its expiry day (UTC), then
   reported as `expired`.

Licensing state is stored in `schema_meta`, the global key/value table:

| Key                     | Meaning                                  |
| ----------------------- | ---------------------------------------- |
| `license.key`           | The activated key, exactly as pasted     |
| `license.activated_at`  | ISO timestamp of activation              |
| `license.trial_started` | ISO timestamp of the first license check |
| `license.install_id`    | Random 32-hex id for this installation   |

Because this table is outside business data, renames, extra users and business
data restores do not disturb the license. A full restore that replaces the
installation id is treated as a different computer.

## Trial

Every new installation starts a **14-day trial**. The clock starts on the first
license check, not on install, so unpacking the app early does not burn the
trial. After the trial ends, business screens are locked until a key is
activated; the activation screen, session endpoints, and `GET /api/status`
remain available.

## Issuing a key

One-time key generation (on a vendor machine, never on a customer machine):

```bash
cd packages/licensing
node scripts/keygen.mjs
```

This writes `.secrets/license-private.pem` (mode `0600`) and replaces the
placeholder in `src/publicKey.ts` with the matching public key. Back up the
private key somewhere safe and offline: if it is lost, every key must be
re-issued with a new keypair and a new app build.

Issue a key:

```bash
pnpm --filter @analytiq/licensing build
node packages/licensing/scripts/issue.mjs \
  --business "Ada's Supermart" \
  --plan pro \
  --days 365 \
  --device 4b2f...            # optional: lock to one installation
```

Options:

| Flag         | Meaning                                                      |
| ------------ | ------------------------------------------------------------ |
| `--business` | Customer name, printed on the activation screen              |
| `--plan`     | `starter`, `standard`, `pro`, or any agreed plan             |
| `--days`     | Days until expiry; omit or `0` for perpetual                 |
| `--device`   | Installation id to bind to; omit for any computer            |
| `--key`      | Private key path; defaults to `.secrets/license-private.pem` |
| `--json`     | Print `{ key, payload }` instead of just the key             |

The key is written to **stdout**; progress and payload details go to stderr, so
output can be piped safely:

```bash
node packages/licensing/scripts/issue.mjs --business "Ada's Supermart" --json > key.json
```

## Activating a key

In the app: **Settings → License → Manage license**, paste the key as an
administrator and choose **Activate this computer**. The screen shows the
activation state, plan, expiry, license id and this installation's id (with a
copy button, so a device-bound key can be requested).

The activation screen is reachable when the copy is unlicensed or expired. It
requires the `settings.manage` permission (administrators only).

## Enforcement points

Both app modes enforce licensing the same way, so a client machine cannot
bypass it:

- **Desktop (primary)** — every business IPC handler goes through
  `requireUser()`, which rejects with `LICENSE_REQUIRED` when the license is not
  usable. `license:status` and `license:activate` use the session directly so
  they keep working while locked.
- **LAN server** — the protected `/api` scope checks the license in its
  `preHandler`. Only `/api/auth/logout`, `/api/auth/me`,
  `/api/license/status` and `/api/license/activate` are exempt; everything else
  returns `403 { code: 'LICENSE_REQUIRED' }`.
- **Renderer** — `LicenseGate` redirects locked copies to `/license`. It is a
  convenience only; the two gates above are the real ones.

## Key files

| File                                     | Purpose                                                   |
| ---------------------------------------- | --------------------------------------------------------- |
| `packages/licensing/src/index.ts`        | Sign, verify, activate, trial and status logic            |
| `packages/licensing/src/publicKey.ts`    | Embedded public key (placeholder until `keygen.mjs` runs) |
| `packages/licensing/scripts/keygen.mjs`  | Generate the vendor keypair once                          |
| `packages/licensing/scripts/issue.mjs`   | Issue a key from the private key                          |
| `packages/licensing/src/license.test.ts` | Signature, tamper, expiry, device, trial tests            |

## Security notes

- The private key stays off the repository and off customer machines. `.secrets/`
  is git-ignored; the keygen script never prints the private key.
- The shipped public key cannot be used to create keys — only to verify them.
- An empty `LICENSE_PUBLIC_KEY` is a safe placeholder: such a build runs its
  trial but cannot activate until the key is embedded and the app rebuilt.
- Keys are stored verbatim; support can read them back to diagnose an
  activation problem. Removing the key (`deactivateLicense`) does **not** reset
  the trial.

## Tests

```bash
cd packages/licensing
ELECTRON_RUN_AS_NODE=1 ../../apps/desktop/node_modules/electron/dist/electron.exe \
  node_modules/vitest/vitest.mjs run
```

The LAN server suite also covers the HTTP gate and activation:

```bash
cd apps/local-server
ELECTRON_RUN_AS_NODE=1 ../../apps/desktop/node_modules/electron/dist/electron.exe \
  node_modules/vitest/vitest.mjs run
```
