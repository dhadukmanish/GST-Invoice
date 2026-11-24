import { sql } from 'drizzle-orm';
import { boolean, customType, date, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

/** numeric column read/written as a JS number (postgres-js returns numeric as text). */
const numeric = customType<{ data: number; driverData: string; config: { precision: number; scale: number } }>({
  dataType: (c) => `numeric(${c?.precision ?? 14}, ${c?.scale ?? 2})`,
  fromDriver: (v) => Number(v),
  toDriver: (v) => String(v),
});

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
const amount = (name: string) => numeric(name, { precision: 14, scale: 2 }).notNull().default(0);

/** A client business that bought the software. Super admin creates it and sets its validity. */
export const tenants = pgTable('tenants', {
  id: id(),
  businessName: text('business_name').notNull(),
  contactName: text('contact_name').notNull().default(''),
  phone: text('phone').notNull().default(''),
  email: text('email').notNull().default(''),
  plan: text('plan').notNull().default(''),
  validFrom: date('valid_from').notNull().default(sql`CURRENT_DATE`),
  validUntil: date('valid_until').notNull(),
  status: text('status').notNull().default('active'), // active | suspended
  maxUsers: integer('max_users').notNull().default(2),
  whatsappAllowed: boolean('whatsapp_allowed').notNull().default(true),
  notes: text('notes').notNull().default(''),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** tenantId null = super admin. Usernames are unique across the whole platform (one login page). */
export const users = pgTable(
  'users',
  {
    id: id(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    role: text('role').notNull(), // superadmin | admin | staff
    name: text('name').notNull().default(''),
    username: text('username').notNull(),
    passwordHash: text('password_hash').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    tokenVersion: integer('token_version').notNull().default(0),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('users_username_uq').on(t.username), index('users_tenant_idx').on(t.tenantId)],
);

/** Per-tenant settings blobs: company, invoice, whatsapp. */
export const settings = pgTable(
  'settings',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    value: jsonb('value').notNull().default({}),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.key] })],
);

/** Platform-wide settings (super admin): branding, platform WhatsApp. */
export const platformSettings = pgTable('platform_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull().default({}),
  updatedAt: updatedAt(),
});

export const customers = pgTable(
  'customers',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    gstin: text('gstin').notNull().default(''),
    stateCode: text('state_code').notNull().default(''),
    phone: text('phone').notNull().default(''),
    email: text('email').notNull().default(''),
    address: text('address').notNull().default(''),
    city: text('city').notNull().default(''),
    pincode: text('pincode').notNull().default(''),
    openingBalance: amount('opening_balance'),
    notes: text('notes').notNull().default(''),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index('customers_tenant_idx').on(t.tenantId, t.name)],
);

export const items = pgTable(
  'items',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    hsn: text('hsn').notNull().default(''),
    unit: text('unit').notNull().default(''),
    rate: amount('rate'),
    gstRate: numeric('gst_rate', { precision: 5, scale: 2 }).notNull().default(18),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index('items_tenant_idx').on(t.tenantId, t.name)],
);

export const invoices = pgTable(
  'invoices',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    invoiceNo: text('invoice_no').notNull(),
    invoiceDate: date('invoice_date').notNull(),
    dueDate: date('due_date'),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    customer: jsonb('customer').notNull().default({}), // snapshot at billing time
    placeOfSupply: text('place_of_supply').notNull(),
    isInterstate: boolean('is_interstate').notNull().default(false),
    priceIncludesTax: boolean('price_includes_tax').notNull().default(false),
    subtotal: amount('subtotal'),
    discount: amount('discount'),
    taxable: amount('taxable'),
    cgst: amount('cgst'),
    sgst: amount('sgst'),
    igst: amount('igst'),
    roundOff: amount('round_off'),
    total: amount('total'),
    paid: amount('paid'),
    balance: amount('balance'),
    status: text('status').notNull().default('unpaid'), // unpaid | partial | paid | cancelled
    notes: text('notes').notNull().default(''),
    shipTo: text('ship_to').notNull().default(''),
    extra: jsonb('extra').notNull().default({}),
    publicToken: text('public_token').notNull(),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('invoices_no_uq').on(t.tenantId, t.invoiceNo),
    uniqueIndex('invoices_token_uq').on(t.publicToken),
    index('invoices_date_idx').on(t.tenantId, t.invoiceDate),
    index('invoices_customer_idx').on(t.tenantId, t.customerId),
  ],
);

export const invoiceLines = pgTable(
  'invoice_lines',
  {
    id: id(),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull().default(0),
    itemId: uuid('item_id'),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    hsn: text('hsn').notNull().default(''),
    unit: text('unit').notNull().default(''),
    qty: numeric('qty', { precision: 14, scale: 3 }).notNull(),
    rate: amount('rate'),
    discountPct: numeric('discount_pct', { precision: 5, scale: 2 }).notNull().default(0),
    gstRate: numeric('gst_rate', { precision: 5, scale: 2 }).notNull().default(0),
    taxable: amount('taxable'),
    taxAmount: amount('tax_amount'),
    total: amount('total'),
  },
  (t) => [index('invoice_lines_invoice_idx').on(t.invoiceId)],
);

export const payments = pgTable(
  'payments',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id').notNull(),
    paymentDate: date('payment_date').notNull(),
    amount: amount('amount'),
    mode: text('mode').notNull().default('Cash'),
    reference: text('reference').notNull().default(''),
    notes: text('notes').notNull().default(''),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
  },
  (t) => [index('payments_tenant_idx').on(t.tenantId, t.paymentDate), index('payments_invoice_idx').on(t.invoiceId)],
);

export const printTemplates = pgTable(
  'print_templates',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    config: jsonb('config').notNull().default({}),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('print_templates_tenant_idx').on(t.tenantId)],
);

/** WhatsApp outbox: saved first, a background worker sends and retries (pattern from Keshav). */
export const whatsappMessages = pgTable(
  'whatsapp_messages',
  {
    id: id(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }), // null = platform message
    eventType: text('event_type').notNull(), // INVOICE | PAYMENT | REMINDER | TEST | CREDENTIALS
    refId: uuid('ref_id'),
    toNumber: text('to_number').notNull(),
    message: text('message').notNull(),
    mediaUrl: text('media_url'),
    status: text('status').notNull().default('PENDING'), // PENDING | SENT | DELIVERED | READ | FAILED
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    providerMessageId: text('provider_message_id'),
    error: text('error'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('wa_status_idx').on(t.status, t.nextAttemptAt), index('wa_tenant_idx').on(t.tenantId, t.createdAt)],
);

/** "Request a demo / account" form on the login page → super admin inbox. */
export const accessRequests = pgTable('access_requests', {
  id: id(),
  name: text('name').notNull(),
  businessName: text('business_name').notNull(),
  phone: text('phone').notNull(),
  email: text('email').notNull().default(''),
  city: text('city').notNull().default(''),
  message: text('message').notNull().default(''),
  status: text('status').notNull().default('new'), // new | done | rejected
  tenantId: uuid('tenant_id'),
  createdAt: createdAt(),
});

export const activityLog = pgTable(
  'activity_log',
  {
    id: id(),
    tenantId: uuid('tenant_id'),
    userId: uuid('user_id'),
    action: text('action').notNull(),
    detail: text('detail').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [index('activity_tenant_idx').on(t.tenantId, t.createdAt)],
);
