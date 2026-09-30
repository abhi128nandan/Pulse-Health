import React from 'react';

export type EmptyStateType =
  | 'no-endpoints'
  | 'no-checks'
  | 'no-filtered-results'
  | 'no-telemetry-period'
  | 'no-valid-latency';

interface EmptyStateProps {
  type: EmptyStateType;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({ type, onAction, className = '' }: EmptyStateProps) {
  switch (type) {
    case 'no-endpoints':
      return (
        <div className={`flex flex-col items-center justify-center p-12 text-center rounded-lg border border-dashed border-zinc-800 bg-[#121215]/50 ${className}`}>
          <div className="w-10 h-10 rounded-full bg-zinc-800/80 flex items-center justify-center text-zinc-400 mb-3">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
              <path d="M2 12h20" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-zinc-200">No Monitored Endpoints</h3>
          <p className="text-xs text-zinc-400 max-w-sm mt-1 mb-4 leading-relaxed">
            PulseCheck is not currently probing any APIs. Add your first HTTP or HTTPS target to begin tracking availability and response latency.
          </p>
          {onAction && (
            <button
              type="button"
              onClick={onAction}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-zinc-100 text-zinc-950 text-xs font-medium hover:bg-white active:bg-zinc-200 active:scale-[0.98] transition-all shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Add First Endpoint</span>
            </button>
          )}
        </div>
      );

    case 'no-checks':
      return (
        <div className={`flex flex-col items-center justify-center p-8 text-center rounded-lg border border-dashed border-zinc-800 bg-zinc-900/30 ${className}`}>
          <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 mb-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" strokeDasharray="3 3" />
              <polyline points="12 6 12 12 14 14" />
            </svg>
          </div>
          <h4 className="text-xs font-medium text-zinc-200">Awaiting Initial Check</h4>
          <p className="text-[11px] text-zinc-500 max-w-xs mt-0.5 mb-3">
            This endpoint has been registered, but no health checks have been performed yet.
          </p>
          {onAction && (
            <button
              type="button"
              onClick={onAction}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700 transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              Run Initial Check
            </button>
          )}
        </div>
      );

    case 'no-filtered-results':
      return (
        <div className={`flex flex-col items-center justify-center p-10 text-center rounded-lg border border-zinc-800 bg-[#121215] ${className}`}>
          <h4 className="text-xs font-medium text-zinc-300">No Matching Endpoints</h4>
          <p className="text-[11px] text-zinc-500 mt-1 mb-3">
            No endpoints matched the current search query and status filter.
          </p>
          {onAction && (
            <button
              type="button"
              onClick={onAction}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-medium underline underline-offset-2 transition-colors cursor-pointer"
            >
              Clear filters
            </button>
          )}
        </div>
      );

    case 'no-telemetry-period':
      return (
        <div className={`flex flex-col items-center justify-center p-8 text-center rounded-lg border border-zinc-800/80 bg-[#121215] text-zinc-500 text-xs font-mono ${className}`}>
          <p className="text-zinc-400 font-medium">No Telemetry in Selected Period</p>
          <p className="text-[11px] text-zinc-500 mt-1">No health checks recorded in the 24-hour observation window.</p>
        </div>
      );

    case 'no-valid-latency':
      return (
        <div className={`flex flex-col items-center justify-center p-8 text-center rounded-lg border border-zinc-800/80 bg-[#121215] text-zinc-500 text-xs font-mono ${className}`}>
          <p className="text-zinc-400 font-medium">No Valid Latency Telemetry</p>
          <p className="text-[11px] text-zinc-500 mt-1">All recent probes failed or timed out without responding.</p>
        </div>
      );
  }
}
