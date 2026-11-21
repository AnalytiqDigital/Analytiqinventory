# Sales website and Vercel deployment

`apps/website` is a Next.js 14 (App Router) site with the landing page, checkout,
payment confirmation, download page and the installation/usage docs.

| Route                | What it shows                                                |
| -------------------- | ------------------------------------------------------------ |
| `/`                  | Landing page (features, dashboard, hardware, packages, demo) |
| `/checkout`          | Plan choice + Paystack checkout form                         |
| `/checkout/success`  | Licence key, installer download and WhatsApp install help    |
| `/retrieve-key`      | Key recovery from order reference + checkout email          |
| `/download`          | Installer page, system requirements and SHA-256 checksum     |
| `/legal/terms`       | Terms of use and licence terms (EULA)                        |
| `/legal/privacy`     | Privacy notice (NDPA)                                        |
| `/legal/refund`      | Refund and cancellation policy                               |
| `/docs`              | Help index                                                   |
| `/docs/installation` | Install, SmartScreen, licence activation, hardware, backups  |
| `/docs/usage`        | Daily selling, stock, credit, reports, finance, staff        |

The landing page and docs are static. Only the checkout form, success poller and
key-retrieval form are client-side and need the cloud API. The demo and quote
forms post to `/api/leads` in the background while they open WhatsApp.

## Environment variables

Set these in Vercel (Project → Settings → Environment Variables) and in
`apps/website/.env.local` for local work.

| Variable                   | Required | Purpose                                                                                                                                                                         |
| -------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`      | Yes      | Public origin of the deployed cloud API (`apps/cloud-api`), e.g. `https://api.analytiq.ng`                                                                                      |
| `NEXT_PUBLIC_DOWNLOAD_URL` | No       | Direct HTTPS link to the Windows installer. Defaults to the public release in `AnalytiqDigital/analytiq-downloads`; set it to `/download` to show the WhatsApp fallback instead |
| —                          | —        | Support numbers are set in `lib/site.ts`; they are not environment variables                                                                                                    |

`NEXT_PUBLIC_*` values are embedded at build time: redeploy after changing them.
The API behind `NEXT_PUBLIC_API_URL` can be the Render service in `render.yaml`
or the Oracle Always Free VM described in
[`deploy/oracle-cloud`](../deploy/oracle-cloud/README.md).
`downloadUrl()` ignores a malformed `NEXT_PUBLIC_DOWNLOAD_URL` (anything that is
not an `http(s)` URL or a local path) and falls back to the public release, so a
stray value cannot produce a broken download link. The published SHA-256 in
`lib/site.ts` applies to the default hosted ZIP; update it whenever a new build
is uploaded.

## Hosting the installer

The installer is about 95 MB and the repo is already large, so **do not commit
the `.exe`**. The site points at the public release in
`github.com/AnalytiqDigital/analytiq-downloads` by default, which works for
buyers because the source repository is private. Override
`NEXT_PUBLIC_DOWNLOAD_URL` only to move the download elsewhere:

- **GitHub Releases** (recommended): attach the ZIP to a release on a
  **separate public downloads repository** (`AnalytiqDigital/analytiq-downloads`)
  and use that asset URL. Releases on a private repository are only
  downloadable by the owner.
- **Cloudflare R2 / Backblaze B2**: make the object public and use its HTTPS URL.
- **Any HTTPS host** that serves the file directly (no login or interstitial).
  Avoid Google Drive: large files show a confirmation page and downloads get
  rate-limited when the link is shared.

A ready-to-upload bundle is produced at
`apps/desktop/release/AnalytIQ-Inventory-1.2.2-Windows.zip`. Zip uploads are
friendlier to browsers and antivirus scans than a bare `.exe`.

Setting `NEXT_PUBLIC_DOWNLOAD_URL=/download` restores the WhatsApp fallback
shown while the file is not hosted anywhere.

## Deploy to Vercel

1. The source is on GitHub at `github.com/AnalytiqDigital/Analytiqinventory`
   (branch `master`, project at the repository root). Push new commits there
   first; Vercel redeploys on every push.
2. In Vercel, choose **Add New → Project** and import the repository.
3. Set **Root Directory** to `apps/website`.
4. Turn on **Include files outside of the Root Directory in the Build Step**
   (needed for `packages/validation` and `pnpm-workspace.yaml`). Vercel detects
   Next.js and pnpm automatically.
5. Add the environment variables above for Production (and Preview if wanted).
6. Deploy, then add your domain under **Settings → Domains**.
7. Point the cloud API at the site: set `WEBSITE_URL` and `CORS_ORIGIN` to
   `https://<your-domain>` and redeploy the API.
8. In Paystack → Settings → API Keys & Webhooks, set the webhook URL to
   `https://<api-domain>/api/payments/paystack/webhook`.

Checkout cannot complete until the cloud API is deployed and reachable from the
browser; browsing the landing page and docs works without it.

### Troubleshooting the Vercel build

- **"No Next.js version detected"** — the Root Directory is still the repo root.
  Set it to `apps/website`.
- **`@analytiq/validation` cannot be resolved** — turn on _Include files outside
  of the Root Directory in the Build Step_.
- **Install fails because it runs inside `apps/website`** — set the Install
  Command to `cd ../.. && pnpm install --frozen-lockfile`.
- **Images 404** — assets live in `apps/website/public`; commit them.
- **Checkout shows a network error** — `NEXT_PUBLIC_API_URL` is missing or the
  API's `CORS_ORIGIN` does not include the Vercel domain.

## Verification checklist

- [ ] Landing page loads on the Vercel preview URL; no console errors.
- [ ] The package button opens `/checkout`; the cloud quote form opens WhatsApp
      with the location details prefilled.
- [ ] WhatsApp buttons open `https://wa.me/2348139711767` with a prefilled message.
- [ ] `/docs/installation` and `/docs/usage` render; the download button points
      at the public AnalytIQ downloads release (or `NEXT_PUBLIC_DOWNLOAD_URL`).
- [ ] `/legal/terms`, `/legal/privacy` and `/legal/refund` render and are linked
      from the footer.
- [ ] The SHA-256 on `/download` matches the hosted ZIP
      (`sha256sum AnalytIQ-Inventory-1.2.2-Windows.zip`).
- [ ] A Paystack test payment returns to `/checkout/success?reference=…` and shows
      the key, the installer download and the WhatsApp help button.
- [ ] `/retrieve-key` returns the key for that reference + email and refuses a
      wrong email.
- [ ] After sales: replace the placeholder support copy if the number changes.

## Local preview

```bash
pnpm --filter @analytiq/website dev
pnpm --filter @analytiq/website build
pnpm --filter @analytiq/website test
```

## Tests

`apps/website/lib/site.test.ts` covers the WhatsApp URL (default number,
normalisation of overrides, message encoding) and the installer URL fallback.
`lib/api.test.ts` and `lib/format.test.ts` cover the checkout client and money
formatting.
