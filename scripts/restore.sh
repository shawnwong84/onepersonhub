#!/usr/bin/env bash
# Restores a backup created by scripts/backup.sh into the docker-compose
# stack. DESTRUCTIVE: overwrites the "owly" Postgres database and the
# "owly-rag" MinIO bucket in place. Requires explicit confirmation.
#
# Usage: ./scripts/restore.sh <backup-dir> [--yes]
set -euo pipefail

COMPOSE_PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$COMPOSE_PROJECT_DIR"

BACKUP_DIR="${1:-}"
CONFIRM="${2:-}"

if [ -z "$BACKUP_DIR" ] || [ ! -d "$BACKUP_DIR" ]; then
  echo "Usage: $0 <backup-dir> [--yes]" >&2
  echo "  <backup-dir> must be a directory created by scripts/backup.sh" >&2
  exit 1
fi
BACKUP_DIR="$(cd "$BACKUP_DIR" && pwd)"

if [ ! -f "$BACKUP_DIR/postgres.dump" ]; then
  echo "Error: $BACKUP_DIR/postgres.dump not found. Is this a backup.sh output directory?" >&2
  exit 1
fi

if [ "$CONFIRM" != "--yes" ]; then
  echo "This will DROP and recreate the 'owly' database and overwrite the 'owly-rag'"
  echo "MinIO bucket with the contents of: $BACKUP_DIR"
  read -r -p "Type 'yes' to continue: " answer
  if [ "$answer" != "yes" ]; then
    echo "Aborted."
    exit 1
  fi
fi

echo "==> Restoring Postgres from $BACKUP_DIR/postgres.dump..."
docker compose exec -T db psql -U postgres -c "DROP DATABASE IF EXISTS owly;"
docker compose exec -T db psql -U postgres -c "CREATE DATABASE owly;"
docker compose exec -T db pg_restore -U postgres -d owly --no-owner --no-privileges < "$BACKUP_DIR/postgres.dump"
echo "    Postgres restored."

if [ -d "$BACKUP_DIR/minio" ] && [ "$(ls -A "$BACKUP_DIR/minio" 2>/dev/null)" ]; then
  echo "==> Restoring MinIO bucket (owly-rag) from $BACKUP_DIR/minio..."
  docker compose run --rm --no-deps \
    -v "$BACKUP_DIR/minio:/backup" \
    --entrypoint sh \
    minio-init \
    -c "mc alias set dst http://minio:9000 \${S3_ACCESS_KEY_ID:-minioadmin} \${S3_SECRET_ACCESS_KEY:-minioadmin} >/dev/null && mc mirror --quiet --overwrite /backup dst/owly-rag"
  echo "    MinIO restored."
else
  echo "==> No MinIO backup found in $BACKUP_DIR/minio, skipping."
fi

echo "==> Restore complete. Restart the app so it picks up the restored state:"
echo "    docker compose restart app"
