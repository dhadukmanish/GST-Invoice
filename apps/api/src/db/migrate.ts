import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { DATABASE_URL } from './client';

const here = path.dirname(fileURLToPath(import.meta.url));
const client = postgres(DATABASE_URL, { max: 1, onnotice: () => {} });
await migrate(drizzle(client), { migrationsFolder: path.resolve(here, '../../drizzle') });
console.log('Migrations applied');
await client.end();
process.exit(0);
