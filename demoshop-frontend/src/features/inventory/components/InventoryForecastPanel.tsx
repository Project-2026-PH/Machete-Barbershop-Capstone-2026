import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Info,
  PackageCheck,
} from 'lucide-react';
import type {
  InventoryForecastItem,
  InventoryForecastResponse,
  InventoryMovementClass,
} from '@demoshop/shared-types';
import { Tooltip } from '@/components/ui/Tooltip';
import { api } from '@/config/api';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/feedback/ToastContext';
import { cachedRequest, invalidateRequests } from '@/utils/request-cache';
import ForecastDemandProjectionChart from './forecast/ForecastDemandProjectionChart';
import { useInventoryRealtime } from '@/features/inventory-manager/shared/hooks/useInventoryRealtime';

type ForecastItem = InventoryForecastItem;
type MovementFilter = 'all' | InventoryMovementClass;

interface InventoryForecastPanelProps {
  role: 'admin' | 'inventory-manager';
}

const ForecastLoading: React.FC = () => (
  <div className="space-y-5" aria-label="Loading inventory forecast" aria-busy="true">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {[0, 1, 2].map((index) => (
        <div key={index} className="rounded-xl border border-white/10 bg-charcoal-light p-4">
          <Skeleton variant="text" className="h-3 w-32" />
          <Skeleton variant="text" className="mt-3 h-7 w-24" />
        </div>
      ))}
    </div>

    {/* Hero Trajectory Chart Skeleton */}
    <div className="rounded-2xl border border-white/10 bg-charcoal-light p-5 space-y-4">
      <Skeleton variant="text" className="h-5 w-72" />
      <Skeleton variant="rect" className="h-20 w-full rounded-xl" />
      <Skeleton variant="rect" className="h-64 w-full rounded-xl" />
    </div>

    <div className="overflow-hidden rounded-xl border border-white/10">
      <div className="grid grid-cols-5 gap-4 bg-charcoal-light px-4 py-3">
        {[0, 1, 2, 3, 4].map((index) => (
          <Skeleton key={index} variant="text" className="h-3" />
        ))}
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <React.Fragment key={index}>
            {[0, 1, 2, 3, 4].map((cell) => (
              <Skeleton
                key={cell}
                variant={cell === 0 ? 'rect' : 'text'}
                className={cell === 0 ? 'h-5 w-5 rounded-sm' : 'h-4'}
              />
            ))}
          </React.Fragment>
        ))}
      </div>
    </div>
  </div>
);

const findMostCriticalItem = (itemsList: ForecastItem[]): ForecastItem | null => {
  if (!itemsList || itemsList.length === 0) return null;

  const preferredNames = ['cotton balls', 'tissue'];

  // 1. Check if preferred items (Tissue or Cotton Balls) are at risk
  const preferredCritical = itemsList.find((it) => {
    const lower = it.name.toLowerCase();
    const isPreferred = preferredNames.some((p) => lower.includes(p));
    const isRisk =
      it.currentStock <= it.safetyStock ||
      it.currentStock <= it.criticalStock ||
      (it.daysOfStockRemaining !== null && it.daysOfStockRemaining <= 14);
    return isPreferred && isRisk;
  });
  if (preferredCritical) return preferredCritical;

  // 2. Out of stock item
  const outOfStock = itemsList.find((it) => it.currentStock <= 0);
  if (outOfStock) return outOfStock;

  // 3. Critically low item (currentStock <= criticalStock)
  const criticallyLow = itemsList.find((it) => it.criticalStock > 0 && it.currentStock <= it.criticalStock);
  if (criticallyLow) return criticallyLow;

  // 4. Lowest days of stock remaining (under 14 days)
  const urgent = [...itemsList]
    .filter((it) => it.daysOfStockRemaining !== null && it.daysOfStockRemaining !== undefined)
    .sort((a, b) => (a.daysOfStockRemaining ?? 999) - (b.daysOfStockRemaining ?? 999))[0];
  if (urgent && (urgent.daysOfStockRemaining ?? 999) <= 14) {
    return urgent;
  }

  // 5. Below safety buffer
  const belowSafety = itemsList.find((it) => it.safetyStock > 0 && it.currentStock <= it.safetyStock);
  if (belowSafety) return belowSafety;

  // 6. Any Cotton Balls or Tissue
  const preferredAny = itemsList.find((it) => {
    const lower = it.name.toLowerCase();
    return preferredNames.some((p) => lower.includes(p));
  });
  if (preferredAny) return preferredAny;

  // 7. Fallback to first item
  return itemsList[0];
};

const InventoryForecastPanel: React.FC<InventoryForecastPanelProps> = ({ role }) => {
  const [items, setItems] = useState<ForecastItem[]>([]);
  const [inspectedItem, setInspectedItem] = useState<ForecastItem | null>(null);
  const [movementFilter, setMovementFilter] = useState<MovementFilter>('all');
  const [selectedStockIds, setSelectedStockIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [submittingBulk, setSubmittingBulk] = useState(false);
  const [error, setError] = useState('');
  const { addToast } = useToast();

  const load = useCallback(async (force = false, isBackground = false) => {
    if (force) {
      invalidateRequests('inventory:forecast');
    }
    if (!isBackground) {
      setLoading(true);
    }
    setError('');
    try {
      const forecastResponse = await cachedRequest(
        'inventory:forecast',
        () => api.get<InventoryForecastResponse>('/api/inventory/forecast'),
        15_000,
      );
      const payload = forecastResponse.data;
      setItems(Array.isArray(payload?.items) ? payload.items : []);
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || 'Forecast data could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load on mount
  useEffect(() => {
    void load();
  }, [load]);

  // Reactive Hasura & Supabase realtime subscription replacing aggressive polling
  useInventoryRealtime({
    channelName: 'inventory-forecast-realtime',
    tables: [
      'inventory_stock',
      'inventory_consumption',
      'purchase_orders',
      'inventory_products',
      'inventory_stock_movements',
    ],
    windowEvents: [
      'demoshop:inventory-changed',
      'demoshop:purchase-orders-changed',
      'demoshop:stock-count-changed',
    ],
    refetchOnFocus: true,
    debounceMs: 400,
    onReload: () => void load(true, true),
  });

  // Keep inspectedItem synchronized with fresh item data or set initial critical default
  useEffect(() => {
    if (items.length > 0) {
      setInspectedItem((prev) => {
        if (prev) {
          const fresh = items.find((it) => it.id === prev.id);
          if (fresh) return fresh;
        }
        return findMostCriticalItem(items);
      });
    }
  }, [items]);


  const filteredItems = useMemo(
    () => (movementFilter === 'all' ? items : items.filter((item) => item.movementClass === movementFilter)),
    [items, movementFilter],
  );

  const handleFilterChange = (filter: MovementFilter) => {
    setMovementFilter(filter);
  };

  const recommendation = useCallback(
    (item: ForecastItem): number | null =>
      item.movementClass !== 'insufficient_data' && item.forecastAvailable && item.suggestedWeeklyReplenishment !== null
        ? Math.max(1, Math.ceil(item.suggestedWeeklyReplenishment))
        : null,
    [],
  );

  const isRequestable = useCallback(
    (item: ForecastItem) => role === 'inventory-manager' && recommendation(item) !== null,
    [recommendation, role],
  );

  const selectedItems = useMemo(
    () => items.filter((item) => selectedStockIds.has(item.id) && isRequestable(item)),
    [isRequestable, items, selectedStockIds],
  );

  const visibleRequestableItems = useMemo(
    () => filteredItems.filter(isRequestable),
    [filteredItems, isRequestable],
  );

  const movementSummary = useMemo(
    () => ({
      fast: items.filter((item) => item.movementClass === 'fast').length,
      slow: items.filter((item) => item.movementClass === 'slow').length,
      insufficientData: items.filter((item) => item.movementClass === 'insufficient_data').length,
    }),
    [items],
  );

  const toggleSelection = (item: ForecastItem) => {
    if (!isRequestable(item)) return;
    setSelectedStockIds((current) => {
      const next = new Set(current);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedStockIds((current) => {
      const next = new Set(current);
      const allSelected = visibleRequestableItems.every((item) => next.has(item.id));
      visibleRequestableItems.forEach((item) => {
        if (allSelected) next.delete(item.id);
        else next.add(item.id);
      });
      return next;
    });
  };

  const submitBulkRequest = async () => {
    if (selectedItems.length === 0 || submittingBulk) return;
    setSubmittingBulk(true);
    try {
      const lines = selectedItems.map((item) => ({
        inventoryStockId: Number(item.id),
        quantityRequested: recommendation(item),
      }));
      const itemNames = selectedItems.map((item) => item.name).join(', ');
      await api.post('/api/inventory/purchase-orders', {
        status: 'pending',
        notes: `Forecast bulk request: ${itemNames}`.slice(0, 1000),
        lines,
      });
      setSelectedStockIds(new Set());
      window.dispatchEvent(new Event('demoshop:purchase-orders-changed'));
      addToast({
        type: 'success',
        title: 'Stock request submitted',
        message: `${selectedItems.length} item${selectedItems.length === 1 ? '' : 's'} were submitted together for Admin approval.`,
      });
      await load(true);
    } catch (requestError: any) {
      addToast({
        type: 'error',
        title: 'Stock request could not be submitted',
        message: requestError?.response?.data?.message || 'Please review the selected items and try again.',
      });
    } finally {
      setSubmittingBulk(false);
    }
  };

  return (
    <section className="space-y-6">
      {/* Top Controls: Live Sync Indicator */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-gold">Operational Demand Forecast</h3>
          <p className="text-xs text-ivory-dim">Recent usage, estimated days of stock left, and suggested replenishment.</p>
        </div>

        {/* Live Automatic Sync Status Indicator */}
        <div className="flex items-center gap-3">
          <div
            className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-950/20 px-2.5 py-1 text-xs text-emerald-400 font-medium"
            role="status"
            aria-label="Live automatic data synchronization active"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span>Live sync</span>
          </div>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-red-400/30 bg-red-950/20 p-4 text-sm text-red-200">
          {error}
        </div>
      )}

      {loading ? (
        <ForecastLoading />
      ) : (
        <div className="space-y-6">
              {/* Part 1: Three KPI Summary Cards (STRICTLY READ-ONLY STATIC METRICS) */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {/* Card 1: Fast-moving */}
                <Tooltip title="Fast-moving Products" content="Authoritative burn rate averaging at least 1 unit consumed per day over the 14-day window.">
                  <div
                    role="region"
                    aria-label="Fast moving items count"
                    className="w-full rounded-xl border border-orange-400/30 bg-orange-950/20 p-4 select-none"
                  >
                    <p className="text-xs text-orange-200 font-medium">Fast-moving</p>
                    <p className="mt-1 text-2xl font-bold text-orange-200">{movementSummary.fast} items</p>
                    <p className="mt-1 text-[11px] text-orange-200/70">≥ 1 unit / day burn</p>
                  </div>
                </Tooltip>

                {/* Card 2: Slow-moving */}
                <Tooltip title="Slow-moving Products" content="Products with positive daily consumption below 1 unit per day over the 14-day window.">
                  <div
                    role="region"
                    aria-label="Slow moving items count"
                    className="w-full rounded-xl border border-sky-400/30 bg-sky-950/20 p-4 select-none"
                  >
                    <p className="text-xs text-sky-200 font-medium">Slow-moving</p>
                    <p className="mt-1 text-2xl font-bold text-sky-200">{movementSummary.slow} items</p>
                    <p className="mt-1 text-[11px] text-sky-200/70">&gt; 0 and &lt; 1 unit / day</p>
                  </div>
                </Tooltip>

                {/* Card 3: Insufficient Data */}
                <Tooltip title="No forecast yet" content="We need 14 calendar days of consumption history and recent recorded use before estimating days of stock left, stockout date, or replenishment quantity.">
                  <div
                    role="region"
                    aria-label="Insufficient data items count"
                    className="w-full rounded-xl border border-white/15 bg-white/5 p-4 select-none"
                  >
                    <p className="text-xs text-ivory-dim font-medium">No forecast yet</p>
                    <p className="mt-1 text-2xl font-bold text-ivory">{movementSummary.insufficientData} items</p>
                    <p className="mt-1 text-[11px] text-ivory-dim/80">Needs recent use and 14-day history</p>
                  </div>
                </Tooltip>
              </div>

              {/* Methodology Description Banner */}
              <div className="flex items-center gap-2 rounded-lg border border-white/5 bg-charcoal p-3 text-xs text-ivory-dim">
                <Info className="h-4 w-4 text-gold shrink-0" />
                <span>
                  <strong className="text-ivory">How estimates work:</strong> We use recorded use from the last 14 calendar days. If there is not enough history or no recent use, we leave stock-left, stockout-date and restock estimates blank. Fast-moving means at least 1 unit/day; slow-moving means more than 0 and less than 1 unit/day. Physical stock risks still appear.
                </span>
              </div>

              {/* Bulk Stock Request Action Bar (Inventory Manager Role) */}
              {role === 'inventory-manager' && (
                <section className="flex flex-col gap-3 rounded-xl border border-gold/25 bg-gold/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold">Stock request</p>
                    <p className="mt-1 text-sm text-ivory">Select forecastable items to submit one request for Admin approval.</p>
                    <p className="mt-1 text-xs text-ivory-dim">
                      {selectedItems.length} selected · {visibleRequestableItems.length} available in this view
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={selectAllVisible}
                      className="text-xs font-semibold text-gold underline-offset-4 hover:underline"
                    >
                      {visibleRequestableItems.length > 0 &&
                      visibleRequestableItems.every((item) => selectedStockIds.has(item.id))
                        ? 'Clear visible'
                        : 'Select visible'}
                    </button>
                    {selectedItems.length > 0 && (
                      <Button
                        type="button"
                        variant="primary"
                        className="min-w-[220px] whitespace-nowrap hover:tracking-widest"
                        disabled={submittingBulk}
                        onClick={() => void submitBulkRequest()}
                      >
                        <PackageCheck className="h-4 w-4" />
                        {submittingBulk ? 'Submitting request…' : `Submit Stock Request (${selectedItems.length})`}
                      </Button>
                    )}
                  </div>
                </section>
              )}



              {/* Section: Interactive Forecasting Charts & Product Analysis Table */}
              <section className="space-y-6">
                {/* 1. Fourteen-day demand history and replenishment projection */}
                <ForecastDemandProjectionChart
                  items={items}
                  role={role}
                  movementFilter={movementFilter}
                  selectedStockIds={selectedStockIds}
                  selectedItemId={inspectedItem?.id}
                  isRequestable={isRequestable}
                  onMovementFilterChange={handleFilterChange}
                  onToggleStockSelection={toggleSelection}
                  onSelectItem={(item) => setInspectedItem(item)}
                />
              </section>
            </div>
          )}
    </section>
  );
};

export default InventoryForecastPanel;
