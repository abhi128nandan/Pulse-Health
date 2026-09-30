import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db';
import type { Endpoint } from '../db/schema';
import {
  createEndpoint,
  createEndpointSchema,
  deleteEndpoint,
  DuplicateUrlError,
  getEndpointById,
  getEndpointByUrl,
  listEndpoints,
  parseEndpointId,
} from './endpoints';

vi.mock('../db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('services/endpoints', () => {
  const mockEndpoint: Endpoint = {
    id: 1,
    name: 'GitHub API',
    url: 'https://api.github.com',
    latencyThresholdMs: 500,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parseEndpointId', () => {
    it('returns positive integer for valid numeric string', () => {
      expect(parseEndpointId('1')).toBe(1);
      expect(parseEndpointId('42')).toBe(42);
      expect(parseEndpointId('9999')).toBe(9999);
    });

    it('returns null for zero, negative numbers, floats, and invalid strings', () => {
      expect(parseEndpointId('0')).toBeNull();
      expect(parseEndpointId('-1')).toBeNull();
      expect(parseEndpointId('1.5')).toBeNull();
      expect(parseEndpointId('abc')).toBeNull();
      expect(parseEndpointId('')).toBeNull();
      expect(parseEndpointId('   ')).toBeNull();
    });
  });

  describe('createEndpointSchema validation', () => {
    it('accepts valid input with all fields', () => {
      const result = createEndpointSchema.safeParse({
        name: 'GitHub API',
        url: 'https://api.github.com',
        latencyThresholdMs: 500,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('GitHub API');
        expect(result.data.url).toBe('https://api.github.com');
        expect(result.data.latencyThresholdMs).toBe(500);
      }
    });

    it('defaults latencyThresholdMs to 500 when omitted', () => {
      const result = createEndpointSchema.safeParse({
        name: 'GitHub API',
        url: 'https://api.github.com',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.latencyThresholdMs).toBe(500);
      }
    });

    it('rejects empty or whitespace-only name', () => {
      expect(
        createEndpointSchema.safeParse({
          name: '',
          url: 'https://api.github.com',
        }).success
      ).toBe(false);

      expect(
        createEndpointSchema.safeParse({
          name: '   ',
          url: 'https://api.github.com',
        }).success
      ).toBe(false);
    });

    it('rejects name exceeding maximum length of 100 characters', () => {
      expect(
        createEndpointSchema.safeParse({
          name: 'a'.repeat(101),
          url: 'https://api.github.com',
        }).success
      ).toBe(false);
    });

    it('rejects invalid URL formats and non-HTTP/HTTPS protocols', () => {
      expect(
        createEndpointSchema.safeParse({
          name: 'Test',
          url: 'not-a-valid-url',
        }).success
      ).toBe(false);

      expect(
        createEndpointSchema.safeParse({
          name: 'Test',
          url: 'ftp://ftp.example.com',
        }).success
      ).toBe(false);

      expect(
        createEndpointSchema.safeParse({
          name: 'Test',
          url: 'javascript:alert(1)',
        }).success
      ).toBe(false);
    });

    it('rejects non-positive, floating-point, or excessive latencyThresholdMs', () => {
      expect(
        createEndpointSchema.safeParse({
          name: 'Test',
          url: 'https://api.example.com',
          latencyThresholdMs: 0,
        }).success
      ).toBe(false);

      expect(
        createEndpointSchema.safeParse({
          name: 'Test',
          url: 'https://api.example.com',
          latencyThresholdMs: -100,
        }).success
      ).toBe(false);

      expect(
        createEndpointSchema.safeParse({
          name: 'Test',
          url: 'https://api.example.com',
          latencyThresholdMs: 250.5,
        }).success
      ).toBe(false);

      expect(
        createEndpointSchema.safeParse({
          name: 'Test',
          url: 'https://api.example.com',
          latencyThresholdMs: 60001,
        }).success
      ).toBe(false);
    });

    it('rejects unknown unexpected fields due to strict mode', () => {
      expect(
        createEndpointSchema.safeParse({
          name: 'Test',
          url: 'https://api.example.com',
          extraField: 'unexpected',
        }).success
      ).toBe(false);
    });
  });

  describe('listEndpoints', () => {
    it('returns all endpoints ordered by createdAt', async () => {
      const orderByFn = vi.fn().mockResolvedValue([mockEndpoint]);
      const fromFn = vi.fn().mockReturnValue({ orderBy: orderByFn });
      (db.select as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        from: fromFn,
      });

      const result = await listEndpoints();

      expect(db.select).toHaveBeenCalledTimes(1);
      expect(result).toEqual([mockEndpoint]);
    });
  });

  describe('getEndpointById', () => {
    it('returns endpoint when found', async () => {
      const limitFn = vi.fn().mockResolvedValue([mockEndpoint]);
      const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
      (db.select as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        from: fromFn,
      });

      const result = await getEndpointById(1);

      expect(result).toEqual(mockEndpoint);
    });

    it('returns null when endpoint does not exist', async () => {
      const limitFn = vi.fn().mockResolvedValue([]);
      const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
      (db.select as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        from: fromFn,
      });

      const result = await getEndpointById(999);

      expect(result).toBeNull();
    });
  });

  describe('getEndpointByUrl', () => {
    it('returns endpoint matching the url', async () => {
      const limitFn = vi.fn().mockResolvedValue([mockEndpoint]);
      const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
      (db.select as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        from: fromFn,
      });

      const result = await getEndpointByUrl('https://api.github.com');

      expect(result).toEqual(mockEndpoint);
    });
  });

  describe('createEndpoint', () => {
    it('inserts and returns newly created endpoint', async () => {
      // getEndpointByUrl check -> null
      const limitFn = vi.fn().mockResolvedValue([]);
      const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
      (db.select as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        from: fromFn,
      });

      const returningFn = vi.fn().mockResolvedValue([mockEndpoint]);
      const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
      (db.insert as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        values: valuesFn,
      });

      const result = await createEndpoint({
        name: 'GitHub API',
        url: 'https://api.github.com',
        latencyThresholdMs: 500,
      });

      expect(result).toEqual(mockEndpoint);
      expect(valuesFn).toHaveBeenCalledWith({
        name: 'GitHub API',
        url: 'https://api.github.com',
        latencyThresholdMs: 500,
      });
    });

    it('throws DuplicateUrlError when URL already exists in database', async () => {
      // getEndpointByUrl check -> returns existing
      const limitFn = vi.fn().mockResolvedValue([mockEndpoint]);
      const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
      (db.select as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        from: fromFn,
      });

      await expect(
        createEndpoint({
          name: 'GitHub Duplicate',
          url: 'https://api.github.com',
          latencyThresholdMs: 500,
        })
      ).rejects.toThrow(DuplicateUrlError);

      expect(db.insert).not.toHaveBeenCalled();
    });

    it('catches PostgreSQL unique violation error code 23505 and throws DuplicateUrlError', async () => {
      // getEndpointByUrl check -> returns null (race condition)
      const limitFn = vi.fn().mockResolvedValue([]);
      const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
      (db.select as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        from: fromFn,
      });

      const pgUniqueError = Object.assign(new Error('duplicate key'), {
        code: '23505',
      });
      const returningFn = vi.fn().mockRejectedValue(pgUniqueError);
      const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
      (db.insert as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        values: valuesFn,
      });

      await expect(
        createEndpoint({
          name: 'GitHub Duplicate Race',
          url: 'https://api.github.com',
          latencyThresholdMs: 500,
        })
      ).rejects.toThrow(DuplicateUrlError);
    });
  });

  describe('deleteEndpoint', () => {
    it('returns true when endpoint was successfully deleted', async () => {
      const returningFn = vi.fn().mockResolvedValue([mockEndpoint]);
      const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
      (db.delete as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        where: whereFn,
      });

      const result = await deleteEndpoint(1);

      expect(result).toBe(true);
      expect(db.delete).toHaveBeenCalledTimes(1);
    });

    it('returns false when endpoint did not exist', async () => {
      const returningFn = vi.fn().mockResolvedValue([]);
      const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
      (db.delete as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        where: whereFn,
      });

      const result = await deleteEndpoint(999);

      expect(result).toBe(false);
    });
  });
});
