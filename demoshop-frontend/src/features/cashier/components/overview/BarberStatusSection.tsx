import React, { useMemo, useState } from 'react';
import { Loader2, Scissors } from 'lucide-react';
import type { BarberInfo } from '../../components/queue/types';

interface BarberStatusSectionProps {
  barbers: BarberInfo[];
  onUpdateBarberStatus?: (barberId: string | number, status: string) => Promise<void>;
  loading?: boolean;
}

export const BarberStatusSection: React.FC<BarberStatusSectionProps> = ({
  barbers,
  onUpdateBarberStatus,
  loading = false,
}) => {
  const [updatingBarberId, setUpdatingBarberId] = useState<string | null>(null);

  // Filter only on-duty/scheduled barbers who are present for today's shop operations
  const onDutyBarbers = useMemo(() => {
    return barbers.filter((barber) => {
      if (barber.isOffToday === true) return false;
      if (barber.isOnDutyToday === false) return false;
      const status = (barber.status || '').toLowerCase();
      if (status === 'off_duty' || status === 'suspended' || status === 'offline') return false;
      return true;
    });
  }, [barbers]);

  const handleBarberStatusChange = async (barberId: string, newStatus: string) => {
    if (!onUpdateBarberStatus || updatingBarberId) return;
    try {
      setUpdatingBarberId(barberId);
      await onUpdateBarberStatus(barberId, newStatus);
    } finally {
      setUpdatingBarberId(null);
    }
  };

  return (
    <section
      aria-labelledby="barber-status-heading"
      className="min-w-0 rounded-sm border border-white/10 bg-white/5 p-4 sm:p-5 card-gold-accent flex flex-col"
    >
      <div className="flex flex-1 flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-white/5 pb-4 mb-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gold">Cashier • Floor Team</p>
            <h2 id="barber-status-heading" className="mt-1 text-lg sm:text-xl font-serif font-bold text-ivory">
              <span>Barber Status</span>
            </h2>
            <p className="text-[11px] text-ivory-dim mt-0.5">
              Setting a barber on break may shift online reservation times by up to 15 minutes.
            </p>
          </div>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-gold/20 bg-gold/10 text-gold"><Scissors className="h-4 w-4" aria-hidden="true" /></span>
        </div>

        {loading && onDutyBarbers.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 animate-pulse" aria-label="Loading barber availability">
            {[0, 1, 2, 3].map((index) => (
              <div
                key={index}
                className="flex flex-col justify-between p-2.5 rounded-sm border border-white/5 bg-charcoal/80"
              >
                <div className="flex items-center justify-between gap-1.5 min-w-0 mb-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-2 h-2 rounded-full shrink-0 bg-white/10" />
                    <span className="h-3 w-24 rounded-sm bg-white/10" />
                  </div>
                  <span className="h-2.5 w-16 rounded-sm bg-white/10" />
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-white/5 pt-2">
                  <span className="h-2.5 w-12 rounded-sm bg-white/10" />
                  <span className="h-5 w-20 rounded bg-white/10" />
                </div>
              </div>
            ))}
          </div>
        ) : onDutyBarbers.length === 0 ? (
          <div className="flex min-h-52 flex-col items-center justify-center rounded-sm border border-dashed border-white/10 bg-white/[0.015] px-4 py-10 text-center">
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5 text-gold/60"><Scissors className="h-6 w-6" aria-hidden="true" /></span>
            <p className="text-sm font-semibold text-ivory">No on-duty barbers</p>
            <p className="mt-1 text-xs text-ivory-dim">Today&apos;s scheduled barbers will appear here.</p>
          </div>
        ) : (
          <div className="grid flex-1 auto-rows-fr grid-cols-1 sm:grid-cols-2 gap-2">
            {onDutyBarbers.map((barber) => {
              const currentStatus = (barber.status || 'available').trim().toLowerCase().replace(/[\s-]+/g, '_');
              const isOnBreak = currentStatus === 'break' || currentStatus === 'on_break';
              const isServing = currentStatus === 'serving' || currentStatus === 'busy';
              const isUpdating = updatingBarberId === String(barber.id);

              return (
                <div
                  key={barber.id}
                  className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 p-3 rounded-sm border transition-colors ${isOnBreak
                    ? 'border-yellow-400/30 bg-yellow-400/5'
                    : isServing
                      ? 'border-gold/30 bg-gold/[0.04]'
                      : 'border-white/5 bg-charcoal/80'
                    }`}
                >
                  <div className="flex min-w-0 flex-col items-start gap-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: isOnBreak ? '#FACC15' : barber.color || '#D4AF37' }}
                      />
                      <span className="text-xs font-bold text-ivory truncate" title={barber.name}>
                        {barber.name}
                      </span>
                    </div>

                    <span
                      className={`rounded-sm border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider shrink-0 ${isOnBreak
                        ? 'border-yellow-400/20 bg-yellow-400/10 text-yellow-400'
                        : isServing
                          ? 'border-gold/20 bg-gold/10 text-gold'
                          : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-400'
                        }`}
                    >
                      {isOnBreak ? 'On Break' : isServing ? 'Serving' : 'Available'}
                    </span>
                  </div>

                  <div className="flex items-center">
                    {onUpdateBarberStatus && (
                      <button
                        type="button"
                        role="switch"
                        aria-label={`Availability for ${barber.name}`}
                        aria-checked={!isOnBreak}
                        aria-busy={isUpdating}
                        title={isOnBreak ? `Set ${barber.name} to Available` : `Set ${barber.name} to On Break`}
                        disabled={updatingBarberId !== null}
                        onClick={() => void handleBarberStatusChange(String(barber.id), isOnBreak ? 'Available' : 'On Break')}
                        className="group flex min-h-10 min-w-10 items-center justify-center cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-charcoal disabled:cursor-wait disabled:opacity-50"
                      >
                        <span className={`relative inline-flex h-5 w-9 items-center rounded-full border transition-colors ${isOnBreak ? 'border-white/20 bg-white/5' : 'border-gold/50 bg-gold/20 group-hover:bg-gold/30'}`}>
                          <span className={`absolute left-0.5 flex h-4 w-4 items-center justify-center rounded-full shadow-sm transition-transform motion-reduce:transition-none ${isOnBreak ? 'translate-x-0 bg-white/15 text-ivory-dim' : 'translate-x-4 bg-gold text-charcoal'}`}>
                            {isUpdating ? <Loader2 className="h-2.5 w-2.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Scissors className="h-2.5 w-2.5" aria-hidden="true" />}
                          </span>
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};

export default BarberStatusSection;
