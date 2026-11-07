import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  DollarSign,
  Flame,
  Info,
  Layers,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import type { InventoryHistoricalAnalytics, InventoryForecastItem } from '@demoshop/shared-types';
import { Tooltip } from '@/components/ui/Tooltip';

interface ForecastHistoricalAnalyticsProps {
  analytics?: InventoryHistoricalAnalytics;
  items: InventoryForecastItem[];
  className?: string;
}

export const ForecastHistoricalAnalytics: React.FC<ForecastHistoricalAnalyticsProps> = ({
  analytics,
  items,
  className = '',
}) => {
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);

  const monthsLogged = analytics?.monthsLogged ?? 6;
  const isMaturityReached = analytics?.isMaturityReached ?? false;
  const maturityPercent = analytics?.maturityProgressPercent ?? Math.min(100, Math.round((monthsLogged / 12) * 100));

  const seasonality = analytics?.seasonality ?? [];
  const spendTrend = analytics?.spendTrend ?? [];
  const tierMigrations = analytics?.tierMigrations ?? [];

  // Max spend and max units for combo visual scaling
  const maxUnits = Math.max(10, ...spendTrend.map((s) => s.totalUnits));
  const maxSpend = Math.max(100, ...spendTrend.map((s) => s.restockSpend));

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Maturity-Aware YoY Banner */}
      <div className="rounded-xl border border-gold/30 bg-gold/5 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-gold" />
              <h3 className="font-bold text-ivory">12-Month Strategic Purchasing & Seasonality Baseline</h3>
            </div>
            <p className="text-xs text-ivory-dim max-w-2xl">
              Historical trends reveal cyclical barbershop demand surges (holiday styling, back-to-school rushes, summer lulls)
              to empower bulk ordering discounts and eliminate seasonal stockouts.
            </p>
          </div>

          <div className="rounded-lg border border-white/10 bg-charcoal p-3 min-w-[200px]">
            <div className="flex items-center justify-between text-xs">
              <span className="text-ivory-dim">Annual Baseline:</span>
              <span className="font-mono font-bold text-gold">{monthsLogged} / 12 Months Logged</span>
            </div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-gold rounded-full transition-all duration-500"
                style={{ width: `${maturityPercent}%` }}
              />
            </div>
            <p className="mt-1.5 text-[10px] text-ivory-dim">
              {isMaturityReached
                ? 'Full 12-month annual maturity reached. YoY overlays active.'
                : 'Benchmark calibration active until 12 full months are recorded.'}
            </p>
          </div>
        </div>
      </div>

      {/* 12-Month Seasonality Heatmap (Jan - Dec) */}
      <div className="space-y-3 rounded-xl border border-white/10 bg-charcoal-light p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gold" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-ivory">
                12-Month Seasonality Heatmap (Jan – Dec)
              </h4>
            </div>
            <p className="mt-0.5 text-xs text-ivory-dim">
              Seasonality Index reflects consumption relative to baseline (1.00x = standard monthly demand).
            </p>
          </div>

          <div className="flex items-center gap-3 text-[11px] text-ivory-dim">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              Peak Season (&gt;1.10x)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-sky-400" />
              Quiet Lull (&lt;0.95x)
            </span>
          </div>
        </div>

        {/* 12 Months Grid */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-12">
          {seasonality.map((m) => {
            const isSelected = selectedMonth === m.month;
            const isPeak = m.seasonalityIndex >= 1.15 || m.isPeak;
            const isLull = m.seasonalityIndex <= 0.90 || m.isLull;

            const cardBg = isPeak
              ? 'border-amber-400/40 bg-amber-950/20 text-amber-200 hover:bg-amber-950/30'
              : isLull
                ? 'border-sky-400/30 bg-sky-950/20 text-sky-200 hover:bg-sky-950/30'
                : 'border-white/10 bg-charcoal text-ivory hover:bg-white/5';

            return (
              <button
                key={m.month}
                type="button"
                onClick={() => setSelectedMonth(isSelected ? null : m.month)}
                className={`flex flex-col items-center justify-center rounded-lg border p-3 transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold ${cardBg} ${
                  isSelected ? 'ring-2 ring-gold' : ''
                }`}
                aria-label={`${m.monthName}: ${m.seasonalityIndex}x multiplier (${m.label || 'Standard'})`}
              >
                <span className="text-[11px] font-bold uppercase tracking-wider opacity-80">
                  {m.monthName}
                </span>
                <span className="mt-1 text-base font-bold font-mono">
                  {m.seasonalityIndex.toFixed(2)}x
                </span>
                <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider truncate max-w-full">
                  {m.label || (isPeak ? 'Peak Rush' : isLull ? 'Quiet' : 'Routine')}
                </span>
                {m.isBenchmark && (
                  <span className="mt-1 rounded bg-white/10 px-1 py-0.5 text-[8px] text-ivory-dim">
                    Benchmark
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Expanded Seasonality Insight if Month Clicked */}
        {selectedMonth !== null && (
          <div className="rounded-lg border border-gold/20 bg-charcoal p-3 text-xs">
            {(() => {
              const m = seasonality.find((s) => s.month === selectedMonth);
              if (!m) return null;
              return (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h5 className="font-bold text-ivory">
                      {m.monthName} Strategic Profile: <span className="text-gold">{m.label || 'Regular Operations'}</span>
                    </h5>
                    <p className="mt-0.5 text-ivory-dim">
                      Historical burn is {m.seasonalityIndex >= 1 ? `+${Math.round((m.seasonalityIndex - 1) * 100)}% above` : `-${Math.round((1 - m.seasonalityIndex) * 100)}% below`} shop baseline.
                      Estimated monthly product burn: ~{m.consumptionUnits} units.
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase text-ivory-dim">Ordering Action</span>
                    <p className="font-semibold text-gold">
                      {m.seasonalityIndex >= 1.2
                        ? 'Place bulk orders 2-3 weeks in advance'
                        : m.seasonalityIndex <= 0.9
                          ? 'Maintain lean stock to reduce holding costs'
                          : 'Order at standard 1-week replenishments'}
                    </p>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Monthly Consumption vs Restock Spend Combo Visual */}
      <div className="space-y-3 rounded-xl border border-white/10 bg-charcoal-light p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-gold" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-ivory">
                12-Month Consumption & Restock Expenditure
              </h4>
            </div>
            <p className="mt-0.5 text-xs text-ivory-dim">
              Unit consumption (Consumables vs Customer Retail) contrasted with monthly procurement spend.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[11px]">
            <span className="flex items-center gap-1.5 text-ivory">
              <span className="h-2.5 w-2.5 rounded bg-gold" />
              Consumables
            </span>
            <span className="flex items-center gap-1.5 text-ivory">
              <span className="h-2.5 w-2.5 rounded bg-sky-400" />
              Retail Items
            </span>
            <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
              <span className="h-0.5 w-3 bg-emerald-400" />
              Restock Spend (₱)
            </span>
          </div>
        </div>

        {/* Combo Chart Visualization */}
        <div className="relative pt-6 pb-2 overflow-x-auto">
          <div className="min-w-[640px] flex items-end justify-between gap-2 h-44 border-b border-white/10 px-2">
            {spendTrend.map((s, idx) => {
              const totalHeightPercent = Math.min(100, Math.round((s.totalUnits / maxUnits) * 100));
              const consumablesHeight = s.totalUnits > 0 ? Math.round((s.consumablesUnits / s.totalUnits) * totalHeightPercent) : 0;
              const retailsHeight = totalHeightPercent - consumablesHeight;

              return (
                <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end group">
                  {/* Tooltip on hover */}
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute top-0 pointer-events-none z-20 rounded border border-white/15 bg-charcoal-dark px-2.5 py-1 text-[11px] text-ivory shadow-xl whitespace-nowrap">
                    <p className="font-bold text-gold">{s.monthName} ({s.yearMonth})</p>
                    <p className="text-ivory-dim">Consumables: {s.consumablesUnits} · Retail: {s.retailsUnits}</p>
                    <p className="font-semibold text-emerald-400">Spend: ₱{s.restockSpend.toLocaleString()}</p>
                  </div>

                  {/* Stacked Bars */}
                  <div className="w-full max-w-[28px] flex flex-col justify-end h-full">
                    <div
                      style={{ height: `${retailsHeight}%` }}
                      className="w-full bg-sky-400/80 rounded-t-sm transition-all duration-300 group-hover:bg-sky-400"
                    />
                    <div
                      style={{ height: `${consumablesHeight}%` }}
                      className="w-full bg-gold/80 transition-all duration-300 group-hover:bg-gold"
                    />
                  </div>

                  {/* X-axis label */}
                  <span className="mt-2 text-[10px] text-ivory-dim group-hover:text-ivory font-mono">
                    {s.monthName}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Movement-Tier Migration & Stockout Reliability Swimlane */}
      <div className="space-y-3 rounded-xl border border-white/10 bg-charcoal-light p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-gold" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-ivory">
                Movement-Tier Migration & Stockout Reliability
              </h4>
            </div>
            <p className="mt-0.5 text-xs text-ivory-dim">
              Tracks products transitioning between Fast, Slow, and Dormant states, flagging chronic stockout risks.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full text-left text-xs min-w-[620px]">
            <thead className="bg-charcoal text-[10px] font-semibold uppercase tracking-wider text-ivory-dim border-b border-white/10">
              <tr>
                <th className="px-4 py-3">Product Name</th>
                <th className="px-4 py-3">Prior Tier</th>
                <th className="px-4 py-3">Transition</th>
                <th className="px-4 py-3">Current Tier</th>
                <th className="px-4 py-3">Trend</th>
                <th className="px-4 py-3 text-right">Reliability Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {tierMigrations.slice(0, 8).map((tm) => {
                const isFast = tm.currentTier === 'fast';
                const isUp = tm.trend === 'increasing';
                const isDown = tm.trend === 'decreasing';

                return (
                  <tr key={tm.productId} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-semibold text-ivory">
                      {tm.name}
                    </td>
                    <td className="px-4 py-3 text-ivory-dim uppercase text-[10px]">
                      {tm.priorTier.replace('_', ' ')}
                    </td>
                    <td className="px-4 py-3 text-gold">
                      <ArrowRight className="h-3.5 w-3.5" />
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                        isFast
                          ? 'border border-orange-400/30 bg-orange-950/20 text-orange-200'
                          : 'border border-sky-400/30 bg-sky-950/20 text-sky-200'
                      }`}>
                        {tm.currentTier.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${
                        isUp ? 'text-emerald-400' : isDown ? 'text-red-400' : 'text-ivory-dim'
                      }`}>
                        {isUp ? <TrendingUp className="h-3 w-3" /> : isDown ? <TrendingDown className="h-3 w-3" /> : null}
                        {tm.trend}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-mono font-bold ${
                        tm.reliabilityScore >= 90 ? 'text-emerald-400' : tm.reliabilityScore >= 75 ? 'text-amber-400' : 'text-red-400'
                      }`}>
                        {tm.reliabilityScore}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ForecastHistoricalAnalytics;
