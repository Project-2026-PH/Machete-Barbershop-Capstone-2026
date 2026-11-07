import React from 'react';
import { Lock, Check, ArrowRight } from 'lucide-react';
import type { SystemFeature } from '@demoshop/shared-types';
import type { SystemRole } from '../../utils/feature-compatibility';
import { getRoleAccessState } from '../../utils/feature-compatibility';

interface FeatureAccessRowProps {
  feature: SystemFeature;
  role: SystemRole;
  effectiveRoles: string[];
  onToggleAccess: (feature: SystemFeature, makeAllowed: boolean) => void;
  onViewFeature: (feature: SystemFeature) => void;
}

export const FeatureAccessRow: React.FC<FeatureAccessRowProps> = ({
  feature,
  role,
  effectiveRoles,
  onToggleAccess,
  onViewFeature,
}) => {
  const compInfo = getRoleAccessState(feature.id, role, effectiveRoles);
  const isAllowed = effectiveRoles.includes(role);
  const isGloballyUnavailable = feature.status !== 'ENABLED';
  const isMaintenance = feature.status === 'MAINTENANCE';

  return (
    <div className="p-3.5 bg-charcoal border border-white/5 rounded-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-white/10 transition-colors">
      {/* Feature Information */}
      <div className="space-y-1 min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className="text-xs font-serif font-bold text-ivory tracking-wide">
            {feature.name}
          </h4>

          {/* Global Feature State Indicator if not active */}
          {isGloballyUnavailable && (
            <span
              className={`px-1.5 py-0.2 rounded-[2px] text-[9px] font-mono uppercase font-bold tracking-wider ${
                isMaintenance
                  ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                  : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
              }`}
            >
              {isMaintenance ? 'Maintenance' : 'Disabled'}
            </span>
          )}
        </div>

        <p className="text-[11px] text-ivory-dim/75 leading-relaxed">
          {feature.description}
        </p>

        {/* Operational Context Subtext */}
        <div className="text-[10px] font-mono mt-0.5">
          {compInfo.state === 'LOCKED' ? (
            <span className="text-gold/80">{compInfo.reason}</span>
          ) : isGloballyUnavailable ? (
            <div className="flex items-center gap-2 text-amber-300/80 flex-wrap">
              <span>
                Role is {isAllowed ? 'Allowed' : 'Restricted'}, but feature is currently offline globally.
              </span>
              <button
                type="button"
                onClick={() => onViewFeature(feature)}
                className="text-gold hover:underline inline-flex items-center gap-0.5 cursor-pointer"
              >
                <span>View Feature</span>
                <ArrowRight className="w-2.5 h-2.5" />
              </button>
            </div>
          ) : compInfo.state === 'UNAVAILABLE' ? (
            <span className="text-ivory-dim/50">{compInfo.reason}</span>
          ) : (
            <span className="text-ivory-dim/50">
              {isAllowed ? 'Access is currently available for this role.' : 'Access is currently restricted.'}
            </span>
          )}
        </div>
      </div>

      {/* Access Control Action */}
      <div className="shrink-0 flex items-center gap-2">
        {compInfo.state === 'LOCKED' ? (
          <span className="px-2.5 py-1 rounded-[2px] bg-white/5 border border-white/10 text-gold text-xs font-mono inline-flex items-center gap-1.5">
            <Lock className="w-3 h-3 text-gold" />
            <span>System Managed</span>
          </span>
        ) : isGloballyUnavailable ? (
          <div className="flex items-center gap-2">
            <span
              className={`px-2.5 py-1 rounded-[2px] border text-xs font-semibold ${
                isAllowed
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400/80'
                  : 'bg-white/5 border-white/10 text-ivory-dim/50'
              }`}
            >
              {isAllowed ? 'Allowed ✓' : 'Restricted'}
            </span>
          </div>
        ) : (
          <div className="inline-flex rounded-sm p-0.5 bg-charcoal-light border border-white/10">
            <button
              type="button"
              onClick={() => {
                if (!isAllowed) onToggleAccess(feature, true);
              }}
              className={`px-3 py-1 rounded-[2px] text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                isAllowed
                  ? 'bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30 shadow-xs'
                  : 'text-ivory-dim/60 hover:text-ivory'
              }`}
            >
              <Check className={`w-3 h-3 ${isAllowed ? 'text-emerald-400' : 'opacity-0'}`} />
              <span>Allowed</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (isAllowed) onToggleAccess(feature, false);
              }}
              className={`px-3 py-1 rounded-[2px] text-xs font-semibold transition-all cursor-pointer ${
                !isAllowed
                  ? 'bg-white/15 text-ivory font-bold border border-white/20 shadow-xs'
                  : 'text-ivory-dim/60 hover:text-ivory'
              }`}
            >
              <span>Restricted</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
