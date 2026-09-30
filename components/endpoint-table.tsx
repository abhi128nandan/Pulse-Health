import React from 'react';
import type { EndpointWithLatestCheck } from '../types/dashboard';
import { EmptyState } from './empty-state';
import { EndpointRow } from './endpoint-row';
import { EndpointMobileCard } from './endpoint-mobile-card';
import { EndpointRowSkeleton } from './loading-skeleton';

interface EndpointTableProps {
  endpoints: EndpointWithLatestCheck[];
  selectedId: number | null;
  probingIds: Set<number>;
  onSelect: (id: number) => void;
  onCheck: (id: number) => void;
  onDelete: (endpoint: EndpointWithLatestCheck) => void;
  isLoading?: boolean;
  onAddEndpoint: () => void;
  hasActiveFilters?: boolean;
  onClearFilters?: () => void;
}

export function EndpointTable({
  endpoints,
  selectedId,
  probingIds,
  onSelect,
  onCheck,
  onDelete,
  isLoading = false,
  onAddEndpoint,
  hasActiveFilters = false,
  onClearFilters,
}: EndpointTableProps) {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-[#121215] overflow-hidden">
        <div className="hidden md:block">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/60 text-zinc-400 font-medium">
                <th className="py-2.5 px-4">ENDPOINT</th>
                <th className="py-2.5 px-4">STATUS</th>
                <th className="py-2.5 px-4">LATENCY / THRESHOLD</th>
                <th className="py-2.5 px-4">24H UPTIME</th>
                <th className="py-2.5 px-4">24H P95</th>
                <th className="py-2.5 px-4 text-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 4 }).map((_, i) => (
                <EndpointRowSkeleton key={i} />
              ))}
            </tbody>
          </table>
        </div>
        <div className="md:hidden p-3 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 bg-zinc-900/80 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (endpoints.length === 0) {
    if (hasActiveFilters) {
      return (
        <EmptyState
          type="no-filtered-results"
          onAction={onClearFilters}
        />
      );
    }
    return (
      <EmptyState
        type="no-endpoints"
        onAction={onAddEndpoint}
      />
    );
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-[#121215] overflow-hidden shadow-xs">
      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/70 text-zinc-400 font-medium text-[11px]">
              <th scope="col" className="py-2.5 px-4 font-medium tracking-wider">ENDPOINT</th>
              <th scope="col" className="py-2.5 px-4 font-medium tracking-wider">STATUS</th>
              <th scope="col" className="py-2.5 px-4 font-medium tracking-wider">LATENCY / THRESHOLD</th>
              <th scope="col" className="py-2.5 px-4 font-medium tracking-wider">24H UPTIME</th>
              <th scope="col" className="py-2.5 px-4 font-medium tracking-wider">24H P95</th>
              <th scope="col" className="py-2.5 px-4 font-medium tracking-wider text-right">ACTIONS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {endpoints.map((endpoint) => (
              <EndpointRow
                key={endpoint.id}
                endpoint={endpoint}
                isSelected={selectedId === endpoint.id}
                isProbing={probingIds.has(endpoint.id)}
                onSelect={() => onSelect(endpoint.id)}
                onCheck={() => onCheck(endpoint.id)}
                onDelete={() => onDelete(endpoint)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Stacked Card View */}
      <div className="md:hidden p-2.5">
        {endpoints.map((endpoint) => (
          <EndpointMobileCard
            key={endpoint.id}
            endpoint={endpoint}
            isSelected={selectedId === endpoint.id}
            isProbing={probingIds.has(endpoint.id)}
            onSelect={() => onSelect(endpoint.id)}
            onCheck={() => onCheck(endpoint.id)}
            onDelete={() => onDelete(endpoint)}
          />
        ))}
      </div>
    </div>
  );
}
