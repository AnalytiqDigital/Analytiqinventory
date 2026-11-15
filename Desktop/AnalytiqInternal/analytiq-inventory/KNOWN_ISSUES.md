# Known Issues

## Batch 4

- Builds/tests unverified: shell execution blocked, so `bash
  scripts/verify-batch-4.sh` must run locally. Review pass fixed two real
  bugs without running code: `getLevels` lowOnly `HAVING` referenced the
  `onHand` SELECT alias (invalid inside the COUNT subquery — now repeats
  the aggregate), and `ProductDetailPage` dereferenced possibly-undefined
  query data. `getLevels`/`listMovements` still use raw SQL — the new
  lowOnly regression test in `inventory.test.ts` covers the count path.
- `products` nav requires `products.manage`, so cashiers never see the
  product list; the POS search (Batch 5) will need a sale-scoped lookup.
- Multi-location UI is minimal (default location only at setup); extra
  locations need manual DB rows until settings UI lands.
- Topbar search still visual-only; product search lives on Products/Inventory
  pages until global search arrives.

## Batch 3

- Builds/tests unverified: shell execution blocked, so `bash
  scripts/verify-batch-3.sh` (install, typecheck, lint, tests) must run
  locally. New native dep surface: `better-sqlite3` needs VS Build Tools
  if no prebuilt binary matches the Node version.
- Desktop `main.ts` imports `@analytiq/database` — the Electron build must
  bundle or externalise `better-sqlite3` correctly (verify the packaged app
  opens the DB from `userData`, not the dev path).
- No user-management UI yet (staff page is still a placeholder): roles can
  only be assigned via DB access until Batch 3 follow-up or Batch 7.
- Password hashing is scrypt on desktop (documented); Argon2id applies to
  LAN/cloud servers in Batches 7–8.

## Batch 2 (carried over)

- Topbar search is visual only; real search arrives with Batches 4–5.

## Batch 1 (carried over)

- Full turbo `build/typecheck/lint/test` across all workspaces still pending
  a local run with shell access.
