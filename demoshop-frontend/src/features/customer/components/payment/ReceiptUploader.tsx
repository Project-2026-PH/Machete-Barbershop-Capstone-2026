import React, { useRef, memo } from 'react';
import { Upload, CheckCircle2, AlertCircle, Loader2, Trash2, Plus, Image as ImageIcon } from 'lucide-react';
import type { ReceiptValidationResult } from '@demoshop/shared-types';

interface ReceiptUploaderProps {
  receiptFiles: File[];
  receiptValidationResults: ReceiptValidationResult[];
  depositRequired: number;
  totalVerifiedAmount: number;
  isProcessingOcr: boolean;
  onAttachFile: (file: File) => void;
  onRemoveReceipt: (index: number) => void;
  receiptReferences: string[];
  onReferenceChange: (index: number, reference: string) => void;
}

export const ReceiptUploader: React.FC<ReceiptUploaderProps> = memo(({
  receiptFiles,
  receiptValidationResults,
  depositRequired,
  totalVerifiedAmount,
  isProcessingOcr,
  onAttachFile,
  onRemoveReceipt,
  receiptReferences,
  onReferenceChange,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const canAddMore = receiptFiles.length < 3 && totalVerifiedAmount < depositRequired;
  const hasPendingAdminReview = receiptValidationResults.some(result => result.status === 'pending-review');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onAttachFile(file);
    }
    if (e.target) {
      e.target.value = '';
    }
  };

  return (
    <div className="bg-charcoal-light/90 border border-white/10 rounded-lg p-4 sm:p-5 space-y-4 shadow-md">
      <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
        <div className="text-xs font-bold uppercase tracking-wider text-ivory flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-gold/20 text-gold text-[10px] flex items-center justify-center font-mono">
            2
          </span>
          Upload Payment Receipt
        </div>
        <span className="text-[11px] font-mono text-ivory-dim">
          {hasPendingAdminReview
            ? 'Admin review pending'
            : totalVerifiedAmount >= depositRequired
            ? '✓ Deposit Covered'
            : `₱${totalVerifiedAmount.toFixed(2)} of ₱${depositRequired.toFixed(2)}`}
        </span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
        id="receipt-file-input"
      />

      {/* Upload Action Button */}
      {receiptFiles.length === 0 ? (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isProcessingOcr}
          className="w-full min-h-[52px] border-2 border-dashed border-gold/40 hover:border-gold bg-gold/[0.03] hover:bg-gold/[0.08] rounded-md p-4 flex flex-col items-center justify-center gap-2 text-center transition-all cursor-pointer group"
        >
          <div className="w-10 h-10 rounded-full bg-gold/15 flex items-center justify-center text-gold group-hover:scale-105 transition-transform">
            <Upload className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs font-bold text-ivory group-hover:text-gold transition-colors block">
              Add a receipt photo, screenshot, or saved image
            </span>
            <span className="text-[10px] text-ivory-dim block mt-0.5">
              We’ll try to prefill the reference number. Review it or enter the full number below; Admin will verify the receipt.
            </span>
          </div>
        </button>
      ) : (
        <div className="space-y-3">
          {/* List of uploaded receipts */}
          <div className="space-y-2" aria-live="polite">
            {receiptFiles.map((file, idx) => {
              const res = receiptValidationResults[idx];
              const isChecking = !res || res.status === 'checking';
              const isVerified = res?.status === 'verified';
              const needsReference = res?.status === 'needs-reference';
              const isPendingReview = res?.status === 'pending-review';
              const isRejected = res?.status === 'rejected';

              return (
                <div
                  key={`${file.name}-${idx}`}
                  className={`p-3 rounded-md border text-xs transition-all ${isChecking
                    ? 'bg-white/[0.02] border-white/10 text-ivory-dim'
                    : isVerified
                      ? 'bg-emerald-500/[0.06] border-emerald-500/30 text-emerald-200'
                      : needsReference || isPendingReview ? 'bg-gold/[0.06] border-gold/30 text-ivory' : 'bg-red-500/[0.06] border-red-500/30 text-red-200'
                    }`}
                >
                  <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
                    <div className="shrink-0">
                      {isChecking ? (
                        <Loader2 className="w-4 h-4 animate-spin text-gold" />
                      ) : isVerified ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : needsReference || isPendingReview ? (
                        <ImageIcon className="w-4 h-4 text-gold" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-red-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-ivory">
                        {file.name}
                      </div>
                      <div className="text-[11px] whitespace-normal break-words mt-0.5">
                        {isChecking && <span className="text-ivory-dim">{res?.referenceEligible ? 'Checking reference number…' : 'Checking receipt…'}</span>}
                        {isVerified && (
                          <span className="text-emerald-400 font-medium whitespace-normal break-all">
                            ✓ Details matched · ₱{(res.amount || 0).toFixed(2)} (Ref: {res.reference || 'OK'}). Admin will review the payment proof.
                          </span>
                        )}
                        {needsReference && (
                          <span className="text-gold">
                            {res.adminReviewOnly
                              ? 'Reference auto-fill is a convenience. Enter or correct the full number if needed; Admin will review the uploaded receipt.'
                              : 'Enter the full reference number to continue; Admin will review the uploaded receipt.'}
                          </span>
                        )}
                        {isPendingReview && <span className="text-gold font-medium">Submitted for Admin review. Payment is not confirmed until approved.</span>}
                        {isRejected && (
                          <span className="text-red-400 font-medium">
                            {res.message || 'Verification failed. Upload clear receipt.'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Remove Action */}
                  <button
                    type="button"
                    onClick={() => onRemoveReceipt(idx)}
                    className="min-w-[36px] min-h-[36px] flex items-center justify-center p-2 rounded hover:bg-white/10 text-ivory-dim hover:text-red-400 transition-colors cursor-pointer shrink-0"
                    title="Remove receipt"
                    aria-label="Remove receipt"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  </div>
                  <label className="mt-2 block w-full text-[11px] text-ivory-dim">
                    Full payment reference number
                    <input
                      type="text"
                      inputMode="text"
                      autoComplete="off"
                      autoCapitalize="characters"
                      value={receiptReferences[idx] || ''}
                      onChange={event => onReferenceChange(idx, event.target.value)}
                      onBlur={() => { if (res?.referenceEligible && receiptReferences[idx]) onReferenceChange(idx, receiptReferences[idx]); }}
                      aria-label={`Full payment reference number for receipt ${idx + 1}`}
                      placeholder="Enter or correct the full reference number"
                      className="mt-1 min-h-11 w-full touch-manipulation rounded border border-white/20 bg-charcoal px-3 py-2 text-base text-ivory focus:border-gold focus:outline-none sm:text-sm"
                    />
                  </label>
                </div>
              );
            })}
          </div>

          {/* Add more receipts option if permitted */}
          {canAddMore && (
            <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-white/5">
              <span className="text-[11px] text-ivory-dim">
                Paid in parts? Up to 3 receipts are accepted.
              </span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessingOcr}
                className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded border border-gold/40 text-xs font-bold text-gold hover:bg-gold/10 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Another Receipt ({receiptFiles.length}/3)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

ReceiptUploader.displayName = 'ReceiptUploader';
