import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from '../lib/env';

// Secrets (WhatsApp tokens) are stored encrypted (AES-256-GCM) with a key derived from a server
// secret that is not in the database — a DB copy alone does not reveal them.
const key = () => createHash('sha256').update(`wa-token:${env.JWT_SECRET}`).digest();

export const encryptSecret = (plain: string) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
};

export const decryptSecret = (packed?: string | null): string | null => {
  if (!packed) return null;
  try {
    const [iv, tag, data] = packed.split('.').map((p) => Buffer.from(p, 'base64'));
    const d = createDecipheriv('aes-256-gcm', key(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(data), d.final()]).toString('utf8');
  } catch {
    return null;
  }
};
export const maskToken = (t: string) => (t.length > 4 ? `••••••••${t.slice(-4)}` : '••••');
