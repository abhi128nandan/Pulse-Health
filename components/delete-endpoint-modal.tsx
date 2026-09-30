'use client';

import React, { useCallback, useEffect, useState } from 'react';
import type { Endpoint } from '../types/dashboard';

interface DeleteEndpointModalProps {
  isOpen: boolean;
  endpoint: Endpoint | null;
  onClose: () => void;
  onDeleted: (id: number) => void;
  onError: (msg: string) => void;
}

export function DeleteEndpointModal({
  isOpen,
  endpoint,
  onClose,
  onDeleted,
  onError,
}: DeleteEndpointModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleClose = useCallback(() => {
    if (isDeleting) return;
    setIsDeleting(false);
    setErrorMessage(null);
    onClose();
  }, [isDeleting, onClose]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen && !isDeleting) {
        handleClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isDeleting, handleClose]);

  if (!isOpen || !endpoint) return null;

  async function handleDelete() {
    if (!endpoint) return;

    setIsDeleting(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/endpoints/${endpoint.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setErrorMessage(data.error || 'Failed to delete endpoint.');
        setIsDeleting(false);
        return;
      }

      setIsDeleting(false);
      setErrorMessage(null);
      onDeleted(endpoint.id);
      onClose();
    } catch {
      setIsDeleting(false);
      setErrorMessage('Network error while deleting endpoint.');
      onError('Network error occurred while attempting deletion.');
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div className="w-full max-w-md rounded-lg bg-[#121215] border border-zinc-700/80 shadow-2xl p-5 text-zinc-100">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0 mt-0.5">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <div>
            <h3 id="delete-dialog-title" className="text-sm font-semibold text-zinc-100">
              Delete Monitored Endpoint?
            </h3>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
              Are you sure you want to delete <span className="text-zinc-200 font-semibold">{endpoint.name}</span> (<code className="font-mono text-zinc-300">{endpoint.url}</code>)?
            </p>
            <p className="text-[11px] text-zinc-500 mt-2 bg-zinc-900 p-2 rounded border border-zinc-800">
              Warning: All historical health checks and timeseries telemetry associated with this endpoint will be permanently deleted via database cascade.
            </p>
          </div>
        </div>

        {errorMessage && (
          <div className="mt-3 p-2 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
            {errorMessage}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 mt-5 pt-3 border-t border-zinc-800">
          <button
            type="button"
            onClick={handleClose}
            disabled={isDeleting}
            className="h-8 px-3 rounded-md border border-zinc-700 bg-zinc-900/80 hover:bg-zinc-800 text-xs font-medium text-zinc-300 hover:text-zinc-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="inline-flex items-center justify-center gap-1.5 h-8 px-3.5 rounded-md bg-rose-600 hover:bg-rose-500 text-white font-medium text-xs transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 shadow-xs"
          >
            {isDeleting ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                <span>Deleting...</span>
              </>
            ) : (
              <span>Delete Endpoint</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
