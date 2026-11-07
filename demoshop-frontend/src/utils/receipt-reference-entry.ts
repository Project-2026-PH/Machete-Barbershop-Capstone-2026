export type ReceiptEntryRole = 'cashier' | 'customer';

export interface ReceiptReferenceEntry {
  role: ReceiptEntryRole;
  receiptLike: boolean;
  amount: number | null;
  transactionDate: Date | null;
  recipientDetected: boolean;
  recipientMatches: boolean;
  reference: string | null;
  duplicate?: boolean;
}

export interface CustomerReceiptReviewEvidence {
  receiptUploaded: boolean;
  referenceEntered: boolean;
  referenceUnique: boolean;
}

export const shouldPrefillCustomerReceiptReference = (input: {
  candidate: string | null;
  currentReference: string;
  manuallyEdited: boolean;
}): boolean => Boolean(input.candidate?.trim()) && !input.manuallyEdited && !input.currentReference.trim();

/** Customer authenticity is reviewed by Admin; submission needs an image and a database-checked reference, not OCR evidence. */
export const canSubmitCustomerReceiptForAdminReview = (evidence: CustomerReceiptReviewEvidence): boolean =>
  evidence.receiptUploaded && evidence.referenceEntered && evidence.referenceUnique;

export const canSubmitCustomerReceiptsForAdminReview = (receipts: readonly CustomerReceiptReviewEvidence[]): boolean =>
  receipts.length > 0 && receipts.every(canSubmitCustomerReceiptForAdminReview);

export interface CashierGcashConfirmationEvidence {
  receiptUploaded: boolean;
  referenceEntered: boolean;
  referenceUnique: boolean;
  amountMatches: boolean;
  cashierConfirmed: boolean;
}

/** OCR does not decide cashier receipt validity; a human confirms its amount and unique reference. */
export const canConfirmCashierGcashPayment = (evidence: CashierGcashConfirmationEvidence): boolean =>
  evidence.receiptUploaded && evidence.referenceEntered && evidence.referenceUnique &&
  evidence.amountMatches && evidence.cashierConfirmed;

export const getManualReceiptReferenceStatus = (input: { duplicate: boolean; adminReviewOnly?: boolean }): 'rejected' | 'pending-review' | 'verified' =>
  input.duplicate ? 'rejected' : input.adminReviewOnly ? 'pending-review' : 'verified';

/** OCR fields are advisory. Both roles need a reference, and a duplicate always blocks it. */
export const classifyReceiptReferenceEntry = (entry: ReceiptReferenceEntry): 'ready' | 'needs-reference' | 'reject' => {
  if (entry.duplicate) return 'reject';
  return entry.reference?.trim() ? 'ready' : 'needs-reference';
};

