# Sell licences on Vercel without a database

This is the smallest working checkout: the site sells the plan, Paystack takes
the money, and the site signs the licence key from the paid transaction. There
is no order database and no server to keep alive.

- Website and API: the existing Vercel project (`apps/website`).
- Orders: Paystack itself. The dashboard is your ledger.
- Key email and first-use activation: Google Apps Script (Gmail + a Google
  Sheet). One key activates one computer.
- Cost: Vercel free tier + Paystack's normal fee + Gmail. No Upstash, no
  Render, no VM, no card required.

```
/checkout ──POST /api/checkout──▶ Paystack ──paid──▶ /checkout/success
                                      │                    │
                                      └──webhook───────────┤
                                                           ▼
                                        verify + sign key + email it
```

The key is **derived** from the transaction (reference, business, plan, paid
time), so the same paid order always produces the same key. If the webhook is
missed or the page is refreshed, `/retrieve-key` still returns that key.

## 1. Create the Apps Script service (about 5 minutes)

1. Open <https://script.google.com> and choose **New project**.
2. Name it `AnalytIQ mailer`.
3. Replace everything in `Code.gs` with the contents of
   [`deploy/apps-script/Code.gs`](../apps-script/Code.gs).
4. Fill in the two constants at the top:
   - `SECRET` — a long random string. Generate one in PowerShell:
     ```powershell
     [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
     ```
   - `OWNER_EMAIL` — your email, for new demo/quote leads.
5. **Save**, then **Deploy → New deployment**.
6. Choose **Web app**, then:
   - Execute as: **Me**
   - Who has access: **Anyone**
7. **Deploy**, authorise the script with your Google account (Advanced → Go to
   project → Allow).
8. Copy the **Web app URL** (it ends in `/exec`). Do not copy the
   `script.googleusercontent.com/macros/echo?...` address the browser lands on
   after loading it. In Apps Script, use **Deploy → Manage deployments → Web
   app URL** to get the `/exec` link again.
9. Test it: open that URL in a browser. You should see
   `{"ok":true,"service":"analytiq-mail"}`.

The script sends keys with `GmailApp`, appends demo/quote requests to a Google
Sheet called **AnalytIQ leads**, and keeps activation records in a second sheet
called **AnalytIQ activations**. Both sheets are created automatically the first
time they are needed. Free Gmail allows about 100 recipients a day, which is
plenty for the first sales.

**Single-use activation needs this script and the site to be live before you
ship an app build that requires it.** The app asks the site to bind a key to the
first computer that activates it; without the script that request fails and
activation is refused (the trial still works).

## 2. Add the private key to Vercel

Open **Windows PowerShell** (not Command Prompt) at the repository root. It
prints the PEM on one line with literal `\n` escapes:

```powershell
cd C:\Users\emman\Desktop\AnalytiqInternal\analytiq-inventory
$key = (Get-Content .secrets\license-private.pem -Raw).Trim()
($key -replace "`r?`n", '\n')
```

Copy the single line it prints. Treat it as a password: never commit it, paste
it into chat, or email it.

In Vercel: **Project → Settings → Environment Variables → Production**.

| Name | Value |
| ---- | ----- |
| `PAYSTACK_SECRET_KEY` | `sk_test_...` first, then `sk_live_...` |
| `LICENSE_PRIVATE_KEY` | the single-line PEM from above |
| `APPS_SCRIPT_URL` | the `/exec` URL from step 1 |
| `APPS_SCRIPT_SECRET` | the same `SECRET` you put in the script |
| `WEBSITE_URL` | your production site, e.g. `https://analytiq-inventory.vercel.app` |

Also **delete `NEXT_PUBLIC_API_URL`** if it is set. While it is set, the site
keeps calling the old hosted API instead of its own `/api` routes. Saving the
variable changes needs a redeploy: **Deployments → latest → ⋯ → Redeploy**.

## 3. Point Paystack at the webhook

Paystack Dashboard → **Settings → API Keys & Webhooks** → Webhook URL:

```
https://<your-site>/api/payments/paystack/webhook
```

Set it for **test mode** first and again for **live mode** after switching keys.
The webhook only triggers the email; the key is on the success page either way.

## 4. Test the whole flow

1. Keep the test key in Vercel (`sk_test_...`) and redeploy.
2. Open `https://<your-site>/checkout` and buy the plan.
3. Pay with Paystack's test card: `4084 0840 8408 4081`, CVV `408`, PIN `0000`,
   OTP `123456`.
4. Check, in order:
   - the success page shows a key beginning `ANQ1.`,
   - the key arrives by email from your Gmail address,
   - `/retrieve-key` returns the same key with the reference and email,
   - `https://<your-site>/health` returns `{"status":"ok"}`,
   - the key activates in the app on one computer, and a second computer is
     refused with "already activated on another computer".
5. When all four pass, replace `PAYSTACK_SECRET_KEY` with `sk_live_...`, set the
   live webhook, and redeploy. Make one real purchase (or sell to your first
   customer) to confirm live mode.

The test key produces test transactions. Never mix a test key with a live
webhook URL or the other way round.

## 5. Where to look after a sale

| What | Where |
| ---- | ----- |
| Payment, amount, customer email, reference | Paystack Dashboard → Transactions |
| Demo and quote requests | Google Sheet **AnalytIQ leads** |
| Activation bindings (which computer holds a key) | Google Sheet **AnalytIQ activations** |
| Key | Success page, the customer's email, or `/retrieve-key` |
| Email failures | Apps Script → Executions; the success page still shows the key |

## Troubleshooting

| Symptom | Cause and fix |
| ------- | ------------- |
| Checkout says "Online card payment is not configured yet" | `PAYSTACK_SECRET_KEY` is empty. Add it and redeploy. |
| Success page says "The license issuer has no private key configured" | `LICENSE_PRIVATE_KEY` is missing or has real line breaks instead of `\n`. Re-run the PowerShell command. |
| Key page stays "Waiting for Paystack…" | The customer has not completed payment, or the Paystack key is for a different mode. Check the transaction in Paystack. |
| Webhook returns 401 in Paystack's log | `PAYSTACK_SECRET_KEY` does not match the mode of the webhook URL. Fix the key and redeploy. |
| Email never arrives | Check Apps Script → Executions. Confirm both `APPS_SCRIPT_*` variables are set and the script's `SECRET` matches. The key is still on screen. |
| App says "Cannot reach the AnalytIQ activation server" | The site (or `APPS_SCRIPT_URL`) is unreachable. Connect the shop computer to the internet, check `https://<your-site>/health`, then try again. |
| App says "already activated on another computer" | The key is bound to the first computer. Deactivate it there (Settings → Licence), or clear the Install id cell in the **AnalytIQ activations** sheet when the old computer is gone. |
| `retrieve-key` says not found | The email must match the one typed at checkout. The reference is on the Paystack receipt. |
| Changed the plan price or lifetime | New checkouts use the new values. Paid keys are derived from the lifetime stored in their own transaction, so old keys do not change. |

## Notes and limits

- No order list is stored on the site. Use Paystack for accounting.
- One key, one computer: activation is checked against the Apps Script sheet
  once, then the key works offline. Clearing a row's **Install id** releases the
  key; do that only after confirming the customer with WhatsApp or phone.
- There is no WhatsApp automatic delivery in this mode; the success page and
  email are the delivery paths. The Docker/cloud API still supports WhatsApp.
- Duplicate webhooks may resend the same email. Paystack retries only when it
  does not receive a 2xx; the key is identical every time.
- Rotating the signing key requires reissuing every licence and shipping a new
  app build, exactly as with the cloud API.
- If you later move to the Docker/cloud API, the same website works: set
  `NEXT_PUBLIC_API_URL` to that API and redeploy. The built-in routes then stay
  unused.

## Endpoints added to the site

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET | `/health` | Liveness |
| GET | `/api/plans` | Public plan catalogue |
| POST | `/api/checkout` | Validate the form, start Paystack |
| GET | `/api/checkout/:reference` | Order status; the key appears once paid |
| POST | `/api/licence/retrieve` | Reference + email → key |
| POST | `/api/licence/activate` | Binds a signed key to the first computer (one key, one computer) |
| POST | `/api/licence/deactivate` | Releases that binding so the key can move |
| POST | `/api/leads` | Demo/quote request to the Apps Script sheet |
| POST | `/api/payments/paystack/webhook` | HMAC-verified Paystack event; emails the key |
