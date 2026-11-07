import React, { memo } from 'react';
import {
  DEFAULT_PAYMENT_PROVIDERS,
  type PaymentCategory,
  type PaymentProviderId,
  type PaymentProviderConfig,
} from '@demoshop/shared-types';
import { PaymentProviderLogo } from './PaymentProviderLogo';

export interface EnrichedPaymentMethod {
  id: PaymentProviderId;
  label: string;
  category: PaymentCategory;
  enabled: boolean;
  receiving: {
    accountName: string;
    accountNumber: string;
    accountNumberLabel: 'Mobile' | 'Account no.';
    qrImageUrl: string;
  };
  logo: { mark: string; color: string };
}

interface PaymentMethodListProps {
  methods: EnrichedPaymentMethod[];
  selectedMethodId: PaymentProviderId;
  onSelectMethod: (methodId: PaymentProviderId) => void;
  depositAmount: number;
}

export const PaymentMethodList: React.FC<PaymentMethodListProps> = memo(({
  methods,
  selectedMethodId,
  onSelectMethod,
  depositAmount,
}) => {
  const enabledMethods = methods.filter((m) => m.enabled);
  const ewallets = enabledMethods.filter((m) => m.category === 'ewallet');
  const banks = enabledMethods.filter((m) => m.category === 'bank');

  const renderCard = (m: EnrichedPaymentMethod) => {
    const isSelected = selectedMethodId === m.id;
    return (
      <div
        key={m.id}
        role="radio"
        aria-checked={isSelected}
        tabIndex={0}
        onClick={() => onSelectMethod(m.id)}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            onSelectMethod(m.id);
          }
        }}
        className={`group relative flex items-center justify-between p-4 rounded-md border transition-all cursor-pointer min-h-[56px] select-none ${isSelected
          ? 'bg-gold/[0.08] border-gold shadow-[0_0_15px_rgba(212,175,55,0.15)] ring-1 ring-gold/40'
          : 'bg-charcoal-light/60 border-white/10 hover:border-gold/40 hover:bg-charcoal-light'
          }`}
      >
        <div className="flex items-center gap-3.5 min-w-0">
          {/* Authentic Brand Logo */}
          <PaymentProviderLogo providerId={m.id} size="md" />

          {/* Details */}
          <div className="min-w-0">
            <div className="text-sm font-semibold text-ivory group-hover:text-gold transition-colors">
              {m.label}
            </div>
            <div className="text-[11px] text-ivory-dim truncate">
              Scan QR with your {m.label} app
            </div>
          </div>
        </div>

        {/* Radio Indicator */}
        <div className="shrink-0 ml-3">
          <div
            className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${isSelected
              ? 'border-gold bg-gold'
              : 'border-white/30 bg-transparent group-hover:border-gold/50'
              }`}
          >
            {isSelected && <div className="w-2 h-2 rounded-full bg-charcoal" />}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in" role="radiogroup" aria-label="Payment method selection">
      {ewallets.length > 0 && (
        <div className="space-y-2.5">
          <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-ivory-dim font-bold">
            E-Wallets
          </div>
          <div className="grid gap-2.5">
            {ewallets.map(renderCard)}
          </div>
        </div>
      )}

      {banks.length > 0 && (
        <div className="space-y-2.5">
          <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-ivory-dim font-bold">
            Digital Banks
          </div>
          <div className="grid gap-2.5">
            {banks.map(renderCard)}
          </div>
        </div>
      )}

      {enabledMethods.length === 0 && (
        <div className="p-6 text-center text-sm text-ivory-dim bg-charcoal/50 border border-white/10 rounded-md">
          No online payment methods are currently active. Please contact the shop.
        </div>
      )}

      {/* Amount Due & Helper Text */}
      <div className="pt-4 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <span className="text-xs text-ivory-dim">Amount due now: </span>
          <span className="text-sm font-bold font-mono text-gold">₱{depositAmount.toFixed(2)}</span>
        </div>
        <p className="text-[11px] text-ivory-dim/80">
          Scan a QR, pay in your app, then upload the receipt.
        </p>
      </div>
    </div>
  );
});

PaymentMethodList.displayName = 'PaymentMethodList';
