import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import { and, desc, eq, gte, ilike, lte, or, sql as dsql } from 'drizzle-orm';
import { fillTemplate, invoiceSchema, money, paymentSchema, todayIST } from '@gst/shared';
import { db, schema } from '../db/client';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { parse } from '../lib/validate';
import { env } from '../lib/env';
import { like, logActivity, token } from '../lib/util';
import { defaultTemplate, getInvoice, previewNextNo, printData, recalcPaid, saveInvoice, waVars } from '../services/invoices';
import { getSetting, waTemplates, type WaStored } from '../services/settings';
import { enqueue, senderFor } from '../services/whatsapp';

const listQ = z.object({
  q: z.string().optional(),
  status: z.enum(['all', 'unpaid', 'partial', 'paid', 'cancelled', 'due']).default('all'),
  from: z.string().optional(),
  to: z.string().optional(),
  customerId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});

const PDF_DIR = path.join(env.UPLOAD_DIR, 'pdf');

export default async function invoiceRoutes(app: FastifyInstance) {
  const pre = { preHandler: [app.authenticate, app.requireTenant] };

  app.addContentTypeParser('application/pdf', { parseAs: 'buffer', bodyLimit: 8 * 1024 * 1024 }, (_req, body, done) => done(null, body));

  app.get('/api/invoices', pre, async (req) => {
    const q = listQ.parse(req.query);
    const t = req.auth.tenantId!;
    const conds = [eq(schema.invoices.tenantId, t)];
    if (q.status === 'due') conds.push(dsql`${schema.invoices.status} IN ('unpaid','partial')`);
    else if (q.status !== 'all') conds.push(eq(schema.invoices.status, q.status));
    if (q.from) conds.push(gte(schema.invoices.invoiceDate, q.from));
    if (q.to) conds.push(lte(schema.invoices.invoiceDate, q.to));
    if (q.customerId) conds.push(eq(schema.invoices.customerId, q.customerId));
    if (q.q) conds.push(or(ilike(schema.invoices.invoiceNo, like(q.q)), dsql`${schema.invoices.customer}->>'name' ILIKE ${like(q.q)}`, dsql`${schema.invoices.customer}->>'phone' ILIKE ${like(q.q)}`)!);
    const where = and(...conds);
    const rows = await db
      .select({
        id: schema.invoices.id,
        invoiceNo: schema.invoices.invoiceNo,
        invoiceDate: schema.invoices.invoiceDate,
        dueDate: schema.invoices.dueDate,
        customerId: schema.invoices.customerId,
        customer: schema.invoices.customer,
        taxable: schema.invoices.taxable,
        tax: dsql<number>`(${schema.invoices.cgst} + ${schema.invoices.sgst} + ${schema.invoices.igst})::float`,
        total: schema.invoices.total,
        paid: schema.invoices.paid,
        balance: schema.invoices.balance,
        status: schema.invoices.status,
        isInterstate: schema.invoices.isInterstate,
      })
      .from(schema.invoices)
      .where(where)
      .orderBy(desc(schema.invoices.invoiceDate), desc(schema.invoices.createdAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [sum] = await db
      .select({
        count: dsql<number>`count(*)::int`,
        total: dsql<number>`coalesce(sum(CASE WHEN status<>'cancelled' THEN total END),0)::float`,
        balance: dsql<number>`coalesce(sum(CASE WHEN status<>'cancelled' THEN balance END),0)::float`,
      })
      .from(schema.invoices)
      .where(where);
    return { rows, ...sum, page: q.page, pageSize: q.pageSize };
  });

  app.get('/api/invoices/next-no', pre, async (req) => {
    const { date } = z.object({ date: z.string().default(todayIST()) }).parse(req.query);
    return { invoiceNo: await previewNextNo(req.auth.tenantId!, date) };
  });

  app.get('/api/invoices/:id', pre, async (req) => getInvoice(req.auth.tenantId!, (req.params as { id: string }).id));

  /** Invoice + company + template in one go, for print / PDF / preview. */
  app.get('/api/invoices/:id/print', pre, async (req) => {
    const inv = await getInvoice(req.auth.tenantId!, (req.params as { id: string }).id);
    const { templateId } = z.object({ templateId: z.string().uuid().optional() }).parse(req.query);
    let config = await defaultTemplate(req.auth.tenantId!);
    if (templateId) {
      const [tpl] = await db.select().from(schema.printTemplates).where(and(eq(schema.printTemplates.id, templateId), eq(schema.printTemplates.tenantId, req.auth.tenantId!)));
      if (tpl) config = tpl.config as Record<string, unknown>;
    }
    return { data: await printData(req.auth.tenantId!, inv), config, publicUrl: inv.publicUrl };
  });

  app.post('/api/invoices', pre, async (req) => {
    const body = parse(invoiceSchema, req.body);
    const id = await saveInvoice(req.auth.tenantId!, req.auth.id, body);
    const inv = await getInvoice(req.auth.tenantId!, id);
    await logActivity(req.auth.tenantId, req.auth.id, 'invoice.create', `${inv.invoiceNo} ${money(inv.total)}`);
    // Auto WhatsApp (text + link) when switched on in Settings → WhatsApp.
    const wa = await getSetting<WaStored>(req.auth.tenantId!, 'whatsapp');
    let autoWhatsapp: string | null = null;
    if (wa.autoOnInvoice && (inv.customer as { phone?: string }).phone) {
      try {
        const vars = await waVars(req.auth.tenantId!, inv);
        await enqueue(req.auth.tenantId!, { eventType: 'INVOICE', refId: inv.id, to: (inv.customer as { phone: string }).phone, message: fillTemplate(waTemplates(wa).invoice, vars) });
        autoWhatsapp = 'queued';
      } catch (e) {
        autoWhatsapp = (e as Error).message;
      }
    }
    return { ...inv, autoWhatsapp };
  });

  app.put('/api/invoices/:id', pre, async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(invoiceSchema, req.body);
    await saveInvoice(req.auth.tenantId!, req.auth.id, body, id);
    const inv = await getInvoice(req.auth.tenantId!, id);
    await logActivity(req.auth.tenantId, req.auth.id, 'invoice.update', inv.invoiceNo);
    return inv;
  });

  app.post('/api/invoices/:id/cancel', pre, async (req) => {
    const { id } = req.params as { id: string };
    const t = req.auth.tenantId!;
    const inv = await getInvoice(t, id);
    if (inv.payments.length) throw badRequest('Delete the payments of this invoice first, then cancel it');
    await db.update(schema.invoices).set({ status: 'cancelled', balance: 0, updatedAt: new Date() }).where(eq(schema.invoices.id, id));
    await logActivity(t, req.auth.id, 'invoice.cancel', inv.invoiceNo);
    return { ok: true };
  });

  app.delete('/api/invoices/:id', pre, async (req) => {
    if (req.auth.role !== 'admin') throw forbidden('Only admin can delete invoices');
    const { id } = req.params as { id: string };
    const t = req.auth.tenantId!;
    const inv = await getInvoice(t, id);
    await db.delete(schema.invoices).where(and(eq(schema.invoices.id, id), eq(schema.invoices.tenantId, t)));
    await logActivity(t, req.auth.id, 'invoice.delete', inv.invoiceNo);
    return { ok: true };
  });

  /** Browser-made PDF (same template as print) → public file used as the WhatsApp attachment. */
  app.post('/api/invoices/:id/pdf', pre, async (req) => {
    const { id } = req.params as { id: string };
    const inv = await getInvoice(req.auth.tenantId!, id);
    const buf = req.body as Buffer;
    if (!Buffer.isBuffer(buf) || buf.subarray(0, 5).toString() !== '%PDF-') throw badRequest('Not a PDF file');
    await fs.mkdir(PDF_DIR, { recursive: true });
    const safeNo = inv.invoiceNo.replace(/[^\w-]+/g, '_').slice(0, 40);
    const name = `${safeNo}_${token(12)}.pdf`;
    await fs.writeFile(path.join(PDF_DIR, name), buf);
    return { url: `${env.PUBLIC_URL}/api/files/${name}`, name };
  });

  /** Send on WhatsApp via the API (queued). Text comes from the dialog (already filled by the browser). */
  app.post('/api/invoices/:id/whatsapp', pre, async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(z.object({ to: z.string().min(8).max(20), message: z.string().min(1).max(3000), mediaUrl: z.string().url().optional(), kind: z.enum(['INVOICE', 'REMINDER']).default('INVOICE') }), req.body);
    const inv = await getInvoice(req.auth.tenantId!, id);
    if (body.mediaUrl && !body.mediaUrl.startsWith(`${env.PUBLIC_URL}/api/files/`)) throw badRequest('Invalid attachment');
    const msg = await enqueue(req.auth.tenantId!, { eventType: body.kind, refId: inv.id, to: body.to, message: body.message, mediaUrl: body.mediaUrl });
    await logActivity(req.auth.tenantId, req.auth.id, `whatsapp.${body.kind.toLowerCase()}`, `${inv.invoiceNo} → ${body.to}`);
    return { ok: true, id: msg.id };
  });

  /** What the WhatsApp dialog needs: number, filled messages and whether the API is available. */
  app.get('/api/invoices/:id/whatsapp', pre, async (req) => {
    const { id } = req.params as { id: string };
    const t = req.auth.tenantId!;
    const inv = await getInvoice(t, id);
    const wa = await getSetting<WaStored>(t, 'whatsapp');
    const tpl = waTemplates(wa);
    const vars = await waVars(t, inv);
    const sender = await senderFor(t);
    const history = await db
      .select({ id: schema.whatsappMessages.id, status: schema.whatsappMessages.status, toNumber: schema.whatsappMessages.toNumber, createdAt: schema.whatsappMessages.createdAt, eventType: schema.whatsappMessages.eventType, error: schema.whatsappMessages.error })
      .from(schema.whatsappMessages)
      .where(and(eq(schema.whatsappMessages.tenantId, t), eq(schema.whatsappMessages.refId, id)))
      .orderBy(desc(schema.whatsappMessages.createdAt))
      .limit(10);
    return {
      to: (inv.customer as { phone?: string }).phone ?? '',
      invoiceMessage: fillTemplate(tpl.invoice, vars),
      reminderMessage: fillTemplate(tpl.reminder, vars),
      apiAvailable: Boolean(sender),
      attachPdf: wa.attachPdf !== false,
      history,
    };
  });

  // ---------------- payments
  app.get('/api/payments', pre, async (req) => {
    const q = z.object({ from: z.string().optional(), to: z.string().optional(), q: z.string().optional(), mode: z.string().optional() }).parse(req.query);
    const t = req.auth.tenantId!;
    const conds = [eq(schema.payments.tenantId, t)];
    if (q.from) conds.push(gte(schema.payments.paymentDate, q.from));
    if (q.to) conds.push(lte(schema.payments.paymentDate, q.to));
    if (q.mode) conds.push(eq(schema.payments.mode, q.mode));
    if (q.q) conds.push(or(ilike(schema.invoices.invoiceNo, like(q.q)), dsql`${schema.invoices.customer}->>'name' ILIKE ${like(q.q)}`, ilike(schema.payments.reference, like(q.q)))!);
    return db
      .select({ p: schema.payments, invoiceNo: schema.invoices.invoiceNo, customerName: dsql<string>`${schema.invoices.customer}->>'name'` })
      .from(schema.payments)
      .innerJoin(schema.invoices, eq(schema.invoices.id, schema.payments.invoiceId))
      .where(and(...conds))
      .orderBy(desc(schema.payments.paymentDate), desc(schema.payments.createdAt))
      .limit(1000)
      .then((rows) => rows.map((r) => ({ ...r.p, invoiceNo: r.invoiceNo, customerName: r.customerName })));
  });

  app.post('/api/payments', pre, async (req) => {
    const body = parse(paymentSchema, req.body);
    const t = req.auth.tenantId!;
    const inv = await getInvoice(t, body.invoiceId);
    if (inv.status === 'cancelled') throw badRequest('Invoice is cancelled');
    if (body.amount > inv.balance + 0.004) throw badRequest(`Amount is more than the balance due (${money(inv.balance)})`);
    const [p] = await db.transaction(async (tx) => {
      const r = await tx
        .insert(schema.payments)
        .values({ tenantId: t, invoiceId: inv.id, customerId: inv.customerId, paymentDate: body.paymentDate, amount: body.amount, mode: body.mode, reference: body.reference, notes: body.notes, createdBy: req.auth.id })
        .returning();
      await recalcPaid(tx, inv.id);
      return r;
    });
    await logActivity(t, req.auth.id, 'payment.create', `${inv.invoiceNo} ${money(body.amount)}`);
    let whatsapp: string | null = null;
    const wa = await getSetting<WaStored>(t, 'whatsapp');
    const phone = (inv.customer as { phone?: string }).phone;
    if ((body.sendWhatsapp || wa.autoOnPayment) && phone) {
      try {
        const fresh = await getInvoice(t, inv.id);
        const vars = { ...(await waVars(t, fresh)), payment_amount: money(body.amount), payment_mode: body.mode };
        await enqueue(t, { eventType: 'PAYMENT', refId: inv.id, to: phone, message: fillTemplate(waTemplates(wa).payment, vars) });
        whatsapp = 'queued';
      } catch (e) {
        whatsapp = (e as Error).message;
      }
    }
    return { ...p, whatsapp };
  });

  app.delete('/api/payments/:id', pre, async (req) => {
    const { id } = req.params as { id: string };
    const t = req.auth.tenantId!;
    const [p] = await db.select().from(schema.payments).where(and(eq(schema.payments.id, id), eq(schema.payments.tenantId, t)));
    if (!p) throw notFound('Payment not found');
    await db.transaction(async (tx) => {
      await tx.delete(schema.payments).where(eq(schema.payments.id, id));
      await recalcPaid(tx, p.invoiceId);
    });
    await logActivity(t, req.auth.id, 'payment.delete', money(p.amount));
    return { ok: true };
  });

  // ---------------- public (customer opens the WhatsApp link)
  app.get('/api/public/invoices/:token', async (req) => {
    const { token: tk } = req.params as { token: string };
    if (!/^[\w-]{10,40}$/.test(tk)) throw notFound('Invoice not found');
    const [inv] = await db.select().from(schema.invoices).where(eq(schema.invoices.publicToken, tk));
    if (!inv || inv.status === 'cancelled') throw notFound('Invoice not found');
    const full = await getInvoice(inv.tenantId, inv.id);
    return { data: await printData(inv.tenantId, full), config: await defaultTemplate(inv.tenantId), invoiceNo: inv.invoiceNo };
  });

  app.get('/api/files/:name', async (req, reply) => {
    const { name } = req.params as { name: string };
    if (!/^[\w-]+\.pdf$/.test(name)) throw notFound();
    try {
      const buf = await fs.readFile(path.join(PDF_DIR, name));
      return reply.header('Content-Type', 'application/pdf').header('Content-Disposition', `inline; filename="${name.replace(/_[\w-]{16}\.pdf$/, '.pdf')}"`).send(buf);
    } catch {
      throw notFound('File not found');
    }
  });
}

/** Delete WhatsApp PDF attachments older than 60 days (they were only needed for sending). */
export function startPdfCleanup() {
  const run = async () => {
    try {
      const names = await fs.readdir(PDF_DIR);
      const cutoff = Date.now() - 60 * 86400_000;
      for (const n of names) {
        const st = await fs.stat(path.join(PDF_DIR, n));
        if (st.mtimeMs < cutoff) await fs.unlink(path.join(PDF_DIR, n));
      }
    } catch {
      /* folder may not exist yet */
    }
  };
  setInterval(run, 12 * 3600_000).unref();
}
