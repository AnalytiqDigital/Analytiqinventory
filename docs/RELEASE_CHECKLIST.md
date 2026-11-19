# Release checklist (1.0.0)

Work top to bottom; do not publish until every box is ticked.

## 1. Vendor material (one-time)

- [x] Production Ed25519 keypair generated: public key embedded in
      `packages/licensing/src/publicKey.ts`; private key at
      `.secrets/license-private.pem` (git-ignored, never shipped).
- [ ] **Back up the private key offline**: run
      `bash scripts/backup-license-key.sh`, enter your own 16+ character
      password, then copy the `.enc` file to an encrypted USB drive and store
      the password in a password manager. The script verifies the archive
      decrypts back to the original. Losing the key means re-issuing every key
      with a new keypair and a new build.
- [x] Local cloud API configured: `apps/cloud-api/.env` points at the key and
      `loadEnvFile()` now reads it (verified `KEY LOADED`).
- [ ] Production cloud API: deploy, set `LICENSE_PRIVATE_KEY` (inline PEM with
      `\n`) or `LICENSE_PRIVATE_KEY_PATH` (file readable only by the service
      user). Never copy it into the website, the desktop app or git.
- [ ] Buy a Windows code-signing certificate (OV or EV `.pfx`, e.g. Certum,
      SSL.com, Sectigo, DigiCert — roughly $200–400/year); set `CSC_LINK` +
      `CSC_KEY_PASSWORD` on the release machine (`docs/UPDATES.md` → Code
      signing). The `.pfx` lives in `.secrets/`.
- [ ] Paystack **live** keys in the cloud API `.env`; deploy cloud API and
      website; confirm purchase → key delivery with a real low-value
      transaction (then refund it).
- [ ] Review and publish the drafts in `docs/legal/` (`EULA.md`,
      `PRIVACY_NOTICE.md`, `REFUND_POLICY.md`) — fill bracketed fields, add
      real support contacts, have a lawyer review.

## 2. Build

```bash
pnpm install
pnpm build            # all packages, including licensing with the real public key
pnpm typecheck
pnpm lint
pnpm test
cd apps/desktop
pnpm dist:signed      # fails unless CSC_LINK is set
```

- [ ] `release/AnalytIQ-Inventory-Setup-1.0.0.exe` exists and is signed:
      right-click → Properties → **Digital Signatures** shows the certificate.
- [ ] Record the installer SHA-256 (`certutil -hashfile <exe> SHA256`) and
      publish it next to the download.

## 3. Clean-machine acceptance (Windows 10/11 VM, no dev tools)

- [ ] Installer runs without a SmartScreen "unrecognised app" block.
- [ ] First-run setup completes; trial shows **14 days**; data folder is under
      `%APPDATA%`.
- [ ] Issue a test key (`docs/LICENSE_KEYS.md`) and activate it in
      **Settings → License**; business screens unlock; status shows plan and
      expiry.
- [ ] Create a product, scan its barcode with the real scanner, sell it, print
      the receipt on the real Xprinter (58 mm **and** 80 mm), then refund it.
- [ ] Import the three CSV templates (products, purchases, sales) and confirm
      row counts; re-import a sales file and confirm receipts are refused as
      duplicates.
- [ ] Backup → restore drill from **Settings → Backups**; data survives.
- [ ] Restart the machine; licence and printer settings persist.
- [ ] LAN: second computer in client mode — login, sale, barcode scan and
      receipt print each work on that till's own printer.
- [ ] Update check: **deferred for 1.0.0** (decision 2026-11-19) — no public
      domain yet; the feature is already built and off by default. Enable after
      the site is live: host `latest.json` + installer over HTTPS, point
      `ANALYTIQ_UPDATE_URL` at it, confirm the newer-version prompt
      (`docs/UPDATES.md`).

## 4. Publish

- [ ] Commit and tag `v1.0.0`; push (repo root is `C:/Users/emman`, stage only
      `Desktop/AnalytiqInternal/analytiq-inventory`).
- [ ] Upload the signed installer + `latest.json` to the HTTPS update folder.
- [ ] Update the website download link and the price/plan copy.
- [ ] Keep one signed installer copy offline as the fallback for support.
