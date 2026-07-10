# Backup and Restore

Covers the two stateful services the app depends on: Postgres (all application
data) and MinIO (RAG source files — uploaded documents, crawled website
snapshots). Redis is not backed up: it's used only for rate limiting, cache,
and worker leader-election locks, all of which are safe to lose and rebuild
from scratch.

## Backup

```bash
./scripts/backup.sh                      # writes to backups/<UTC timestamp>/
./scripts/backup.sh /path/to/backup-dir  # or a specific directory
```

Requires the docker-compose stack to be running (`docker compose up -d`) and
must be run from the repo root. Produces:

- `postgres.dump` — a `pg_dump -Fc` (custom format) dump of the `owly` database
- `minio/` — a mirror of the `owly-rag` bucket's objects

Run this on a schedule (cron, a CI scheduled job, etc.) and ship the output
directory somewhere durable — it is **not** copied anywhere by the script
itself. A reasonable starting point: nightly, retain 14 days plus one
end-of-month snapshot per quarter.

## Restore

```bash
./scripts/restore.sh backups/20260710T120000Z
```

**Destructive**: drops and recreates the `owly` database and overwrites every
object in the `owly-rag` MinIO bucket with the backup's contents. Prompts for
confirmation unless you pass `--yes` (for scripted/CI use — make sure you mean
it). Restart the app afterward (`docker compose restart app`) so it picks up
the restored state and any in-process caches don't hold stale data.

## Tested restore procedure

The Postgres half of this was verified end-to-end against a real copy of this
project's dev database (not just reviewed as a script): `pg_dump -Fc` the live
database, restore it into a freshly created database via `pg_restore
--no-owner --no-privileges`, then compare row counts between the original and
restored databases table-by-table (`Admin`, `Conversation`, etc.) — they
matched exactly, confirming the dump/restore round-trip preserves data
correctly.

The MinIO mirror step (`mc mirror`) uses the same command already used by the
project's own `minio-init` compose service to seed the bucket, so it's
consistent with an already-working invocation, but could not be exercised
end-to-end in this environment: this project's own docker-compose stack could
not be started standalone here because its default ports (5432/6379/9000)
were already bound by a separate, unrelated docker project running on this
same development machine. Verify the MinIO half of `backup.sh`/`restore.sh`
once against a real deployment before relying on it in production.

## What's not covered

- **Secrets**: `SECRETS_ENCRYPTION_KEY` and `JWT_SECRET` are not part of the
  database backup (they're env vars, by design — see
  `docs/roadmap-5-production-hardening.md`'s encryption-at-rest section). If
  you restore a database backup onto a deployment with a *different*
  `SECRETS_ENCRYPTION_KEY` than the one that encrypted it, every encrypted
  field (channel credentials, AI provider keys, etc.) will fail to decrypt and
  come back as an empty string (crypto.ts's documented fail-closed behavior).
  Back up `SECRETS_ENCRYPTION_KEY` itself separately, through whatever secret
  manager holds your other production secrets — not alongside the database
  dump.
- **WhatsApp sessions** (`.wwebjs_auth` volume): intentionally excluded.
  These are re-established by scanning a QR code on reconnect; backing up
  live session tokens is more risk (a stale/leaked session file) than the
  reconnect flow costs in convenience.
