import 'dotenv/config';
import path from 'node:path';

export const env = {
  PORT: Number(process.env.PORT ?? 4000),
  JWT_SECRET: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  CORS_ORIGIN: (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(','),
  PUBLIC_URL: (process.env.PUBLIC_URL ?? 'http://localhost:5173').replace(/\/+$/, ''),
  UPLOAD_DIR: path.resolve(process.env.UPLOAD_DIR ?? './uploads'),
};
if (process.env.NODE_ENV === 'production' && env.JWT_SECRET === 'dev-secret-change-me') {
  throw new Error('JWT_SECRET must be set in production');
}
