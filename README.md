# GST Invoice — simple, low-cost GST billing SaaS

Sales invoices with GST (CGST/SGST/IGST), payment tracking, customer dues, WhatsApp sharing and
customisable invoice templates. Mobile-friendly web app (works on any phone browser, installable as
a home-screen app). One server hosts many client businesses; a **super admin** creates each client's
login on request and controls how long it is valid.

Live: **https://gst.pratishthabridal.in**

## Features

**Client (business) side**
- Dashboard — today / month sales, outstanding, overdue, 14-day chart, top dues
- Sales invoices — auto numbering per financial year (`INV/{FY}/0001`), customer & item search with
  quick-add, line discount, bill discount, rates incl./excl. GST, round-off, place of supply →
  CGST+SGST or IGST automatically, extra fields (PO No, Vehicle No, E-Way Bill…), cancel / edit / delete
- Payments — receive full / part payments (Cash, UPI, Bank, Card, Cheque) at invoice time or later;
  paid / partial / unpaid status; payment register with mode totals
- Customers (with ledger / statement & opening balance) and Items (HSN, unit, GST rate)
- Reports — sales register, GST summary (B2B/B2C by rate + HSN summary), outstanding with ageing; CSV export
- **Invoice templates** — 5 designs (Classic, Modern, Compact, Minimal, Thermal 80/58 mm), colour, font,
  paper size and 17 show/hide options, live preview; several templates with one default
- Print, PDF download, and a public customer link (`/v/<token>`) with Print/PDF
- UPI "Scan & Pay" QR with the due amount on the invoice
- **WhatsApp** — per invoice: send via API (with PDF attachment) or free "Open WhatsApp" (wa.me) /
  "Share PDF" on phone; payment receipts & reminders; editable message templates with placeholders;
  auto-send on invoice / payment; delivery status log with retry
- Users & roles (admin / staff) within the plan's user limit

**Super admin**
- Clients list with status (active / expiring / expired / suspended), usage and last login
- Create a client account: business, contact, login username + generated password, validity date, max users
- Send login details on WhatsApp (platform number) or copy / wa.me
- Extend validity (+1/3/6/12 months or a date), suspend / activate, renewal reminder, reset passwords,
  add / edit client users, **login as client** (support mode), delete client
- Account requests from the login page ("Request an account")
- Platform settings: app name, support phone, defaults, credentials message, platform WhatsApp
  (optionally shared with clients that have no own API)

Expired or suspended clients cannot sign in (clear message with support phone); their data is kept.

## Stack

Same as DiamondBill: pnpm workspace — `apps/api` Fastify 5 + Drizzle + PostgreSQL, `apps/web`
Vite + React 18 + TanStack Query + Tailwind, `packages/shared` (GST maths, invoice template renderer,
zod schemas — used by both, so the screen, PDF and server always agree). WhatsApp outbox + worker
pattern from Keshav (mitalinfosys-style API: `POST /send` with `token`, `to`, `message`, `url`).
PDFs are made in the browser (html2canvas + jsPDF) — no headless Chrome on the server, keeps hosting cheap.

## Local development

```bash
corepack enable pnpm
pnpm install
cp apps/api/.env.example apps/api/.env      # set DATABASE_URL
pnpm db:migrate && pnpm db:seed             # super admin + demo client
pnpm dev                                    # api :4000, web :5173
```

Logins after seed: `superadmin / Admin@1234`, demo client `demo / Demo@1234` (SEED_DEMO=true).

Schema change: edit `apps/api/src/db/schema.ts` → `pnpm db:generate` → commit the new SQL in `apps/api/drizzle/`.

## Deploy

See [docs/DEPLOY.md](docs/DEPLOY.md) — Docker Compose on the Hostinger VPS behind the host nginx, same
pattern as DiamondBill (`127.0.0.1:8095`).
