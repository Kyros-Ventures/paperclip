# Paperclip Infrastructure Audit Report
**Ticket: TEC-564** | **Date: 2026-05-14** | **Repo: ~/Documents/Github/paperclip**

---

## Executive Summary

The Paperclip deployment infrastructure is reasonably well-architected for a V1 control plane. It has solid foundations: multi-stage Docker builds, automated database backups, resource monitoring with alerting, a mature release pipeline, and company-scoped secrets management. However, several gaps exist in container security hardening, health check depth, high-availability readiness, and production observability that should be addressed before operating at scale.

**Overall Grade: B+** — Production-capable for single-node deployment, needs work for multi-node/HA.

---

## Findings by Severity

---

### CRITICAL

#### C1: Production Container Runs as `node` User but Uses `tsx` Loader in Production
- **Files:** `Dockerfile:56`
- **Finding:** The production CMD uses `node --import ./server/node_modules/tsx/dist/loader.mjs server/dist/index.js`. The `tsx` loader is a dev tool designed for TypeScript execution; it adds ~50-100ms startup latency per worker and has not been audited for production security. The build compiles TypeScript (`pnpm build`) so the output at `server/dist/index.js` should already be plain JavaScript.
- **Risk:** Unnecessary dependency in production artifact; potential supply-chain risk; slower cold starts.
- **Fix:** Verify `server/dist/index.js` is fully compiled JS (no `.ts` imports). If confirmed, remove the `--import ...tsx...` flag: `CMD ["node", "server/dist/index.js"]`.

#### C2: Hardcoded Database Credentials in Production Compose
- **Files:** `docker-compose.yml:5-7` (`POSTGRES_USER: paperclip`, `POSTGRES_PASSWORD: paperclip`)
- **Finding:** The production `docker-compose.yml` uses well-known default credentials for PostgreSQL. Anyone with network access to the DB port can authenticate.
- **Risk:** Credential leakage; unauthorized database access if port 5432 is exposed beyond localhost.
- **Fix:** Use Docker secrets or at minimum `${POSTGRES_PASSWORD:?required}` with a generated value. Remove `ports: - "5432:5432"` from the DB service in production (only expose internally to the `server` service via Docker network).

#### C3: No Database Backup Strategy for Docker-Compose Deployment
- **Files:** `docker-compose.yml` (entire), `docker-compose.quickstart.yml` (entire)
- **Finding:** The docker-compose files define no backup volume mounts, no backup sidecar container, and no cron for `pg_dump`. The embedded-Postgres mode has automated backup (see `server/src/index.ts:573-618`), but the Docker deployment using external Postgres has zero backup coverage.
- **Risk:** Complete data loss on volume corruption or accidental removal. The `pgdata` Docker volume has no external backup mechanism.
- **Fix:** Add a backup sidecar container running `pg_dump` on a cron schedule, mounting a host directory for backup storage. Alternatively, document that Docker deployments require external backup (e.g., cloud provider snapshots).

---

### HIGH

#### H1: Health Check is Too Deep — Depends on Database
- **Files:** `server/src/routes/health.ts:26-90`
- **Finding:** The `GET /api/health` endpoint performs 3+ database queries (instance admin count, invite count, heartbeat runs, experimental settings). This makes the health check fragile — a slow DB query can cause health check timeouts, triggering unnecessary container restarts. Container orchestrators expect health checks to be lightweight.
- **Risk:** Cascading failures: DB slowness → health check timeout → orchestration kills the container → more disruption.
- **Fix:** Split into two endpoints:
  - `GET /api/healthz` (light): returns `{status:"ok"}` with no DB dependency, for orchestration.
  - `GET /api/health` (deep): keep current rich response for operational visibility.
  - Update `docker-compose.yml` to use `/api/healthz` for the server healthcheck (currently has no healthcheck defined).

#### H2: Server Container Has No Healthcheck in docker-compose.yml
- **Files:** `docker-compose.yml:18-34`
- **Finding:** The `server` service has no `healthcheck:` block. The `db` service has one (lines 8-12), but the application container does not. If the server process hangs (e.g., event loop blocked), Docker won't detect it.
- **Risk:** Silent hung server processes are never restarted.
- **Fix:** Add:
  ```yaml
  healthcheck:
    test: ["CMD-SHELL", "curl -f http://localhost:3100/api/health || exit 1"]
    interval: 10s
    timeout: 5s
    retries: 3
    start_period: 30s
  ```

#### H3: No Docker Compose Healthcheck on quickstart Variant
- **Files:** `docker-compose.quickstart.yml:1-18` (entire)
- **Finding:** The quickstart compose file has no healthcheck at all — neither for DB (no DB service defined) nor for the paperclip service.
- **Risk:** Same as H2.
- **Fix:** Add healthcheck block (same as recommended for `docker-compose.yml`).

#### H4: Secrets Master Key Has No Auto-Generation or Validation
- **Files:** `server/src/config.ts:239-244`, `server/src/routes/secrets.ts:17-22`
- **Finding:** The secrets provider defaults to `local_encrypted` with a master key file path. If the key file doesn't exist or is empty, there's no startup check — secrets will be encrypted with an empty/broken key, or fail silently at runtime. The docker-compose files don't mount or reference a secrets key file at all.
- **Risk:** Secrets encrypted with a missing or zeroed key are effectively plaintext; silent corruption.
- **Fix:** Add startup validation in `startServer()` that checks the master key file exists and is non-empty when `secretsProvider === "local_encrypted"`. Mount the key file as a Docker secret or volume in compose files.

#### H5: Prometheus/Metrics Endpoint Not Available — Only In-App Metrics API
- **Files:** `server/src/routes/metrics.ts` (entire), `server/src/routes/system.ts` (entire)
- **Finding:** There is no `GET /metrics` endpoint exposing Prometheus-format metrics. All metrics endpoints (`/api/metrics/*`, `/api/system/*`) return JSON and require company-scoped access. Standard monitoring tools (Prometheus, Datadog Agent, Grafana Agent) cannot scrape metrics without custom exporters.
- **Risk:** Impossible to integrate with standard infrastructure monitoring stacks without building an adapter.
- **Fix:** Add a `GET /metrics` endpoint (or `/api/metrics/prometheus`) that returns OpenMetrics/Prometheus text format with counters for HTTP requests, error rates, active agents, DB query times, etc. Expose this on a separate port (e.g., 9090) for infrastructure scraping without auth.

#### H6: Rate Limiting Uses In-Memory Store — Not Shared Across Instances
- **Files:** `server/src/middleware/rate-limit.ts:53`
- **Finding:** `const rateLimitStore = new Map<string, CompanyWindow>()` — this is an in-process in-memory Map. In a multi-instance deployment (horizontal scaling), rate limits are per-instance, not global, making them trivially bypassable.
- **Risk:** Rate limiting becomes ineffective behind a load balancer.
- **Fix:** Abstract the store behind an interface. Provide Redis-backed implementation for multi-instance deployments. Keep the in-memory store as default for single-node.

---

### MEDIUM

#### M1: Quickstart Compose Has No Database — Uses Unknown Backend
- **Files:** `docker-compose.quickstart.yml` (entire)
- **Finding:** The quickstart compose file defines only a single `paperclip` service with no DB service. Presumably relies on embedded PGlite or embedded-postgres. This is fine for quickstart but should be documented. The `DATABASE_URL` env var is not set, meaning it falls back to embedded mode.
- **Risk:** Confusion for users expecting external DB; embedded DB data lives inside the container and is lost on container removal if the volume mapping `:/paperclip` doesn't cover the DB path.
- **Fix:** Document the DB behavior explicitly in the file header comment. Consider mounting the embedded DB path explicitly.

#### M2: Dockerfile Runs Global npm Installs of AI Coding Tools
- **Files:** `Dockerfile:37`
- **Finding:** `npm install --global --omit=dev @anthropic-ai/claude-code@latest @openai/codex@latest opencode-ai` — installing `@latest` means builds are non-deterministic. A new version of these tools could break the container at any time.
- **Risk:** Non-reproducible builds; supply-chain risk; unexpected breakage.
- **Fix:** Pin exact versions. Use `package.json` with `overrides` or generate a lockfile snippet for these global tools. Alternatively, move these to the `deps` stage with version pinning.

#### M3: Missing .dockerignore Coverage for Sensitive Files
- **Files:** `.dockerignore:1-10`
- **Finding:** `.dockerignore` excludes `.git`, `.github`, `.paperclip`, `node_modules`, `coverage`, `data`, `tmp`, and `*.log`. It does not exclude: `.env*` files (only `.env` would be matched if present at root, not `.env.local`, `.env.production`, etc.), `.memsearch/`, test artifacts, IDE configs (`.vscode/`, `.idea/`), and `supabase/`.
- **Risk:** Accidental inclusion of environment files with secrets in the build context; bloated build context from unnecessary directories.
- **Fix:** Add: `.env*`, `.memsearch/`, `.vscode/`, `.idea/`, `supabase/`, `*.pem`, `*.key`, `tests/`, `doc/`.

#### M4: No Graceful Shutdown for External Postgres Connections
- **Files:** `server/src/index.ts:681-698`
- **Finding:** Graceful shutdown (SIGINT/SIGTERM handling) only stops embedded PostgreSQL. For external Postgres mode, the server simply exits without closing DB connections, draining in-flight requests, or cleaning up WebSocket connections.
- **Risk:** Dropped connections; orphaned agent runs on external DB.
- **Fix:** Add a graceful shutdown handler for all modes: stop accepting new connections, drain in-flight requests (with timeout), close DB pool, then exit.

#### M5: CICD Routes Leak Internal Error Messages
- **Files:** `server/src/routes/cicd.ts:33-35,55-57,82-84`
- **Finding:** All CICD error handlers return `{ error: String(error) }` which may include stack traces, API tokens, or internal paths in production.
- **Risk:** Information disclosure to API consumers.
- **Fix:** Log the full error server-side; return sanitized messages: `{ error: "Workflow trigger failed" }`.

#### M6: Supabase Migrations Directory Exists But Appears Stale
- **Files:** `supabase/migrations/` (5 files, all dated 2026-03-28)
- **Finding:** The `supabase/` directory contains migrations from March 2026, but the actual Drizzle migrations live in `packages/db/src/migrations/` (148+ migration files). The supabase migrations appear unused/unmaintained.
- **Risk:** Confusion about which migration source is authoritative; potential schema drift if someone runs the stale supabase migrations.
- **Fix:** Either remove the `supabase/migrations/` directory or add a README explaining it's deprecated in favor of Drizzle. If Supabase is still used in production, keep it synced.

#### M7: Resource Monitor Uses `require()` for Dynamic Import
- **Files:** `server/src/services/resourceMonitor.ts:224`
- **Finding:** `const { execSync } = require("node:child_process")` — mixing CJS `require` in an ESM module context. This works but is fragile and may fail in strict ESM environments.
- **Risk:** Breakage in future Node.js versions that enforce strict ESM.
- **Fix:** Import `execSync` at the top of the file: `import { execSync } from "node:child_process"`.

#### M8: Docker Compose Has Hardcoded Port Mappings — No Reverse Proxy Config
- **Files:** `docker-compose.yml:13-14,20-21`
- **Finding:** Ports 5432 and 3100 are hard-bound to the host. No documentation or configuration for running behind nginx/Caddy/Traefik. The `PAPERCLIP_PUBLIC_URL` is set to `http://localhost:3100` which won't work for HTTPS-terminated deployments.
- **Risk:** TLS termination, load balancing, and routing are left as exercises for the operator. Incorrect `PAPERCLIP_PUBLIC_URL` breaks OAuth redirects and CORS.
- **Fix:** Add an example reverse proxy configuration (nginx or Caddy) in a `contrib/` directory. Document how to set `PAPERCLIP_PUBLIC_URL` for HTTPS deployments. Consider removing host port mappings in production compose and using only internal Docker networking with a reverse proxy.

---

### LOW

#### L1: `BETTER_AUTH_SECRET` Required but No Auto-Generation Script
- **Files:** `docker-compose.yml:29`, `docker-compose.quickstart.yml:16`
- **Finding:** Both compose files error out if `BETTER_AUTH_SECRET` isn't set (using `${BETTER_AUTH_SECRET:?...}`). There's no helper script to generate a secure random secret for first-time deployers.
- **Risk:** Friction for new users; users may pick weak secrets.
- **Fix:** Add a `scripts/generate-secrets.sh` that outputs: `export BETTER_AUTH_SECRET=$(openssl rand -hex 32)`. Reference it in the quickstart docs.

#### L2: `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` Have No Validation Warnings
- **Files:** `docker-compose.quickstart.yml:11-12`
- **Finding:** API keys default to empty string `""`. The server starts without them and will fail later when agents try to use LLMs — with potentially confusing errors.
- **Risk:** Poor DX; confusing runtime errors.
- **Fix:** Add a startup warning in `startServer()` if both keys are unset and `deploymentMode` is not `local_trusted`.

#### L3: Release Pipeline Uses `--no-frozen-lockfile` in CI
- **Files:** `.github/workflows/release.yml:54,93,143,181,222`
- **Finding:** The release workflow uses `pnpm install --no-frozen-lockfile` which means CI builds may use different dependency versions than what's locked. The subsequent `git checkout -- pnpm-lock.yaml` restores the committed lockfile but the installed packages may differ.
- **Risk:** Release artifacts built with different dependency versions than tested; non-reproducible releases.
- **Fix:** Use `--frozen-lockfile` consistently. If lockfile updates are needed, do it in a separate step/PR (as the `refresh-lockfile` workflow does).

#### L4: E2E Workflow Uses Node 20 vs Other Workflows Using Node 24
- **Files:** `.github/workflows/e2e.yml:27` vs `.github/workflows/pr.yml:42`
- **Finding:** The standalone E2E workflow uses `node-version: 20` while all other workflows use `node-version: 24`. The `refresh-lockfile` workflow also uses Node 20.
- **Risk:** Inconsistent test environments; bugs that manifest on Node 24 may pass on Node 20.
- **Fix:** Standardize on Node 24 across all workflows.

#### L5: Docker Compose Unleashed Review Service Exposes Ports to Host
- **Files:** `docker-compose.untrusted-review.yml:18-20`
- **Finding:** The untrusted review container, which has `cap_drop: ALL` and `no-new-privileges`, still exposes ports 3100 and 5173 to the host. While security-hardened, host port exposure increases attack surface.
- **Risk:** Low given the `cap_drop: ALL` hardening, but still unnecessary exposure if only local CLI access is needed.
- **Fix:** Map to `127.0.0.1` only: `"127.0.0.1:${REVIEW_PAPERCLIP_PORT:-3100}:3100"`.

#### L6: No Structured JSON Logging in Production
- **Files:** `server/src/middleware/logger.ts` (referenced), various `console.warn()` calls
- **Finding:** The metrics routes use `console.warn("[Metrics] ...")` for degraded query logging. In production, structured JSON logging is essential for log aggregation (ELK, Datadog, etc.).
- **Risk:** Logs are harder to parse/aggregate in production log systems.
- **Fix:** Ensure all logging (including `console.warn` in metrics routes) routes through the structured `logger` from `middleware/logger.js`. Replace bare `console.warn` calls with `logger.warn`.

---

### INFO / OBSERVATIONS

#### I1: Strong Resource Monitoring Already in Place
- The `ResourceMonitor` class (`server/src/services/resourceMonitor.ts`) provides CPU, RAM, disk, agent queue, and alert monitoring with configurable thresholds. This is well-implemented and ahead of many projects at this stage.
- **Suggestion:** Consider exposing these metrics in Prometheus format for integration with external monitoring (related to H5).

#### I2: Automated Database Backups Built In
- `server/src/index.ts:573-618` implements scheduled automated database backups with retention and pruning. This is excellent for embedded-Postgres mode.
- **Suggestion:** Add backup verification (restore test) as a periodic health check.

#### I3: Release Pipeline is Mature
- The release pipeline supports canary and stable channels, semantic versioning based on calendar dates, dry-run mode, and npm trusted publishing. The `release-smoke.yml` workflow runs Docker-based smoke tests against published artifacts — excellent practice.
- **Suggestion:** Add a `rollback` GitHub Actions workflow that calls `scripts/rollback-latest.sh` with approval gates.

#### I4: Plugin System Adds Complexity But is Well-Isolated
- The plugin system (worker manager, job coordinator, event bus, lifecycle manager) is extensive. While not directly an infrastructure concern, plugin crashes or resource leaks could impact server stability.
- **Suggestion:** Add a plugin-level resource monitoring wrapper (CPU/memory per plugin worker) to the ResourceMonitor.

#### I5: Security Middleware Coverage is Good
- `app.ts:151-166` applies request ID tracking, security headers, rate limiting, and audit logging to all API routes. Health check paths are excluded from rate limiting. The `privateHostnameGuard` provides hostname validation for authenticated private deployments.

#### I6: Company Scoping is Enforced
- All secrets, CICD, metrics, and system routes enforce company access checks. This is architecturally sound for a multi-tenant control plane.

---

## Summary Table

| # | Severity | Category | Summary |
|---|----------|----------|---------|
| C1 | CRITICAL | Container | Production uses tsx dev loader |
| C2 | CRITICAL | Security | Hardcoded DB creds in compose |
| C3 | CRITICAL | Backup | No DB backup for Docker deployment |
| H1 | HIGH | Health | Health check too deep (DB-dependent) |
| H2 | HIGH | Health | Missing server healthcheck in compose |
| H3 | HIGH | Health | Missing healthcheck in quickstart |
| H4 | HIGH | Secrets | No master key validation at startup |
| H5 | HIGH | Monitoring | No Prometheus metrics endpoint |
| H6 | HIGH | Scaling | Rate limit store is in-memory only |
| M1 | MEDIUM | Compose | Quickstart DB behavior undocumented |
| M2 | MEDIUM | Container | Non-deterministic global npm installs |
| M3 | MEDIUM | Container | .dockerignore missing sensitive patterns |
| M4 | MEDIUM | Resilience | No graceful shutdown for external DB |
| M5 | MEDIUM | Security | CICD error messages leak internals |
| M6 | MEDIUM | DB | Stale supabase migrations directory |
| M7 | MEDIUM | Code | require() in ESM module |
| M8 | MEDIUM | Compose | No reverse proxy config/docs |
| L1 | LOW | DX | No secret generation helper |
| L2 | LOW | DX | No startup warning for missing API keys |
| L3 | LOW | CI/CD | --no-frozen-lockfile in release CI |
| L4 | LOW | CI/CD | Inconsistent Node versions across workflows |
| L5 | LOW | Security | Untrusted review ports exposed to all hosts |
| L6 | LOW | Logging | Bare console.warn in metrics routes |

---

## Top 5 Recommended Actions (Priority Order)

1. **Fix C2 & C3**: Secure DB credentials in docker-compose and add backup sidecar or documentation.
2. **Fix C1**: Remove tsx loader from production CMD after verifying compiled output.
3. **Fix H1 & H2**: Add lightweight `/api/healthz` endpoint and configure container healthchecks.
4. **Fix H5**: Add Prometheus `/metrics` endpoint for infrastructure monitoring integration.
5. **Fix H4**: Add secrets master key validation at startup and mount it in Docker deployments.
