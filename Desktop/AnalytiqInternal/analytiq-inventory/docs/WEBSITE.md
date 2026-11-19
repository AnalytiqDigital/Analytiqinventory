# Sales website and Vercel deployment

`apps/website` is a Next.js 14 (App Router) site with the landing page, checkout,
payment confirmation, download page and the installation/usage docs.

| Route                | What it shows                                                |
| -------------------- | ------------------------------------------------------------ |
| `/`                  | Landing page (features, dashboard, hardware, packages, demo) |
| `/checkout`          | Plan choice + Paystack checkout form                         |
| `/checkout/success`  | Licence key, installer download and WhatsApp install help    |
| `/download`          | Installer page (direct link when hosted, otherwise WhatsApp) |
| `/docs`              | Help index                                                   |
| `/docs/installation` | Install, SmartScreen, licence activation, hardware, backups  |
| `/docs/usage`        | Daily selling, stock, credit, reports, finance, staff        |

The landing page and docs are static. Only the checkout form and success poller
are client-side and need the cloud API.

## Environment variables

Set these in Vercel (Project → Settings → Environment Variables) and in
`apps/website/.env.local` for local work.

| Variable                   | Required | Purpose                                                                                        |
| -------------------------- | -------- | ---------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`      | Yes      | Public origin of the deployed cloud API (`apps/cloud-api`), e.g. `https://api.analytiq.ng`     |
| `NEXT_PUBLIC_DOWNLOAD_URL` | No       | Direct HTTPS link to the Windows installer. Blank makes every download button open `/download` |
| `NEXT_PUBLIC_WHATSAPP`     | No       | Support number, digits only. Defaults to `2348124314217`                                       |

`NEXT_PUBLIC_*` values are embedded at build time: redeploy after changing them.

## Hosting the installer

The installer is about 95 MB and the repo is already large, so **do not commit
the `.exe`**. Upload the built package to any direct-download host and point
`NEXT_PUBLIC_DOWNLOAD_URL` at it:

- **GitHub Releases** (recommended): add a remote, create a `v1.1.0` release and
  attach `apps/desktop/release/AnalytIQ-Inventory-1.1.0-Windows.zip` (installer +
  `INSTALL.txt`). Use the asset URL as `NEXT_PUBLIC_DOWNLOAD_URL`.
- **Cloudflare R2 / Backblaze B2**: make the object public and use its HTTPS URL.
- **Any HTTPS host** that serves the file directly (no login or interstitial).

A ready-to-upload bundle is produced at
`apps/desktop/release/AnalytIQ-Inventory-1.1.0-Windows.zip` (91 MB). Zip uploads
are friendlier to browsers and antivirus scans than a bare `.exe`.

If no URL is configured, `/download` and the post-payment page tell the buyer to
request the installer on WhatsApp — useful while the file is still being hosted.

## Deploy to Vercel

1. Push the repository to GitHub (or GitLab/Bitbucket). The project currently
   has no remote.
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

## Verification checklist

- [ ] Landing page loads on the Vercel preview URL; no console errors.
- [ ] Package buttons open `/checkout?plan=starter|standard|pro`.
- [ ] WhatsApp buttons open `https://wa.me/2348124314217` with a prefilled message.
- [ ] `/docs/installation` and `/docs/usage` render; the download button points
      at `NEXT_PUBLIC_DOWNLOAD_URL` (or `/download` when unset).
- [ ] A Paystack test payment returns to `/checkout/success?reference=…` and shows
      the key, the installer download and the WhatsApp help button.
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
