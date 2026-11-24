import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { and, asc, eq, ne, sql as dsql } from 'drizzle-orm';
import { DEFAULT_WA_TEMPLATES, companySchema, invoiceSettingsSchema, templateSchema, userSchema, waConfigSchema } from '@gst/shared';
import { db, schema } from '../db/client';
import { badRequest, notFound } from '../lib/errors';
import { parse } from '../lib/validate';
import { logActivity } from '../lib/util';
import { getInvoiceSettings, getSetting, setSetting, waTemplates, type WaStored } from '../services/settings';
import { decryptSecret, encryptSecret, maskToken } from '../services/crypto';
import { DEFAULT_API_URL, connectionInfo, listMessages, processQueue, senderFor, sendNow } from '../services/whatsapp';

export default async function settingsRoutes(app: FastifyInstance) {
  const pre = { preHandler: [app.authenticate, app.requireTenant] };
  const adm = { preHandler: [app.authenticate, app.requireTenantAdmin] };

  // ---- company
  app.get('/api/settings/company', pre, async (req) => getSetting(req.auth.tenantId!, 'company'));
  app.put('/api/settings/company', adm, async (req) => {
    const body = parse(companySchema, req.body);
    await setSetting(req.auth.tenantId!, 'company', body);
    await logActivity(req.auth.tenantId, req.auth.id, 'settings.company');
    return body;
  });

  // ---- invoice series & options
  app.get('/api/settings/invoice', pre, async (req) => {
    const { seqFy: _s, ...rest } = await getInvoiceSettings(req.auth.tenantId!);
    return rest;
  });
  app.put('/api/settings/invoice', adm, async (req) => {
    const body = parse(invoiceSettingsSchema, req.body);
    const cur = await getInvoiceSettings(req.auth.tenantId!);
    await setSetting(req.auth.tenantId!, 'invoice', { ...body, seqFy: body.nextNumber !== cur.nextNumber ? '' : cur.seqFy });
    return body;
  });

  // ---- print templates
  app.get('/api/templates', pre, async (req) =>
    db.select().from(schema.printTemplates).where(eq(schema.printTemplates.tenantId, req.auth.tenantId!)).orderBy(asc(schema.printTemplates.createdAt)),
  );
  app.post('/api/templates', adm, async (req) => {
    const body = parse(templateSchema, req.body);
    const t = req.auth.tenantId!;
    const [{ n }] = await db.select({ n: dsql<number>`count(*)::int` }).from(schema.printTemplates).where(eq(schema.printTemplates.tenantId, t));
    if (n >= 20) throw badRequest('Maximum 20 templates');
    const isDefault = body.isDefault || n === 0;
    if (isDefault) await db.update(schema.printTemplates).set({ isDefault: false }).where(eq(schema.printTemplates.tenantId, t));
    const [row] = await db.insert(schema.printTemplates).values({ tenantId: t, name: body.name, config: body.config, isDefault }).returning();
    return row;
  });
  app.put('/api/templates/:id', adm, async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(templateSchema, req.body);
    const t = req.auth.tenantId!;
    if (body.isDefault) await db.update(schema.printTemplates).set({ isDefault: false }).where(and(eq(schema.printTemplates.tenantId, t), ne(schema.printTemplates.id, id)));
    const [row] = await db
      .update(schema.printTemplates)
      .set({ name: body.name, config: body.config, ...(body.isDefault ? { isDefault: true } : {}), updatedAt: new Date() })
      .where(and(eq(schema.printTemplates.id, id), eq(schema.printTemplates.tenantId, t)))
      .returning();
    if (!row) throw notFound('Template not found');
    return row;
  });
  app.delete('/api/templates/:id', adm, async (req) => {
    const { id } = req.params as { id: string };
    const t = req.auth.tenantId!;
    const [row] = await db.select().from(schema.printTemplates).where(and(eq(schema.printTemplates.id, id), eq(schema.printTemplates.tenantId, t)));
    if (!row) throw notFound('Template not found');
    if (row.isDefault) throw badRequest('Make another template the default first');
    await db.delete(schema.printTemplates).where(eq(schema.printTemplates.id, id));
    return { ok: true };
  });

  // ---- WhatsApp
  app.get('/api/settings/whatsapp', pre, async (req) => {
    const t = req.auth.tenantId!;
    const s = await getSetting<WaStored>(t, 'whatsapp');
    const tok = decryptSecret(s.tokenEnc);
    const sender = await senderFor(t);
    return {
      enabled: Boolean(s.enabled),
      apiUrl: s.apiUrl || DEFAULT_API_URL,
      device: s.device ?? '',
      hasToken: Boolean(tok),
      tokenHint: tok ? maskToken(tok) : null,
      autoOnInvoice: Boolean(s.autoOnInvoice),
      autoOnPayment: Boolean(s.autoOnPayment),
      attachPdf: s.attachPdf !== false,
      templates: waTemplates(s),
      defaults: DEFAULT_WA_TEMPLATES,
      activeSender: sender?.source ?? null,
    };
  });
  app.put('/api/settings/whatsapp', adm, async (req) => {
    const t = req.auth.tenantId!;
    const body = parse(waConfigSchema, req.body);
    const cur = await getSetting<WaStored>(t, 'whatsapp');
    const tokenEnc = body.token ? encryptSecret(body.token) : cur.tokenEnc;
    if (body.enabled && !tokenEnc) throw badRequest('Enter the WhatsApp API token first (or keep it off and use the platform / share link)');
    await setSetting(t, 'whatsapp', {
      enabled: body.enabled,
      apiUrl: body.apiUrl.replace(/\/+$/, ''),
      tokenEnc: tokenEnc ?? null,
      device: body.device,
      autoOnInvoice: body.autoOnInvoice,
      autoOnPayment: body.autoOnPayment,
      attachPdf: body.attachPdf,
      templates: { ...waTemplates(cur), ...(body.templates ?? {}) },
    });
    return { ok: true };
  });
  app.get('/api/settings/whatsapp/status', pre, async (req) => connectionInfo(req.auth.tenantId!));
  app.post('/api/settings/whatsapp/test', adm, async (req) => {
    const { to } = parse(z.object({ to: z.string().min(8) }), req.body);
    const t = req.auth.tenantId!;
    const sender = await senderFor(t, { ignoreEnabled: true });
    if (!sender) throw badRequest('Save the WhatsApp token first');
    const c = await getSetting<{ name?: string }>(t, 'company');
    return sendNow(sender, t, 'TEST', to, `Test message from ${c.name ?? 'GST Invoice'} — WhatsApp is connected.`);
  });
  app.get('/api/settings/whatsapp/messages', pre, async (req) => {
    const q = z.object({ page: z.coerce.number().int().min(1).default(1) }).parse(req.query);
    return listMessages(req.auth.tenantId!, q.page, 25);
  });
  app.post('/api/settings/whatsapp/messages/:id/retry', pre, async (req) => {
    const { id } = req.params as { id: string };
    const t = req.auth.tenantId!;
    const [m] = await db
      .update(schema.whatsappMessages)
      .set({ status: 'PENDING', attempts: 0, error: null, nextAttemptAt: new Date() })
      .where(and(eq(schema.whatsappMessages.id, id), eq(schema.whatsappMessages.tenantId, t), eq(schema.whatsappMessages.status, 'FAILED')))
      .returning();
    if (!m) throw badRequest('Only a failed message can be retried');
    setImmediate(() => void processQueue(t));
    return { ok: true };
  });

  // ---- users of this client (admin; limited by the plan's max users)
  app.get('/api/users', adm, async (req) =>
    db
      .select({ id: schema.users.id, name: schema.users.name, username: schema.users.username, role: schema.users.role, isActive: schema.users.isActive, lastLoginAt: schema.users.lastLoginAt })
      .from(schema.users)
      .where(eq(schema.users.tenantId, req.auth.tenantId!))
      .orderBy(asc(schema.users.createdAt)),
  );
  app.post('/api/users', adm, async (req) => {
    const t = req.auth.tenantId!;
    const body = parse(userSchema, req.body);
    if (!body.password || body.password.length < 6) throw badRequest('Password: at least 6 characters');
    const [tenant] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, t));
    const [{ n }] = await db.select({ n: dsql<number>`count(*)::int` }).from(schema.users).where(eq(schema.users.tenantId, t));
    if (n >= tenant.maxUsers) throw badRequest(`Your plan allows ${tenant.maxUsers} users. Contact support to add more.`);
    const [u] = await db
      .insert(schema.users)
      .values({ tenantId: t, name: body.name, username: body.username, role: body.role, isActive: body.isActive, passwordHash: await bcrypt.hash(body.password, 10) })
      .returning({ id: schema.users.id });
    await logActivity(t, req.auth.id, 'user.create', body.username);
    return u;
  });
  app.put('/api/users/:id', adm, async (req) => {
    const { id } = req.params as { id: string };
    const t = req.auth.tenantId!;
    const body = parse(userSchema, req.body);
    if (id === req.auth.id && (!body.isActive || body.role !== 'admin')) throw badRequest('You cannot remove your own admin access');
    const set: Record<string, unknown> = { name: body.name, username: body.username, role: body.role, isActive: body.isActive };
    if (body.password) {
      if (body.password.length < 6) throw badRequest('Password: at least 6 characters');
      set.passwordHash = await bcrypt.hash(body.password, 10);
      set.tokenVersion = dsql`${schema.users.tokenVersion} + 1`;
    }
    const [u] = await db.update(schema.users).set(set).where(and(eq(schema.users.id, id), eq(schema.users.tenantId, t))).returning({ id: schema.users.id });
    if (!u) throw notFound('User not found');
    return u;
  });
  app.delete('/api/users/:id', adm, async (req) => {
    const { id } = req.params as { id: string };
    if (id === req.auth.id) throw badRequest('You cannot delete yourself');
    await db.delete(schema.users).where(and(eq(schema.users.id, id), eq(schema.users.tenantId, req.auth.tenantId!)));
    return { ok: true };
  });
}
