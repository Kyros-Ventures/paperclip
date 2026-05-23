#!/usr/bin/env bash
set -euo pipefail
#
# backup-upload-s3.sh — Upload the latest Paperclip backup to S3
#
# Usage:
#   ./scripts/backup-upload-s3.sh [backup-file]
#
# If no file is provided, finds the latest backup in the default backup directory.
#
# Environment variables:
#   BACKUP_S3_BUCKET        — S3 bucket name (required)
#   BACKUP_S3_REGION        — AWS region (default: us-east-1)
#   BACKUP_S3_PREFIX        — S3 key prefix (default: paperclip/backups/)
#   AWS_ACCESS_KEY_ID       — AWS access key (required)
#   AWS_SECRET_ACCESS_KEY   — AWS secret key (required)
#   BACKUP_DIR              — Override backup directory (default: from config)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# --- Resolve backup file ---
BACKUP_FILE="${1:-}"
if [ -z "$BACKUP_FILE" ]; then
  # Find latest backup in default location
  BACKUP_DIR="${BACKUP_DIR:-$HOME/.paperclip/instances/default/data/backups}"
  if [ ! -d "$BACKUP_DIR" ]; then
    echo "ERROR: Backup directory not found: $BACKUP_DIR" >&2
    exit 1
  fi
  BACKUP_FILE=$(ls -t "$BACKUP_DIR"/paperclip-*.sql 2>/dev/null | head -1)
  if [ -z "$BACKUP_FILE" ]; then
    echo "ERROR: No backup files found in $BACKUP_DIR" >&2
    exit 1
  fi
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "ERROR: Backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

# --- Validate required env vars ---
if [ -z "${BACKUP_S3_BUCKET:-}" ]; then
  echo "ERROR: BACKUP_S3_BUCKET is required" >&2
  exit 1
fi

S3_REGION="${BACKUP_S3_REGION:-us-east-1}"
S3_PREFIX="${BACKUP_S3_PREFIX:-paperclip/backups/}"
BACKUP_BASENAME=$(basename "$BACKUP_FILE")
S3_KEY="${S3_PREFIX}${BACKUP_BASENAME}"

# Remove trailing slash from prefix for display
S3_KEY="${S3_KEY#/}"

echo "Uploading: $BACKUP_FILE"
echo "  → s3://${BACKUP_S3_BUCKET}/${S3_KEY}"

# Use the Node.js upload script (uses @aws-sdk/client-s3 from server deps)
cd "$PROJECT_ROOT"
node "$SCRIPT_DIR/backup-upload-s3.mjs" \
  "$BACKUP_FILE" \
  "$BACKUP_S3_BUCKET" \
  "$S3_KEY" \
  "$S3_REGION"

echo "✅ Upload complete: s3://${BACKUP_S3_BUCKET}/${S3_KEY}"
