# Security

- Electron: context isolation on, Node integration off in renderer, sandbox on,
  preload exposes an allow-listed IPC surface only; validate every channel.
- Auth: scrypt-hashed passwords (versioned `scrypt1:` so Argon2id can re-hash
  on login later); 5-strike/15-minute lockout; 12-hour session tokens stored
  only as SHA-256 hashes. Tokens stay in main-process memory; LAN clients may
  persist them through `safeStorage` and clear them on logout. Role-based
  permissions are checked in the shared service layer in both modes.
- Secrets: never hardcode; `.env.example` templates only; Paystack secret keys
  and licence signing private key live server-side only, never in the installer.
- Transport: LAN uses a bearer-authenticated API over a trusted private network
  or HTTPS with a certificate the clients trust; clients never open the SQLite
  file. Every domain route re-authenticates the session.
- Data: tenant/business isolation in cloud; audit logs for sensitive actions;
  backups verified before restore.
- Supply chain: signed installers + signed updates; DB migration checks.
