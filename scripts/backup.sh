#!/usr/bin/env bash
# Backs up the Postgres database and the MinIO object store used by the
# docker-compose stack (docker-compose.yml's "db" and "minio" services).
#
# Usage: ./scripts/backup.sh [backup-dir]
#   backup-dir defaults to ./backups/<UTC timestamp>
#
# Requires the compose stack to be up (docker compose up -d) and run from
# the repo root, next to docker-compose.yml.
set -euo pipefail

COMPOSE_PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$COMPOSE_PROJECT_DIR"

BACKUP_DIR="${1:-backups/$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$BACKUP_DIR"
BACKUP_DIR="$(cd "$BACKUP_DIR" && pwd)"

echo "==> Backing up to $BACKUP_DIR"

echo "==> Dumping Postgres (custom format, safe for pg_restore)..."
docker compose exec -T db pg_dump -U postgres -Fc owly > "$BACKUP_DIR/postgres.dump"
echo "    $(du -h "$BACKUP_DIR/postgres.dump" | cut -f1) written to postgres.dump"

echo "==> Mirroring MinIO bucket (owly-rag)..."
mkdir -p "$BACKUP_DIR/minio"
docker compose run --rm --no-deps \
  -v "$BACKUP_DIR/minio:/backup" \
  --entrypoint sh \
  minio-init \
  -c "mc alias set src http://minio:9000 \${S3_ACCESS_KEY_ID:-minioadmin} \${S3_SECRET_ACCESS_KEY:-minioadmin} >/dev/null && mc mirror --quiet src/owly-rag /backup"
echo "    $(du -sh "$BACKUP_DIR/minio" | cut -f1) written to minio/"

echo "==> Backup complete: $BACKUP_DIR"
echo "    Restore with: ./scripts/restore.sh \"$BACKUP_DIR\""
