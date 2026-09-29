export type CheckStatus = 'up' | 'degraded' | 'down';

export type CheckErrorType =
  | 'invalid_url'
  | 'timeout'
  | 'dns'
  | 'network'
  | 'http';

export interface CheckResult {
  statusCode: number | null;
  latencyMs: number | null;
  success: boolean;
  status: CheckStatus;
  errorType: CheckErrorType | null;
  errorMessage: string | null;
}

export interface CheckOptions {
  timeoutMs?: number;
}

export const DEFAULT_TIMEOUT_MS = 5000;

function isValidHttpUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Performs an active HTTP health check against a target URL.
 * 
 * Measures response latency using high-resolution performance.now() timer,
 * enforces an AbortController-driven timeout (default 5000ms), and classifies
 * the endpoint health into 'up', 'degraded', or 'down'.
 */
export async function checkEndpoint(
  url: string,
  latencyThresholdMs: number,
  options?: CheckOptions
): Promise<CheckResult> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // 1. Validate URL
  if (!isValidHttpUrl(url)) {
    return {
      statusCode: null,
      latencyMs: null,
      success: false,
      status: 'down',
      errorType: 'invalid_url',
      errorMessage: 'Invalid URL format. Only HTTP and HTTPS protocols are supported.',
    };
  }

  // 2. High-resolution timer & AbortController timeout
  const startTime = performance.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    // 3. Dispatch HTTP request
    const response = await fetch(url, {
      signal: controller.signal,
      method: 'GET',
      headers: {
        'User-Agent': 'PulseCheck-Monitor/1.0',
      },
    });

    const latencyMs = Math.round(performance.now() - startTime);
    const statusCode = response.status;
    const isSuccessful = statusCode >= 200 && statusCode < 400;

    if (isSuccessful) {
      const status: CheckStatus =
        latencyMs <= latencyThresholdMs ? 'up' : 'degraded';

      return {
        statusCode,
        latencyMs,
        success: true,
        status,
        errorType: null,
        errorMessage: null,
      };
    }

    // HTTP 400 - 599 failures
    return {
      statusCode,
      latencyMs,
      success: false,
      status: 'down',
      errorType: 'http',
      errorMessage: `HTTP request failed with status code ${statusCode}`,
    };
  } catch (error: unknown) {
    const latencyMs = Math.round(performance.now() - startTime);

    if (
      controller.signal.aborted ||
      (error instanceof Error && error.name === 'AbortError')
    ) {
      return {
        statusCode: null,
        latencyMs,
        success: false,
        status: 'down',
        errorType: 'timeout',
        errorMessage: `Request timed out after ${timeoutMs}ms`,
      };
    }

    let errorType: CheckErrorType = 'network';
    const rawMessage = error instanceof Error ? error.message : String(error);
    const lowerMessage = rawMessage.toLowerCase();

    if (
      lowerMessage.includes('enotfound') ||
      lowerMessage.includes('eai_again') ||
      lowerMessage.includes('getaddrinfo') ||
      lowerMessage.includes('dns')
    ) {
      errorType = 'dns';
    }

    return {
      statusCode: null,
      latencyMs,
      success: false,
      status: 'down',
      errorType,
      errorMessage: rawMessage || 'Network connection error encountered',
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
