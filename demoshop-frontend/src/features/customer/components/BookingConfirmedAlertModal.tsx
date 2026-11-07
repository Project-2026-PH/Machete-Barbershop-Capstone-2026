import React, { useEffect } from 'react';
import { X, Calendar, Clock, Scissors, User } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { formatManilaDate, formatManilaTime } from '@/utils/manila-date';

export interface ConfirmedBookingAlertData {
  id?: number | string;
  barberName?: string;
  serviceName?: string;
  preferredDate?: string;
  preferredTime?: string;
  totalAmount?: number | string;
  branchName?: string;
  guestCount?: number;
  totalDeposit?: number | string;
}

interface BookingConfirmedAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  onViewBooking: () => void;
  data: ConfirmedBookingAlertData | null;
}

export const BookingConfirmedAlertModal: React.FC<BookingConfirmedAlertModalProps> = ({
  isOpen,
  onClose,
  onViewBooking,
  data,
}) => {
  // Handle ESC key press
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const formattedDate = data?.preferredDate
    ? formatManilaDate(data.preferredDate)
    : 'Scheduled Date';
  const formattedTime = data?.preferredTime
    ? formatManilaTime(data.preferredTime)
    : 'Scheduled Time';
  const barberName = data?.barberName || 'Assigned Barber';
  const serviceName = data?.serviceName || 'Barbershop Service';
  const queueCode = data?.id ? `MCH-${String(data.id).padStart(4, '0')}` : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/80 backdrop-blur-md transition-all duration-500 animate-fadeIn p-0 md:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="booking-confirmed-title"
    >
      <div
        className="relative w-full md:max-w-md bg-charcoal border-t md:border border-gold/40 rounded-t-3xl md:rounded-2xl p-6 sm:p-7 shadow-[0_20px_60px_rgba(0,0,0,0.9),0_0_30px_rgba(212,175,55,0.2)] flex flex-col items-center text-center overflow-hidden transform transition-all duration-500 ease-out animate-slideUp md:animate-zoom-in card-gold-accent"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Ambient Top Glow Line */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-gold to-transparent" />

        {/* Decorative Ambient Accents */}
        <div className="absolute -top-12 -left-12 w-28 h-28 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -top-12 -right-12 w-28 h-28 bg-gold/20 rounded-full blur-3xl pointer-events-none" />

        {/* Close Button ("×") */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/5 border border-white/10 hover:bg-white/15 text-ivory-dim hover:text-white flex items-center justify-center transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-gold/50"
          aria-label="Close confirmation alert"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Central Emblem Badge with Animated Checkmark */}
        <div className="relative mt-2 mb-4">
          <div className="relative w-20 h-20 rounded-full bg-gradient-to-b from-emerald-950/90 to-charcoal border-2 border-emerald-400/80 flex items-center justify-center">
            <div className="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-400/60 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-emerald-300"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <style>{`
                  @keyframes drawCheck {
                    0% {
                      stroke-dashoffset: 36;
                      opacity: 0;
                    }
                    50% {
                      opacity: 1;
                    }
                    100% {
                      stroke-dashoffset: 0;
                      opacity: 1;
                    }
                  }
                  .animate-draw-check {
                    stroke-dasharray: 36;
                    stroke-dashoffset: 36;
                    animation: drawCheck 0.7s cubic-bezier(0.65, 0, 0.35, 1) 0.15s forwards;
                  }
                `}</style>
                <polyline points="20 6 9 17 4 12" className="animate-draw-check" />
              </svg>
            </div>
          </div>
        </div>

        {/* Status Capsule Badges */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            Confirmed
          </span>
          <span className="inline-flex items-center gap-1 px-3 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-gold/15 text-gold border border-gold/40 shadow-sm">
            {data?.guestCount && data.guestCount > 1
              ? `Reservation Fee Paid (${data.guestCount} Guests): ₱${(Number(data.totalDeposit) || data.guestCount * 50).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} [PAID]`
              : 'Reservation Fee Paid: ₱50.00 [PAID]'}
          </span>
        </div>

        {/* Headline */}
        <h2
          id="booking-confirmed-title"
          className="text-2xl sm:text-3xl font-serif font-bold text-ivory tracking-wide mb-4 sm:mb-5"
        >
          Booking Confirmed!
        </h2>

        {/* Appointment Details Card */}
        <div className="w-full bg-white/[0.03] border border-white/10 rounded-xl p-3.5 space-y-2.5 mb-6 text-left shadow-inner">
          {queueCode && (
            <div className="flex items-center justify-between text-xs pb-2 border-b border-white/5 font-mono">
              <span className="text-ivory-dim">Queue Ref.</span>
              <span className="text-gold font-bold">{queueCode}</span>
            </div>
          )}
          <div className="flex items-center gap-2.5 text-xs text-ivory">
            <Scissors className="w-3.5 h-3.5 text-gold shrink-0" />
            <span className="truncate font-medium">{serviceName}</span>
          </div>
          <div className="flex items-center gap-2.5 text-xs text-ivory">
            <User className="w-3.5 h-3.5 text-gold shrink-0" />
            <span className="truncate">
              <span className="text-ivory-dim font-normal">Barber: </span>
              <span className="font-semibold text-ivory">{barberName}</span>
            </span>
          </div>
          <div className="flex items-center gap-2.5 text-xs text-ivory-dim">
            <Calendar className="w-3.5 h-3.5 text-gold shrink-0" />
            <span>{formattedDate}</span>
            <Clock className="w-3.5 h-3.5 text-gold shrink-0 ml-2" />
            <span>{formattedTime}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="w-full flex flex-col gap-2.5">
          <Button
            type="button"
            variant="primary"
            onClick={onViewBooking}
            className="w-full bg-gold hover:bg-gold-light text-charcoal font-bold py-3 rounded-lg shadow-md flex items-center justify-center gap-2 cursor-pointer uppercase text-xs tracking-wider transition-all duration-200 active:scale-[0.98]"
          >
            View Booking
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="w-full border-white/15 text-ivory hover:bg-white/10 font-semibold py-2.5 rounded-lg cursor-pointer uppercase text-xs tracking-wider transition-all duration-200"
          >
            Done
          </Button>
        </div>
      </div>
    </div>
  );
};
