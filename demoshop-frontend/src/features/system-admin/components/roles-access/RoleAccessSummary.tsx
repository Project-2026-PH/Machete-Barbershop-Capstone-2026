import React from 'react';
import { Lock, Info } from 'lucide-react';
import type { AccessFilterType } from './roles-constants';

interface RoleAccessSummaryProps {
  counts: {
    available: number;
    restricted: number;
    unavailable: number;
    systemManaged: number;
    total: number;
  };
  activeFilter: AccessFilterType;
  onFilterChange: (filter: AccessFilterType) => void;
}

export const RoleAccessSummary: React.FC<RoleAccessSummaryProps> = ({
  counts,
  activeFilter,
  onFilterChange,
}) => {
  const handleToggle = (filter: AccessFilterType) => {
    if (activeFilter === filter) {
      onFilterChange('all');
    } else {
      onFilterChange(filter);
    }
  };

  return (
    <div className="space-y-2.5">
      {/* 1-Click Filter Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {/* Available Filter */}
        <button
          type="button"
          onClick={() => handleToggle('available')}
          className={`p-2.5 rounded-sm border flex items-center justify-between transition-all cursor-pointer text-left ${
            activeFilter === 'available'
              ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300 shadow-xs'
              : 'bg-charcoal border-white/5 text-ivory-dim hover:text-ivory hover:border-white/15'
          }`}
        >
          <span className="text-xs font-mono uppercase flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" /> Available
          </span>
          <span className="text-sm font-bold text-emerald-400 font-mono">
            {counts.available}
          </span>
        </button>

        {/* Restricted Filter */}
        <button
          type="button"
          onClick={() => handleToggle('restricted')}
          className={`p-2.5 rounded-sm border flex items-center justify-between transition-all cursor-pointer text-left ${
            activeFilter === 'restricted'
              ? 'bg-white/15 border-white/30 text-ivory shadow-xs'
              : 'bg-charcoal border-white/5 text-ivory-dim hover:text-ivory hover:border-white/15'
          }`}
        >
          <span className="text-xs font-mono uppercase flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-ivory-dim/40" /> Restricted
          </span>
          <span className="text-sm font-bold text-ivory-dim font-mono">
            {counts.restricted}
          </span>
        </button>

        {/* Unavailable Filter */}
        <button
          type="button"
          onClick={() => handleToggle('unavailable')}
          className={`p-2.5 rounded-sm border flex items-center justify-between transition-all cursor-pointer text-left ${
            activeFilter === 'unavailable'
              ? 'bg-amber-500/15 border-amber-500 text-amber-200 shadow-xs'
              : 'bg-charcoal border-white/5 text-ivory-dim hover:text-ivory hover:border-white/15'
          }`}
        >
          <span className="text-xs font-mono uppercase flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400" /> Unavailable
          </span>
          <span className="text-sm font-bold text-amber-300 font-mono">
            {counts.unavailable}
          </span>
        </button>

        {/* System Managed Filter (if any) */}
        {counts.systemManaged > 0 && (
          <button
            type="button"
            onClick={() => handleToggle('system_managed')}
            className={`p-2.5 rounded-sm border flex items-center justify-between transition-all cursor-pointer text-left ${
              activeFilter === 'system_managed'
                ? 'bg-gold/15 border-gold text-gold shadow-xs'
                : 'bg-charcoal border-white/5 text-ivory-dim hover:text-ivory hover:border-white/15'
            }`}
          >
            <span className="text-xs font-mono uppercase flex items-center gap-1.5 text-gold">
              <Lock className="w-3 h-3 text-gold" /> System Managed
            </span>
            <span className="text-sm font-bold text-gold font-mono">
              {counts.systemManaged}
            </span>
          </button>
        )}
      </div>

      {/* Small informative note replacing the old huge overview banner */}
      <div className="flex items-center gap-1.5 text-[11px] text-ivory-dim/70 px-1">
        <Info className="w-3.5 h-3.5 text-gold/70 shrink-0" />
        <span>Feature availability takes priority over role access.</span>
        <span className="text-ivory-dim/50 hidden sm:inline">
          Features in Maintenance or Disabled remain unavailable regardless of role permissions.
        </span>
      </div>
    </div>
  );
};
