# Put the payment server on a Google Cloud machine

This guide is written for someone who has never used a server. Follow it in
order and copy the commands exactly. Where you see `<something>`, replace it
with your own value.

**Read this first — what Google actually gives you free**

| Item | Cost |
| --- | --- |
| One `e2-micro` machine in `us-central1`, `us-east1` or `us-west1` | Free, every month, forever |
| 30 GB standard disk | Free, every month |
| 1 GB outbound traffic per month | Free |
| **Public IPv4 address** (needed for `https://api…`) | **$0.005/hour ≈ $3.65/month** |

Google does **not** include the public address in its free tier (only one
hour per month). That is about **₦5,500 per month** at ₦1,500 to the dollar.
The $300 / 90-day welcome credit pays for it at first; when the trial ends you
must switch on paid billing to keep the machine, and from then on the address
is the only recurring charge.

If a monthly bill of any size is not acceptable, use the Oracle Cloud guide in
[`../oracle-cloud`](../oracle-cloud/README.md) instead — its public address is
free. Everything else in this guide is identical, so you can come back here
later if you prefer Google.

**What you are building**

- Your website stays on Vercel (as it is now).
- A small Google Cloud machine runs the "payment server": it talks to
  Paystack, creates licence keys and stores orders.
- Caddy gives that machine a padlock (`https://…`) automatically.

Result: `https://api.yourdomain.com` is your payment server.

**What you need before starting**

1. A Google account.
2. A bank card (Google verifies it with a temporary ~$1 hold; the hold is
   released).
3. Your domain login (where you bought `analytiq.ng` or similar).
4. Your Paystack login.
5. Your Vercel login.
6. About 60–90 minutes. The first build on a small machine is slow.

---

## Step 1 — Start the Google Cloud account

1. Open <https://console.cloud.google.com> and sign in with your Google
   account.
2. Accept the terms. Google starts the **Free Trial**: $300 credit for 90
   days. Enter the card when asked; you are not billed during the trial.
3. When asked for a project, create one named `analytiq-cloud` and remember
   its **Project ID** (shown under the name, something like
   `analytiq-cloud-482113`).

Keep the Billing page bookmarked: <https://console.cloud.google.com/billing>.

## Step 2 — Make the free machine

1. Open the menu (☰) → **Compute Engine** → **VM instances**.
2. If Google asks, click **Enable** for the Compute Engine API and wait a
   minute.
3. Click **Create instance**.
4. Fill in:
   - **Name:** `analytiq-api`
   - **Region:** `us-central1 (Iowa)` — must be `us-central1`, `us-east1` or
     `us-west1` to stay free.
   - **Zone:** `us-central1-a`
   - **Machine configuration:** Series **E2**, machine type **e2-micro**
     (2 shared vCPU, 1 GB memory).
   - **Boot disk:** click **Change** → Operating system **Ubuntu**, version
     **Ubuntu 24.04 LTS**, boot disk type **Standard persistent disk**, size
     **30 GB**. Click **Select**.
   - **Firewall:** tick **Allow HTTP traffic** and **Allow HTTPS traffic**.
5. Leave everything else as it is. Click **Create**.
6. Wait until the instance shows a green tick and **Running**. Copy the
   **External IP** shown in the list (for example `34.72.10.20`).

## Step 3 — Make that address permanent

A temporary address can change when the machine restarts, which would break
your domain. Reserve it:

1. Menu (☰) → **VPC network** → **IP addresses**.
2. Find the row for `analytiq-api` (type `Ephemeral`).
3. Click **Reserve** (or the three-dot menu → **Reserve static address**).
4. Name it `analytiq-api-ip`, type **Regional**, region `us-central1`,
   attached to `analytiq-api`. Click **Reserve**.
5. The address is unchanged — it is now permanent and attached to the
   machine. Note it down; you will use it in Steps 4 and 6.

## Step 4 — Point a name at the machine

At the place where you manage your domain's DNS (Cloudflare, Namecheap, etc.):

1. Add a record:
   - **Type:** `A`
   - **Name / Host:** `api`
   - **Value / Target:** the reserved IP from Step 3
   - **Proxy (Cloudflare only):** switch **off** (grey cloud, "DNS only")
2. Save. It usually works within 5–10 minutes.

Later, your server address is `https://api.yourdomain.com` (replace
`yourdomain.com` with your real domain).

Google already opened ports 80 and 443 when you ticked the HTTP/HTTPS boxes.
Unlike Oracle, Ubuntu on Google Cloud has no extra firewall switched on, so
there is nothing to add inside the machine.

## Step 5 — Log in, add swap, install Docker

1. In **Compute Engine → VM instances**, click **SSH** next to
   `analytiq-api`. A terminal opens in your browser. This is the server.
2. Paste commands with **Ctrl+Shift+V** (or right-click → **Paste**).
3. The machine has only 1 GB of memory, so give it 2 GB of swap before
   building anything. Paste this block as one piece:

   ```bash
   sudo fallocate -l 2G /swapfile
   sudo chmod 600 /swapfile
   sudo mkswap /swapfile
   sudo swapon /swapfile
   echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
   free -h
   ```

   The last line should show about `2.0Gi` under **Swap**.
4. Install Docker:

   ```bash
   curl -fsSL https://get.docker.com | sudo sh
   sudo usermod -aG docker $USER
   ```

5. Close the terminal tab and click **SSH** again so the group change
   applies. Then check:

   ```bash
   docker version
   ```

   You should see Client and Server versions.

## Step 6 — Download the AnalytIQ code

The code is private, so the server needs a read-only key to GitHub.

1. On the server:

   ```bash
   ssh-keygen -t ed25519 -C "analytiq-server" -f ~/.ssh/github -N ""
   cat ~/.ssh/github.pub
   ```

   Copy the line that starts with `ssh-ed25519`.

2. In your browser: GitHub → `AnalytiqDigital/Analytiqinventory` →
   **Settings** → **Deploy keys** → **Add deploy key**. Paste the line. Leave
   "Allow write access" **unticked**. Click **Add key**.

3. Back on the server:

   ```bash
   printf 'Host github.com\n  IdentityFile ~/.ssh/github\n' >> ~/.ssh/config
   chmod 600 ~/.ssh/config
   git clone git@github.com:AnalytiqDigital/Analytiqinventory.git
   ```

   Type `yes` if it asks about a fingerprint. You now have a folder called
   `analytiq-inventory`.

## Step 7 — Upload your licence key

The server must read the same Ed25519 key that signs the app's licences. It
lives on your PC at
`C:\Users\emman\Desktop\AnalytiqInternal\analytiq-inventory\.secrets\license-private.pem`.

1. On the server, create the folder:

   ```bash
   mkdir -p ~/analytiq-inventory/deploy/google-cloud/secrets
   ```

2. In the browser SSH window, click the **gear (⚙)** or **⋮** icon in the
   terminal's top bar → **Upload file**. Choose
   `license-private.pem` and wait for it to finish. It lands in your home
   folder.

3. Move it into place and protect it:

   ```bash
   mv ~/license-private.pem ~/analytiq-inventory/deploy/google-cloud/secrets/
   chmod 600 ~/analytiq-inventory/deploy/google-cloud/secrets/license-private.pem
   ```

   If your terminal has no upload option, use the SSH-key alternative in
   **Appendix A** and `scp` the file instead.

## Step 8 — Fill in your settings

1. On the server:

   ```bash
   cd ~/analytiq-inventory/deploy/google-cloud
   cp .env.example .env
   nano .env
   ```

2. Change only these lines (use the arrow keys):

   - `DOMAIN=` → `DOMAIN=api.yourdomain.com`
   - `PAYSTACK_SECRET_KEY=` → paste your Paystack **secret** key
     (`sk_test_…` to start; `sk_live_…` when ready for real money)
   - Leave `WEBSITE_URL` and `CORS_ORIGIN` as they are unless your website
     address is different.
   - Leave `RESEND_…` and `WHATSAPP_…` empty for now — keys still show on
     screen and can be recovered later.

   Save with **Ctrl+O**, press **Enter**, then **Ctrl+X** to close.

## Step 9 — Start the server

```bash
cd ~/analytiq-inventory/deploy/google-cloud
docker compose up -d --build
```

The first build takes 15–40 minutes on this machine; that is normal. Check
progress with:

```bash
docker compose logs -f api
```

Quit watching with **Ctrl+C**. Then start watching Caddy for the certificate:

```bash
docker compose logs -f caddy
```

Wait for a line about a certificate being obtained, then open this on your PC:

```
https://api.yourdomain.com/health
```

You should see a short "ok" message and a padlock. If not, see **Problems**.

## Step 10 — Connect Paystack

1. Paystack Dashboard → **Settings** → **API Keys & Webhooks**.
2. Copy the **Secret Key** if you have not already, and put it in `.env`
   (`nano .env`, then `docker compose up -d` to reload).
3. In the same Paystack page, set the **Webhook URL** to:

   ```
   https://api.yourdomain.com/api/payments/paystack/webhook
   ```

4. Save. Leave the Paystack page open; you will test it in Step 12.

## Step 11 — Point the website at the new server

1. Vercel → your project → **Settings** → **Environment Variables**.
2. Add (or edit):
   - **Name:** `NEXT_PUBLIC_API_URL`
   - **Value:** `https://api.yourdomain.com`
   - **Environment:** Production
3. Save.
4. Go to **Deployments**, open the newest one, click **Redeploy**.

Wait for the deployment to finish. The website now uses your Google machine.

## Step 12 — Test with Paystack's test mode

1. On your live site, open `/checkout` and buy the package using Paystack's
   test card: `4084 0840 8408 4081`, any future expiry, CVV `408`, PIN
   `0000`, OTP `123456`.
2. The success page should show a licence key.
3. On the server, check that the order was saved:

   ```bash
   cd ~/analytiq-inventory/deploy/google-cloud
   docker compose exec api ls -l /data
   ```

4. Open `/retrieve-key` and try the order reference with your email — it
   should show the same key.

When this works, replace `sk_test_…` with `sk_live_…` in `.env`
(`nano .env`, then `docker compose up -d`) and make one small real purchase.
Paystack live payments require a fully activated Paystack business.

## Step 13 — Keep backups

The machine keeps orders in `/data`. Make a copy every night:

```bash
cd ~/analytiq-inventory/deploy/google-cloud
chmod +x backup.sh
./backup.sh
EDITOR=nano crontab -e
```

If the editor opens, use the arrow keys to go to the bottom, add this line,
then save with **Ctrl+O**, **Enter**, and close with **Ctrl+X**:

```
0 2 * * * /home/ubuntu/analytiq-inventory/deploy/google-cloud/backup.sh /home/ubuntu/backups >> /home/ubuntu/backup.log 2>&1
```

Download a copy to your PC once a week: in the browser SSH window click the
**gear/⋮** icon → **Download file**, and enter the path shown by `ls -lh
~/backups`. (With an SSH key from **Appendix A** you can instead run `scp`.)

## Step 14 — Watch the cost once, then relax

1. Billing → **Budgets & alerts** → **Create budget**.
2. Scope it to `analytiq-cloud`, amount **$5**, and add your email with
   alerts at 50%, 90% and 100%.
3. The only expected charge is the public address, about **$3.65/month**.
   Compute, disk and normal traffic stay inside the free allowance.

When the 90-day trial ends, Google stops the machine unless you switch to
paid billing: Billing → **Activate**. After that the address bills monthly;
everything else stays free while you keep the limits above.

Do not add extra VMs, load balancers or GPU machines — those are billed.

---

## Problems and fixes

| What you see | What to do |
| --- | --- |
| "Compute Engine API has not been used" | Click **Enable** and wait a minute, then reload |
| No `e2-micro` in the list, or a price appears | You are in the wrong region; use `us-central1`, `us-east1` or `us-west1` |
| Browser SSH never connects | The machine may still be starting. Wait, then click **SSH** again |
| The build stops with `Killed` | Swap is missing. Run `free -h`; if Swap is 0, repeat Step 5. As a one-off, stop the VM, set machine type `e2-small`, start it, build, then switch back to `e2-micro` |
| Browser cannot connect to `https://api…` | DNS not ready (wait 10 minutes), the A record points at an old address, or ports 80/443 are not allowed |
| "This site can't provide a secure connection" | Caddy could not get a certificate. Run `docker compose logs caddy` and check the domain spelling; Cloudflare proxy must be **off** |
| `502 Bad Gateway` | The payment server is still starting. Wait 1 minute; then `docker compose logs api` |
| Checkout says `PAYSTACK_NOT_CONFIGURED` | The secret key is empty or has a typo. Edit `.env`, then `docker compose up -d` |
| "Signature is not valid" when activating | The uploaded `license-private.pem` is not the matching key for this app build |
| A small charge appears during the trial | The trial is not billed; check Billing → **Reports**. If it is after the trial, it is the public address |
| Lost the SSH key | Use the browser **SSH** button — it does not need your key |

## Updating later

```bash
cd ~/analytiq-inventory
git pull
cd deploy/google-cloud
docker compose up -d --build
docker image prune -f
```

## Appendix A — Optional SSH key from your PC

Only needed if you want `scp` and terminal logins from PowerShell.

1. On your PC:

   ```powershell
   ssh-keygen -t ed25519 -C "gcp" -f $HOME\.ssh\gcp_key
   type $HOME\.ssh\gcp_key.pub
   ```

2. Google Cloud console → **Compute Engine** → **Metadata** → **SSH keys** →
   **Add SSH key**. Paste the public line and save. Wait a minute.
3. Log in from PowerShell:

   ```powershell
   ssh -i $HOME\.ssh\gcp_key ubuntu@<RESERVED_IP>
   ```

4. Copy files with:

   ```powershell
   scp -i $HOME\.ssh\gcp_key "C:\path\to\license-private.pem" ubuntu@<RESERVED_IP>:~/analytiq-inventory/deploy/google-cloud/secrets/
   ```

## Technical notes (for later)

- Only Caddy is exposed. The API listens on port 3002 inside Docker's private
  network.
- Orders and leads are files in the `analytiq-data` Docker volume; do not run
  two copies of the API against the same volume.
- The Ed25519 private key is mounted read-only from
  `deploy/google-cloud/secrets/`, which git ignores. It must match the public
  key embedded in the desktop app.
- The static address bills even while the machine is stopped, because Google
  counts an address attached to a VM as "in use".
- `docker-compose.yml` was validated with `docker compose config`; `backup.sh`
  passes `bash -n`.
