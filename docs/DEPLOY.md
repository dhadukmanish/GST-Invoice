# Deploying GST Invoice → https://gst.pratishthabridal.in

| | |
| --- | --- |
| VPS | `213.210.37.67` (Hostinger, shared with DiamondBill + ~15 sites + mail) |
| App dir | `/opt/gst-invoice` |
| Loopback port | `127.0.0.1:8095` (DiamondBill uses 8091/8092; 8000/8080/3100 are taken) |
| DNS | `A gst.pratishthabridal.in → 213.210.37.67` (Cloudflare proxied is fine) |

> ⚠️ Shared box. Never restart nginx without `nginx -t`; never `docker compose down` another stack;
> don't touch `/data/coolify` or port 8000. This stack only binds 127.0.0.1:8095.

## Architecture

```
internet → host nginx :443 (certbot) → 127.0.0.1:8095 → web (nginx, SPA, /api → api:4000)
                                                      → api (node 20, migrations + seed on start)
                                                      → db  (postgres 16, internal only)
```
Uploaded WhatsApp PDFs live in the `api-uploads` volume (auto-deleted after 60 days).

## First-time setup (once)

```bash
ssh root@213.210.37.67
ss -ltnp | grep 8095              # must print nothing (port free)
git clone https://github.com/dhadukmanish/GST-Invoice.git /opt/gst-invoice
cd /opt/gst-invoice
cp .env.production.example .env && nano .env
#   POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=')
#   JWT_SECRET=$(openssl rand -base64 48 | tr -d '/+=')
#   SEED_SUPERADMIN_PASSWORD=<your strong password>
chmod 600 .env
docker compose -f docker-compose.prod.yml up -d --build      # ~3-5 min first build
curl -s http://127.0.0.1:8095/api/health                        # {"message":"ok",...}

# host nginx + TLS
cp deploy/nginx-gst.pratishthabridal.in.conf /etc/nginx/sites-available/gst.pratishthabridal.in
ln -s /etc/nginx/sites-available/gst.pratishthabridal.in /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d gst.pratishthabridal.in --non-interactive --redirect
nginx -t && systemctl reload nginx

# nightly backup
mkdir -p /opt/backups/gst-invoice
(crontab -l; echo "15 2 * * * /opt/gst-invoice/deploy/backup.sh >> /var/log/gst-backup.log 2>&1") | crontab -
```

Then open https://gst.pratishthabridal.in → sign in as `superadmin` → **Platform Settings** (app name,
support phone, platform WhatsApp token) → **Clients → New client**.

If the repo is private, clone with a deploy key or `https://<token>@github.com/...`.

## Every update

```bash
ssh root@213.210.37.67 'bash -s' < deploy/deploy.sh
```
(pulls `main`, rebuilds, waits for `/api/health`). Migrations run automatically on API start.

## Checks

- `curl -sI https://gst.pratishthabridal.in/` → 200
- `curl -s https://gst.pratishthabridal.in/api/health` → `{"message":"ok"...}`
- `docker compose -f docker-compose.prod.yml ps` → db healthy, api + web up
- Logs: `docker compose -f docker-compose.prod.yml logs --tail 80 api`

## Restore a backup

```bash
cd /opt/gst-invoice
docker compose -f docker-compose.prod.yml exec -T db pg_restore -U gst -d gst --clean --if-exists < /opt/backups/gst-invoice/db_YYYYMMDD_HHMMSS.dump
```

## WhatsApp

- Platform (super admin) and each client can set their own provider token (Settings → WhatsApp).
  Default API URL: `https://surat.mitalinfosys.info/api/v1` (same provider as Keshav).
- Tokens are stored AES-256-GCM encrypted with a key derived from `JWT_SECRET` — if you change
  `JWT_SECRET`, re-enter the tokens.
- PDF attachments are sent as a public URL (`PUBLIC_URL/api/files/<random>.pdf`), so `PUBLIC_URL`
  must be the real https address.
