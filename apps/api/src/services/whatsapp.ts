import { and, asc, desc, eq, inArray, isNull, lte, sql as dsql } from 'drizzle-orm';
import { waNumber } from '@gst/shared';
import { db, schema } from '../db/client';
import { badRequest } from '../lib/errors';
import * as client from './waClient';
import { decryptSecret } from './crypto';
import { getPlatform } from './platform';
import { getSetting, type WaStored } from './settings';

/** Default provider (same service Keshav uses). Each client / the platform can change it. */
export const DEFAULT_API_URL = 'https://surat.mitalinfosys.info/api/v1';
const RETRY_MINUTES = [1, 5, 15];
const MAX_ATTEMPTS = RETRY_MINUTES.length + 1;

export type Sender = client.WhatsappConfig & { source: 'own' | 'platform' };

async function platformSender(): Promise<Sender | null> {
  const p = (await getPlatform('whatsapp')) as WaStored & { shareWithClients?: boolean };
  const token = p.enabled ? decryptSecret(p.tokenEnc) : null;
  return token ? { apiUrl: p.apiUrl || DEFAULT_API_URL, token, device: p.device || undefined, source: 'platform' } : null;
}

/**
 * Which WhatsApp account sends for this client: its own (Settings → WhatsApp), else the platform
 * account when the super admin shares it and allows this client. null = WhatsApp API not available
 * (the app still offers "Share on WhatsApp" through wa.me, which is free).
 */
export async function senderFor(tenantId: string | null, { ignoreEnabled = false } = {}): Promise<Sender | null> {
  if (!tenantId) return platformSender();
  const own = await getSetting<WaStored>(tenantId, 'whatsapp');
  if ((own.enabled || ignoreEnabled) && own.tokenEnc) {
    const token = decryptSecret(own.tokenEnc);
    if (token) return { apiUrl: own.apiUrl || DEFAULT_API_URL, token, device: own.device || undefined, source: 'own' };
  }
  const [t] = await db.select({ allowed: schema.tenants.whatsappAllowed }).from(schema.tenants).where(eq(schema.tenants.id, tenantId));
  const p = (await getPlatform('whatsapp')) as WaStored & { shareWithClients?: boolean };
  if (t?.allowed && p.shareWithClients) return platformSender();
  return null;
}

export interface EnqueueInput {
  eventType: string;
  to: string;
  message: string;
  refId?: string | null;
  mediaUrl?: string | null;
}

/** Saves the message; the worker sends it. Throws only for a bad number / no sender (caller shows it). */
export async function enqueue(tenantId: string | null, input: EnqueueInput) {
  const sender = await senderFor(tenantId);
  if (!sender) throw badRequest('WhatsApp is not set up. Go to Settings → WhatsApp, or use "Open WhatsApp" instead.');
  const to = waNumber(input.to);
  if (!to) throw badRequest('Mobile number is not valid for WhatsApp');
  const [row] = await db
    .insert(schema.whatsappMessages)
    .values({ tenantId, eventType: input.eventType, refId: input.refId ?? null, toNumber: to, message: input.message, mediaUrl: input.mediaUrl ?? null })
    .returning();
  setImmediate(() => void processQueue(tenantId));
  return row;
}

const busy = new Set<string>();

export async function processQueue(tenantId: string | null) {
  const k = tenantId ?? 'platform';
  if (busy.has(k)) return;
  busy.add(k);
  try {
    const sender = await senderFor(tenantId);
    if (!sender) return;
    for (let round = 0; round < 5; round++) {
      const due = await db
        .select()
        .from(schema.whatsappMessages)
        .where(
          and(
            tenantId ? eq(schema.whatsappMessages.tenantId, tenantId) : isNull(schema.whatsappMessages.tenantId),
            eq(schema.whatsappMessages.status, 'PENDING'),
            lte(schema.whatsappMessages.nextAttemptAt, new Date()),
          ),
        )
        .orderBy(asc(schema.whatsappMessages.createdAt))
        .limit(20);
      if (!due.length) break;
      for (const m of due) {
        const reply = await client.sendMessage(sender, m.toNumber, m.message, m.mediaUrl);
        const attempts = m.attempts + 1;
        const set: Partial<typeof schema.whatsappMessages.$inferInsert> = reply.ok
          ? { status: 'SENT', attempts, sentAt: new Date(), error: null, providerMessageId: reply.message_id !== undefined ? String(reply.message_id) : null }
          : attempts >= MAX_ATTEMPTS
            ? { status: 'FAILED', attempts, error: String(reply.error ?? 'Could not send') }
            : { attempts, error: String(reply.error ?? 'Could not send'), nextAttemptAt: new Date(Date.now() + RETRY_MINUTES[attempts - 1] * 60_000) };
        await db.update(schema.whatsappMessages).set(set).where(eq(schema.whatsappMessages.id, m.id));
      }
      if (due.length < 20) break;
    }
  } finally {
    busy.delete(k);
  }
}

const MAP: Record<string, string> = { sent: 'SENT', delivered: 'DELIVERED', read: 'READ', failed: 'FAILED' };
const RANK: Record<string, number> = { SENT: 1, DELIVERED: 2, READ: 3 };

async function refreshStatuses(tenantId: string | null) {
  const open = await db
    .select()
    .from(schema.whatsappMessages)
    .where(
      and(
        tenantId ? eq(schema.whatsappMessages.tenantId, tenantId) : isNull(schema.whatsappMessages.tenantId),
        inArray(schema.whatsappMessages.status, ['SENT', 'DELIVERED']),
        dsql`${schema.whatsappMessages.sentAt} > now() - interval '2 days'`,
      ),
    )
    .limit(100);
  if (!open.length) return;
  const sender = await senderFor(tenantId);
  if (!sender) return;
  const reply = await client.getRecentMessages(sender, 100);
  const list = Array.isArray(reply.messages) ? (reply.messages as Record<string, unknown>[]) : [];
  const byId = new Map(list.map((m) => [String(m.id ?? m.message_id ?? ''), m]));
  for (const o of open) {
    const remote = byId.get(o.providerMessageId ?? '');
    const next = remote ? MAP[String(remote.status ?? '').toLowerCase()] : undefined;
    if (!next || next === o.status) continue;
    if (next === 'FAILED') await db.update(schema.whatsappMessages).set({ status: 'FAILED', error: String(remote?.error ?? 'Failed at WhatsApp') }).where(eq(schema.whatsappMessages.id, o.id));
    else if ((RANK[next] ?? 0) > (RANK[o.status] ?? 0)) await db.update(schema.whatsappMessages).set({ status: next }).where(eq(schema.whatsappMessages.id, o.id));
  }
}

let running = false;
/** Every 20 s: sends queued messages (with retries) and moves SENT → DELIVERED / READ. */
export function startWhatsappWorker(log: { error: (o: unknown, m?: string) => void }) {
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const rows = await db
        .selectDistinct({ tenantId: schema.whatsappMessages.tenantId })
        .from(schema.whatsappMessages)
        .where(dsql`${schema.whatsappMessages.status} = 'PENDING' OR (${schema.whatsappMessages.status} IN ('SENT','DELIVERED') AND ${schema.whatsappMessages.sentAt} > now() - interval '2 days')`);
      for (const r of rows) {
        await processQueue(r.tenantId);
        await refreshStatuses(r.tenantId).catch(() => undefined);
      }
    } catch (e) {
      log.error(e, 'WhatsApp worker failed');
    } finally {
      running = false;
    }
  }, 20_000);
  timer.unref();
}

export async function listMessages(tenantId: string | null, page: number, pageSize: number) {
  const where = tenantId ? eq(schema.whatsappMessages.tenantId, tenantId) : isNull(schema.whatsappMessages.tenantId);
  const rows = await db.select().from(schema.whatsappMessages).where(where).orderBy(desc(schema.whatsappMessages.createdAt)).limit(pageSize).offset((page - 1) * pageSize);
  const [{ count }] = await db.select({ count: dsql<number>`count(*)::int` }).from(schema.whatsappMessages).where(where);
  return { rows, total: count };
}

export async function connectionInfo(tenantId: string | null) {
  const sender = await senderFor(tenantId, { ignoreEnabled: true });
  if (!sender) return { configured: false };
  const [balance, device] = await Promise.all([client.getBalance(sender), client.getDeviceStatus(sender)]);
  return {
    configured: true,
    source: sender.source,
    balance: balance.ok ? { credits: balance.credits, validTill: balance.valid_till, sentToday: balance.sent_today, dailyLimit: balance.daily_limit } : null,
    balanceError: balance.ok ? null : balance.error,
    device: device.ok ? { state: device.state ?? 'unknown' } : null,
    deviceError: device.ok ? null : device.error,
  };
}

export async function sendNow(sender: client.WhatsappConfig, tenantId: string | null, eventType: string, toRaw: string, message: string) {
  const to = waNumber(toRaw);
  if (!to) throw badRequest('Enter a valid mobile number');
  const reply = await client.sendMessage(sender, to, message);
  await db.insert(schema.whatsappMessages).values({
    tenantId,
    eventType,
    toNumber: to,
    message,
    status: reply.ok ? 'SENT' : 'FAILED',
    attempts: 1,
    sentAt: reply.ok ? new Date() : null,
    error: reply.ok ? null : String(reply.error ?? 'Could not send'),
    providerMessageId: reply.ok && reply.message_id !== undefined ? String(reply.message_id) : null,
  });
  return { ok: reply.ok, error: reply.ok ? null : String(reply.error ?? 'Could not send') };
}
