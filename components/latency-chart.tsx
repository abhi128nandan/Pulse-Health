'use client';

import React from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Check } from '../types/dashboard';
import { ChartSkeleton } from './loading-skeleton';

interface LatencyChartProps {
  history: Check[];
  latencyThresholdMs: number;
  isLoading?: boolean;
}

interface ChartDataPoint {
  rawTimestamp: string;
  timeLabel: string;
  timestampMs: number;
  latencyMs: number | null;
  status: string;
  statusCode: number | null;
  errorType: string | null;
  errorMessage: string | null;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload: ChartDataPoint;
    value: number | null;
  }>;
  latencyThresholdMs: number;
}

function CustomTooltip({ active, payload, latencyThresholdMs }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const data = payload[0].payload;
  const isFailed = data.latencyMs === null;
  const isOverThreshold =
    data.latencyMs !== null && data.latencyMs > latencyThresholdMs;

  return (
    <div className="bg-zinc-900 border border-zinc-700/80 rounded-md p-3 shadow-xl text-xs font-mono">
      <div className="text-zinc-400 mb-1.5">{data.timeLabel}</div>

      <div className="flex items-center gap-2 mb-1">
        <span className="text-zinc-400">Status:</span>
        <span
          className={`font-semibold uppercase ${
            data.status === 'up'
              ? 'text-emerald-400'
              : data.status === 'degraded'
              ? 'text-amber-400'
              : 'text-rose-400'
          }`}
        >
          {data.status}
        </span>
        {data.statusCode && (
          <span className="text-zinc-400">({data.statusCode})</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-zinc-400">Latency:</span>
        {isFailed ? (
          <span className="text-rose-400 font-semibold">
            Failed ({data.errorType || 'No response'})
          </span>
        ) : (
          <span
            className={`font-semibold ${
              isOverThreshold ? 'text-amber-400' : 'text-zinc-100'
            }`}
          >
            {data.latencyMs} ms
            {isOverThreshold && (
              <span className="text-amber-500/80 ml-1 font-normal text-[11px]">
                (+{data.latencyMs! - latencyThresholdMs} ms)
              </span>
            )}
          </span>
        )}
      </div>

      {data.errorMessage && (
        <div className="text-[11px] text-zinc-500 mt-1 max-w-xs break-words">
          {data.errorMessage}
        </div>
      )}
    </div>
  );
}

export function LatencyChart({
  history,
  latencyThresholdMs,
  isLoading = false,
}: LatencyChartProps) {
  // Reverse history so it displays chronologically (oldest to newest)
  const chartData: ChartDataPoint[] = React.useMemo(() => {
    return [...history].reverse().map((check) => {
      const date = new Date(check.checkedAt);
      const isValid = !isNaN(date.getTime());
      const hours = isValid ? String(date.getHours()).padStart(2, '0') : '';
      const minutes = isValid ? String(date.getMinutes()).padStart(2, '0') : '';
      const seconds = isValid ? String(date.getSeconds()).padStart(2, '0') : '';
      const timeLabel = isValid ? `${hours}:${minutes}:${seconds}` : check.checkedAt;

      return {
        rawTimestamp: check.checkedAt,
        timeLabel,
        timestampMs: isValid ? date.getTime() : 0,
        latencyMs: check.latencyMs,
        status: check.status,
        statusCode: check.statusCode,
        errorType: check.errorType,
        errorMessage: check.errorMessage,
      };
    });
  }, [history]);

  const { selectedTicks, formatTick } = React.useMemo(() => {
    if (chartData.length === 0) {
      return { selectedTicks: [] as string[], formatTick: (val: string) => val };
    }

    const firstTime = chartData[0].timestampMs;
    const lastTime = chartData[chartData.length - 1].timestampMs;
    const timeRangeMs = Math.max(0, lastTime - firstTime);

    // Include date if points span 24 hours or more
    const includeDate = timeRangeMs >= 24 * 60 * 60 * 1000;
    // Default to including seconds if total range is under 1 hour
    let includeSeconds = !includeDate && timeRangeMs < 60 * 60 * 1000;

    const createFormatter = (withSeconds: boolean) => (rawTimestamp: string) => {
      const date = new Date(rawTimestamp);
      if (isNaN(date.getTime())) return rawTimestamp;

      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');

      if (includeDate) {
        const month = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        return `${month} ${hours}:${minutes}`;
      }

      if (withSeconds) {
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${hours}:${minutes}:${seconds}`;
      }

      return `${hours}:${minutes}`;
    };

    // Select ticks using actual checkedAt timestamps
    let chosenIndices: number[] = [];

    if (chartData.length <= 5) {
      chosenIndices = chartData.map((_, i) => i);
    } else {
      // Select 4-5 ticks evenly across the actual time progression
      const targetCount = Math.min(5, chartData.length);
      const indexSet = new Set<number>();
      indexSet.add(0);
      indexSet.add(chartData.length - 1);

      if (timeRangeMs > 0) {
        for (let i = 1; i < targetCount - 1; i++) {
          const targetTime = firstTime + (i / (targetCount - 1)) * timeRangeMs;
          let closestIdx = -1;
          let minDiff = Infinity;

          for (let j = 0; j < chartData.length; j++) {
            const diff = Math.abs(chartData[j].timestampMs - targetTime);
            if (diff < minDiff) {
              minDiff = diff;
              closestIdx = j;
            }
          }

          if (closestIdx !== -1) {
            indexSet.add(closestIdx);
          }
        }
      } else {
        for (let i = 1; i < targetCount - 1; i++) {
          indexSet.add(Math.round((i * (chartData.length - 1)) / (targetCount - 1)));
        }
      }

      chosenIndices = Array.from(indexSet).sort((a, b) => a - b);
    }

    const ticks = chosenIndices.map((idx) => chartData[idx].rawTimestamp);

    // If not including seconds, verify that formatted tick labels are not duplicates
    if (!includeSeconds && !includeDate) {
      const formatted = ticks.map(createFormatter(false));
      if (new Set(formatted).size < formatted.length) {
        includeSeconds = true;
      }
    }

    return {
      selectedTicks: ticks,
      formatTick: createFormatter(includeSeconds),
    };
  }, [chartData]);

  if (isLoading) {
    return <ChartSkeleton />;
  }

  if (history.length === 0) {
    return (
      <div className="h-[260px] w-full rounded-lg bg-[#121215] border border-zinc-800 p-6 flex flex-col items-center justify-center text-center">
        <div className="text-zinc-400 text-xs font-medium mb-1">
          No Timeseries Telemetry
        </div>
        <div className="text-zinc-500 text-[11px] max-w-sm">
          No health checks have been recorded yet. Click &quot;Check Now&quot; to probe this endpoint and record the initial latency observation.
        </div>
      </div>
    );
  }

  const validLatencies = chartData
    .map((d) => d.latencyMs)
    .filter((l): l is number => typeof l === 'number' && !isNaN(l));

  const maxLatency = validLatencies.length > 0 ? Math.max(...validLatencies) : 0;
  const yDomainMax = Math.max(maxLatency * 1.25, latencyThresholdMs * 1.35, 100);

  return (
    <div className="w-full rounded-lg bg-[#121215] border border-zinc-800 p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-semibold text-zinc-200 tracking-wide uppercase">
          Response Latency & Threshold
        </div>
        <div className="flex items-center gap-3 text-[11px] font-mono">
          <span className="flex items-center gap-1.5 text-zinc-400">
            <span className="w-3 h-0.5 bg-indigo-500 inline-block" /> Latency (ms)
          </span>
          <span className="flex items-center gap-1.5 text-amber-400">
            <span className="w-3 h-0.5 border-b border-dashed border-amber-500 inline-block" />
            Threshold: {latencyThresholdMs} ms
          </span>
        </div>
      </div>

      <div className="h-[210px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
            <defs>
              <linearGradient id="latencyGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />

            <XAxis
              dataKey="rawTimestamp"
              stroke="#52525b"
              fontSize={10}
              tickLine={false}
              axisLine={{ stroke: '#27272a' }}
              ticks={selectedTicks}
              interval={0}
              tickFormatter={formatTick}
            />

            <YAxis
              stroke="#52525b"
              fontSize={10}
              tickLine={false}
              axisLine={{ stroke: '#27272a' }}
              domain={[0, Math.ceil(yDomainMax)]}
              unit="ms"
            />

            {/* Latency Threshold Reference Line */}
            <ReferenceLine
              y={latencyThresholdMs}
              stroke="#f59e0b"
              strokeDasharray="4 4"
              strokeWidth={1.5}
            />

            <Tooltip
              content={<CustomTooltip latencyThresholdMs={latencyThresholdMs} />}
            />

            {/* Latency line with connectNulls={false} so null latencies do NOT become 0 */}
            <Area
              type="monotone"
              dataKey="latencyMs"
              stroke="#6366f1"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#latencyGradient)"
              connectNulls={false}
              isAnimationActive={false}
              dot={(props: { cx?: number; cy?: number; payload?: ChartDataPoint }) => {
                const { cx, cy, payload } = props;
                if (!cx || !cy || !payload) return null as unknown as React.ReactElement;

                // For failed/down checks with null latency, render a distinct failure marker at the bottom
                if (payload.latencyMs === null) {
                  return (
                    <g key={`${cx}-${cy}`} className="cursor-pointer">
                      <circle cx={cx} cy={180} r={4} fill="#ef4444" />
                      <line x1={cx - 2} y1={178} x2={cx + 2} y2={182} stroke="#ffffff" strokeWidth={1} />
                      <line x1={cx + 2} y1={178} x2={cx - 2} y2={182} stroke="#ffffff" strokeWidth={1} />
                    </g>
                  );
                }

                // If latency is degraded, render amber marker
                if (payload.latencyMs > latencyThresholdMs) {
                  return (
                    <circle
                      key={`${cx}-${cy}`}
                      cx={cx}
                      cy={cy}
                      r={3.5}
                      fill="#f59e0b"
                      stroke="#18181b"
                      strokeWidth={1.5}
                    />
                  );
                }

                return (
                  <circle
                    key={`${cx}-${cy}`}
                    cx={cx}
                    cy={cy}
                    r={2.5}
                    fill="#6366f1"
                    stroke="#18181b"
                    strokeWidth={1}
                  />
                );
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
