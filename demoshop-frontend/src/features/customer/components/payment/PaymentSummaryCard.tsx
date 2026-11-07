import React, { memo } from 'react';
import type { EnrichedPaymentMethod } from './PaymentMethodList';
import { PaymentProviderLogo } from './PaymentProviderLogo';

interface PaymentSummaryCardProps {
  method: EnrichedPaymentMethod;
  guestCount: number;
  depositTotal: number;
  servicesTotal: number;
  onChangeMethod: () => void;
}

export const PaymentSummaryCard: React.FC<PaymentSummaryCardProps> = memo(({
  method,
  guestCount,
  depositTotal,
  servicesTotal,
  onChangeMethod,
}) => {
  return (
    <div className="bg-charcoal-light/90 border border-white/10 rounded-lg p-4 sm:p-5 space-y-3.5 shadow-md">
      {/* Payment Type Header with Change button */}
      <div className="flex items-center justify-between pb-3 border-b border-white/10">
        <div className="flex items-center gap-2.5 min-w-0">
          <PaymentProviderLogo providerId={method.id} size="sm" />
          <div>
            <div className="text-[10px] uppercase font-mono tracking-wider text-ivory-dim">
              Payment Method
            </div>
            <div className="text-xs sm:text-sm font-semibold text-ivory">
              {method.label}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onChangeMethod}
          className="text-xs font-bold text-gold hover:text-gold-light px-3 py-1.5 rounded border border-gold/30 hover:border-gold hover:bg-gold/10 transition-all cursor-pointer"
        >
          Change
        </button>
      </div>

      {/* Financial Breakdown */}
      <div className="space-y-2 text-xs">
        <div className="flex items-center justify-between text-ivory">
          <span className="text-ivory-dim">
            Reservation fee ({guestCount} {guestCount === 1 ? 'guest' : 'guests'} × ₱50.00)
          </span>
          <span className="font-mono font-medium">₱{depositTotal.toFixed(2)}</span>
        </div>

        <div className="flex items-center justify-between text-ivory-dim/60">
          <span>Services total (pay at barbershop counter)</span>
          <span className="font-mono">₱{servicesTotal.toFixed(2)}</span>
        </div>

        <div className="pt-2 border-t border-white/10 flex items-center justify-between text-sm font-bold">
          <span className="text-ivory uppercase tracking-wider text-xs">Total To Pay Now</span>
          <span className="font-mono text-gold text-base">₱{depositTotal.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
});

PaymentSummaryCard.displayName = 'PaymentSummaryCard';
