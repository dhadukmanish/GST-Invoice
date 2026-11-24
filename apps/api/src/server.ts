import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { env } from './lib/env';
import authPlugin from './plugins/auth';
import errorPlugin from './plugins/errors';
import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import masterRoutes from './routes/masters';
import invoiceRoutes, { startPdfCleanup } from './routes/invoices';
import settingsRoutes from './routes/settings';
import reportRoutes from './routes/reports';
import { startWhatsappWorker } from './services/whatsapp';

export async function buildApp() {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' }, bodyLimit: 2 * 1024 * 1024, trustProxy: true });
  await app.register(cors, { origin: env.CORS_ORIGIN, credentials: true });
  await app.register(jwt, { secret: env.JWT_SECRET });
  await app.register(errorPlugin);
  await app.register(authPlugin);
  app.get('/api/health', async () => ({ message: 'ok', data: { status: 'up', time: new Date().toISOString() } }));
  await app.register(authRoutes);
  await app.register(adminRoutes);
  await app.register(masterRoutes);
  await app.register(invoiceRoutes);
  await app.register(settingsRoutes);
  await app.register(reportRoutes);
  return app;
}

const app = await buildApp();
app
  .listen({ port: env.PORT, host: '0.0.0.0' })
  .then(() => {
    startWhatsappWorker(app.log);
    startPdfCleanup();
  })
  .catch((e) => {
    app.log.error(e);
    process.exit(1);
  });
