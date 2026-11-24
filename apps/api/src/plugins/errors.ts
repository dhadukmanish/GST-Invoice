import fp from 'fastify-plugin';
import { HttpError } from '../lib/errors';

export default fp(async (app) => {
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) return reply.status(err.statusCode).send({ message: err.message, details: err.details });
    const e = err as { statusCode?: number; code?: string; message: string };
    if (e.code === '23505') return reply.status(409).send({ message: 'This already exists (duplicate). Use a different number / name.' });
    if (e.statusCode && e.statusCode < 500) return reply.status(e.statusCode).send({ message: e.message });
    req.log.error(err);
    return reply.status(500).send({ message: 'Something went wrong on the server. Please try again.' });
  });
});
