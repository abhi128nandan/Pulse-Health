import React from 'react';

export function EndpointRowSkeleton() {
  return (
    <tr className="border-b border-zinc-800/80 animate-pulse">
      <td className="py-3 px-4">
        <div className="h-4 w-36 bg-zinc-800 rounded mb-1" />
        <div className="h-3 w-52 bg-zinc-800/60 rounded" />
      </td>
      <td className="py-3 px-4">
        <div className="h-5 w-16 bg-zinc-800/80 rounded" />
      </td>
      <td className="py-3 px-4">
        <div className="h-4 w-14 bg-zinc-800 rounded mb-1" />
        <div className="h-3 w-24 bg-zinc-800/60 rounded" />
      </td>
      <td className="py-3 px-4">
        <div className="h-4 w-12 bg-zinc-800/70 rounded" />
      </td>
      <td className="py-3 px-4">
        <div className="h-4 w-12 bg-zinc-800/70 rounded" />
      </td>
      <td className="py-3 px-4 text-right">
        <div className="inline-block h-6 w-20 bg-zinc-800 rounded" />
      </td>
    </tr>
  );
}

export function MetricCardSkeleton() {
  return (
    <div className="p-3.5 rounded-lg bg-[#121215] border border-zinc-800 animate-pulse">
      <div className="h-3 w-20 bg-zinc-800 rounded mb-2" />
      <div className="h-6 w-16 bg-zinc-800/80 rounded mb-1" />
      <div className="h-2.5 w-24 bg-zinc-800/50 rounded" />
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="h-[260px] w-full rounded-lg bg-[#121215] border border-zinc-800 p-4 flex flex-col justify-between animate-pulse">
      <div className="flex justify-between items-center">
        <div className="h-4 w-32 bg-zinc-800 rounded" />
        <div className="h-3 w-24 bg-zinc-800/60 rounded" />
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="text-zinc-600 text-xs font-mono">Loading telemetry timeseries...</div>
      </div>
      <div className="flex justify-between pt-2 border-t border-zinc-800/50">
        <div className="h-2.5 w-8 bg-zinc-800/50 rounded" />
        <div className="h-2.5 w-8 bg-zinc-800/50 rounded" />
        <div className="h-2.5 w-8 bg-zinc-800/50 rounded" />
        <div className="h-2.5 w-8 bg-zinc-800/50 rounded" />
      </div>
    </div>
  );
}

export function HistoryRowSkeleton() {
  return (
    <tr className="border-b border-zinc-800/60 animate-pulse">
      <td className="py-2.5 px-3">
        <div className="h-3 w-16 bg-zinc-800 rounded" />
      </td>
      <td className="py-2.5 px-3">
        <div className="h-4 w-14 bg-zinc-800/80 rounded" />
      </td>
      <td className="py-2.5 px-3">
        <div className="h-3.5 w-12 bg-zinc-800/60 rounded" />
      </td>
      <td className="py-2.5 px-3 text-right">
        <div className="h-3.5 w-14 bg-zinc-800 ml-auto rounded" />
      </td>
      <td className="py-2.5 px-3">
        <div className="h-3 w-32 bg-zinc-800/50 rounded" />
      </td>
    </tr>
  );
}
