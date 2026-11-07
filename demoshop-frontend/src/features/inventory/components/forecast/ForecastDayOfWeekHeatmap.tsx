import React from 'react';
import type { InventoryDayOfWeekIntensity } from '@demoshop/shared-types';
import { Tooltip } from '@/components/ui/Tooltip';

interface ForecastDayOfWeekHeatmapProps {
  data?: InventoryDayOfWeekIntensity[];
  unit?: string;
  className?: string;
  showLabels?: boolean;
}

const DEFAULT_DAYS: InventoryDayOfWeekIntensity[] = [
  { dayOfWeek: 1, dayName: 'Mon', totalUnits: 4, avgUnits: 1.0, relativeIntensity: 0.7 },
  { dayOfWeek: 2, dayName: 'Tue', totalUnits: 5, avgUnits: 1.25, relativeIntensity: 0.85 },
  { dayOfWeek: 3, dayName: 'Wed', totalUnits: 4, avgUnits: 1.0, relativeIntensity: 0.7 },
  { dayOfWeek: 4, dayName: 'Thu', totalUnits: 6, avgUnits: 1.5, relativeIntensity: 1.0 },
  { dayOfWeek: 5, dayName: 'Fri', totalUnits: 9, avgUnits: 2.25, relativeIntensity: 1.5 },
  { dayOfWeek: 6, dayName: 'Sat', totalUnits: 12, avgUnits: 3.0, relativeIntensity: 2.0 },
  { dayOfWeek: 7, dayName: 'Sun', totalUnits: 8, avgUnits: 2.0, relativeIntensity: 1.35 },
];

export const ForecastDayOfWeekHeatmap: React.FC<ForecastDayOfWeekHeatmapProps> = ({
  data = DEFAULT_DAYS,
  unit = 'units',
  className = '',
  showLabels = true,
}) => {
  const intensityData = data && data.length > 0 ? data : DEFAULT_DAYS;

  // Determine color and styling based on relative intensity
  const getIntensityStyles = (intensity: number) => {
    if (intensity >= 1.6) {
      return {
        bg: 'bg-amber-400 text-charcoal font-bold shadow-sm',
        border: 'border-amber-300',
        label: 'Peak Rush',
        tagColor: 'text-amber-400',
      };
    }
    if (intensity >= 1.2) {
      return {
        bg: 'bg-gold/80 text-charcoal font-semibold',
        border: 'border-gold',
        label: 'High Volume',
        tagColor: 'text-gold',
      };
    }
    if (intensity >= 0.9) {
      return {
        bg: 'bg-white/20 text-ivory',
        border: 'border-white/25',
        label: 'Average Volume',
        tagColor: 'text-ivory',
      };
    }
    return {
      bg: 'bg-white/5 text-ivory-dim',
      border: 'border-white/10',
      label: 'Quiet Lull',
      tagColor: 'text-ivory-dim',
    };
  };

  return (
    <div className={`space-y-1.5 ${className}`}>
      {showLabels && (
        <div className="flex items-center justify-between text-[11px] text-ivory-dim">
          <span className="font-semibold uppercase tracking-wider text-[10px] text-gold">Weekly Consumption Heatmap</span>
          <span className="text-[10px]">Mon – Sun rush patterns</span>
        </div>
      )}

      <div
        className="grid grid-cols-7 gap-1.5"
        role="group"
        aria-label="7-day weekly consumption intensity heatmap"
      >
        {intensityData.map((d) => {
          const style = getIntensityStyles(d.relativeIntensity);
          const isWeekend = d.dayOfWeek === 6 || d.dayOfWeek === 7 || d.dayOfWeek === 5;

          const tooltipContent = (
            <div className="space-y-1 text-xs">
              <p className="font-semibold text-ivory">{d.dayName} Consumption Profile</p>
              <div className="flex items-center justify-between gap-4 text-ivory-dim">
                <span>Avg Daily:</span>
                <span className="font-bold text-ivory">{d.avgUnits} {unit}</span>
              </div>
              <div className="flex items-center justify-between gap-4 text-ivory-dim">
                <span>Intensity vs Average:</span>
                <span className={`font-bold ${style.tagColor}`}>
                  {d.relativeIntensity >= 1 ? `+${Math.round((d.relativeIntensity - 1) * 100)}%` : `-${Math.round((1 - d.relativeIntensity) * 100)}%`} ({style.label})
                </span>
              </div>
            </div>
          );

          return (
            <Tooltip key={d.dayOfWeek} title={d.dayName} content={tooltipContent}>
              <div
                tabIndex={0}
                role="button"
                aria-label={`${d.dayName}: ${d.avgUnits} ${unit}/day (${style.label})`}
                className={`flex flex-col items-center justify-center rounded-lg border py-1.5 px-1 transition duration-150 hover:scale-105 hover:shadow-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold ${style.bg} ${style.border}`}
              >
                <span className={`text-[10px] font-bold uppercase tracking-wider ${isWeekend ? 'opacity-90' : 'opacity-75'}`}>
                  {d.dayName}
                </span>
                <span className="text-xs font-mono font-bold mt-0.5">
                  {d.avgUnits}
                </span>
              </div>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
};

export default ForecastDayOfWeekHeatmap;
