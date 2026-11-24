import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { eq, sql as dsql } from 'drizzle-orm';
import { accessRequestSchema, changePasswordSchema, daysBetween, loginSchema, todayIST } from '@gst/shared';
import { db, schema } from '../db/client';
import { HttpError, badRequest, unauthorized } from '../lib/errors';
import { parse } from '../lib/validate';
import { logActivity } from '../lib/util';
import { assertTenantUsable } from '../plugins/auth';
import { getPlatform } from '../services/platform';
import { getSetting } from '../services/settings';

// Simple in-memory lockout: 10 wrong passwords per IP+username in 15 minutes.
const fails = new Map<string, { n: number; until: number }>();
const clientIp = (h: Record<string, unknown>, fallback: string) => {
  const xff = String(h['x-forwarded-for'] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return xff[xff.length - 1] || String(h['x-real-ip'] ?? '') || fallback;
};

export async function sessionPayload(userId: string) {
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!u) throw unauthorized();
  let tenant = null as null | Record<string, unknown>;
  if (u.tenantId) {
    const [t] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, u.tenantId));
    const company = await getSetting<{ name?: string; stateCode?: string; logo?: string }>(u.tenantId, 'company');
    tenant = {
      id: t.id,
      businessName: company.name || t.businessName,
      validUntil: t.validUntil,
      daysLeft: daysBetween(todayIST(), t.validUntil),
      plan: t.plan,
      maxUsers: t.maxUsers,
      stateCode: company.stateCode ?? '',
      hasLogo: Boolean(company.logo),
      setupDone: Boolean(company.stateCode),
    };
  }
  const branding = await getPlatform('branding');
  return { user: { id: u.id, name: u.name, username: u.username, role: u.role, tenantId: u.tenantId }, tenant, branding };
}

export default async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/login', async (req) => {
    const body = parse(loginSchema, req.body);
    const username = body.username.trim().toLowerCase();
    const key = `${clientIp(req.headers, req.ip)}|${username}`;
    const f = fails.get(key);
    if (f && f.n >= 10 && f.until > Date.now()) throw new HttpError(429, 'Too many wrong attempts. Try again after 15 minutes.');
    const [u] = await db.select().from(schema.users).where(eq(schema.users.username, username));
    const ok = u && u.isActive && (await bcrypt.compare(body.password, u.passwordHash));
    if (!ok) {
      const cur = f && f.until > Date.now() ? f : { n: 0, until: Date.now() + 15 * 60_000 };
      cur.n++;
      fails.set(key, cur);
      throw unauthorized('Wrong username or password');
    }
    fails.delete(key);
    if (u.tenantId) await assertTenantUsable(u.tenantId);
    await db.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, u.id));
    await logActivity(u.tenantId, u.id, 'login');
    const token = app.jwt.sign({ sub: u.id, tv: u.tokenVersion }, { expiresIn: '30d' });
    return { token, ...(await sessionPayload(u.id)) };
  });

  app.get('/api/auth/me', { preHandler: [app.authenticate] }, async (req) => ({ ...(await sessionPayload(req.auth.id)), impersonating: Boolean(req.auth.impersonatedBy) }));

  app.post('/api/auth/change-password', { preHandler: [app.authenticate] }, async (req) => {
    if (req.auth.impersonatedBy) throw badRequest('Not allowed while viewing as a client');
    const body = parse(changePasswordSchema, req.body);
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, req.auth.id));
    if (!(await bcrypt.compare(body.currentPassword, u.passwordHash))) throw badRequest('Current password is wrong');
    await db
      .update(schema.users)
      .set({ passwordHash: await bcrypt.hash(body.newPassword, 10), tokenVersion: dsql`${schema.users.tokenVersion} + 1` })
      .where(eq(schema.users.id, u.id));
    const [fresh] = await db.select().from(schema.users).where(eq(schema.users.id, u.id));
    return { token: app.jwt.sign({ sub: u.id, tv: fresh.tokenVersion }, { expiresIn: '30d' }) };
  });

  // ---- public (no login)
  app.get('/api/public/branding', async () => {
    const b = await getPlatform('branding');
    return { appName: b.appName || 'GST Invoice', supportPhone: b.supportPhone || '', supportEmail: b.supportEmail || '', tagline: b.tagline || '' };
  });

  const reqLimit = new Map<string, number[]>();
  app.post('/api/public/access-request', async (req) => {
    const ip = clientIp(req.headers, req.ip);
    const recent = (reqLimit.get(ip) ?? []).filter((t) => t > Date.now() - 3600_000);
    if (recent.length >= 5) throw new HttpError(429, 'Too many requests. Please call us instead.');
    reqLimit.set(ip, [...recent, Date.now()]);
    const body = parse(accessRequestSchema, req.body);
    await db.insert(schema.accessRequests).values(body);
    return { ok: true };
  });
}
