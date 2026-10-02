'use client';

import React from 'react';

export interface SummaryCardProps {
  label: string;
  value: string | number;
  subtext: string;
  variant?: 'neutral' | 'up' | 'degraded' | 'down';
  isLoading?: boolean;
}

const VARIANT_COLORS: Record<'neutral' | 'up' | 'degraded' | 'down', string> = {
  neutral: 'text-zinc-100',
  up: 'text-emerald-400',
  degraded: 'text-amber-400',
  down: 'text-rose-400',
};

const DOT_COLORS: Record<'neutral' | 'up' | 'degraded' | 'down', string> = {
  neutral: 'bg-zinc-500',
  up: 'bg-emerald-500',
  degraded: 'bg-amber-500',
  down: 'bg-rose-500',
};

export function SummaryCard({
  label,
  value,
  subtext,
  variant = 'neutral',
  isLoading = false,
}: SummaryCardProps) {
  const isUnavailable = value === '--';
  const colorClass = VARIANT_COLORS[variant] ?? VARIANT_COLORS.neutral;
  const valueColor = isUnavailable
    ? 'text-zinc-500 font-mono font-normal'
    : `${colorClass} font-semibold`;

  const dotColor = DOT_COLORS[variant] ?? DOT_COLORS.neutral;

  return (
    <div className="flex flex-col p-4 rounded-lg bg-[#121215] border border-zinc-800 hover:border-zinc-700/70 transition-colors duration-150">
      <div className="flex items-center justify-between text-[11px] font-medium text-zinc-400 tracking-wider mb-2">
        <span>{label}</span>
        <span className={`w-2 h-2 rounded-full ${dotColor} shrink-0`} aria-hidden="true" />
      </div>

      {isLoading ? (
        <div className="h-8 w-16 bg-zinc-800/60 rounded animate-pulse my-0.5" />
      ) : (
        <div className={`text-2xl tracking-tight ${valueColor} my-0.5`}>
          {value}
        </div>
      )}

      <div className="text-[11px] text-zinc-500 mt-1 truncate" title={subtext}>
        {subtext}
      </div>
    </div>
  );
}

