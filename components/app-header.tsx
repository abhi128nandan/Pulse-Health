import React from 'react';

interface AppHeaderProps {
  onAddEndpoint: () => void;
}

export function AppHeader({ onAddEndpoint }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-40 h-14 bg-[#09090b]/90 backdrop-blur-md border-b border-zinc-800/80 transition-colors">
      <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between">
        {/* Brand Identity & System Telemetry Status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <svg
              className="w-4.5 h-4.5 text-indigo-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            <span className="font-semibold text-sm tracking-tight text-zinc-100 font-sans">
              PulseCheck
            </span>
          </div>

          <div className="h-3.5 w-px bg-zinc-800" aria-hidden="true" />

          {/* Operational availability indicator (Platform heartbeat) */}
          <div
            className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-zinc-800/70 bg-zinc-900/50 text-[11px] font-mono text-zinc-400 select-none"
            title="PulseCheck telemetry service operational"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/80 shrink-0" aria-hidden="true" />
            <span>System Active</span>
          </div>
        </div>

        {/* Primary Action Button */}
        <div>
          <button
            type="button"
            onClick={onAddEndpoint}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-zinc-100 text-zinc-950 font-medium text-xs hover:bg-white active:bg-zinc-200 active:scale-[0.98] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 cursor-pointer shadow-xs"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span className="hidden sm:inline">Add Endpoint</span>
            <span className="sm:hidden">Add</span>
          </button>
        </div>
      </div>
    </header>
  );
}
