# Multi-location and branch sync

Every business starts with one **default location**. Owners add branches in
**Settings → Locations**; new stock, sales and purchases are recorded against
the default until another branch is promoted.

Sync is **opt-in per installation** and works through a relay: any machine
running `@analytiq/local-server` (the primary computer, a shop server, or a
small cloud host). Branches push what changed and pull what they have not seen
yet. There is no shared cloud database and no account to create.

## What syncs

| Shared across branches                          | Stays on the till             |
| ----------------------------------------------- | ----------------------------- |
| Locations, categories, tax categories, products | Sales                         |
| Customers, suppliers, dining tables             | Sale items/payments/reversals |
| Stock movements (append-only ledger)            | Purchases and purchase lines  |
|                                                 | Customer payments             |
|                                                 | Audit log, sessions, users    |

Sales and purchases are ledger documents owned by the machine that recorded
them; pulling them would double-count stock movements and revenue. The catalog
and the stock ledger are what branches actually need to sell the same items at
the same prices.

## Relay setup

1. On the relay machine, start the server with a shared key:

   ```bash
   pnpm --filter @analytiq/local-server build
   ANALYTIQ_SYNC_KEY="a-long-random-secret" PORT=3001 \
     pnpm --filter @analytiq/local-server start
   ```

   (`pnpm --filter @analytiq/local-server dev` runs the TypeScript directly.)

   `ANALYTIQ_SYNC_KEY` is also accepted as `syncKey` in `buildServer({ syncKey })`
   for embedded hosts. When it is empty the relay answers every `/sync` call with
   `503 SYNC_NOT_CONFIGURED`, so sync is off by default.

2. On each branch, open **Settings → Branch sync**, enter:
   - **Relay URL** — e.g. `https://sync.example.com` or `http://192.168.1.10:3001`
   - **Sync key** — the same secret
   - tick **Keep this installation in sync automatically**

   **Sync now** runs immediately; the app otherwise syncs at startup (after 45
   seconds) and every 5 minutes while it is open. The relay itself can also sync
   upward to a cloud relay by configuring its own Settings → Branch sync.

## Endpoints

All sync routes live outside `/api` and authenticate with the `x-sync-key`
header (constant-time comparison of SHA-256 digests, so timing reveals neither
length nor content):

| Route                                  | Purpose                                              |
| -------------------------------------- | ---------------------------------------------------- |
| `POST /sync/push`                      | `{ records: SyncRecord[] }` → `{ applied, skipped }` |
| `GET /sync/pull?entity=&since=&limit=` | One page of the relay's snapshot log                 |

`SyncRecord` is `{ entity, id, version, updatedAt, data }`; `data` uses the
database's snake_case column names and is filtered against `PRAGMA table_info`
before it is written, so unknown or non-scalar fields are dropped. Each push is
capped at 500 records. Sync traffic also requires a usable license on the relay
(`403 LICENSE_REQUIRED` otherwise).

## Merge rules

- **Last write wins** on `version`, then `updated_at`: an incoming row replaces
  the local one only when `excluded.version > version`, or when versions match
  and the incoming row is at least as new.
- **Stock movements are append-only.** A duplicate id is ignored; quantities are
  never rewritten.
- **Parents before children.** Pulling happens entity by entity in dependency
  order (locations → categories → tax categories → products → customers →
  suppliers → dining tables → stock movements), each with its own cursor, so a
  movement never lands before its product or location.
- **Push cursors** are per entity `(updated_at, id)` pairs, so rows written in
  the same second are not skipped. **Pull cursors** are per entity sequence
  numbers assigned by the relay.
- A row that still violates a local constraint (for example a duplicate SKU
  created independently on two branches) is skipped and counted in `skipped`
  rather than aborting the batch.
- `user_id` on a movement is nulled when the staff member does not exist locally.

Changing the relay URL or key clears the cursors, so the next run re-pulls the
relay's full history. Sync state lives in `sync_state` and the relay's log in
`sync_records` (migration `0008_batch8_sync.sql`).

## Audit and diagnostics

`sync.configured` is written whenever settings change (without the key).
**Settings → Branch sync** shows the last push, last pull and the last error;
errors are also logged by the desktop main process and the server.

## Tests

```bash
cd packages/database
ELECTRON_RUN_AS_NODE=1 ../../apps/desktop/node_modules/electron/dist/electron.exe \
  node_modules/vitest/vitest.mjs run src/sync.test.ts

cd apps/local-server
ELECTRON_RUN_AS_NODE=1 ../desktop/node_modules/electron/dist/electron.exe \
  node_modules/vitest/vitest.mjs run
```

The database suite covers location CRUD and permissions, cursor advancement,
last-write-wins, append-only movements, relay ingestion, settings validation and
transport failures. The server suite covers key enforcement, the unconfigured
`503`, entity validation and a push→pull round trip.
