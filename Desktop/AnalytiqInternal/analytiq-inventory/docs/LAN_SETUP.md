# LAN Setup — One Primary, Many Registers

Batch 7 adds a LAN mode for shops with more than one computer. One machine
(the **primary**) owns the SQLite database and runs the AnalytIQ LAN server.
Every other machine runs the same desktop app in **client mode**: it talks to
the primary over HTTP and Socket.IO and never opens a database file.

```text
 primary computer                     other computers
┌──────────────────────────┐         ┌──────────────────────────┐
│ AnalytIQ LAN server      │  HTTP   │ AnalytIQ desktop         │
│  Fastify + Socket.IO     │◄───────►│  client mode (no SQLite) │
│  SQLite (single writer)  │  :3001  │                          │
└──────────────────────────┘         └──────────────────────────┘
```

The server is authoritative. A client that cannot reach it cannot record a
sale; nothing is reported as complete until the server confirms it.

## 1. Start the primary

```bash
pnpm install
pnpm --filter @analytiq/database build
pnpm --filter @analytiq/local-server build
```

Run it with a database path you control:

```bash
# Windows (Git Bash shown; use set in cmd.exe)
ANALYTIQ_DB_PATH="C:/AnalytIQ/data/local.db" \
  node apps/local-server/dist/index.js
```

| Variable            | Default           | Purpose                                                                                   |
| ------------------- | ----------------- | ----------------------------------------------------------------------------------------- |
| `ANALYTIQ_DB_PATH`  | `./data/local.db` | SQLite file. Point the primary desktop at the same file if you also use it as a register. |
| `PORT`              | `3001`            | Listen port.                                                                              |
| `HOST`              | `0.0.0.0`         | Bind address.                                                                             |
| `ANALYTIQ_TLS_CERT` | unset             | PEM certificate path (enables HTTPS).                                                     |
| `ANALYTIQ_TLS_KEY`  | unset             | PEM private key path (required with the cert).                                            |

Migrations run automatically on startup. Open `http://<primary-ip>:3001/docs`
for the OpenAPI explorer, or `http://<primary-ip>:3001/health` for a probe.

Complete first-run setup from any client (the wizard calls `POST /api/setup`),
or run the primary desktop once with `ANALYTIQ_DB_PATH` set to the same file.

### Windows firewall

Allow inbound TCP on the chosen port for the **Private** network profile:

```powershell
New-NetFirewallRule -DisplayName "AnalytIQ LAN" -Direction Inbound `
  -Protocol TCP -LocalPort 3001 -Profile Private -Action Allow
```

## 2. Put a computer into client mode

Client mode is chosen at startup, in this order:

1. `ANALYTIQ_SERVER_URL` environment variable.
2. `server.json` next to `AnalytIQ-Inventory-Setup-*.exe` / the dev executable.
3. `server.json` in the desktop app's `userData` folder.

```json
{ "serverUrl": "http://192.168.1.10:3001" }
```

Use the primary's fixed LAN address, not `localhost`. Restart the app after
changing the file. The log line `LAN client mode: <url>` confirms the switch.

The client keeps its server session token in Electron `safeStorage`
(OS-encrypted, per Windows user) so a restart stays signed in; signing out
deletes the stored token.

### TLS

Plain HTTP is supported for a trusted, isolated shop LAN. To encrypt traffic,
issue a certificate for the primary's hostname/IP and start the server with
`ANALYTIQ_TLS_CERT`/`ANALYTIQ_TLS_KEY`, then use `https://…` in `server.json`.
Use a certificate the clients trust (a private CA imported into Windows), not
an untrusted self-signed one — Node rejects untrusted certificates.

## 3. What clients can do

Every IPC channel used by the renderer has an HTTP equivalent, so the UI is
identical in both modes:

| Area       | Routes                                                                                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session    | `GET /api/status`, `POST /api/setup`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`                                                                 |
| Products   | `GET/POST /api/products`, `GET/PATCH /api/products/:id`, `POST /api/products/:id/archive                                                                                  | restore`, `GET/POST /api/categories` |
| Stock      | `GET /api/stock/levels`, `GET /api/stock/movements`, `POST /api/stock/adjust`, `POST /api/stock/count`                                                                    |
| Sales      | `GET/POST /api/sales`, `GET /api/sales/:id`, `POST /api/sales/:id/refund                                                                                                  | void`                                |
| Restaurant | `GET/POST /api/tax-categories`, `PATCH /api/tax-categories/:id`, `GET/POST /api/tables`, `PATCH /api/tables/:id`, `POST /api/tables/:id/status`, `DELETE /api/tables/:id` |
| Customers  | `GET/POST /api/customers`, `GET/PATCH /api/customers/:id`, `POST /api/customers/:id/archive`, `GET /api/customers/:id/payments`, `POST /api/customers/payments`           |
| Suppliers  | `GET/POST /api/suppliers`, `PATCH /api/suppliers/:id`, `POST /api/suppliers/:id/archive`                                                                                  |
| Purchasing | `GET/POST /api/purchases`, `POST /api/purchases/:id/receive                                                                                                               | cancel`                              |

Auth is `Authorization: Bearer <token>`; tokens last 12 hours and are stored
hashed in the `sessions` table. Permission checks run on the server exactly as
they do in the embedded app (`FORBIDDEN` for missing grants).

Responses use the same `{ ok, … }` envelope as IPC. Failures carry `error` and
a stable `code` (`UNAUTHENTICATED`, `FORBIDDEN`, `VALIDATION`,
`*_NOT_FOUND`, `*_EXISTS`, `NETWORK`). HTTP status follows the code: 401, 403,
404, 409, 423 (locked), 400 otherwise.

## 4. Realtime

Clients subscribe to the Socket.IO endpoint on the same port, passing the
bearer token in the handshake:

```ts
import { io } from 'socket.io-client';

const socket = io('http://192.168.1.10:3001', { auth: { token } });
socket.on('inventory.changed', () => refreshStock());
socket.on('sale.created', (sale) => refreshSales());
```

| Event               | Emitted when                                                                      |
| ------------------- | --------------------------------------------------------------------------------- |
| `inventory.changed` | Product create/update/archive, stock adjust/count, sale/refund, purchase received |
| `sale.created`      | A sale commits (`{ id, receiptNo, totalKobo }`)                                   |
| `sale.updated`      | Refund or void (`{ id, status }`)                                                 |
| `customer.updated`  | Customer create/update/archive or payment                                         |
| `table.updated`     | Dining-table status change or delete                                              |

Events are scoped to the business room; one business never sees another's
traffic. The desktop client subscribes automatically and invalidates mounted
queries, so open screens refresh after another register rings up a sale.

## 5. Rules of the road

- Exactly one primary writes to the database. Do not point two clients at
  their own `local.db` and expect them to merge.
- Back up the primary's SQLite file (WAL mode). Stop the server or use SQLite's
  backup API for a consistent copy.
- A client with no connection fails closed: no offline sale queue in Batch 7.
  Offline-tolerant sync is Batch 8.
