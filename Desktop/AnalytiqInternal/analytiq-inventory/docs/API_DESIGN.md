# API Design

## Local LAN API (Fastify)

- Base: `http://<primary-host>:3001`, optional HTTPS via
  `ANALYTIQ_TLS_CERT`/`ANALYTIQ_TLS_KEY`. OpenAPI at `/docs`.
- Auth: `POST /api/auth/login` returns a 12-hour bearer token (stored hashed in
  `sessions`); every domain route re-authenticates and passes the user's
  permissions into the shared service layer. Passwords use scrypt today;
  Argon2id re-hashing is planned for the cloud phase.
- Endpoints: session/status/setup, products + categories, stock, sales +
  refunds/voids, tax categories, tables, customers + payments, suppliers,
  purchasing. Full table in `docs/LAN_SETUP.md`.
- Responses mirror desktop IPC (`{ ok, … }`); errors carry `error` + `code`
  mapped to 401/403/404/409/423/400.
- Realtime: Socket.IO on the same port, bearer token in the handshake,
  per-business rooms, events `inventory.changed`, `sale.created`,
  `sale.updated`, `customer.updated`, `table.updated`.
- Rules: every write validated (Zod) and transacted server-side; disconnected
  clients fail closed and never report unconfirmed sales as complete.

## Cloud API (NestJS)

- OpenAPI at `/docs`. JWT with refresh-token rotation.
- Domains: accounts, subscriptions, licensing, Paystack verification/webhooks,
  device registry, sync ingest, AI coordination, support.
- Webhooks: signed, duplicate-protected, idempotent activation.

## Website

- Next.js routes + NestJS-managed sessions (Auth.js or NestJS session).
- Checkout initialises server-side; activation only after server-side
  Paystack verification.
