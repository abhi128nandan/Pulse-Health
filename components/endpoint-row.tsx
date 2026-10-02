import React from 'react';
import type { EndpointWithLatestCheck } from '../types/dashboard';
import { CheckButton } from './check-button';
import { LatencyDisplay } from './latency-display';
import { StatusBadge } from './status-badge';

interface EndpointRowProps {
  endpoint: EndpointWithLatestCheck;
  isSelected?: boolean;
  isProbing?: boolean;
  onSelect: () => void;
  onCheck: () => void;
  onDelete: () => void;
}

export function EndpointRow({
  endpoint,
  isSelected = false,
  isProbing = false,
  onSelect,
  onCheck,
  onDelete,
}: EndpointRowProps) {
  const currentStatus = endpoint.latestCheck ? endpoint.latestCheck.status : 'no_data';
  const currentLatency = endpoint.latestCheck ? endpoint.latestCheck.latencyMs : null;

  return (
    <tr
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`group cursor-pointer border-b border-zinc-800/80 transition-colors duration-150 focus-visible:outline-none focus-visible:bg-zinc-900/60 focus-visible:ring-1 focus-visible:ring-indigo-500/50 ${
        isSelected
          ? 'bg-zinc-900/90 border-l-2 border-l-indigo-500'
          : 'hover:bg-zinc-900/40 bg-transparent'
      }`}
    >
      {/* Endpoint Name & Target URL */}
      <td className="py-3 px-4">
        <div className="flex flex-col">
          <span className="text-sm font-medium text-zinc-100 group-hover:text-white transition-colors duration-150">
            {endpoint.name}
          </span>
          <span
            className="text-xs font-mono text-zinc-400 truncate max-w-xs xl:max-w-md mt-0.5"
            title={endpoint.url}
          >
            {endpoint.url}
          </span>
        </div>
      </td>

      {/* Status Badge */}
      <td className="py-3 px-4 whitespace-nowrap">
        <StatusBadge status={currentStatus} />
      </td>

      {/* Latency vs. Threshold */}
      <td className="py-3 px-4 whitespace-nowrap">
        <LatencyDisplay
          latencyMs={currentLatency}
          latencyThresholdMs={endpoint.latencyThresholdMs}
          isProbing={isProbing}
        />
      </td>

      {/* 24h Availability Uptime */}
      <td className="py-3 px-4 whitespace-nowrap font-mono text-xs text-zinc-300">
        {endpoint.metrics && endpoint.metrics.totalChecks > 0 ? (
          <span>{endpoint.metrics.uptime.toFixed(1)}%</span>
        ) : (
          <span className="text-zinc-500">--</span>
        )}
      </td>

      {/* 24h P95 Latency */}
      <td className="py-3 px-4 whitespace-nowrap font-mono text-xs text-zinc-300">
        {endpoint.metrics && endpoint.metrics.p95LatencyMs !== null ? (
          <span>{Math.round(endpoint.metrics.p95LatencyMs)} ms</span>
        ) : (
          <span className="text-zinc-500">--</span>
        )}
      </td>

      {/* Action Buttons */}
      <td className="py-3 px-4 whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-1.5">
          <CheckButton onCheck={onCheck} isProbing={isProbing} />

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
      </td>
    </tr>
  );
}
