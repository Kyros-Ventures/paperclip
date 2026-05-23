# PII Privacy Audit — TEC-308

**Date:** 2026-05-15  
**Auditor:** CLIP-BE (Hermes cron worker)  
**Scope:** All Kyros Ventures repos (Kyros-Business-OS, PCMS, paperclip, kyros-connect, kyros-studio)

## Summary

| Repo | PII Map | Encryption | Risk |
|------|---------|------------|------|
| Kyros-Business-OS | COMPLETE (60+ cols) | DOCUMENTED, NOT IMPLEMENTED | HIGH |
| PCMS | NONE | NONE | CRITICAL |
| kyros-connect | NONE | NONE | MEDIUM |
| paperclip | NONE | NONE | LOW |
| kyros-studio | N/A (no PII) | N/A | NONE |

## Detailed Findings

### 1. Kyros-Business-OS

**PII Data Map:** Comprehensive `pii_data_map` table (migration `20260309000001_pii_data_map.sql`) with 60+ columns across 16 tables. Enhanced version (`20260309000011_pii_data_map.sql`) adds `is_pii`, `requires_encryption`, `requires_masking` flags.

**Tables mapped:**
- profiles (full_name, email, phone, avatar_url) — 30d retention
- employees (first_name, last_name, email, personal_email, phone, address, date_of_birth, national_id, emergency_contact_name, emergency_contact_phone, bank_account_number, pan_number, aadhaar_number, profile_image_url) — 2555d / 7yr
- contacts (first_name, last_name, email, phone, address) — 1825d / 5yr
- leads (first_name, last_name, email, phone, company) — 1095d / 3yr
- customers (name, email, phone, billing_address, tax_id) — 2555d / 7yr
- customer_accounts (account_name, email, phone, billing_address, payment_method, tax_id) — 2555d
- job_applications (applicant_name, applicant_email, applicant_phone, resume_url, cover_letter, expected_salary) — 730d / 2yr
- biometric_enrollments (fingerprint_hash, face_encoding, iris_hash, device_id) — 90d
- audit_logs (ip_address, user_agent) — 2555d
- payroll_records (gross_salary, net_salary, tax_deductions, bank_account, tax_id) — 2555d
- invoices (customer_name, customer_email, billing_address, tax_id) — 2555d
- payments (payer_name, payer_email, payment_method, billing_address) — 2555d
- leave_requests (leave_type, reason, medical_certificate_url) — 1095d
- user_activity_logs (ip_address, user_agent) — 365d
- consent_history (ip_address, user_agent) — 2555d
- user_consents (ip_address) — 2555d

**Classification Levels:** public, internal, confidential, restricted  
**Erasure Methods:** nullify, anonymize, pseudonymize, delete_row, aggregate  
**Legal Basis:** contract, consent, legitimate-interest, legal-obligation  

**Supporting Infrastructure:**
- `vault_configurations` table — supports supabase_vault, AWS KMS, HashiCorp Vault, Azure KeyVault, GCP KMS
- `field_masking_rules` table — masking patterns for email, phone, ssn, aadhaar, pan, bank_account, credit_card
- `data_reveal_logs` table — audit trail for PII access

**CRITICAL GAP — Encryption Not Implemented:**
The following 20+ fields are marked "Encrypted at rest" in the PII data map notes, but **zero pgcrypto or pgsodium encryption function calls** were found in any migration file:

| Table | Column | Notes Claim |
|-------|--------|------------|
| employees | personal_email | "Encrypted at rest" |
| employees | address | "Encrypted at rest" |
| employees | date_of_birth | "Encrypted at rest" |
| employees | national_id | "Encrypted at rest" |
| employees | bank_account_number | "Encrypted at rest" |
| employees | pan_number | "Encrypted at rest" |
| employees | aadhaar_number | "Encrypted at rest" |
| customers | billing_address | "Encrypted at rest" |
| customers | tax_id | "Encrypted at rest" |
| customer_accounts | billing_address | "Encrypted at rest" |
| customer_accounts | payment_method | "Encrypted at rest" |
| customer_accounts | tax_id | "Encrypted at rest" |
| payroll_records | bank_account | "Encrypted at rest" |
| payroll_records | tax_id | "Encrypted at rest" |
| invoices | billing_address | "Encrypted at rest" |
| invoices | tax_id | "Encrypted at rest" |
| payments | payment_method | "Encrypted at rest" |
| payments | billing_address | "Encrypted at rest" |
| leave_requests | reason | "Encrypted at rest" |
| biometric_enrollments | fingerprint_hash | "Encrypted at rest" |
| biometric_enrollments | face_encoding | "Encrypted at rest" |
| biometric_enrollments | iris_hash | "Encrypted at rest" |

The infrastructure exists but the actual encryption calls are missing. This is a documentation-implementation mismatch.

### 2. PCMS (Pest Control Management System)

**Status:** LIVE PRODUCTION (Smartshield Pest Solutions, Australian Pest Control)  
**Stack:** Spring Boot 3.2, Java 17, PostgreSQL, JPA/Hibernate  

**PII Found:**
- Invoice entity: address, mobile, email (plaintext VARCHAR columns)
- Customer entity: name, email, phone, address
- Employee records: full names, contact details
- Service records: contactName, contactPhone, contactEmail, address
- Mobile apps store customer PII locally for offline use

**Gaps:**
- NO pii_data_map or equivalent
- NO encryption at rest on any PII column
- JPA entities store PII as plaintext @Column annotations
- No field-level access controls for PII reads
- Mobile offline PII storage not addressed

**Recommendations:**
1. Create pii_data_map for PCMS schema (Invoice, Customer, Service, Employee tables)
2. Add @ColumnTransformer with pgcrypto read/write for restricted fields
3. Add PII access audit logging

### 3. Kyros Connect (CPaaS)

**Stack:** Node.js, PostgreSQL, FreeSWITCH, WhatsApp Business API  

**PII Found:**
- whatsapp_contacts: phone (plaintext), email, name
- Call Detail Records: phone numbers
- Audit logs: masked PII (email, phone, aadhaar, PAN)

**Positives:**
- Has PII masking in audit-logger middleware (kyros-connect/apps/gateway/src/middleware/audit-logger.ts)
- Masks email, phone, PAN, aadhaar patterns from logs

**Gaps:**
- NO formal pii_data_map
- NO encryption at rest for contact PII
- Phone numbers stored as plaintext with UNIQUE(org_id, phone) index
- No retention policy for contact data

**Recommendations:**
1. Create pii_data_map for whatsapp_contacts table
2. Implement column-level encryption for phone, email fields
3. Define retention periods for contact data

### 4. Paperclip (Agent Control Plane)

**Status:** Development/Staging  
**PII Found:** email only (user auth accounts)  

**Assessment:** Minimal PII exposure. Agent platform stores only operator email addresses. No customer PII.

**Recommendation:** Track when DB tracking matures. Not urgent.

### 5. Kyros Studio

**Status:** Development  
**PII Found:** NONE  

Email/phone appear only as field type definitions in the scaffolding engine and DDL generator. No actual PII is stored. Clean.

## Priority Action Items

| Priority | Repo | Action |
|----------|------|--------|
| CRITICAL | Kyros-Business-OS | Implement pgcrypto encryption for all 22 fields marked "Encrypted at rest" |
| HIGH | PCMS | Create pii_data_map + encrypt customer/employee PII in production |
| MEDIUM | Kyros Connect | Create pii_data_map + encrypt contact phone/email at rest |
| LOW | Paperclip | Add email tracking when DB maturity warrants |

## Verification Queries (Post-Implementation)

```sql
-- Kyros-Business-OS: Verify encryption is active
SELECT table_name, column_name, requires_encryption 
FROM public.pii_data_map 
WHERE requires_encryption = true 
  AND notes LIKE '%Encrypted at rest%';

-- Check if vault configuration is active
SELECT * FROM public.vault_configurations WHERE is_active = true;
```
