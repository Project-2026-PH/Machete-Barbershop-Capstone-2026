import React, { useMemo, useState } from 'react';
import type { InventoryDailyConsumptionPoint } from '@demoshop/shared-types';

interface ForecastSparklineProps {
  data?: InventoryDailyConsumptionPoint[];
  daysOfStockRemaining?: number | null;
  width?: number;
  height?: number;
  className?: string;
  color?: 'gold' | 'emerald' | 'amber' | 'red' | 'sky';
  interactive?: boolean;
}

const colorMap = {
  gold: { stroke: '#C5A880', fill: 'rgba(197, 168, 128, 0.15)', dot: '#DFD0B8' },
  emerald: { stroke: '#34D399', fill: 'rgba(52, 211, 153, 0.15)', dot: '#A7F3D0' },
  amber: { stroke: '#FBBF24', fill: 'rgba(251, 191, 36, 0.15)', dot: '#FDE68A' },
  red: { stroke: '#F87171', fill: 'rgba(248, 113, 113, 0.15)', dot: '#FECACA' },
  sky: { stroke: '#38BDF8', fill: 'rgba(56, 189, 248, 0.15)', dot: '#BAE6FD' },
};

export const ForecastSparkline: React.FC<ForecastSparklineProps> = ({
  data = [],
  daysOfStockRemaining = null,
  width = 120,
  height = 34,
  className = '',
  color = 'gold',
  interactive = true,
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // Normalize points to render inside viewBox
  const points = useMemo(() => {
    if (!data || data.length === 0) {
      // Default flat line if no data
      return [
        { x: 4, y: height / 2, qty: 0, date: '' },
        { x: width - 4, y: height / 2, qty: 0, date: '' },
      ];
    }

    const paddingX = 4;
    const paddingY = 4;
    const innerW = Math.max(10, width - paddingX * 2);
    const innerH = Math.max(10, height - paddingY * 2);

    const maxQty = Math.max(1, ...data.map((d) => d.quantity));
    const step = innerW / Math.max(1, data.length - 1);

    return data.map((d, index) => {
      const x = paddingX + index * step;
      // Invert Y so 0 is at bottom, max is at top
      const normalizedRatio = d.quantity / maxQty;
      const y = paddingY + innerH * (1 - normalizedRatio);
      return { x, y, qty: d.quantity, date: d.date };
    });
  }, [data, width, height]);

  const { pathD, areaD, tailD } = useMemo(() => {
    if (points.length < 2) return { pathD: '', areaD: '', tailD: '' };

    const first = points[0];
    const last = points[points.length - 1];

    let d = `M ${first.x.toFixed(1)} ${first.y.toFixed(1)}`;
    for (let i = 1; i < points.length; i++) {
      const p = points[i];
      d += ` L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    }

    const area = `${d} L ${last.x.toFixed(1)} ${(height - 2).toFixed(1)} L ${first.x.toFixed(1)} ${(height - 2).toFixed(1)} Z`;

    // Projected tail: dashes extending from last point downward to simulate burn
    let tail = '';
    if (daysOfStockRemaining !== null) {
      const tailX = Math.min(width - 2, last.x + Math.min(18, Math.max(6, (daysOfStockRemaining || 0) * 1.5)));
      const tailY = Math.min(height - 3, last.y + (daysOfStockRemaining <= 3 ? 10 : 4));
      tail = `M ${last.x.toFixed(1)} ${last.y.toFixed(1)} L ${tailX.toFixed(1)} ${tailY.toFixed(1)}`;
    }

    return { pathD: d, areaD: area, tailD: tail };
  }, [points, height, width, daysOfStockRemaining]);

  const activeColor = colorMap[color] || colorMap.gold;
  const hoveredPoint = hoverIndex !== null ? points[hoverIndex] : null;

  return (
    <div
      className={`relative inline-flex items-center ${className}`}
      onMouseLeave={() => setHoverIndex(null)}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className="overflow-visible"
        role="img"
        aria-label="30-day consumption trajectory sparkline"
      >
        <title>30-Day Consumption Burn Rate Trajectory</title>
        <desc>
          {data.length > 0
            ? `Past 30 days history with latest burn of ${data[data.length - 1]?.quantity || 0} units.`
            : 'No historical consumption recorded yet.'}
        </desc>
        {/* Baseline ground line */}
        <line
          x1={2}
          y1={height - 2}
          x2={width - 2}
          y2={height - 2}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="1"
          strokeDasharray="2 2"
        />

        {/* Area fill */}
        {areaD && <path d={areaD} fill={activeColor.stroke} fillOpacity={0.15} />}

        {/* Solid trajectory line */}
        {pathD && (
          <path
            d={pathD}
            fill="none"
            stroke={activeColor.stroke}
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Projected depletion tail */}
        {tailD && (
          <path
            d={tailD}
            fill="none"
            stroke={activeColor.stroke}
            strokeWidth="1.5"
            strokeDasharray="2 2"
            opacity="0.75"
          />
        )}

        {/* End anchor dot */}
        {points.length > 0 && (
          <circle
            cx={points[points.length - 1].x}
            cy={points[points.length - 1].y}
            r="2.5"
            fill={activeColor.dot}
            stroke={activeColor.stroke}
            strokeWidth="1"
          />
        )}

        {/* Interactive hover overlay targets */}
        {interactive &&
          points.map((p, idx) => (
            <circle
              key={idx}
              cx={p.x}
              cy={p.y}
              r="6"
              className="cursor-pointer fill-transparent hover:fill-white/10"
              onMouseEnter={() => setHoverIndex(idx)}
              tabIndex={0}
              role="button"
              aria-label={`${p.date || 'Day'}: ${p.qty} units consumed`}
              onFocus={() => setHoverIndex(idx)}
              onBlur={() => setHoverIndex(null)}
            />
          ))}

        {/* Highlighted hover dot */}
        {hoveredPoint && (
          <circle
            cx={hoveredPoint.x}
            cy={hoveredPoint.y}
            r="4"
            fill="#FFFFFF"
            stroke={activeColor.stroke}
            strokeWidth="2"
          />
        )}
      </svg>

      {/* Floating tooltip on hover */}
      {hoveredPoint && hoveredPoint.date && (
        <div
          className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-30 whitespace-nowrap rounded border border-white/15 bg-charcoal-dark px-2 py-0.5 text-[10px] font-medium text-ivory shadow-lg"
        >
          <span className="text-ivory-dim">{hoveredPoint.date}: </span>
          <span className="font-bold text-gold">{hoveredPoint.qty} units</span>
        </div>
      )}
    </div>
  );
};

export default ForecastSparkline;
