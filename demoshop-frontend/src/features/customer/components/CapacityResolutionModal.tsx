import React from 'react';
import { Clock, ArrowRight, Calendar, X } from 'lucide-react';
import Portal from '@/components/common/Portal';

export interface NextSlotRecommendation {
  time: string;
  availableChairs: number;
}

interface CapacityResolutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupSize: number;
  availableBarbersCount: number;
  estimatedWaitMinutes: number;
  selectedSlot: string;
  nextSimultaneousSlot: NextSlotRecommendation | null;
  barbers: Array<{
    id: number | string;
    name?: string;
    image?: string;
    isAvailableAtSlot: boolean;
    statusLabel?: string;
  }>;
  onSelectStagger: () => void;
  onSelectSimultaneous: (slot: string) => void;
}

const BarberAvatarItem: React.FC<{
  barber: {
    id: number | string;
    name?: string;
    image?: string;
    isAvailableAtSlot: boolean;
    statusLabel?: string;
  };
}> = ({ barber }) => {
  const [imgError, setImgError] = React.useState(false);
  const initials = (barber.name || 'Barber')
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex min-w-0 flex-col items-center text-center">
      <div
        className={`relative w-16 h-16 sm:w-18 sm:h-18 rounded-full border-2 p-0.5 transition-all ${
          barber.isAvailableAtSlot
            ? 'border-gold shadow-sm shadow-gold/20'
            : 'border-white/20'
        }`}
      >
        <div className="w-full h-full rounded-full overflow-hidden bg-charcoal flex items-center justify-center">
          {barber.image && !imgError ? (
            <img
              src={barber.image}
              alt={barber.name || 'Barber'}
              onError={() => setImgError(true)}
              className={`w-full h-full object-cover transition-all ${
                barber.isAvailableAtSlot ? '' : 'grayscale opacity-60'
              }`}
            />
          ) : (
            <span className={`text-sm font-bold ${barber.isAvailableAtSlot ? 'text-gold' : 'text-ivory-dim/60'}`}>
              {initials}
            </span>
          )}
        </div>
      </div>
      <p className="mt-2 max-w-full truncate text-xs sm:text-sm font-medium text-ivory">
        {barber.name || 'Barber'}
      </p>
      {!barber.isAvailableAtSlot && (
        <span className="mt-1 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide bg-red-500/15 text-red-400 border border-red-500/30">
          (occupied)
        </span>
      )}
    </div>
  );
};

export const CapacityResolutionModal: React.FC<CapacityResolutionModalProps> = ({
  isOpen,
  onClose,
  groupSize,
  availableBarbersCount,
  estimatedWaitMinutes,
  selectedSlot,
  nextSimultaneousSlot,
  barbers,
  onSelectStagger,
  onSelectSimultaneous,
}) => {
  const remainingCount = Math.max(1, groupSize - availableBarbersCount);

  const getOrdinal = (n: number) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  const remainingText = remainingCount === 1
    ? `The ${getOrdinal(groupSize)} person starts`
    : `The remaining ${remainingCount} guests start`;

  const secondOptionDescription = `${availableBarbersCount} of you start on time. ${remainingText} when a barber is free (about ${estimatedWaitMinutes} mins).`;

  if (!isOpen) return null;

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/80 animate-fade-in" onClick={onClose} />
        <div className="relative z-10 flex w-full max-w-md flex-col items-center animate-zoom-in">
          <div className="w-full bg-charcoal text-ivory border border-white/10 rounded-sm shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <h3 className="text-xl font-serif font-bold text-ivory">Not enough barbers at {selectedSlot}</h3>
              <button type="button" onClick={onClose} className="text-ivory-dim hover:text-gold transition-colors p-1 rounded-full cursor-pointer" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              {/* Subtitle / explanation */}
              <div className="space-y-2">
                <p className="text-xs sm:text-sm text-ivory leading-relaxed">
                  Only{' '}
                  <span className="text-gold font-bold">
                    {availableBarbersCount} {availableBarbersCount === 1 ? 'barber is' : 'barbers are'}
                  </span>{' '}
                  free at {selectedSlot}, but you're booking for{' '}
                  <span className="text-gold font-bold">{groupSize} people</span>.
                </p>
                <p className="text-xs sm:text-sm text-ivory-dim">
                  What would you like to do?
                </p>
              </div>

              {/* Option choices */}
              <div className="space-y-3 pt-3">
                {/* Card 1: Choose another time */}
                <button
                  type="button"
                  onClick={() => {
                    if (nextSimultaneousSlot && onSelectSimultaneous) {
                      onSelectSimultaneous(nextSimultaneousSlot.time);
                    } else {
                      onClose();
                    }
                  }}
                  className="w-full text-left p-3.5 sm:p-4 rounded-lg border border-gold/60 bg-gold/[0.04] hover:border-gold hover:bg-gold/[0.08] transition-all duration-200 group cursor-pointer focus:outline-none focus:ring-1 focus:ring-gold"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0 group-hover:border-gold/40 transition-colors mt-0.5">
                        <Calendar className="w-4 h-4 text-gold" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm sm:text-base font-bold text-ivory group-hover:text-gold transition-colors">
                            Choose another time
                          </h4>
                          <span className="text-[10px] font-black tracking-wider uppercase px-2 py-0.5 rounded-full bg-gold text-charcoal shadow-sm">
                            RECOMMENDED
                          </span>
                        </div>
                        <p className="text-xs text-emerald-400 mt-1 leading-snug font-medium">
                          Pick a time when all {groupSize} of you can start together.
                        </p>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-gold group-hover:translate-x-1 transition-transform shrink-0" />
                  </div>
                </button>

                {/* Card 2: Keep current time */}
                <button
                  type="button"
                  onClick={onSelectStagger}
                  className="w-full text-left p-3.5 sm:p-4 rounded-lg border border-white/10 bg-white/[0.03] hover:border-gold/50 hover:bg-white/[0.06] transition-all duration-200 group cursor-pointer focus:outline-none focus:ring-1 focus:ring-gold"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0 group-hover:border-gold/40 transition-colors mt-0.5">
                        <Clock className="w-4 h-4 text-gold" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm sm:text-base font-bold text-ivory group-hover:text-gold transition-colors">
                          Keep {selectedSlot}
                        </h4>
                        <p className="text-xs text-ivory-dim mt-1 leading-snug">
                          {secondOptionDescription}
                        </p>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-ivory-dim group-hover:text-gold group-hover:translate-x-1 transition-all shrink-0" />
                  </div>
                </button>
              </div>

              {/* Barbers list */}
              {barbers.length > 0 && (
                <div className="pt-4 border-t border-white/5 mt-5">
                  <div className="grid grid-cols-3 gap-3 items-start">
                    {barbers.map((barber) => (
                      <BarberAvatarItem key={String(barber.id)} barber={barber} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
};
