#!/bin/sh
# Applies migrations, then seeds (idempotent: only creates the super admin once), then starts the API.
set -e
echo "[entrypoint] applying migrations…"
node dist/db/migrate.js
echo "[entrypoint] seeding (idempotent)…"
node dist/db/seed.js
echo "[entrypoint] starting API"
exec "$@"
