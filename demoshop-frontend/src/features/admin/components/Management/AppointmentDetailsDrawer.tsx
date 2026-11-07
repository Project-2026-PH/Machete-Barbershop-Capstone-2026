import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Calendar,
  Clock,
  User,
  Scissors,
  Phone,
  Mail,
  Receipt,
  Store,
  CheckCircle,
  AlertTriangle,
  Maximize2,
  Download,
  Loader2,
  ImageOff,
  ShieldCheck,
} from 'lucide-react';
import type { AppointmentRecord } from '@demoshop/shared-types';
import { recipientMatchesConfiguredAccount } from '@demoshop/shared-types';
import { Portal } from '@/components/common/Portal';
import { Modal } from '@/components/feedback/Modal';
import { CustomerReliabilityBadge } from './CustomerReliabilityBadge';
import { useShopSettings } from '@/hooks/useShopSettings';

export interface AppointmentDetailsDrawerProps {
  isOpen: boolean;
  appointment: AppointmentRecord | null;
  onClose: () => void;
  onRequestCancel?: (appointment: AppointmentRecord, status: 'CANCELLED' | 'NO_SHOW') => void;
  onConfirmPending?: (appointment: AppointmentRecord) => Promise<void> | void;
  onDeclinePending?: (appointment: AppointmentRecord, reason?: string) => Promise<void> | void;
}

const formatDate = (dateString?: string | null) => {
  if (!dateString) return '—';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Manila',
    });
  } catch {
    return dateString;
  }
};

export const AppointmentDetailsDrawer: React.FC<AppointmentDetailsDrawerProps> = ({
  isOpen,
  appointment,
  onClose,
  onConfirmPending,
  onDeclinePending,
}) => {
  const { settings: shopSettings } = useShopSettings();
  const [isConfirming, setIsConfirming] = useState(false);
  const [isDeclining, setIsDeclining] = useState(false);
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [declineReason, setDeclineReason] = useState('Deposit Not Received');
  const [customDeclineReason, setCustomDeclineReason] = useState('');
  const [maximizedPhotoUrl, setMaximizedPhotoUrl] = useState<string | null>(null);
  const [proofImageLoaded, setProofImageLoaded] = useState(false);
  const [proofImageError, setProofImageError] = useState(false);

  if (!appointment) return null;

  const isPending = appointment.status === 'PENDING';
  const isCancelledOrNoShow =
    appointment.status === 'CANCELLED' || appointment.status === 'NO_SHOW';

  const configuredGcash = shopSettings?.paymentMethods?.find((method) =>
    String(method.id || method.key || method.type).toLowerCase() === 'gcash'
  );
  const expectedRecipient =
    configuredGcash?.accountNumber ||
    configuredGcash?.accountName ||
    configuredGcash?.merchantName ||
    'Not configured';
  const detectedRecipient = appointment.recipient_identifier_detected;
  const hasMatch =
    !detectedRecipient || !configuredGcash?.accountNumber
      ? null
      : recipientMatchesConfiguredAccount(
          detectedRecipient,
          configuredGcash.accountNumber,
          configuredGcash.accountName || configuredGcash.merchantName
        );

  const handleConfirm = async () => {
    if (!onConfirmPending) return;
    setIsConfirming(true);
    try {
      await onConfirmPending(appointment);
    } finally {
      setIsConfirming(false);
    }
  };

  const handleConfirmDecline = async () => {
    if (!onDeclinePending) return;
    setIsDeclining(true);
    try {
      const finalReason =
        declineReason === 'Other'
          ? customDeclineReason.trim() || 'Declined by shop administrator'
          : customDeclineReason.trim()
          ? `${declineReason} - ${customDeclineReason.trim()}`
          : declineReason;
      await onDeclinePending(appointment, finalReason);
      setShowDeclineModal(false);
    } finally {
      setIsDeclining(false);
    }
  };

  return (
    <Portal>
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex justify-end overflow-hidden">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={onClose}
              className="fixed inset-0 bg-black/75 backdrop-blur-xs cursor-pointer print:hidden"
            />

            {/* Slide-over Drawer */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="relative w-full max-w-lg h-full bg-charcoal border-l border-white/10 shadow-2xl z-10 flex flex-col overflow-hidden text-ivory"
            >
              {/* Drawer Header */}
              <div className="p-5 border-b border-white/10 flex items-center justify-between bg-charcoal-light/60 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-sm bg-gold/15 border border-gold/30 flex items-center justify-center text-gold shrink-0">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-serif text-base font-bold tracking-wider text-ivory">
                      {appointment.customer_name}
                    </h3>
                    <p className="text-[11px] text-ivory-dim font-mono">
                      {appointment.scheduled_date} at {appointment.scheduled_time || '—'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  className="p-1 rounded-sm text-ivory-dim hover:text-ivory hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Drawer Content Body */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar text-xs">
                {/* Cancellation Card */}
                {isCancelledOrNoShow && (
                  <div className="rounded-sm border border-red-900/40 bg-red-950/25 p-3.5 shadow-sm">
                    <div className="flex items-center justify-between text-xs text-red-400 font-bold uppercase tracking-wider">
                      <span>Status: {appointment.status}</span>
                      <span className="font-mono text-[11px] text-red-400/90">
                        {formatDate(appointment.cancelled_at)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-zinc-200">
                      Reason:{' '}
                      <span className="text-zinc-100 font-medium">
                        {appointment.cancellation_reason || 'No reason specified'}
                      </span>
                    </p>
                    {appointment.other_notes && (
                      <p className="mt-1 text-xs text-zinc-400">Notes: {appointment.other_notes}</p>
                    )}
                    {appointment.cancelled_by_name && (
                      <p className="mt-1.5 text-[11px] text-zinc-500 font-mono">
                        Audited by staff: {appointment.cancelled_by_name}
                      </p>
                    )}
                  </div>
                )}

                {/* Pending Reservation Financial Authority Banner */}
                {isPending && (
                  <div className="rounded-sm border border-amber-500/30 bg-amber-500/[0.06] p-3.5 space-y-2">
                    <div className="flex items-center gap-2 text-amber-300 font-bold text-xs uppercase tracking-wider">
                      <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>Admin Financial Verification Required</span>
                    </div>
                    <p className="text-xs text-ivory-dim leading-relaxed">
                      Review customer payment details and proof of GCash deposit below. Once verified,
                      confirm this booking to schedule it for on-site cashier check-in.
                    </p>
                  </div>
                )}

                {/* GCash Verification Section (When receipt or reference exists, or when pending) */}
                {(isPending || appointment.proof_image_url || appointment.reference_number) && (
                  <div className="p-4 rounded-sm bg-charcoal-light border border-white/10 space-y-3.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Receipt className="w-4 h-4 text-gold" />
                        <p className="text-[10px] font-mono uppercase tracking-widest text-gold font-bold">
                          GCash Payment Verification
                        </p>
                      </div>
                      <span className="px-2 py-0.5 rounded-sm text-[10px] font-mono font-bold uppercase tracking-wider bg-gold/15 text-gold border border-gold/30">
                        ₱50.00 Deposit
                      </span>
                    </div>

                    {/* Recipient comparison tiles */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                      <div className="rounded-sm border border-white/10 bg-black/30 p-2.5">
                        <span className="text-[10px] uppercase font-bold text-ivory-dim tracking-wider block">
                          Expected Recipient
                        </span>
                        <span className="mt-1 block text-gold font-mono text-xs break-all font-semibold">
                          {expectedRecipient}
                        </span>
                      </div>
                      <div className="rounded-sm border border-white/10 bg-black/30 p-2.5">
                        <span className="text-[10px] uppercase font-bold text-ivory-dim tracking-wider block">
                          Detected Recipient
                        </span>
                        <span className="mt-1 block text-ivory font-mono text-xs break-all">
                          {detectedRecipient || 'Not detected'}
                        </span>
                      </div>
                      <div className="rounded-sm border border-white/10 bg-black/30 p-2.5">
                        <span className="text-[10px] uppercase font-bold text-ivory-dim tracking-wider block">
                          Recipient Match
                        </span>
                        <span
                          className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            hasMatch === true
                              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                              : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                          }`}
                        >
                          {hasMatch === true ? 'Matched' : 'Check Manually'}
                        </span>
                      </div>
                    </div>

                    {/* Reference numbers comparison */}
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-ivory-dim">
                          GCash Reference Number
                        </span>
                        {appointment.ocr_reference_number ? (
                          appointment.reference_number === appointment.ocr_reference_number ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                              <CheckCircle className="w-3 h-3 text-emerald-400" /> Match
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-red-300 bg-red-500/10 border border-red-500/30 px-2 py-0.5 rounded-full">
                              <AlertTriangle className="w-3 h-3 text-red-400" /> Mismatch
                            </span>
                          )
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-ivory-dim bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">
                            OCR: Manual / Unverified
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div
                          className={`p-2.5 rounded-sm border ${
                            appointment.ocr_reference_number &&
                            appointment.reference_number === appointment.ocr_reference_number
                              ? 'bg-emerald-500/[0.04] border-emerald-500/25'
                              : 'bg-black/30 border-white/10'
                          } space-y-0.5`}
                        >
                          <span className="text-[10px] uppercase font-bold text-ivory-dim tracking-wider block">
                            Customer Input
                          </span>
                          <div className="font-mono text-sm font-bold text-gold tracking-wide select-all">
                            {appointment.reference_number
                              ? `#${appointment.reference_number}`
                              : 'None provided'}
                          </div>
                        </div>

                        <div
                          className={`p-2.5 rounded-sm border ${
                            appointment.ocr_reference_number &&
                            appointment.reference_number === appointment.ocr_reference_number
                              ? 'bg-emerald-500/[0.04] border-emerald-500/25'
                              : appointment.ocr_reference_number &&
                                appointment.reference_number !== appointment.ocr_reference_number
                              ? 'bg-red-500/[0.04] border-red-500/25'
                              : 'bg-black/30 border-white/10'
                          } space-y-0.5`}
                        >
                          <span className="text-[10px] uppercase font-bold text-ivory-dim tracking-wider block">
                            OCR Scanned
                          </span>
                          <div
                            className={`font-mono text-sm font-bold tracking-wide select-all ${
                              appointment.ocr_reference_number
                                ? appointment.reference_number === appointment.ocr_reference_number
                                  ? 'text-emerald-300'
                                  : 'text-red-300'
                                : 'text-ivory-dim'
                            }`}
                          >
                            {appointment.ocr_reference_number
                              ? `#${appointment.ocr_reference_number}`
                              : 'Not detected'}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Receipt Screenshot Preview */}
                    {appointment.proof_image_url ? (
                      <div className="rounded-sm border border-white/10 bg-black/30 p-2.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-ivory-dim">
                            Uploaded Payment Proof
                          </span>
                          <button
                            type="button"
                            onClick={() => setMaximizedPhotoUrl(appointment.proof_image_url || null)}
                            className="text-[11px] font-bold text-gold hover:text-gold-dim flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <Maximize2 className="w-3.5 h-3.5" /> Maximize
                          </button>
                        </div>

                        {proofImageError ? (
                          <div className="flex flex-col items-center justify-center p-6 rounded-sm bg-black/40 border border-white/5 text-center space-y-2">
                            <ImageOff className="w-7 h-7 text-ivory-dim/40" />
                            <p className="text-xs text-ivory-dim font-medium">
                              Proof preview unavailable
                            </p>
                            <button
                              type="button"
                              onClick={() => setMaximizedPhotoUrl(appointment.proof_image_url || null)}
                              className="text-xs font-semibold text-gold hover:underline cursor-pointer inline-flex items-center gap-1"
                            >
                              <Maximize2 className="w-3 h-3" /> View / Maximize Proof
                            </button>
                          </div>
                        ) : (
                          <div
                            onClick={() => setMaximizedPhotoUrl(appointment.proof_image_url || null)}
                            className="relative cursor-pointer overflow-hidden rounded-sm group/proof bg-black/50 border border-white/5 flex items-center justify-center min-h-[140px] max-h-48"
                          >
                            {!proofImageLoaded && !proofImageError && (
                              <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-ivory-dim text-xs gap-2">
                                <Loader2 className="w-4 h-4 animate-spin text-gold" />
                                <span>Loading receipt…</span>
                              </div>
                            )}
                            <img
                              src={appointment.proof_image_url}
                              alt={`Payment proof for ${appointment.customer_name}`}
                              onLoad={() => setProofImageLoaded(true)}
                              onError={() => setProofImageError(true)}
                              className={`max-h-48 w-full object-contain rounded-sm transition-transform duration-200 group-hover/proof:scale-[1.02] ${
                                proofImageLoaded ? 'block' : 'opacity-0'
                              }`}
                            />
                            {proofImageLoaded && (
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/proof:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-gold text-xs font-bold pointer-events-none">
                                <Maximize2 className="w-4 h-4" /> Click to Maximize Photo
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-sm border border-white/10 bg-black/20 p-3 text-center text-xs text-ivory-dim">
                        No payment proof attachment uploaded for this booking.
                      </div>
                    )}
                  </div>
                )}

                {/* Client Profile Card */}
                <div className="p-4 rounded-sm bg-charcoal-light border border-white/5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-mono uppercase tracking-widest text-gold font-bold">
                        Client Profile & Reliability
                      </p>
                      <h4 className="text-sm font-semibold text-ivory mt-0.5">
                        {appointment.customer_name}
                      </h4>
                    </div>
                    <CustomerReliabilityBadge stats={appointment.reliability} compact />
                  </div>

                  {appointment.reliability && (
                    <div className="pt-1">
                      <CustomerReliabilityBadge stats={appointment.reliability} />
                    </div>
                  )}

                  <div className="pt-2 border-t border-white/5 space-y-1.5 text-xs text-ivory-dim">
                    {appointment.customer_phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-gold/70 shrink-0" />
                        <span className="font-mono text-ivory">{appointment.customer_phone}</span>
                      </div>
                    )}
                    {appointment.customer_email && (
                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-gold/70 shrink-0" />
                        <span className="text-ivory">{appointment.customer_email}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Service & Schedule Card */}
                <div className="p-4 rounded-sm bg-charcoal-light border border-white/5 space-y-3">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-gold font-bold">
                    Reservation Details
                  </p>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="space-y-0.5">
                      <span className="text-ivory-dim text-[11px] flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-gold/70" /> Date
                      </span>
                      <p className="font-semibold text-ivory">{appointment.scheduled_date || '—'}</p>
                    </div>

                    <div className="space-y-0.5">
                      <span className="text-ivory-dim text-[11px] flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-gold/70" /> Time Slot
                      </span>
                      <p className="font-semibold text-ivory">{appointment.scheduled_time || '—'}</p>
                    </div>

                    <div className="space-y-0.5">
                      <span className="text-ivory-dim text-[11px] flex items-center gap-1.5">
                        <Scissors className="w-3.5 h-3.5 text-gold/70" /> Service Requested
                      </span>
                      <p className="font-semibold text-ivory">
                        {appointment.service_title || 'Haircut & Styling'}
                      </p>
                    </div>

                    <div className="space-y-0.5">
                      <span className="text-ivory-dim text-[11px] flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-gold/70" /> Barber Assigned
                      </span>
                      <p className="font-semibold text-ivory">
                        {appointment.barber_name || 'Unassigned / Any'}
                      </p>
                    </div>
                  </div>

                  {appointment.service_price !== null && appointment.service_price !== undefined && (
                    <div className="pt-2 border-t border-white/5 space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-ivory-dim">Service Total</span>
                        <span className="font-mono text-ivory">
                          ₱{Number(appointment.service_price).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-ivory-dim">Deposit Paid / Credited</span>
                        <span className="font-mono text-emerald-400">− ₱50.00</span>
                      </div>
                      <div className="flex items-center justify-between text-xs pt-1 border-t border-white/5">
                        <span className="text-ivory font-semibold">Remaining Due at Shop</span>
                        <span className="font-serif font-bold text-gold text-sm">
                          ₱{Math.max(0, Number(appointment.service_price) - 50).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )}

                  {appointment.branch_name && (
                    <div className="flex items-center gap-1.5 text-ivory-dim text-[11px] pt-1">
                      <Store className="w-3.5 h-3.5 text-gold/70" />
                      <span>{appointment.branch_name}</span>
                    </div>
                  )}
                </div>

                {/* Status Indicator Card */}
                <div className="p-4 rounded-sm bg-charcoal-light border border-white/5 flex items-center justify-between">
                  <span className="text-ivory-dim">Lifecycle State</span>
                  <span
                    className={`px-2.5 py-0.5 rounded-sm text-[11px] font-semibold border ${
                      appointment.status === 'COMPLETED'
                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                        : appointment.status === 'CANCELLED'
                        ? 'bg-red-500/15 text-red-400 border-red-500/30'
                        : appointment.status === 'NO_SHOW'
                        ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                        : appointment.status === 'PENDING'
                        ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                        : 'bg-gold/15 text-gold border-gold/30'
                    }`}
                  >
                    {appointment.status}
                  </span>
                </div>
              </div>

              {/* Drawer Footer with Admin Actions for Pending Reservations */}
              {isPending && onConfirmPending && (
                <div className="p-4 border-t border-white/10 bg-charcoal-light/80 flex items-center justify-between gap-3 shrink-0">
                  <button
                    type="button"
                    disabled={isConfirming || isDeclining}
                    onClick={() => setShowDeclineModal(true)}
                    className="h-10 px-4 rounded-sm border border-red-500/30 bg-red-500/[0.04] text-red-300 hover:border-red-500/60 hover:bg-red-500/10 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    Decline
                  </button>

                  <button
                    type="button"
                    disabled={isConfirming || isDeclining}
                    onClick={handleConfirm}
                    className="flex-1 h-10 px-5 rounded-sm bg-gold text-charcoal hover:bg-gold-dim text-xs font-bold uppercase tracking-wider shadow-sm transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap flex items-center justify-center gap-2"
                  >
                    {isConfirming ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-charcoal" />
                        <span>Confirming…</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4 text-charcoal" />
                        <span>Accept & Confirm Deposit</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Maximized Payment Proof Modal */}
      {maximizedPhotoUrl && (
        <Modal
          isOpen={Boolean(maximizedPhotoUrl)}
          onClose={() => setMaximizedPhotoUrl(null)}
          title="Payment Proof Screenshot"
          size="xl"
          headerExtra={
            <button
              type="button"
              onClick={() => {
                if (!maximizedPhotoUrl) return;
                const link = document.createElement('a');
                link.href = maximizedPhotoUrl;
                link.download = `receipt-${appointment.reference_number || 'payment-proof'}.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }}
              className="h-8 inline-flex items-center gap-1.5 px-3 bg-gold hover:bg-gold-dim text-charcoal font-bold text-xs uppercase tracking-wider rounded-sm shadow-sm transition-all cursor-pointer mr-2 active:scale-95"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Save Photo</span>
            </button>
          }
          footer={
            <div className="flex items-center justify-between w-full">
              <span className="text-xs text-ivory-dim">
                Reference:{' '}
                <strong className="text-gold font-mono">
                  {appointment.reference_number ? `#${appointment.reference_number}` : 'None provided'}
                </strong>
              </span>
              <button
                type="button"
                className="h-9 px-4 rounded-sm border border-white/10 bg-white/5 text-ivory hover:bg-white/10 text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer whitespace-nowrap"
                onClick={() => setMaximizedPhotoUrl(null)}
              >
                Close
              </button>
            </div>
          }
        >
          <div className="flex items-center justify-center min-h-[50vh] max-h-[75vh] overflow-auto bg-black/80 rounded-sm border border-white/10 p-3">
            <img
              src={maximizedPhotoUrl}
              alt="Maximized payment receipt proof"
              className="max-h-[70vh] w-auto max-w-full object-contain rounded-sm"
            />
          </div>
        </Modal>
      )}

      {/* Decline Reservation Modal */}
      <Modal
        isOpen={showDeclineModal}
        onClose={() => !isDeclining && setShowDeclineModal(false)}
        title="Decline Reservation"
        size="md"
        bodyClassName="p-4 sm:p-5 space-y-4 max-h-[calc(85vh-8rem)] overflow-y-auto custom-scrollbar"
        footer={
          <div className="flex items-center justify-end gap-2.5 w-full">
            <button
              type="button"
              disabled={isDeclining}
              className="h-10 px-4 rounded-sm border border-white/10 bg-white/5 text-ivory hover:bg-white/10 text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer whitespace-nowrap text-center disabled:opacity-40"
              onClick={() => setShowDeclineModal(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isDeclining}
              className="h-10 px-5 rounded-sm border border-red-500/40 bg-red-500/[0.06] text-red-300 hover:border-red-500/70 hover:bg-red-500/15 text-xs font-bold uppercase tracking-wider shadow-sm transition-colors cursor-pointer whitespace-nowrap text-center disabled:opacity-40 flex items-center gap-1.5"
              onClick={handleConfirmDecline}
            >
              {isDeclining ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Declining…</span>
                </>
              ) : (
                <span>Decline Reservation</span>
              )}
            </button>
          </div>
        }
      >
        <div className="space-y-4 text-xs text-ivory">
          <div className="rounded-sm border border-white/10 bg-white/[0.02] p-3.5 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-ivory-dim block">
              Customer
            </span>
            <div className="text-base font-bold text-ivory">{appointment.customer_name}</div>
            <div className="text-xs text-ivory-dim">
              {appointment.service_title} • {appointment.scheduled_date} at {appointment.scheduled_time}
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-ivory-dim">
              Reason for Declining
            </label>
            <div className="grid grid-cols-1 gap-2">
              {[
                { id: 'Deposit Not Received', label: 'Deposit Not Received / Unverifiable Reference' },
                { id: 'Invalid Receipt Attached', label: 'Invalid Receipt / Fraudulent Evidence' },
                { id: 'Barber Unavailable', label: 'Barber Unavailable / Shop Fully Booked' },
                { id: 'Other', label: 'Other Reason' },
              ].map((option) => {
                const isSelected = declineReason === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setDeclineReason(option.id)}
                    className={`h-11 px-3.5 rounded-sm border text-left text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
                      isSelected
                        ? 'border-gold/60 bg-gold/[0.08] text-gold shadow-sm'
                        : 'border-white/10 bg-white/[0.03] text-ivory-dim hover:border-white/20 hover:bg-white/[0.06] hover:text-ivory'
                    }`}
                  >
                    <span>{option.label}</span>
                    {isSelected && <span className="text-gold font-bold text-xs">✓</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5 pt-1">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-ivory-dim">
              {declineReason === 'Other' ? 'Enter Reason' : 'Additional Notes (Optional)'}
            </label>
            <input
              type="text"
              value={customDeclineReason}
              onChange={(e) => setCustomDeclineReason(e.target.value)}
              placeholder={declineReason === 'Other' ? 'Please specify reason…' : 'Optional notes…'}
              className="h-10 w-full rounded-sm border border-white/15 bg-black/30 px-3 text-xs text-ivory placeholder-white/30 outline-none focus:border-gold transition-colors"
            />
          </div>
        </div>
      </Modal>
    </Portal>
  );
};

export default AppointmentDetailsDrawer;
