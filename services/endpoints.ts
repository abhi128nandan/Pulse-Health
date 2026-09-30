import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { endpoints, type Endpoint } from '../db/schema';

export const createEndpointSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Name is required')
      .max(100, 'Name must not exceed 100 characters'),
    url: z
      .string()
      .trim()
      .url('Must be a valid URL')
      .max(2048, 'URL must not exceed 2048 characters')
      .refine(
        (val) => {
          try {
            const parsed = new URL(val);
            return parsed.protocol === 'http:' || parsed.protocol === 'https:';
          } catch {
            return false;
          }
        },
        { message: 'URL must use http or https protocol' }
      ),
    latencyThresholdMs: z
      .number()
      .int('Latency threshold must be an integer')
      .positive('Latency threshold must be a positive integer')
      .max(60000, 'Latency threshold must not exceed 60000ms')
      .optional()
      .default(500),
  })
  .strict();

export type CreateEndpointInput = z.infer<typeof createEndpointSchema>;

export class DuplicateUrlError extends Error {
  constructor(message = 'An endpoint with this URL already exists') {
    super(message);
    this.name = 'DuplicateUrlError';
  }
}

/**
 * Validates and parses an endpoint ID parameter.
 * Returns null if the value is not a valid positive integer.
 */
export function parseEndpointId(rawId: string): number | null {
  const parsed = Number(rawId);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

/**
 * Lists all registered monitoring endpoints.
 */
export async function listEndpoints(database = db): Promise<Endpoint[]> {
  return database.select().from(endpoints).orderBy(endpoints.createdAt);
}

/**
 * Retrieves a single endpoint by ID.
 */
export async function getEndpointById(
  id: number,
  database = db
): Promise<Endpoint | null> {
  const [endpoint] = await database
    .select()
    .from(endpoints)
    .where(eq(endpoints.id, id))
    .limit(1);

  return endpoint ?? null;
}

/**
 * Retrieves an endpoint by URL.
 */
export async function getEndpointByUrl(
  url: string,
  database = db
): Promise<Endpoint | null> {
  const [endpoint] = await database
    .select()
    .from(endpoints)
    .where(eq(endpoints.url, url))
    .limit(1);

  return endpoint ?? null;
}

/**
 * Creates and registers a new monitoring endpoint.
 * Throws DuplicateUrlError if an endpoint with the same URL already exists.
 */
export async function createEndpoint(
  data: CreateEndpointInput,
  database = db
): Promise<Endpoint> {
  const existing = await getEndpointByUrl(data.url, database);
  if (existing) {
    throw new DuplicateUrlError();
  }

  try {
    const [created] = await database
      .insert(endpoints)
      .values({
        name: data.name,
        url: data.url,
        latencyThresholdMs: data.latencyThresholdMs,
      })
      .returning();

    return created;
  } catch (error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: string }).code === '23505'
    ) {
      throw new DuplicateUrlError();
    }
    throw error;
  }
}

/**
 * Deletes an endpoint by ID.
 * Returns true if the endpoint was deleted, or false if it did not exist.
 * Foreign key CASCADE automatically removes related check records in PostgreSQL.
 */
export async function deleteEndpoint(
  id: number,
  database = db
): Promise<boolean> {
  const deleted = await database
    .delete(endpoints)
    .where(eq(endpoints.id, id))
    .returning();

  return deleted.length > 0;
}
