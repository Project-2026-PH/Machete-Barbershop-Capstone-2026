import React from 'react';
import { AlertTriangle, Clock, ShieldCheck } from 'lucide-react';
import type { InventoryForecastItem } from '@demoshop/shared-types';

interface ForecastSawtoothChartProps {
  item: InventoryForecastItem;
  additionalUnits?: number;
  width?: number;
  height?: number;
  className?: string;
}

const HISTORY_DAYS = 14;
const FORECAST_DAYS = 14;

export const ForecastSawtoothChart: React.FC<ForecastSawtoothChartProps> = ({
  item,
  additionalUnits = 0,
  width = 540,
  height = 190,
  className = '',
}) => {
  const currentStock = Math.max(0, Number(item.currentStock) || 0);
  const criticalStock = Math.max(0, Number(item.criticalStock) || 0);
  const safetyStock = Math.max(0, Number(item.safetyStock) || 0);
  const burnRate = Math.max(0, Number(item.adjustedDailyConsumption) || Number(item.averageDailyConsumption) || 0);
  const leadTimeDays = Number(item.supplierLeadTimeDays) || 3;
  const historicalPoints = Array.isArray(item.dailyBurnRateHistory)
    ? item.dailyBurnRateHistory.slice(-HISTORY_DAYS)
    : [];
  const maximumDailyConsumption = Math.max(0, ...historicalPoints.map((point) => Number(point.quantity) || 0));

  const maxStock = Math.max(
    currentStock + additionalUnits + 5,
    safetyStock * 2,
    criticalStock * 3,
    maximumDailyConsumption * 1.25,
    20,
  );
  const paddingLeft = 36;
  const paddingRight = 16;
  const paddingTop = 16;
  const paddingBottom = 26;
  const chartW = width - paddingLeft - paddingRight;
  const chartH = height - paddingTop - paddingBottom;
  const scaleY = (value: number) => paddingTop + chartH * (1 - Math.max(0, Math.min(maxStock, value)) / maxStock);
  const scaleX = (dayOffset: number) => {
    const norm = (dayOffset + HISTORY_DAYS) / (HISTORY_DAYS + FORECAST_DAYS);
    return paddingLeft + chartW * Math.max(0, Math.min(1, norm));
  };

  const todayX = scaleX(0);
  const criticalY = scaleY(criticalStock);
  const safetyY = scaleY(safetyStock);
  const barWidth = (chartW / (HISTORY_DAYS + FORECAST_DAYS)) * 0.68;

  const effectiveStock = currentStock + additionalUnits;
  const daysToDeplete = burnRate > 0 ? effectiveStock / burnRate : null;
  const projectionAvailable = item.forecastAvailable && daysToDeplete !== null;
  const projectionEndDay = projectionAvailable ? Math.min(FORECAST_DAYS, daysToDeplete) : FORECAST_DAYS;
  const projectionEndStock = projectionAvailable
    ? Math.max(0, effectiveStock - burnRate * projectionEndDay)
    : effectiveStock;
  const projectionPath = projectionAvailable
    ? `M ${todayX.toFixed(1)} ${scaleY(effectiveStock).toFixed(1)} L ${scaleX(projectionEndDay).toFixed(1)} ${scaleY(projectionEndStock).toFixed(1)}`
    : '';
  const scenarioEndpoint = (rate: number) => {
    const day = Math.min(FORECAST_DAYS, effectiveStock / rate);
    const stock = Math.max(0, effectiveStock - rate * day);
    return { day, stock };
  };
  const coneArea = projectionAvailable
    ? (() => {
      const faster = scenarioEndpoint(burnRate * 1.25);
      const slower = scenarioEndpoint(burnRate * 0.75);
      return [
        `M ${todayX.toFixed(1)} ${scaleY(effectiveStock).toFixed(1)}`,
        `L ${scaleX(slower.day).toFixed(1)} ${scaleY(slower.stock).toFixed(1)}`,
        `L ${scaleX(faster.day).toFixed(1)} ${scaleY(faster.stock).toFixed(1)} Z`,
      ].join(' ');
    })()
    : '';
  const deliveryWindow = {
    x1: scaleX(0),
    x2: scaleX(Math.min(FORECAST_DAYS, leadTimeDays)),
    isBreach: item.forecastAvailable && daysToDeplete !== null && daysToDeplete <= leadTimeDays,
  };

  return (
    <div className={`space-y-2 rounded-xl border border-white/10 bg-charcoal-light p-4 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-gold" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-ivory">
            14-Day Recorded Consumption & Stock Projection
          </h4>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px]">
          <span className="flex items-center gap-1.5 text-sky-300">
            <span className="h-2.5 w-2.5 rounded-sm bg-sky-400/80" /> Actual consumption
          </span>
          <span className="flex items-center gap-1.5 text-ivory">
            <span className="h-0.5 w-3 border-b-2 border-dashed border-sky-400" /> Projected stock
          </span>
          <span className="flex items-center gap-1.5 text-amber-300">
            <span className="h-0.5 w-3 border-b-2 border-dashed border-amber-400" /> Safety ({safetyStock} {item.unit})
          </span>
          <span className="flex items-center gap-1.5 text-red-300">
            <span className="h-0.5 w-3 border-b-2 border-dashed border-red-400" /> Critical ({criticalStock} {item.unit})
          </span>
        </div>
      </div>

      <div className="relative overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          height={height}
          className="overflow-visible"
          role="img"
          aria-label={`14-day consumption history and stock projection for ${item.name}`}
        >
          <rect
            x={deliveryWindow.x1}
            y={paddingTop}
            width={Math.max(2, deliveryWindow.x2 - deliveryWindow.x1)}
            height={chartH}
            fill={deliveryWindow.isBreach ? 'rgba(239, 68, 68, 0.12)' : 'rgba(56, 189, 248, 0.08)'}
            stroke={deliveryWindow.isBreach ? 'rgba(239, 68, 68, 0.3)' : 'rgba(56, 189, 248, 0.2)'}
            strokeDasharray="2 2"
          />

          <line x1={todayX} y1={paddingTop} x2={todayX} y2={height - paddingBottom} stroke="#C5A880" strokeWidth="1.5" strokeDasharray="3 3" />
          <text x={todayX} y={paddingTop - 4} textAnchor="middle" fill="#C5A880" fontSize="9" fontWeight="bold">TODAY</text>

          <line x1={paddingLeft} y1={safetyY} x2={width - paddingRight} y2={safetyY} stroke="#F59E0B" strokeWidth="1.25" strokeDasharray="4 4" opacity="0.8" />
          <line x1={paddingLeft} y1={criticalY} x2={width - paddingRight} y2={criticalY} stroke="#EF4444" strokeWidth="1.25" strokeDasharray="4 4" opacity="0.8" />

          {historicalPoints.map((point, index) => {
            const quantity = Math.max(0, Number(point.quantity) || 0);
            const startDay = -HISTORY_DAYS + index;
            const x = scaleX(startDay + 0.5) - (barWidth / 2);
            const y = scaleY(quantity);
            return (
              <rect
                key={point.date}
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(1, scaleY(0) - y)}
                rx="1.5"
                fill={quantity > 0 ? 'rgba(56, 189, 248, 0.8)' : 'rgba(255, 255, 255, 0.1)'}
              >
                <title>{`${point.date}: ${quantity} ${item.unit || 'units'} consumed`}</title>
              </rect>
            );
          })}

          <path d={coneArea} fill="rgba(56, 189, 248, 0.12)" />
          {projectionPath && (
            <path d={projectionPath} fill="none" stroke="#38BDF8" strokeWidth="2.25" strokeDasharray="4 3" strokeLinecap="round" />
          )}
          <circle cx={todayX} cy={scaleY(currentStock + additionalUnits)} r="4.5" fill="#C5A880" stroke="#FFFFFF" strokeWidth="1.5" />

          <text x={scaleX(-14)} y={height - 8} fill="#9CA3AF" fontSize="9">-14d</text>
          <text x={scaleX(-7)} y={height - 8} fill="#9CA3AF" fontSize="9">-7d</text>
          <text x={todayX} y={height - 8} textAnchor="middle" fill="#C5A880" fontSize="9" fontWeight="bold">Now</text>
          <text x={scaleX(7)} y={height - 8} fill="#9CA3AF" fontSize="9">+7d</text>
          <text x={scaleX(14)} y={height - 8} fill="#9CA3AF" fontSize="9">+14d</text>

          <text x={paddingLeft - 6} y={scaleY(0)} textAnchor="end" fill="#9CA3AF" fontSize="9">0</text>
          <text x={paddingLeft - 6} y={safetyY + 3} textAnchor="end" fill="#F59E0B" fontSize="9" fontWeight="bold">{safetyStock}</text>
          <text x={paddingLeft - 6} y={scaleY(maxStock) + 8} textAnchor="end" fill="#9CA3AF" fontSize="9">{Math.round(maxStock)}</text>
        </svg>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/5 bg-charcoal p-2.5 text-xs">
        <div className="flex items-center gap-2">
          {deliveryWindow.isBreach ? <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" /> : <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" />}
          <span className="text-ivory">Supplier lead time: <strong>{leadTimeDays} days</strong> ({item.defaultSupplierName || 'Primary Supplier'})</span>
        </div>
        {deliveryWindow.isBreach ? (
          <span className="font-semibold text-red-300">Projected stockout is before supplier delivery.</span>
        ) : !item.forecastAvailable ? (
          <span className="text-ivory-dim">
            {item.calibrationDaysTracked < item.calibrationRequiredDays
              ? item.calibrationDaysTracked === 0
                ? `No consumption history is available yet. A stockout estimate needs ${item.calibrationRequiredDays} calendar days of history.`
                : `A stockout estimate needs ${item.calibrationRequiredDays} calendar days of consumption history (${item.calibrationDaysTracked} available).`
              : 'No recent consumption was recorded, so a stockout date is not estimated.'}
          </span>
        ) : daysToDeplete !== null && daysToDeplete > FORECAST_DAYS ? (
          <span className="text-ivory-dim">Stock remains beyond this 14-day projection.</span>
        ) : (
          <span className="text-ivory-dim">Projected stockout in ~<strong>{(daysToDeplete ?? 0).toFixed(1)} days</strong>.</span>
        )}
      </div>
      <p className="text-[10px] text-ivory-dim">Bars are recorded daily consumption. The dashed line and shaded range project remaining stock at current burn with a ±25% variation.</p>
    </div>
  );
};

export default ForecastSawtoothChart;
