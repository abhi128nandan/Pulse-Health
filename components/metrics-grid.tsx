import React from 'react';
import type { EndpointMetrics } from '../types/dashboard';
import { MetricCardSkeleton } from './loading-skeleton';

interface MetricsGridProps {
  metrics: EndpointMetrics | null | undefined;
  isLoading?: boolean;
}

export function MetricsGrid({ metrics, isLoading = false }: MetricsGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <MetricCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  const hasChecks = metrics && metrics.totalChecks > 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      {/* 24h Uptime */}
      <div className="p-4 rounded-lg bg-[#121215] border border-zinc-800 hover:border-zinc-700/60 transition-colors duration-150">
        <div className="text-[11px] font-medium text-zinc-400 tracking-wider">24H UPTIME</div>
        <div
          className={`text-2xl font-semibold font-mono tracking-tight my-1 ${
            hasChecks ? 'text-zinc-100' : 'text-zinc-500 font-normal'
          }`}
        >
          {hasChecks ? `${metrics.uptime.toFixed(2)}%` : '--'}
        </div>
        <div className="text-[11px] text-zinc-500 truncate">
          {hasChecks ? `${metrics.totalChecks.toLocaleString()} checks evaluated` : 'No checks in 24h window'}
        </div>
      </div>

      {/* 24h Error Rate */}
      <div className="p-4 rounded-lg bg-[#121215] border border-zinc-800 hover:border-zinc-700/60 transition-colors duration-150">
        <div className="text-[11px] font-medium text-zinc-400 tracking-wider">24H ERROR RATE</div>
        <div
          className={`text-2xl font-semibold font-mono tracking-tight my-1 ${
            !hasChecks
              ? 'text-zinc-500 font-normal'
              : metrics.errorRate > 0
              ? 'text-amber-400'
              : 'text-zinc-100'
          }`}
        >
          {hasChecks ? `${metrics.errorRate.toFixed(2)}%` : '--'}
        </div>
        <div className="text-[11px] text-zinc-500 truncate">
          {hasChecks && metrics.errorRate > 0
            ? 'Failed or timed out probes'
            : 'Zero failure events'}
        </div>
      </div>

      {/* Average Latency */}
      <div className="p-4 rounded-lg bg-[#121215] border border-zinc-800 hover:border-zinc-700/60 transition-colors duration-150">
        <div className="text-[11px] font-medium text-zinc-400 tracking-wider">AVERAGE LATENCY</div>
        <div
          className={`text-2xl font-semibold font-mono tracking-tight my-1 ${
            hasChecks && metrics.averageLatencyMs !== null ? 'text-zinc-100' : 'text-zinc-500 font-normal'
          }`}
        >
          {hasChecks && metrics.averageLatencyMs !== null
            ? `${Math.round(metrics.averageLatencyMs)} ms`
            : '--'}
        </div>
        <div className="text-[11px] text-zinc-500 truncate">
          {hasChecks && metrics.averageLatencyMs !== null
            ? 'Successful probes mean'
            : 'No valid latency data'}
        </div>
      </div>

      {/* P95 Latency */}
      <div className="p-4 rounded-lg bg-[#121215] border border-zinc-800 hover:border-zinc-700/60 transition-colors duration-150">
        <div className="text-[11px] font-medium text-zinc-400 tracking-wider">P95 LATENCY</div>
        <div
          className={`text-2xl font-semibold font-mono tracking-tight my-1 ${
            hasChecks && metrics.p95LatencyMs !== null ? 'text-zinc-100' : 'text-zinc-500 font-normal'
          }`}
        >
          {hasChecks && metrics.p95LatencyMs !== null
            ? `${Math.round(metrics.p95LatencyMs)} ms`
            : '--'}
        </div>
        <div className="text-[11px] text-zinc-500 truncate">
          {hasChecks && metrics.p95LatencyMs !== null
            ? 'Nearest-rank 95th percentile'
            : 'No valid latency data'}
        </div>
      </div>
    </div>
  );
}
