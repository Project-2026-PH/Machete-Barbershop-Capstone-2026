import React, { useMemo } from 'react';
import { Activity, BarChart3, PackagePlus } from 'lucide-react';
import type { InventoryForecastItem, InventoryMovementClass } from '@demoshop/shared-types';

type MovementFilter = 'all' | InventoryMovementClass;

interface ForecastDemandProjectionChartProps {
  items: InventoryForecastItem[];
  role: 'admin' | 'inventory-manager';
  movementFilter: MovementFilter;
  selectedStockIds: ReadonlySet<string>;
  selectedItemId?: string | null;
  isRequestable: (item: InventoryForecastItem) => boolean;
  onMovementFilterChange: (filter: MovementFilter) => void;
  onToggleStockSelection: (item: InventoryForecastItem) => void;
  onSelectItem: (item: InventoryForecastItem) => void;
  className?: string;
}

const HISTORY_DAYS = 14;
const MOVEMENT_FILTERS: InventoryMovementClass[] = ['fast', 'slow', 'insufficient_data'];

const formatQuantity = (value: number | null | undefined, maximumFractionDigits = 2) =>
  value == null || !Number.isFinite(Number(value))
    ? '—'
    : new Intl.NumberFormat('en-PH', { maximumFractionDigits }).format(Number(value));

const formatDate = (value: string | null | undefined) => {
  if (!value) return 'Not projected';
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
};

const movementLabel = (movementClass: InventoryMovementClass) => ({
  fast: 'Fast-moving',
  slow: 'Slow-moving',
  insufficient_data: 'Insufficient data',
}[movementClass]);

const ForecastDemandProjectionChart: React.FC<ForecastDemandProjectionChartProps> = ({
  items = [],
  role,
  movementFilter,
  selectedStockIds,
  selectedItemId,
  isRequestable,
  onMovementFilterChange,
  onToggleStockSelection,
  onSelectItem,
  className = '',
}) => {
  const movementSummary = useMemo(() => ({
    fast: items.filter((item) => item.movementClass === 'fast').length,
    slow: items.filter((item) => item.movementClass === 'slow').length,
    insufficientData: items.filter((item) => item.movementClass === 'insufficient_data').length,
  }), [items]);

  const visibleItems = useMemo(() => {
    const filtered = movementFilter === 'all'
      ? items
      : items.filter((item) => item.movementClass === movementFilter);
    return [...filtered].sort((a, b) => {
      const aStockDays = a.daysOfStockRemaining ?? Number.POSITIVE_INFINITY;
      const bStockDays = b.daysOfStockRemaining ?? Number.POSITIVE_INFINITY;
      return aStockDays - bStockDays || a.name.localeCompare(b.name);
    });
  }, [items, movementFilter]);

  const urgentCount = visibleItems.filter((item) =>
    item.forecastAvailable
    && item.daysOfStockRemaining !== null
    && item.daysOfStockRemaining <= item.supplierLeadTimeDays,
  ).length;
  const columnCount = role === 'inventory-manager' ? 8 : 7;

  return (
    <section className={`space-y-4 rounded-2xl border border-white/10 bg-charcoal-light p-4 shadow-xl sm:p-5 ${className}`}>
      <header className="flex flex-col gap-3 border-b border-white/10 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-gold">
            <BarChart3 className="h-4 w-4" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Demand forecast</span>
            <span className="rounded-full border border-gold/25 bg-gold/10 px-2 py-0.5 text-[9px] font-bold text-gold">
              {HISTORY_DAYS}-DAY HISTORY
            </span>
          </div>
          <h2 className="mt-1 text-base font-bold text-ivory sm:text-lg">Movement, Stock Left & Replenishment</h2>
          <p className="mt-0.5 max-w-3xl text-xs text-ivory-dim">
            Actual daily use, movement rate, estimated days of stock left, stockout date and suggested 7-day restock.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-ivory-dim">
            Movement:
            <select
              aria-label="Filter forecast table by movement"
              value={movementFilter}
              onChange={(event) => onMovementFilterChange(event.target.value as MovementFilter)}
              className="rounded-md border border-white/10 bg-charcoal px-3 py-1.5 text-xs text-ivory focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold"
            >
              <option value="all">All items ({items.length})</option>
              {MOVEMENT_FILTERS.map((movementClass) => {
                const count = movementClass === 'insufficient_data'
                  ? movementSummary.insufficientData
                  : movementSummary[movementClass];
                return (
                  <option key={movementClass} value={movementClass}>
                    {movementLabel(movementClass)} ({count})
                  </option>
                );
              })}
            </select>
          </label>
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-charcoal px-3 py-1.5 text-xs text-ivory-dim">
            <Activity className="h-3.5 w-3.5 text-emerald-400" />
            <span>{urgentCount} at or below supplier lead time</span>
          </div>
        </div>
      </header>

      <div className="overflow-x-auto rounded-xl border border-white/10" role="region" aria-label="Fourteen-day inventory forecast table" tabIndex={0}>
        <table className="w-full min-w-[1080px] text-left text-sm">
          <thead className="border-b border-white/10 bg-charcoal-light text-[10px] font-semibold uppercase tracking-wider text-ivory-dim">
            <tr>
              {role === 'inventory-manager' && <th className="px-3 py-3 text-center">Request</th>}
              <th className="px-4 py-3">Item</th>
              <th className="px-3 py-3">14-day daily usage</th>
              <th className="px-3 py-3">Movement rate</th>
              <th className="px-3 py-3 text-right">Current stock</th>
              <th className="px-3 py-3 text-right">Stock left (days)</th>
              <th className="px-3 py-3">Projected stockout</th>
              <th className="px-3 py-3 text-right">Suggested 7-day restock</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {visibleItems.map((item) => {
              const history = Array.isArray(item.dailyBurnRateHistory)
                ? item.dailyBurnRateHistory.slice(-HISTORY_DAYS)
                : [];
              const maxDailyConsumption = Math.max(0, ...history.map((point) => Number(point.quantity) || 0));
              const actualConsumption = history.reduce((total, point) => total + (Number(point.quantity) || 0), 0);
              const daysOfStockLeft = item.daysOfStockRemaining;
              const isUrgent = item.forecastAvailable && daysOfStockLeft !== null && daysOfStockLeft <= item.supplierLeadTimeDays;
              const noEstimateLabel = item.isCalibrating
                ? item.calibrationDaysTracked === 0
                  ? 'No consumption history'
                  : `Needs 14-day history (${item.calibrationDaysTracked}/14)`
                : 'No recent use';
              const noEstimateTitle = item.forecastUnavailableReason || 'No consumption was recorded in the recent history window.';
              const canRequest = role === 'inventory-manager' && isRequestable(item);
              const isSelected = selectedItemId === item.id;

              return (
                <tr key={item.id} className={isSelected ? 'bg-gold/10' : 'hover:bg-white/[0.03]'}>
                  {role === 'inventory-manager' && (
                    <td className="px-3 py-3 text-center">
                      {canRequest ? (
                        <input
                          type="checkbox"
                          checked={selectedStockIds.has(item.id)}
                          onChange={() => onToggleStockSelection(item)}
                          aria-label={`Select ${item.name} for stock request`}
                          className="h-4 w-4 accent-gold"
                        />
                      ) : <span className="text-ivory-dim/50" aria-label="Not requestable">—</span>}
                    </td>
                  )}
                  <td className="max-w-[220px] px-4 py-3">
                    <button
                      type="button"
                      onClick={() => onSelectItem(item)}
                      aria-pressed={isSelected}
                      className="block max-w-full text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold"
                    >
                      <span className="block truncate font-semibold text-ivory">{item.name}</span>
                      <span className="mt-0.5 block truncate text-[10px] text-ivory-dim">
                        {item.category} · {item.ownership} · {item.movementClass.replace('_', ' ')}
                      </span>
                    </button>
                  </td>
                  <td className="min-w-[180px] px-3 py-3">
                    <div className="flex h-8 items-end gap-0.5" role="img" aria-label={`${HISTORY_DAYS}-day consumption history for ${item.name}`}>
                      {Array.from({ length: HISTORY_DAYS }, (_, index) => {
                        const point = history[index];
                        const quantity = Number(point?.quantity) || 0;
                        const barHeight = maxDailyConsumption > 0 && quantity > 0
                          ? Math.max(12, (quantity / maxDailyConsumption) * 100)
                          : 4;
                        return (
                          <span
                            key={point?.date || `empty-${index}`}
                            title={`${point?.date || 'No date'}: ${formatQuantity(quantity, 2)} ${item.unit || 'units'}`}
                            className={`min-w-0 flex-1 rounded-t-sm ${quantity > 0 ? 'bg-sky-400/80' : 'bg-white/10'}`}
                            style={{ height: `${barHeight}%` }}
                            aria-hidden="true"
                          />
                        );
                      })}
                    </div>
                    <span className="mt-1 block text-[10px] text-ivory-dim">
                      {formatQuantity(actualConsumption, 2)} {item.unit || 'units'} total
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-sky-300">
                    {item.forecastAvailable ? `${formatQuantity(item.movementRatePerDay, 3)} ${item.unit || 'units'}/day` : '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right font-mono text-xs text-ivory">
                    {formatQuantity(item.currentStock, 2)} {item.unit || 'units'}
                  </td>
                  <td
                    title={item.forecastAvailable ? undefined : noEstimateTitle}
                    className={`whitespace-nowrap px-3 py-3 text-right font-mono text-xs font-bold ${
                      !item.forecastAvailable ? 'text-amber-300' : isUrgent ? 'text-red-300' : daysOfStockLeft !== null && daysOfStockLeft <= 7 ? 'text-amber-300' : 'text-emerald-300'
                    }`}
                  >
                    {item.forecastAvailable && daysOfStockLeft !== null
                      ? `${formatQuantity(daysOfStockLeft, 1)} days`
                      : noEstimateLabel}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs text-ivory" title={item.forecastAvailable ? undefined : noEstimateTitle}>
                    {item.forecastAvailable
                      ? formatDate(item.projectedStockoutDate)
                      : noEstimateLabel}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right font-mono text-xs font-bold text-gold">
                    {item.suggestedWeeklyReplenishment == null
                      ? '—'
                      : `${formatQuantity(item.suggestedWeeklyReplenishment, 0)} ${item.unit || 'units'}`}
                  </td>
                </tr>
              );
            })}
            {visibleItems.length === 0 && (
              <tr>
                <td colSpan={columnCount} className="px-4 py-8 text-center text-sm text-ivory-dim">
                  No inventory items match this movement filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="border-t border-white/5 pt-3 text-[10px] text-ivory-dim">
        Stock estimates need at least 14 calendar days of consumption history and recent recorded use. Until then, the table explains why no stock-left, stockout-date or restock estimate is available. Suggested restock covers the next 7 days of expected use plus safety stock.
      </p>
      {role === 'inventory-manager' && (
        <p className="text-[10px] text-ivory-dim"><PackagePlus className="mr-1 inline h-3 w-3 text-gold" />Select requestable rows to prepare one stock request for Admin approval.</p>
      )}
    </section>
  );
};

export default ForecastDemandProjectionChart;
