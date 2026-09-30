import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as endpointsService from '../../../services/endpoints';
import * as metricsService from '../../../services/metrics';
import * as monitorService from '../../../services/monitor';
import { GET as listEndpointsRoute, POST as createEndpointRoute } from './route';
import { DELETE as deleteEndpointRoute } from './[id]/route';
import { POST as manualCheckRoute } from './[id]/check/route';
import { GET as getMetricsRoute } from './[id]/metrics/route';
import { GET as getHistoryRoute } from './[id]/history/route';

vi.mock('../../../services/endpoints', async () => {
  const actual = await vi.importActual<typeof endpointsService>(
    '../../../services/endpoints'
  );
  return {
    ...actual,
    listEndpoints: vi.fn(),
    getEndpointById: vi.fn(),
    createEndpoint: vi.fn(),
    deleteEndpoint: vi.fn(),
  };
});

vi.mock('../../../services/monitor', () => ({
  runCheck: vi.fn(),
}));

vi.mock('../../../services/metrics', () => ({
  getEndpointMetrics: vi.fn(),
  getRecentChecks: vi.fn(),
}));

describe('API Routes: /api/endpoints', () => {
  const mockEndpoint = {
    id: 1,
    name: 'GitHub API',
    url: 'https://api.github.com',
    latencyThresholdMs: 500,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // GET /api/endpoints
  // ==========================================================================
  describe('GET /api/endpoints', () => {
    it('returns all endpoints with 200 status', async () => {
      vi.mocked(endpointsService.listEndpoints).mockResolvedValue([mockEndpoint]);

      const response = await listEndpointsRoute();
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveLength(1);
      expect(data[0].id).toBe(1);
      expect(data[0].name).toBe('GitHub API');
    });

    it('returns 500 on unexpected service failure', async () => {
      vi.mocked(endpointsService.listEndpoints).mockRejectedValue(
        new Error('DB failure')
      );

      const response = await listEndpointsRoute();
      expect(response.status).toBe(500);

      const data = await response.json();
      expect(data).toEqual({ error: 'Internal server error' });
    });
  });

  // ==========================================================================
  // POST /api/endpoints
  // ==========================================================================
  describe('POST /api/endpoints', () => {
    it('creates endpoint and returns 201 status on valid body', async () => {
      vi.mocked(endpointsService.createEndpoint).mockResolvedValue(mockEndpoint);

      const req = new Request('http://localhost:3000/api/endpoints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'GitHub API',
          url: 'https://api.github.com',
          latencyThresholdMs: 500,
        }),
      });

      const response = await createEndpointRoute(req);
      expect(response.status).toBe(201);

      const data = await response.json();
      expect(data.id).toBe(1);
      expect(data.name).toBe('GitHub API');
    });

    it('returns 400 when body is not valid JSON', async () => {
      const req = new Request('http://localhost:3000/api/endpoints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid-json{',
      });

      const response = await createEndpointRoute(req);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toBe('Invalid JSON request body');
    });

    it('returns 400 with details when validation fails', async () => {
      const req = new Request('http://localhost:3000/api/endpoints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: '', // Empty name
          url: 'not-a-valid-url',
          latencyThresholdMs: -50,
        }),
      });

      const response = await createEndpointRoute(req);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toBe('Invalid request');
      expect(Array.isArray(data.details)).toBe(true);
      expect(data.details.length).toBeGreaterThanOrEqual(1);
    });

    it('returns 409 when URL already exists', async () => {
      vi.mocked(endpointsService.createEndpoint).mockRejectedValue(
        new endpointsService.DuplicateUrlError()
      );

      const req = new Request('http://localhost:3000/api/endpoints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Duplicate API',
          url: 'https://api.github.com',
        }),
      });

      const response = await createEndpointRoute(req);
      expect(response.status).toBe(409);

      const data = await response.json();
      expect(data.error).toBe('An endpoint with this URL already exists');
    });

    it('returns 500 on unexpected creation error', async () => {
      vi.mocked(endpointsService.createEndpoint).mockRejectedValue(
        new Error('Unexpected DB error')
      );

      const req = new Request('http://localhost:3000/api/endpoints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'New API',
          url: 'https://api.example.com',
        }),
      });

      const response = await createEndpointRoute(req);
      expect(response.status).toBe(500);

      const data = await response.json();
      expect(data.error).toBe('Internal server error');
    });
  });

  // ==========================================================================
  // DELETE /api/endpoints/:id
  // ==========================================================================
  describe('DELETE /api/endpoints/:id', () => {
    it('returns 204 on successful deletion', async () => {
      vi.mocked(endpointsService.deleteEndpoint).mockResolvedValue(true);

      const req = new Request('http://localhost:3000/api/endpoints/1', {
        method: 'DELETE',
      });

      const response = await deleteEndpointRoute(req, {
        params: Promise.resolve({ id: '1' }),
      });

      expect(response.status).toBe(204);
      expect(endpointsService.deleteEndpoint).toHaveBeenCalledWith(1);
    });

    it('returns 404 when endpoint does not exist', async () => {
      vi.mocked(endpointsService.deleteEndpoint).mockResolvedValue(false);

      const req = new Request('http://localhost:3000/api/endpoints/999', {
        method: 'DELETE',
      });

      const response = await deleteEndpointRoute(req, {
        params: Promise.resolve({ id: '999' }),
      });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Endpoint not found');
    });

    it('returns 400 when endpoint ID is invalid', async () => {
      const req = new Request('http://localhost:3000/api/endpoints/abc', {
        method: 'DELETE',
      });

      const response = await deleteEndpointRoute(req, {
        params: Promise.resolve({ id: 'abc' }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Invalid endpoint ID');
    });

    it('returns 500 on unexpected deletion failure', async () => {
      vi.mocked(endpointsService.deleteEndpoint).mockRejectedValue(
        new Error('DB lock')
      );

      const req = new Request('http://localhost:3000/api/endpoints/1', {
        method: 'DELETE',
      });

      const response = await deleteEndpointRoute(req, {
        params: Promise.resolve({ id: '1' }),
      });

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Internal server error');
    });
  });

  // ==========================================================================
  // POST /api/endpoints/:id/check
  // ==========================================================================
  describe('POST /api/endpoints/:id/check', () => {
    it('returns 200 with persisted check result when check is successful', async () => {
      vi.mocked(monitorService.runCheck).mockResolvedValue({
        ok: true,
        endpoint: mockEndpoint,
        check: {
          id: 42,
          endpointId: 1,
          checkedAt: new Date(),
          statusCode: 200,
          latencyMs: 120,
          success: true,
          status: 'up',
          errorType: null,
          errorMessage: null,
        },
        result: {
          statusCode: 200,
          latencyMs: 120,
          success: true,
          status: 'up',
          errorType: null,
          errorMessage: null,
        },
        id: 42,
        endpointId: 1,
        checkedAt: new Date(),
        statusCode: 200,
        latencyMs: 120,
        success: true,
        status: 'up',
        errorType: null,
        errorMessage: null,
      });

      const req = new Request('http://localhost:3000/api/endpoints/1/check', {
        method: 'POST',
      });

      const response = await manualCheckRoute(req, {
        params: Promise.resolve({ id: '1' }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.ok).toBe(true);
      expect(data.status).toBe('up');
      expect(data.statusCode).toBe(200);
    });

    it('returns 200 with result when target API is DOWN (monitoring result, not server error)', async () => {
      vi.mocked(monitorService.runCheck).mockResolvedValue({
        ok: true,
        endpoint: mockEndpoint,
        check: {
          id: 43,
          endpointId: 1,
          checkedAt: new Date(),
          statusCode: 503,
          latencyMs: 80,
          success: false,
          status: 'down',
          errorType: 'http',
          errorMessage: 'HTTP 503 Service Unavailable',
        },
        result: {
          statusCode: 503,
          latencyMs: 80,
          success: false,
          status: 'down',
          errorType: 'http',
          errorMessage: 'HTTP 503 Service Unavailable',
        },
        id: 43,
        endpointId: 1,
        checkedAt: new Date(),
        statusCode: 503,
        latencyMs: 80,
        success: false,
        status: 'down',
        errorType: 'http',
        errorMessage: 'HTTP 503 Service Unavailable',
      });

      const req = new Request('http://localhost:3000/api/endpoints/1/check', {
        method: 'POST',
      });

      const response = await manualCheckRoute(req, {
        params: Promise.resolve({ id: '1' }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.status).toBe('down');
      expect(data.statusCode).toBe(503);
    });

    it('returns 404 when endpoint does not exist', async () => {
      vi.mocked(monitorService.runCheck).mockResolvedValue({
        ok: false,
        success: false,
        error: 'ENDPOINT_NOT_FOUND',
        message: 'Endpoint with ID 999 not found',
      });

      const req = new Request('http://localhost:3000/api/endpoints/999/check', {
        method: 'POST',
      });

      const response = await manualCheckRoute(req, {
        params: Promise.resolve({ id: '999' }),
      });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Endpoint not found');
    });

    it('returns 400 on invalid endpoint ID', async () => {
      const req = new Request('http://localhost:3000/api/endpoints/xyz/check', {
        method: 'POST',
      });

      const response = await manualCheckRoute(req, {
        params: Promise.resolve({ id: 'xyz' }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Invalid endpoint ID');
    });

    it('returns 500 on unexpected database failure during check', async () => {
      vi.mocked(monitorService.runCheck).mockRejectedValue(
        new Error('PostgreSQL connection dropped')
      );

      const req = new Request('http://localhost:3000/api/endpoints/1/check', {
        method: 'POST',
      });

      const response = await manualCheckRoute(req, {
        params: Promise.resolve({ id: '1' }),
      });

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Internal server error');
    });
  });

  // ==========================================================================
  // GET /api/endpoints/:id/metrics
  // ==========================================================================
  describe('GET /api/endpoints/:id/metrics', () => {
    it('returns 200 with calculated metrics when endpoint exists', async () => {
      vi.mocked(endpointsService.getEndpointById).mockResolvedValue(mockEndpoint);
      vi.mocked(metricsService.getEndpointMetrics).mockResolvedValue({
        uptime: 95.5,
        errorRate: 4.5,
        averageLatencyMs: 140,
        p95LatencyMs: 280,
        totalChecks: 200,
      });

      const req = new Request('http://localhost:3000/api/endpoints/1/metrics');
      const response = await getMetricsRoute(req, {
        params: Promise.resolve({ id: '1' }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.uptime).toBe(95.5);
      expect(data.errorRate).toBe(4.5);
      expect(data.averageLatencyMs).toBe(140);
      expect(data.p95LatencyMs).toBe(280);
      expect(data.totalChecks).toBe(200);
    });

    it('returns 404 when endpoint does not exist', async () => {
      vi.mocked(endpointsService.getEndpointById).mockResolvedValue(null);

      const req = new Request('http://localhost:3000/api/endpoints/999/metrics');
      const response = await getMetricsRoute(req, {
        params: Promise.resolve({ id: '999' }),
      });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Endpoint not found');
      expect(metricsService.getEndpointMetrics).not.toHaveBeenCalled();
    });

    it('returns 400 on invalid endpoint ID', async () => {
      const req = new Request('http://localhost:3000/api/endpoints/bad-id/metrics');
      const response = await getMetricsRoute(req, {
        params: Promise.resolve({ id: 'bad-id' }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Invalid endpoint ID');
    });

    it('returns 500 on unexpected metric retrieval error', async () => {
      vi.mocked(endpointsService.getEndpointById).mockResolvedValue(mockEndpoint);
      vi.mocked(metricsService.getEndpointMetrics).mockRejectedValue(
        new Error('Aggregation failed')
      );

      const req = new Request('http://localhost:3000/api/endpoints/1/metrics');
      const response = await getMetricsRoute(req, {
        params: Promise.resolve({ id: '1' }),
      });

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Internal server error');
    });
  });

  // ==========================================================================
  // GET /api/endpoints/:id/history
  // ==========================================================================
  describe('GET /api/endpoints/:id/history', () => {
    const mockChecks = [
      {
        id: 1,
        endpointId: 1,
        checkedAt: new Date(),
        statusCode: 200,
        latencyMs: 120,
        success: true,
        status: 'up' as const,
        errorType: null,
        errorMessage: null,
      },
    ];

    it('returns 200 with recent checks using default limit', async () => {
      vi.mocked(endpointsService.getEndpointById).mockResolvedValue(mockEndpoint);
      vi.mocked(metricsService.getRecentChecks).mockResolvedValue(mockChecks);

      const req = new Request('http://localhost:3000/api/endpoints/1/history');
      const response = await getHistoryRoute(req, {
        params: Promise.resolve({ id: '1' }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveLength(1);
      expect(data[0].id).toBe(1);
      expect(metricsService.getRecentChecks).toHaveBeenCalledWith(1, undefined);
    });

    it('accepts and passes validated custom limit parameter', async () => {
      vi.mocked(endpointsService.getEndpointById).mockResolvedValue(mockEndpoint);
      vi.mocked(metricsService.getRecentChecks).mockResolvedValue(mockChecks);

      const req = new Request('http://localhost:3000/api/endpoints/1/history?limit=15');
      const response = await getHistoryRoute(req, {
        params: Promise.resolve({ id: '1' }),
      });

      expect(response.status).toBe(200);
      expect(metricsService.getRecentChecks).toHaveBeenCalledWith(1, 15);
    });

    it('returns 400 on invalid limit parameter (non-integer, <= 0, or > 100)', async () => {
      vi.mocked(endpointsService.getEndpointById).mockResolvedValue(mockEndpoint);

      const req = new Request('http://localhost:3000/api/endpoints/1/history?limit=999');
      const response = await getHistoryRoute(req, {
        params: Promise.resolve({ id: '1' }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('Invalid limit parameter');
    });

    it('returns 404 when endpoint does not exist', async () => {
      vi.mocked(endpointsService.getEndpointById).mockResolvedValue(null);

      const req = new Request('http://localhost:3000/api/endpoints/999/history');
      const response = await getHistoryRoute(req, {
        params: Promise.resolve({ id: '999' }),
      });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Endpoint not found');
      expect(metricsService.getRecentChecks).not.toHaveBeenCalled();
    });

    it('returns 400 on invalid endpoint ID', async () => {
      const req = new Request('http://localhost:3000/api/endpoints/invalid/history');
      const response = await getHistoryRoute(req, {
        params: Promise.resolve({ id: 'invalid' }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Invalid endpoint ID');
    });

    it('returns 500 on unexpected history retrieval error', async () => {
      vi.mocked(endpointsService.getEndpointById).mockResolvedValue(mockEndpoint);
      vi.mocked(metricsService.getRecentChecks).mockRejectedValue(
        new Error('DB read error')
      );

      const req = new Request('http://localhost:3000/api/endpoints/1/history');
      const response = await getHistoryRoute(req, {
        params: Promise.resolve({ id: '1' }),
      });

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Internal server error');
    });
  });
});
