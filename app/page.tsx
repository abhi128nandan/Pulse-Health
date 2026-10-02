'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AddEndpointModal } from '../components/add-endpoint-modal';
import { AppHeader } from '../components/app-header';
import { DeleteEndpointModal } from '../components/delete-endpoint-modal';
import { EndpointDetail } from '../components/endpoint-detail';
import { EndpointTable } from '../components/endpoint-table';
import { EndpointToolbar } from '../components/endpoint-toolbar';
import { SystemOverview } from '../components/system-overview';
import { ToastContainer } from '../components/toast';
import type {
  Check,
  Endpoint,
  EndpointMetrics,
  EndpointWithLatestCheck,
  StatusFilter,
  ToastMessage,
} from '../types/dashboard';

export default function DashboardPage() {
  const [endpoints, setEndpoints] = useState<EndpointWithLatestCheck[]>([]);
  const [isLoadingEndpoints, setIsLoadingEndpoints] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Selected endpoint detail data
  const [selectedHistory, setSelectedHistory] = useState<Check[]>([]);
  const [selectedMetrics, setSelectedMetrics] = useState<EndpointMetrics | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(false);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Tracking on-demand probe states per endpoint ID
  const [probingIds, setProbingIds] = useState<Set<number>>(new Set());

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [deletingEndpoint, setDeletingEndpoint] = useState<Endpoint | null>(null);

  // Ephemeral toast notifications
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((type: 'success' | 'error' | 'info', message: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Selection handlers
  const handleSelectEndpoint = useCallback((id: number) => {
    setSelectedId(id);
    setSelectedHistory([]);
    setSelectedMetrics(null);
    setIsLoadingHistory(true);
    setIsLoadingMetrics(true);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedId(null);
    setSelectedHistory([]);
    setSelectedMetrics(null);
    setIsLoadingHistory(false);
    setIsLoadingMetrics(false);
  }, []);

  // Initial endpoints fetch on mount
  useEffect(() => {
    let isCancelled = false;

    async function loadInitialEndpoints() {
      try {
        const res = await fetch('/api/endpoints');
        if (!res.ok) {
          throw new Error('Failed to load endpoints');
        }
        const data: Endpoint[] = await res.json().catch(() => []);
        if (!isCancelled) {
          setEndpoints(
            data.map((endpoint) => ({
              ...endpoint,
              latestCheck: null,
              metrics: null,
            }))
          );
        }
      } catch {
        if (!isCancelled) {
          addToast('error', 'Failed to load endpoints from PulseCheck backend.');
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingEndpoints(false);
        }
      }
    }

    loadInitialEndpoints();

    return () => {
      isCancelled = true;
    };
  }, [addToast]);

  // Load telemetry when an endpoint is selected
  useEffect(() => {
    if (selectedId === null) return;

    let isCancelled = false;
    const targetId = selectedId;

    async function loadEndpointTelemetry(id: number) {
      // Fetch history (last 50 checks)
      try {
        const histRes = await fetch(`/api/endpoints/${id}/history?limit=50`);
        if (histRes.ok && !isCancelled) {
          const histData: Check[] = await histRes.json().catch(() => []);
          setSelectedHistory(histData);

          // Update latest check on endpoint if history exists
          if (histData.length > 0) {
            const latest = histData[0];
            setEndpoints((prev) =>
              prev.map((ep) =>
                ep.id === id ? { ...ep, latestCheck: latest } : ep
              )
            );
          }
        }
      } catch {
        if (!isCancelled) {
          addToast('error', 'Failed to load recent check history.');
        }
      } finally {
        if (!isCancelled) setIsLoadingHistory(false);
      }

      // Fetch 24h metrics
      try {
        const metRes = await fetch(`/api/endpoints/${id}/metrics`);
        if (metRes.ok && !isCancelled) {
          const metData: EndpointMetrics | null = await metRes.json().catch(() => null);
          if (metData) {
            setSelectedMetrics(metData);
            setEndpoints((prev) =>
              prev.map((ep) =>
                ep.id === id ? { ...ep, metrics: metData } : ep
              )
            );
          }
        }
      } catch {
        if (!isCancelled) {
          addToast('error', 'Failed to load 24h reliability metrics.');
        }
      } finally {
        if (!isCancelled) setIsLoadingMetrics(false);
      }
    }

    loadEndpointTelemetry(targetId);

    return () => {
      isCancelled = true;
    };
  }, [selectedId, addToast]);

  // Handle on-demand "Check Now" probe
  const handleCheckNow = useCallback(
    async (id: number) => {
      if (probingIds.has(id)) return;

      const targetEndpoint = endpoints.find((e) => e.id === id);
      setProbingIds((prev) => new Set(prev).add(id));

      try {
        const response = await fetch(`/api/endpoints/${id}/check`, {
          method: 'POST',
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          // PulseCheck application error
          addToast(
            'error',
            `Probe failed: ${data.error || 'Server error running check.'}`
          );
          setProbingIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
          return;
        }

        // Monitoring check was successfully executed and persisted
        const savedCheck: Check = data.check ?? {
          id: data.id,
          endpointId: data.endpointId,
          checkedAt: data.checkedAt,
          statusCode: data.statusCode,
          latencyMs: data.latencyMs,
          success: data.success,
          status: data.status,
          errorType: data.errorType,
          errorMessage: data.errorMessage,
        };

        // Update endpoint list local state immediately
        setEndpoints((prev) =>
          prev.map((ep) =>
            ep.id === id ? { ...ep, latestCheck: savedCheck } : ep
          )
        );

        // If this endpoint is currently selected in detail view, update history
        if (selectedId === id) {
          setSelectedHistory((prev) => [savedCheck, ...prev.slice(0, 49)]);

          // Re-fetch metrics for selected endpoint
          fetch(`/api/endpoints/${id}/metrics`)
            .then((r) => (r.ok ? r.json().catch(() => null) : null))
            .then((met: EndpointMetrics | null) => {
              if (met) {
                setSelectedMetrics(met);
                setEndpoints((prev) =>
                  prev.map((ep) => (ep.id === id ? { ...ep, metrics: met } : ep))
                );
              }
            })
            .catch(() => {});
        }

        // Distinctly inform the user of the probe outcome
        const serviceName = targetEndpoint?.name || `Endpoint #${id}`;
        if (savedCheck.status === 'up') {
          addToast('success', `${serviceName} probe: UP (${savedCheck.latencyMs} ms)`);
        } else if (savedCheck.status === 'degraded') {
          addToast('info', `${serviceName} probe: DEGRADED (${savedCheck.latencyMs} ms)`);
        } else {
          addToast(
            'error',
            `${serviceName} probe: DOWN (${savedCheck.errorType || `HTTP ${savedCheck.statusCode || 'Error'}`})`
          );
        }
      } catch {
        addToast(
          'error',
          `Network error attempting to check ${targetEndpoint?.name || 'endpoint'}`
        );
      } finally {
        setProbingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [probingIds, endpoints, selectedId, addToast]
  );

  // Handle created endpoint
  const handleEndpointCreated = useCallback(
    (newEndpoint: Endpoint) => {
      // Rule: New endpoint starts in NO DATA awaiting initial check; DO NOT automatically probe
      setEndpoints((prev) => [{ ...newEndpoint, latestCheck: null, metrics: null }, ...prev]);
      addToast('success', `Endpoint "${newEndpoint.name}" registered successfully.`);
    },
    [addToast]
  );

  // Handle deleted endpoint
  const handleEndpointDeleted = useCallback(
    (deletedId: number) => {
      setEndpoints((prev) => prev.filter((e) => e.id !== deletedId));
      if (selectedId === deletedId) {
        handleCloseDetail();
      }
      addToast('success', 'Endpoint deleted successfully.');
    },
    [selectedId, handleCloseDetail, addToast]
  );

  // Calculate summary counts strictly according to Phase 6B contract rules
  const evaluatedEndpoints = endpoints.filter((e) => e.latestCheck !== null);
  const upCount =
    evaluatedEndpoints.length > 0
      ? evaluatedEndpoints.filter((e) => e.latestCheck?.status === 'up').length
      : null;
  const degradedCount =
    evaluatedEndpoints.length > 0
      ? evaluatedEndpoints.filter((e) => e.latestCheck?.status === 'degraded').length
      : null;
  const downCount =
    evaluatedEndpoints.length > 0
      ? evaluatedEndpoints.filter((e) => e.latestCheck?.status === 'down').length
      : null;

  // Filtered endpoints
  const filteredEndpoints = endpoints.filter((endpoint) => {
    // Search query matches name or url
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchesName = endpoint.name.toLowerCase().includes(q);
      const matchesUrl = endpoint.url.toLowerCase().includes(q);
      if (!matchesName && !matchesUrl) return false;
    }

    // Status filter
    if (statusFilter === 'all') return true;
    if (statusFilter === 'no_data') return !endpoint.latestCheck;
    return endpoint.latestCheck?.status === statusFilter;
  });

  const selectedEndpoint = endpoints.find((e) => e.id === selectedId) || null;

  return (
    <div className="min-h-screen bg-[#09090b] text-[#f4f4f5] flex flex-col font-sans selection:bg-indigo-500/30 selection:text-white">
      {/* Header */}
      <AppHeader onAddEndpoint={() => setIsAddModalOpen(true)} />

      {/* Main Canvas */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {/* Global System Overview */}
        <SystemOverview
          totalEndpoints={endpoints.length}
          upCount={upCount}
          degradedCount={degradedCount}
          downCount={downCount}
          isLoading={isLoadingEndpoints}
        />

        {/* Master / Detail Routing */}
        {selectedEndpoint ? (
          <EndpointDetail
            endpoint={selectedEndpoint}
            metrics={selectedMetrics}
            history={selectedHistory}
            isLoadingMetrics={isLoadingMetrics}
            isLoadingHistory={isLoadingHistory}
            isProbing={probingIds.has(selectedEndpoint.id)}
            onCheck={() => handleCheckNow(selectedEndpoint.id)}
            onDelete={() => setDeletingEndpoint(selectedEndpoint)}
            onBack={handleCloseDetail}
          />
        ) : (
          <div className="flex flex-col">
            {/* Toolbar */}
            <EndpointToolbar
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              totalCount={endpoints.length}
              filteredCount={filteredEndpoints.length}
            />

            {/* Table */}
            <EndpointTable
              endpoints={filteredEndpoints}
              selectedId={selectedId}
              probingIds={probingIds}
              onSelect={handleSelectEndpoint}
              onCheck={handleCheckNow}
              onDelete={(ep) => setDeletingEndpoint(ep)}
              isLoading={isLoadingEndpoints}
              onAddEndpoint={() => setIsAddModalOpen(true)}
              hasActiveFilters={Boolean(searchQuery || statusFilter !== 'all')}
              onClearFilters={() => {
                setSearchQuery('');
                setStatusFilter('all');
              }}
            />
          </div>
        )}
      </main>

      {/* Modals */}
      <AddEndpointModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onCreated={handleEndpointCreated}
        onError={(msg) => addToast('error', msg)}
      />

      <DeleteEndpointModal
        isOpen={Boolean(deletingEndpoint)}
        endpoint={deletingEndpoint}
        onClose={() => setDeletingEndpoint(null)}
        onDeleted={handleEndpointDeleted}
        onError={(msg) => addToast('error', msg)}
      />

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
