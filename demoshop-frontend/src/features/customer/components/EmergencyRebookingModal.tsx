import React, { useState, useEffect } from 'react';
import { AlertTriangle, Clock, RefreshCw, X, CheckCircle2, ShieldAlert } from 'lucide-react';
import { formatManilaDate, formatManilaTime } from '@/utils/manila-date';

export interface RebookSlotOption {
  barberId: number;
  barberName: string;
  date: string;
  time: string;
  scheduledStartAt: string;
  arrivalDeadlineAt: string;
}

export interface AffectedBookingNotice {
  queueId: number;
  branchId: number;
  serviceIds?: number[];
  originalBarberId: number | null;
  originalBarberName: string;
  originalDate: string | null;
  originalTime: string | null;
  cancellationType: string;
  cancellationReason: string;
  cancelledAt: string;
  availableRebookSlots: RebookSlotOption[];
}

interface EmergencyRebookingModalProps {
  notice: AffectedBookingNotice;
  onClose: () => void;
  onRebooked: () => void;
  onRefunded: () => void;
}

export const EmergencyRebookingModal: React.FC<EmergencyRebookingModalProps> = ({
  notice,
  onClose,
  onRebooked,
  onRefunded,
}) => {
  const replacementSlots = notice.availableRebookSlots.filter((slot) => (
    Number(slot.barberId) > 0
    && Number(slot.barberId) !== Number(notice.originalBarberId || 0)
  ));
  const [selectedSlot, setSelectedSlot] = useState<RebookSlotOption | null>(
    replacementSlots[0] || null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRebook = async () => {
    if (!selectedSlot) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/queue/emergency-rebook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
        },
        body: JSON.stringify({
          queueId: notice.queueId,
          selectedSlot,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to rebook slot');
      }

      onRebooked();
    } catch (err: any) {
      setError(err.message || 'An error occurred during rebooking');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDecline = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/queue/emergency-decline', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
        },
        body: JSON.stringify({
          queueId: notice.queueId,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to submit decline request');
      }

      onRefunded();
    } catch (err: any) {
      setError(err.message || 'An error occurred during cancellation processing');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-charcoal border border-amber-500/50 rounded-lg max-w-lg w-full p-6 shadow-2xl space-y-6 relative text-white">
        {/* Header Banner */}
        <div className="flex items-start gap-4 border-b border-white/10 pb-4">
          <div className="p-3 bg-amber-500/20 text-amber-400 rounded-full shrink-0 border border-amber-500/30">
            <AlertTriangle size={28} />
          </div>
          <div>
            <h3 className="text-xl font-bold text-amber-400 tracking-wide uppercase">
              Schedule Disruption Notice
            </h3>
            <p className="text-xs text-gray-300 mt-1">
              Your reservation with <span className="font-semibold text-white">{notice.originalBarberName}</span> was affected due to a shop disruption:
            </p>
            <div className="mt-2 text-xs font-mono bg-charcoal-light/60 p-2.5 rounded border border-white/10 text-amber-200">
              "{notice.cancellationReason}"
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-md border border-emerald-500/30 bg-emerald-500/[0.08] px-3 py-2 text-xs">
          <span className="text-gray-300">Reservation deposit</span>
          <span className="font-bold uppercase tracking-wider text-emerald-300">₱50.00 · PAID</span>
        </div>

        {/* Action Options */}
        <div className="space-y-4">
          <h4 className="text-sm font-semibold uppercase tracking-wider text-gray-300 flex items-center gap-2">
            <Clock size={16} className="text-gold" />
            Select Instant Priority Re-Booking Slot
          </h4>

          {replacementSlots.length > 0 ? (
            <div className="grid grid-cols-1 gap-2.5 max-h-48 overflow-y-auto pr-1">
              {replacementSlots.map((slot, idx) => {
                const isSelected =
                  selectedSlot?.barberId === slot.barberId && selectedSlot?.time === slot.time && selectedSlot?.date === slot.date;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedSlot(slot)}
                    className={`flex items-center justify-between p-3 rounded-md border text-left transition-all ${
                      isSelected
                        ? 'border-gold bg-gold/10 text-white shadow-[0_0_12px_rgba(212,175,55,0.2)]'
                        : 'border-white/10 bg-charcoal-light/40 text-gray-300 hover:border-white/30'
                    }`}
                  >
                    <div>
                      <div className="text-sm font-bold text-gold">{formatManilaTime(slot.time)}</div>
                      <div className="text-xs text-gray-400">
                        {slot.barberName} • {formatManilaDate(slot.date)}
                      </div>
                    </div>
                    {isSelected && <CheckCircle2 size={20} className="text-gold" />}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic bg-charcoal-light p-3 rounded border border-white/5">
              No priority automated slots are available today. Please decline or book manually for another day.
            </p>
          )}

          {error && (
            <div className="p-3 bg-red-950/50 border border-red-800/40 text-red-400 text-xs rounded">
              {error}
            </div>
          )}
        </div>

        {/* Modal Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          {replacementSlots.length > 0 && (
            <button
              onClick={handleRebook}
              disabled={isSubmitting || !selectedSlot}
              className="flex-1 py-3 px-4 bg-gradient-to-r from-gold to-gold-dark hover:brightness-110 text-charcoal font-bold rounded uppercase tracking-wider text-xs shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? <RefreshCw className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
              Re-Book — Deposit PAID
            </button>
          )}

          <button
            onClick={handleDecline}
            disabled={isSubmitting}
            className="flex-1 py-3 px-4 bg-red-950/40 border border-red-800/50 hover:bg-red-900/60 text-red-300 font-semibold rounded uppercase tracking-wider text-xs transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <ShieldAlert size={16} />
            Keep Deposit — PAID
          </button>
        </div>
      </div>
    </div>
  );
};
