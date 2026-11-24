import fp from 'fastify-plugin';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import { todayIST } from '@gst/shared';
import { db, schema } from '../db/client';
import { HttpError, forbidden, unauthorized } from '../lib/errors';
import { getPlatform } from '../services/platform';

export interface AuthUser {
  id: string;
  role: 'superadmin' | 'admin' | 'staff';
  name: string;
  username: string;
  tenantId: string | null;
  impersonatedBy?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthUser;
  }
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireSuper: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireTenant: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireTenantAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; tv: number; imp?: string };
  }
}

/** Throws when a client's subscription is suspended or past its validity date. */
export async function assertTenantUsable(tenantId: string) {
  const [t] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, tenantId));
  if (!t) throw unauthorized('Account not found');
  const support = (await getPlatform('branding')) as { supportPhone?: string };
  const contact = support.supportPhone ? ` Contact support: ${support.supportPhone}.` : ' Please contact support.';
  if (t.status !== 'active') throw new HttpError(403, `This account is suspended.${contact}`, { code: 'SUSPENDED' });
  if (t.validUntil < todayIST()) throw new HttpError(402, `Your subscription expired on ${t.validUntil.split('-').reverse().join('-')}.${contact}`, { code: 'EXPIRED' });
  return t;
}

export default fp(async (app) => {
  app.decorateRequest('auth', null as unknown as AuthUser);

  app.decorate('authenticate', async (req: FastifyRequest) => {
    let payload: { sub: string; tv: number; imp?: string };
    try {
      payload = await req.jwtVerify();
    } catch {
      throw unauthorized();
    }
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, payload.sub));
    if (!u || !u.isActive || u.tokenVersion !== payload.tv) throw unauthorized();
    if (u.tenantId && !payload.imp) await assertTenantUsable(u.tenantId);
    req.auth = { id: u.id, role: u.role as AuthUser['role'], name: u.name, username: u.username, tenantId: u.tenantId, impersonatedBy: payload.imp };
  });

  app.decorate('requireSuper', async (req: FastifyRequest) => {
    if (req.auth?.role !== 'superadmin' || req.auth.impersonatedBy) throw forbidden();
  });
  app.decorate('requireTenant', async (req: FastifyRequest) => {
    if (!req.auth?.tenantId) throw forbidden('Open a client account to use this');
  });
  app.decorate('requireTenantAdmin', async (req: FastifyRequest) => {
    if (!req.auth?.tenantId || req.auth.role !== 'admin') throw forbidden('Only the account admin can change this');
  });
});
