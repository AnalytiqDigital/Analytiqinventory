# API Design

## Local LAN API (Fastify)

- Base: `http://<primary-host>:3001`. OpenAPI at `/docs`.
- Auth: short-lived access tokens + secure refresh sessions (Argon2id passwords).
- Endpoints (Batch 7): products, sales, inventory, customers, reports.
- Realtime: Socket.IO for stock/sale updates.
- Rules: every write validated (Zod), transacted server-side; disconnected
  clients must not report unconfirmed sales as complete.

## Cloud API (NestJS)

- OpenAPI at `/docs`. JWT with refresh-token rotation.
- Domains: accounts, subscriptions, licensing, Paystack verification/webhooks,
  device registry, sync ingest, AI coordination, support.
- Webhooks: signed, duplicate-protected, idempotent activation.

## Website

- Next.js routes + NestJS-managed sessions (Auth.js or NestJS session).
- Checkout initialises server-side; activation only after server-side
  Paystack verification.
