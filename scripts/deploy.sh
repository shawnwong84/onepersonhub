#!/usr/bin/env bash
# Deploys the full stack (db, redis, minio, app, caddy) via docker compose
# and waits for the app to report healthy behind Caddy.
#
# Usage: ./scripts/deploy.sh
# Run from a fresh server with the repo checked out and .env populated -
# DNS for paperhuman.im and www.paperhuman.im must already point at this
# server, and ports 80/443 must be open, or Caddy's Let's Encrypt issuance
# will fail (see Caddyfile / docker-compose.yml's "caddy" service).
set -euo pipefail

COMPOSE_PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$COMPOSE_PROJECT_DIR"

if [ ! -f .env ]; then
  echo "ERROR: .env not found. Copy .env.example to .env and fill in real values first:" >&2
  echo "  cp .env.example .env" >&2
  exit 1
fi

echo "==> Building and starting stack..."
docker compose up -d --build

echo "==> Waiting for app to become healthy (Prisma migrations run automatically on boot)..."
TIMEOUT=180
ELAPSED=0
until [ "$(docker compose ps -q app | xargs docker inspect -f '{{.State.Health.Status}}' 2>/dev/null)" = "healthy" ]; do
  if [ "$ELAPSED" -ge "$TIMEOUT" ]; then
    echo "FAILED: app did not become healthy within ${TIMEOUT}s." >&2
    echo "Check logs: docker compose logs app --tail=100" >&2
    exit 1
  fi
  sleep 5
  ELAPSED=$((ELAPSED + 5))
done

echo "==> App is healthy. Deployment complete."
echo "==> Verify: https://paperhuman.im/api/health"
