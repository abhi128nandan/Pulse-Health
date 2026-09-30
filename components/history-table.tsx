import React from 'react';
import type { Check } from '../types/dashboard';
import { HistoryRowSkeleton } from './loading-skeleton';
import { StatusBadge } from './status-badge';

interface HistoryTableProps {
  checks: Check[];
  latencyThresholdMs: number;
  isLoading?: boolean;
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;

  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return `${Math.max(1, diffSec)}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

function getHttpStatusText(statusCode: number | null): string {
  if (!statusCode) return '--';
  const statusTexts: Record<number, string> = {
    200: 'OK',
    201: 'Created',
    204: 'No Content',
    301: 'Moved',
    302: 'Found',
    304: 'Not Modified',
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    408: 'Request Timeout',
    429: 'Too Many Requests',
    500: 'Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout',
  };
  return `${statusCode} ${statusTexts[statusCode] || ''}`.trim();
}

export function HistoryTable({
  checks,
  latencyThresholdMs,
  isLoading = false,
}: HistoryTableProps) {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-[#121215] overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/60 text-zinc-400 font-medium">
              <th className="py-2.5 px-3">TIMESTAMP</th>
              <th className="py-2.5 px-3">STATUS</th>
              <th className="py-2.5 px-3">HTTP CODE</th>
              <th className="py-2.5 px-3 text-right">LATENCY</th>
              <th className="py-2.5 px-3">DIAGNOSTICS</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, i) => (
              <HistoryRowSkeleton key={i} />
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (checks.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-[#121215] p-8 text-center text-xs text-zinc-500 font-mono">
        No health check records found for this endpoint.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-[#121215] overflow-hidden shadow-xs">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs font-mono">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/70 text-zinc-400 font-medium text-[11px] tracking-wider">
              <th scope="col" className="py-2.5 px-3">TIMESTAMP</th>
              <th scope="col" className="py-2.5 px-3">STATUS</th>
              <th scope="col" className="py-2.5 px-3">HTTP CODE</th>
              <th scope="col" className="py-2.5 px-3 text-right">LATENCY</th>
              <th scope="col" className="py-2.5 px-3">DIAGNOSTICS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {checks.map((check) => {
              const isOver =
                check.latencyMs !== null &&
                check.latencyMs > latencyThresholdMs;

              return (
                <tr key={check.id} className="hover:bg-zinc-900/60 transition-colors">
                  {/* Timestamp */}
                  <td
                    className="py-2.5 px-3 text-zinc-300 whitespace-nowrap"
                    title={check.checkedAt}
                  >
                    {formatRelativeTime(check.checkedAt)}
                  </td>

                  {/* Status Badge */}
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <StatusBadge status={check.status} />
                  </td>

                  {/* HTTP Code */}
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    {check.statusCode ? (
                      <span
                        className={`inline-flex px-1.5 py-0.5 rounded text-[11px] ${
                          check.statusCode >= 200 && check.statusCode < 400
                            ? 'bg-zinc-800 text-zinc-300'
                            : 'bg-rose-500/15 text-rose-300 font-semibold'
                        }`}
                      >
                        {getHttpStatusText(check.statusCode)}
                      </span>
                    ) : (
                      <span className="text-zinc-500 text-[11px]">--</span>
                    )}
                  </td>

                  {/* Latency */}
                  <td className="py-2.5 px-3 text-right whitespace-nowrap">
                    {check.latencyMs !== null ? (
                      <span
                        className={
                          isOver ? 'text-amber-400 font-semibold' : 'text-zinc-200'
                        }
                      >
                        {check.latencyMs.toLocaleString()} ms
                      </span>
                    ) : (
                      <span className="text-zinc-500">--</span>
                    )}
                  </td>

                  {/* Error & Diagnostics */}
                  <td className="py-2.5 px-3 text-zinc-400">
                    <div className="flex items-center gap-2 max-w-sm xl:max-w-md">
                      {check.errorType && (
                        <span className="shrink-0 px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/60 text-[10px] lowercase font-mono">
                          {check.errorType.toLowerCase()}
                        </span>
                      )}
                      <span
                        className="truncate text-[11px] text-zinc-400"
                        title={check.errorMessage || (check.status === 'up' ? 'Operational' : isOver ? 'Exceeds latency threshold' : '')}
                      >
                        {check.errorMessage || (check.status === 'up' ? 'Operational' : isOver ? 'Exceeds latency threshold' : '')}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
