export type CheckStatus = 'up' | 'degraded' | 'down';

export type CheckErrorType =
  | 'invalid_url'
  | 'timeout'
  | 'dns'
  | 'network'
  | 'http';

export interface Endpoint {
  id: number;
  name: string;
  url: string;
  latencyThresholdMs: number;
  createdAt: string;
}

export interface Check {
  id: number;
  endpointId: number;
  checkedAt: string;
  statusCode: number | null;
  latencyMs: number | null;
  success: boolean;
  status: CheckStatus;
  errorType: CheckErrorType | string | null;
  errorMessage: string | null;
}

export interface EndpointMetrics {
  uptime: number;
  errorRate: number;
  averageLatencyMs: number | null;
  p95LatencyMs: number | null;
  totalChecks: number;
}

export interface EndpointWithLatestCheck extends Endpoint {
  latestCheck?: Check | null;
  metrics?: EndpointMetrics | null;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

export type StatusFilter = 'all' | 'up' | 'degraded' | 'down' | 'no_data';
