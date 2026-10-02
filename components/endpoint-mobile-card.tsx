import React from 'react';
import type { EndpointWithLatestCheck } from '../types/dashboard';
import { CheckButton } from './check-button';
import { LatencyDisplay } from './latency-display';
import { StatusBadge } from './status-badge';

export interface EndpointMobileCardProps {
  endpoint: EndpointWithLatestCheck;
  isSelected?: boolean;
  isProbing?: boolean;
  onSelect: () => void;
  onCheck: () => void;
  onDelete: () => void;
}

export function EndpointMobileCard({
  endpoint,
  isSelected = false,
  isProbing = false,
  onSelect,
  onCheck,
  onDelete,
}: EndpointMobileCardProps) {
  const currentStatus = endpoint.latestCheck ? endpoint.latestCheck.status : 'no_data';
  const currentLatency = endpoint.latestCheck ? endpoint.latestCheck.latencyMs : null;

  return (
    <div
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`flex flex-col p-3.5 rounded-lg border mb-2.5 cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500 ${
        isSelected
          ? 'bg-zinc-900 border-indigo-500'
          : 'bg-[#121215] border-zinc-800 hover:border-zinc-700'
      }`}
    >
      {/* Header: Name, URL & Action Buttons */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-zinc-100 truncate group-hover:text-white">
            {endpoint.name}
          </div>
          <div className="text-xs font-mono text-zinc-400 truncate mt-0.5" title={endpoint.url}>
            {endpoint.url}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          <CheckButton onCheck={onCheck} isProbing={isProbing} size="sm" />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            aria-label={`Delete ${endpoint.name}`}
            className="p-1.5 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-rose-500 cursor-pointer"
            title="Delete endpoint"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>
      </div>

      {/* Status, Latency & Threshold */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-2.5 border-t border-zinc-800/60 text-xs font-mono">
        <div className="flex items-center gap-1.5">
          <span className="text-zinc-500 text-[11px]">Status:</span>
          <StatusBadge status={currentStatus} />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-zinc-500 text-[11px]">Latency:</span>
          <LatencyDisplay
            latencyMs={currentLatency}
            latencyThresholdMs={endpoint.latencyThresholdMs}
            isProbing={isProbing}
            showThreshold={false}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-zinc-500 text-[11px]">Threshold:</span>
          <span className="text-zinc-400">{endpoint.latencyThresholdMs} ms</span>
        </div>
      </div>

      {/* 24h Metrics: Uptime & P95 */}
      <div className="flex items-center gap-4 mt-2 text-xs font-mono text-zinc-400">
        <div>
          <span className="text-zinc-500 text-[11px]">24h Uptime: </span>
          <span className="text-zinc-200">
            {endpoint.metrics && endpoint.metrics.totalChecks > 0
              ? `${endpoint.metrics.uptime.toFixed(1)}%`
              : '--'}
          </span>
        </div>
        <div>
          <span className="text-zinc-500 text-[11px]">24h P95: </span>
          <span className="text-zinc-200">
            {endpoint.metrics && endpoint.metrics.p95LatencyMs !== null
              ? `${Math.round(endpoint.metrics.p95LatencyMs)} ms`
              : '--'}
          </span>
        </div>
      </div>
    </div>
  );
}
