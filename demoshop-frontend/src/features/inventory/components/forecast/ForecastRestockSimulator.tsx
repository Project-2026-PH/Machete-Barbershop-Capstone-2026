import React, { useMemo } from 'react';
import { Calculator, Calendar, Minus, Plus, ShoppingCart } from 'lucide-react';
import type { InventoryForecastItem } from '@demoshop/shared-types';
import { Button } from '@/components/ui/Button';

interface ForecastRestockSimulatorProps {
  item: InventoryForecastItem;
  quantity: number;
  onChange: (quantity: number) => void;
  onRequestRestock?: (quantity: number) => void;
  className?: string;
}

export const ForecastRestockSimulator: React.FC<ForecastRestockSimulatorProps> = ({
  item,
  quantity,
  onChange,
  onRequestRestock,
  className = '',
}) => {
  const currentStock = Number(item.currentStock) || 0;
  const burnRate = item.forecastAvailable ? Math.max(0, Number(item.adjustedDailyConsumption) || 0) : 0;
  const costPrice = Number(item.costPrice) || 0;
  const safetyStock = Number(item.safetyStock) || 0;

  // Max slider range: either 60 units or ~60 days supply
  const maxSimulation = Math.max(50, Math.ceil(burnRate * 45));

  // Calculations
  const currentRunwayDays = burnRate > 0 ? Number((currentStock / burnRate).toFixed(1)) : null;
  const simulatedRunwayDays = burnRate > 0 ? Number(((currentStock + quantity) / burnRate).toFixed(1)) : null;
  const runwayGainDays = currentRunwayDays !== null && simulatedRunwayDays !== null
    ? Number((simulatedRunwayDays - currentRunwayDays).toFixed(1))
    : null;

  // New simulated stockout date
  const simulatedStockoutDate = useMemo(() => {
    if (burnRate <= 0 || !item.forecastAvailable || simulatedRunwayDays === null) return null;
    const d = new Date();
    d.setDate(d.getDate() + Math.ceil(simulatedRunwayDays));
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }, [burnRate, item.forecastAvailable, simulatedRunwayDays]);

  const estimatedSpend = quantity * costPrice;

  const handleStep = (delta: number) => {
    onChange(Math.max(0, Math.min(maxSimulation, quantity + delta)));
  };

  return (
    <div className={`space-y-4 rounded-xl border border-white/10 bg-charcoal-light p-4 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calculator className="h-4 w-4 text-gold" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-ivory">
            Interactive Restock Impact Preview
          </h4>
        </div>
        <span className="text-[11px] text-ivory-dim">
          Daily use: <strong className="text-ivory">{item.forecastAvailable ? `${burnRate.toFixed(2)} ${item.unit}/day` : 'not estimated yet'}</strong>
        </span>
      </div>

      {!item.forecastAvailable && (
        <p role="status" className="rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-xs text-amber-200">
          {item.forecastUnavailableReason || 'A restock impact estimate needs at least 14 calendar days of consumption history.'}
        </p>
      )}

      {/* Stepper + Quick Presets */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center rounded-lg border border-white/10 bg-charcoal p-1">
          <button
            type="button"
            onClick={() => handleStep(-1)}
            disabled={quantity <= 0}
            className="flex h-8 w-8 items-center justify-center rounded text-ivory-dim transition hover:bg-white/10 hover:text-ivory disabled:opacity-30"
            aria-label="Decrease quantity"
          >
            <Minus className="h-4 w-4" />
          </button>
          <input
            type="number"
            min={0}
            max={maxSimulation}
            value={quantity}
            onChange={(e) => onChange(Math.max(0, Math.min(maxSimulation, Number(e.target.value) || 0)))}
            className="w-16 bg-transparent text-center font-mono text-base font-bold text-gold focus:outline-none"
            aria-label="Restock quantity to simulate"
          />
          <button
            type="button"
            onClick={() => handleStep(1)}
            disabled={quantity >= maxSimulation}
            className="flex h-8 w-8 items-center justify-center rounded text-ivory-dim transition hover:bg-white/10 hover:text-ivory disabled:opacity-30"
            aria-label="Increase quantity"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {/* Quick Suggestion Presets */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-[11px] text-ivory-dim">Presets:</span>
          {item.suggestedWeeklyReplenishment && item.suggestedWeeklyReplenishment > 0 && (
            <button
              type="button"
              onClick={() => onChange(item.suggestedWeeklyReplenishment!)}
              className="rounded-md border border-gold/30 bg-gold/10 px-2 py-1 text-[11px] font-semibold text-gold hover:bg-gold/20"
            >
              1-Week (+{item.suggestedWeeklyReplenishment} {item.unit})
            </button>
          )}
          {item.suggestedMonthlyReplenishment && item.suggestedMonthlyReplenishment > 0 && (
            <button
              type="button"
              onClick={() => onChange(item.suggestedMonthlyReplenishment!)}
              className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[11px] font-medium text-ivory hover:bg-white/10"
            >
              1-Month (+{item.suggestedMonthlyReplenishment} {item.unit})
            </button>
          )}
          <button
            type="button"
            onClick={() => onChange(Math.max(0, Math.ceil(safetyStock - currentStock)))}
            className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[11px] font-medium text-ivory hover:bg-white/10"
          >
            Safety Target
          </button>
        </div>
      </div>

      {/* Slider */}
      <div className="space-y-1">
        <input
          type="range"
          min={0}
          max={maxSimulation}
          value={quantity}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-charcoal accent-gold"
          aria-label="Restock quantity slider"
        />
        <div className="flex justify-between text-[10px] text-ivory-dim">
          <span>0 units</span>
          <span>{Math.round(maxSimulation / 2)} units</span>
          <span>+{maxSimulation} units</span>
        </div>
      </div>

      {/* Dynamic Results Card */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 rounded-lg border border-gold/20 bg-charcoal p-3 text-xs">
        <div>
          <p className="text-[10px] uppercase text-ivory-dim">Simulated Stock</p>
          <p className="mt-0.5 text-base font-bold text-ivory">
            {currentStock + quantity} <span className="text-xs font-normal text-ivory-dim">{item.unit}</span>
          </p>
        </div>

        <div>
          <p className="text-[10px] uppercase text-ivory-dim">Extra days of stock</p>
          <p className="mt-0.5 text-base font-bold text-emerald-400">
            {runwayGainDays === null ? '—' : `+${runwayGainDays}`} <span className="text-xs font-normal">{runwayGainDays === null ? '' : 'days'}</span>
          </p>
          <p className="text-[10px] text-ivory-dim font-mono">Estimated total: {simulatedRunwayDays === null ? 'Needs history' : `${simulatedRunwayDays} days`}</p>
        </div>

        <div>
          <p className="text-[10px] uppercase text-ivory-dim">Estimated Stockout Date</p>
          <p className="mt-0.5 text-xs font-semibold text-sky-300 flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {simulatedStockoutDate || '—'}
          </p>
        </div>

        <div>
          <p className="text-[10px] uppercase text-ivory-dim">Estimated Cost</p>
          <p className="mt-0.5 text-base font-bold text-gold">
            ₱{estimatedSpend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[10px] text-ivory-dim">@ ₱{costPrice.toFixed(2)}/unit</p>
        </div>
      </div>

      {onRequestRestock && quantity > 0 && (
        <div className="flex justify-end pt-1">
          <Button
            type="button"
            variant="primary"
            onClick={() => onRequestRestock(quantity)}
            className="flex items-center gap-2 text-xs"
          >
            <ShoppingCart className="h-3.5 w-3.5" />
            Apply {quantity} {item.unit} to Purchase Order
          </Button>
        </div>
      )}
    </div>
  );
};

export default ForecastRestockSimulator;
