#!/usr/bin/env bash
# One-time (and safe to re-run) setup of GST Invoice on the shared Hostinger VPS.
# Run as root ON THE SERVER:
#   curl -fsSL https://raw.githubusercontent.com/dhadukmanish/GST-Invoice/main/deploy/first-setup.sh | bash
#
# Touches only: /opt/gst-invoice, the docker stack "gst-invoice", the nginx site gst.pratishthabridal.in,
# its certbot certificate, and one root cron line for backups. Never restarts nginx (only reload after nginx -t).
set -euo pipefail

DOMAIN=gst.pratishthabridal.in
APP_DIR=/opt/gst-invoice
REPO=https://github.com/dhadukmanish/GST-Invoice.git
PORT=8095
SITE=/etc/nginx/sites-available/$DOMAIN

say() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

say "1/6 Port check ($PORT)"
if ss -ltn "( sport = :$PORT )" | grep -q LISTEN; then
  if docker ps --format '{{.Names}} {{.Ports}}' | grep -q "gst-invoice.*127.0.0.1:$PORT"; then
    echo "Port $PORT is ours (gst-invoice already running) — continuing."
  else
    echo "Port $PORT is used by something else. Stopping — nothing was changed."; ss -ltnp | grep ":$PORT" || true; exit 1
  fi
else
  echo "Port $PORT is free."
fi

say "2/6 Code"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch --all --quiet && git -C "$APP_DIR" reset --hard origin/main
else
  git clone "$REPO" "$APP_DIR"
fi
cd "$APP_DIR"

say "3/6 Secrets (.env)"
NEW_SU_PASS=""
if [ ! -f .env ]; then
  rnd() { openssl rand -base64 "$1" | tr -d '/+=\n'; }
  NEW_SU_PASS="Su-$(rnd 9)"
  cat > .env <<EOF
POSTGRES_PASSWORD=$(rnd 24)
JWT_SECRET=$(rnd 48)
SEED_SUPERADMIN_USERNAME=superadmin
SEED_SUPERADMIN_PASSWORD=$NEW_SU_PASS
PUBLIC_URL=https://$DOMAIN
WEB_PORT=$PORT
SEED_DEMO=false
EOF
  chmod 600 .env
  echo ".env created."
else
  echo ".env already exists — kept as is."
fi

say "4/6 Build & start containers (first time ~3-5 min)"
docker compose -f docker-compose.prod.yml up -d --build
for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then echo "API healthy ✔"; break; fi
  [ "$i" = 60 ] && { echo "API not healthy:"; docker compose -f docker-compose.prod.yml logs --tail 60 api; exit 1; }
  sleep 5
done

say "5/6 nginx + HTTPS"
if [ ! -f "$SITE" ]; then
  cp deploy/nginx-$DOMAIN.conf "$SITE"
  ln -sf "$SITE" /etc/nginx/sites-enabled/$DOMAIN
  if nginx -t; then systemctl reload nginx; else
    echo "nginx -t failed — removing our site again, nothing reloaded."; rm -f /etc/nginx/sites-enabled/$DOMAIN "$SITE"; exit 1
  fi
  sleep 2
else
  echo "nginx site already present — kept."
fi
if [ ! -d /etc/letsencrypt/live/$DOMAIN ]; then
  certbot --nginx -d "$DOMAIN" --non-interactive --redirect --agree-tos --register-unsafely-without-email || certbot --nginx -d "$DOMAIN" --non-interactive --redirect
  nginx -t && systemctl reload nginx
else
  echo "Certificate already exists."
fi

say "6/6 Nightly backup cron"
mkdir -p /opt/backups/gst-invoice
if ! crontab -l 2>/dev/null | grep -q gst-invoice/deploy/backup.sh; then
  (crontab -l 2>/dev/null; echo "15 2 * * * $APP_DIR/deploy/backup.sh >> /var/log/gst-backup.log 2>&1") | crontab -
  echo "Backup cron added (02:15 daily)."
else
  echo "Backup cron already present."
fi

sleep 2
say "Done"
curl -s -o /dev/null -w "https://$DOMAIN → HTTP %{http_code}\n" "https://$DOMAIN/" || true
curl -s "https://$DOMAIN/api/health" || true
echo
if [ -n "$NEW_SU_PASS" ]; then
  echo "--------------------------------------------------"
  echo " Super admin login:  superadmin / $NEW_SU_PASS"
  echo " (also in $APP_DIR/.env — change it after first login)"
  echo "--------------------------------------------------"
fi
