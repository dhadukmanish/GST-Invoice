import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { PRESETS, stateFromGstin } from '@gst/shared';
import { db, schema } from '../db/client';
import { badRequest } from '../lib/errors';
import { DEFAULT_INVOICE_SETTINGS, setSetting } from './settings';

export interface NewTenant {
  businessName: string;
  contactName: string;
  phone: string;
  email: string;
  stateCode: string;
  gstin: string;
  plan: string;
  validUntil: string;
  maxUsers: number;
  whatsappAllowed: boolean;
  notes: string;
  username: string;
  password: string;
  adminName: string;
}

/** Creates a client account: tenant + admin login + starter settings + default template. */
export async function createTenant(input: NewTenant) {
  const [taken] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.username, input.username));
  if (taken) throw badRequest(`Username "${input.username}" is already used. Choose another.`);
  const hash = await bcrypt.hash(input.password, 10);
  return db.transaction(async (tx) => {
    const [t] = await tx
      .insert(schema.tenants)
      .values({
        businessName: input.businessName,
        contactName: input.contactName,
        phone: input.phone,
        email: input.email,
        plan: input.plan,
        validUntil: input.validUntil,
        maxUsers: input.maxUsers,
        whatsappAllowed: input.whatsappAllowed,
        notes: input.notes,
      })
      .returning();
    await tx.insert(schema.users).values({ tenantId: t.id, role: 'admin', name: input.adminName || input.contactName || 'Admin', username: input.username, passwordHash: hash });
    await setSetting(
      t.id,
      'company',
      { name: input.businessName, gstin: input.gstin, stateCode: input.stateCode || stateFromGstin(input.gstin), phone: input.phone, email: input.email, terms: 'Goods once sold will not be taken back.\nSubject to local jurisdiction.' },
      tx,
    );
    await setSetting(t.id, 'invoice', DEFAULT_INVOICE_SETTINGS, tx);
    await tx.insert(schema.printTemplates).values({ tenantId: t.id, name: 'Classic', config: PRESETS.classic.config, isDefault: true });
    return t;
  });
}
