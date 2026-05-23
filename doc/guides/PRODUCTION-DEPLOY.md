# Production Deployment Guide

Step-by-step guide to deploy Paperclip with PostgreSQL 17 in production.

**Issue:** TEC-346  
**Last Updated:** May 2026

---

## 1. Prerequisites

- **VPS or dedicated server** with Docker and Docker Compose installed
  - Recommended: Ubuntu 22.04+, 2+ GB RAM, 20+ GB disk
  - Install Docker: https://docs.docker.com/engine/install/ubuntu/
- **Domain name** (optional but recommended) pointing to your VPS
- **S3-compatible storage** (AWS S3, Cloudflare R2, MinIO, etc.) for backups (optional)

## 2. Clone and Configure

```bash
git clone https://github.com/Kyros-Ventures/paperclip.git
cd paperclip
```

### Environment Variables

Create a `.env` file (or export directly):

```bash
# Required
export BETTER_AUTH_SECRET="$(openssl rand -base64 32)"
export PAPERCLIP_PUBLIC_URL="https://paperclip.yourdomain.com"

# Database (defaults work with docker compose)
export PGPASSWORD="your-secure-db-password"

# Optional: S3 backups
export BACKUP_S3_BUCKET="your-backup-bucket"
export BACKUP_S3_REGION="us-east-1"
export AWS_ACCESS_KEY_ID="AKIA..."
export AWS_SECRET_ACCESS_KEY="..."
```

## 3. Start Services

```bash
docker compose -f docker-compose.prod.yml up -d
```

Wait for services to become healthy:

```bash
docker compose -f docker-compose.prod.yml ps
# All services should show "healthy"
```

## 4. Verify Deployment

### Health Check

```bash
curl http://localhost:3100/api/health | jq .
```

Expected response includes:

```json
{
  "status": "ok",
  "database": "postgresql",
  "version": "0.3.1",
  "deploymentMode": "authenticated",
  "bootstrapStatus": "bootstrap_pending"
}
```

**Key verification:** `database` must be `"postgresql"` — if it's `"embedded-postgresql"`, the server is using the embedded fallback, not the production PostgreSQL.

### Check Companies

```bash
curl http://localhost:3100/api/companies | jq '.[].name'
```

After seeding, this should show all 11 companies.

## 5. Seed Data

Run migrations and seed the Kyros organization data:

```bash
# With DATABASE_URL pointing to the production database
DATABASE_URL="postgres://paperclip:${PGPASSWORD}@localhost:5432/paperclip" pnpm db:migrate
DATABASE_URL="postgres://paperclip:${PGPASSWORD}@localhost:5432/paperclip" pnpm db:seed
```

## 6. Bootstrap CEO Account

When `deploymentMode` is `"authenticated"` and no instance admin exists, the health check returns `bootstrapStatus: "bootstrap_pending"`.

Create the bootstrap CEO invite:

```bash
DATABASE_URL="postgres://paperclip:${PGPASSWORD}@localhost:5432/paperclip" \
  pnpm paperclipai auth:bootstrap-ceo --email admin@yourdomain.com
```

Follow the emailed link to create the admin account.

## 7. Backup Verification

### Manual Backup

```bash
DATABASE_URL="postgres://paperclip:${PGPASSWORD}@localhost:5432/paperclip" \
  pnpm db:backup
```

### S3 Upload

```bash
BACKUP_S3_BUCKET="your-bucket" \
BACKUP_S3_REGION="us-east-1" \
AWS_ACCESS_KEY_ID="..." \
AWS_SECRET_ACCESS_KEY="..." \
  ./scripts/backup-upload-s3.sh
```

### Automated Backups

The `backup-cron` service in `docker-compose.prod.yml` runs daily backups at 3 AM UTC and uploads to S3 if configured.

Check backup container logs:

```bash
docker compose -f docker-compose.prod.yml logs backup-cron
```

## 8. Restore from Backup

```bash
# Download from S3 if needed
aws s3 cp s3://your-bucket/paperclip/backups/paperclip-20260521-060000.sql .

# Restore
DATABASE_URL="postgres://paperclip:${PGPASSWORD}@localhost:5432/paperclip" \
  pnpm paperclipai db:restore --file paperclip-20260521-060000.sql

# Verify
curl http://localhost:3100/api/health
curl http://localhost:3100/api/companies
```

## 9. Reverse Proxy (Nginx)

Example Nginx config for HTTPS:

```nginx
server {
    listen 443 ssl;
    server_name paperclip.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/paperclip.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/paperclip.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 10. Monitoring Recommendations

| What | How | Alert |
|------|-----|-------|
| Service health | `curl /api/health` every 60s | Status != 200 or database != "postgresql" |
| Backup freshness | Check latest backup timestamp | Older than 25 hours |
| Disk space | `df -h /var/lib/docker/volumes/` | < 20% free |
| Memory | `docker stats` | Container OOM |
| S3 backup | Check S3 bucket for latest object | No object in 25 hours |

### Quick monitoring script

```bash
#!/bin/bash
# monitor.sh — basic health checks

HEALTH=$(curl -s http://localhost:3100/api/health)
STATUS=$(echo "$HEALTH" | jq -r .status)
DATABASE=$(echo "$HEALTH" | jq -r .database)

if [ "$STATUS" != "ok" ]; then
  echo "ALERT: Health status is '$STATUS'"
fi

if [ "$DATABASE" != "postgresql" ]; then
  echo "ALERT: Database mode is '$DATABASE' (expected 'postgresql')"
fi

echo "OK: status=$STATUS database=$DATABASE"
```

## 11. Troubleshooting

### "database: embedded-postgresql" in health check

The server is using the embedded PostgreSQL fallback. Check:

```bash
docker compose -f docker-compose.prod.yml exec server env | grep DATABASE_URL
```

Should show `postgres://paperclip:...@db:5432/paperclip`. If not, the env var isn't being passed correctly.

### Backup failures

Check the backup-cron logs:

```bash
docker compose -f docker-compose.prod.yml logs backup-cron --tail=50
```

Common issues:
- `ECONNREFUSED` — database service not reachable
- S3 upload failures — check AWS credentials and bucket permissions

### "role 'paperclip' does not exist"

The database wasn't initialized correctly. Reset:

```bash
docker compose -f docker-compose.prod.yml down -v  # removes volumes!
docker compose -f docker-compose.prod.yml up -d
```
