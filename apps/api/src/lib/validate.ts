import type { ZodTypeAny, z } from 'zod';
import { badRequest } from './errors';

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const first = r.error.issues[0];
    throw badRequest(first ? `${first.path.length ? `${first.path.join('.')}: ` : ''}${first.message}` : 'Invalid input', r.error.flatten());
  }
  return r.data;
}
