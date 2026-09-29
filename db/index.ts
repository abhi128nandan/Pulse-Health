import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString,
  ssl:
    connectionString?.includes('neon.tech') ||
    connectionString?.includes('sslmode=require')
      ? { rejectUnauthorized: false }
      : undefined,
});

export const db = drizzle(pool, { schema });
export { pool };
