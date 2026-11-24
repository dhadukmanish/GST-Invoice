#!/usr/bin/env bash
# Run ON THE SERVER (or: ssh root@213.210.37.67 'bash -s' < deploy/deploy.sh).
# Pulls main from GitHub and rebuilds only this stack. Never touches other sites / containers.
set -euo pipefail
APP_DIR=${APP_DIR:-/opt/gst-invoice}
cd "$APP_DIR"
git fetch --all --quiet
git reset --hard origin/main
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
echo "Waiting for health…"
for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${WEB_PORT:-8095}/api/health" >/dev/null 2>&1; then echo "UP ✔"; exit 0; fi
  sleep 5
done
echo "API did not become healthy — last logs:"; docker compose -f docker-compose.prod.yml logs --tail 60 api; exit 1
