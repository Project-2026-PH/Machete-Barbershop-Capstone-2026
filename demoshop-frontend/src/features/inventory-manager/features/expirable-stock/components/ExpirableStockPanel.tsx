import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Archive,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Layers,
  Package,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import type { ExpirableBatchUnit, ExpirableStockBatch, ExpirableStockResponse, ExpiryStatus } from '@demoshop/shared-types';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/feedback/Modal';
import { useToast } from '@/components/feedback/ToastContext';
import { PageHeader } from '@/features/inventory-manager/shared/components/PageHeader';
import { EmptyState } from '@/features/inventory-manager/shared/components/EmptyState';
import { useInventoryRealtime } from '@/features/inventory-manager/shared/hooks/useInventoryRealtime';
import { errorMessage } from '@/features/inventory-manager/shared/utils/formatting';
import { disposeExpiredUnit, fetchExpirableStock } from '../expirable-stock.service';

type StatusFilter = 'all' | 'expired' | 'approaching' | 'valid';

export const ExpirableStockPanel: React.FC = () => {
  const { addToast } = useToast();

  const [data, setData] = useState<ExpirableStockResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [expandedBatchIds, setExpandedBatchIds] = useState<Set<string>>(new Set());

  // Disposal modal state
  const [selectedUnit, setSelectedUnit] = useState<{ unit: ExpirableBatchUnit; batch: ExpirableStockBatch } | null>(null);
  const [disposalReason, setDisposalReason] = useState('');
  const [disposing, setDisposing] = useState(false);

  const loadStock = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetchExpirableStock();
      setData(res.data);
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Failed to load expirable stock',
        message: errorMessage(err, 'Could not retrieve batch and expiration records.'),
      });
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    void loadStock();
  }, [loadStock]);

  useInventoryRealtime({
    channelName: 'inventory-expirable-stock-sync',
    tables: ['inventory_stock_batches', 'inventory_stock_batch_units', 'inventory_stock_movements'],
    onReload: loadStock,
  });

  const toggleBatch = (batchId: string) => {
    setExpandedBatchIds((prev) => {
      const next = new Set(prev);
      if (next.has(batchId)) {
        next.delete(batchId);
      } else {
        next.add(batchId);
      }
      return next;
    });
  };

  const expandAll = () => {
    if (!data?.batches) return;
    setExpandedBatchIds(new Set(data.batches.map((b) => b.id)));
  };

  const collapseAll = () => {
    setExpandedBatchIds(new Set());
  };

  // Filtered batches
  const filteredBatches = useMemo(() => {
    if (!data?.batches) return [];
    return data.batches.filter((batch) => {
      const matchesSearch =
        batch.itemName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        batch.batchNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (batch.poNumber && batch.poNumber.toLowerCase().includes(searchTerm.toLowerCase())) ||
        batch.category.toLowerCase().includes(searchTerm.toLowerCase());

      if (!matchesSearch) return false;

      if (statusFilter === 'all') return true;
      if (statusFilter === 'expired') {
        return batch.expiryStatus === 'expired' || batch.units.some((u) => u.status === 'expired' && !u.isDisposed);
      }
      if (statusFilter === 'approaching') {
        return batch.expiryStatus === 'approaching_expiry' || batch.units.some((u) => u.status === 'approaching_expiry' && !u.isDisposed);
      }
      if (statusFilter === 'valid') {
        return batch.expiryStatus === 'valid';
      }
      return true;
    });
  }, [data?.batches, searchTerm, statusFilter]);

  const handleOpenDisposalModal = (unit: ExpirableBatchUnit, batch: ExpirableStockBatch) => {
    setSelectedUnit({ unit, batch });
    setDisposalReason('Expired stock disposal');
  };

  const handleConfirmDisposal = async () => {
    if (!selectedUnit) return;
    try {
      setDisposing(true);
      const res = await disposeExpiredUnit(selectedUnit.unit.id, disposalReason);
      addToast({
        type: 'success',
        title: 'Unit disposed successfully',
        message: res.data.message || `Unit #${selectedUnit.unit.unitNumber} disposed. Inventory stock reduced by 1.`,
      });
      setSelectedUnit(null);
      void loadStock();
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Disposal failed',
        message: errorMessage(err, 'Failed to dispose expired unit.'),
      });
    } finally {
      setDisposing(false);
    }
  };

  const summary = data?.summary || {
    totalBatches: 0,
    totalTrackedUnits: 0,
    approachingExpiryCount: 0,
    expiredUnitsCount: 0,
    disposedUnitsCount: 0,
  };

  const renderStatusBadge = (status: ExpiryStatus, isDisposed = false) => {
    if (isDisposed) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-ivory-dim">
          <Archive className="h-3 w-3" /> Disposed
        </span>
      );
    }
    if (status === 'expired') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-400">
          <AlertCircle className="h-3 w-3" /> Expired
        </span>
      );
    }
    if (status === 'approaching_expiry') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-300">
          <AlertTriangle className="h-3 w-3" /> Approaching Expiry
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400">
        <CheckCircle2 className="h-3 w-3" /> Valid
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Stock Overview"
        title="Expirable Stock Monitoring"
        description="Track shelf-life sensitive consumables and service supplies at the batch and unit level. Monitor expiration countdowns and dispose expired units safely."
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-lg border border-white/10 bg-charcoal-light p-4">
          <div className="flex items-center justify-between text-ivory-dim">
            <span className="text-xs font-medium uppercase tracking-wider">Batches</span>
            <Package className="h-4 w-4 text-gold" />
          </div>
          <div className="mt-2 text-2xl font-semibold tabular-nums text-ivory">{summary.totalBatches}</div>
          <div className="mt-0.5 text-[11px] text-ivory-dim">Active stock batches</div>
        </div>

        <div className="rounded-lg border border-white/10 bg-charcoal-light p-4">
          <div className="flex items-center justify-between text-ivory-dim">
            <span className="text-xs font-medium uppercase tracking-wider">Tracked Units</span>
            <Layers className="h-4 w-4 text-gold" />
          </div>
          <div className="mt-2 text-2xl font-semibold tabular-nums text-ivory">{summary.totalTrackedUnits}</div>
          <div className="mt-0.5 text-[11px] text-ivory-dim">Individual bottles / units</div>
        </div>

        <div className="rounded-lg border border-white/10 bg-charcoal-light p-4">
          <div className="flex items-center justify-between text-ivory-dim">
            <span className="text-xs font-medium uppercase tracking-wider text-amber-300">Expiring within 30 days</span>
            <AlertTriangle className="h-4 w-4 text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-semibold tabular-nums text-amber-300">{summary.approachingExpiryCount}</div>
          <div className="mt-0.5 text-[11px] text-amber-200/70">≤ 30 days remaining</div>
        </div>

        <div className="rounded-lg border border-white/10 bg-charcoal-light p-4">
          <div className="flex items-center justify-between text-ivory-dim">
            <span className="text-xs font-medium uppercase tracking-wider text-rose-400">Expired Units</span>
            <AlertCircle className="h-4 w-4 text-rose-400" />
          </div>
          <div className="mt-2 text-2xl font-semibold tabular-nums text-rose-400">{summary.expiredUnitsCount}</div>
          <div className="mt-0.5 text-[11px] text-rose-200/70">Ready for disposal</div>
        </div>

        <div className="rounded-lg border border-white/10 bg-charcoal-light p-4 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-ivory-dim">
            <span className="text-xs font-medium uppercase tracking-wider">Disposed Units</span>
            <Archive className="h-4 w-4 text-ivory-dim" />
          </div>
          <div className="mt-2 text-2xl font-semibold tabular-nums text-ivory-dim">{summary.disposedUnitsCount}</div>
          <div className="mt-0.5 text-[11px] text-ivory-dim/70">Logged as spoilage</div>
        </div>
      </div>

      {/* In-app Alerts */}
      {summary.expiredUnitsCount > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
          <div>
            <p className="font-semibold text-rose-200">
              {summary.expiredUnitsCount} expired unit(s) detected in stock
            </p>
            <p className="mt-0.5 text-xs text-rose-300/80">
              Expired consumables cannot be issued to barbers or used in service. Expand the batch below and click &quot;Dispose -1&quot; to write them off as spoilage.
            </p>
          </div>
        </div>
      )}

      {summary.approachingExpiryCount > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <div>
            <p className="font-semibold text-amber-100">
              {summary.approachingExpiryCount} unit(s) approaching expiry within 30 days
            </p>
            <p className="mt-0.5 text-xs text-amber-200/80">
              Prioritize issuing these batches first to prevent stock expiration and product waste.
            </p>
          </div>
        </div>
      )}

      {/* Search and status controls share the Stock List toolbar pattern. */}
      <div className="space-y-3 rounded-sm border border-white/10 bg-charcoal-light p-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="w-full sm:w-72">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gold">Search batches</span>
            <span className="relative block">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ivory-dim" />
              <input type="text" placeholder="Item, batch or stock request..." value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} className="h-9 w-full rounded-sm border border-white/10 bg-charcoal pl-8 pr-3 text-xs text-ivory focus:outline-none focus:ring-1 focus:ring-gold" />
            </span>
          </label>
          <div className="flex-1">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gold">Expiry status</span>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Batch expiry status">
              {([{ value: 'all', label: 'All batches' }, { value: 'expired', label: 'Expired' }, { value: 'approaching', label: 'Expires within 30 days' }, { value: 'valid', label: 'Valid' }] as const).map(({ value, label }) => (
                <button key={value} type="button" aria-pressed={statusFilter === value} onClick={() => setStatusFilter(value)} className={`inline-flex min-h-9 items-center rounded-sm border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold ${statusFilter === value ? 'border-gold bg-gold text-charcoal' : 'border-white/10 bg-charcoal text-ivory-dim hover:border-gold/40 hover:text-ivory'}`}>{label}</button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={expandedBatchIds.size === data?.batches.length ? collapseAll : expandAll} className="min-h-9 text-xs">{expandedBatchIds.size === data?.batches.length ? 'Collapse all' : 'Expand all'}</Button>
            <Button type="button" variant="outline" onClick={() => void loadStock()} disabled={loading} className="min-h-9 text-xs"><RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />Refresh</Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-2">
          <p aria-live="polite" className="text-xs text-ivory-dim">{filteredBatches.length} of {data?.batches.length || 0} batches · Expand a batch to view its units.</p>
          {(searchTerm || statusFilter !== 'all') && <button type="button" onClick={() => { setSearchTerm(''); setStatusFilter('all'); }} className="min-h-8 rounded-sm px-2 text-xs font-semibold text-gold hover:bg-gold/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold">Clear filters</button>}
        </div>
      </div>
      {/* Batches Table */}
      {loading && !data ? (
        <div className="py-12 text-center text-sm text-ivory-dim">
          <RefreshCw className="mx-auto mb-2 h-6 w-6 animate-spin text-gold" />
          Loading expirable stock records…
        </div>
      ) : filteredBatches.length === 0 ? (
        <EmptyState>
          <div className="py-6">
            <Package className="mx-auto mb-2 h-8 w-8 text-ivory-dim/40" />
            <p className="font-semibold text-ivory">No expirable stock batches found</p>
            <p className="mt-1 text-xs text-ivory-dim">
              {searchTerm || statusFilter !== 'all'
                ? 'Try adjusting your search or status filters.'
                : 'Batches with shelf-life tracking will appear here once stock requests are fulfilled or items are marked as expirable.'}
            </p>
          </div>
        </EmptyState>
      ) : (
        <div className="overflow-hidden rounded-lg border border-white/10 bg-charcoal-light">
          <div className="divide-y divide-white/10">
            {filteredBatches.map((batch) => {
              const isExpanded = expandedBatchIds.has(batch.id);
              const expiredCount = batch.units.filter((u) => u.status === 'expired' && !u.isDisposed).length;
              const approachingCount = batch.units.filter((u) => u.status === 'approaching_expiry' && !u.isDisposed).length;

              return (
                <div key={batch.id} className="transition-colors hover:bg-white/[0.02]">
                  {/* Batch Summary Row */}
                  <div
                    onClick={() => toggleBatch(batch.id)}
                    className="flex cursor-pointer flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <button
                        type="button"
                        aria-expanded={isExpanded} aria-label={isExpanded ? 'Collapse batch units' : 'Expand batch units'}
                        className="mt-0.5 text-ivory-dim hover:text-gold"
                      >
                        {isExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                      </button>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-bold text-ivory text-sm truncate">{batch.itemName}</p>
                          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-ivory-dim">
                            {batch.category.replace(/_/g, ' ')}
                          </span>
                          {renderStatusBadge(batch.expiryStatus)}
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ivory-dim">
                          <span>
                            Batch: <strong className="font-mono text-ivory">{batch.batchNumber}</strong>
                          </span>
                          {batch.poNumber && (
                            <span>
                              Stock Request: <strong className="font-mono text-gold">{batch.poNumber}</strong>
                            </span>
                          )}
                          <span>
                            Received: <span className="text-ivory">{batch.receivedDate}</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-xs text-ivory-dim pl-8 sm:pl-0">
                      <div>
                        <span className="text-[10px] uppercase tracking-wider block">Expiration Date</span>
                        <div className="flex items-center gap-1 font-mono font-semibold text-ivory mt-0.5">
                          <Calendar className="h-3.5 w-3.5 text-gold" />
                          <span>{batch.expirationDate}</span>
                          <span
                            className={`ml-1 text-[10px] ${
                              batch.daysUntilExpiry < 0
                                ? 'text-rose-400 font-bold'
                                : batch.daysUntilExpiry <= 30
                                ? 'text-amber-300 font-bold'
                                : 'text-emerald-400'
                            }`}
                          >
                            ({batch.daysUntilExpiry < 0
                              ? `Expired ${Math.abs(batch.daysUntilExpiry)}d ago`
                              : `${batch.daysUntilExpiry}d left`})
                          </span>
                        </div>
                      </div>

                      <div>
                        <span className="text-[10px] uppercase tracking-wider block">Remaining Stock</span>
                        <div className="font-mono font-semibold text-ivory mt-0.5">
                          <span className="text-gold font-bold">{batch.currentQuantity}</span> / {batch.initialQuantity} {batch.unit}
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] uppercase tracking-wider block">Units</span>
                        <div className="mt-0.5 text-xs text-ivory">
                          {batch.units.length} tracked
                          {expiredCount > 0 && (
                            <span className="ml-1 text-rose-400 font-bold">({expiredCount} expired)</span>
                          )}
                          {approachingCount > 0 && expiredCount === 0 && (
                            <span className="ml-1 text-amber-300 font-bold">({approachingCount} expiring soon)</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Expandable Unit-Level Breakdown */}
                  {isExpanded && (
                    <div className="border-t border-white/5 bg-charcoal/60 p-4 pl-6 sm:pl-12">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-gold flex items-center gap-1.5">
                          <Layers className="h-3.5 w-3.5" /> Unit-Level Breakdown ({batch.units.length} Units)
                        </h4>
                        <span className="text-[11px] text-ivory-dim">
                          &quot;Dispose -1&quot; is strictly enabled only for expired units.
                        </span>
                      </div>

                      {batch.units.length === 0 ? (
                        <p className="text-xs italic text-ivory-dim">No individual unit records generated for this batch.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead className="border-b border-white/10 text-[10px] uppercase tracking-wider text-ivory-dim">
                              <tr>
                                <th className="py-2 px-2">Unit Number</th>
                                <th className="py-2 px-2">Unit Expiration Date</th>
                                <th className="py-2 px-2">Status</th>
                                <th className="py-2 px-2">Disposal Details</th>
                                <th className="py-2 px-2 text-right">Disposal Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                              {batch.units.map((unit) => {
                                const canDispose =
                                  unit.status === 'expired' &&
                                  !unit.isDisposed &&
                                  batch.currentQuantity >= 1;

                                let disabledTooltip = '';
                                if (unit.isDisposed) {
                                  disabledTooltip = 'Unit already disposed.';
                                } else if (unit.status !== 'expired') {
                                  disabledTooltip = `Action disabled: Unit is not yet expired (${unit.daysUntilExpiry} days remaining).`;
                                } else if (batch.currentQuantity < 1) {
                                  disabledTooltip = 'Action disabled: No remaining stock in batch.';
                                }

                                return (
                                  <tr key={unit.id} className="hover:bg-white/[0.02]">
                                    <td className="py-2.5 px-2 font-mono font-medium text-ivory">
                                      Unit #{unit.unitNumber}
                                    </td>
                                    <td className="py-2.5 px-2 font-mono text-ivory-dim">
                                      {unit.expirationDate}
                                      <span
                                        className={`ml-1.5 text-[10px] ${
                                          unit.daysUntilExpiry < 0
                                            ? 'text-rose-400 font-semibold'
                                            : unit.daysUntilExpiry <= 30
                                            ? 'text-amber-300'
                                            : 'text-ivory-dim'
                                        }`}
                                      >
                                        ({unit.daysUntilExpiry < 0
                                          ? `${Math.abs(unit.daysUntilExpiry)}d expired`
                                          : `${unit.daysUntilExpiry}d left`})
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-2">
                                      {renderStatusBadge(unit.status, unit.isDisposed)}
                                    </td>
                                    <td className="py-2.5 px-2 text-[11px] text-ivory-dim">
                                      {unit.isDisposed ? (
                                        <span>
                                          Disposed by <strong className="text-ivory">{unit.disposedByName || 'Staff'}</strong>
                                          {unit.disposedAt && (
                                            <span className="text-[10px] block text-ivory-dim/70">
                                              {new Date(unit.disposedAt).toLocaleDateString()}
                                            </span>
                                          )}
                                        </span>
                                      ) : (
                                        <span className="text-emerald-400/80">Active in batch inventory</span>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-2 text-right">
                                      {unit.isDisposed ? (
                                        <span className="text-[10px] text-ivory-dim italic">Disposed</span>
                                      ) : (
                                        <button
                                          type="button"
                                          disabled={!canDispose}
                                          title={disabledTooltip}
                                          onClick={() => handleOpenDisposalModal(unit, batch)}
                                          className={`inline-flex items-center justify-center rounded px-2.5 py-1 text-[11px] font-bold transition-all ${
                                            canDispose
                                              ? 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/40 cursor-pointer shadow-sm shadow-rose-500/20'
                                              : 'bg-white/5 text-ivory-dim/40 border border-white/5 cursor-not-allowed opacity-60'
                                          }`}
                                        >
                                          <Trash2 className="h-3 w-3 mr-1" /> Dispose -1
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Confirmation Modal for Atomic Disposal */}
      <Modal
        isOpen={!!selectedUnit}
        onClose={() => setSelectedUnit(null)}
        title="Confirm Expired Unit Disposal"
        size="md"
        footer={
          <>
            <Button
              variant="outline"
              disabled={disposing}
              onClick={() => setSelectedUnit(null)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={disposing}
              onClick={handleConfirmDisposal}
              className="bg-rose-600 hover:bg-rose-700 border-rose-600 text-white font-bold"
            >
              {disposing ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Disposing…
                </>
              ) : (
                'Confirm Dispose (-1)'
              )}
            </Button>
          </>
        }
      >
        {selectedUnit && (
          <div className="space-y-4">
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
              <p className="font-semibold text-rose-200 flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4" /> Atomic Spoilage Write-Off
              </p>
              <p className="mt-1">
                Disposing this unit will permanently reduce the current stock quantity and batch quantity by <strong>1</strong>, and record a <strong>spoilage</strong> movement in inventory audit records.
              </p>
            </div>

            <div className="rounded-md border border-white/10 bg-charcoal p-3 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-ivory-dim">Item:</span>
                <span className="font-bold text-ivory">{selectedUnit.batch.itemName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ivory-dim">Batch #:</span>
                <span className="font-mono text-ivory">{selectedUnit.batch.batchNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ivory-dim">Unit:</span>
                <span className="font-bold text-rose-400">Unit #{selectedUnit.unit.unitNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ivory-dim">Expiration Date:</span>
                <span className="font-mono text-ivory">{selectedUnit.unit.expirationDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ivory-dim">Batch Qty Before / After:</span>
                <span className="font-mono text-ivory">
                  {selectedUnit.batch.currentQuantity} →{' '}
                  <strong className="text-gold">{Math.max(0, selectedUnit.batch.currentQuantity - 1)}</strong>
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-ivory-dim mb-1">
                Disposal Reason / Audit Notes (Optional)
              </label>
              <textarea
                rows={2}
                value={disposalReason}
                onChange={(e) => setDisposalReason(e.target.value)}
                placeholder="e.g. Expired shelf-life during monthly inspection"
                className="w-full rounded-md border border-white/10 bg-charcoal px-3 py-2 text-xs text-ivory placeholder-ivory-dim focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ExpirableStockPanel;
