# Architecture

## Topology

- **Standalone:** Electron desktop + embedded SQLite (`better-sqlite3` + Drizzle).
  No server install required.
- **LAN:** Primary computer hosts Fastify local-server + SQLite. Clients connect
  over authenticated HTTPS/API + Socket.IO. Clients never open the SQLite file.
- **Cloud (optional):** NestJS + PostgreSQL + Redis/BullMQ for accounts,
  licensing, payments, sync coordination, AI. Never required for local sales.

## Process boundaries

- `apps/desktop`: Electron main (OS integration), preload (allow-listed IPC),
  renderer (React, no Node access, context isolation on).
- `apps/local-server`: Fastify, Zod validation, OpenAPI/Swagger, Socket.IO,
  Argon2id passwords, short-lived access tokens + refresh sessions.
- `apps/cloud-api`: NestJS, PostgreSQL via Drizzle, BullMQ/Redis, JWT rotation.
- `apps/website`: Next.js storefront + portal, Paystack checkout, signed URLs.

## Data rules

- SQLite is the local source of truth; cloud is a sync peer, not a dependency.
- Money in integer minor units (kobo). UUIDs for syncable records.
- Stock via append-only movement ledger (Batch 4); no direct balance overwrites.
- Sales are atomic transactions with reversal records, never deletes (Batch 5).
- Sync via transactional outbox + idempotency keys; no last-write-wins (Batch 8).
