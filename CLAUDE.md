# Paperclip

AI agent control plane. Manages agent companies, hierarchies, and automated workflows.

## Tech Stack
- **Backend:** Express REST API (TypeScript)
- **Database:** PostgreSQL (Drizzle ORM)
- **UI:** React + Vite board
- **Packages:** db, shared, adapters

## Dev Setup
```bash
pnpm install
pnpm dev            # API: :3101, UI: :3100
pnpm test:run
pnpm -r typecheck
pnpm build
```

## Critical Rules
1. Company-scoped — every entity is scoped to a company
2. Contracts synced — db/shared/server/ui must align
3. Control-plane invariants — single-assignee, atomic checkout, budget stops
4. API: `/api` base, bearer auth for agents
5. Board is full-control operator context

## Database Changes
1. Edit `packages/db/src/schema/*.ts`
2. Export from `packages/db/src/schema/index.ts`
3. `pnpm db:generate`
4. `pnpm -r typecheck`
