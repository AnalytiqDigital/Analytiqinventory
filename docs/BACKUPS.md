# Backups and restore

Every AnalytIQ installation takes verified, local database snapshots and can
roll back to any of them from **Settings → Backups**. Nothing leaves the
machine and no cloud account is required.

## How a snapshot is made

`VACUUM INTO` writes a consistent, compact copy of the live SQLite database
(including everything in the WAL) without stopping the app. The new file is
opened read-only and checked with `PRAGMA integrity_check` plus a required-table
check before it is offered to the user. If verification fails the partial file
is deleted and the operation reports an error.

Snapshots are named by the app:

| Prefix                                  | Meaning                                |
| --------------------------------------- | -------------------------------------- |
| `analytiq-backup-YYYYMMDD-HHmmssSSS.db` | Scheduled or manual snapshot           |
| `pre-restore-YYYYMMDD-HHmmssSSS.db`     | Safety copy made just before a restore |

Restore and delete accept only that exact name shape (`BACKUP_NAME_PATTERN` in
`@analytiq/validation`), so no renderer or HTTP client can point the service at
an arbitrary file.

## Automatic retention

- One automatic snapshot per calendar day, taken while the app or LAN server is
  running (checked hourly; no-ops once today's file exists).
- The 14 most recent `analytiq-backup-*` files are kept. Older ones are pruned
  after every successful snapshot.
- `pre-restore-*` safety copies are never pruned automatically; delete them from
  the same screen when you no longer need them.

## Where files live

| Mode              | Folder                                                             |
| ----------------- | ------------------------------------------------------------------ |
| Desktop (primary) | `%APPDATA%/AnalytIQ Inventory & POS/backups`                       |
| LAN server        | the `backups` folder beside the database file (`ANALYTIQ_DB_PATH`) |

LAN clients list and trigger backups through the primary computer; the
**Open folder** button only works on the primary.

## What a restore does

1. Verifies the chosen snapshot (integrity + required tables).
2. Writes an audit entry (`backup.restore`) before touching anything.
3. Takes a `pre-restore-*` safety copy of the current database.
4. Closes the live connection, copies the snapshot over the database file,
   applies any newer migrations, and reopens the shared connection.
5. Clears the desktop session; you sign in again against the restored data.

Sales, stock and credit are recomputed from the restored ledger, so reports are
consistent immediately after the swap.

## Permissions and endpoints

All backup operations require `settings.manage` (admin role only by default).

| Surface | Call                                                                                              |
| ------- | ------------------------------------------------------------------------------------------------- |
| IPC     | `backup:list`, `backup:create`, `backup:restore`, `backup:delete`, `backup:reveal`                |
| REST    | `GET /api/backups`, `POST /api/backups`, `POST /api/backups/restore`, `DELETE /api/backups/:name` |

## Tests

- `packages/database/src/backups.test.ts` — snapshot creation and verification,
  restore rollback and safety copy, damaged-file rejection, pruning, daily
  cadence, delete, permission enforcement.
- `apps/local-server/src/server.test.ts` — the HTTP surface and the cashier
  denial.
