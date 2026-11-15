# Architectural Decisions

1. **Monorepo at `analytiq-inventory/`** — kept alongside the existing
   `Analytiq-Digital/` marketing site; the Batch 10 website is the commercial
   storefront/portal, not a replacement of current content.
2. **SQLite via better-sqlite3 + Drizzle** — embedded, zero server install,
   per locked stack. (Existing site uses libSQL for its own reasons; the POS
   product follows the locked `better-sqlite3` requirement.)
3. **Turbo + pnpm workspaces** — task orchestration across 4 apps + 7 packages.
4. **Strict TS + Zod everywhere** — client and server validation from Batch 1.
5. **Money as integer kobo; UUIDs for syncable rows** — locked from the start.
6. **Electron secure defaults** — context isolation, no Node in renderer,
   allow-listed preload IPC.
