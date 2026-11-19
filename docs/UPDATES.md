# Branding, installer and update checks

## Installer

`apps/desktop/package.json` → `build` holds the electron-builder config:

| Setting          | Value                                                                  |
| ---------------- | ---------------------------------------------------------------------- |
| `appId`          | `com.analytiq.inventory`                                               |
| `productName`    | `AnalytIQ Inventory & POS`                                             |
| `build.win.icon` | `build/icon.png` (electron-builder converts it to `.ico`)              |
| `artifactName`   | `AnalytIQ-Inventory-Setup-${version}.${ext}`                           |
| `nsis`           | per-user install, changeable directory, desktop + Start Menu shortcuts |
| `copyright`      | Copyright © 2026 AnalytIQ Digital                                      |

To build the installer:

```bash
pnpm --filter @analytiq/desktop build   # typecheck, bundle, renderer, electron-builder
# or, after a build:
pnpm --filter @analytiq/desktop dist    # electron-builder --win nsis only
```

The artifact lands in `apps/desktop/release/`. Bump `version` in
`apps/desktop/package.json` before each release; the version is shown in
**Settings → Updates** and in the update manifest comparison.

Replace `apps/desktop/build/icon.png` with a new 1024×1024 PNG to rebrand; keep
it square and full-bleed.

### Windows packaging without symlink rights

electron-builder unpacks its signing tools (`winCodeSign`, `rcedit`, `signtool`)
into a cache. That archive contains macOS symlinks, and a normal (non-elevated)
Windows shell cannot create them, so the build fails with:

```text
ERROR: Cannot create symbolic link : A required privilege is not held by the client
```

Fix it once by extracting the archive into a project cache and pointing
electron-builder at it (extract as Administrator, or enable Windows Developer
Mode for the one extraction):

```bash
export ELECTRON_BUILDER_CACHE="$PWD/.ebcache"
pnpm --filter @analytiq/desktop dist
```

`.ebcache/` is git-ignored and reused on later runs, so this is a one-time
setup per machine.

## Update checks

Update checking is **off unless configured**, and it never downloads or
installs anything by itself:

1. Host a folder over HTTPS containing:
   - `latest.json`
   - the current installer (`AnalytIQ-Inventory-Setup-<version>.exe`)
2. Point installations at it with the `ANALYTIQ_UPDATE_URL` environment
   variable (for example `https://updates.your-domain.example/inventory`).

`latest.json`:

```json
{
  "version": "1.2.0",
  "url": "https://updates.your-domain.example/inventory/AnalytIQ-Inventory-Setup-1.2.0.exe",
  "notes": "Faster reports, table transfer fixes."
}
```

The app fetches `<base>/latest.json` on startup (log only) and whenever an
administrator presses **Settings → Updates → Check for updates**. It compares
the numeric parts of `version` with the running version and offers a button
that opens `url` in the default browser. `url` must be `https` (or `http` on
localhost). **Settings → Updates** shows the running version either way.

Only `https` update bases are accepted; `http` is tolerated for
`localhost`/`127.0.0.1` during testing. The check times out after 8 seconds and
failures are shown in Settings, never blocking the app.

## Login throttling

The LAN server throttles sign-in by client address: **10 attempts per 60
seconds**, then `429 { code: 'RATE_LIMITED' }`. This sits in front of the
per-account lockout (5 failed passwords → 15-minute `ACCOUNT_LOCKED`), so one
machine cannot probe many accounts quickly. Counters are in memory and reset
when the server restarts.

## Audit trail

Sensitive actions already write to `audit_logs`; Batch 12 adds:

| Action                                             | Written by                                              |
| -------------------------------------------------- | ------------------------------------------------------- |
| `license.activated`                                | `activateLicense` when called by an authenticated admin |
| `backup.create`, `backup.restore`, `backup.delete` | Backup service                                          |
| `auth.login`, `auth.login.failed`                  | Session service                                         |

Each row carries the business, user, entity and a JSON `details` payload.

## Tests

```bash
cd apps/local-server
ELECTRON_RUN_AS_NODE=1 ../../apps/desktop/node_modules/electron/dist/electron.exe \
  node_modules/vitest/vitest.mjs run
```

covers the throttle, the licensing gate and the activation audit entry.
`apps/desktop/electron/updates.ts` is exercised through its exported
`compareVersions` helper and the Settings card (manual check).
