import React from 'react';
import { Clock, User, Scissors, CheckCircle, CalendarDays, ArrowRight, Timer, AlertCircle } from 'lucide-react';
import { Modal } from '@/components/feedback/Modal';
import { isCustomerAwaitingArrival, type CustomerInfo } from '../queue/types';

interface ClientDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: CustomerInfo | null;
  barberName?: string;
  onOpenPOS: () => void;
  onOpenQueue: () => void;
}

export const ClientDetailModal: React.FC<ClientDetailModalProps> = ({
  isOpen,
  onClose,
  customer,
  barberName,
  onOpenPOS,
  onOpenQueue,
}) => {
  if (!customer) return null;

  const isServing = customer.status === 'serving';
  const isWaiting = customer.status === 'waiting';
  const isAwaitingArrival = isCustomerAwaitingArrival(customer);
  const startTime = customer.serviceStartedAt || customer.timerStartedAt;
  const estDuration = Number(customer.estMinutes) || 30;

  let elapsedMinutes = 0;
  if (startTime) {
    const startMs = new Date(startTime).getTime();
    if (!isNaN(startMs)) {
      elapsedMinutes = Math.max(0, Math.floor((Date.now() - startMs) / 60_000));
    }
  } else if (isWaiting) {
    elapsedMinutes = customer.waitMin || 0;
    if (!elapsedMinutes && customer.createdAt) {
      const createdMs = new Date(customer.createdAt).getTime();
      if (!isNaN(createdMs)) {
        elapsedMinutes = Math.max(0, Math.floor((Date.now() - createdMs) / 60_000));
      }
    }
  }

  const remainingMinutes = Math.max(0, estDuration - elapsedMinutes);
  const isNearlyFinished = isServing && (remainingMinutes <= 10 || elapsedMinutes >= estDuration - 5);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Client Queue Details"
      size="md"
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenQueue();
            }}
            className="text-xs text-ivory-dim hover:text-gold transition-colors flex items-center gap-1.5 cursor-pointer py-2 px-3 rounded-sm border border-white/10 hover:border-gold/40"
          >
            <span>View in Queue Board</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs rounded-sm border border-white/10 text-ivory hover:bg-white/5 transition-colors cursor-pointer"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenPOS();
              }}
              className="px-4 py-2 text-xs font-semibold rounded-sm bg-gold text-charcoal hover:bg-gold-dim transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
            >
              <span>Open in POS</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Top Header Card */}
        <div className="p-4 rounded-sm border border-white/10 bg-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center text-gold font-bold font-serif">
              {customer.name?.charAt(0).toUpperCase() || 'C'}
            </div>
            <div>
              <h4 className="text-base font-bold text-ivory">{customer.name || 'Walk-in Client'}</h4>
              <p className="text-xs text-ivory-dim">{customer.guestReference ? `Ref: ${customer.guestReference}` : 'Walk-in Ticket'}</p>
            </div>
          </div>
          <div>
            {isAwaitingArrival ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-500/15 text-sky-400 border border-sky-500/30">
                <CalendarDays className="w-3.5 h-3.5" />
                "Awaiting Arrival"
              </span>
            ) : isServing ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gold/15 text-gold border border-gold/30">
                <Scissors className="w-3.5 h-3.5" />
                In Chair
              </span>
            ) : isWaiting ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-white/10 text-ivory-dim border border-white/10">
                <Clock className="w-3.5 h-3.5" />
                Waiting in Line
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                <CheckCircle className="w-3.5 h-3.5" />
                {customer.status}
              </span>
            )}
          </div>
        </div>

        {/* Nearly finished alert if applicable */}
        {isNearlyFinished && (
          <div className="p-3 rounded-sm border border-amber-500/40 bg-amber-500/10 flex items-center gap-2.5 text-xs text-amber-300 animate-pulse">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>
              <strong>Nearly Finished:</strong> This client is wrapping up with approximately {remainingMinutes} min remaining.
            </span>
          </div>
        )}

        {/* Details Grid */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-sm border border-white/5 bg-charcoal-light/50">
            <p className="text-ivory-dim uppercase tracking-wider text-[10px]">Service Requested</p>
            <p className="mt-1 font-semibold text-ivory">{customer.service || 'Haircut'}</p>
            <p className="mt-0.5 text-ivory-dim/70">Est. duration: {estDuration} mins</p>
          </div>

          <div className="p-3 rounded-sm border border-white/5 bg-charcoal-light/50">
            <p className="text-ivory-dim uppercase tracking-wider text-[10px]">Assigned Barber</p>
            <p className="mt-1 font-semibold text-gold">{barberName || 'First Available'}</p>
            <p className="mt-0.5 text-ivory-dim/70">{isServing ? 'Currently cutting' : 'Assigned in queue'}</p>
          </div>

          <div className="p-3 rounded-sm border border-white/5 bg-charcoal-light/50">
            <p className="text-ivory-dim uppercase tracking-wider text-[10px]">
              {isServing ? 'Time in Chair' : 'Time in Line'}
            </p>
            <p className="mt-1 font-semibold text-ivory flex items-center gap-1.5">
              <Timer className="w-3.5 h-3.5 text-gold" />
              <span>{elapsedMinutes} mins elapsed</span>
            </p>
          </div>

          <div className="p-3 rounded-sm border border-white/5 bg-charcoal-light/50">
            <p className="text-ivory-dim uppercase tracking-wider text-[10px]">
              {isServing ? 'Est. Completion' : 'Est. Remaining Wait'}
            </p>
            <p className="mt-1 font-semibold text-ivory">
              {isServing
                ? remainingMinutes > 0
                  ? `~${remainingMinutes}m remaining`
                  : 'Finishing up'
                : `Next available chair`}
            </p>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default ClientDetailModal;
