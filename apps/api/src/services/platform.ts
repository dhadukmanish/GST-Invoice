import { eq } from 'drizzle-orm';
import { db, schema } from '../db/client';

let cache: Map<string, { at: number; value: unknown }> = new Map();

export async function getPlatform(key: string): Promise<Record<string, unknown>> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 30_000) return hit.value as Record<string, unknown>;
  const [row] = await db.select().from(schema.platformSettings).where(eq(schema.platformSettings.key, key));
  const value = (row?.value ?? {}) as Record<string, unknown>;
  cache.set(key, { at: Date.now(), value });
  return value;
}

export async function setPlatform(key: string, value: Record<string, unknown>) {
  await db
    .insert(schema.platformSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.platformSettings.key, set: { value, updatedAt: new Date() } });
  cache.delete(key);
}
