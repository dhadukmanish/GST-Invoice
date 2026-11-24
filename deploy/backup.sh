#!/usr/bin/env bash
# Nightly DB + uploads backup, keeps 14 days. Cron (root):  15 2 * * * /opt/gst-invoice/deploy/backup.sh >> /var/log/gst-backup.log 2>&1
set -euo pipefail
cd /opt/gst-invoice
DEST=/opt/backups/gst-invoice; mkdir -p "$DEST"
TS=$(date +%Y%m%d_%H%M%S)
docker compose -f docker-compose.prod.yml exec -T db pg_dump -U gst -d gst --format=custom > "$DEST/db_$TS.dump"
docker run --rm -v gst-invoice_api-uploads:/u -v "$DEST":/b alpine tar czf "/b/uploads_$TS.tgz" -C /u .
find "$DEST" -type f -mtime +14 -delete
echo "$TS backup ok"
