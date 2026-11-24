import { z } from 'zod';

const str = (max = 200) => z.string().trim().max(max);
const optStr = (max = 200) => z.string().trim().max(max).optional().default('');
const money = z.coerce.number().min(0).max(1e11);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be yyyy-mm-dd');

export const loginSchema = z.object({ username: str(80).min(1, 'Enter username'), password: z.string().min(1, 'Enter password').max(200) });
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(6, 'At least 6 characters').max(100) });

export const customerSchema = z.object({
  name: str().min(1, 'Name is required'),
  gstin: optStr(15).transform((v) => v.toUpperCase()),
  stateCode: optStr(2),
  phone: optStr(30),
  email: optStr(120),
  address: optStr(500),
  city: optStr(80),
  pincode: optStr(10),
  openingBalance: z.coerce.number().min(-1e11).max(1e11).optional().default(0),
  notes: optStr(500),
  isActive: z.boolean().optional().default(true),
});
export type CustomerInput = z.infer<typeof customerSchema>;

export const itemSchema = z.object({
  name: str().min(1, 'Name is required'),
  hsn: optStr(12),
  unit: optStr(12),
  rate: money.default(0),
  gstRate: z.coerce.number().min(0).max(100).default(18),
  description: optStr(300),
  isActive: z.boolean().optional().default(true),
});
export type ItemInput = z.infer<typeof itemSchema>;

export const invoiceLineSchema = z.object({
  itemId: z.string().uuid().nullable().optional(),
  name: str().min(1, 'Item name is required'),
  description: optStr(300),
  hsn: optStr(12),
  unit: optStr(12),
  qty: z.coerce.number().positive('Qty must be more than 0').max(1e9),
  rate: money,
  discountPct: z.coerce.number().min(0).max(100).optional().default(0),
  gstRate: z.coerce.number().min(0).max(100),
});

export const invoiceSchema = z.object({
  invoiceNo: optStr(40), // empty → next from the series
  invoiceDate: isoDate,
  dueDate: isoDate.nullable().optional(),
  customerId: z.string().uuid('Select a customer'),
  placeOfSupply: str(2).min(2, 'Select place of supply'),
  priceIncludesTax: z.boolean().optional().default(false),
  discount: money.optional().default(0),
  notes: optStr(1000),
  shipTo: optStr(500),
  extra: z.record(z.string().max(40), z.string().max(200)).optional().default({}),
  lines: z.array(invoiceLineSchema).min(1, 'Add at least one item').max(300),
  // Optional payment received with the invoice.
  payment: z
    .object({ amount: money, mode: str(20).default('Cash'), reference: optStr(100) })
    .optional()
    .nullable(),
});
export type InvoiceInput = z.infer<typeof invoiceSchema>;

export const paymentSchema = z.object({
  invoiceId: z.string().uuid(),
  paymentDate: isoDate,
  amount: z.coerce.number().positive('Amount must be more than 0').max(1e11),
  mode: str(20).default('Cash'),
  reference: optStr(100),
  notes: optStr(300),
  sendWhatsapp: z.boolean().optional().default(false),
});
export type PaymentInput = z.infer<typeof paymentSchema>;

export const companySchema = z.object({
  name: str().min(1, 'Business name is required'),
  legalName: optStr(),
  gstin: optStr(15).transform((v) => v.toUpperCase()),
  pan: optStr(10).transform((v) => v.toUpperCase()),
  stateCode: str(2).min(2, 'Select your state'),
  address: optStr(500),
  city: optStr(80),
  pincode: optStr(10),
  phone: optStr(30),
  email: optStr(120),
  logo: z.string().max(400_000).optional().default(''),
  signature: z.string().max(300_000).optional().default(''),
  bankName: optStr(100),
  accountName: optStr(100),
  accountNo: optStr(40),
  ifsc: optStr(20),
  branch: optStr(100),
  upiId: optStr(80),
  terms: optStr(2000),
});
export type CompanyInput = z.infer<typeof companySchema>;

export const customFieldSchema = z.object({ key: z.string().regex(/^[a-z0-9_]{1,30}$/), label: str(40).min(1), enabled: z.boolean() });
export const invoiceSettingsSchema = z.object({
  prefix: str(30).default('INV/{FY}/'),
  nextNumber: z.coerce.number().int().min(1).max(99_999_999),
  padding: z.coerce.number().int().min(1).max(8).default(4),
  resetEveryFY: z.boolean().default(true),
  dueDays: z.coerce.number().int().min(0).max(365).default(15),
  roundOff: z.boolean().default(true),
  priceIncludesTax: z.boolean().default(false),
  defaultGstRate: z.coerce.number().min(0).max(100).default(18),
  customFields: z.array(customFieldSchema).max(8).default([]),
});
export type InvoiceSettings = z.infer<typeof invoiceSettingsSchema>;

export const waConfigSchema = z.object({
  enabled: z.boolean(),
  apiUrl: z.string().trim().url().max(200),
  token: z.string().trim().max(200).optional(), // empty keeps the saved one
  device: optStr(100),
  autoOnInvoice: z.boolean().optional().default(false),
  autoOnPayment: z.boolean().optional().default(false),
  attachPdf: z.boolean().optional().default(true),
  templates: z.object({ invoice: str(1500), payment: str(1500), reminder: str(1500) }).partial().optional(),
});

export const templateSchema = z.object({ name: str(60).min(1), config: z.record(z.any()), isDefault: z.boolean().optional() });

export const tenantSchema = z.object({
  businessName: str().min(1, 'Business name is required'),
  contactName: optStr(100),
  phone: optStr(30),
  email: optStr(120),
  stateCode: optStr(2),
  gstin: optStr(15).transform((v) => v.toUpperCase()),
  plan: optStr(40),
  validUntil: isoDate,
  maxUsers: z.coerce.number().int().min(1).max(100).default(2),
  whatsappAllowed: z.boolean().default(true),
  notes: optStr(1000),
});
export const createTenantSchema = tenantSchema.extend({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._@-]{3,60}$/, 'Username: 3-60 letters, digits, . _ - @'),
  password: z.string().min(6, 'Password: at least 6 characters').max(100),
  adminName: optStr(100),
  requestId: z.string().uuid().optional(),
});

export const userSchema = z.object({
  name: str(100).min(1, 'Name is required'),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._@-]{3,60}$/, 'Username: 3-60 letters, digits, . _ - @'),
  password: z.string().max(100).optional(),
  role: z.enum(['admin', 'staff']).default('staff'),
  isActive: z.boolean().default(true),
});

export const accessRequestSchema = z.object({
  name: str(100).min(2, 'Enter your name'),
  businessName: str(200).min(2, 'Enter business name'),
  phone: str(20).min(10, 'Enter a valid mobile number'),
  email: optStr(120),
  city: optStr(80),
  message: optStr(500),
});
