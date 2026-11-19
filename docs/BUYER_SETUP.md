# Buyer setup sheet

A one-page guide for a new customer installing AnalytIQ Inventory on Windows
without a code-signing certificate. Give it to the buyer together with the
installer and their licence key email.

## 1. Install

1. Copy `AnalytIQ-Inventory-Setup-1.0.0.exe` to the shop computer (USB or
   download link) and double-click it.
2. Windows SmartScreen may say **"Windows protected your PC"** because the
   installer is not code-signed. Click **More info**, then **Run anyway**.
3. If Windows asks "Do you want to allow this app to make changes?", click
   **Yes**. The publisher will show as *Unknown publisher* — this is expected
   for an unsigned build.
4. The installer is per-user (no admin password needed) and adds a desktop
   shortcut. Antivirus software occasionally scans a new installer slowly on
   first run; that is normal.

If a corporate network blocks the file, ask the customer's IT to allow the
exact file name or deliver it on USB, which usually bypasses SmartScreen.

## 2. First run

1. Open **AnalytIQ Inventory** from the desktop. Click **Set up my business**.
2. Enter the business name, phone/address/TIN as needed, choose the business
   type (retail, restaurant, pharmacy, etc.), currency and VAT rate, then
   create the administrator (owner) account. Use at least 8 characters.
3. Enter the licence key from the purchase email under **Licence** (format
   `ANQ1.…`). Without it the app runs a 14-day trial.
4. Add products under **Products**, or use **Import CSV** on the Products page.

## 3. Hardware

- **Barcode scanner** — any USB/Bluetooth keyboard-wedge scanner. Click the
  search box on the Sell screen and scan; no driver is needed.
- **Xprinter / receipt printer** — install the Windows driver first, then pick
  the printer and 58 mm or 80 mm paper under **Settings → Receipt printer**,
  and use **Test print**.
- **Two tills** — on the main computer run the local server (see
  `docs/LAN_SETUP.md`) and create `server.json` with `{"serverUrl":"http://<main-ip>:3001"}`
  on the second till.

## 4. Protect the data

- **Settings → Backups** creates and restores verified snapshots. Keep a copy
  on a USB drive or another computer each day.
- Do not delete the `AnalytIQ` folder in `%APPDATA%` — it holds the database.

## 5. Support

Tell the buyer to send:

1. A screenshot of **Help & Support → Diagnostics** (or the copied JSON).
2. What they did and what happened.

Support contacts: replace these placeholders before selling.

- Email: support@analytiq.example
- WhatsApp: +234 000 000 0000
- Hours: Mon–Sat, 9:00–18:00 WAT
