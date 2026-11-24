import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { and, desc, eq, ilike, or, sql as dsql } from 'drizzle-orm';
import { addMonths, createTenantSchema, daysBetween, fillTemplate, tenantSchema, todayIST, userSchema } from '@gst/shared';
import { db, schema } from '../db/client';
import { badRequest, notFound } from '../lib/errors';
import { parse } from '../lib/validate';
import { env } from '../lib/env';
import { genPassword, like, logActivity } from '../lib/util';
import { createTenant } from '../services/tenants';
import { getPlatform, setPlatform } from '../services/platform';
import { encryptSecret, decryptSecret, maskToken } from '../services/crypto';
import { DEFAULT_API_URL, connectionInfo, enqueue, listMessages, senderFor, sendNow } from '../services/whatsapp';
import { getSetting } from '../services/settings';
import { sessionPayload } from './auth';

const DEFAULT_CRED_MSG =
  'Namaste {name},\n\nYour *{app}* account is ready.\n\nLogin: {url}\nUsername: *{username}*\nPassword: *{password}*\nValid till: {valid_until}\n\nPlease change the password after first login.\nSupport: {support}';

export default async function adminRoutes(app: FastifyInstance) {
  const pre = { preHandler: [app.authenticate, app.requireSuper] };

  app.get('/api/admin/stats', pre, async () => {
    const today = todayIST();
    const [r] = await db.execute<{ total: number; active: number; expired: number; expiring: number; suspended: number; requests: number; invoices: number }>(dsql`
      SELECT
        (SELECT count(*)::int FROM tenants) total,
        (SELECT count(*)::int FROM tenants WHERE status='active' AND valid_until >= ${today}) active,
        (SELECT count(*)::int FROM tenants WHERE valid_until < ${today}) expired,
        (SELECT count(*)::int FROM tenants WHERE status='active' AND valid_until >= ${today} AND valid_until <= (${today}::date + 15)) expiring,
        (SELECT count(*)::int FROM tenants WHERE status='suspended') suspended,
        (SELECT count(*)::int FROM access_requests WHERE status='new') requests,
        (SELECT count(*)::int FROM invoices WHERE created_at > now() - interval '30 days') invoices`);
    return r;
  });

  app.get('/api/admin/tenants', pre, async (req) => {
    const q = z.object({ q: z.string().optional(), filter: z.enum(['all', 'active', 'expiring', 'expired', 'suspended']).default('all') }).parse(req.query);
    const today = todayIST();
    const conds = [];
    if (q.q) conds.push(or(ilike(schema.tenants.businessName, like(q.q)), ilike(schema.tenants.phone, like(q.q)), ilike(schema.tenants.contactName, like(q.q))));
    if (q.filter === 'active') conds.push(dsql`${schema.tenants.status}='active' AND ${schema.tenants.validUntil} >= ${today}`);
    if (q.filter === 'expiring') conds.push(dsql`${schema.tenants.status}='active' AND ${schema.tenants.validUntil} >= ${today} AND ${schema.tenants.validUntil} <= (${today}::date + 15)`);
    if (q.filter === 'expired') conds.push(dsql`${schema.tenants.validUntil} < ${today}`);
    if (q.filter === 'suspended') conds.push(eq(schema.tenants.status, 'suspended'));
    const rows = await db
      .select({
        t: schema.tenants,
        users: dsql<number>`(SELECT count(*)::int FROM users u WHERE u.tenant_id = "tenants"."id")`,
        invoices: dsql<number>`(SELECT count(*)::int FROM invoices i WHERE i.tenant_id = "tenants"."id")`,
        lastLogin: dsql<string | null>`(SELECT max(last_login_at) FROM users u WHERE u.tenant_id = "tenants"."id")`,
        adminUsername: dsql<string | null>`(SELECT username FROM users u WHERE u.tenant_id = "tenants"."id" AND u.role='admin' ORDER BY created_at LIMIT 1)`,
      })
      .from(schema.tenants)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(schema.tenants.validUntil);
    return rows.map((r) => ({ ...r.t, users: r.users, invoices: r.invoices, lastLogin: r.lastLogin, adminUsername: r.adminUsername, daysLeft: daysBetween(today, r.t.validUntil) }));
  });

  app.post('/api/admin/tenants', pre, async (req) => {
    const body = parse(createTenantSchema, req.body);
    const t = await createTenant(body);
    if (body.requestId) await db.update(schema.accessRequests).set({ status: 'done', tenantId: t.id }).where(eq(schema.accessRequests.id, body.requestId));
    await logActivity(null, req.auth.id, 'tenant.create', `${t.businessName} (${body.username})`);
    return t;
  });

  app.get('/api/admin/tenants/:id', pre, async (req) => {
    const { id } = req.params as { id: string };
    const [t] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, id));
    if (!t) throw notFound();
    const users = await db
      .select({ id: schema.users.id, name: schema.users.name, username: schema.users.username, role: schema.users.role, isActive: schema.users.isActive, lastLoginAt: schema.users.lastLoginAt })
      .from(schema.users)
      .where(eq(schema.users.tenantId, id))
      .orderBy(schema.users.createdAt);
    const company = await getSetting<Record<string, string>>(id, 'company');
    const [usage] = await db.execute<{ invoices: number; customers: number; sales: number }>(dsql`SELECT
      (SELECT count(*)::int FROM invoices WHERE tenant_id=${id}) invoices,
      (SELECT count(*)::int FROM customers WHERE tenant_id=${id}) customers,
      (SELECT coalesce(sum(total),0)::float FROM invoices WHERE tenant_id=${id} AND status<>'cancelled') sales`);
    const activity = await db.select().from(schema.activityLog).where(eq(schema.activityLog.tenantId, id)).orderBy(desc(schema.activityLog.createdAt)).limit(15);
    return { ...t, daysLeft: daysBetween(todayIST(), t.validUntil), users, company: { gstin: company.gstin, stateCode: company.stateCode, name: company.name }, usage, activity };
  });

  app.put('/api/admin/tenants/:id', pre, async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(tenantSchema, req.body);
    const { gstin: _g, stateCode: _s, ...rest } = body;
    const [t] = await db.update(schema.tenants).set({ ...rest, updatedAt: new Date() }).where(eq(schema.tenants.id, id)).returning();
    if (!t) throw notFound();
    await logActivity(id, req.auth.id, 'tenant.update', `valid till ${t.validUntil}`);
    return t;
  });

  app.post('/api/admin/tenants/:id/extend', pre, async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(z.object({ months: z.coerce.number().int().min(1).max(60).optional(), validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }), req.body);
    const [t] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, id));
    if (!t) throw notFound();
    const today = todayIST();
    const from = t.validUntil > today ? t.validUntil : today;
    const validUntil = body.validUntil ?? addMonths(from, body.months ?? 1);
    const [u] = await db.update(schema.tenants).set({ validUntil, status: 'active', updatedAt: new Date() }).where(eq(schema.tenants.id, id)).returning();
    await logActivity(id, req.auth.id, 'tenant.extend', `valid till ${validUntil}`);
    return u;
  });

  app.post('/api/admin/tenants/:id/status', pre, async (req) => {
    const { id } = req.params as { id: string };
    const { status } = parse(z.object({ status: z.enum(['active', 'suspended']) }), req.body);
    const [u] = await db.update(schema.tenants).set({ status, updatedAt: new Date() }).where(eq(schema.tenants.id, id)).returning();
    if (!u) throw notFound();
    await logActivity(id, req.auth.id, `tenant.${status}`);
    return u;
  });

  app.delete('/api/admin/tenants/:id', pre, async (req) => {
    const { id } = req.params as { id: string };
    const { confirm } = parse(z.object({ confirm: z.string() }), req.body ?? {});
    const [t] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, id));
    if (!t) throw notFound();
    if (confirm.trim() !== t.businessName.trim()) throw badRequest('Type the business name exactly to confirm delete');
    await db.transaction(async (tx) => {
      await tx.delete(schema.payments).where(eq(schema.payments.tenantId, id));
      await tx.delete(schema.invoices).where(eq(schema.invoices.tenantId, id));
      await tx.delete(schema.tenants).where(eq(schema.tenants.id, id));
    });
    await logActivity(null, req.auth.id, 'tenant.delete', t.businessName);
    return { ok: true };
  });

  // ---- client users (created by the super admin on request)
  app.post('/api/admin/tenants/:id/users', pre, async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(userSchema, req.body);
    if (!body.password || body.password.length < 6) throw badRequest('Password: at least 6 characters');
    const [t] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, id));
    if (!t) throw notFound();
    const [{ n }] = await db.select({ n: dsql<number>`count(*)::int` }).from(schema.users).where(eq(schema.users.tenantId, id));
    if (n >= t.maxUsers) throw badRequest(`This client can have ${t.maxUsers} users. Increase "Max users" first.`);
    const [u] = await db
      .insert(schema.users)
      .values({ tenantId: id, name: body.name, username: body.username, role: body.role, isActive: body.isActive, passwordHash: await bcrypt.hash(body.password, 10) })
      .returning({ id: schema.users.id, username: schema.users.username });
    await logActivity(id, req.auth.id, 'user.create', body.username);
    return u;
  });

  app.put('/api/admin/users/:userId', pre, async (req) => {
    const { userId } = req.params as { userId: string };
    const body = parse(userSchema, req.body);
    const set: Record<string, unknown> = { name: body.name, username: body.username, role: body.role, isActive: body.isActive };
    if (body.password) {
      if (body.password.length < 6) throw badRequest('Password: at least 6 characters');
      set.passwordHash = await bcrypt.hash(body.password, 10);
      set.tokenVersion = dsql`${schema.users.tokenVersion} + 1`;
    }
    const [u] = await db.update(schema.users).set(set).where(and(eq(schema.users.id, userId), dsql`${schema.users.tenantId} IS NOT NULL`)).returning({ id: schema.users.id, tenantId: schema.users.tenantId });
    if (!u) throw notFound('User not found');
    await logActivity(u.tenantId, req.auth.id, body.password ? 'user.password_reset' : 'user.update', body.username);
    return u;
  });

  app.post('/api/admin/users/:userId/reset-password', pre, async (req) => {
    const { userId } = req.params as { userId: string };
    const password = genPassword();
    const [u] = await db
      .update(schema.users)
      .set({ passwordHash: await bcrypt.hash(password, 10), tokenVersion: dsql`${schema.users.tokenVersion} + 1` })
      .where(and(eq(schema.users.id, userId), dsql`${schema.users.tenantId} IS NOT NULL`))
      .returning({ id: schema.users.id, username: schema.users.username, tenantId: schema.users.tenantId });
    if (!u) throw notFound('User not found');
    await logActivity(u.tenantId, req.auth.id, 'user.password_reset', u.username);
    return { username: u.username, password };
  });

  app.delete('/api/admin/users/:userId', pre, async (req) => {
    const { userId } = req.params as { userId: string };
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
    if (!u || !u.tenantId) throw notFound('User not found');
    const [{ admins }] = await db.select({ admins: dsql<number>`count(*)::int` }).from(schema.users).where(and(eq(schema.users.tenantId, u.tenantId), eq(schema.users.role, 'admin')));
    if (u.role === 'admin' && admins <= 1) throw badRequest('Keep at least one admin for the client');
    await db.delete(schema.users).where(eq(schema.users.id, userId));
    return { ok: true };
  });

  app.get('/api/admin/gen-password', pre, async () => ({ password: genPassword() }));

  /** Support: open the client's app as their admin (banner shows "viewing as"). */
  app.post('/api/admin/tenants/:id/impersonate', pre, async (req) => {
    const { id } = req.params as { id: string };
    const [u] = await db.select().from(schema.users).where(and(eq(schema.users.tenantId, id), eq(schema.users.role, 'admin'))).limit(1);
    if (!u) throw badRequest('This client has no admin user');
    await logActivity(id, req.auth.id, 'support.login_as', u.username);
    const token = app.jwt.sign({ sub: u.id, tv: u.tokenVersion, imp: req.auth.id }, { expiresIn: '2h' });
    return { token, ...(await sessionPayload(u.id)), impersonating: true };
  });

  /** Send login details to the client on WhatsApp (platform account). */
  app.post('/api/admin/tenants/:id/send-credentials', pre, async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(z.object({ to: z.string().min(8), username: z.string(), password: z.string().optional().default('') }), req.body);
    const [t] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, id));
    if (!t) throw notFound();
    const b = await getPlatform('branding');
    const text = fillTemplate(String(b.credentialsMessage || DEFAULT_CRED_MSG), {
      name: t.contactName || t.businessName,
      app: String(b.appName || 'GST Invoice'),
      url: env.PUBLIC_URL,
      username: body.username,
      password: body.password || '(unchanged)',
      valid_until: t.validUntil.split('-').reverse().join('-'),
      support: String(b.supportPhone || ''),
    });
    const sender = await senderFor(null);
    if (!sender) return { ok: false, text, error: 'Platform WhatsApp is not set up — copy the message instead.' };
    const r = await sendNow(sender, null, 'CREDENTIALS', body.to, text);
    return { ...r, text };
  });

  // ---- access requests from the login page
  app.get('/api/admin/requests', pre, async () => db.select().from(schema.accessRequests).orderBy(desc(schema.accessRequests.createdAt)).limit(200));
  app.post('/api/admin/requests/:id', pre, async (req) => {
    const { id } = req.params as { id: string };
    const { status } = parse(z.object({ status: z.enum(['new', 'done', 'rejected']) }), req.body);
    await db.update(schema.accessRequests).set({ status }).where(eq(schema.accessRequests.id, id));
    return { ok: true };
  });

  // ---- platform settings
  app.get('/api/admin/platform', pre, async () => {
    const branding = await getPlatform('branding');
    const wa = (await getPlatform('whatsapp')) as Record<string, unknown>;
    const tok = decryptSecret(wa.tokenEnc as string);
    return {
      branding: { appName: 'GST Invoice', supportPhone: '', supportEmail: '', tagline: '', credentialsMessage: DEFAULT_CRED_MSG, defaultValidityDays: 30, defaultMaxUsers: 2, ...branding },
      whatsapp: { enabled: Boolean(wa.enabled), apiUrl: (wa.apiUrl as string) || DEFAULT_API_URL, device: (wa.device as string) ?? '', shareWithClients: Boolean(wa.shareWithClients), hasToken: Boolean(tok), tokenHint: tok ? maskToken(tok) : null },
    };
  });
  app.put('/api/admin/platform/branding', pre, async (req) => {
    const body = parse(
      z.object({
        appName: z.string().trim().min(1).max(60),
        supportPhone: z.string().trim().max(30).default(''),
        supportEmail: z.string().trim().max(120).default(''),
        tagline: z.string().trim().max(120).default(''),
        credentialsMessage: z.string().trim().max(1500).default(DEFAULT_CRED_MSG),
        defaultValidityDays: z.coerce.number().int().min(1).max(3650).default(30),
        defaultMaxUsers: z.coerce.number().int().min(1).max(100).default(2),
      }),
      req.body,
    );
    await setPlatform('branding', body);
    return body;
  });
  app.put('/api/admin/platform/whatsapp', pre, async (req) => {
    const body = parse(
      z.object({ enabled: z.boolean(), apiUrl: z.string().trim().url(), token: z.string().trim().max(200).optional(), device: z.string().trim().max(100).default(''), shareWithClients: z.boolean().default(false) }),
      req.body,
    );
    const cur = (await getPlatform('whatsapp')) as Record<string, unknown>;
    const tokenEnc = body.token ? encryptSecret(body.token) : (cur.tokenEnc as string | undefined);
    if (body.enabled && !tokenEnc) throw badRequest('Enter the WhatsApp token first');
    await setPlatform('whatsapp', { enabled: body.enabled, apiUrl: body.apiUrl.replace(/\/+$/, ''), device: body.device, shareWithClients: body.shareWithClients, tokenEnc });
    return { ok: true };
  });
  app.get('/api/admin/platform/whatsapp/status', pre, async () => connectionInfo(null));
  app.post('/api/admin/platform/whatsapp/test', pre, async (req) => {
    const { to } = parse(z.object({ to: z.string().min(8) }), req.body);
    const sender = await senderFor(null);
    if (!sender) throw badRequest('Save and enable the platform WhatsApp token first');
    return sendNow(sender, null, 'TEST', to, 'Test message — platform WhatsApp is connected.');
  });
  app.get('/api/admin/platform/whatsapp/messages', pre, async (req) => {
    const q = z.object({ page: z.coerce.number().int().min(1).default(1) }).parse(req.query);
    return listMessages(null, q.page, 25);
  });

  // Remind a client that the subscription is ending (platform WhatsApp).
  app.post('/api/admin/tenants/:id/remind', pre, async (req) => {
    const { id } = req.params as { id: string };
    const [t] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, id));
    if (!t) throw notFound();
    const b = await getPlatform('branding');
    const text = `Namaste ${t.contactName || t.businessName},\n\nYour ${b.appName || 'GST Invoice'} subscription ${t.validUntil < todayIST() ? 'expired' : 'expires'} on ${t.validUntil.split('-').reverse().join('-')}. Please renew to continue billing without interruption.\n\n${b.supportPhone ? `Call / WhatsApp: ${b.supportPhone}` : ''}`;
    try {
      await enqueue(null, { eventType: 'RENEWAL', to: t.phone, message: text });
      return { ok: true, text };
    } catch (e) {
      return { ok: false, text, error: (e as Error).message };
    }
  });

}
