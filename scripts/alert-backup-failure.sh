#!/usr/bin/env bash
set -euo pipefail

# Alert on backup failure via webhook or Telegram.
#
# Usage:
#   ./scripts/alert-backup-failure.sh "<title>" "<run-url>" "<webhook-url>"
#
# Environment variables (optional):
#   BACKUP_ALERT_TELEGRAM_BOT_TOKEN  — Telegram bot token
#   BACKUP_ALERT_TELEGRAM_CHAT_ID    — Telegram chat ID
#   BACKUP_ALERT_WEBHOOK             — Generic webhook URL (used if no args)

TITLE="${1:-Paperclip DB backup failed}"
RUN_URL="${2:-}"
WEBHOOK_URL="${3:-${BACKUP_ALERT_WEBHOOK:-}}"
TELEGRAM_BOT_TOKEN="${BACKUP_ALERT_TELEGRAM_BOT_TOKEN:-}"
TELEGRAM_CHAT_ID="${BACKUP_ALERT_TELEGRAM_CHAT_ID:-}"

TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
HOSTNAME="$(hostname 2>/dev/null || echo "unknown")"

# ── Payload builders ──────────────────────────────────────────────

build_telegram_message() {
  local text=""
  text+="BACKUP FAILED — Paperclip DB\n"
  text+="\n"
  text+="Time: ${TIMESTAMP}\n"
  text+="Host: ${HOSTNAME}\n"
  if [ -n "${RUN_URL:-}" ]; then
    text+="CI Run: ${RUN_URL}\n"
  fi
  text+="\n"
  text+="Action Required: Verify database integrity and re-run backup.\n"

  # Include last 10 lines of backup output if available
  if [ -f /tmp/backup-output.txt ] && [ -s /tmp/backup-output.txt ]; then
    text+="\n"
    text+="Last output:\n"
    text+="\`\`\`\n"
    text+="$(tail -10 /tmp/backup-output.txt)\n"
    text+="\`\`\`"
  fi

  printf '%s' "$text"
}

build_webhook_payload() {
  local text
  text="$(build_telegram_message)"
  cat <<JSON
{
  "event": "backup.failed",
  "timestamp": "${TIMESTAMP}",
  "hostname": "${HOSTNAME}",
  "title": "${TITLE}",
  "run_url": "${RUN_URL:-}",
  "message": "$(echo "$text" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))')"
}
JSON
}

# ── Telegram delivery ─────────────────────────────────────────────

send_telegram() {
  if [ -z "${TELEGRAM_BOT_TOKEN:-}" ] || [ -z "${TELEGRAM_CHAT_ID:-}" ]; then
    echo "[alert-backup-failure] Telegram not configured (missing BOT_TOKEN or CHAT_ID)"
    return 0
  fi

  local message
  message="$(build_telegram_message)"

  curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -H "Content-Type: application/json" \
    -d "$(cat <<JSON
{
  "chat_id": "${TELEGRAM_CHAT_ID}",
  "text": "$(echo "$message" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))')",
  "parse_mode": "Markdown",
  "disable_web_page_preview": true
}
JSON
)" > /dev/null 2>&1 || echo "[alert-backup-failure] Telegram send failed (network error)"
}

# ── Webhook delivery ──────────────────────────────────────────────

send_webhook() {
  if [ -z "${WEBHOOK_URL:-}" ]; then
    echo "[alert-backup-failure] No webhook URL configured"
    return 0
  fi

  local payload
  payload="$(build_webhook_payload)"

  curl -s -X POST "${WEBHOOK_URL}" \
    -H "Content-Type: application/json" \
    -d "$payload" > /dev/null 2>&1 || echo "[alert-backup-failure] Webhook send failed (network error)"
}

# ── Main ──────────────────────────────────────────────────────────

echo "[alert-backup-failure] ${TIMESTAMP} — ${TITLE}"

send_telegram
send_webhook

echo "[alert-backup-failure] Alert dispatch complete"
