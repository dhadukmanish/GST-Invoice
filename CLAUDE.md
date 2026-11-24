# GST Invoice — Agent Context

Multi-tenant GST invoice SaaS (pnpm workspace). Read README.md for features, docs/DEPLOY.md for production.

- `packages/shared` — GST calc (`calc.ts`), invoice HTML renderer + presets (`template.ts`), zod schemas, states. Consumed as source by api + web. Change calc/template here only.
- `apps/api` — Fastify 5 + Drizzle (`src/db/schema.ts`; numeric columns map to JS numbers via customType). Routes in `src/routes/*`. Tenancy: every tenant table has `tenant_id`; always filter by `req.auth.tenantId`. Super admin = user with `tenant_id NULL`, role `superadmin`.
- Tenant validity is enforced in `plugins/auth.ts` (`assertTenantUsable`) on login and every request.
- WhatsApp: outbox table + 20 s worker (`services/whatsapp.ts`); sender = tenant's own token, else platform token if shared + allowed.
- `apps/web` — Vite + React + TanStack Query + Tailwind; mobile-first (bottom nav < lg). PDFs are generated in the browser (`lib/pdf.ts`).
- Migrations: edit schema → `pnpm db:generate` → commit SQL. Entry point runs migrate + idempotent seed.
- Prod: shared Hostinger VPS, loopback 127.0.0.1:8095 behind host nginx. Never touch other stacks.
