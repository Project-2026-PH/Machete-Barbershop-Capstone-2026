import { Request } from 'express';
import crypto from 'node:crypto';
import db from '../db';
import logger from '../utils/general/logger';
import { AppError } from '../utils/error/AppError';
import { config } from '../config/env';
import { recipientMatchesConfiguredAccount } from '@demoshop/shared-types';
import { getAdminClient } from '../config/supabase';
import { queueRepository } from '../repositories/queue.repository';
import { serviceRepository } from '../repositories/service.repository';
import { transactionRepository } from '../repositories/transaction.repository';
import { paymentAttemptRepository, PaymentAttemptRow } from '../repositories/payment-attempt.repository';
import { auditService } from './audit.service';
import { receiptService } from './receipt.service';
import { assertPaymentAttemptTransition, isOpenPaymentAttempt, PaymentAttemptStatus } from '../utils/cashier/payment-attempt-state.util';
import { ReceiptEvidence } from '../utils/cashier/receipt-evidence.util';
import { assertGcashReferenceAvailable, normalizeGcashReference } from '../utils/cashier/payment-reference-guard';
import { parseRetailItemSnapshots, sumRetailAmount } from '../utils/cashier/cashier-retail.util';
import { isReservationFeeEligible, RESERVATION_FEE_AMOUNT } from '../utils/cashier/reservation-fee.util';
import { adminRepository } from '../repositories/admin.repository';
import { invalidateCashierAggregates } from '../utils/cashier/cashier-cache.util';

interface CreatePaymentAttemptInput {
  queueId: number;
  branchId?: number;
  submittedBy: string | null;
  method: string;
  amount: number;
  cashReceivedAmount?: number;
  idempotencyKey: string;
  gcashReference?: string;
  merchantIdentity?: string;
  transactionDate?: string;
  receiptBuffer?: Buffer;
  receiptEvidence?: ReceiptEvidence;
  recipientIdentifierDetected?: string;
  cashierConfirmed?: boolean;
  req?: Request;
}

interface ReconcilePaymentAttemptInput {
  attemptId: number;
  branchId?: number;
  actorId: string | null;
  decision: 'confirm' | 'reject';
  reason?: string;
  req?: Request;
}

const moneyInCents = (value: number): number => Math.round(value * 100);

const amountDueForQueueEntry = (
  entry: { retail_items?: unknown },
  services: Array<{ price?: number | string }>,
  feeDue = 0,
): number => {
  const serviceTotal = services.reduce((sum, service) => sum + (Number(service.price) || 0), 0);
  const retailTotal = sumRetailAmount(parseRetailItemSnapshots(entry.retail_items));
  return Number((serviceTotal + retailTotal + feeDue).toFixed(2));
};

const assertBillablePaymentItems = (
  entry: { retail_items?: unknown },
  services: Array<unknown>,
): void => {
  if (services.length === 0 && sumRetailAmount(parseRetailItemSnapshots(entry.retail_items)) <= 0) {
    throw new AppError('This queue entry has no billable service or retail item linked to it.', 409, true, { code: 'MISSING_BILLABLE_ITEMS' });
  }
};

export const RECEIPT_STORAGE_PATH_REGEX = /^branches\/(\d+)\/payment-attempts\/([a-f0-9]{64})\/([a-f0-9]{64})\.(jpg|png)$/;

export const validateReceiptStoragePath = (path: string, expectedBranchId?: number): boolean => {
  if (!path || typeof path !== 'string') return false;
  const match = RECEIPT_STORAGE_PATH_REGEX.exec(path);
  if (!match) return false;
  if (expectedBranchId !== undefined && expectedBranchId !== null) {
    const pathBranchId = parseInt(match[1], 10);
    if (pathBranchId !== expectedBranchId) return false;
  }
  return true;
};

const elapsedMs = (startedAt: number): number => Math.max(0, Math.round(performance.now() - startedAt));

const logPaymentStage = (
  operation: 'create' | 'finalize',
  stage: string,
  startedAt: number,
  outcome: 'success' | 'error' = 'success',
): void => {
  logger.info('[PaymentAttemptService] stage timing', {
    operation,
    stage,
    outcome,
    duration_ms: elapsedMs(startedAt),
  });
};

const businessDate = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: config.gcash.businessTimeZone }).format(new Date());

const assertBusinessWindow = (): void => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: config.gcash.businessTimeZone,
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const hour = Number(parts.find(part => part.type === 'hour')?.value);
  if (hour < config.gcash.businessStartHour || hour >= config.gcash.businessEndHour) {
    throw new AppError('Payment is outside the configured GCash business-time window.', 409);
  }
};

export class PaymentAttemptService {
  async create(input: CreatePaymentAttemptInput): Promise<any> {
    const createStartedAt = performance.now();
    if (!input.idempotencyKey || input.idempotencyKey.length < 12 || input.idempotencyKey.length > 160) {
      throw new AppError('A valid payment idempotency key is required.', 400);
    }
    if (typeof input.method !== 'string' || !input.method.trim()) {
      throw new AppError('A valid payment method is required.', 400);
    }

    const idempotencyLookupStartedAt = performance.now();
    const existingAttempt = await paymentAttemptRepository.findByIdempotencyKey(input.idempotencyKey, input.branchId);
    logPaymentStage('create', 'idempotency_lookup', idempotencyLookupStartedAt);
    if (existingAttempt) {
      if (Number(existingAttempt.queue_entry_id) !== input.queueId) {
        throw new AppError('This payment idempotency key belongs to another queue entry.', 409);
      }
      if (existingAttempt.status === 'rejected') {
        throw new AppError('The previous payment attempt failed. Please retry the payment.', 409, true, { retryWithNewKey: true });
      }
      if (existingAttempt.payment_method === 'Cash' && isOpenPaymentAttempt(existingAttempt.status)) {
        return this.finalizeAttempt(existingAttempt.payment_attempt_id, input.branchId, input.submittedBy, 'cash-confirmed', input.req);
      }
      if (input.method.trim().toLowerCase() === 'gcash' && input.cashierConfirmed && isOpenPaymentAttempt(existingAttempt.status) && existingAttempt.receipt_storage_path) {
        return this.finalizeAttempt(existingAttempt.payment_attempt_id, input.branchId, input.submittedBy, 'cashier-confirmed-gcash', input.req);
      }
      return await this.formatSubmissionResult(existingAttempt);
    }

    const preflightStartedAt = performance.now();
    const entry = await queueRepository.findById(input.queueId);
    if (!entry) throw new AppError('Queue entry not found.', 404);
    if (input.branchId && entry.branch_id !== input.branchId) throw new AppError('Access denied for this branch.', 403);
    if (entry.status !== 'completed') throw new AppError('A service must be marked done before payment can be submitted.', 409);
    if (entry.payment_status === 'paid') throw new AppError('This queue entry has already been paid.', 409);

    const serviceIds = Array.isArray(entry.service_ids) && entry.service_ids.length > 0
      ? entry.service_ids.map(Number)
      : entry.service_id ? [Number(entry.service_id)] : [];
    const reservationFeeEligible = isReservationFeeEligible(entry);
    const branchId = input.branchId || entry.branch_id || 1;

    // These reads do not depend on each other after the queue entry is checked.
    // Run them concurrently so remote database latency is paid once, not four
    // times in series.
    const [latest, services, existingFee, settings] = await Promise.all([
      paymentAttemptRepository.findLatestByQueue(input.queueId, input.branchId),
      serviceIds.length ? serviceRepository.findByIds(serviceIds) : Promise.resolve([]),
      reservationFeeEligible
        ? transactionRepository.findReservationFeeByQueueId(input.queueId, input.branchId)
        : Promise.resolve(null),
      adminRepository.getShopSettings(branchId),
    ]);
    if (latest && isOpenPaymentAttempt(latest.status)) {
      throw new AppError('A payment receipt is already being processed.', 409, true, {
        paymentAttemptId: latest.payment_attempt_id,
        paymentAttemptStatus: latest.status,
      });
    }

    if (services.length !== serviceIds.length) throw new AppError('One or more queue services are unavailable.', 409);
    assertBillablePaymentItems(entry, services);

    const feeDue = !existingFee && reservationFeeEligible ? RESERVATION_FEE_AMOUNT : 0;
    const authoritativeAmount = amountDueForQueueEntry(entry, services, feeDue);
    if (!Number.isFinite(input.amount) || moneyInCents(input.amount) !== moneyInCents(authoritativeAmount)) {
      throw new AppError('Payment amount must exactly match the server-calculated amount due.', 409);
    }
    if (!input.method || typeof input.method !== 'string' || !input.method.trim()) {
      throw new AppError('A valid payment method is required.', 400);
    }

    const enabledMethods = (settings.paymentMethods || []).filter((pm: any) => pm.enabled);

    const methodMatch = enabledMethods.find((pm: any) =>
      pm.name.toLowerCase() === input.method.trim().toLowerCase() ||
      (pm.id && pm.id.toLowerCase() === input.method.trim().toLowerCase()) ||
      (pm.key && pm.key.toLowerCase() === input.method.trim().toLowerCase())
    );

    if (!methodMatch) {
      throw new AppError(`The payment method "${input.method}" is currently disabled or unavailable.`, 400);
    }

    const normalizedMethod = String(methodMatch.name || input.method).trim();
    const isCash = methodMatch.id?.toLowerCase() === 'cash'
      || methodMatch.type?.toLowerCase() === 'cash'
      || normalizedMethod.toLowerCase() === 'cash';
    const cashReceivedAmount = isCash ? Number(input.cashReceivedAmount ?? input.amount) : null;
    if (isCash && (cashReceivedAmount === null || !Number.isFinite(cashReceivedAmount)
      || moneyInCents(cashReceivedAmount) < moneyInCents(authoritativeAmount)
      || moneyInCents(cashReceivedAmount) > 100_000_000)) {
      throw new AppError('Cash received must be at least the amount due and within the supported limit.', 400);
    }
    const isGcash = methodMatch.id?.toLowerCase() === 'gcash'
      || methodMatch.type?.toLowerCase() === 'gcash'
      || normalizedMethod.toLowerCase() === 'gcash';
    const canonicalMethod = isGcash ? 'GCash' : isCash ? 'Cash' : normalizedMethod;
    let gcashReference = input.gcashReference?.trim() || null;

    if (!isCash) {
      const configuredRecipientNumber = methodMatch.accountNumber;
      const configuredRecipientName = methodMatch.accountName || methodMatch.merchantName;
      if (input.recipientIdentifierDetected && (configuredRecipientNumber || configuredRecipientName)
        && !recipientMatchesConfiguredAccount(input.recipientIdentifierDetected, configuredRecipientNumber, configuredRecipientName)) {
        throw new AppError("Invalid receipt: The recipient account on this receipt does not match the shop's official payment account.", 422);
      }
      if (isGcash) {
        if (input.receiptEvidence && !gcashReference) throw new AppError('Enter the full GCash reference number for this receipt.', 400);
        if (gcashReference) gcashReference = await assertGcashReferenceAvailable(gcashReference);
        if (input.merchantIdentity && input.merchantIdentity !== config.gcash.merchantName) {
          throw new AppError('Receipt merchant identity does not match this branch configuration.', 409);
        }
        if (input.transactionDate && input.transactionDate !== businessDate()) {
          throw new AppError('Receipt transaction date is outside the current business window.', 409);
        }
        assertBusinessWindow();
      } else {
        if (!input.gcashReference || input.gcashReference.trim().length < 4) {
          throw new AppError('A valid payment reference number is required.', 400);
        }
      }

      if (!input.cashierConfirmed) {
        throw new AppError('Cashier confirmation is required after reviewing the receipt.', 409);
      }
    }
    logPaymentStage('create', 'preflight_validation', preflightStartedAt);

    const attemptTransactionStartedAt = performance.now();
    const client = await db.pool.connect();
    let attempt: PaymentAttemptRow;
    let attemptTransactionOutcome: 'success' | 'error' = 'success';
    try {
      await client.query('BEGIN');
      const lockedEntry = (await client.query('SELECT * FROM queue_entries WHERE id = $1 FOR UPDATE', [input.queueId])).rows[0];
      if (!lockedEntry) throw new AppError('Queue entry not found.', 404);
      if (input.branchId && lockedEntry.branch_id !== input.branchId) throw new AppError('Access denied for this branch.', 403);
      if (lockedEntry.status !== 'completed') throw new AppError('A service must be marked done before payment can be submitted.', 409);
      if (lockedEntry.payment_status === 'paid') throw new AppError('This queue entry has already been paid.', 409);
      const openAttempt = await client.query(
        `SELECT payment_attempt_id, status FROM payment_attempts
         WHERE queue_entry_id = $1 AND status IN ('pending_verification', 'automated_review_passed', 'flagged')
         LIMIT 1`,
        [input.queueId],
      );
      if (openAttempt.rows[0]) {
        throw new AppError('A payment receipt is already being processed.', 409, true, {
          paymentAttemptId: openAttempt.rows[0].payment_attempt_id,
          paymentAttemptStatus: openAttempt.rows[0].status,
        });
      }

      attempt = await paymentAttemptRepository.create(client, {
        queueEntryId: input.queueId,
        branchId: lockedEntry.branch_id,
        customerId: lockedEntry.customer_id,
        submittedBy: input.submittedBy,
        method: canonicalMethod,
        amount: input.amount,
        cashReceivedAmount,
        authoritativeAmount,
        gcashReference,
        receiptSha256: input.receiptEvidence?.sha256,
        receiptWidth: input.receiptEvidence?.width,
        receiptHeight: input.receiptEvidence?.height,
        recipientIdentifierDetected: input.recipientIdentifierDetected,
        evidenceValidationStatus: !isCash ? (input.receiptEvidence ? 'pending_storage' : 'not_provided') : 'not_required',
        evidenceValidationMode: !isCash ? 'cashier-confirmation' : 'cash-confirmation',
        idempotencyKey: input.idempotencyKey,
      });
      await client.query('COMMIT');
    } catch (error: any) {
      attemptTransactionOutcome = 'error';
      await client.query('ROLLBACK');
      if (error?.code === '23505') {
        const duplicate = await paymentAttemptRepository.findByIdempotencyKey(input.idempotencyKey, input.branchId);
        if (duplicate) return await this.formatSubmissionResult(duplicate);
        const openAttempt = await paymentAttemptRepository.findLatestByQueue(input.queueId, input.branchId);
        if (openAttempt && isOpenPaymentAttempt(openAttempt.status)) {
          throw new AppError('A payment receipt is already being processed.', 409, true, {
            paymentAttemptId: openAttempt.payment_attempt_id,
            paymentAttemptStatus: openAttempt.status,
          });
        }
        throw new AppError('This GCash reference or receipt has already been submitted.', 409);
      }
      throw error;
    } finally {
      client.release();
      logPaymentStage('create', 'attempt_transaction', attemptTransactionStartedAt, attemptTransactionOutcome);
    }

    try {
      if (isCash) {
        const finalizeStartedAt = performance.now();
        const result = await this.finalizeAttempt(attempt!.payment_attempt_id, input.branchId, input.submittedBy, 'cash-confirmed', input.req);
        logPaymentStage('create', 'finalize', finalizeStartedAt);
        logPaymentStage('create', 'total', createStartedAt);
        return result;
      }

      const storageStartedAt = performance.now();
      if (!input.receiptBuffer || !input.receiptEvidence) {
        const finalizeStartedAt = performance.now();
        const result = await this.finalizeAttempt(attempt!.payment_attempt_id, input.branchId, input.submittedBy, 'cashier-confirmed-gcash-no-evidence', input.req);
        logPaymentStage('create', 'finalize', finalizeStartedAt);
        logPaymentStage('create', 'total', createStartedAt);
        return result;
      }
      const extension = input.receiptEvidence.contentType === 'image/png' ? 'png' : 'jpg';
      const pathKey = crypto.createHash('sha256').update(input.idempotencyKey).digest('hex');
      const receiptPath = `branches/${attempt!.branch_id}/payment-attempts/${pathKey}/${input.receiptEvidence.sha256}.${extension}`;
      const upload = await getAdminClient().storage.from('receipts').upload(receiptPath, input.receiptBuffer, {
        contentType: input.receiptEvidence.contentType,
        upsert: false,
      });
      if (upload.error) {
        await paymentAttemptRepository.markStorageFailed(attempt!.payment_attempt_id, 'Receipt storage failed.');
        throw new AppError('Receipt evidence could not be stored.', 502);
      }
      // Do not expose the path as reviewable until the object upload succeeded.
      await paymentAttemptRepository.setReceiptReady(attempt!.payment_attempt_id, receiptPath);
      logPaymentStage('create', 'receipt_storage', storageStartedAt);

      // The cashier has reviewed and explicitly confirmed the receipt in the
      // payment modal. OCR remains data-capture assistance only; it is not used
      // as an approval signal.
      const finalizeStartedAt = performance.now();
      const result = await this.finalizeAttempt(attempt!.payment_attempt_id, input.branchId, input.submittedBy, 'cashier-confirmed-gcash', input.req);
      logPaymentStage('create', 'finalize', finalizeStartedAt);
      logPaymentStage('create', 'total', createStartedAt);
      return result;
    } catch (finalizeError: any) {
      logPaymentStage('create', 'total', createStartedAt, 'error');
      if (attempt?.payment_attempt_id) {
        await paymentAttemptRepository.markStorageFailed(attempt.payment_attempt_id, finalizeError?.message || 'Payment finalization failed.').catch(() => {});
      }
      throw finalizeError;
    }
  }

  async reconcile(input: ReconcilePaymentAttemptInput): Promise<any> {
    const attempt = await paymentAttemptRepository.findById(input.attemptId, input.branchId);
    if (!attempt) throw new AppError('Payment attempt not found.', 404);
    if (!isOpenPaymentAttempt(attempt.status)) throw new AppError(`Payment attempt is already ${attempt.status}.`, 409);

    if (input.decision === 'reject') {
      const client = await db.pool.connect();
      let lockedAttempt!: PaymentAttemptRow;
      try {
        await client.query('BEGIN');
        const result = await client.query(
          'SELECT * FROM payment_attempts WHERE payment_attempt_id = $1 FOR UPDATE',
          [input.attemptId],
        );
        const candidate = result.rows[0] as PaymentAttemptRow | undefined;
        if (!candidate) throw new AppError('Payment attempt not found.', 404);
        lockedAttempt = candidate;
        if (input.branchId && lockedAttempt.branch_id !== input.branchId) throw new AppError('Access denied for this branch.', 403);
        assertPaymentAttemptTransition(lockedAttempt.status, 'rejected');
        await client.query(
          `UPDATE payment_attempts
           SET status = 'rejected', manual_review_reason = $2, manually_reviewed_by = $3,
               manually_reviewed_at = NOW(), updated_at = NOW()
           WHERE payment_attempt_id = $1`,
          [input.attemptId, input.reason?.trim() || 'Rejected during cashier review', input.actorId],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      await this.audit(input, lockedAttempt!, 'payment_attempt_rejected');
      const rejectedAttempt = await paymentAttemptRepository.findById(input.attemptId, input.branchId);
      return {
        attempt: rejectedAttempt ? this.toPublicAttempt(rejectedAttempt) : null,
        pendingVerification: false,
        decision: 'reject',
      };
    }

    return this.finalizeAttempt(input.attemptId, input.branchId, input.actorId, input.reason || 'cashier-confirmed-gcash', input.req);
  }

  /**
   * Finalizes one verified payment atomically with its transaction, receipt, and estimated recipe consumption.
   * Returns the public payment attempt, paid queue entry, transaction records, receipt, and pending-verification state.
   */
  private async finalizeAttempt(attemptId: number, branchId: number | undefined, actorId: string | null, reason: string, req?: Request): Promise<any> {
    const finalizeStartedAt = performance.now();
    const poolStartedAt = performance.now();
    const client = await db.pool.connect();
    logPaymentStage('finalize', 'pool_acquire', poolStartedAt);
    const transactionStartedAt = performance.now();
    let committed = false;
    let released = false;
    try {
      await client.query('BEGIN');
      const attemptResult = await client.query('SELECT * FROM payment_attempts WHERE payment_attempt_id = $1 FOR UPDATE', [attemptId]);
      const attempt = attemptResult.rows[0] as PaymentAttemptRow | undefined;
      if (!attempt) throw new AppError('Payment attempt not found.', 404);
      if (branchId && attempt.branch_id !== branchId) throw new AppError('Access denied for this branch.', 403);
      if (attempt.status === 'manually_confirmed') {
        await client.query('COMMIT');
        committed = true;
        client.release();
        released = true;
        logPaymentStage('finalize', 'database_transaction', transactionStartedAt);
        const result = await this.formatSubmissionResult(attempt);
        logPaymentStage('finalize', 'total', finalizeStartedAt);
        return result;
      }
      if (attempt.payment_method === 'GCash' &&
        (attempt.evidence_validation_status === 'pending_storage' || attempt.evidence_validation_status === 'storage_failed')) {
        throw new AppError('Receipt evidence is not ready for cashier confirmation.', 409);
      }
      assertPaymentAttemptTransition(attempt.status, 'manually_confirmed');

      const lockedEntry = (await client.query('SELECT * FROM queue_entries WHERE id = $1 FOR UPDATE', [attempt.queue_entry_id])).rows[0];
      if (!lockedEntry) throw new AppError('Queue entry not found.', 404);
      if (branchId && lockedEntry.branch_id !== branchId) throw new AppError('Access denied for this branch.', 403);
      if (lockedEntry.status !== 'completed') throw new AppError('Only completed services can be finalized as paid.', 409);
      if (lockedEntry.payment_status === 'paid') throw new AppError('This queue entry has already been paid.', 409);

      let serviceIds: number[];
      if (Array.isArray(lockedEntry.service_ids) && lockedEntry.service_ids.length > 0) {
        serviceIds = lockedEntry.service_ids.map(Number);
      } else {
        const qes = await client.query(
          'SELECT service_id FROM queue_entry_services WHERE queue_entry_id = $1 ORDER BY service_id',
          [attempt.queue_entry_id],
        );
        serviceIds = qes.rows.length > 0
          ? qes.rows.map((row: any) => Number(row.service_id))
          : lockedEntry.service_id ? [Number(lockedEntry.service_id)] : [];
      }
      const servicesPromise = serviceIds.length ? serviceRepository.findByIds(serviceIds) : Promise.resolve([]);
      const existingFeePromise = isReservationFeeEligible(lockedEntry)
        ? transactionRepository.findReservationFeeByQueueId(attempt.queue_entry_id, branchId)
        : Promise.resolve(null);
      const [services, existingFee] = await Promise.all([servicesPromise, existingFeePromise]);
      if (services.length !== serviceIds.length) throw new AppError('One or more queue services are unavailable.', 409);
      assertBillablePaymentItems(lockedEntry, services);
      const feeDue = !existingFee && isReservationFeeEligible(lockedEntry) ? RESERVATION_FEE_AMOUNT : 0;
      const calculated = amountDueForQueueEntry(lockedEntry, services, feeDue);
      if (moneyInCents(Number(attempt.authoritative_amount)) !== moneyInCents(calculated) || moneyInCents(Number(attempt.amount)) !== moneyInCents(calculated)) {
        throw new AppError('The payment attempt amount no longer matches the server price.', 409);
      }

      const transactionWriteStartedAt = performance.now();
      const transactions = await transactionRepository.createForQueueEntry(client, {
        queueEntryId: attempt.queue_entry_id,
        paymentAttemptId: attempt.payment_attempt_id,
        branchId: lockedEntry.branch_id,
        barberId: lockedEntry.barber_id,
        customerId: lockedEntry.customer_id,
        serviceLines: services.map((service: any) => ({
          serviceId: Number(service.service_id),
          price: Number(service.price) || 0,
          customSpecification: lockedEntry.custom_specification?.trim()
            ? String(lockedEntry.custom_specification).trim().slice(0, 100)
            : null,
        })),
        paymentMethod: attempt.payment_method,
        paymentLines: services.map((service: any) => ({
          serviceId: Number(service.service_id),
          method: attempt.payment_method,
          gcashReference: attempt.gcash_ref_no,
        })),
        cashReceivedAmount: attempt.payment_method === 'Cash' && attempt.cash_received_amount != null
          ? Number(attempt.cash_received_amount)
          : null,
        cashChangeAmount: attempt.payment_method === 'Cash' && attempt.cash_received_amount != null
          ? Math.max(0, moneyInCents(Number(attempt.cash_received_amount)) - moneyInCents(Number(attempt.amount))) / 100
          : null,
        idempotencyKey: `payment-attempt-${attempt.payment_attempt_id}`,
      });
      logPaymentStage('finalize', 'transaction_write', transactionWriteStartedAt);
      const consumptionTransactionId = Number(transactions[0]?.transaction_id);
      if (transactions.length !== 1 || !Number.isSafeInteger(consumptionTransactionId) || consumptionTransactionId < 1) {
        throw new AppError('Payment finalization requires exactly one transaction record.', 500);
      }

      let reservationFeeTransaction: {
        transaction_id: number;
        total_amount: number | string;
        payment_method: 'Cash' | 'GCash';
      } | null = existingFee || null;
      if (feeDue > 0) {
        // Reservation fee is now collected together with the service payment
        // at final checkout instead of via the removed "Collect Fee" action.
        reservationFeeTransaction = await transactionRepository.createReservationFee(client, {
          queueEntryId: attempt.queue_entry_id,
          branchId: lockedEntry.branch_id,
          barberId: lockedEntry.barber_id || null,
          customerId: lockedEntry.customer_id || null,
          amount: RESERVATION_FEE_AMOUNT,
          paymentMethod: attempt.payment_method,
          gcashRefNo: attempt.payment_method === 'GCash' ? attempt.gcash_ref_no : null,
          idempotencyKey: `reservation-fee-payment-attempt-${attempt.payment_attempt_id}`,
        });
      }

      const receiptStartedAt = performance.now();
      const cashier = req?.user as { username?: string | null; first_name?: string | null; last_name?: string | null } | undefined;
      const cashierName = [cashier?.first_name, cashier?.last_name].filter(Boolean).join(' ').trim()
        || cashier?.username?.trim()
        || null;
      const receipt = await receiptService.createForFinalizedPayment(client, {
        queueEntryId: attempt.queue_entry_id,
        branchId: lockedEntry.branch_id,
        cashierName,
        services,
        retailItems: parseRetailItemSnapshots(lockedEntry.retail_items),
        customSpecification: lockedEntry.custom_specification?.trim()
          ? String(lockedEntry.custom_specification).trim().slice(0, 100)
          : null,
        transactions,
        reservationFeeTransaction,
      });
      logPaymentStage('finalize', 'receipt_write', receiptStartedAt);
      const retailTotal = sumRetailAmount(parseRetailItemSnapshots(lockedEntry.retail_items));
      if (retailTotal > 0) {
        await transactionRepository.attachRetailToTransaction(client, {
          transactionId: consumptionTransactionId,
          queueEntryId: Number(attempt.queue_entry_id),
          retailTotal,
        });
      }

      const attemptUpdate = await client.query(
        `UPDATE payment_attempts
         SET status = 'manually_confirmed', manual_review_reason = $2,
             manually_reviewed_by = $3, manually_reviewed_at = NOW(), updated_at = NOW()
         WHERE payment_attempt_id = $1
         RETURNING *`,
        [attemptId, reason.slice(0, 500), actorId],
      );
      const queueUpdate = await client.query(
        `UPDATE queue_entries SET payment_status = 'paid' WHERE id = $1 RETURNING *`,
        [attempt.queue_entry_id],
      );
      await client.query('COMMIT');
      committed = true;
      // Guest QR and email/audit work use their own database calls. Return this
      // connection first so those calls cannot queue behind an idle checkout.
      client.release();
      released = true;
      logPaymentStage('finalize', 'database_transaction', transactionStartedAt);
      const effectiveBranchId = lockedEntry.branch_id ?? attempt.branch_id ?? branchId;
      const postCommitTasks: Promise<unknown>[] = [];
      if (effectiveBranchId) postCommitTasks.push(invalidateCashierAggregates(effectiveBranchId));
      postCommitTasks.push(this.audit({ attemptId, actorId, req }, attempt, 'payment_attempt_confirmed'));
      void Promise.all(postCommitTasks).catch((error: unknown) => {
        logger.warn('[Payment] Post-commit maintenance failed', {
          error: error instanceof Error ? error.message : 'unknown_error',
          paymentAttemptId: attemptId,
        });
      });
      let receiptWithGuestQr = receipt;
      if (receipt.guestReference) {
        try {
          receiptWithGuestQr = await receiptService.withGuestQr(receipt, attempt.branch_id);
        } catch (error: unknown) {
          logger.warn('[Receipt] Guest QR regeneration failed after payment finalization.', {
            error: error instanceof Error ? error.message : 'unknown_error',
          });
        }
      }
      void receiptService.deliverEmail(receipt.receiptDocumentId).catch((error: unknown) => {
        // Delivery state remains retryable in receipt_documents; do not fail a paid transaction.
        logger.warn('[Receipt] E-receipt delivery failed after payment finalization.', { error: error instanceof Error ? error.message : 'unknown_error' });
      });
      const finalizedAttempt = attemptUpdate.rows[0] ?? null;
      logPaymentStage('finalize', 'total', finalizeStartedAt);
      return { attempt: finalizedAttempt ? this.toPublicAttempt(finalizedAttempt) : null, queueEntry: queueUpdate.rows[0], transactions, receipt: receiptWithGuestQr, pendingVerification: false };
    } catch (error) {
      if (!committed) await client.query('ROLLBACK');
      logPaymentStage('finalize', 'database_transaction', transactionStartedAt, 'error');
      logPaymentStage('finalize', 'total', finalizeStartedAt, 'error');
      throw error;
    } finally {
      if (!released) client.release();
    }
  }

  async uploadReceiptEvidence(input: {
    attemptId: number;
    branchId?: number;
    actorId: string | null;
    receiptBuffer: Buffer;
    receiptEvidence: ReceiptEvidence;
    gcashReference?: string;
    req?: Request;
  }): Promise<Record<string, unknown>> {
    const attempt = await paymentAttemptRepository.findById(input.attemptId, input.branchId);
    if (!attempt) throw new AppError('Payment attempt not found.', 404);
    if (input.branchId !== undefined && Number(attempt.branch_id) !== Number(input.branchId)) {
      throw new AppError('Payment attempt not found.', 404);
    }
    if (attempt.payment_method !== 'GCash') throw new AppError('Receipt evidence upload is only available for GCash payments.', 400);
    if (attempt.status !== 'manually_confirmed') throw new AppError('Receipt evidence can only be uploaded after payment finalization.', 409);
    if (attempt.receipt_storage_path) throw new AppError('Receipt evidence has already been uploaded.', 409);

    const requestedReference = input.gcashReference?.trim() || attempt.gcash_ref_no || null;
    if (!requestedReference) throw new AppError('Enter the full GCash reference number for this receipt.', 400);
    const normalizedReference = attempt.gcash_ref_no && normalizeGcashReference(requestedReference) === normalizeGcashReference(attempt.gcash_ref_no)
      ? normalizeGcashReference(attempt.gcash_ref_no)
      : await assertGcashReferenceAvailable(requestedReference);

    const extension = input.receiptEvidence.contentType === 'image/png' ? 'png' : 'jpg';
    const key = crypto.createHash('sha256').update(attempt.idempotency_key).digest('hex');
    const receiptPath = `branches/${attempt.branch_id}/payment-attempts/${key}/${input.receiptEvidence.sha256}.${extension}`;
    if (!validateReceiptStoragePath(receiptPath, attempt.branch_id)) throw new AppError('Receipt evidence path is invalid.', 500);
    const upload = await getAdminClient().storage.from('receipts').upload(receiptPath, input.receiptBuffer, {
      contentType: input.receiptEvidence.contentType,
      upsert: false,
    });
    if (upload.error) throw new AppError('Receipt evidence could not be stored.', 502);
    await paymentAttemptRepository.setReceiptReady(input.attemptId, receiptPath, input.receiptEvidence, normalizedReference);
    const updated = await paymentAttemptRepository.findById(input.attemptId, input.branchId);
    if (!updated) throw new AppError('Payment attempt not found.', 404);
    await this.audit({ attemptId: input.attemptId, actorId: input.actorId, req: input.req }, updated, 'payment_attempt_receipt_uploaded');
    return this.toPublicAttempt(updated);
  }

  async list(branchId?: number, status?: PaymentAttemptStatus, openOnly: boolean = false): Promise<any[]> {
    const attempts = await paymentAttemptRepository.list(branchId, status, openOnly);
    return attempts.map((attempt) => this.toPublicAttempt(attempt));
  }

  async getReceiptUrl(attemptId: number, branchId?: number): Promise<{ url: string; expiresInSeconds: number }> {
    const attempt = await paymentAttemptRepository.findById(attemptId, branchId);
    if (!attempt?.receipt_storage_path) throw new AppError('Receipt evidence is unavailable.', 404);
    if (branchId !== undefined && branchId !== null && Number(attempt.branch_id) !== Number(branchId)) {
      throw new AppError('Receipt evidence is unavailable.', 404);
    }
    if (!validateReceiptStoragePath(attempt.receipt_storage_path, attempt.branch_id)) {
      throw new AppError('Receipt evidence is unavailable.', 404);
    }
    const signed = await getAdminClient().storage.from('receipts').createSignedUrl(attempt.receipt_storage_path, 60);
    if (signed.error || !signed.data?.signedUrl) throw new AppError('Receipt review link could not be created.', 502);
    return { url: signed.data.signedUrl, expiresInSeconds: 60 };
  }

  private async audit(input: { attemptId: number; actorId: string | null; req?: Request }, attempt: PaymentAttemptRow, action: string): Promise<void> {
    await auditService.logSecurityEvent({
      userId: input.actorId,
      action,
      resource: 'payment_attempt',
      details: { attempt_id: input.attemptId, queue_id: attempt.queue_entry_id, status: attempt.status, review_mode: attempt.evidence_validation_mode || 'manual' },
      req: input.req,
    });
  }

  private toPublicAttempt(attempt: PaymentAttemptRow): Record<string, unknown> {
    const { receipt_storage_path: receiptStoragePath, receipt_sha256: receiptSha256, ...safeAttempt } = attempt;
    return {
      ...safeAttempt,
      receiptAvailable: Boolean(receiptStoragePath),
      // Hashes and storage paths remain server-side review metadata.
      receiptSha256: undefined,
    };
  }

  private async formatSubmissionResult(attempt: PaymentAttemptRow): Promise<any> {
    const receipt = attempt.status === 'manually_confirmed'
      ? await receiptService.getByQueueId(attempt.queue_entry_id, attempt.branch_id, true)
      : null;
    return {
      attempt: this.toPublicAttempt(attempt),
      pendingVerification: isOpenPaymentAttempt(attempt.status),
      receipt,
    };
  }
}

export const paymentAttemptService = new PaymentAttemptService();
