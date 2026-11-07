import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle, UserX, CalendarX, Loader2 } from 'lucide-react';
import type { AppointmentRecord, CancelAppointmentPayload } from '@demoshop/shared-types';
import { Portal } from '@/components/common/Portal';

export interface CancellationModalProps {
  isOpen: boolean;
  appointment: AppointmentRecord | null;
  initialStatus?: 'CANCELLED' | 'NO_SHOW';
  onClose: () => void;
  onConfirm: (payload: CancelAppointmentPayload) => Promise<void>;
}

const PRESET_REASONS = [
  'Customer requested cancellation',
  'Customer No-Show (15+ min late)',
  'Duplicate / Accidental booking',
  'Barber unavailable / Schedule conflict',
  'Emergency / Personal reasons',
  'Other',
];

export const CancellationModal: React.FC<CancellationModalProps> = ({
  isOpen,
  appointment,
  initialStatus = 'CANCELLED',
  onClose,
  onConfirm,
}) => {
  const [selectedStatus, setSelectedStatus] = useState<'CANCELLED' | 'NO_SHOW'>(initialStatus);
  const [selectedReason, setSelectedReason] = useState<string>(
    initialStatus === 'NO_SHOW' ? 'Customer No-Show (15+ min late)' : 'Customer requested cancellation'
  );
  const [otherText, setOtherText] = useState<string>('');
  const [otherNotes, setOtherNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Sync initial state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedStatus(initialStatus);
      setSelectedReason(
        initialStatus === 'NO_SHOW'
          ? 'Customer No-Show (15+ min late)'
          : 'Customer requested cancellation'
      );
      setOtherText('');
      setOtherNotes('');
      setValidationError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, initialStatus]);

  if (!appointment) return null;

  const handleReasonSelect = (reason: string) => {
    setSelectedReason(reason);
    setValidationError(null);
    if (reason === 'Customer No-Show (15+ min late)') {
      setSelectedStatus('NO_SHOW');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    let effectiveReason = selectedReason;
    if (selectedReason === 'Other') {
      if (!otherText.trim() || otherText.trim().length < 3) {
        setValidationError('Please specify a cancellation reason (minimum 3 characters).');
        return;
      }
      effectiveReason = otherText.trim();
    }

    if (effectiveReason.length > 255) {
      setValidationError('Cancellation reason must not exceed 255 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onConfirm({
        appointmentId: appointment.id,
        status: selectedStatus,
        cancellation_reason: effectiveReason,
        other_notes: otherNotes.trim() ? otherNotes.trim() : undefined,
      });
      onClose();
    } catch (err: any) {
      setValidationError(err?.message || 'Failed to cancel appointment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Portal>
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-hidden">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={onClose}
              className="fixed inset-0 bg-black/75 backdrop-blur-xs cursor-pointer"
            />

            {/* Modal Dialog */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-lg bg-charcoal border border-white/10 rounded-sm shadow-2xl z-10 flex flex-col overflow-hidden text-ivory divide-y divide-white/10"
            >
              {/* Header */}
              <div className="px-5 py-4 flex items-center justify-between bg-charcoal-light/60">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-sm bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400 shrink-0">
                    {selectedStatus === 'NO_SHOW' ? (
                      <UserX className="w-4 h-4" />
                    ) : (
                      <CalendarX className="w-4 h-4" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-serif text-sm sm:text-base font-bold text-ivory">
                      Cancel Appointment — <span className="text-gold">{appointment.customer_name}</span>
                    </h3>
                    <p className="text-[11px] text-ivory-dim font-mono">
                      {appointment.service_title || 'Service'} with {appointment.barber_name || 'Barber'} on{' '}
                      {appointment.scheduled_date} at {appointment.scheduled_time || '—'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="p-1 rounded-sm text-ivory-dim hover:text-ivory hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Form Body */}
              <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
                {/* Status Toggle Segmented Bar */}
                <div>
                  <label className="block text-[11px] font-mono uppercase tracking-wider text-ivory-dim mb-1.5">
                    Action / Target Status
                  </label>
                  <div className="grid grid-cols-2 gap-2 bg-charcoal-light p-1 rounded-sm border border-white/5">
                    <button
                      type="button"
                      onClick={() => setSelectedStatus('CANCELLED')}
                      className={`py-1.5 px-3 rounded-sm text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        selectedStatus === 'CANCELLED'
                          ? 'bg-red-500/20 text-red-300 border border-red-500/40 shadow-xs'
                          : 'text-ivory-dim hover:text-ivory hover:bg-white/5'
                      }`}
                    >
                      <CalendarX className="w-3.5 h-3.5" />
                      <span>Mark Cancelled</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedStatus('NO_SHOW');
                        setSelectedReason('Customer No-Show (15+ min late)');
                      }}
                      className={`py-1.5 px-3 rounded-sm text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        selectedStatus === 'NO_SHOW'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-xs'
                          : 'text-ivory-dim hover:text-ivory hover:bg-white/5'
                      }`}
                    >
                      <UserX className="w-3.5 h-3.5" />
                      <span>Mark No-Show</span>
                    </button>
                  </div>
                </div>

                {/* Preset Reasons */}
                <div>
                  <label className="block text-[11px] font-mono uppercase tracking-wider text-ivory-dim mb-2">
                    Cancellation Reason
                  </label>
                  <div className="space-y-1.5">
                    {PRESET_REASONS.map((reason) => {
                      const isSelected = selectedReason === reason;
                      return (
                        <label
                          key={reason}
                          className={`flex items-center gap-2.5 px-3 py-2 rounded-sm border text-xs cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-gold/10 border-gold/40 text-ivory font-medium'
                              : 'bg-charcoal-light border-white/5 text-ivory-dim hover:bg-white/[0.04] hover:text-ivory'
                          }`}
                        >
                          <input
                            type="radio"
                            name="cancellation_preset"
                            value={reason}
                            checked={isSelected}
                            onChange={() => handleReasonSelect(reason)}
                            className="accent-[#d4af37] w-3.5 h-3.5"
                          />
                          <span>{reason}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Expanded Mandatory Textarea for 'Other' */}
                {selectedReason === 'Other' && (
                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-gold">
                      Specify Custom Reason <span className="text-red-400">*</span>
                    </label>
                    <textarea
                      required
                      rows={3}
                      value={otherText}
                      onChange={(e) => {
                        setOtherText(e.target.value);
                        setValidationError(null);
                      }}
                      placeholder="Enter specific cancellation reason..."
                      className="w-full px-3 py-2 bg-charcoal-light border border-gold/40 rounded-sm text-xs text-ivory placeholder-ivory-dim/40 focus:outline-none focus:border-gold"
                    />
                  </div>
                )}

                {/* Optional Internal Notes */}
                <div className="space-y-1">
                  <label className="block text-[11px] font-mono uppercase tracking-wider text-ivory-dim">
                    Internal Notes (Optional)
                  </label>
                  <textarea
                    rows={2}
                    value={otherNotes}
                    onChange={(e) => setOtherNotes(e.target.value)}
                    placeholder="Add audit notes for staff records..."
                    className="w-full px-3 py-2 bg-charcoal-light border border-white/10 rounded-sm text-xs text-ivory placeholder-ivory-dim/40 focus:outline-none focus:border-gold"
                  />
                </div>

                {/* Validation Warning Alert */}
                {validationError && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-sm bg-red-950/40 border border-red-800/60 text-red-300 text-xs">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>{validationError}</span>
                  </div>
                )}

                {/* Footer Actions */}
                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-white/10">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={isSubmitting}
                    className="px-3.5 py-1.5 rounded-sm text-xs font-semibold text-ivory-dim hover:text-ivory hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    Keep Appointment
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-1.5 rounded-sm text-xs font-semibold bg-red-600/90 hover:bg-red-600 text-white border border-red-500/50 shadow-sm flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Processing…</span>
                      </>
                    ) : (
                      <span>Confirm Cancellation</span>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </Portal>
  );
};

export default CancellationModal;
