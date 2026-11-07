import React from 'react';
import { Clock, Info } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';

interface ForecastCalibrationBadgeProps {
  daysTracked: number;
  requiredDays?: number;
  preliminaryRate?: number | null;
  unit?: string;
  className?: string;
  compact?: boolean;
}

export const ForecastCalibrationBadge: React.FC<ForecastCalibrationBadgeProps> = ({
  daysTracked,
  requiredDays = 14,
  preliminaryRate = null,
  unit = 'units',
  className = '',
  compact = false,
}) => {
  const clampedDays = Math.min(requiredDays, Math.max(0, daysTracked));
  const percent = Math.min(100, Math.round((clampedDays / requiredDays) * 100));
  const daysLeft = Math.max(0, requiredDays - clampedDays);

  const tooltipContent = (
    <div className="space-y-1.5 text-xs max-w-xs">
      <p className="font-semibold text-ivory">More consumption history needed</p>
      <p className="text-ivory-dim">
        We need at least 14 calendar days of consumption history before estimating daily use, days of stock left or a stockout date.
      </p>
      <div className="mt-2 flex items-center justify-between text-[11px] border-t border-white/10 pt-1.5">
        <span className="text-ivory-dim">History available:</span>
        <span className="font-bold text-gold">{clampedDays} of {requiredDays} calendar days</span>
      </div>
      {daysLeft > 0 && (
        <p className="text-[11px] text-amber-300">
          {daysLeft} more calendar day{daysLeft === 1 ? '' : 's'} needed for an estimate.
        </p>
      )}
      {preliminaryRate !== null && preliminaryRate > 0 && (
        <p className="text-[11px] text-sky-300 border-t border-white/10 pt-1">
          Preliminary observed burn: ~{preliminaryRate.toFixed(2)} {unit}/day.
        </p>
      )}
    </div>
  );

  if (compact) {
    return (
      <Tooltip title="Consumption history" content={tooltipContent}>
        <div
          tabIndex={0}
          role="status"
          aria-label={`Consumption history: ${clampedDays} of ${requiredDays} calendar days available`}
          className={`inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-ivory-dim transition hover:border-white/20 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold ${className}`}
        >
          <Clock className="h-3 w-3 text-gold shrink-0 animate-pulse" />
          <span className="font-mono text-[11px] text-ivory">History {clampedDays}/{requiredDays}d</span>
          <div className="h-1.5 w-8 rounded-full bg-charcoal overflow-hidden border border-white/10">
            <div
              className="h-full bg-gold rounded-full transition-all duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      </Tooltip>
    );
  }

  return (
    <Tooltip title="Consumption history" content={tooltipContent}>
      <div
        tabIndex={0}
        role="status"
        aria-label={`Consumption history: ${clampedDays} of ${requiredDays} calendar days available`}
        className={`inline-flex flex-col gap-1 rounded-lg border border-gold/20 bg-gold/5 p-2.5 text-xs transition hover:border-gold/30 hover:bg-gold/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold ${className}`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-gold shrink-0" />
            <span className="font-semibold text-gold">History available: {clampedDays}/{requiredDays} days</span>
          </div>
          <span className="text-[10px] font-mono text-ivory-dim">{percent}%</span>
        </div>

        {/* Mini progress track */}
        <div className="h-1.5 w-full rounded-full bg-charcoal overflow-hidden border border-white/10">
          <div
            className="h-full bg-gold rounded-full transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>

        {preliminaryRate !== null && preliminaryRate > 0 ? (
          <p className="text-[11px] text-ivory-dim flex items-center justify-between">
            <span>Observed consumption:</span>
            <span className="font-mono text-sky-300 font-medium">~{preliminaryRate.toFixed(2)} {unit}/day</span>
          </p>
        ) : (
          <p className="text-[11px] text-ivory-dim">
            No consumption history is available yet. An estimate needs 14 calendar days of history.
          </p>
        )}
      </div>
    </Tooltip>
  );
};

export default ForecastCalibrationBadge;
