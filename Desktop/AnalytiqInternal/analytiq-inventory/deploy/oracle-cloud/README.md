# Put the payment server on a free Oracle Cloud machine

This guide is written for someone who has never used a server. Follow it in
order and copy the commands exactly. Where you see `<something>`, replace it
with your own value.

**What you are building**

- Your website stays on Vercel (as it is now).
- A small free machine at Oracle runs the "payment server": it talks to
  Paystack, creates licence keys and stores orders.
- Caddy (installed with the server) gives that machine a padlock
  (`https://…`) automatically.

Result: `https://api.yourdomain.com` is your payment server. It costs nothing
per month inside Oracle's free allowance.

**What you need before starting**

1. An Oracle Cloud account (free; a card is used only to verify you).
2. Your domain login (where you bought `analytiq.ng` or similar).
3. Your Paystack login.
4. Your Vercel login.
5. About 45 minutes.

---

## Step 1 — Make the free machine

1. Go to <https://cloud.oracle.com> and sign in.
2. Open the menu (☰) → **Compute** → **Instances** → **Create instance**.
3. **Name:** `analytiq-api`.
4. **Image:** click **Edit** next to Image and choose **Canonical Ubuntu
   24.04**.
5. **Shape:** choose **Ampere** → `VM.Standard.A1.Flex`, set **1 OCPU** and
   **6 GB** memory. (If Oracle says there is no space, choose **AMD** →
   `VM.Standard.E2.1.Micro` instead. It is slower but fine.)
6. Leave the boot volume at the default.
7. Under **Add SSH keys**, choose **Paste public keys**. On your Windows PC,
   open **PowerShell** and run:

   ```powershell
   ssh-keygen -t ed25519 -C "oracle" -f $HOME\.ssh\oracle_key
   type $HOME\.ssh\oracle_key.pub
   ```

   Press Enter when it asks for a passphrase (empty is fine). The `type`
   command prints one long line starting with `ssh-ed25519`. Copy that line
   and paste it into Oracle.
8. Make sure **Assign a public IPv4 address** is set to **Yes**.
9. Click **Create**. Wait a minute until the instance says **Running**.
10. On the instance page, copy the **Public IP address** (for example
    `129.151.10.20`). You will need it several times.

## Step 2 — Open the doors

Oracle blocks web traffic by default. You need to allow it twice: once in
Oracle's control panel and once inside the machine.

**In the Oracle control panel:**

1. On the instance page, click the **Subnet** name.
2. Click **Security Lists** → **Default Security List**.
3. Click **Add Ingress Rules** and add these three rules (one at a time):

   | Source        | Protocol | Destination port |
   | ------------- | -------- | ---------------- |
   | `0.0.0.0/0`   | TCP      | `80`             |
   | `0.0.0.0/0`   | TCP      | `443`            |
   | Your home IP  | TCP      | `22`             |

   For "Your home IP" use <https://whatismyipaddress.com>. If you are not
   sure, use `0.0.0.0/0` for port 22 for now and tighten it later.

**Inside the machine:** continue with Step 3 first (you need to be logged in).

## Step 3 — Log in and open the machine's own firewall

1. In PowerShell on your PC:

   ```powershell
   ssh -i $HOME\.ssh\oracle_key ubuntu@<PUBLIC_IP>
   ```

   Type `yes` if it asks about a fingerprint. You are now "inside" the server.

2. Copy and paste this block as one piece (right-click pastes in PowerShell):

   ```bash
   sudo apt-get update
   sudo apt-get install -y iptables-persistent
   sudo iptables -I INPUT 1 -p tcp --dport 80 -j ACCEPT
   sudo iptables -I INPUT 1 -p tcp --dport 443 -j ACCEPT
   sudo netfilter-persistent save
   ```

   If a message asks to save current rules, press **Enter** (Yes).

## Step 4 — Point a name at the machine

At the place where you manage your domain's DNS (Cloudflare, Namecheap, etc.):

1. Add a record:
   - **Type:** `A`
   - **Name / Host:** `api`
   - **Value / Target:** your Oracle public IP (from Step 1)
   - **Proxy (Cloudflare only):** switch **off** (grey cloud, "DNS only")
2. Save. It usually works within 5–10 minutes.

Later, your server address is `https://api.yourdomain.com` (replace
`yourdomain.com` with your real domain).

## Step 5 — Install Docker

Still logged in to the server, run:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
```

Now leave and re-enter so the change applies:

```bash
exit
ssh -i $HOME\.ssh\oracle_key ubuntu@<PUBLIC_IP>
```

Check it worked:

```bash
docker version
```

You should see Client and Server versions. If "permission denied" appears, run
`sudo usermod -aG docker ubuntu`, type `exit`, and log in again.

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

## Step 7 — Fill in your settings

1. Create the key folder (the machine will read your licence key from it):

   ```bash
   mkdir -p ~/analytiq-inventory/deploy/oracle-cloud/secrets
   ```

2. Upload your licence key from your PC. Run this in a **new PowerShell
   window on your PC** (not on the server):

   ```powershell
   scp -i $HOME\.ssh\oracle_key "C:\Users\emman\Desktop\AnalytiqInternal\analytiq-inventory\.secrets\license-private.pem" ubuntu@<PUBLIC_IP>:~/analytiq-inventory/deploy/oracle-cloud/secrets/
   ```

3. Back on the server, protect the key:

   ```bash
   chmod 600 ~/analytiq-inventory/deploy/oracle-cloud/secrets/license-private.pem
   ```

4. Create your settings file:

   ```bash
   cd ~/analytiq-inventory/deploy/oracle-cloud
   cp .env.example .env
   nano .env
   ```

5. In the editor, change only these lines (use the arrow keys):

   - `DOMAIN=` → `DOMAIN=api.yourdomain.com`
   - `PAYSTACK_SECRET_KEY=` → paste your Paystack **secret** key
     (`sk_test_…` to start; `sk_live_…` when ready for real money)
   - Leave `WEBSITE_URL` and `CORS_ORIGIN` as they are unless your website
     address is different.
   - Leave `RESEND_…` and `WHATSAPP_…` empty for now — keys still show on
     screen and can be recovered later.

   Save with **Ctrl+O**, press **Enter**, then **Ctrl+X** to close.

## Step 8 — Start the server

```bash
cd ~/analytiq-inventory/deploy/oracle-cloud
docker compose up -d --build
```

The first build takes 5–10 minutes. Check progress:

```bash
docker compose logs -f caddy
```

Wait until you see a line about a certificate being obtained (press **Ctrl+C**
to stop watching logs). Then, on your PC, open this in a browser:

```
https://api.yourdomain.com/health
```

You should see a short "ok" message, and the browser shows a padlock. If not,
see **Problems** at the end.

## Step 9 — Connect Paystack

1. Paystack Dashboard → **Settings** → **API Keys & Webhooks**.
2. Copy the **Secret Key** if you have not already, and put it in `.env`
   (`nano .env`, then `docker compose up -d` to reload).
3. In the same Paystack page, set the **Webhook URL** to:

   ```
   https://api.yourdomain.com/api/payments/paystack/webhook
   ```

4. Save. Leave the Paystack page open; you will test it in Step 11.

## Step 10 — Point the website at the new server

1. Vercel → your project → **Settings** → **Environment Variables**.
2. Add (or edit):
   - **Name:** `NEXT_PUBLIC_API_URL`
   - **Value:** `https://api.yourdomain.com`
   - **Environment:** Production
3. Save.
4. Go to **Deployments**, open the newest one, click **Redeploy**.

Wait for the deployment to finish. The website now uses your Oracle server.

## Step 11 — Test with Paystack's test mode

1. On your live site, open `/checkout` and buy the package using Paystack's
   test card: `4084 0840 8408 4081`, any future expiry, CVV `408`, PIN
   `0000`, OTP `123456`.
2. The success page should show a licence key.
3. On the server, check that the order was saved:

   ```bash
   docker compose exec api ls -l /data
   ```

4. Open `/retrieve-key` and try the order reference with your email — it
   should show the same key.

When this works, replace `sk_test_…` with `sk_live_…` in `.env`
(`nano .env`, then `docker compose up -d`) and make one small real purchase.
Paystack live payments require a fully activated Paystack business.

## Step 12 — Keep backups

The machine keeps orders in `/data`. Make a copy every night:

```bash
cd ~/analytiq-inventory/deploy/oracle-cloud
chmod +x backup.sh
./backup.sh
EDITOR=nano crontab -e
```

If the editor opens, use the arrow keys to go to the bottom, add this line,
then save with **Ctrl+O**, **Enter**, and close with **Ctrl+X**:

```
0 2 * * * /home/ubuntu/analytiq-inventory/deploy/oracle-cloud/backup.sh /home/ubuntu/backups >> /home/ubuntu/backup.log 2>&1
```

Then copy the `backups` folder to your PC every week with:

```powershell
scp -i $HOME\.ssh\oracle_key -r ubuntu@<PUBLIC_IP>:~/backups "C:\Users\emman\AnalytiqBackups"
```

Now you can cancel the Render service: the website and the Oracle server do
everything it did.

---

## Problems and fixes

| What you see | What to do |
| --- | --- |
| Browser cannot connect to `https://api…` | DNS not ready (wait 10 minutes), or ports 80/443 missing in Oracle **or** Ubuntu Step 3 |
| "This site can't provide a secure connection" | Caddy could not get a certificate. Run `docker compose logs caddy` and check the domain spelling |
| `502 Bad Gateway` | The payment server is still starting. Wait 1 minute; then `docker compose logs api` |
| Checkout says `PAYSTACK_NOT_CONFIGURED` | The secret key is empty or has a typo. Edit `.env`, then `docker compose up -d` |
| "Signature is not valid" when activating | The uploaded `license-private.pem` is not the matching key for this app build |
| "permission denied" running `docker` | Run `sudo usermod -aG docker ubuntu`, then `exit` and log in again |
| Lost the SSH key | Oracle console → instance → **Console connection** (slow), or create a new instance |

## Updating later

```bash
cd ~/analytiq-inventory
git pull
cd deploy/oracle-cloud
docker compose up -d --build
docker image prune -f
```

## Technical notes (for later)

- Only Caddy is exposed. The API listens on port 3002 inside Docker's private
  network.
- Orders and leads are files in the `analytiq-data` Docker volume; do not run
  two copies of the API against the same volume.
- The Ed25519 private key is mounted read-only from
  `deploy/oracle-cloud/secrets/`, which git ignores. It must match the public
  key embedded in the desktop app.
- Oracle may reclaim Always Free machines that stay idle; a running service
  usually keeps it active. Keep the weekly off-machine backup.
- `docker-compose.yml` was validated with `docker compose config`; `backup.sh`
  passes `bash -n`.
