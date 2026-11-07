import React from 'react';
import { AlertTriangle, AlertCircle, ShieldCheck } from 'lucide-react';
import type { CustomerBookingStats } from '@demoshop/shared-types';

export interface CustomerReliabilityBadgeProps {
  stats?: CustomerBookingStats | null;
  compact?: boolean;
  className?: string;
}

export const CustomerReliabilityBadge: React.FC<CustomerReliabilityBadgeProps> = ({
  stats,
  compact = false,
  className = '',
}) => {
  if (!stats || stats.total_bookings === 0) {
    if (compact) {
      return (
        <span
          title="New Client (0 Bookings)"
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-medium bg-white/[0.04] text-ivory-dim border border-white/10 ${className}`}
        >
          <ShieldCheck className="w-2.5 h-2.5 text-ivory-dim/70 shrink-0" />
          <span>New Client</span>
        </span>
      );
    }
    return (
      <div
        className={`inline-flex items-center gap-1.5 rounded-sm border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs font-medium text-ivory-dim ${className}`}
      >
        <ShieldCheck className="h-3 w-3 text-ivory-dim/70 shrink-0" />
        <span>New Client (0 Bookings)</span>
      </div>
    );
  }

  const {
    total_bookings,
    cancelled_bookings,
    no_show_bookings,
    cancellation_rate,
    reliability_score,
  } = stats;

  const isHighRisk = cancellation_rate >= 50 || no_show_bookings >= 3;
  const isModerateRisk = !isHighRisk && cancellation_rate >= 20;

  if (isHighRisk) {
    if (compact) {
      return (
        <span
          title={`High Risk: ${total_bookings} Bookings (${cancelled_bookings} Cancelled, ${no_show_bookings} No-Show)`}
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-wider bg-red-500/15 text-red-400 border border-red-500/30 ${className}`}
        >
          <AlertTriangle className="w-2.5 h-2.5 text-red-400 shrink-0" />
          <span>High Risk ({reliability_score}%)</span>
        </span>
      );
    }

    return (
      <div
        className={`inline-flex items-center gap-1.5 rounded-sm border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-400 shadow-xs ${className}`}
      >
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        <span>
          High Cancellation Rate: {total_bookings} Bookings ({cancelled_bookings} Cancelled, {no_show_bookings} No-Show)
        </span>
      </div>
    );
  }

  if (isModerateRisk) {
    if (compact) {
      return (
        <span
          title={`Moderate Risk: ${cancellation_rate}% Cancellation Rate (${total_bookings} Bookings)`}
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30 ${className}`}
        >
          <AlertCircle className="w-2.5 h-2.5 text-amber-300 shrink-0" />
          <span>{reliability_score}% Reliability</span>
        </span>
      );
    }

    return (
      <div
        className={`inline-flex items-center gap-1.5 rounded-sm border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-300 shadow-xs ${className}`}
      >
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        <span>
          Moderate Risk: {reliability_score}% Reliability ({total_bookings} Bookings, {cancelled_bookings + no_show_bookings} Cancelled/No-Show)
        </span>
      </div>
    );
  }

  // Normal: < 20% combined rate
  if (compact) {
    return (
      <span
        title={`Reliable: ${reliability_score}% Reliability (${total_bookings} Bookings)`}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 ${className}`}
      >
        <ShieldCheck className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
        <span>{reliability_score}% Reliability</span>
      </span>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-sm border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300 shadow-xs ${className}`}
    >
      <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
      <span>{reliability_score}% Reliability ({total_bookings} Bookings)</span>
    </div>
  );
};

export default CustomerReliabilityBadge;
