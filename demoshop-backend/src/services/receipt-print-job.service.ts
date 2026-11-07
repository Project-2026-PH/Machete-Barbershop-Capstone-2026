import { AppError } from '../utils/error/AppError';
import { receiptPrintJobRepository } from '../repositories/receipt-print-job.repository';
import { invoiceProfileRepository } from '../repositories/invoice-profile.repository';
import { renderReceiptHtml } from '../utils/receipt/receipt-renderer.util';
import { demoshopInvoiceProfile } from '../utils/receipt/demoshop-invoice-profile.util';
import type { ReceiptResponse } from '@demoshop/shared-types';
import type { PoolClient } from 'pg';
import { decryptGuestVisitLookupCode } from '../utils/cashier/guest-visit-lookup.util';

const stationIdPattern = /^[a-zA-Z0-9._:-]{3,100}$/;

const stationId = (value: unknown): string => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!stationIdPattern.test(normalized)) throw new AppError('A valid printer station ID is required.', 400);
  return normalized;
};

export class ReceiptPrintJobService {
  async enqueue(client: PoolClient, branchId: number, receiptDocumentId: number): Promise<void> {
    await receiptPrintJobRepository.enqueue(client, branchId, receiptDocumentId);
  }

  async claim(branchId: number, requestedStationId: unknown) {
    const job = await receiptPrintJobRepository.claim(branchId, stationId(requestedStationId));
    if (!job) return null;
    const stored = job.receipt;
    const { visitLookupCodeEncrypted, ...receiptData } = stored.receipt_data;
    const invoiceProfileSnapshot = await invoiceProfileRepository.findReceiptSnapshot(stored.receipt_document_id)
      || demoshopInvoiceProfile(Number(receiptData.branchId));
    const receiptDocument = { ...receiptData, visitLookupCode: decryptGuestVisitLookupCode(visitLookupCodeEncrypted) };
    const receipt: ReceiptResponse = {
      ...receiptDocument,
      receiptDocumentId: stored.receipt_document_id,
      emailStatus: stored.email_status,
      emailAvailable: Boolean(stored.recipient_email),
      sellerInvoiceProfile: invoiceProfileSnapshot,
      html: renderReceiptHtml(receiptDocument, undefined, { profile: invoiceProfileSnapshot, authorizedInvoice: true }),
      invoiceHtml: renderReceiptHtml(receiptDocument, undefined, { profile: invoiceProfileSnapshot, authorizedInvoice: true, showFullTinOnScreen: true }),
      guestQrCode: null,
    };
    return { jobId: Number(job.print_job_id), attempts: job.attempts, receipt, leaseExpiresAt: job.lease_expires_at };
  }

  async complete(branchId: number, jobId: number, requestedStationId: unknown): Promise<void> {
    if (!await receiptPrintJobRepository.markPrinted(jobId, branchId, stationId(requestedStationId))) {
      throw new AppError('Print job is no longer owned by this printer station.', 409);
    }
  }

  async fail(branchId: number, jobId: number, requestedStationId: unknown, error: unknown): Promise<void> {
    const message = typeof error === 'string' && error.trim() ? error.trim() : 'The printer station failed to print the receipt.';
    if (!await receiptPrintJobRepository.markFailed(jobId, branchId, stationId(requestedStationId), message)) {
      throw new AppError('Print job is no longer owned by this printer station.', 409);
    }
  }

  async retry(branchId: number, jobId: number): Promise<void> {
    if (!await receiptPrintJobRepository.retry(jobId, branchId)) {
      throw new AppError('Only failed print jobs can be retried.', 409);
    }
  }
}

export const receiptPrintJobService = new ReceiptPrintJobService();
