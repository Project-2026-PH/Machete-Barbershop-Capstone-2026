import React, { memo } from 'react';
import { X, ShieldCheck } from 'lucide-react';
import Portal from '@/components/common/Portal';

interface TermsSheetProps {
  isOpen: boolean;
  depositAmount: number;
  onClose: () => void;
}

export const TermsSheet: React.FC<TermsSheetProps> = memo(({
  isOpen,
  depositAmount,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <Portal>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="terms-title"
        className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto p-16 sm:p-20 bg-black/80 backdrop-blur-sm animate-fade-in"
      >
      <div
        className="w-full sm:max-w-2xl max-h-[85vh] overflow-hidden bg-charcoal border border-white/10 rounded-lg flex flex-col shadow-2xl animate-slide-up"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded bg-gold/15 text-gold border border-gold/30">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 id="terms-title" className="text-sm sm:text-base font-serif font-bold text-ivory">
                Terms of Service &amp; Booking Policy
              </h3>
              <p className="text-[11px] text-ivory-dim">
                DemoShop Barbershop Reservation Agreement
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full hover:bg-white/10 text-ivory-dim hover:text-ivory transition-colors cursor-pointer"
            aria-label="Close Terms & Policy"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="min-h-0 p-4 sm:p-6 overflow-y-auto space-y-4 text-xs sm:text-sm text-ivory-dim font-light leading-relaxed custom-scrollbar">
          <section className="space-y-1.5">
            <h4 className="font-bold text-ivory text-xs uppercase tracking-wider">
              1. Non-Refundable Reservation Deposit
            </h4>
            <p>
              A reservation fee of <strong>₱50.00 per guest</strong> (₱{depositAmount.toFixed(2)} total) is required to secure your appointment slot. This fee is credited towards your final service bill at the counter. All online reservation deposits are <strong>strictly non-refundable</strong> once confirmed.
            </p>
          </section>

          <section className="space-y-1.5">
            <h4 className="font-bold text-ivory text-xs uppercase tracking-wider">
              2. Cancellation &amp; Rescheduling Policy (24-Hour Notice)
            </h4>
            <p>
              Appointment cancellations and rescheduling/rebooking are strictly permitted only if made more than 24 hours prior to the scheduled appointment time. Cancellations or changes made within 24 hours will forfeit the ₱50 reservation deposit.
            </p>
            <p className="text-[11px] text-ivory-dim/80">
              During checkout, your selected chair and barber are held for 15 minutes while you complete your e-wallet transfer. If payment proof is not submitted within 15 minutes, the slot is released to other customers.
            </p>
          </section>

          <section className="space-y-1.5">
            <h4 className="font-bold text-ivory text-xs uppercase tracking-wider">
              3. Punctuality &amp; Arrival Window
            </h4>
            <p>
              Please arrive <strong>5 to 10 minutes</strong> before your scheduled time. If you arrive more than 15 minutes late without prior notice, your slot may be reassigned to walk-in patrons to prevent chair scheduling delays.
            </p>
          </section>

          <section className="space-y-1.5">
            <h4 className="font-bold text-ivory text-xs uppercase tracking-wider">
              4. Service Balance Payment
            </h4>
            <p>
              The remaining balance for your selected haircuts, treatments, and add-on services will be settled in cash or e-wallet at the shop counter after your grooming is completed.
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-6 py-2.5 rounded bg-gold text-charcoal font-bold text-xs uppercase tracking-wider hover:bg-gold-light transition-colors cursor-pointer"
          >
            I Understand
          </button>
        </div>
      </div>
      </div>
    </Portal>
  );
});

TermsSheet.displayName = 'TermsSheet';
