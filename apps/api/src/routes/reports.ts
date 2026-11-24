import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql as dsql } from 'drizzle-orm';
import { addDays, todayIST } from '@gst/shared';
import { db } from '../db/client';

const range = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

export default async function reportRoutes(app: FastifyInstance) {
  const pre = { preHandler: [app.authenticate, app.requireTenant] };

  app.get('/api/dashboard', pre, async (req) => {
    const t = req.auth.tenantId!;
    const today = todayIST();
    const monthStart = `${today.slice(0, 7)}-01`;
    const [k] = await db.execute<Record<string, number>>(dsql`SELECT
      (SELECT coalesce(sum(total),0)::float FROM invoices WHERE tenant_id=${t} AND status<>'cancelled' AND invoice_date=${today}) today_sales,
      (SELECT count(*)::int FROM invoices WHERE tenant_id=${t} AND status<>'cancelled' AND invoice_date=${today}) today_count,
      (SELECT coalesce(sum(total),0)::float FROM invoices WHERE tenant_id=${t} AND status<>'cancelled' AND invoice_date>=${monthStart}) month_sales,
      (SELECT count(*)::int FROM invoices WHERE tenant_id=${t} AND status<>'cancelled' AND invoice_date>=${monthStart}) month_count,
      (SELECT coalesce(sum(cgst+sgst+igst),0)::float FROM invoices WHERE tenant_id=${t} AND status<>'cancelled' AND invoice_date>=${monthStart}) month_tax,
      (SELECT coalesce(sum(amount),0)::float FROM payments WHERE tenant_id=${t} AND payment_date>=${monthStart}) month_received,
      (SELECT coalesce(sum(amount),0)::float FROM payments WHERE tenant_id=${t} AND payment_date=${today}) today_received,
      (SELECT coalesce(sum(balance),0)::float FROM invoices WHERE tenant_id=${t} AND status IN ('unpaid','partial')) outstanding,
      (SELECT count(DISTINCT customer_id)::int FROM invoices WHERE tenant_id=${t} AND status IN ('unpaid','partial')) outstanding_customers,
      (SELECT coalesce(sum(balance),0)::float FROM invoices WHERE tenant_id=${t} AND status IN ('unpaid','partial') AND due_date < ${today}) overdue,
      (SELECT count(*)::int FROM customers WHERE tenant_id=${t} AND is_active) customers`);
    const trend = await db.execute<{ d: string; sales: number; received: number }>(dsql`
      SELECT d::date::text d,
        coalesce((SELECT sum(total) FROM invoices WHERE tenant_id=${t} AND status<>'cancelled' AND invoice_date=d::date),0)::float sales,
        coalesce((SELECT sum(amount) FROM payments WHERE tenant_id=${t} AND payment_date=d::date),0)::float received
      FROM generate_series(${addDays(today, -13)}::date, ${today}::date, interval '1 day') d`);
    const recent = await db.execute(dsql`SELECT id, invoice_no "invoiceNo", invoice_date::text "invoiceDate", customer->>'name' "customerName", total::float total, balance::float balance, status
      FROM invoices WHERE tenant_id=${t} ORDER BY created_at DESC LIMIT 8`);
    const topDue = await db.execute(dsql`SELECT customer_id "customerId", max(customer->>'name') name, max(customer->>'phone') phone, sum(balance)::float balance, count(*)::int invoices, min(invoice_date)::text oldest
      FROM invoices WHERE tenant_id=${t} AND status IN ('unpaid','partial') GROUP BY customer_id ORDER BY 4 DESC LIMIT 6`);
    return { kpi: k, trend, recent, topDue };
  });

  app.get('/api/reports/sales', pre, async (req) => {
    const q = range.parse(req.query);
    const t = req.auth.tenantId!;
    return db.execute(dsql`SELECT invoice_no "invoiceNo", invoice_date::text "invoiceDate", customer->>'name' "customer", customer->>'gstin' gstin,
        place_of_supply "pos", taxable::float, cgst::float, sgst::float, igst::float, round_off::float "roundOff", total::float, paid::float, balance::float, status
      FROM invoices WHERE tenant_id=${t} AND invoice_date BETWEEN ${q.from} AND ${q.to} AND status<>'cancelled' ORDER BY invoice_date, invoice_no`);
  });

  /** GST summary: B2B vs B2C, by rate — what the accountant needs for GSTR-1 / 3B. */
  app.get('/api/reports/gst', pre, async (req) => {
    const q = range.parse(req.query);
    const t = req.auth.tenantId!;
    const byRate = await db.execute(dsql`SELECT l.gst_rate::float rate,
        CASE WHEN coalesce(i.customer->>'gstin','')<>'' THEN 'B2B' ELSE 'B2C' END kind,
        sum(l.taxable)::float taxable,
        sum(CASE WHEN i.is_interstate THEN 0 ELSE l.tax_amount END)::float intra_tax,
        sum(CASE WHEN i.is_interstate THEN l.tax_amount ELSE 0 END)::float igst,
        count(DISTINCT i.id)::int invoices
      FROM invoice_lines l JOIN invoices i ON i.id=l.invoice_id
      WHERE i.tenant_id=${t} AND i.invoice_date BETWEEN ${q.from} AND ${q.to} AND i.status<>'cancelled'
      GROUP BY 1,2 ORDER BY 2,1`);
    const hsn = await db.execute(dsql`SELECT coalesce(nullif(l.hsn,''),'—') hsn, max(l.unit) unit, l.gst_rate::float rate, sum(l.qty)::float qty, sum(l.taxable)::float taxable, sum(l.tax_amount)::float tax, sum(l.total)::float total
      FROM invoice_lines l JOIN invoices i ON i.id=l.invoice_id
      WHERE i.tenant_id=${t} AND i.invoice_date BETWEEN ${q.from} AND ${q.to} AND i.status<>'cancelled'
      GROUP BY 1,3 ORDER BY 1,3`);
    const [tot] = await db.execute(dsql`SELECT count(*)::int invoices, coalesce(sum(taxable),0)::float taxable, coalesce(sum(cgst),0)::float cgst, coalesce(sum(sgst),0)::float sgst, coalesce(sum(igst),0)::float igst, coalesce(sum(total),0)::float total
      FROM invoices WHERE tenant_id=${t} AND invoice_date BETWEEN ${q.from} AND ${q.to} AND status<>'cancelled'`);
    return { byRate, hsn, totals: tot };
  });

  /** Outstanding by customer with ageing buckets (days past invoice date). */
  app.get('/api/reports/outstanding', pre, async (req) => {
    const t = req.auth.tenantId!;
    const today = todayIST();
    return db.execute(dsql`SELECT customer_id "customerId", max(customer->>'name') name, max(customer->>'phone') phone, count(*)::int invoices,
        sum(balance)::float balance,
        sum(CASE WHEN ${today}::date - invoice_date <= 30 THEN balance ELSE 0 END)::float d0_30,
        sum(CASE WHEN ${today}::date - invoice_date BETWEEN 31 AND 60 THEN balance ELSE 0 END)::float d31_60,
        sum(CASE WHEN ${today}::date - invoice_date BETWEEN 61 AND 90 THEN balance ELSE 0 END)::float d61_90,
        sum(CASE WHEN ${today}::date - invoice_date > 90 THEN balance ELSE 0 END)::float d90
      FROM invoices WHERE tenant_id=${t} AND status IN ('unpaid','partial') GROUP BY customer_id ORDER BY 5 DESC`);
  });
}
