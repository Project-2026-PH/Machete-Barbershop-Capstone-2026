import db from '../db';
import { AppError } from '../utils/error/AppError';

export type CashierOfflinePrintOutcome = 'printed' | 'print_requested' | 'print_failed';

export interface RecordCashierOfflinePrintInput {
  queueEntryId: number;
  branchId: number;
  cashierId: string | null;
  idempotencyKey: string;
  attempt: number;
  outcome: CashierOfflinePrintOutcome;
  isReprint: boolean;
  errorMessage: string | null;
  clientOccurredAt: string;
}

const samePrintEvent = (row: any, input: RecordCashierOfflinePrintInput): boolean =>
  Number(row.queue_entry_id) === input.queueEntryId
  && Number(row.branch_id) === input.branchId
  && (row.cashier_id ? String(row.cashier_id).toLowerCase() : null) === input.cashierId
  && Number(row.attempt) === input.attempt
  && row.outcome === input.outcome
  && Boolean(row.is_reprint) === input.isReprint
  && (row.error_message || null) === input.errorMessage
  && new Date(row.client_occurred_at).getTime() === new Date(input.clientOccurredAt).getTime();

export class CashierOfflineReceiptPrintService {
  async record(input: RecordCashierOfflinePrintInput): Promise<any> {
    if (!Number.isSafeInteger(input.queueEntryId) || input.queueEntryId < 1
      || !Number.isSafeInteger(input.branchId) || input.branchId < 1) {
      throw new AppError('A valid queue entry and branch are required.', 400);
    }
    if (!input.idempotencyKey || input.idempotencyKey.length < 12 || input.idempotencyKey.length > 160) {
      throw new AppError('A valid print-history idempotency key is required.', 400);
    }
    if (!Number.isSafeInteger(input.attempt) || input.attempt < 1) {
      throw new AppError('A valid print attempt number is required.', 400);
    }
    if (!['printed', 'print_requested', 'print_failed'].includes(input.outcome)) {
      throw new AppError('A valid print outcome is required.', 400);
    }
    const clientOccurredAt = new Date(input.clientOccurredAt);
    if (Number.isNaN(clientOccurredAt.getTime())) throw new AppError('A valid print timestamp is required.', 400);

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const receiptResult = await client.query(
        `SELECT receipt_document_id, receipt_number
         FROM public.receipt_documents
         WHERE queue_entry_id = $1 AND branch_id = $2
         FOR UPDATE`,
        [input.queueEntryId, input.branchId],
      );
      const receipt = receiptResult.rows[0];
      if (!receipt) throw new AppError('The cloud receipt is not ready for print-history sync.', 409);

      const existingResult = await client.query(
        `SELECT * FROM public.cashier_receipt_print_history
         WHERE idempotency_key = $1`,
        [input.idempotencyKey],
      );
      const existing = existingResult.rows[0];
      if (existing) {
        if (Number(existing.receipt_document_id) !== Number(receipt.receipt_document_id)
          || !samePrintEvent(existing, { ...input, clientOccurredAt: clientOccurredAt.toISOString() })) {
          throw new AppError('This print-history key was already used for a different receipt event.', 409);
        }
        await client.query('COMMIT');
        return { ...existing, receipt_number: receipt.receipt_number };
      }

      const inserted = await client.query(
        `INSERT INTO public.cashier_receipt_print_history (
           receipt_document_id, queue_entry_id, branch_id, cashier_id, idempotency_key,
           attempt, outcome, is_reprint, error_message, client_occurred_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          receipt.receipt_document_id,
          input.queueEntryId,
          input.branchId,
          input.cashierId,
          input.idempotencyKey,
          input.attempt,
          input.outcome,
          input.isReprint,
          input.errorMessage,
          clientOccurredAt.toISOString(),
        ],
      );
      await client.query('COMMIT');
      return { ...inserted.rows[0], receipt_number: receipt.receipt_number };
    } catch (error: any) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (error?.code === '23505') {
        throw new AppError('This print attempt was already recorded with a different idempotency key.', 409);
      }
      throw error;
    } finally {
      client.release();
    }
  }
}

export const cashierOfflineReceiptPrintService = new CashierOfflineReceiptPrintService();
