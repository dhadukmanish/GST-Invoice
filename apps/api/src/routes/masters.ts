import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, asc, eq, ilike, or, sql as dsql } from 'drizzle-orm';
import { customerSchema, itemSchema, r2, stateFromGstin } from '@gst/shared';
import { db, schema } from '../db/client';
import { badRequest, notFound } from '../lib/errors';
import { parse } from '../lib/validate';
import { like } from '../lib/util';

const listQ = z.object({ q: z.string().optional(), active: z.enum(['all', 'active']).default('active') });

export default async function masterRoutes(app: FastifyInstance) {
  const pre = { preHandler: [app.authenticate, app.requireTenant] };

  // ---------------- customers
  app.get('/api/customers', pre, async (req) => {
    const q = listQ.parse(req.query);
    const t = req.auth.tenantId!;
    const conds = [eq(schema.customers.tenantId, t)];
    if (q.active === 'active') conds.push(eq(schema.customers.isActive, true));
    if (q.q) conds.push(or(ilike(schema.customers.name, like(q.q)), ilike(schema.customers.phone, like(q.q)), ilike(schema.customers.gstin, like(q.q)), ilike(schema.customers.city, like(q.q)))!);
    const rows = await db
      .select({
        c: schema.customers,
        outstanding: dsql<number>`(SELECT coalesce(sum(balance),0)::float FROM invoices i WHERE i.customer_id = "customers"."id" AND i.status <> 'cancelled')`,
        invoiceCount: dsql<number>`(SELECT count(*)::int FROM invoices i WHERE i.customer_id = "customers"."id")`,
      })
      .from(schema.customers)
      .where(and(...conds))
      .orderBy(asc(schema.customers.name))
      .limit(1000);
    return rows.map((r) => ({ ...r.c, outstanding: r2(r.outstanding + r.c.openingBalance), invoiceCount: r.invoiceCount }));
  });

  app.get('/api/customers/:id', pre, async (req) => {
    const { id } = req.params as { id: string };
    const [c] = await db.select().from(schema.customers).where(and(eq(schema.customers.id, id), eq(schema.customers.tenantId, req.auth.tenantId!)));
    if (!c) throw notFound('Customer not found');
    return c;
  });

  const fixCustomer = (body: z.infer<typeof customerSchema>) => ({ ...body, stateCode: body.stateCode || stateFromGstin(body.gstin) });

  app.post('/api/customers', pre, async (req) => {
    const body = fixCustomer(parse(customerSchema, req.body));
    const [c] = await db.insert(schema.customers).values({ ...body, tenantId: req.auth.tenantId! }).returning();
    return c;
  });
  app.put('/api/customers/:id', pre, async (req) => {
    const { id } = req.params as { id: string };
    const body = fixCustomer(parse(customerSchema, req.body));
    const [c] = await db.update(schema.customers).set(body).where(and(eq(schema.customers.id, id), eq(schema.customers.tenantId, req.auth.tenantId!))).returning();
    if (!c) throw notFound('Customer not found');
    return c;
  });
  app.delete('/api/customers/:id', pre, async (req) => {
    const { id } = req.params as { id: string };
    const [{ n }] = await db.select({ n: dsql<number>`count(*)::int` }).from(schema.invoices).where(eq(schema.invoices.customerId, id));
    if (n > 0) throw badRequest('This customer has invoices — mark it inactive instead of deleting');
    await db.delete(schema.customers).where(and(eq(schema.customers.id, id), eq(schema.customers.tenantId, req.auth.tenantId!)));
    return { ok: true };
  });

  /** Customer statement: opening + invoices (debit) + payments (credit) with running balance. */
  app.get('/api/customers/:id/ledger', pre, async (req) => {
    const { id } = req.params as { id: string };
    const t = req.auth.tenantId!;
    const [c] = await db.select().from(schema.customers).where(and(eq(schema.customers.id, id), eq(schema.customers.tenantId, t)));
    if (!c) throw notFound('Customer not found');
    const rows = await db.execute<{ date: string; type: string; ref: string; ref_id: string; debit: number; credit: number; note: string }>(dsql`
      SELECT invoice_date::text date, 'Invoice' type, invoice_no ref, id::text ref_id, total::float debit, 0::float credit, status note, created_at
        FROM invoices WHERE tenant_id=${t} AND customer_id=${id} AND status<>'cancelled'
      UNION ALL
      SELECT p.payment_date::text, 'Payment', i.invoice_no, i.id::text, 0, p.amount::float, p.mode || CASE WHEN p.reference<>'' THEN ' · ' || p.reference ELSE '' END, p.created_at
        FROM payments p JOIN invoices i ON i.id=p.invoice_id WHERE p.tenant_id=${t} AND p.customer_id=${id}
      ORDER BY 1, 7`);
    let bal = c.openingBalance;
    const entries = rows.map((r) => {
      bal = r2(bal + r.debit - r.credit);
      return { date: r.date, type: r.type, ref: r.ref, refId: r.ref_id, debit: r.debit, credit: r.credit, note: r.note, balance: bal };
    });
    return { customer: c, opening: c.openingBalance, entries, closing: bal };
  });

  // ---------------- items
  app.get('/api/items', pre, async (req) => {
    const q = listQ.parse(req.query);
    const conds = [eq(schema.items.tenantId, req.auth.tenantId!)];
    if (q.active === 'active') conds.push(eq(schema.items.isActive, true));
    if (q.q) conds.push(or(ilike(schema.items.name, like(q.q)), ilike(schema.items.hsn, like(q.q)))!);
    return db.select().from(schema.items).where(and(...conds)).orderBy(asc(schema.items.name)).limit(2000);
  });
  app.post('/api/items', pre, async (req) => {
    const body = parse(itemSchema, req.body);
    const [i] = await db.insert(schema.items).values({ ...body, tenantId: req.auth.tenantId! }).returning();
    return i;
  });
  app.put('/api/items/:id', pre, async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(itemSchema, req.body);
    const [i] = await db.update(schema.items).set(body).where(and(eq(schema.items.id, id), eq(schema.items.tenantId, req.auth.tenantId!))).returning();
    if (!i) throw notFound('Item not found');
    return i;
  });
  app.delete('/api/items/:id', pre, async (req) => {
    const { id } = req.params as { id: string };
    const [{ n }] = await db.select({ n: dsql<number>`count(*)::int` }).from(schema.invoiceLines).where(eq(schema.invoiceLines.itemId, id));
    if (n > 0) throw badRequest('This item is used in invoices — mark it inactive instead');
    await db.delete(schema.items).where(and(eq(schema.items.id, id), eq(schema.items.tenantId, req.auth.tenantId!)));
    return { ok: true };
  });
}
