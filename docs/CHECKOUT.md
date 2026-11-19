# Online checkout and licence issuance

Customers can buy a licence on the website, pay with Paystack, and receive a
signed key in the browser. The key is the same offline key the desktop app
verifies — nothing extra is installed, and no account is created.

```
website /checkout ──POST /api/checkout──▶ cloud API ──initialize──▶ Paystack
        ▲                                    │                        │
        │                                    │◀──── charge.success ───┘
        └──poll /checkout/success────────────┘  (webhook, signed)
                                             │
                                             └─ issue ANQ1 key, mark order paid
```

## Pieces

| Where                           | What                                                       |
| ------------------------------- | ---------------------------------------------------------- |
| `packages/validation`           | `licensePlans` catalogue + `checkoutSchema` (shared)       |
| `apps/cloud-api`                | NestJS API: plans, checkout, webhook, licence issuer       |
| `apps/website`                  | Landing page, `/checkout` form, `/checkout/success` poller |
| `packages/licensing/src/key.ts` | Pure Ed25519 key parsing/issuing (no SQLite dependency)    |

The plan catalogue lives in one place. The website renders `priceKobo` from the
same array the API uses to create the order, so a displayed price and a charged
price cannot drift apart.

## API

| Method | Path                             | Notes                                                                            |
| ------ | -------------------------------- | -------------------------------------------------------------------------------- |
| GET    | `/health`                        | Liveness                                                                         |
| GET    | `/api/plans`                     | Public plan catalogue                                                            |
| POST   | `/api/checkout`                  | Validates the form, creates a pending order, returns Paystack `authorizationUrl` |
| GET    | `/api/checkout/:reference`       | Order status; `licenseKey` is `null` until paid                                  |
| POST   | `/api/payments/paystack/webhook` | Paystack → server; HMAC-SHA512 verified                                          |
| GET    | `/docs`                          | Swagger UI                                                                       |

Checkout errors use the same shape as the desktop/LAN API:
`{ ok: false, error, message, code }`. Codes include `VALIDATION`,
`PAYSTACK_NOT_CONFIGURED`, `PAYSTACK_UNREACHABLE`, `PAYSTACK_ERROR`,
`ORDER_NOT_FOUND`, `INVALID_SIGNATURE`, `INVALID_PAYLOAD`, `AMOUNT_MISMATCH`,
`CURRENCY_MISMATCH`.

Order references look like `ord_<24 hex>` and are passed to Paystack as the
transaction reference, so the callback lands on
`{WEBSITE_URL}/checkout/success?reference=ord_…`.

## Environment

See `apps/cloud-api/.env.example`.

| Variable                   | Purpose                                                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------------------------- |
| `PAYSTACK_SECRET_KEY`      | `sk_test_…` locally, `sk_live_…` in production. Empty disables checkout and the webhook with a clear 503 |
| `WEBSITE_URL`              | Where Paystack returns the buyer                                                                         |
| `CORS_ORIGIN`              | Origin allowed to call the API (defaults to `WEBSITE_URL`)                                               |
| `ORDER_STORE_PATH`         | JSON order file (default `./data/orders.json`, git-ignored)                                              |
| `LICENSE_PRIVATE_KEY_PATH` | Ed25519 PEM used to sign keys                                                                            |
| `LICENSE_PRIVATE_KEY`      | Inline PEM alternative (`\n` escapes allowed)                                                            |
| `LICENSE_DAYS`             | Fallback lifetime if a plan has no `days`                                                                |

The website reads `NEXT_PUBLIC_API_URL` (default `http://localhost:3002`),
`NEXT_PUBLIC_DOWNLOAD_URL` (installer link) and `NEXT_PUBLIC_WHATSAPP` (support
number). See `docs/WEBSITE.md` for the Vercel deployment walkthrough.

**The private key must stay on the server or a vendor machine.** It is never
bundled into the app, never logged, and `.secrets/` plus `apps/cloud-api/data/`
are git-ignored. Rotating the key requires reissuing every licence and shipping
a new app build, because the public key is embedded in the desktop app.

## Orders and settlement

`FileOrderStore` writes JSON with a temp file + rename and serialises writes, so
one API process is safe. It is a single-writer design: run **one** cloud API
instance per order file, or swap the `OrderStore` seam for a database before
scaling out. Orders contain the business name, contact details and issued key —
treat the file as personal data.

Settlement is idempotent:

1. A payment event takes the service's settlement queue.
2. A paid order returns `alreadyPaid: true` without issuing a second key.
3. An underpayment (`amount < order.amountKobo`) or non-NGN currency rejects and
   leaves the order pending.
4. Unknown references and non-`charge.success` events are acknowledged with
   `{ ok: true, ignored: true }` so Paystack stops retrying.
5. If the issuer has no usable private key the webhook fails (500) so Paystack
   retries; the order stays pending and no half-issued key exists.

## Website flow

1. Landing page pricing links to `/checkout?plan=starter|standard|pro`.
2. The form pre-selects that plan (defaults to Standard), validates with the
   shared `checkoutSchema`, and posts to the API.
3. The browser is redirected to Paystack's `authorizationUrl`.
4. Paystack redirects back to `/checkout/success?reference=…`; the page polls
   `GET /api/checkout/:reference` every 3 s (up to ~2 minutes) and shows:
   - the licence key with a copy button,
   - the Windows installer download button (`NEXT_PUBLIC_DOWNLOAD_URL`, or the
     `/download` page when the installer is not hosted yet),
   - activation steps and a WhatsApp install-help button.

If the customer closes the tab, the key is still issued by the webhook. Support
can look it up by reference in the order file.

## Tests

```bash
pnpm --filter @analytiq/cloud-api test
pnpm --filter @analytiq/website test
```

Covered: pricing from the catalogue, reference format, input normalisation,
single issue under concurrent/duplicate settlement, validation failure leaving
an order pending, file-store persistence across restarts, HMAC signature
valid/tampered/missing, provider failures and timeouts, underpayment and
currency rejection, unknown references, missing issuer key, order lookup, and
the website's API client (error mapping, network failure, URL encoding).

## Deploying

1. Generate the app keypair once (`packages/licensing/scripts/keygen.mjs`) and
   commit the public key; keep `.secrets/license-private.pem` off the repo.
2. Set the environment variables above on the server.
3. Point the Paystack dashboard webhook at
   `https://api.<domain>/api/payments/paystack/webhook`.
4. Set `WEBSITE_URL` and `CORS_ORIGIN` to the real site origin.
5. Replace the file store with a managed database before running more than one
   API instance.
