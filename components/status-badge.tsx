import React from 'react';
import type { CheckStatus } from '../types/dashboard';

interface StatusBadgeProps {
  status?: CheckStatus | 'no_data' | null;
  className?: string;
}

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  switch (status) {
    case 'up':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-semibold tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 ${className}`}
          aria-label="Health status: Operational"
        >
          <svg className="w-2 h-2 fill-current" viewBox="0 0 8 8" aria-hidden="true">
            <circle cx="4" cy="4" r="3" />
          </svg>
          UP
        </span>
      );

    case 'degraded':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-semibold tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/25 ${className}`}
          aria-label="Health status: Degraded response time"
        >
          <svg className="w-2.5 h-2.5 fill-current" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M5 1L9.5 9H0.5L5 1Z" />
          </svg>
          DEGRADED
        </span>
      );

    case 'down':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-semibold tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/25 ${className}`}
          aria-label="Health status: Service Down"
        >
          <svg className="w-2.5 h-2.5 stroke-current stroke-2 fill-none" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M2 2L8 8M8 2L2 8" />
          </svg>
          DOWN
        </span>
      );

    case 'no_data':
    default:
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-semibold tracking-wider bg-zinc-800/60 text-zinc-400 border border-zinc-700/50 ${className}`}
          aria-label="Health status: Awaiting initial check"
        >
          <svg className="w-2.5 h-2.5 stroke-current stroke-1.5 fill-none" viewBox="0 0 10 10" aria-hidden="true">
            <circle cx="5" cy="5" r="3.5" strokeDasharray="2 2" />
          </svg>
          NO DATA
        </span>
      );
  }
}
