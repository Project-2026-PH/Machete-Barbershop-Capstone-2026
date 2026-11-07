import React, { memo } from 'react';

interface AgreementRowProps {
  agreed: boolean;
  disabled?: boolean;
  depositAmount: number;
  onToggle: (checked: boolean) => void;
  onOpenTerms: () => void;
}

export const AgreementRow: React.FC<AgreementRowProps> = memo(({
  agreed,
  disabled = false,
  depositAmount,
  onToggle,
  onOpenTerms,
}) => {
  return (
    <div className="bg-charcoal-light/90 border border-white/10 rounded-lg p-4 shadow-md">
      {!agreed && (
        <p className="mb-3 text-[11px] leading-relaxed text-amber-300">
          Please open and read the Terms of Service &amp; Booking Policy before checking the agreement box.
        </p>
      )}
      <label className={`flex items-start gap-3.5 min-h-[44px] ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
        <input
          type="checkbox"
          checked={agreed}
          disabled={disabled}
          onChange={(e) => onToggle(e.target.checked)}
          className={`mt-0.5 w-5 h-5 rounded border-white/20 bg-charcoal text-gold focus:ring-gold accent-gold shrink-0 ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
          title={disabled ? 'Open the Terms of Service & Booking Policy first.' : undefined}
        />
        <div className={`text-xs leading-relaxed select-none ${disabled ? 'text-ivory-dim' : 'text-ivory'}`}>
          I agree to the{' '}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onOpenTerms();
            }}
            className="text-gold opacity-100 font-semibold underline underline-offset-2 hover:text-gold-light transition-colors cursor-pointer"
          >
            Terms of Service &amp; Booking Policy
          </button>
          , including the 24-hour cancellation &amp; rescheduling window and non-refundable{' '}
          <strong className="text-gold font-mono">₱{depositAmount.toFixed(2)}</strong> reservation deposit.
        </div>
      </label>
    </div>
  );
});

AgreementRow.displayName = 'AgreementRow';
