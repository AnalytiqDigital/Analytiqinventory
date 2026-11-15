# Authentication & Setup (Batch 3)

## First-run setup

- Trigger: `auth:status` reports `setupComplete: false` when the `users`
  table is empty. The renderer routes to `/setup`.
- `SetupPage` collects business (name, type, address, phone, email, currency,
  tax label/rate), default location, and administrator account — all validated
  with `setupSchema` (React Hook Form + Zod).
- `runSetup()` inserts business, default location, 12 seeded permissions, 3
  system roles (Administrator/Manager/Cashier), the admin user, the role
  assignment, settings, and an audit record inside one synchronous
  better-sqlite3 transaction. A second setup attempt fails with
  `ALREADY_SETUP`.
- NGN is the default currency; any 3-letter code is accepted and upper-cased.

## Login / sessions

- `login()` validates with `loginSchema`, compares passwords with
  timing-safe scrypt verification, and issues a 256-bit session token
  (12 h TTL). Only the SHA-256 `tokenHash` is stored; the token itself lives
  in main-process memory and is never exposed to the renderer or disk.
- Failed attempts increment `failed_attempts`; 5 failures lock the account
  for 15 minutes (`ACCOUNT_LOCKED`). Success resets the counter.
- `authenticate()` resolves the current user + permission set for `auth:me`.
  `logout()` revokes the session row.
- Renderer state: `useSession` (`user`, `checked`, `refresh`, `signIn`,
  `signOut`, `can`). `RequireAuth` gates all app routes; `RequirePermission`
  hides gated UI; nav items declare their required permission.

## Roles

| Role | Permissions |
|---|---|
| Administrator | all 12 |
| Manager | sales, refunds, products, inventory, purchases, customers, suppliers, reports |
| Cashier | sales.create, sales.view, inventory.view |

## Crypto note

Desktop password hashing uses Node `scrypt` (N=16384, r=8, p=1, 64-byte key,
versioned `scrypt1:` prefix) to avoid shipping a native argon2 module in the
Electron bundle. The locked **Argon2id** requirement applies to the LAN/cloud
servers (Batches 7–8); the hash format supports re-hashing on login when that
migration happens.

## Audit

`auth.login`, `auth.login.failed`, and `business.setup` are written to
`audit_logs` with business/user/entity references and JSON details.
