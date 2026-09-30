import React from 'react';

interface CheckButtonProps {
  onCheck: () => Promise<void> | void;
  isProbing?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export function CheckButton({
  onCheck,
  isProbing = false,
  disabled = false,
  size = 'sm',
  className = '',
}: CheckButtonProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isProbing && !disabled) {
      onCheck();
    }
  };

  const sizeClasses =
    size === 'md'
      ? 'h-9 px-3 text-xs gap-2'
      : 'h-8 px-2.5 text-xs gap-1.5';

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isProbing || disabled}
      aria-label={isProbing ? 'Health probe in progress' : 'Run health check now'}
      className={`inline-flex items-center justify-center font-medium rounded-md border border-zinc-700 bg-zinc-900/80 text-zinc-300 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 cursor-pointer ${
        isProbing || disabled
          ? 'opacity-60 cursor-not-allowed'
          : 'hover:bg-zinc-800 hover:text-zinc-100 hover:border-zinc-600 active:scale-[0.98]'
      } ${sizeClasses} ${className}`}
    >
      {isProbing ? (
        <>
          <svg
            className="w-3.5 h-3.5 animate-spin text-zinc-400"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
            />
          </svg>
          <span>Probing...</span>
        </>
      ) : (
        <>
          <svg
            className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-200"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          <span>Check Now</span>
        </>
      )}
    </button>
  );
}
