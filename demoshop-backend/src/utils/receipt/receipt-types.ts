import type { ReceiptDocument } from '@demoshop/shared-types';

export interface StoredReceiptDocument {
  receipt_document_id: number;
  branch_id: number;
  /** Null for retail-only sales, which are scoped by transaction_id instead. */
  queue_entry_id: number | null;
  transaction_id: number | null;
  receipt_number: string;
  document_version: number;
  receipt_data: ReceiptDocument;
  recipient_email: string | null;
  email_status: ReceiptEmailStatus;
  email_attempts: number;
  email_last_attempt_at: string | null;
  email_sent_at: string | null;
  email_last_error: string | null;
  created_at: string;
  updated_at: string;
}

export type ReceiptEmailStatus = 'not_applicable' | 'pending' | 'sending' | 'sent' | 'failed';

export interface ReceiptContext {
  branchName: string;
  branchAddress: string | null;
  customerName: string;
  customerEmail: string | null;
  customerEmailVerified: boolean;
  barberName: string;
  isWalkIn: boolean;
  guestReference: string | null;
  guestProfileId?: number | null;
}
