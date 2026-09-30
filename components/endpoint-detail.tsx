'use client';

import React from 'react';
import type { Check, EndpointWithLatestCheck, EndpointMetrics } from '../types/dashboard';
import { CheckButton } from './check-button';
import { HistoryTable } from './history-table';
import { LatencyChart } from './latency-chart';
import { MetricsGrid } from './metrics-grid';
import { StatusBadge } from './status-badge';

interface EndpointDetailProps {
  endpoint: EndpointWithLatestCheck;
  metrics: EndpointMetrics | null;
  history: Check[];
  isLoadingMetrics?: boolean;
  isLoadingHistory?: boolean;
  isProbing?: boolean;
  onCheck: () => void;
  onDelete: () => void;
  onBack: () => void;
}

export function EndpointDetail({
  endpoint,
  metrics,
  history,
  isLoadingMetrics = false,
  isLoadingHistory = false,
  isProbing = false,
  onCheck,
  onDelete,
  onBack,
}: EndpointDetailProps) {
  const currentStatus = endpoint.latestCheck ? endpoint.latestCheck.status : 'no_data';
  const lastEvaluated = endpoint.latestCheck?.checkedAt
    ? new Date(endpoint.latestCheck.checkedAt).toLocaleTimeString()
    : null;

  return (
    <div className="flex flex-col w-full animate-in fade-in duration-200">
      {/* Navigation & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 mb-5 border-b border-zinc-800/80">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="group inline-flex items-center gap-1.5 text-xs font-mono text-zinc-400 hover:text-zinc-200 mb-2.5 transition-colors cursor-pointer focus-visible:outline-none focus-visible:text-zinc-100"
          >
            <svg
              className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5 duration-150"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            <span>Back to Overview</span>
          </button>

          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl font-semibold tracking-tight text-zinc-100">
              {endpoint.name}
            </h2>
            <StatusBadge status={currentStatus} />
          </div>

          <div className="flex items-center gap-2 mt-2 flex-wrap text-xs font-mono">
            <span className="text-zinc-300 bg-zinc-900/80 px-2 py-0.5 rounded border border-zinc-800" title={endpoint.url}>
              {endpoint.url}
            </span>
            <span className="text-zinc-400 bg-zinc-900/80 px-2 py-0.5 rounded border border-zinc-800">
              Threshold: {endpoint.latencyThresholdMs} ms
            </span>
            {lastEvaluated && (
              <span className="text-zinc-400 bg-zinc-900/80 px-2 py-0.5 rounded border border-zinc-800">
                Last checked: {lastEvaluated}
              </span>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 shrink-0">
          <CheckButton onCheck={onCheck} isProbing={isProbing} size="md" />

          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete ${endpoint.name}`}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-zinc-700 bg-zinc-900/80 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 hover:border-rose-500/40 text-xs font-medium transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            <span>Delete</span>
          </button>
        </div>
      </div>

      {/* 24-Hour Reliability Metrics */}
      <div>
        <h3 className="text-xs font-semibold text-zinc-400 mb-2.5 tracking-wider">
          24-HOUR AVAILABILITY & RELIABILITY METRICS
        </h3>
        <MetricsGrid metrics={metrics} isLoading={isLoadingMetrics} />
      </div>

      {/* Latency vs Threshold Chart */}
      <LatencyChart
        history={history}
        latencyThresholdMs={endpoint.latencyThresholdMs}
        isLoading={isLoadingHistory}
      />

      {/* Recent Check History Table */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-xs font-semibold text-zinc-400 tracking-wider">
            RECENT CHECK AUDIT LOG
          </h3>
          <span className="text-[11px] font-mono text-zinc-500">
            Last {history.length} checks
          </span>
        </div>
        <HistoryTable
          checks={history}
          latencyThresholdMs={endpoint.latencyThresholdMs}
          isLoading={isLoadingHistory}
        />
      </div>
    </div>
  );
}
