import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkEndpoint } from './checker';

describe('checkEndpoint', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('classifies successful fast response as UP', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      statusText: 'OK',
    } as Response);

    const nowSpy = vi.spyOn(performance, 'now');
    nowSpy.mockReturnValueOnce(1000).mockReturnValueOnce(1150); // 150ms elapsed

    const result = await checkEndpoint('https://api.example.com/health', 500);

    expect(result).toEqual({
      statusCode: 200,
      latencyMs: 150,
      success: true,
      status: 'up',
      errorType: null,
      errorMessage: null,
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('classifies successful slow response as DEGRADED when latency exceeds threshold', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      statusText: 'OK',
    } as Response);

    const nowSpy = vi.spyOn(performance, 'now');
    nowSpy.mockReturnValueOnce(1000).mockReturnValueOnce(1750); // 750ms elapsed

    const result = await checkEndpoint('https://api.example.com/health', 500);

    expect(result).toEqual({
      statusCode: 200,
      latencyMs: 750,
      success: true,
      status: 'degraded',
      errorType: null,
      errorMessage: null,
    });
  });

  it('classifies HTTP 4xx client errors as DOWN with preserved status code', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 404,
      statusText: 'Not Found',
    } as Response);

    const nowSpy = vi.spyOn(performance, 'now');
    nowSpy.mockReturnValueOnce(1000).mockReturnValueOnce(1080);

    const result = await checkEndpoint('https://api.example.com/missing', 500);

    expect(result).toEqual({
      statusCode: 404,
      latencyMs: 80,
      success: false,
      status: 'down',
      errorType: 'http',
      errorMessage: 'HTTP request failed with status code 404',
    });
  });

  it('classifies HTTP 5xx server errors as DOWN with preserved status code', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 503,
      statusText: 'Service Unavailable',
    } as Response);

    const nowSpy = vi.spyOn(performance, 'now');
    nowSpy.mockReturnValueOnce(1000).mockReturnValueOnce(1120);

    const result = await checkEndpoint('https://api.example.com/service', 500);

    expect(result).toEqual({
      statusCode: 503,
      latencyMs: 120,
      success: false,
      status: 'down',
      errorType: 'http',
      errorMessage: 'HTTP request failed with status code 503',
    });
  });

  it('classifies request timeout as DOWN with timeout errorType', async () => {
    globalThis.fetch = vi.fn().mockImplementation((_url, options) => {
      return new Promise((_resolve, reject) => {
        const signal = options?.signal;
        if (signal) {
          signal.addEventListener('abort', () => {
            const abortError = new Error('The operation was aborted');
            abortError.name = 'AbortError';
            reject(abortError);
          });
        }
      });
    });

    const result = await checkEndpoint(
      'https://api.example.com/slow',
      500,
      { timeoutMs: 50 } // Short timeout for test speed
    );

    expect(result.status).toBe('down');
    expect(result.success).toBe(false);
    expect(result.statusCode).toBeNull();
    expect(result.errorType).toBe('timeout');
    expect(result.errorMessage).toBe('Request timed out after 50ms');
  });

  it('classifies invalid URL format as DOWN without calling fetch', async () => {
    globalThis.fetch = vi.fn();

    const result = await checkEndpoint('invalid-url-string', 500);

    expect(result).toEqual({
      statusCode: null,
      latencyMs: null,
      success: false,
      status: 'down',
      errorType: 'invalid_url',
      errorMessage:
        'Invalid URL format. Only HTTP and HTTPS protocols are supported.',
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('rejects unsupported protocols (e.g. ftp://) as invalid_url', async () => {
    globalThis.fetch = vi.fn();

    const result = await checkEndpoint('ftp://ftp.example.com/resource', 500);

    expect(result.status).toBe('down');
    expect(result.errorType).toBe('invalid_url');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('classifies DNS resolution failures as DOWN with dns errorType', async () => {
    const dnsError = new Error('getaddrinfo ENOTFOUND nonexistent.domain');
    globalThis.fetch = vi.fn().mockRejectedValue(dnsError);

    const nowSpy = vi.spyOn(performance, 'now');
    nowSpy.mockReturnValueOnce(1000).mockReturnValueOnce(1050);

    const result = await checkEndpoint('https://nonexistent.domain', 500);

    expect(result).toEqual({
      statusCode: null,
      latencyMs: 50,
      success: false,
      status: 'down',
      errorType: 'dns',
      errorMessage: 'getaddrinfo ENOTFOUND nonexistent.domain',
    });
  });

  it('classifies network connection refusal as DOWN with network errorType', async () => {
    const connError = new Error('connect ECONNREFUSED 127.0.0.1:9999');
    globalThis.fetch = vi.fn().mockRejectedValue(connError);

    const nowSpy = vi.spyOn(performance, 'now');
    nowSpy.mockReturnValueOnce(1000).mockReturnValueOnce(1030);

    const result = await checkEndpoint('http://127.0.0.1:9999', 500);

    expect(result).toEqual({
      statusCode: null,
      latencyMs: 30,
      success: false,
      status: 'down',
      errorType: 'network',
      errorMessage: 'connect ECONNREFUSED 127.0.0.1:9999',
    });
  });
});
