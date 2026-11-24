import { randomBytes } from 'node:crypto';
import { db, schema } from '../db/client';

export const token = (bytes = 16) => randomBytes(bytes).toString('base64url');

/** Readable random password for new client logins, e.g. "Kite-4821-maple". */
export function genPassword(): string {
  const words = ['Kite', 'Lotus', 'Mango', 'River', 'Tiger', 'Pearl', 'Cedar', 'Amber', 'Comet', 'Coral', 'Delta', 'Falcon', 'Maple', 'Orbit', 'Saffron'];
  const w = () => words[randomBytes(1)[0] % words.length];
  return `${w()}-${1000 + (randomBytes(2).readUInt16BE(0) % 9000)}-${w().toLowerCase()}`;
}

export async function logActivity(tenantId: string | null, userId: string | null, action: string, detail = '') {
  try {
    await db.insert(schema.activityLog).values({ tenantId, userId, action, detail: detail.slice(0, 500) });
  } catch {
    /* never break the caller */
  }
}

export const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
