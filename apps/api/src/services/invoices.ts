import { and, asc, desc, eq, sql as dsql } from 'drizzle-orm';
import {
  calcInvoice,
  financialYear,
  fmtDate,
  formatInvoiceNo,
  money,
  paymentStatus,
  r2,
  type InvoiceInput,
  type PrintData,
} from '@gst/shared';
import { db, schema, type Tx } from '../db/client';
import { badRequest, notFound } from '../lib/errors';
import { env } from '../lib/env';
import { token } from '../lib/util';
import { getInvoiceSettings, getSetting, setSetting } from './settings';

/** Next number from the series; locks the settings row so two users never get the same number. */
async function nextInvoiceNo(tx: Tx, tenantId: string, invoiceDate: string): Promise<string> {
  await tx.execute(dsql`SELECT 1 FROM settings WHERE tenant_id = ${tenantId} AND key = 'invoice' FOR UPDATE`);
  const s = await getInvoiceSettings(tenantId, tx);
  const fy = financialYear(invoiceDate);
  let seq = s.nextNumber;
  if (s.resetEveryFY && s.seqFy && s.seqFy !== fy) seq = 1;
  // Skip numbers already used (e.g. typed manually).
  for (let guard = 0; guard < 1000; guard++) {
    const no = formatInvoiceNo(s.prefix, seq, s.padding, invoiceDate);
    const [hit] = await tx.select({ id: schema.invoices.id }).from(schema.invoices).where(and(eq(schema.invoices.tenantId, tenantId), eq(schema.invoices.invoiceNo, no)));
    if (!hit) {
      const { seqFy: _drop, ...rest } = s;
      await setSetting(tenantId, 'invoice', { ...rest, nextNumber: seq + 1, seqFy: fy }, tx);
      return no;
    }
    seq++;
  }
  throw badRequest('Could not find a free invoice number — check Settings → Invoice series');
}

export async function previewNextNo(tenantId: string, invoiceDate: string) {
  const s = await getInvoiceSettings(tenantId);
  const fy = financialYear(invoiceDate);
  const seq = s.resetEveryFY && s.seqFy && s.seqFy !== fy ? 1 : s.nextNumber;
  return formatInvoiceNo(s.prefix, seq, s.padding, invoiceDate);
}

async function companyState(tenantId: string) {
  const c = await getSetting<{ stateCode?: string }>(tenantId, 'company');
  return c.stateCode ?? '';
}

function computed(input: InvoiceInput, sellerState: string, roundOff: boolean) {
  const interstate = Boolean(sellerState) && input.placeOfSupply !== sellerState;
  const res = calcInvoice(input.lines, { discount: input.discount, priceIncludesTax: input.priceIncludesTax, interstate, roundOff });
  return { interstate, res };
}

export async function saveInvoice(tenantId: string, userId: string, input: InvoiceInput, existingId?: string) {
  const sellerState = await companyState(tenantId);
  if (!sellerState) throw badRequest('Set your business state first (Settings → Company)');
  const settingsRow = await getInvoiceSettings(tenantId);
  const [cust] = await db.select().from(schema.customers).where(and(eq(schema.customers.id, input.customerId), eq(schema.customers.tenantId, tenantId)));
  if (!cust) throw badRequest('Customer not found');
  const { interstate, res } = computed(input, sellerState, settingsRow.roundOff);
  const snapshot = { name: cust.name, gstin: cust.gstin, stateCode: cust.stateCode, address: cust.address, city: cust.city, pincode: cust.pincode, phone: cust.phone, email: cust.email };

  return db.transaction(async (tx) => {
    let invoiceId = existingId;
    let paid = 0;
    if (existingId) {
      const [old] = await tx.select().from(schema.invoices).where(and(eq(schema.invoices.id, existingId), eq(schema.invoices.tenantId, tenantId))).for('update');
      if (!old) throw notFound('Invoice not found');
      if (old.status === 'cancelled') throw badRequest('A cancelled invoice cannot be edited');
      paid = old.paid;
      if (res.total + 0.004 < paid) throw badRequest(`Total (${money(res.total)}) cannot be less than the amount already received (${money(paid)})`);
      const invoiceNo = input.invoiceNo?.trim() || old.invoiceNo;
      await tx
        .update(schema.invoices)
        .set({
          invoiceNo,
          invoiceDate: input.invoiceDate,
          dueDate: input.dueDate ?? null,
          customerId: cust.id,
          customer: snapshot,
          placeOfSupply: input.placeOfSupply,
          isInterstate: interstate,
          priceIncludesTax: input.priceIncludesTax,
          subtotal: res.subtotal,
          discount: res.discount,
          taxable: res.taxable,
          cgst: res.cgst,
          sgst: res.sgst,
          igst: res.igst,
          roundOff: res.roundOff,
          total: res.total,
          balance: r2(res.total - paid),
          status: paymentStatus(res.total, paid),
          notes: input.notes,
          shipTo: input.shipTo,
          extra: input.extra,
          updatedAt: new Date(),
        })
        .where(eq(schema.invoices.id, existingId));
      await tx.delete(schema.invoiceLines).where(eq(schema.invoiceLines.invoiceId, existingId));
    } else {
      const invoiceNo = input.invoiceNo?.trim() || (await nextInvoiceNo(tx, tenantId, input.invoiceDate));
      const [row] = await tx
        .insert(schema.invoices)
        .values({
          tenantId,
          invoiceNo,
          invoiceDate: input.invoiceDate,
          dueDate: input.dueDate ?? null,
          customerId: cust.id,
          customer: snapshot,
          placeOfSupply: input.placeOfSupply,
          isInterstate: interstate,
          priceIncludesTax: input.priceIncludesTax,
          subtotal: res.subtotal,
          discount: res.discount,
          taxable: res.taxable,
          cgst: res.cgst,
          sgst: res.sgst,
          igst: res.igst,
          roundOff: res.roundOff,
          total: res.total,
          paid: 0,
          balance: res.total,
          status: 'unpaid',
          notes: input.notes,
          shipTo: input.shipTo,
          extra: input.extra,
          publicToken: token(18),
          createdBy: userId,
        })
        .returning({ id: schema.invoices.id });
      invoiceId = row.id;
    }
    await tx.insert(schema.invoiceLines).values(
      input.lines.map((l, i) => ({
        invoiceId: invoiceId!,
        sortOrder: i,
        itemId: l.itemId ?? null,
        name: l.name,
        description: l.description,
        hsn: l.hsn,
        unit: l.unit,
        qty: l.qty,
        rate: l.rate,
        discountPct: l.discountPct,
        gstRate: l.gstRate,
        taxable: res.lines[i].taxable,
        taxAmount: res.lines[i].taxAmount,
        total: res.lines[i].total,
      })),
    );
    if (!existingId && input.payment && input.payment.amount > 0) {
      const amount = Math.min(input.payment.amount, res.total);
      await tx.insert(schema.payments).values({
        tenantId,
        invoiceId: invoiceId!,
        customerId: cust.id,
        paymentDate: input.invoiceDate,
        amount,
        mode: input.payment.mode,
        reference: input.payment.reference,
        createdBy: userId,
      });
      await recalcPaid(tx, invoiceId!);
    }
    return invoiceId!;
  });
}

/** Paid / balance / status from the payments table (single source of truth). */
export async function recalcPaid(tx: Tx | typeof db, invoiceId: string) {
  const [inv] = await tx.select().from(schema.invoices).where(eq(schema.invoices.id, invoiceId));
  if (!inv) return;
  const [{ s }] = await tx.select({ s: dsql<string>`coalesce(sum(${schema.payments.amount}),0)` }).from(schema.payments).where(eq(schema.payments.invoiceId, invoiceId));
  const paid = r2(Number(s));
  await tx
    .update(schema.invoices)
    .set({ paid, balance: r2(inv.total - paid), status: inv.status === 'cancelled' ? 'cancelled' : paymentStatus(inv.total, paid), updatedAt: new Date() })
    .where(eq(schema.invoices.id, invoiceId));
}

export async function getInvoice(tenantId: string, id: string) {
  const [inv] = await db.select().from(schema.invoices).where(and(eq(schema.invoices.id, id), eq(schema.invoices.tenantId, tenantId)));
  if (!inv) throw notFound('Invoice not found');
  const lines = await db.select().from(schema.invoiceLines).where(eq(schema.invoiceLines.invoiceId, id)).orderBy(asc(schema.invoiceLines.sortOrder));
  const pays = await db.select().from(schema.payments).where(eq(schema.payments.invoiceId, id)).orderBy(desc(schema.payments.paymentDate));
  return { ...inv, lines, payments: pays, publicUrl: publicUrl(inv.publicToken) };
}

export const publicUrl = (t: string) => `${env.PUBLIC_URL}/v/${t}`;

/** Everything the template renderer needs. */
export async function printData(tenantId: string, inv: Awaited<ReturnType<typeof getInvoice>>): Promise<PrintData> {
  const company = await getSetting<PrintData['company']>(tenantId, 'company');
  const s = await getInvoiceSettings(tenantId);
  const extraVals = (inv.extra ?? {}) as Record<string, string>;
  const extra = s.customFields.filter((f) => f.enabled || extraVals[f.key]).map((f) => ({ label: f.label, value: extraVals[f.key] ?? '' }));
  const c = inv.customer as PrintData['customer'];
  return {
    company: { ...company, name: company.name || 'My Business' },
    customer: c,
    invoice: {
      invoiceNo: inv.invoiceNo,
      invoiceDate: inv.invoiceDate,
      dueDate: inv.dueDate,
      placeOfSupply: inv.placeOfSupply,
      isInterstate: inv.isInterstate,
      priceIncludesTax: inv.priceIncludesTax,
      subtotal: inv.subtotal,
      discount: inv.discount,
      taxable: inv.taxable,
      cgst: inv.cgst,
      sgst: inv.sgst,
      igst: inv.igst,
      roundOff: inv.roundOff,
      total: inv.total,
      paid: inv.paid,
      balance: inv.balance,
      status: inv.status,
      notes: inv.notes,
      shipTo: inv.shipTo,
      extra,
    },
    lines: inv.lines.map((l) => ({ name: l.name, description: l.description, hsn: l.hsn, unit: l.unit, qty: l.qty, rate: l.rate, discountPct: l.discountPct, gstRate: l.gstRate, taxable: l.taxable, taxAmount: l.taxAmount, total: l.total })),
  };
}

export async function defaultTemplate(tenantId: string) {
  const [t] = await db
    .select()
    .from(schema.printTemplates)
    .where(eq(schema.printTemplates.tenantId, tenantId))
    .orderBy(desc(schema.printTemplates.isDefault), asc(schema.printTemplates.createdAt))
    .limit(1);
  return (t?.config ?? {}) as Record<string, unknown>;
}

/** Placeholder values for WhatsApp message templates. */
export async function waVars(tenantId: string, inv: { invoiceNo: string; invoiceDate: string; dueDate: string | null; total: number; paid: number; balance: number; publicToken: string; customer: unknown }) {
  const company = await getSetting<{ name?: string }>(tenantId, 'company');
  const c = inv.customer as { name?: string };
  return {
    customer: c.name ?? '',
    company: company.name ?? '',
    invoice_no: inv.invoiceNo,
    date: fmtDate(inv.invoiceDate),
    due_date: fmtDate(inv.dueDate),
    amount: money(inv.total),
    paid: money(inv.paid),
    balance: money(inv.balance),
    link: publicUrl(inv.publicToken),
  };
}
