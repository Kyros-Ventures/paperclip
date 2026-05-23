# TechnoTrixx Agent Hierarchy — Reconciled Plan

## Principles
1. **Paperclip is the source of truth** for agent names and hierarchy
2. **SOUL files define knowledge** — what each agent knows and does
3. **Project CLAUDE.md files define stack and rules** — agents inherit from them
4. **Every agent gets a working directory, adapter, and model** — no more stubs
5. **Supervisors for BOS** (28 modules, 4 layers — too big for flat model)
6. **Flat engineers for smaller projects** (PCMS, Studio, Connect, Clip, Legacy)

---

## COMPLETE HIERARCHY

### KRYPTON — CEO & CTO
- **Role:** ceo | **Adapter:** claude_local | **Model:** claude-sonnet-4-6
- **Working dir:** `~/Documents/Github/` (umbrella)
- **Knowledge:** All 6 projects, cross-project architecture, resource allocation, sprint prioritization
- **Reports to:** JARVIS (cross-company)

---

### PCMS-LEAD → KRYPTON
- **Role:** pm | **Adapter:** claude_local | **Model:** claude-sonnet-4-6
- **Working dir:** `~/Documents/Github/PCMS/`
- **Stack:** Spring Boot 3.2, Java 17, React 18, Expo 52, PostgreSQL 16, Flyway
- **Knowledge:** Pest control domain, job scheduling, route optimization, chemical tracking, compliance, Australian regulations, multi-branch

Workers:

| Agent | Role | Adapter/Model | Working Dir | Knowledge |
|---|---|---|---|---|
| PCMS-BE | engineer | claude_local / sonnet | ~/Documents/Github/PCMS/ | Spring Boot, JPA, Flyway, PostgreSQL, REST APIs, pest domain |
| PCMS-FE | engineer | claude_local / sonnet | ~/Documents/Github/PCMS/ | React 18, Vite 5, MUI 5, TypeScript, admin panel, customer portal |
| forge-ops | devops | claude_local / sonnet | ~/Documents/Github/PCMS/ | Docker, GitHub Actions, VPS deployment, PCMS CI/CD |
| PCMS-FE-01 through 12 | engineer | process | ~/Documents/Github/PCMS/ | Expo 52, React Native, mobile offline-first, manager/employee apps |

Notes:
- PCMS-FE-01..12 report to PCMS-FE (mobile lead)
- PCMS is PRODUCTION — 100/100 completeness, 99.9% SLA target

---

### BOS-LEAD → KRYPTON
- **Role:** pm | **Adapter:** claude_local | **Model:** claude-sonnet-4-6
- **Working dir:** `~/Documents/Github/Kyros-Business-OS/`
- **Stack:** TypeScript strict, Supabase, pnpm, Turbo, Vite, React, RLS
- **Knowledge:** Multi-tenancy, 28 modules, 4-layer architecture, pod structure (Pods 1-15), GST compliance

Supervisors (match CLAUDE.md pod structure):

| Agent | Role | Adapter/Model | Domain | Knowledge |
|---|---|---|---|---|
| PLATFORM-SUP | pm | claude_local / sonnet | Pods 1-3: Core Platform | Supabase, RLS, Auth, Redis, migrations, tenant isolation |
| BUSINESS-SUP | pm | claude_local / sonnet | Pods 4-8: Business Modules | CRM, Finance, HR, Inventory, Procurement, GST, workflows |
| EXPERIENCE-SUP | pm | claude_local / sonnet | Pods 9-11: Experience | Helpdesk, Notifications, AI/Analytics, dashboards |
| VERTICALS-SUP | pm | claude_local / sonnet | Pods 12-13: Verticals | E-Commerce, Field Service, IT Mgmt |
| MODULE-SUP | pm | claude_local / sonnet | Pods 14-15: New Modules | Manufacturing, Education, Healthcare, Real Estate, Legal, Agency |

Engineers under PLATFORM-SUP:

| Agent | Role | Adapter/Model | Knowledge |
|---|---|---|---|
| BOS-BE | engineer | claude_local / sonnet | Supabase, Edge Functions, RLS implementation, migrations, Redis |
| BOS-FE | engineer | claude_local / sonnet | React, shared UI components, platform services frontend |

Notes:
- BOS is ~48/100 completeness — major build work remains
- 56 tables missing RLS, 13 in-memory Maps to migrate to Redis
- All work follows 4-layer dependency rules from CLAUDE.md

---

### STUDIO-LEAD → KRYPTON
- **Role:** pm | **Adapter:** claude_local | **Model:** claude-sonnet-4-6
- **Working dir:** `~/Documents/Github/kyros-studio/`
- **Stack:** React 18, TypeScript, Supabase, Vite 5, Tailwind, Radix, AI/LLM
- **Knowledge:** AI-native development, visual builders, code generation, process productization

Engine leads (match README architecture + SOUL knowledge):

| Agent | Role | Adapter/Model | Domain | Knowledge |
|---|---|---|---|---|
| DATA-ENGINE | engineer | claude_local / sonnet | Data Layer | DDL, migrations, Formula Engine, schema design, PostgreSQL |
| UI-ENGINE | engineer | claude_local / sonnet | UI Layer | Form Builder, Page Builder, Themes, ReactFlow, drag-drop |
| LOGIC-ENGINE | engineer | claude_local / sonnet | Logic Layer | Workflow Designer, Business Rules, Expression Engine |
| AUTH-ENGINE | engineer | claude_local / sonnet | Auth Layer | RBAC, Permissions, OAuth, multi-tenant auth |
| COMMS-ENGINE | engineer | claude_local / sonnet | Integration | Notifications, Email, Webhooks, API integrations |
| STUDIO-BUILDER | engineer | claude_local / sonnet | Build/Deploy | CI/CD, build pipeline, deployment, packaging |

Notes:
- Studio is 35/100 — early stage, heavy build needed
- STUDIO-BUILDER fixes: change parent from COMMS-ENGINE → STUDIO-LEAD (already done)

---

### CONNECT-LEAD → KRYPTON
- **Role:** pm | **Adapter:** claude_local | **Model:** claude-sonnet-4-6
- **Working dir:** `~/Documents/Github/kyros-connect/`
- **Stack:** FreeSWITCH, WhatsApp Business API, Node.js, PostgreSQL, Docker
- **Knowledge:** VoIP, SIP, WebRTC, telecom infra, multi-tenant billing

Supervisors:

| Agent | Role | Adapter/Model | Domain | Knowledge |
|---|---|---|---|---|
| TELEPHONY-SUP | pm | claude_local / sonnet | Voice | FreeSWITCH, SIP, IVR, ESL, WebRTC, call routing |
| WHATSAPP-SUP | pm | claude_local / sonnet | Messaging | Meta Business API, templates, DLT compliance, webhooks |
| GATEWAY-SUP | pm | claude_local / sonnet | API Gateway | Auth, rate limiting, routing, tenant isolation |
| INFRA-SUP | devops | claude_local / sonnet | Infrastructure | Docker, deploy, monitoring, VPS, Prometheus |

Engineers under supervisors (existing + no changes needed):
- TELEPHONY-SUP → CONNECT-TELEPHONY-LEAD
- WHATSAPP-SUP → CONNECT-WHATSAPP-LEAD
- GATEWAY-SUP → CONNECT-GATEWAY-LEAD
- INFRA-SUP → CONNECT-INFRA-LEAD, CONNECT-INFRA-01, CONNECT-INFRA-02
- CONNECT-LEAD directly → CONNECT-ADMIN-LEAD, CONNECT-BE-01..05, CONNECT-FE-01..03

Notes:
- Connect is BUILDING — Phase 1, first tenant Smartshield
- TEC worktree code was lost, recovery needed from Time Machine
- WhatsApp BSP approval pending from Meta

---

### CLIP-LEAD → KRYPTON
- **Role:** pm | **Adapter:** claude_local | **Model:** claude-sonnet-4-6
- **Working dir:** `~/Documents/Github/paperclip/`
- **Stack:** Node.js, React, PostgreSQL (PGlite dev), Drizzle ORM
- **Knowledge:** Agent orchestration, Paperclip API, control plane, plugin architecture

Workers (no changes):

| Agent | Role | Adapter/Model | Knowledge |
|---|---|---|---|
| CLIP-BE | engineer | claude_local / sonnet | Backend API, Drizzle, PostgreSQL, services |
| CLIP-FE | engineer | claude_local / sonnet | React UI, Vite, component library |
| CLIP-INT | engineer | claude_local / sonnet | MCP, plugins, integrations, adapters |
| CLIP-QA | qa | claude_local / sonnet | Testing, Paperclip quality, agent verification |

---

### LEGACY-LEAD → KRYPTON
- **Role:** pm | **Adapter:** claude_local | **Model:** claude-sonnet-4-6
- **Working dir:** `~/Documents/Github/legacy/`
- **Stack:** JSP, Servlets, MySQL (appahcca_cms)
- **Knowledge:** Legacy maintenance, XSS hardening, SQL injection prevention
- **Solo operator** — no workers

---

### ARCH → KRYPTON (Chief Architect)
- **Role:** engineer | **Adapter:** claude_local | **Model:** claude-sonnet-4-6
- **Working dir:** `~/Documents/Github/` (cross-project)
- **Knowledge:** Architecture standards, cross-project review, documentation enforcement
- **Auditor, not builder**

SENTINEL team (4 specialized security auditors):

| Agent | Role | Adapter/Model | Focus | Knowledge |
|---|---|---|---|---|
| SENTINEL-platform | qa | claude_local / sonnet | Platform Layer | Supabase, RLS policies, Edge Functions, migrations, auth, Redis |
| SENTINEL-app | qa | claude_local / sonnet | Application Layer | Module code, business logic, API endpoints, data access |
| SENTINEL-framework | qa | claude_local / sonnet | Framework Layer | Shared packages, hooks, patterns, validators, utilities |
| SENTINEL-infra | qa | claude_local / sonnet | Infrastructure | Docker, VPS, CI/CD, secrets, network, monitoring |

---

### GUARDIAN → KRYPTON (QA Lead)
- **Role:** qa | **Adapter:** claude_local | **Model:** claude-sonnet-4-6
- **Working dir:** `~/Documents/Github/` (cross-project)
- **Knowledge:** Test strategy, quality gates, coverage standards, pre-commit enforcement

| Agent | Role | Adapter/Model | Knowledge |
|---|---|---|---|
| qa-engineer | qa | claude_local / sonnet | Vitest, Playwright, coverage reporting, CI integration, test data |

---

### OPS → KRYPTON (Infrastructure)
- **Role:** devops | **Adapter:** claude_local | **Model:** claude-sonnet-4-6
- **Working dir:** `~/Documents/Github/` (cross-project)
- **Knowledge:** Docker, VPS management, CI/CD, deployment, monitoring, SSL
- **Solo** — no workers

---

### REVIEWER → KRYPTON (Code Review)
- **Role:** qa | **Adapter:** claude_local | **Model:** claude-sonnet-4-6
- **Working dir:** `~/Documents/Github/` (cross-project)
- **Knowledge:** Code quality, PR review, architecture review, test coverage verification
- **Solo** — no workers

---

## SUMMARY: Changes Needed

### New agents to create (5):
1. forge-ops (PCMS DevOps) → PCMS-LEAD
2. SENTINEL-app (App Security) → ARCH
3. SENTINEL-framework (Framework Security) → ARCH
4. SENTINEL-infra (Infra Security) → ARCH
5. qa-engineer (QA Execution) → GUARDIAN

### Agents to update (name/parent/config) (0):
All existing agents have correct names and parents after the earlier fixes.

### SOUL files to create (9):
PLATFORM-SUP, BUSINESS-SUP, EXPERIENCE-SUP, VERTICALS-SUP, MODULE-SUP,
TELEPHONY-SUP, WHATSAPP-SUP, GATEWAY-SUP, INFRA-SUP

### SOUL files to update (rename content) (6):
- PCMS-BE (was forge-backend naming references)
- PCMS-FE (was forge-frontend naming references) 
- DATA-ENGINE, UI-ENGINE, LOGIC-ENGINE, AUTH-ENGINE, COMMS-ENGINE, STUDIO-BUILDER (add Studio project knowledge)

### Agents to configure (62):
Every agent needs: adapterType changed from "process" to "claude_local", model set to claude-sonnet-4-6, working directory set to their project path.

### Hierarchy fixes (0 needed):
All correct after the earlier fixes.

---

## Agent Count
- **Before:** 62 (28 active, 33 idle, 1 error)
- **After:** 67 (new: forge-ops, 3 SENTINELs, qa-engineer)
- **Configuration gap:** 67 agents need adapter/model/working-dir assigned
