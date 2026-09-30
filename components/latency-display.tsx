import React from 'react';

interface LatencyDisplayProps {
  latencyMs: number | null | undefined;
  latencyThresholdMs: number;
  isProbing?: boolean;
  showThreshold?: boolean;
  className?: string;
}

export function LatencyDisplay({
  latencyMs,
  latencyThresholdMs,
  isProbing = false,
  showThreshold = true,
  className = '',
}: LatencyDisplayProps) {
  if (isProbing) {
    return (
      <div className={`flex flex-col font-mono ${className}`}>
        <span className="text-zinc-400 text-xs animate-pulse">Probing...</span>
        {showThreshold && (
          <span className="text-zinc-500 text-[11px]">
            Threshold: {latencyThresholdMs} ms
          </span>
        )}
      </div>
    );
  }

  // Strict rule: null latency must NEVER be displayed as 0 ms
  if (latencyMs === null || latencyMs === undefined) {
    return (
      <div className={`flex flex-col font-mono ${className}`}>
        <span className="text-zinc-500 text-sm font-medium">--</span>
        {showThreshold && (
          <span className="text-zinc-500 text-[11px]">
            No response
          </span>
        )}
      </div>
    );
  }

  const isOverThreshold = latencyMs > latencyThresholdMs;
  const delta = latencyMs - latencyThresholdMs;

  return (
    <div className={`flex flex-col font-mono ${className}`}>
      <span
        className={`text-sm ${
          isOverThreshold ? 'text-amber-400 font-semibold' : 'text-zinc-200 font-medium'
        }`}
      >
        {latencyMs.toLocaleString()} ms
      </span>
      {showThreshold && (
        <span
          className={`text-[11px] ${
            isOverThreshold ? 'text-amber-500/80 font-medium' : 'text-zinc-500'
          }`}
        >
          Threshold: {latencyThresholdMs} ms{isOverThreshold ? ` (+${delta} ms)` : ''}
        </span>
      )}
    </div>
  );
}
