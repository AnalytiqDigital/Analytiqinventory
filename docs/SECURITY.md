# Security

- Electron: context isolation on, Node integration off in renderer, sandbox on,
  preload exposes an allow-listed IPC surface only; validate every channel.
- Auth: Argon2id hashing; lockout/throttling; short-lived access tokens +
  refresh rotation; role-based permissions checked server-side.
- Secrets: never hardcode; `.env.example` templates only; Paystack secret keys
  and licence signing private key live server-side only, never in the installer.
- Transport: LAN over authenticated API; clients never open the SQLite file.
- Data: tenant/business isolation in cloud; audit logs for sensitive actions;
  backups verified before restore.
- Supply chain: signed installers + signed updates; DB migration checks.
