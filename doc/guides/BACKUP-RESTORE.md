# Backup & Restore

Complete procedures for backing up and restoring the Paperclip database.

**Version:** 1.0.0
**Last Updated:** May 2026

---

## Table of Contents

1. [Overview](#overview)
2. [Backup](#backup)
3. [Restore](#restore)
4. [CI Automation](#ci-automation)
5. [Alerting](#alerting)
6. [Troubleshooting](#troubleshooting)

---

## Overview

Paperclip includes a full database backup system via `packages/db/src/backup-lib.ts`. The backup dumps:

- **Schema**: enums, sequences, tables, constraints, foreign keys, unique constraints, indexes
- **Data**: all rows from all `public` tables (and optionally `drizzle.__drizzle_migrations`)
- **Sequence values**: current `last_value` and `is_called` state for all sequences

Backups are plain SQL files that can be restored with a single command.

### Key files

| File | Purpose |
|------|---------|
| `packages/db/src/backup-lib.ts` | Core backup/restore engine (`runDatabaseBackup`, `runDatabaseRestore`) |
| `packages/db/src/backup.ts` | Standalone backup entry point (reads config, resolves paths) |
| `cli/src/commands/db-backup.ts` | CLI command with UX (spinners, colors) |
| `scripts/backup-db.sh` | Bash wrapper for `pnpm db:backup` |
| `.github/workflows/backup.yml` | CI scheduled backup (daily at 06:00 UTC) |
| `scripts/alert-backup-failure.sh` | Failure alerting (webhook + Telegram) |

---

## Backup

### Quick backup (development)

```bash
# Start the dev server first (embedded Postgres must be running)
pnpm dev &

# Wait for health
curl http://127.0.0.1:3100/api/health

# Run backup
pnpm db:backup
```

Backups land in `~/.paperclip/instances/<instance-id>/data/backups/` by default. Filename format: `paperclip-YYYYMMDD-HHMMSS.sql`.

### Configuration

Backup behavior is configured via `~/.paperclip/instances/<instance-id>/config.json`:

```json
{
  "database": {
    "backup": {
      "dir": "/path/to/backups",
      "retentionDays": 30
    }
  }
}
```

| Option | Default | Description |
|--------|---------|-------------|
| `dir` | `~/.paperclip/instances/<instance-id>/data/backups` | Backup output directory |
| `retentionDays` | `30` | Auto-prune backups older than N days |

Environment variable override: set `DATABASE_URL` to backup an external Postgres instance instead of embedded.

### CLI options

```bash
pnpm paperclipai db:backup --help

# Custom output directory
pnpm paperclipai db:backup --dir /mnt/backups/paperclip

# Shorter retention
pnpm paperclipai db:backup --retention-days 7

# Custom filename prefix
pnpm paperclipai db:backup --filename-prefix prod-paperclip

# JSON output (for scripting)
pnpm paperclipai db:backup --json
```

---

## Restore

### Prerequisites

- Target Postgres instance must be running and reachable
- `DATABASE_URL` must point to the target instance
- The backup `.sql` file must be accessible

### Quick restore

```bash
# Set target database
export DATABASE_URL="postgres://paperclip:***@127.0.0.1:54329/paperclip"

# Restore from backup
pnpm paperclipai db:restore --file /path/to/paperclip-20260521-060000.sql
```

### Restore procedure (step by step)

#### 1. Stop the Paperclip server

```bash
# If running via pnpm dev, stop with Ctrl+C
# If running via systemd: sudo systemctl stop paperclip
```

#### 2. Locate the backup file

```bash
ls -lh ~/.paperclip/instances/default/data/backups/
# paperclip-20260520-060000.sql  4.2M
# paperclip-20260521-060000.sql  4.3M  ← latest
```

#### 3. Verify backup integrity

```bash
# Check the backup is a valid SQL file with expected structure
head -5 paperclip-20260521-060000.sql
# Should show: "-- Paperclip database backup"
#              "-- Created: 2026-05-21T06:00:00.000Z"

# Count statements
grep -c "paperclip statement breakpoint" paperclip-20260521-060000.sql
# Should be > 0
```

#### 4. Drop existing database (if needed)

```sql
-- Connect to Postgres
psql "$DATABASE_URL"

-- Drop and recreate
DROP DATABASE IF EXISTS paperclip;
CREATE DATABASE paperclip;
\q
```

#### 5. Run restore

```bash
pnpm paperclipai db:restore --file ~/.paperclip/instances/default/data/backups/paperclip-20260521-060000.sql
```

The restore runs inside a transaction (`BEGIN...COMMIT`), so it's atomic — either all statements succeed or nothing changes.

#### 6. Verify restore

```bash
# Start Paperclip
pnpm dev &

# Check health
curl http://127.0.0.1:3100/api/health

# Verify data
curl http://127.0.0.1:3100/api/companies
# Should return the expected company list
```

#### 7. Run migrations (if needed)

If the backup was taken from an older schema version, run migrations after restore:

```bash
pnpm db:migrate
```

### Restore from CI artifact

```bash
# Download artifact from GitHub Actions
gh run download <run-id> -n paperclip-db-backup

# Restore
pnpm paperclipai db:restore --file ./paperclip-YYYYMMDD-HHMMSS.sql
```

### Emergency restore (direct psql)

If the CLI is unavailable, restore directly with `psql`:

```bash
# The backup SQL file is a standalone, self-contained dump
psql "$DATABASE_URL" -f /path/to/backup.sql
```

---

## CI Automation

The backup workflow (`.github/workflows/backup.yml`) runs:

- **Schedule**: Daily at 06:00 UTC
- **Manual**: `gh workflow run "DB Backup"` from the repo

### Manual trigger

```bash
gh workflow run "DB Backup" --repo Kyros-Ventures/paperclip
```

### Check last run

```bash
gh run list --repo Kyros-Ventures/paperclip --workflow "DB Backup" --limit 1
```

### Download latest backup

```bash
gh run download --repo Kyros-Ventures/paperclip \
  $(gh run list --repo Kyros-Ventures/paperclip --workflow "DB Backup" --status success --limit 1 --json databaseId -q '.[0].databaseId') \
  -n paperclip-db-backup
```

### CI secrets required

| Secret | Purpose |
|--------|---------|
| `BACKUP_ALERT_WEBHOOK` | Webhook URL for failure alerts (optional) |

---

## Alerting

The alert script (`scripts/alert-backup-failure.sh`) supports two delivery channels:

### Webhook

Set `BACKUP_ALERT_WEBHOOK` in CI secrets or environment:

```bash
export BACKUP_ALERT_WEBHOOK="https://hooks.example.com/paperclip-alerts"
./scripts/alert-backup-failure.sh "Backup failed" "https://github.com/..." "$BACKUP_ALERT_WEBHOOK"
```

Payload format:
```json
{
  "event": "backup.failed",
  "timestamp": "2026-05-21T06:00:00Z",
  "hostname": "ci-runner-abc",
  "title": "Paperclip DB backup failed",
  "run_url": "https://github.com/Kyros-Ventures/paperclip/actions/runs/123",
  "message": "BACKUP FAILED — Paperclip DB\n\nTime: ...\n..."
}
```

### Telegram

Set bot token and chat ID:

```bash
export BACKUP_ALERT_TELEGRAM_BOT_TOKEN="123:abc"
export BACKUP_ALERT_TELEGRAM_CHAT_ID="-456"
./scripts/alert-backup-failure.sh
```

---

## Troubleshooting

### "Backup failed: connect ECONNREFUSED"

The embedded Postgres isn't running. Start the dev server first:

```bash
pnpm dev &
# Wait for "Server listening on port 3100"
```

### "Backup failed: role 'paperclip' does not exist"

The `DATABASE_URL` or config points to a Postgres instance without the paperclip role. Check:

```bash
echo $DATABASE_URL
cat ~/.paperclip/instances/default/config.json | grep -A5 database
```

### "Restore failed: relation already exists"

The target database already has tables. Drop first:

```bash
psql "$DATABASE_URL" -c "DROP DATABASE paperclip; CREATE DATABASE paperclip;"
```

Then retry restore.

### "statement breakpoint not found"

The backup file is corrupted or was manually edited. The restore parser splits on the `-- paperclip statement breakpoint` marker. Verify:

```bash
grep "paperclip statement breakpoint" backup.sql | wc -l
```

Should return > 0. If zero, the file is not a valid Paperclip backup.

### Retention pruning not working

Check the config:

```bash
cat ~/.paperclip/instances/default/config.json | grep -A3 backup
```

Ensure `retentionDays` is set. Files are pruned by `mtime`, so if files were copied (preserving original timestamps), old backups may not be pruned.
