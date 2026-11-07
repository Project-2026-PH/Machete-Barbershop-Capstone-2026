import React from 'react';
import { ArrowRight } from 'lucide-react';
import type { SystemFeature } from '@demoshop/shared-types';
import { formatAffectedRoles } from './feature-constants';

interface FeatureCardProps {
  feature: SystemFeature;
  onConfigure: (feature: SystemFeature) => void;
}

export const FeatureCard: React.FC<FeatureCardProps> = ({ feature, onConfigure }) => {
  const isCore = Boolean(feature.is_core);
  const status = feature.status;

  return (
    <div
      onClick={() => onConfigure(feature)}
      className="p-4 rounded-sm bg-charcoal-light border border-white/5 hover:border-gold/30 hover:bg-white/[0.02] transition-all duration-150 flex flex-col justify-between gap-3 group cursor-pointer shadow-xs"
    >
      <div>
        <div className="flex items-start justify-between gap-3">
          <h4 className="font-serif font-bold text-sm text-ivory tracking-wide group-hover:text-gold transition-colors leading-snug">
            {feature.name}
          </h4>

          {/* Restrained Status Pill */}
          <div className="shrink-0 flex items-center">
            {isCore ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[2px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-mono font-bold uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Active · Core
              </span>
            ) : status === 'ENABLED' ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[2px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-mono font-bold uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Active
              </span>
            ) : status === 'MAINTENANCE' ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[2px] bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[10px] font-mono font-bold uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                Maintenance
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[2px] bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] font-mono font-bold uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                Disabled
              </span>
            )}
          </div>
        </div>

        <p className="text-xs text-ivory-dim/75 mt-1.5 line-clamp-2 leading-relaxed">
          {feature.description}
        </p>
      </div>

      <div className="flex items-center justify-between pt-2.5 border-t border-white/5 text-xs">
        <span
          className="text-[11px] text-ivory-dim/60 font-mono truncate max-w-[200px] sm:max-w-xs"
          title={feature.affected_roles.join(', ')}
        >
          {formatAffectedRoles(feature.affected_roles)}
        </span>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onConfigure(feature);
          }}
          className="inline-flex items-center gap-1 text-xs font-semibold text-gold hover:text-gold-light hover:underline transition-colors cursor-pointer shrink-0 ml-2"
        >
          <span>Configure</span>
          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>
    </div>
  );
};
