import React, { useEffect, useState } from 'react';
import { AlertCircle, Calendar, CheckCircle2, Clock, Package, Shield, Truck, X } from 'lucide-react';
import type { InventoryForecastItem } from '@demoshop/shared-types';
import { ForecastSparkline } from './ForecastSparkline';
import { ForecastCalibrationBadge } from './ForecastCalibrationBadge';
import { ForecastDayOfWeekHeatmap } from './ForecastDayOfWeekHeatmap';
import { ForecastSawtoothChart } from './ForecastSawtoothChart';
import { ForecastRestockSimulator } from './ForecastRestockSimulator';

interface ForecastItemDetailModalProps {
  item: InventoryForecastItem | null;
  onClose: () => void;
  onRequestRestock?: (item: InventoryForecastItem, quantity: number) => void;
  role?: 'admin' | 'inventory-manager';
}

export const ForecastItemDetailModal: React.FC<ForecastItemDetailModalProps> = ({
  item,
  onClose,
  onRequestRestock,
  role = 'admin',
}) => {
  const [simulatedQuantity, setSimulatedQuantity] = useState(0);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Reset simulation when item changes
  useEffect(() => {
    if (item) {
      setSimulatedQuantity(item.suggestedWeeklyReplenishment || 0);
    }
  }, [item]);

  if (!item) return null;

  const currentStock = Number(item.currentStock) || 0;
  const criticalStock = Number(item.criticalStock) || 0;
  const safetyStock = Number(item.safetyStock) || 0;
  const burnRate = Number(item.averageDailyConsumption) || 0;
  const adjustedRate = Number(item.adjustedDailyConsumption) || burnRate;
  const leadTime = item.supplierLeadTimeDays || 3;

  // Physical stock badge styling
  const renderPhysicalStockBadge = () => {
    if (currentStock <= 0) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-950/30 px-3 py-1 text-xs font-bold uppercase tracking-wider text-red-300">
          <AlertCircle className="h-3.5 w-3.5" />
          Out of Stock
        </span>
      );
    }
    if (criticalStock > 0 && currentStock <= criticalStock) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-red-400/40 bg-red-950/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-red-300">
          <AlertCircle className="h-3.5 w-3.5" />
          Critically Low
        </span>
      );
    }
    if (safetyStock > 0 && currentStock <= safetyStock) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-950/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-amber-300">
          <AlertCircle className="h-3.5 w-3.5" />
          Low Stock
        </span>
      );
    }
    if (safetyStock > 0 && currentStock >= safetyStock * 3) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/40 bg-sky-950/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-sky-300">
          <Package className="h-3.5 w-3.5" />
          Overstock
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-950/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-300">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Healthy Stock
      </span>
    );
  };

  const renderMovementClassBadge = () => {
    const isFast = item.movementClass === 'fast';
    const isSlow = item.movementClass === 'slow';
    const color = isFast
      ? 'border-orange-400/30 bg-orange-950/30 text-orange-200'
      : isSlow
        ? 'border-sky-400/30 bg-sky-950/30 text-sky-200'
        : 'border-white/15 bg-white/5 text-ivory-dim';

    const label = isFast ? 'Fast-Moving (≥1/d)' : isSlow ? 'Slow-Moving (<1/d)' : 'Insufficient Data';
    return (
      <span className={`rounded-full border px-2.5 py-1 text-xs font-bold uppercase tracking-wider ${color}`}>
        {label}
      </span>
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="forecast-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-end bg-black/70 backdrop-blur-sm transition-opacity"
      onClick={onClose}
    >
      <div
        className="h-full w-full max-w-2xl overflow-y-auto border-l border-white/10 bg-charcoal p-6 text-ivory shadow-2xl custom-scrollbar"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-white/10 pb-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold">
                Authoritative Demand Detail
              </span>
              <span className="text-ivory-dim">•</span>
              <span className="text-xs text-ivory-dim">{item.category}</span>
            </div>
            <h3 id="forecast-modal-title" className="mt-1 text-2xl font-serif font-bold text-ivory">
              {item.name}
            </h3>
            <p className="mt-0.5 text-xs text-ivory-dim">
              SKU: {item.productId} · Tracked in {item.ownership} · Unit: {item.unit}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-ivory-dim transition hover:bg-white/10 hover:text-ivory focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold"
            aria-label="Close details"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="mt-6 space-y-6">
          {/* Decoupled Physical Status + Statistical Maturity Row */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-charcoal-light p-4">
            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ivory-dim">
                Physical Stock Status
              </p>
              <div className="flex items-center gap-3">
                {renderPhysicalStockBadge()}
                <span className="text-base font-bold text-ivory">
                  {currentStock} <span className="text-xs font-normal text-ivory-dim">{item.unit} on hand</span>
                </span>
              </div>
            </div>

            <div className="space-y-1 text-right">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ivory-dim">
                Movement & Forecast Availability
              </p>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {renderMovementClassBadge()}
                {item.isCalibrating && (
                  <ForecastCalibrationBadge
                    compact
                    daysTracked={item.calibrationDaysTracked}
                    requiredDays={item.calibrationRequiredDays}
                    preliminaryRate={burnRate}
                    unit={item.unit}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Operational Distinctions: 3 Core Metrics */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {/* Metric 1: Projected Stockout Date */}
            <div className="rounded-xl border border-white/10 bg-charcoal-light p-4">
              <div className="flex items-center gap-1.5 text-xs text-ivory-dim">
                <Calendar className="h-4 w-4 text-red-400" />
                <span className="font-semibold uppercase text-[10px] tracking-wider text-red-300">
                  Estimated Stockout Date
                </span>
              </div>
              <p className="mt-2 text-lg font-bold text-ivory">
                {item.projectedStockoutDate
                  ? item.projectedStockoutDate
                  : currentStock <= 0
                    ? 'Stocked Out'
                    : item.isCalibrating
                      ? item.calibrationDaysTracked === 0
                        ? 'No consumption history'
                        : `Needs 14-day history (${item.calibrationDaysTracked}/14)`
                      : 'No recent use'}
              </p>
              {!item.forecastAvailable && currentStock > 0 && (
                <p className="mt-1 text-xs text-amber-300">
                  {item.isCalibrating
                    ? `A stockout estimate needs ${item.calibrationRequiredDays} calendar days of consumption history; ${item.calibrationDaysTracked} available.`
                    : 'No consumption was recorded in the latest 14 days, so a stockout date is not estimated.'}
                </p>
              )}
              <p className="mt-1 text-[11px] text-ivory-dim">
                Physical stock reaches 0 at ~{adjustedRate.toFixed(2)} {item.unit}/day.
              </p>
            </div>

            {/* Metric 2: Recommended Restock Date / Reorder Deadline */}
            <div className="rounded-xl border border-gold/30 bg-gold/5 p-4">
              <div className="flex items-center gap-1.5 text-xs text-gold">
                <Clock className="h-4 w-4 text-gold" />
                <span className="font-semibold uppercase text-[10px] tracking-wider text-gold">
                  Reorder Deadline
                </span>
              </div>
              <p className="mt-2 text-lg font-bold text-gold">
                {item.reorderDeadlineDays !== null && item.reorderDeadlineDays <= 0
                  ? 'Reorder Now'
                  : item.recommendedRestockDate || '—'}
              </p>
              <p className="mt-1 text-[11px] text-ivory-dim">
                Order before this date to avoid dipping below safety stock.
              </p>
            </div>

            {/* Metric 3: Supplier Lead Time */}
            <div className="rounded-xl border border-white/10 bg-charcoal-light p-4">
              <div className="flex items-center gap-1.5 text-xs text-ivory-dim">
                <Truck className="h-4 w-4 text-sky-400" />
                <span className="font-semibold uppercase text-[10px] tracking-wider text-sky-300">
                  Supplier Lead Time
                </span>
              </div>
              <p className="mt-2 text-lg font-bold text-ivory">
                {leadTime} days
              </p>
              <p className="mt-1 text-[11px] text-ivory-dim truncate" title={item.defaultSupplierName || 'Linked Supplier'}>
                {item.defaultSupplierName || 'Primary supplier'}
              </p>
            </div>
          </div>

          {/* Transparent Replenishment Math Formula */}
          <div className="rounded-xl border border-white/10 bg-charcoal-light p-4 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold uppercase tracking-wider text-[10px] text-gold">
                Transparent Replenishment Math
              </span>
              <span className="text-[11px] font-semibold text-ivory">
                Suggested Weekly: {item.suggestedWeeklyReplenishment == null ? 'Needs consumption history' : `${item.suggestedWeeklyReplenishment} ${item.unit}`}
              </span>
            </div>
            <div className="rounded-lg border border-white/5 bg-charcoal p-3 font-mono text-xs text-ivory">
              {item.suggestedReplenishmentFormula}
            </div>
            <p className="text-[11px] text-ivory-dim">
              Formula: (7-Day Target Supply × Daily Adjusted Burn) + Safety Stock - Current Physical Stock.
            </p>
          </div>

          {/* Phase 3: Sawtooth Depletion & Projection Chart */}
          <ForecastSawtoothChart
            item={item}
            additionalUnits={simulatedQuantity}
          />

          {/* Phase 3: Interactive Restock Quantity Simulator */}
          <ForecastRestockSimulator
            item={item}
            quantity={simulatedQuantity}
            onChange={setSimulatedQuantity}
            onRequestRestock={
              onRequestRestock
                ? (qty) => onRequestRestock(item, qty)
                : undefined
            }
          />

          {/* 7-Day Day-of-Week Rush Heatmap */}
          <ForecastDayOfWeekHeatmap
            data={item.dayOfWeekIntensity}
            unit={item.unit}
          />

        </div>
      </div>
    </div>
  );
};

export default ForecastItemDetailModal;
