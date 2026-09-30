import React from 'react';
import { SummaryCard } from './summary-card';

interface SystemOverviewProps {
  totalEndpoints: number;
  upCount: number | null;
  degradedCount: number | null;
  downCount: number | null;
  isLoading?: boolean;
}

export function SystemOverview({
  totalEndpoints,
  upCount,
  degradedCount,
  downCount,
  isLoading = false,
}: SystemOverviewProps) {
  return (
    <section aria-label="System Overview" className="mb-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <SummaryCard
          label="Total Monitored"
          value={isLoading ? 0 : totalEndpoints}
          subtext="Configured API targets"
          variant="neutral"
          isLoading={isLoading}
        />
        <SummaryCard
          label="Operational (UP)"
          value={upCount !== null ? upCount : '--'}
          subtext={
            upCount !== null
              ? `${upCount} within latency threshold`
              : 'Requires probe evaluation'
          }
          variant="up"
          isLoading={isLoading}
        />
        <SummaryCard
          label="Degraded (Slow)"
          value={degradedCount !== null ? degradedCount : '--'}
          subtext={
            degradedCount !== null
              ? `${degradedCount} above latency threshold`
              : 'Requires probe evaluation'
          }
          variant="degraded"
          isLoading={isLoading}
        />
        <SummaryCard
          label="Failing (DOWN)"
          value={downCount !== null ? downCount : '--'}
          subtext={
            downCount !== null
              ? `${downCount} HTTP errors or timeouts`
              : 'Requires probe evaluation'
          }
          variant="down"
          isLoading={isLoading}
        />
      </div>
    </section>
  );
}
