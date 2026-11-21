# Cloud API on an Oracle Cloud Always Free VM

Runs `apps/cloud-api` and HTTPS on one free VM, without Render. The result is
the API origin the Vercel site calls, e.g. `https://api.analytiq.ng`:

```
Vercel site  ──fetch──▶  Caddy (443)  ──▶  cloud API (3002, private)
                                              └── /data/orders.json, leads.json
```

Cost: ₦0/month inside Oracle's Always Free limits. What you take on: OS
updates, backups, and keeping the VM and domain running. If the VM is down,
checkout and webhooks fail — the site itself keeps working.

## What you need

- Oracle Cloud account (card for identity verification; Always Free resources
  are not charged).
- A domain you can edit, e.g. `analytiq.ng` (Cloudflare or your registrar).
- GitHub access to `AnalytiqDigital/Analytiqinventory` (private).
- The Ed25519 private key already used for licences:
  `.secrets/license-private.pem` on your PC. It must match the public key in
  `packages/licensing/src/publicKey.ts`; otherwise issued keys will not activate.
- Your Paystack secret key (test first).

## 1. Create the VM

Oracle Console → **Compute → Instances → Create instance**.

- **Image:** Ubuntu 24.04 (or 22.04), 64-bit.
- **Shape:** `VM.Standard.A1.Flex` (Ampere ARM), 1 OCPU / 6 GB is plenty. The
  Always Free allowance covers up to 4 OCPU / 24 GB total, so this leaves room.
  If you get "out of capacity", try another availability domain, or use
  `VM.Standard.E2.1.Micro` (AMD, 1 GB).
- **Boot volume:** 50 GB (Always Free includes 200 GB total).
- **Networking:** create/select a VCN with a public subnet. Assign a **public
  IPv4 address** and note it.
- Add your SSH public key so you can log in.

On a 1 GB micro, add swap before building the image (Docker build can run out
of memory):

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 2. Open ports in Oracle

Instance → **Subnet → Security list → Add ingress rules**:

| Source      | Protocol | Port | Why             |
| ----------- | -------- | ---- | --------------- |
| Your IP/32  | TCP      | 22   | SSH             |
| 0.0.0.0/0   | TCP      | 80   | HTTP → HTTPS    |
| 0.0.0.0/0   | TCP      | 443  | API and webhook |

Do not open 3002; only Caddy is public.

## 3. Open ports inside Ubuntu

Oracle's Ubuntu images ship with an iptables rule that rejects new traffic.
Insert accept rules at the top, then persist them:

```bash
sudo apt-get update && sudo apt-get install -y iptables-persistent
sudo iptables -I INPUT 1 -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 1 -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
sudo iptables -L INPUT -n --line-numbers | head
```

If you use `ufw` instead, `sudo ufw allow 80,443/tcp` is enough.

## 4. Point DNS at the VM

At your DNS host, add:

```
api.analytiq.ng   A   <VM public IP>   TTL 300
```

If the domain is on Cloudflare, set the record to **DNS only** (grey cloud)
until the certificate exists; enable the proxy afterwards only with
**SSL/TLS → Full (strict)**. Check from your PC:

```bash
nslookup api.analytiq.ng
```

## 5. Install Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
# log out and back in so the group applies
docker version && docker compose version
```

## 6. Put the code on the VM

The repository is private, so use a read-only deploy key:

```bash
ssh-keygen -t ed25519 -C "analytiq-vm" -f ~/.ssh/github_deploy -N ""
cat ~/.ssh/github_deploy.pub
```

GitHub → repository → **Settings → Deploy keys → Add deploy key** → paste the
public key, leave "Allow write access" off. Then:

```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/github_deploy
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config
git clone git@github.com:AnalytiqDigital/Analytiqinventory.git
```

## 7. Configure secrets

```bash
cd analytiq-inventory/deploy/oracle-cloud
cp .env.example .env
nano .env          # DOMAIN, WEBSITE_URL, CORS_ORIGIN, PAYSTACK_SECRET_KEY
chmod 600 .env
mkdir -p secrets
```

Copy the licence key from your PC (PowerShell or Git Bash):

```bash
scp "C:/Users/emman/Desktop/AnalytiqInternal/analytiq-inventory/.secrets/license-private.pem" \
  ubuntu@<VM-IP>:~/analytiq-inventory/deploy/oracle-cloud/secrets/
```

On the VM: `chmod 600 secrets/license-private.pem`.

Checklist for `.env`:

- `DOMAIN` exactly matches the DNS record (`api.analytiq.ng`).
- `WEBSITE_URL` and `CORS_ORIGIN` are `https://analytiq-inventory.vercel.app`.
- `PAYSTACK_SECRET_KEY` starts `sk_test_` for the first run.
- Leave `RESEND_API_KEY` / `WHATSAPP_*` blank until those accounts exist; keys
  still show on the success page and `/retrieve-key`.

## 8. Start it

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f caddy     # wait for "certificate obtained"
```

Test from your PC:

```bash
curl -i https://api.analytiq.ng/health
```

Expect HTTP 200. Then:

```bash
curl -s https://api.analytiq.ng/api/plans
```

The first build takes several minutes; later builds reuse cached layers.

## 9. Connect Paystack

Paystack Dashboard → **Settings → API Keys & Webhooks**:

- Webhook URL: `https://api.analytiq.ng/api/payments/paystack/webhook`
- Copy the secret key into `.env`, then `docker compose up -d` (no rebuild).

Test mode: use a Paystack test card, complete checkout, confirm the success
page shows a key and `/data/orders.json` exists on the VM:

```bash
docker compose exec api ls -l /data
```

When it works, switch `.env` to `sk_live_…` and restart the API. Make one small
live purchase to confirm.

## 10. Connect the website

Vercel → Project → **Settings → Environment Variables**:

```
NEXT_PUBLIC_API_URL = https://api.analytiq.ng
```

Redeploy the site (the value is baked in at build time). Then check that
`/checkout` reaches Paystack and `/retrieve-key` can fetch a paid order.

## 11. Backups

The order and lead files are the business record; back them up off the VM:

```bash
cd ~/analytiq-inventory/deploy/oracle-cloud
chmod +x backup.sh
./backup.sh ~/backups
crontab -e
```

Add:

```
0 2 * * * /home/ubuntu/analytiq-inventory/deploy/oracle-cloud/backup.sh /home/ubuntu/backups >> /home/ubuntu/backup.log 2>&1
```

Copy `~/backups` to your PC or object storage weekly (`scp -r` or rclone). The
script keeps 14 daily archives. Restore by stopping the API and extracting an
archive into the `analytiq-data` volume.

## 12. Updates

```bash
cd ~/analytiq-inventory
git pull
cd deploy/oracle-cloud
docker compose up -d --build
docker image prune -f
```

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Caddy cannot get a certificate | DNS A record, ports 80/443 in Oracle **and** Ubuntu, then `docker compose logs caddy` |
| `502` from Caddy | `docker compose ps` — API unhealthy; `docker compose logs api` |
| Checkout returns `PAYSTACK_NOT_CONFIGURED` | `PAYSTACK_SECRET_KEY` blank or `.env` not reloaded (`docker compose up -d`) |
| Webhook returns 401 | Secret key in `.env` belongs to a different Paystack mode than the event |
| Key is issued but not emailed/WhatsApped | Channel unconfigured or provider rejected it; the order shows `delivery.*` state |
| Activation says signature invalid | `secrets/license-private.pem` is not the pair of the public key embedded in the app |
| Disk filling up | `df -h`, Docker logs are capped at 10 MB × 3; remove old images with `docker image prune` |

## Notes

- The API uses a single-writer JSON store. Run **one** instance; do not scale
  this service horizontally without moving orders to a database.
- `/data` contains customer names, emails, phone numbers and licence keys.
  Restrict SSH access and treat VM backups as personal data.
- Oracle may reclaim Always Free compute that has been idle for a long time.
  A running service keeps the instance active, but check the console
  occasionally and keep backups.
- The private key stays under `deploy/oracle-cloud/secrets/`, which is
  git-ignored. Never copy it into the repository or a Docker image layer.
