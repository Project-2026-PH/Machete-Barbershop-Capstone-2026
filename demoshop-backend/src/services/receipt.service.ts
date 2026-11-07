import type { PoolClient } from 'pg';
import type { ReceiptDocument, ReceiptResponse } from '@demoshop/shared-types';
import { receiptPrintJobService } from './receipt-print-job.service';
import { receiptRepository } from '../repositories/receipt.repository';
import { invoiceProfileRepository, type BranchInvoiceProfile } from '../repositories/invoice-profile.repository';
import type { StoredReceiptDocument } from '../utils/receipt/receipt-types';
import { renderReceiptHtml } from '../utils/receipt/receipt-renderer.util';
import { demoshopInvoiceProfile } from '../utils/receipt/demoshop-invoice-profile.util';
import { emailService } from './email.service';
import { guestService } from './guest.service';
import { AppError } from '../utils/error/AppError';
import { createGuestVisitLookupCode, encryptGuestVisitLookupCode, hashGuestVisitLookupCode, decryptGuestVisitLookupCode } from '../utils/cashier/guest-visit-lookup.util';

interface FinalizedReceiptInput {
  queueEntryId: number;
  branchId: number;
  cashierName?: string | null;
  services: Array<{ service_id: number; title: string; price: number | string }>;
  customSpecification?: string | null;
  retailItems?: Array<{ productId: number; name: string; quantity: number; unitPrice: number }>;
  transactions: Array<{
    transaction_id: number;
    total_amount: number | string;
    payment_method: 'Cash' | 'GCash';
    gcash_ref_no?: string | null;
    cash_received_amount?: number | string | null;
    cash_change_amount?: number | string | null;
    created_at: string;
  }>;
  reservationFeeTransaction?: {
    transaction_id: number;
    total_amount: number | string;
    payment_method: 'Cash' | 'GCash';
  } | null;
}

interface RetailReceiptInput {
  transactionId: number;
  branchId: number;
  customerName: string;
  paymentMethod: 'Cash' | 'GCash';
  gcashRefNo?: string | null;
  issuedAt?: string | null;
  items: Array<{ productId: number; name: string; quantity: number; unitPrice: number }>;
}

const validEmail = (value: string | null): value is string =>
  Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()));

const lastFour = (value?: string | null): string | null => {
  const normalized = value?.trim();
  return normalized ? normalized.slice(-4) : null;
};

const toResponse = async (
  stored: StoredReceiptDocument,
  guestQrCode?: string | null,
  profileOverride?: BranchInvoiceProfile | null,
): Promise<ReceiptResponse> => {
  const { visitLookupCodeEncrypted, ...storedDocument } = stored.receipt_data;
  const invoiceProfileSnapshot = profileOverride !== undefined
    ? profileOverride
    : (await invoiceProfileRepository.findReceiptSnapshot(stored.receipt_document_id)
      || demoshopInvoiceProfile(storedDocument.branchId));
  const document: ReceiptDocument = {
    ...storedDocument,
    visitLookupCode: decryptGuestVisitLookupCode(visitLookupCodeEncrypted),
    receiptDocumentId: stored.receipt_document_id,
    emailStatus: stored.email_status,
    emailAvailable: Boolean(stored.recipient_email),
  };
  return {
    ...document,
    sellerInvoiceProfile: invoiceProfileSnapshot,
    html: renderReceiptHtml(document, guestQrCode, { profile: invoiceProfileSnapshot, authorizedInvoice: true }),
    invoiceHtml: renderReceiptHtml(document, guestQrCode, { profile: invoiceProfileSnapshot, authorizedInvoice: true, showFullTinOnScreen: true }),
    guestQrCode: guestQrCode || null,
  };
};

export class ReceiptService {
  async createForFinalizedPayment(client: PoolClient, input: FinalizedReceiptInput): Promise<ReceiptResponse> {
    const existing = await receiptRepository.findByQueueIdForUpdate(client, input.queueEntryId);
    if (existing) return toResponse(existing);
    const context = await receiptRepository.findContext(client, input.queueEntryId);
    if (!context) throw new AppError('Receipt queue entry was not found.', 404);
    const transactionIds = input.transactions.map(transaction => Number(transaction.transaction_id));
    const issuedAt = input.transactions
      .map(transaction => transaction.created_at)
      .sort()
      .at(-1) || new Date().toISOString();
    const paymentMethods = [...new Set(input.transactions.map(transaction => transaction.payment_method))];
    const cashTransaction = input.transactions.find(transaction =>
      transaction.payment_method === 'Cash' && transaction.cash_received_amount != null,
    );
    const invoiceProfile = await invoiceProfileRepository.findByBranchId(input.branchId, client);
    const gcashReferenceLast4 = lastFour(input.transactions.find(transaction => transaction.payment_method === 'GCash')?.gcash_ref_no);
    const receiptNumber = `MCH - ${String(transactionIds[0] || input.queueEntryId).padStart(4, '0')}`;

    // Not gated on context.isWalkIn: a walk-in reconciled from a reservation
    // (linked to a customer) can also carry a reservation-fee transaction now
    // that the fee is collected at final checkout instead of separately.
    let reservationFee: { amount: number; paymentMethod: 'Cash' | 'GCash'; transactionId?: number } | null = null;
    if (input.reservationFeeTransaction) {
      const feeRow = input.reservationFeeTransaction;
      const feeAmount = Number(feeRow.total_amount) || 0;
      reservationFee = {
        amount: feeAmount,
        paymentMethod: feeRow.payment_method as 'Cash' | 'GCash',
        transactionId: Number(feeRow.transaction_id),
      };
      if (feeRow.payment_method && !paymentMethods.includes(feeRow.payment_method)) {
        paymentMethods.push(feeRow.payment_method);
      }
    }

    const serviceTotal = input.services.reduce((sum, service) => sum + (Number(service.price) || 0), 0);
    const retailItems = input.retailItems || [];
    const retailLines: ReceiptDocument['lines'] = retailItems.map((item) => ({
      serviceId: null,
      serviceName: item.name,
      amount: Number(item.unitPrice) * Number(item.quantity),
      paymentMethod: paymentMethods[0] || 'Cash',
      productId: Number(item.productId),
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
    }));
    const retailTotal = retailLines.reduce((sum, line) => sum + line.amount, 0);
    const totalAmount = serviceTotal + retailTotal + (reservationFee?.amount || 0);

    let visitLookupCode: string | null = null;
    if (context.isWalkIn && context.guestProfileId) {
      const candidateCode = createGuestVisitLookupCode();
      const storedHash = await receiptRepository.setGuestVisitLookupCodeHash(client, input.queueEntryId, hashGuestVisitLookupCode(candidateCode));
      if (storedHash) visitLookupCode = candidateCode;
    }
    const receiptData: ReceiptDocument = {
      receiptDocumentId: 0,
      receiptNumber,
      queueEntryId: input.queueEntryId,
      branchId: input.branchId,
      documentVersion: 1,
      issuedAt,
      branch: { name: context.branchName, address: context.branchAddress },
      customerName: context.customerName,
      barberName: context.barberName,
      cashierName: input.cashierName?.trim() || null,
      guestReference: context.guestReference,
      visitLookupCodeEncrypted: visitLookupCode ? encryptGuestVisitLookupCode(visitLookupCode) : null,
      isWalkIn: context.isWalkIn,
      reservationFee,
      cashReceivedAmount: cashTransaction ? Number(cashTransaction.cash_received_amount) : null,
      cashChangeAmount: cashTransaction?.cash_change_amount != null ? Number(cashTransaction.cash_change_amount) : null,
      lines: [
        ...input.services.map(service => ({
          serviceId: Number(service.service_id),
          serviceName: service.title,
          amount: Number(service.price) || 0,
          paymentMethod: paymentMethods[0] || 'Cash',
          customSpecification: input.customSpecification || null,
        })),
        ...retailLines,
      ],
      totalAmount,
      paymentMethods,
      gcashReferenceLast4,
      emailStatus: 'not_applicable',
      emailAvailable: false,
    };
    const recipientEmail = !context.isWalkIn && context.customerEmailVerified && validEmail(context.customerEmail)
      ? context.customerEmail.trim().toLowerCase()
      : null;
    const stored = await receiptRepository.create(client, {
      branchId: input.branchId,
      queueEntryId: input.queueEntryId,
      receiptNumber,
      receiptData,
      recipientEmail,
    });
    if (invoiceProfile) await invoiceProfileRepository.saveReceiptSnapshot(client, stored.receipt_document_id, invoiceProfile);
    await receiptPrintJobService.enqueue(client, input.branchId, stored.receipt_document_id);
    return toResponse(stored, undefined, invoiceProfile);
  }

  /**
   * Builds the receipt for a retail-only POS sale.
   *
   * Retail sales never create a queue entry, so this cannot reuse
   * createForFinalizedPayment: there is no queue row to derive context from and
   * no barber to attribute. Context comes from the branch directly and the
   * document is scoped by transaction_id instead of queue_entry_id.
   */
  async createForRetailSale(client: PoolClient, input: RetailReceiptInput): Promise<ReceiptResponse> {
    const existing = await receiptRepository.findByTransactionId(input.transactionId, input.branchId);
    if (existing) return toResponse(existing);

    const branch = await receiptRepository.findBranch(client, input.branchId);
    if (!branch) throw new AppError('Receipt branch was not found.', 404);
    const invoiceProfile = await invoiceProfileRepository.findByBranchId(input.branchId, client);

    const receiptNumber = `MCH - ${String(input.transactionId).padStart(4, '0')}`;
    const lines: ReceiptDocument['lines'] = input.items.map(item => ({
      serviceId: null,
      serviceName: item.name,
      amount: Number(item.unitPrice) * Number(item.quantity),
      paymentMethod: input.paymentMethod,
      productId: Number(item.productId),
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
    }));

    const receiptData: ReceiptDocument = {
      receiptDocumentId: 0,
      receiptNumber,
      queueEntryId: null,
      transactionId: input.transactionId,
      isRetailOnly: true,
      branchId: input.branchId,
      documentVersion: 1,
      issuedAt: input.issuedAt || new Date().toISOString(),
      branch: { name: branch.branchName, address: branch.branchAddress },
      customerName: input.customerName,
      barberName: '',
      guestReference: null,
      isWalkIn: true,
      reservationFee: null,
      lines,
      totalAmount: lines.reduce((sum, line) => sum + line.amount, 0),
      paymentMethods: [input.paymentMethod],
      gcashReferenceLast4: lastFour(input.gcashRefNo),
      emailStatus: 'not_applicable',
      emailAvailable: false,
    };

    // Retail sales are anonymous walk-up purchases with no customer record,
    // so there is no verified address to email — print is the delivery channel.
    const stored = await receiptRepository.create(client, {
      branchId: input.branchId,
      transactionId: input.transactionId,
      receiptNumber,
      receiptData,
      recipientEmail: null,
    });
    if (invoiceProfile) await invoiceProfileRepository.saveReceiptSnapshot(client, stored.receipt_document_id, invoiceProfile);
    await receiptPrintJobService.enqueue(client, input.branchId, stored.receipt_document_id);
    return toResponse(stored, undefined, invoiceProfile);
  }

  async getByQueueId(queueEntryId: number, branchId?: number, includeGuestQr = false): Promise<ReceiptResponse | null> {
    const stored = await receiptRepository.findByQueueId(queueEntryId, branchId);
    if (!stored) return null;
    const response = await toResponse(stored);
    return includeGuestQr ? this.withGuestQr(response, branchId) : response;
  }

  async withGuestQr(receipt: ReceiptResponse, branchId?: number): Promise<ReceiptResponse> {
    // Guest QR is derived from the queue entry, so retail-only receipts
    // (queueEntryId === null) can never carry one.
    if (!receipt.guestReference || receipt.queueEntryId === null) return receipt;
    const scopedBranchId = branchId || receipt.branchId;
    const regenerated = await guestService.regenerateReceiptQrToken(scopedBranchId, receipt.queueEntryId);
    if (!regenerated) return receipt;
    return {
      ...receipt,
      guestQrCode: regenerated.qrCodeDataUrl,
      html: renderReceiptHtml(receipt, regenerated.qrCodeDataUrl, { profile: receipt.sellerInvoiceProfile, authorizedInvoice: true }),
      invoiceHtml: renderReceiptHtml(receipt, regenerated.qrCodeDataUrl, { profile: receipt.sellerInvoiceProfile, authorizedInvoice: true, showFullTinOnScreen: true }),
    };
  }

  async deliverEmail(receiptDocumentId: number): Promise<void> {
    const claimed = await receiptRepository.claimEmail(receiptDocumentId);
    if (!claimed) return;
    if (!claimed.recipient_email) {
      await receiptRepository.markEmailNotApplicable(receiptDocumentId);
      return;
    }

    const document = await toResponse(claimed);
    const sent = await emailService.sendReceiptEmail(
      claimed.recipient_email,
      document.receiptNumber,
      document.invoiceHtml || document.html,
    );
    if (sent) {
      await receiptRepository.markEmailSent(receiptDocumentId);
    } else {
      await receiptRepository.markEmailFailed(receiptDocumentId, 'Receipt email delivery failed.');
    }
  }

  async retryEmail(queueEntryId: number, branchId?: number): Promise<ReceiptResponse> {
    const receipt = await receiptRepository.findByQueueId(queueEntryId, branchId);
    if (!receipt) throw new AppError('Receipt was not found.', 404);
    await this.deliverEmail(receipt.receipt_document_id);
    const updated = await receiptRepository.findById(receipt.receipt_document_id, branchId);
    return toResponse(updated || receipt);
  }
}

export const receiptService = new ReceiptService();
