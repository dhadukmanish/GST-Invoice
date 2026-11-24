import { and, eq } from 'drizzle-orm';
import { DEFAULT_WA_TEMPLATES, invoiceSettingsSchema, type InvoiceSettings } from '@gst/shared';
import { db, schema, type Tx } from '../db/client';

export async function getSetting<T = Record<string, unknown>>(tenantId: string, key: string, tx: Tx | typeof db = db): Promise<T> {
  const [row] = await tx.select().from(schema.settings).where(and(eq(schema.settings.tenantId, tenantId), eq(schema.settings.key, key)));
  return (row?.value ?? {}) as T;
}

export async function setSetting(tenantId: string, key: string, value: unknown, tx: Tx | typeof db = db) {
  await tx
    .insert(schema.settings)
    .values({ tenantId, key, value })
    .onConflictDoUpdate({ target: [schema.settings.tenantId, schema.settings.key], set: { value, updatedAt: new Date() } });
}

export const DEFAULT_INVOICE_SETTINGS: InvoiceSettings = {
  prefix: 'INV/{FY}/',
  nextNumber: 1,
  padding: 4,
  resetEveryFY: true,
  dueDays: 15,
  roundOff: true,
  priceIncludesTax: false,
  defaultGstRate: 18,
  customFields: [
    { key: 'po_no', label: 'PO No', enabled: false },
    { key: 'vehicle_no', label: 'Vehicle No', enabled: false },
    { key: 'eway_bill', label: 'E-Way Bill No', enabled: false },
  ],
};

export async function getInvoiceSettings(tenantId: string, tx: Tx | typeof db = db) {
  const v = await getSetting<Partial<InvoiceSettings> & { seqFy?: string }>(tenantId, 'invoice', tx);
  const parsed = invoiceSettingsSchema.safeParse({ ...DEFAULT_INVOICE_SETTINGS, ...v });
  return { ...(parsed.success ? parsed.data : DEFAULT_INVOICE_SETTINGS), seqFy: v.seqFy ?? '' };
}

export interface WaStored {
  enabled?: boolean;
  apiUrl?: string;
  tokenEnc?: string | null;
  device?: string;
  autoOnInvoice?: boolean;
  autoOnPayment?: boolean;
  attachPdf?: boolean;
  templates?: Partial<typeof DEFAULT_WA_TEMPLATES>;
}
export const waTemplates = (s: WaStored) => ({ ...DEFAULT_WA_TEMPLATES, ...(s.templates ?? {}) });
