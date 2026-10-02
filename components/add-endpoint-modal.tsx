'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Endpoint } from '../types/dashboard';

interface AddEndpointModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (endpoint: Endpoint) => void;
  onError: (msg: string) => void;
}

export function AddEndpointModal({
  isOpen,
  onClose,
  onCreated,
  onError,
}: AddEndpointModalProps) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [latencyThresholdMs, setLatencyThresholdMs] = useState('500');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const nameInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  const handleClose = useCallback(() => {
    if (isSubmitting) return;
    setName('');
    setUrl('');
    setLatencyThresholdMs('500');
    setFieldErrors({});
    setServerError(null);
    onClose();
    if (previousActiveElementRef.current && typeof previousActiveElementRef.current.focus === 'function') {
      previousActiveElementRef.current.focus();
    }
  }, [isSubmitting, onClose]);

  // Focus name input on open and store initiating element
  useEffect(() => {
    if (isOpen) {
      previousActiveElementRef.current = document.activeElement as HTMLElement | null;
      const timer = setTimeout(() => {
        nameInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Handle Escape key to close and cyclic Tab focus trap
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!isOpen || isSubmitting) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );

        if (focusableElements.length === 0) {
          e.preventDefault();
          return;
        }

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement || !modalRef.current.contains(document.activeElement)) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement || !modalRef.current.contains(document.activeElement)) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, handleClose]);

  if (!isOpen) return null;

  function validateClient(): boolean {
    const errors: Record<string, string> = {};

    const trimmedName = name.trim();
    if (!trimmedName) {
      errors.name = 'Service name is required';
    } else if (trimmedName.length > 100) {
      errors.name = 'Service name must not exceed 100 characters';
    }

    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      errors.url = 'Target URL is required';
    } else {
      try {
        const parsed = new URL(trimmedUrl);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          errors.url = 'URL must use HTTP or HTTPS protocol';
        }
        if (trimmedUrl.length > 2048) {
          errors.url = 'URL must not exceed 2048 characters';
        }
      } catch {
        errors.url = 'Please enter a valid HTTP or HTTPS URL';
      }
    }

    const thresholdNum = Number(latencyThresholdMs);
    if (!Number.isInteger(thresholdNum) || thresholdNum <= 0) {
      errors.latencyThresholdMs = 'Threshold must be a positive integer';
    } else if (thresholdNum > 60000) {
      errors.latencyThresholdMs = 'Threshold must not exceed 60,000 ms';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);

    if (!validateClient()) return;

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/endpoints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          url: url.trim(),
          latencyThresholdMs: Number(latencyThresholdMs),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          setServerError('An endpoint with this URL already exists.');
          setFieldErrors((prev) => ({ ...prev, url: 'URL already registered' }));
        } else if (response.status === 400 && data.details) {
          const detailErrors: Record<string, string> = {};
          for (const item of data.details) {
            if (item.path && item.path[0]) {
              detailErrors[item.path[0]] = item.message;
            }
          }
          setFieldErrors(detailErrors);
          setServerError('Please correct the validation errors below.');
        } else {
          setServerError(data.error || 'Failed to create endpoint.');
        }
        setIsSubmitting(false);
        return;
      }

      // Success
      setIsSubmitting(false);
      setName('');
      setUrl('');
      setLatencyThresholdMs('500');
      setFieldErrors({});
      setServerError(null);
      onCreated(data);
      onClose();
    } catch {
      setIsSubmitting(false);
      setServerError('Network error communicating with PulseCheck backend.');
      onError('Failed to register endpoint due to a network error.');
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-endpoint-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        ref={modalRef}
        className="w-full max-w-md rounded-lg bg-[#121215] border border-zinc-700/80 shadow-2xl p-5 text-zinc-100"
      >
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div>
            <h3 id="add-endpoint-title" className="text-sm font-semibold text-zinc-100">
              Register New Endpoint
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Add an HTTP/HTTPS API to active health observation.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="text-zinc-500 hover:text-zinc-300 p-1 rounded"
            aria-label="Close dialog"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {serverError && (
          <div className="mt-3 p-2.5 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          {/* Service Name */}
          <div>
            <label htmlFor="endpoint-name" className="block text-xs font-medium text-zinc-300 mb-1">
              Service Name <span className="text-rose-400">*</span>
            </label>
            <input
              ref={nameInputRef}
              id="endpoint-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSubmitting}
              placeholder="e.g. Production Auth Gateway"
              className={`w-full px-3 py-1.5 text-xs bg-zinc-900 border rounded-md text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                fieldErrors.name ? 'border-rose-500' : 'border-zinc-700'
              }`}
            />
            {fieldErrors.name && (
              <p className="text-[11px] text-rose-400 mt-1">{fieldErrors.name}</p>
            )}
          </div>

          {/* Target URL */}
          <div>
            <label htmlFor="endpoint-url" className="block text-xs font-medium text-zinc-300 mb-1">
              Target URL <span className="text-rose-400">*</span>
            </label>
            <input
              id="endpoint-url"
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={isSubmitting}
              placeholder="https://api.example.com/health"
              className={`w-full px-3 py-1.5 text-xs font-mono bg-zinc-900 border rounded-md text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                fieldErrors.url ? 'border-rose-500' : 'border-zinc-700'
              }`}
            />
            {fieldErrors.url ? (
              <p className="text-[11px] text-rose-400 mt-1">{fieldErrors.url}</p>
            ) : (
              <p className="text-[11px] text-zinc-500 mt-1">
                Must be an accessible HTTP/HTTPS URL.
              </p>
            )}
          </div>

          {/* Latency Threshold (ms) */}
          <div>
            <label htmlFor="endpoint-threshold" className="block text-xs font-medium text-zinc-300 mb-1">
              Latency Threshold (ms) <span className="text-rose-400">*</span>
            </label>
            <input
              id="endpoint-threshold"
              type="number"
              min="1"
              max="60000"
              value={latencyThresholdMs}
              onChange={(e) => setLatencyThresholdMs(e.target.value)}
              disabled={isSubmitting}
              className={`w-full px-3 py-1.5 text-xs font-mono bg-zinc-900 border rounded-md text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                fieldErrors.latencyThresholdMs ? 'border-rose-500' : 'border-zinc-700'
              }`}
            />
            {fieldErrors.latencyThresholdMs ? (
              <p className="text-[11px] text-rose-400 mt-1">{fieldErrors.latencyThresholdMs}</p>
            ) : (
              <p className="text-[11px] text-zinc-500 mt-1">
                Responses exceeding this latency threshold are classified as DEGRADED.
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="h-8 px-3 rounded-md border border-zinc-700 bg-zinc-900/80 hover:bg-zinc-800 text-xs font-medium text-zinc-300 hover:text-zinc-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center justify-center gap-1.5 h-8 px-3.5 rounded-md bg-zinc-100 hover:bg-white text-zinc-950 font-medium text-xs transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 shadow-xs"
            >
              {isSubmitting ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  <span>Registering...</span>
                </>
              ) : (
                <span>Register Endpoint</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
