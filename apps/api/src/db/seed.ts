import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { addMonths, todayIST, addDays } from '@gst/shared';
import { db, schema, sql } from './client';
import { createTenant } from '../services/tenants';
import { saveInvoice } from '../services/invoices';

/** Idempotent: creates the super admin once, and (optionally) a demo client with sample data. */
const suUser = (process.env.SEED_SUPERADMIN_USERNAME ?? 'superadmin').toLowerCase();
const suPass = process.env.SEED_SUPERADMIN_PASSWORD ?? 'Admin@1234';

const [existingSu] = await db.select().from(schema.users).where(eq(schema.users.role, 'superadmin')).limit(1);
if (!existingSu) {
  await db.insert(schema.users).values({ role: 'superadmin', name: 'Super Admin', username: suUser, passwordHash: await bcrypt.hash(suPass, 10) });
  console.log(`Super admin created: ${suUser}`);
} else console.log(`Super admin exists: ${existingSu.username}`);

if (process.env.SEED_DEMO === 'true') {
  const [demo] = await db.select().from(schema.users).where(eq(schema.users.username, 'demo'));
  if (!demo) {
    const t = await createTenant({
      businessName: 'Shree Trading Co.',
      contactName: 'Ramesh Patel',
      phone: '9825012345',
      email: 'demo@example.com',
      stateCode: '24',
      gstin: '24AABCS1234A1Z5',
      plan: 'Demo',
      validUntil: addMonths(todayIST(), 12),
      maxUsers: 3,
      whatsappAllowed: true,
      notes: 'Demo account',
      username: 'demo',
      password: 'Demo@1234',
      adminName: 'Ramesh Patel',
    });
    const [admin] = await db.select().from(schema.users).where(eq(schema.users.username, 'demo'));
    const custs = await db
      .insert(schema.customers)
      .values([
        { tenantId: t.id, name: 'ABC Retail Pvt Ltd', gstin: '24AAACA1111A1Z1', stateCode: '24', phone: '9876543210', city: 'Ahmedabad', address: '12, Station Road' },
        { tenantId: t.id, name: 'Maharashtra Distributors', gstin: '27AABCM3333C1Z3', stateCode: '27', phone: '9123456780', city: 'Mumbai', address: 'Plot 8, MIDC' },
        { tenantId: t.id, name: 'Patel Enterprises', gstin: '24AAACP2222B1Z2', stateCode: '24', phone: '9898989898', city: 'Surat' },
        { tenantId: t.id, name: 'Walk-in Customer', stateCode: '24', city: 'Surat' },
      ])
      .returning();
    const items = await db
      .insert(schema.items)
      .values([
        { tenantId: t.id, name: 'Office Chair', hsn: '9401', unit: 'PCS', rate: 4500, gstRate: 18 },
        { tenantId: t.id, name: 'Office Table', hsn: '9403', unit: 'PCS', rate: 8000, gstRate: 18 },
        { tenantId: t.id, name: 'Printer Paper A4', hsn: '4802', unit: 'PACK', rate: 350, gstRate: 12 },
        { tenantId: t.id, name: 'USB Cable', hsn: '8544', unit: 'PCS', rate: 200, gstRate: 18 },
        { tenantId: t.id, name: 'Installation Service', hsn: '9987', unit: 'JOB', rate: 1500, gstRate: 18 },
      ])
      .returning();
    const today = todayIST();
    const line = (i: number, qty: number) => ({ itemId: items[i].id, name: items[i].name, description: '', hsn: items[i].hsn, unit: items[i].unit, qty, rate: items[i].rate, discountPct: 0, gstRate: items[i].gstRate });
    const base = { invoiceNo: '', priceIncludesTax: false, discount: 0, notes: '', shipTo: '', extra: {} };
    await saveInvoice(t.id, admin.id, { ...base, invoiceDate: addDays(today, -20), dueDate: addDays(today, -5), customerId: custs[0].id, placeOfSupply: '24', lines: [line(0, 2), line(2, 10)], payment: { amount: 5000, mode: 'UPI', reference: 'UPI-872341' } });
    await saveInvoice(t.id, admin.id, { ...base, invoiceDate: addDays(today, -7), dueDate: addDays(today, 8), customerId: custs[1].id, placeOfSupply: '27', lines: [line(1, 1), line(4, 1)] });
    await saveInvoice(t.id, admin.id, { ...base, invoiceDate: today, dueDate: addDays(today, 15), customerId: custs[2].id, placeOfSupply: '24', lines: [line(3, 5), line(2, 4)], payment: { amount: 99999, mode: 'Cash', reference: '' } });
    console.log('Demo client created: demo / Demo@1234');
  } else console.log('Demo client exists');
}
await sql.end();
process.exit(0);
