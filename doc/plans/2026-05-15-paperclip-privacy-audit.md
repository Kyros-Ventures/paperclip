# Paperclip Privacy Audit Report — TEC-308

**Auditor:** CLIP-LEAD (d6228618)
**Date:** 2026-05-15
**Scope:** Paperclip codebase — database schema, encryption, access controls, PII surface

## 1. PII Storage Inventory

| Storage Location | Data Type | Sensitivity | Encrypted? | Notes |
|---|---|---|---|---|
| `agent_api_keys.keyHash` | API key hash | HIGH | Hashed (SHA-256) | Plaintext only at creation; unrecoverable from DB |
| `company_secret_versions.material` | Encrypted secrets | HIGH | Encrypted (AES-256-GCM) | Master key from env/file with 0o600 perms |
| `company_secret_versions.valueSha256` | Secret hash | HIGH | Hashed (SHA-256) | Verification hash only |
| `invites.tokenHash` | Invite token hash | MEDIUM | Hashed | Tokens not recoverable |
| `agents.name`, `agents.role` | Agent identity | LOW | No | Operational data, not human PII |
| `issue_comments.body` | User-generated text | VARIABLE | No | Free text — could contain PII |
| `issues.title`, `issues.description` | User-generated text | VARIABLE | No | Free text — could contain PII |
| `companies.name` | Company name | LOW | No | Business data |
| `company_memberships.principalId` | External user ID | LOW | No | Auth provider reference |

**Finding: No human PII is proactively collected.** Paperclip is a control plane — it has no users table, no email/password/name fields. All user identity is external (auth provider).

## 2. Encryption at Rest

- **Agent API keys**: SHA-256 hashed. Cannot be reversed. PASS.
- **Company secrets**: AES-256-GCM authenticated encryption with random IV. Master key from `PAPERCLIP_SECRETS_MASTER_KEY` env or `data/secrets/master.key` file (0o600). PASS.
- **Invite tokens**: Hashed. PASS.
- **Database-level encryption**: None (depends on PostgreSQL deployment). RECOMMENDATION: Enable pg_tde or filesystem encryption in production.

## 3. Encryption in Transit

- **HSTS**: Enforced (`max-age=31536000; includeSubDomains`). PASS.
- **TLS**: Express app — depends on reverse proxy (nginx/Caddy) for termination. RECOMMENDATION: Document TLS requirement in deployment docs.
- **Security headers**: All 7 standard headers present (X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, CSP, Referrer-Policy, Permissions-Policy, HSTS). PASS.

## 4. Access Controls

- **5-level auth**: none → authenticated → board → admin. PASS.
- **Company scoping**: All entities scoped to company_id. PASS.
- **Agent API keys scoped to company**: Cannot cross-company. PASS.
- **Rate limiting**: 100 req/min standard, configurable per route. PASS.
- **Input validation**: Zod schemas on routes. PASS.
- **Audit logging**: Request-level with sensitive field redaction. PASS.
- **local_trusted mode**: Bypasses auth — only for local dev. DOCUMENTED.

## 5. Findings by Severity

### HIGH (0)
No high-severity findings.

### MEDIUM (2)

**M-1: No automatic PII scanning on free-text fields**
Issue descriptions and comments are free text. Users could paste PII (emails, phone numbers, API keys) into these fields. No automatic detection/filtering.
- **Recommendation**: Add optional PII scanning middleware for issue/comment create/update routes. Pattern-match emails, phone numbers, credit card numbers, and API key patterns. Flag, don't block — warn the user.

**M-2: Master key stored on filesystem in production**
The `local_encrypted` provider stores the master key in `data/secrets/master.key` with 0o600 permissions. No HSM/KMS integration.
- **Recommendation**: Add AWS KMS / HashiCorp Vault secret provider for production deployments. The pluggable secret provider architecture already supports this — just needs the provider implementation.

### LOW (3)

**L-1: No data retention policy**
No automatic purging of old data. All issues, comments, cost events kept indefinitely.
- **Recommendation**: Implement configurable retention per company — e.g., audit logs 90 days, issues 7 years, cost events 3 years. Add `retention_days` to company settings.

**L-2: No automated secret rotation**
API keys and company secrets have no expiry or rotation mechanism.
- **Recommendation**: Add `expires_at` to `agent_api_keys` and `company_secrets`. Add auto-expiry and rotation notification.

**L-3: No backup encryption verification**
No evidence of encrypted backup mechanism or verification.
- **Recommendation**: Document backup encryption in deployment guide. Add backup verification check.

## 6. Compliance Summary

| Standard | Status | Gap |
|---|---|---|
| Encryption at rest (secrets) | PASS | AES-256-GCM |
| Encryption at rest (database) | PARTIAL | Depends on deployment |
| Encryption in transit | PASS | Depends on reverse proxy |
| Access control | PASS | 5-level + company scoping |
| Audit logging | PASS | With PII redaction |
| Data retention | FAIL | No policy |
| Secret rotation | FAIL | No mechanism |
| PII scanning | FAIL | None on user content |

## 7. Risk Score

**Overall: LOW RISK**

Paperclip's architecture as a control plane inherently limits PII exposure. No human user data is collected. The primary risks are:
1. Users pasting PII into free-text fields (medium — user behavior, not system design)
2. Master key security in production (medium — operational concern, fixable with KMS)
3. Lack of data retention/rotation policies (low — compliance debt, not active threat)

**Verification**: Schema audit complete. Security middleware reviewed. Encryption implementation verified (AES-256-GCM, SHA-256 hashing). All 7 security headers confirmed present.
