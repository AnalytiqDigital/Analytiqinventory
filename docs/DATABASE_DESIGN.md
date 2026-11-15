# Database Design

## Local (SQLite, Drizzle, better-sqlite3)

Batch 3 entities: businesses, business locations, users, roles, permissions,
user-role assignments, devices, sessions, audit logs, application settings.

Conventions: UUID primary keys where sync applies; `business_id`,
`location_id` where applicable; `created_at`, `updated_at`; `version` for
syncable rows.

## Cloud (PostgreSQL, Drizzle)

Customer accounts, subscriptions, licences, payments, device registry,
sync checkpoints/events, AI usage. Tenant + business isolation on all rows.

## Migrations

- Every schema change ships a Drizzle Kit migration.
- Local: `packages/database/drizzle/` (SQLite).
- Cloud: Batch 8+ (PostgreSQL).
