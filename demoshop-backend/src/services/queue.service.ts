import { createHash } from 'crypto';
import { queueRepository } from '../repositories/queue.repository';
import { barberRepository } from '../repositories/barber.repository';
import { adminRepository } from '../repositories/admin.repository';
import logger from "../utils/general/logger";
import { WalkInData, validateServiceCombo, AvailabilityResponse, BatchAvailabilityResponse, BatchBarberAvailability, BarberEtaCandidate, SectResolution } from '@demoshop/shared-types';
import {
  generateTimeSlotAvailability,
  getValidWorkingHours,
  formatQueueToAppointments,
  formatBusyPeriods,
  timeToMinutes,
  isDateTodayInManila,
  getManilaNow,
} from '../utils/queue/availability.util';
import { calculateTotalWaitTime } from '../utils/queue/wait-time.util';
import { resolveSectAssignment, isBarberEligibleForSect, isBarberOnBreak } from '../utils/queue/sect.util';
import { getCache, setCache } from '../redis';
import {acquireBarberLock, releaseBarberLock} from '../utils/queue/queue-lock.util';
import {
  determineInitialStatus,
  shouldDebounceSync,
  resetSyncDebounce,
  resetQueueMaintenanceDebounce,
} from '../utils/queue/queue-logic.util';
import {ensureNotActiveInQueue, ensureQueueEntryFound} from '../utils/queue/queue-guard.util';
import {prepareJoinPayload, cacheQueueCancellation} from '../utils/queue/queue-worker.util';
import {serviceRepository} from "../repositories/service.repository";
import { reservationTimeToEpoch, getArrivalDeadlineEpoch } from '../utils/queue/reservation-time.util';
import { AppError } from '../utils/error/AppError';
import { notificationService } from './notification.service';
import { realtimeBroadcastService } from './realtime-broadcast.service';
import { auditService } from './audit.service';
import { emailService } from './email.service';
import { BarberBookingEmailPayload } from '../utils/email/email-templates.util';
import { paymentAttemptRepository } from '../repositories/payment-attempt.repository';
import { transactionRepository } from '../repositories/transaction.repository';
import { getAdminClient } from '../config/supabase';
import { guestService } from './guest.service';
import { config } from '../config/env';
import { inventoryRepository } from '../repositories/inventory.repository';
import { parseRetailItemSnapshots, normalizeRetailSaleLines, sumRetailAmount } from '../utils/cashier/cashier-retail.util';
import { QueuePolicy, AuthoritativeUserContext, QueueEntryAuthorizationTarget } from '../security/policies/queue.policy';
import { UserRole } from '@demoshop/shared-types';
import { staffScheduleService } from './staff-schedule.service';
import { validateReceiptStoragePath } from './payment-attempt.service';
import { barberService } from './barber.service';
import { recipientMatchesConfiguredAccount, matchesBankRecipient } from '@demoshop/shared-types';
import { isReservationFeeEligible, RESERVATION_FEE_AMOUNT } from '../utils/cashier/reservation-fee.util';

/** Customer booking images go to Admin review; their reference number remains the replay guard. */
export const shouldEnforceReceiptImageHashUniqueness = (allowDuplicateReceiptImage = false): boolean =>
  !allowDuplicateReceiptImage;
import {
  calculateScheduleEstimates,
  SCHEDULE_DELAY_THRESHOLD_MINUTES,
  shouldNotifyScheduleDelay,
} from '../utils/queue/schedule-delay.util';
import { availabilityService } from './availability.service';

interface ReservationImpactPreview {
  previewFingerprint: string;
  projectedCompletionAt: string | null;
  impacts: Array<{
    queueEntryId: number;
    customerName: string;
    scheduledStartAt: string;
    estimatedStartAt: string;
    delayMinutes: number;
    addedDelayMinutes: number;
  }>;
}

interface OrderImpactAnalysis {
  preview: ReservationImpactPreview;
  existingDurationMinutes: number;
  scheduleUpdates: Array<{
    reservation: any;
    estimatedStartAt: string;
    delayMinutes: number;
    addedDelayMinutes: number;
  }>;
}

const normalizeImpactTimestamp = (value: string | Date): string =>
  (value instanceof Date ? value : new Date(value)).toISOString();

const ceilToMinute = (epoch: number): number => Math.ceil(epoch / 60_000) * 60_000;

const minutesForQueueEntry = (entry: any): number => Math.max(1, Number(entry?.duration_minutes) || 30);

const CUSTOMER_CANCELLATION_NOTICE_MS = 24 * 60 * 60 * 1000;
const RESERVATION_EARLY_CHECK_IN_WINDOW_MS = 10 * 60 * 1000;

export const assertReceiptRecipientMatches = (input: {
  detected?: string;
  method?: any;
}): void => {
  if (!input.detected || !input.method) return;
  const configuredNumber = input.method.accountNumber;
  const configuredName = input.method.accountName || input.method.merchantName;
  if (!configuredNumber && !configuredName) return;

  const isBank = (input.method.category === 'bank') ||
    String(input.method.id || input.method.key || input.method.type || '').toLowerCase().includes('bank') ||
    ['maribank', 'gotyme'].includes(String(input.method.id || input.method.key || '').toLowerCase());

  const matches = isBank
    ? matchesBankRecipient(input.detected, configuredNumber, configuredName) || recipientMatchesConfiguredAccount(input.detected, configuredNumber, configuredName)
    : recipientMatchesConfiguredAccount(input.detected, configuredNumber, configuredName);

  if (!matches) {
    throw new AppError(
      "Invalid receipt: The recipient account on this receipt does not match the shop's official payment account.",
      422,
      true,
      { recipientIdentifierDetected: input.detected },
    );
  }
};

export const assertReceiptEvidenceValid = (input: {
  amount?: number;
  ocrConfidence?: number;
  transactionDate?: string;
  requiredAmount: number;
}): void => {
  if (input.ocrConfidence !== undefined && input.ocrConfidence < 60) {
    throw new AppError('Invalid receipt screenshot: OCR confidence is too low to verify the payment.', 422);
  }
  if (input.amount !== undefined && input.amount < input.requiredAmount) {
    throw new AppError(
      `Reservation fee is incomplete. Required ₱${input.requiredAmount.toFixed(2)}, detected ₱${input.amount.toFixed(2)}.`,
      422,
    );
  }
  if (input.transactionDate) {
    const transactionTime = new Date(input.transactionDate).getTime();
    const ageMs = Date.now() - transactionTime;
    if (!Number.isFinite(transactionTime) || ageMs < -5 * 60 * 1000 || ageMs > 24 * 60 * 60 * 1000) {
      throw new AppError('This payment receipt is older than 24 hours or has an invalid transaction date.', 422);
    }
  }
};

export const isBarberOffDutyOnDate = (
  schedule: {
    offDutyDates: string[];
    dateDetails?: Record<string, {
      isOff?: boolean;
      isOnDuty?: boolean;
      isOnlineBookingEnabled?: boolean;
      reason?: string;
    }>;
  },
  date: string
): boolean => {
  const detail = schedule.dateDetails?.[date];
  if (detail?.isOnDuty === true) return false;
  if (detail?.isOnDuty === false) return true;
  if (detail?.reason === 'Online Booking Disabled') return false;
  return schedule.offDutyDates.includes(date);
};

const ensureBarberLockAcquired = (
  lockResult: boolean,
  conflictMessage: string,
): void => {
  if (!lockResult) {
    throw new AppError(conflictMessage, 409, true, { errorType: 'RaceCondition' });
  }
};

/**
 * Asynchronously dispatches a transactional email to the customer on Cashier reservation decision.
 * Fully isolated with try/catch so SMTP latency or errors never disrupt or roll back queue operations.
 */
async function dispatchReservationDecisionEmailSafely(
  queueId: number,
  decision: 'CONFIRMED' | 'DECLINED' | 'CANCELLED' | 'RECEIVED',
  options?: { cashierName?: string; declineReason?: string | null }
): Promise<void> {
  try {
    const details = await queueRepository.findReservationEmailDetails(queueId);
    if (!details) {
      logger.warn('[dispatchReservationDecisionEmail] Reservation details not found for email notification', { queueId });
      return;
    }

    if (!details.customerEmail) {
      logger.info('[dispatchReservationDecisionEmail] Customer has no email address. Skipping email notification.', { queueId });
      return;
    }

    if (!details.emailNotificationsEnabled) {
      logger.info('[dispatchReservationDecisionEmail] Customer opted out of email notifications.', {
        queueId,
        customerId: details.customerId,
      });
      return;
    }

    const payload = {
      decision,
      customerName: details.customerName,
      preferredDate: details.preferredDate,
      preferredTime: details.preferredTime,
      barberName: details.barberName,
      branchName: details.branchName,
      branchAddress: details.branchAddress || undefined,
      services: details.services,
      totalAmount: details.totalAmount,
      guestCount: details.guestCount,
      reservationFee: details.reservationFee ?? 50,
      depositPaid: details.depositPaid ?? 50,
      remainingBalance: details.remainingBalance,
      cashierName: options?.cashierName || 'Front Desk',
      actionTimestamp: new Date(),
      declineReason: options?.declineReason || details.cancelReason,
    };

    const sent = await emailService.sendReservationDecisionEmail(details.customerEmail, payload);
    if (sent) {
      logger.info(`[dispatchReservationDecisionEmail] Successfully sent ${decision} email to ${details.customerEmail}`, { queueId });
    } else {
      logger.warn(`[dispatchReservationDecisionEmail] Failed transmission of ${decision} email to ${details.customerEmail}`, { queueId });
    }
  } catch (error: any) {
    logger.error(`[dispatchReservationDecisionEmail] Error dispatching ${decision} email for queue ${queueId}:`, error?.message || error);
  }
}

/**
 * Asynchronously sends an email alert to the assigned barber when a customer books them.
 * Fully isolated with try/catch and Redis deduplication to prevent duplicate transmissions
 * and never disrupt or roll back queue operations.
 */
export async function dispatchBarberBookingEmailSafely(queueId: number): Promise<void> {
  try {
    const details = await queueRepository.findReservationEmailDetails(queueId);
    if (!details) {
      logger.warn('[dispatchBarberBookingEmail] Reservation details not found for barber notification', { queueId });
      return;
    }

    if (!details.barberId || !details.barberEmail) {
      logger.info('[dispatchBarberBookingEmail] Barber has no email address or is unassigned. Skipping notification.', {
        queueId,
        barberId: details.barberId,
      });
      return;
    }

    if (!details.barberEmailNotificationsEnabled) {
      logger.info('[dispatchBarberBookingEmail] Barber opted out of email notifications.', {
        queueId,
        barberId: details.barberId,
      });
      return;
    }

    const dedupKey = `email:barber_booking:${queueId}:${details.barberId}`;
    const alreadySent = await getCache<any>(dedupKey);
    if (alreadySent) {
      logger.info(`[dispatchBarberBookingEmail] Barber booking email already sent for queue ${queueId}, barber ${details.barberId}. Skipping duplicate.`, {
        queueId,
        barberId: details.barberId,
      });
      return;
    }

    // Strictly omit any customer contact details (phone, email, payment card/proof)
    const payload: BarberBookingEmailPayload = {
      barberName: details.barberName,
      customerName: details.customerName,
      preferredDate: details.preferredDate,
      preferredTime: details.preferredTime,
      branchName: details.branchName,
      services: (details.services || []).map((s) => ({ title: s.title })),
      guestCount: details.guestCount,
    };

    const result = await emailService.sendBarberBookingNotification(details.barberEmail, payload);
    if (result.sent) {
      await setCache(dedupKey, { sentAt: new Date().toISOString() }, 7 * 24 * 3600);
      logger.info(`[dispatchBarberBookingEmail] Successfully dispatched barber booking email to ${details.barberEmail}`, {
        queueId,
        barberId: details.barberId,
      });
    } else {
      logger.warn(`[dispatchBarberBookingEmail] Failed dispatching barber booking email to ${details.barberEmail}`, {
        queueId,
        barberId: details.barberId,
      });
    }
  } catch (error: any) {
    logger.error(`[dispatchBarberBookingEmail] Error dispatching barber email for queue ${queueId}:`, error?.message || error);
  }
}

const formatScheduleTimestamp = (value: string): string => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

const formatManilaDateFromTimestamp = (value: string): string => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(date);
};

const addOneCalendarDay = (isoDate: string): string => {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (![year, month, day].every(Number.isInteger)) return '';
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
};

const resolveReservationServiceIds = (entry: any): number[] => {
  const rawIds = Array.isArray(entry?.service_ids)
    ? entry.service_ids
    : (typeof entry?.service_ids === 'string' ? entry.service_ids.split(',') : []);
  const ids: number[] = rawIds
    .map((id: unknown) => Number(id))
    .filter((id: number) => Number.isSafeInteger(id) && id > 0);
  if (ids.length > 0) return Array.from(new Set<number>(ids));
  return entry?.service_id ? [Number(entry.service_id)] : [];
};

async function dispatchScheduleDelayEmailSafely(input: {
  queueEntryId: number;
  customerEmail: string | null;
  emailNotificationsEnabled: boolean;
  customerName: string;
  barberName: string;
  branchName: string;
  scheduledStartAt: string;
  estimatedStartAt: string;
  delayMinutes: number;
}): Promise<void> {
  try {
    if (!input.customerEmail || !input.emailNotificationsEnabled) return;

    const sent = await emailService.sendScheduleDelayEmail(input.customerEmail, {
      customerName: input.customerName,
      barberName: input.barberName,
      branchName: input.branchName,
      originalStartAt: formatScheduleTimestamp(input.scheduledStartAt),
      estimatedStartAt: formatScheduleTimestamp(input.estimatedStartAt),
      delayMinutes: input.delayMinutes,
      portalUrl: process.env.FRONTEND_ORIGIN || undefined,
    });

    if (!sent) {
      logger.warn('[ScheduleDelay] Email delivery was not completed', { queueEntryId: input.queueEntryId });
    }
  } catch (error: any) {
    logger.error('[ScheduleDelay] Email dispatch failed', {
      queueEntryId: input.queueEntryId,
      error: error?.message || error,
    });
  }
}

/**
 * Service for Queue business logic and coordination.
 * Follows the Coordinator Pattern: orchestrates Redis locks, pessimistic DB transactions, 
 * and side effects (like timer expiry) while delegating technical details to utility workers.
 * Includes comprehensive JDoc documentation for all major operations.
 */
export class QueueService {
  private async dispatchPendingReservationNotification(entry: any): Promise<void> {
    const queueEntryId = Number(entry?.id);
    if (!Number.isInteger(queueEntryId) || queueEntryId <= 0) return;

    const currentEntry = await queueRepository.findById(queueEntryId);
    if (!currentEntry || String(currentEntry.status).toLowerCase() !== 'pending') {
      logger.info('[QueueService] Skipping stale pending reservation notification', {
        queueId: queueEntryId,
        status: currentEntry?.status ?? null,
      });
      return;
    }

    await notificationService.notifyReservationPending(currentEntry);
  }

  private async authorizeBarberLane(
    barberId: number,
    userContext: AuthoritativeUserContext,
  ): Promise<number> {
    const targetBranchId = await queueRepository.findBarberBranchId(barberId);
    if (targetBranchId === null) {
      throw new AppError('Barber lane not found.', 404);
    }

    if (userContext.role === UserRole.CUSTOMER) {
      if (userContext.customerId === null || userContext.customerId === undefined) {
        throw new AppError('Customer profile not found.', 403);
      }

      const activeEntry = await queueRepository.findActiveByCustomer(userContext.customerId);
      const ownEntries = activeEntry ? [activeEntry, ...(
        activeEntry.group_booking_id && Array.isArray(activeEntry.group_entries) ? activeEntry.group_entries : []
      )] : [];
      const hasActiveGuestInLane = ownEntries.some(entry =>
        Number(entry.customer_id) === Number(userContext.customerId)
        && Number(entry.barber_id) === Number(barberId)
        && Number(entry.branch_id) === Number(targetBranchId)
        && ['pending', 'accepted', 'late', 'waiting', 'serving'].includes(String(entry.status)),
      );
      if (!hasActiveGuestInLane) {
        throw new AppError('Access denied for this barber lane.', 403);
      }
      return targetBranchId;
    }

    if (!QueuePolicy.authorizeBarberQueue(userContext, barberId, targetBranchId)) {
      throw new AppError('Access denied for this barber lane.', 403);
    }

    return targetBranchId;
  }

  private assertMutationAccess(
    userContext: AuthoritativeUserContext,
    entry: QueueEntryAuthorizationTarget,
    mutation: 'cancel' | 'complete' | 'check-in' | 'no-show' | 'edit-order',
  ): void {
    if (!QueuePolicy.authorizeMutation(userContext, entry, mutation)) {
      throw new AppError('Access denied for this queue entry.', 403);
    }
  }

  private assertLegacyBranchAccess(entry: Record<string, any>, branchId?: number): void {
    if (branchId === undefined || branchId === null || entry.branch_id === null || entry.branch_id === undefined
      || Number(entry.branch_id) !== Number(branchId)) {
      throw new AppError('Access denied for this branch.', 403);
    }
  }

  /**
   * Orchestrates joining a barber's queue for a customer.
   * Handles multi-level concurrency: Redis traffic control + DB row locking.
   * 
   * @param data - The join request data (customer, barber, branch, service).
   * @returns The newly created queue entry object.
   * @throws Error if the queue is locked or the customer is already queued.
   */
  async joinQueue(data: {
    customerId: number;
    barberId: number;
    branchId: number;
    serviceIds: number[];
    preferredDate?: string;
    preferredTime?: string;
    initialStatus?: 'pending' | 'accepted';
    referenceNumber?: string;
    proofImageUrl?: string;
    paymentMethod?: string;
    paymentMethodId?: string;
    imageHash?: string;
    /** Set only by customer booking routes; keep the hash for review, but do not reject on image reuse. */
    allowDuplicateReceiptImage?: boolean;
    ocrReferenceNumber?: string;
    recipientIdentifierDetected?: string;
    receiptAmountDetected?: number;
    receiptOcrConfidence?: number;
    receiptTransactionDate?: string;
    imageHashes?: string[];
    proofImageUrls?: string[];
    agreedToTerms?: boolean;
    bypassPaymentProof?: boolean;
    isTest?: boolean;
    diagnosticIdempotencyKey?: string;
    paymentProvider?: string;
  }): Promise<any> {
    const startedAt = performance.now();
    if (data.diagnosticIdempotencyKey) {
      const priorEntry = await queueRepository.findReservationByIdempotencyKey(data.diagnosticIdempotencyKey);
      if (priorEntry) {
        if (Number(priorEntry.customer_id) !== Number(data.customerId)) {
          throw new AppError('This reservation request key has already been used.', 409);
        }
        logger.info('[Queue] Reservation request deduplicated', {
          event: 'reservation_request_deduplicated',
          queueId: priorEntry.id,
          duration_ms: Math.round(performance.now() - startedAt),
        });
        return priorEntry;
      }
    }

    const barberIsAvailable = await queueRepository.isActiveBarberAtBranch(data.barberId, data.branchId);
    if (!barberIsAvailable) {
      throw new AppError('The selected barber is not available at this branch.', 400);
    }

    // The diagnostics UI already resolves a live slot before submission. Avoid
    // repeating the public schedule query for synthetic reservations, while
    // retaining the transactional slot-conflict check below.
    if (data.preferredDate && !data.isTest) {
      try {
        const schedule = await staffScheduleService.getBarberSchedulePublic(
          data.barberId,
          data.preferredDate,
          data.preferredDate
        );
        const detail = schedule.dateDetails?.[data.preferredDate];
        const isOffDuty = isBarberOffDutyOnDate(schedule, data.preferredDate);
        const isOnlineDisabled = detail?.isOnlineBookingEnabled === false || detail?.reason === 'Online Booking Disabled';

        if (isOffDuty || isOnlineDisabled) {
          const reason = detail?.reason;
          const message = isOnlineDisabled
            ? 'This barber is not accepting online bookings on this date.'
            : (reason ? `The selected barber is unavailable on this date (${reason}).` : 'The selected barber is off duty on this date.');
          throw new AppError(message, 400);
        }
      } catch (err: any) {
        if (err instanceof AppError && (err.status === 400 || (err as any).statusCode === 400)) {
          throw err;
        }
        logger.warn(`[QueueService] Could not check public barber schedule for date ${data.preferredDate}: ${err?.message}`);
      }
    }

    const services = await serviceRepository.findByIds(data.serviceIds);
    if (services.length !== data.serviceIds.length) {
      throw new AppError('One or more selected services are unavailable.', 400);
    }

    const conflict = validateServiceCombo(services);
    if (conflict) {
      throw new AppError(conflict.reason, 422, true, { conflictingIds: conflict.conflictingIds });
    }

    const isReservation = Boolean(data.preferredDate && data.preferredTime);
    if (isReservation && !data.bypassPaymentProof) {
      const settings = await adminRepository.getShopSettings(data.branchId);
      const enabledMethods = (settings.paymentMethods || []).filter((pm: any) => pm.enabled);

      if (enabledMethods.length === 0) {
        throw new AppError('No payment methods are currently available for reservations. Please contact the shop.', 400);
      }

      let methodMatch: any = null;
      if (data.paymentMethod || data.paymentMethodId) {
        methodMatch = enabledMethods.find((pm: any) =>
          (data.paymentMethodId && (pm.id === data.paymentMethodId || pm.key === data.paymentMethodId)) ||
          (data.paymentMethod && pm.name.toLowerCase() === data.paymentMethod.toLowerCase()) ||
          (pm.id && pm.id.toLowerCase() === (data.paymentMethod || '').toLowerCase()) ||
          (pm.key && pm.key.toLowerCase() === (data.paymentMethod || '').toLowerCase())
        );

        if (!methodMatch) {
          throw new AppError('The selected payment method is not available or has been disabled.', 400);
        }
      }

      const sharedMethod = enabledMethods.find((pm: any) => pm.accountNumber || pm.qrImageUrl);
      const effectiveMethod = {
        ...methodMatch,
        accountNumber: methodMatch?.accountNumber || sharedMethod?.accountNumber,
        accountName: methodMatch?.accountName || methodMatch?.merchantName || sharedMethod?.accountName || sharedMethod?.merchantName,
        merchantName: methodMatch?.merchantName || sharedMethod?.merchantName,
      };

      assertReceiptRecipientMatches({ detected: data.recipientIdentifierDetected, method: effectiveMethod });
      assertReceiptEvidenceValid({ amount: data.receiptAmountDetected, ocrConfidence: data.receiptOcrConfidence, transactionDate: data.receiptTransactionDate, requiredAmount: 50 });

      if (!data.proofImageUrl && process.env.NODE_ENV !== 'test') {
        throw new AppError('Payment receipt screenshot is required for reservation.', 400);
      }
    }

    let cleanReferenceNumber: string | null = null;
    if (data.referenceNumber) {
      cleanReferenceNumber = data.referenceNumber.trim().replace(/\s+/g, '');
      const providerId = String(data.paymentProvider || data.paymentMethod || '').toLowerCase();
      const isBank = providerId.includes('bank') || providerId === 'maribank' || providerId === 'gotyme';
      const isValidRefFormat = isBank
        ? /^[A-Za-z0-9-]{8,32}$/.test(cleanReferenceNumber)
        : (/^\d{9,13}$/.test(cleanReferenceNumber) || /^[A-Za-z0-9-]{8,32}$/.test(cleanReferenceNumber));
      if (!isValidRefFormat) {
        throw new AppError('Payment transaction reference number format is invalid.', 400);
      }

      const isDuplicate = await queueRepository.isReferenceNumberDuplicate(cleanReferenceNumber);
      if (isDuplicate) {
        throw new AppError('This reference number has already been used and confirmed for a previous booking.', 409);
      }
    } else if (isReservation && !data.bypassPaymentProof && process.env.NODE_ENV !== 'test') {
      throw new AppError('Payment transaction reference number is required for reservation.', 400);
    }

    let cleanOcrRef: string | null = null;
    if (data.ocrReferenceNumber) {
      cleanOcrRef = data.ocrReferenceNumber.trim().replace(/\s+/g, '');
      if (cleanReferenceNumber && cleanOcrRef && cleanReferenceNumber !== cleanOcrRef) {
        throw new AppError('Entered reference number does not match the uploaded receipt screenshot.', 400);
      }
    }

    if (shouldEnforceReceiptImageHashUniqueness(data.allowDuplicateReceiptImage)) {
      if (data.imageHash) {
        const isHashDuplicate = await queueRepository.isImageHashDuplicate(data.imageHash);
        if (isHashDuplicate) {
          throw new AppError('This receipt image has already been submitted for another booking.', 409);
        }
      }
      for (const hash of data.imageHashes || []) {
        if (hash === data.imageHash) continue;
        if (await queueRepository.isImageHashDuplicate(hash)) {
          throw new AppError('This receipt image has already been submitted for another booking.', 409);
        }
      }
    }

    const durationMinutes = services.reduce(
      (total, service) => total + (Number(service.duration_minutes) || 30),
      0
    );
    const primaryServiceId = data.serviceIds[0];
    const scheduledStartEpoch = reservationTimeToEpoch(data.preferredDate, data.preferredTime);
    const arrivalDeadlineEpoch = getArrivalDeadlineEpoch(data.preferredDate, data.preferredTime);
    // Single normalized representation shared by the conflict check and the insert,
    // so both always agree on which instant this reservation claims.
    const scheduledStartAt = scheduledStartEpoch === null
      ? null
      : new Date(scheduledStartEpoch).toISOString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    let lockAcquired = false;
    let newEntry: any;
    const targetStatus = data.initialStatus || 'pending';

    try {
      const lockResult = await acquireBarberLock(data.barberId);
      ensureBarberLockAcquired(lockResult, 'Sorry, someone else is looking at this slot right now!');
      lockAcquired = true;

      newEntry = await queueRepository.withTransaction(async (client) => {
        // PostgreSQL row locking coordinates all app instances. Redis remains
        // outside this critical path; the slot unique index is the final guard.
        await queueRepository.lockBarber(client, data.barberId);
        if (data.diagnosticIdempotencyKey) {
          const existingEntry = await queueRepository.findWalkInByIdempotencyKeyForUpdate(client, data.diagnosticIdempotencyKey);
          if (existingEntry) {
            if (Number(existingEntry.customer_id) !== Number(data.customerId)) {
              throw new AppError('This reservation request key has already been used.', 409);
            }
            return existingEntry;
          }
        }

        const existing = data.customerId > 0 ? await queueRepository.findActiveByCustomerForUpdate(client, data.customerId) : [];
        if (existing.length > 0 && !data.isTest) {
          throw new AppError('You already have an active booking or pending reservation.', 409);
        }

        // Reject any active assignment whose full service interval overlaps.
        // The barber row lock serializes claims before this check.
        if (scheduledStartAt !== null) {
          const slotConflicts = await queueRepository.findBarberIntervalConflictsForUpdate(
            client,
            data.barberId,
            data.branchId,
            scheduledStartAt,
            durationMinutes,
          );
          if (slotConflicts.length > 0) {
            throw new AppError(
              'That time slot has just been booked with this barber. Please choose another time.',
              409,
              true,
              { errorType: 'SlotConflict' },
            );
          }

          if (data.preferredDate && data.preferredTime && isDateTodayInManila(data.preferredDate)) {
            const barberRecord = await barberRepository.findBarberById(data.barberId);
            if (barberRecord && isBarberOnBreak(barberRecord.status)) {
              const { currentMinutes } = getManilaNow();
              const requestedStartMinutes = timeToMinutes(data.preferredTime);
              if (requestedStartMinutes >= currentMinutes && requestedStartMinutes < currentMinutes + 15) {
                throw new AppError(
                  'The barber is currently on break. Please choose a slot after the break or select another barber.',
                  409,
                  true,
                  { errorType: 'SlotConflict' },
                );
              }
            }
          }
        }

        return queueRepository.insertReservation(client, {
          customerId: data.customerId,
          barberId: data.barberId,
          branchId: data.branchId,
          serviceId: primaryServiceId,
          serviceIds: data.serviceIds,
          durationMinutes,
          preferredDate: data.preferredDate,
          preferredTime: data.preferredTime,
          scheduledStartAt,
          arrivalDeadlineAt: arrivalDeadlineEpoch === null ? null : new Date(arrivalDeadlineEpoch).toISOString(),
          status: targetStatus,
          referenceNumber: cleanReferenceNumber,
          proofImageUrl: data.proofImageUrl || null,
          imageHash: data.imageHash || null,
          ocrReferenceNumber: cleanOcrRef || null,
          recipientIdentifierDetected: data.recipientIdentifierDetected || null,
          expiresAt,
          isTest: data.isTest,
          offlineIdempotencyKey: data.diagnosticIdempotencyKey || null,
          paymentProvider: data.paymentProvider || (typeof data.paymentMethod === 'string' && ['gcash', 'maya', 'maribank', 'gotyme'].includes(data.paymentMethod.toLowerCase()) ? data.paymentMethod.toLowerCase() : null),
        });
      }).catch((error: unknown) => {
        // Backstop: uniq_queue_entries_barber_slot & idx_queue_entries_active_ref_no
        if ((error as { code?: string })?.code === '23505') {
          const constraint = String((error as { constraint?: string })?.constraint || '');
          if (constraint === 'idx_queue_entries_active_ref_no') {
            throw new AppError('This reference number has already been submitted for another booking.', 409);
          }
          if (constraint === 'uniq_queue_entries_barber_slot' || constraint === 'excl_queue_entries_barber_service_interval') {
            throw new AppError(
              'That time slot has just been booked with this barber. Please choose another time.',
              409,
              true,
              { errorType: 'SlotConflict' },
            );
          }
        }
        throw error;
      });
    } finally {
      if (lockAcquired) {
        await releaseBarberLock(data.barberId);
      }
    }

    if (targetStatus === 'pending' && !data.isTest) {
      void this.dispatchPendingReservationNotification(newEntry).catch((error: any) => {
        logger.warn('[QueueService] Reservation created but pending notification dispatch failed', {
          queueId: newEntry?.id ?? null,
          error: error?.message || String(error),
        });
      });
      void dispatchReservationDecisionEmailSafely(newEntry.id, 'RECEIVED');
    }
    if (targetStatus === 'accepted' && !data.isTest && newEntry?.id) {
      void dispatchReservationDecisionEmailSafely(newEntry.id, 'CONFIRMED');
      void dispatchBarberBookingEmailSafely(newEntry.id);
    }
    resetQueueMaintenanceDebounce(data.barberId);
    realtimeBroadcastService.dispatchAppointmentChangeSafely({
      action: 'CREATED',
      queueEntryId: newEntry?.id ?? null,
      status: newEntry?.status ?? targetStatus,
      customerId: data.customerId,
      barberId: data.barberId,
      branchId: data.branchId,
    });
    logger.info('[Queue] Reservation created', {
      event: 'reservation_created',
      queueId: newEntry?.id ?? null,
      barberId: data.barberId,
      branchId: data.branchId,
      status: newEntry?.status ?? targetStatus,
      duration_ms: Math.round(performance.now() - startedAt),
    });
    return newEntry;
  }

  async createCashierReservation(data: {
    customerName: string;
    barberId: number;
    branchId: number;
    serviceIds: number[];
    preferredDate: string;
    preferredTime: string;
    paymentMethod: 'Cash' | 'GCash';
    idempotencyKey: string;
  }): Promise<any> {
    const customerName = String(data.customerName || '').trim();
    if (!customerName || customerName.length > 100) throw new AppError('Enter a valid customer name.', 400);
    const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(data.preferredTime || ''));
    const hour24 = timeMatch ? Number(timeMatch[1]) : NaN;
    const explicitTime = timeMatch
      ? `${hour24 % 12 || 12}:${timeMatch[2]} ${hour24 >= 12 ? 'PM' : 'AM'}`
      : null;
    const scheduledStartEpoch = explicitTime
      ? reservationTimeToEpoch(data.preferredDate, explicitTime)
      : null;
    if (scheduledStartEpoch === null) throw new AppError('Select a valid reservation date and time.', 400);
    const existingByKey = await queueRepository.findReservationByIdempotencyKey(data.idempotencyKey);
    if (existingByKey) return existingByKey;
    if (!(await queueRepository.isActiveBarberAtBranch(data.barberId, data.branchId))) {
      throw new AppError('The selected barber is not available at this branch.', 400);
    }
    try {
      const schedule = await staffScheduleService.getBarberSchedulePublic(
        data.barberId,
        data.preferredDate,
        data.preferredDate,
      );
      const detail = schedule.dateDetails?.[data.preferredDate];
      const isOffDuty = isBarberOffDutyOnDate(schedule, data.preferredDate);
      if (isOffDuty) {
        const reason = detail?.reason;
        const message = reason
          ? `The selected barber is unavailable on this date (${reason}).`
          : 'The selected barber is off duty on this date.';
        throw new AppError(message, 400);
      }
    } catch (err: any) {
      if (err instanceof AppError && (err.status === 400 || (err as any).statusCode === 400)) {
        throw err;
      }
      logger.warn(`[QueueService] Could not check public barber schedule for cashier reservation date ${data.preferredDate}: ${err?.message}`);
    }
    const services = await serviceRepository.findByIds(data.serviceIds);
    if (services.length !== data.serviceIds.length) throw new AppError('The selected service is unavailable.', 400);
    const durationMinutes = services.reduce((total, service) => total + (Number(service.duration_minutes) || 30), 0);
    if (scheduledStartEpoch <= Date.now()) {
      throw new AppError('Reservation time must be in the future.', 400);
    }
    const requestedStartMinutes = timeToMinutes(data.preferredTime);
    if (requestedStartMinutes < 9 * 60) {
      throw new AppError('Reservation times start at 9:00 AM.', 400);
    }
    const { todayISO, currentMinutes } = getManilaNow();
    if (data.preferredDate === todayISO && currentMinutes >= 21 * 60) {
      throw new AppError('Today is no longer available for reservations after 9:00 PM.', 400);
    }
    const availability = await this.getAvailability(data.barberId, data.branchId, data.preferredDate, data.serviceIds, { allowOnlineBookingDisabled: true });
    const hasAvailableStart = availability.availableSlots.some(
      (slot) => timeToMinutes(slot.hour) === requestedStartMinutes,
    );
    if (!hasAvailableStart) {
      throw new AppError('That time is outside shop hours, has already passed, or is unavailable. Choose an available reservation time.', 409);
    }
    const entry = await queueRepository.withTransaction(async (client) => {
      await queueRepository.lockBarber(client, data.barberId);
      const prior = await queueRepository.findReservationByIdempotencyKeyForUpdate(client, data.idempotencyKey);
      if (prior) return prior;
      const conflicts = await queueRepository.findBarberIntervalConflictsForUpdate(
        client, data.barberId, data.branchId, new Date(scheduledStartEpoch).toISOString(), durationMinutes,
      );
      if (conflicts.length > 0) throw new AppError('That time slot has just been booked with this barber. Please choose another time.', 409);
      const inserted = await queueRepository.insertReservation(client, {
        customerId: 0, barberId: data.barberId, branchId: data.branchId, serviceId: data.serviceIds[0],
        serviceIds: data.serviceIds, durationMinutes, preferredDate: data.preferredDate, preferredTime: data.preferredTime,
        scheduledStartAt: new Date(scheduledStartEpoch).toISOString(),
        arrivalDeadlineAt: new Date(scheduledStartEpoch + 10 * 60_000).toISOString(), status: 'accepted',
        customerName, offlineIdempotencyKey: data.idempotencyKey,
      });
      await transactionRepository.createReservationFee(client, {
        queueEntryId: Number(inserted.id), branchId: data.branchId, barberId: data.barberId,
        amount: RESERVATION_FEE_AMOUNT, paymentMethod: data.paymentMethod, idempotencyKey: `manual-reservation-fee-${inserted.id}`,
      });
      return inserted;
    });
    resetQueueMaintenanceDebounce(data.barberId);
    if (entry?.id) {
      void dispatchBarberBookingEmailSafely(entry.id);
    }
    realtimeBroadcastService.dispatchAppointmentChangeSafely({
      action: 'CREATED', queueEntryId: entry.id, status: 'accepted', customerId: null, barberId: data.barberId, branchId: data.branchId,
    });
    return { ...entry, reservation_fee_paid: true, reservation_fee_amount: RESERVATION_FEE_AMOUNT, reservation_fee_method: data.paymentMethod };
  }

  /**
   * Joins multiple guests to the queue in a single consolidated group reservation.
   */
  async joinGroupQueue(data: {
    customerId: number;
    branchId: number;
    preferredDate?: string;
    baseTimeSlot?: string;
    isStaggered?: boolean;
    guests: Array<{
      guestName?: string;
      barberId: number;
      serviceIds: number[];
      preferredDate?: string;
      preferredTime: string;
      scheduledStartTime?: string;
      estimatedEndTime?: string;
      durationMinutes?: number;
    }>;
    referenceNumber?: string;
    proofImageUrl?: string;
    paymentMethod?: string;
    paymentMethodId?: string;
    imageHash?: string;
    /** Set only by customer booking routes; keep the hash for review, but do not reject on image reuse. */
    allowDuplicateReceiptImage?: boolean;
    ocrReferenceNumber?: string;
    recipientIdentifierDetected?: string;
    receiptAmountDetected?: number;
    receiptOcrConfidence?: number;
    receiptTransactionDate?: string;
    imageHashes?: string[];
    proofImageUrls?: string[];
    agreedToTerms?: boolean;
    initialStatus?: 'pending' | 'accepted';
    paymentProvider?: string;
  }): Promise<{
    groupBookingId: string;
    totalGuests: number;
    totalDeposit: number;
    entries: any[];
  }> {
    if (!Array.isArray(data.guests) || data.guests.length === 0) {
      throw new AppError('At least one guest appointment must be provided for a group booking.', 400);
    }

    const groupDate = data.preferredDate || data.guests[0]?.preferredDate;
    if (data.guests.some(g => g.preferredDate && g.preferredDate !== groupDate)) {
      throw new AppError('All guests in a group booking must share the same appointment date.', 400);
    }

    const validatedGuests: Array<{
      guestName: string;
      barberId: number;
      serviceIds: number[];
      preferredDate: string;
      preferredTime: string;
      services: any[];
      durationMinutes: number;
      primaryServiceId: number;
      scheduledStartEpoch: number | null;
      scheduledStartAt: string | null;
      arrivalDeadlineEpoch: number | null;
      arrivalDeadlineAt: string | null;
    }> = [];

    const distinctBarberIds = Array.from(new Set(data.guests.map(g => Number(g.barberId)))).sort((a, b) => a - b);

    for (let i = 0; i < data.guests.length; i++) {
      const g = data.guests[i];
      const barberId = Number(g.barberId);
      const guestName = g.guestName?.trim() || `Guest ${i + 1}`;
      const serviceIds = (Array.isArray(g.serviceIds) ? g.serviceIds : []).map(Number);
      const effectiveDate = g.preferredDate || groupDate;

      const targetTime = (g.scheduledStartTime || g.preferredTime || '').trim();
      if (!barberId || !data.branchId || serviceIds.length === 0 || !effectiveDate || !targetTime) {
        throw new AppError(`Guest ${i + 1}: barberId, branchId, date, time, and at least one service are required.`, 400);
      }
      if (serviceIds.some(id => !Number.isInteger(id) || id <= 0) || new Set(serviceIds).size !== serviceIds.length) {
        throw new AppError(`Guest ${i + 1}: serviceIds must contain unique positive integers.`, 400);
      }

      const barberIsAvailable = await queueRepository.isActiveBarberAtBranch(barberId, data.branchId);
      if (!barberIsAvailable) {
        throw new AppError(`Guest ${i + 1}: The selected barber is not available at this branch.`, 400);
      }

      try {
        const schedule = await staffScheduleService.getBarberSchedulePublic(
          barberId,
          effectiveDate,
          effectiveDate
        );
        const detail = schedule.dateDetails?.[effectiveDate];
        const isOffDuty = isBarberOffDutyOnDate(schedule, effectiveDate);
        const isOnlineDisabled = detail?.isOnlineBookingEnabled === false || detail?.reason === 'Online Booking Disabled';

        if (isOffDuty || isOnlineDisabled) {
          const reason = detail?.reason;
          const message = isOnlineDisabled
            ? `Guest ${i + 1}: This barber is not accepting online bookings on this date.`
            : (reason ? `Guest ${i + 1}: The selected barber is unavailable on this date (${reason}).` : `Guest ${i + 1}: The selected barber is off duty on this date.`);
          throw new AppError(message, 400);
        }
      } catch (err: any) {
        if (err instanceof AppError && (err.status === 400 || (err as any).statusCode === 400)) {
          throw err;
        }
        logger.warn(`[QueueService] Could not check public barber schedule for date ${effectiveDate}: ${err?.message}`);
      }

      const services = await serviceRepository.findByIds(serviceIds);
      if (services.length !== serviceIds.length) {
        throw new AppError(`Guest ${i + 1}: One or more selected services are unavailable.`, 400);
      }

      const conflict = validateServiceCombo(services);
      if (conflict) {
        throw new AppError(`Guest ${i + 1}: ${conflict.reason}`, 422, true, { conflictingIds: conflict.conflictingIds });
      }

      const durationMinutes = services.reduce(
        (total, service) => total + (Number(service.duration_minutes) || 30),
        0
      );
      const scheduledStartEpoch = reservationTimeToEpoch(effectiveDate, targetTime);
      const arrivalDeadlineEpoch = getArrivalDeadlineEpoch(effectiveDate, targetTime);
      const scheduledStartAt = scheduledStartEpoch === null ? null : new Date(scheduledStartEpoch).toISOString();
      const arrivalDeadlineAt = arrivalDeadlineEpoch === null ? null : new Date(arrivalDeadlineEpoch).toISOString();

      validatedGuests.push({
        guestName,
        barberId,
        serviceIds,
        preferredDate: effectiveDate,
        preferredTime: targetTime,
        services,
        durationMinutes,
        primaryServiceId: serviceIds[0],
        scheduledStartEpoch,
        scheduledStartAt,
        arrivalDeadlineEpoch,
        arrivalDeadlineAt,
      });
    }

    // Intra-group interval conflict check
    for (let i = 0; i < validatedGuests.length; i++) {
      const gA = validatedGuests[i];
      if (!gA.preferredDate || !gA.preferredTime) continue;
      const startA = timeToMinutes(gA.preferredTime);
      const endA = startA + (Number(gA.durationMinutes) || 30);

      for (let j = i + 1; j < validatedGuests.length; j++) {
        const gB = validatedGuests[j];
        if (gA.barberId !== gB.barberId) continue;
        if (gA.preferredDate !== gB.preferredDate) continue;
        if (!gB.preferredTime) continue;

        const startB = timeToMinutes(gB.preferredTime);
        const endB = startB + (Number(gB.durationMinutes) || 30);

        if (startA === startB) {
          throw new AppError(
            `Two or more guests cannot book the same barber at the exact same time (${gA.preferredTime}). Please select different barbers or times.`,
            409
          );
        }

        // Check if intervals [startA, endA) and [startB, endB) overlap
        if (startA < endB && startB < endA) {
          throw new AppError(
            `Time slot overlap detected between ${gA.guestName} (${gA.preferredTime}) and ${gB.guestName} (${gB.preferredTime}) for the same barber. Please adjust the schedules to avoid overlapping appointments.`,
            409
          );
        }
      }
    }

    const settings = await adminRepository.getShopSettings(data.branchId);
    const enabledMethods = (settings.paymentMethods || []).filter((pm: any) => pm.enabled);

    if (enabledMethods.length === 0) {
      throw new AppError('No payment methods are currently available for reservations. Please contact the shop.', 400);
    }

    if (data.paymentMethod || data.paymentMethodId) {
      const methodMatch = enabledMethods.find((pm: any) =>
        (data.paymentMethodId && (pm.id === data.paymentMethodId || pm.key === data.paymentMethodId)) ||
        (data.paymentMethod && pm.name.toLowerCase() === data.paymentMethod.toLowerCase()) ||
        (pm.id && pm.id.toLowerCase() === (data.paymentMethod || '').toLowerCase()) ||
        (pm.key && pm.key.toLowerCase() === (data.paymentMethod || '').toLowerCase())
      );

      if (!methodMatch) {
        throw new AppError('The selected payment method is not available or has been disabled.', 400);
      }

      const sharedMethod = enabledMethods.find((pm: any) => pm.accountNumber || pm.qrImageUrl);
      const effectiveMethod = {
        ...methodMatch,
        accountNumber: methodMatch?.accountNumber || sharedMethod?.accountNumber,
        accountName: methodMatch?.accountName || methodMatch?.merchantName || sharedMethod?.accountName || sharedMethod?.merchantName,
        merchantName: methodMatch?.merchantName || sharedMethod?.merchantName,
      };

      assertReceiptRecipientMatches({ detected: data.recipientIdentifierDetected, method: effectiveMethod });
      assertReceiptEvidenceValid({ amount: data.receiptAmountDetected, ocrConfidence: data.receiptOcrConfidence, transactionDate: data.receiptTransactionDate, requiredAmount: data.guests.length * 50 });
    }

    if (!data.proofImageUrl && process.env.NODE_ENV !== 'test') {
      throw new AppError('Payment receipt screenshot is required for reservation.', 400);
    }

    let cleanReferenceNumber: string | null = null;
    if (data.referenceNumber) {
      cleanReferenceNumber = data.referenceNumber.trim().replace(/\s+/g, '');
      const providerId = String(data.paymentProvider || data.paymentMethod || '').toLowerCase();
      const isBank = providerId.includes('bank') || providerId === 'maribank' || providerId === 'gotyme';
      const isValidRefFormat = isBank
        ? /^[A-Za-z0-9-]{8,32}$/.test(cleanReferenceNumber)
        : (/^\d{9,13}$/.test(cleanReferenceNumber) || /^[A-Za-z0-9-]{8,32}$/.test(cleanReferenceNumber));
      if (!isValidRefFormat) {
        throw new AppError('Payment transaction reference number format is invalid.', 400);
      }

      const isDuplicate = await queueRepository.isReferenceNumberDuplicate(cleanReferenceNumber);
      if (isDuplicate) {
        throw new AppError('This reference number has already been used and confirmed for a previous booking.', 409);
      }
    } else if (process.env.NODE_ENV !== 'test') {
      throw new AppError('Payment transaction reference number is required for reservation.', 400);
    }

    let cleanOcrRef: string | null = null;
    if (data.ocrReferenceNumber) {
      cleanOcrRef = data.ocrReferenceNumber.trim().replace(/\s+/g, '');
      if (cleanReferenceNumber && cleanOcrRef && cleanReferenceNumber !== cleanOcrRef) {
        throw new AppError('Entered reference number does not match the uploaded receipt screenshot.', 400);
      }
    }

    if (shouldEnforceReceiptImageHashUniqueness(data.allowDuplicateReceiptImage)) {
      if (data.imageHash) {
        const isHashDuplicate = await queueRepository.isImageHashDuplicate(data.imageHash);
        if (isHashDuplicate) {
          throw new AppError('This receipt image has already been submitted for another booking.', 409);
        }
      }
      for (const hash of data.imageHashes || []) {
        if (hash === data.imageHash) continue;
        if (await queueRepository.isImageHashDuplicate(hash)) {
          throw new AppError('This receipt image has already been submitted for another booking.', 409);
        }
      }
    }

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const targetStatus = data.initialStatus || 'pending';
    const totalDeposit = validatedGuests.length * 50;
    const lockedBarbers: number[] = [];

    let groupResult: { groupBookingId: string; totalGuests: number; totalDeposit: number; entries: any[] };

    try {
      for (const bId of distinctBarberIds) {
        const lockResult = await acquireBarberLock(bId);
        ensureBarberLockAcquired(lockResult, 'Sorry, another customer is currently looking at one of your selected slots!');
        lockedBarbers.push(bId);
      }

      groupResult = await queueRepository.withTransaction(async (client) => {
        for (const barberId of distinctBarberIds) {
          await queueRepository.lockBarber(client, barberId);
        }

        const existing = await queueRepository.findActiveByCustomerForUpdate(client, data.customerId);
        if (existing.length > 0) {
          throw new AppError('You already have an active booking or pending reservation.', 409);
        }

        for (let i = 0; i < validatedGuests.length; i++) {
          const g = validatedGuests[i];
          if (g.scheduledStartAt !== null) {
            // The barber row locks below serialize group claims with all other
            // reservation and walk-in mutations for the selected barbers.
            const slotConflicts = await queueRepository.findBarberIntervalConflictsForUpdate(
              client,
              g.barberId,
              data.branchId,
              g.scheduledStartAt,
              g.durationMinutes,
            );
            if (slotConflicts.length > 0) {
              throw new AppError(
                `The time slot for ${g.guestName} (${g.preferredTime}) has just been booked. Please choose another time.`,
                409,
                true,
                { errorType: 'SlotConflict' },
              );
            }
          }
        }

        // Shared barber contiguous availability verification
        for (const barberId of distinctBarberIds) {
          const guestsOnBarber = validatedGuests.filter(g => g.barberId === barberId);
          if (guestsOnBarber.length > 1) {
            guestsOnBarber.sort((a, b) => (a.scheduledStartEpoch || 0) - (b.scheduledStartEpoch || 0));
            const firstGuest = guestsOnBarber[0];
            const lastGuest = guestsOnBarber[guestsOnBarber.length - 1];
            if (firstGuest.scheduledStartEpoch && lastGuest.scheduledStartEpoch) {
              const totalDuration = Math.max(
                availabilityService.computeGroupDuration(guestsOnBarber),
                Math.round(
                  ((lastGuest.scheduledStartEpoch + lastGuest.durationMinutes * 60 * 1000) - firstGuest.scheduledStartEpoch) / (60 * 1000)
                ),
              );
              const contiguousCheck = await availabilityService.verifyContiguousBarberBlock({
                client,
                barberId,
                branchId: data.branchId,
                date: firstGuest.preferredDate,
                startTime: firstGuest.preferredTime,
                totalDurationMinutes: totalDuration,
              });
              if (!contiguousCheck.isAvailable) {
                throw new AppError(
                  contiguousCheck.conflictReason || 'The shared barber does not have enough continuous open time to service consecutive guests in the group.',
                  409,
                  true,
                  { errorType: 'SlotConflict' },
                );
              }
            }
          }
        }

        const groupRecord = await queueRepository.insertGroupBooking(client, {
          customerId: data.customerId,
          branchId: data.branchId,
          totalGuests: validatedGuests.length,
          totalDeposit,
          referenceNumber: cleanReferenceNumber,
          proofImageUrl: data.proofImageUrl || null,
          paymentMethod: typeof data.paymentMethod === 'string' ? data.paymentMethod : null,
          paymentMethodId: typeof data.paymentMethodId === 'string' ? data.paymentMethodId : null,
          paymentProvider: data.paymentProvider || (typeof data.paymentMethod === 'string' && ['gcash', 'maya', 'maribank', 'gotyme'].includes(data.paymentMethod.toLowerCase()) ? data.paymentMethod.toLowerCase() : null),
          status: targetStatus,
        });

        const createdEntries: any[] = [];
        for (let i = 0; i < validatedGuests.length; i++) {
          const g = validatedGuests[i];
          const guestRef = i === 0
            ? cleanReferenceNumber
            : (cleanReferenceNumber ? `${cleanReferenceNumber}-G${i + 1}` : null);

          const entry = await queueRepository.insertReservation(client, {
            customerId: data.customerId,
            customerName: g.guestName,
            barberId: g.barberId,
            branchId: data.branchId,
            serviceId: g.primaryServiceId,
            serviceIds: g.serviceIds,
            durationMinutes: g.durationMinutes,
            preferredDate: g.preferredDate,
            preferredTime: g.preferredTime,
            scheduledStartAt: g.scheduledStartAt,
            arrivalDeadlineAt: g.arrivalDeadlineAt,
            status: targetStatus,
            referenceNumber: guestRef,
            proofImageUrl: data.proofImageUrl || null,
            imageHash: i === 0 ? (data.imageHash || null) : null,
            ocrReferenceNumber: i === 0 ? (cleanOcrRef || null) : null,
            recipientIdentifierDetected: i === 0 ? (data.recipientIdentifierDetected || null) : null,
            expiresAt,
            groupBookingId: groupRecord.id,
            guestName: g.guestName,
            paymentProvider: data.paymentProvider || (typeof data.paymentMethod === 'string' && ['gcash', 'maya', 'maribank', 'gotyme'].includes(data.paymentMethod.toLowerCase()) ? data.paymentMethod.toLowerCase() : null),
          });
          createdEntries.push(entry);
        }

        return {
          groupBookingId: groupRecord.id,
          totalGuests: validatedGuests.length,
          totalDeposit,
          entries: createdEntries,
        };
      }).catch((error: unknown) => {
        if ((error as { code?: string })?.code === '23505') {
          const constraint = String((error as { constraint?: string })?.constraint || '');
          if (constraint === 'idx_queue_entries_active_ref_no') {
            throw new AppError('This reference number has already been submitted for another booking.', 409);
          }
          if (constraint === 'uniq_queue_entries_barber_slot' || constraint === 'excl_queue_entries_barber_service_interval') {
            throw new AppError(
              'A selected time slot has just been booked with the barber. Please choose another time.',
              409,
              true,
              { errorType: 'SlotConflict' },
            );
          }
        }
        throw error;
      });
    } finally {
      for (const bId of lockedBarbers) {
        await releaseBarberLock(bId);
      }
    }

    if (targetStatus === 'pending') {
      for (const entry of groupResult.entries) {
        try {
          await this.dispatchPendingReservationNotification(entry);
          if (entry?.id) {
            void dispatchReservationDecisionEmailSafely(entry.id, 'RECEIVED');
          }
        } catch (err: any) {
          logger.warn(`[QueueService] Failed to send notification for group entry ${entry.id}: ${err.message}`);
        }
      }
    } else if (targetStatus === 'accepted') {
      for (const entry of groupResult.entries) {
        if (entry?.id) {
          void dispatchBarberBookingEmailSafely(entry.id);
        }
      }
    }

    for (const bId of distinctBarberIds) {
      resetQueueMaintenanceDebounce(bId);
    }

    for (const entry of groupResult.entries) {
      realtimeBroadcastService.dispatchAppointmentChangeSafely({
        action: 'CREATED',
        queueEntryId: entry?.id ?? null,
        status: entry?.status ?? targetStatus,
        customerId: data.customerId,
        barberId: entry?.barber_id ?? null,
        branchId: data.branchId,
      });
    }

    logger.info('[Queue] Group Reservation created', {
      event: 'group_reservation_created',
      groupBookingId: groupResult.groupBookingId,
      totalGuests: groupResult.totalGuests,
      totalDeposit: groupResult.totalDeposit,
      branchId: data.branchId,
      status: targetStatus,
    });

    return groupResult;
  }

  /**
   * Computes Shortest Estimated Completion Time (SECT) across all active, eligible
   * barbers for a given branch.
   * 
   * @param branchId - The branch identifier.
   * @param tieRangeMinutes - Optional tie threshold in minutes.
   * @returns SECT resolution containing winner (if unambiguous), tied barbers (if tie), and all candidates.
   */
  async calculateBranchSect(branchId: number, tieRangeMinutes?: number): Promise<SectResolution> {
    const rawLanes = await queueRepository.findActiveLanesForBranch(branchId);
    if (!rawLanes || rawLanes.length === 0) {
      return {
        isTie: false,
        winner: null,
        tiedBarbers: [],
        eligibleBarbers: [],
      };
    }

    // Group active queue rows by barber
    const barberMap = new Map<number, {
      barberId: number;
      name: string;
      status: string;
      isActive: boolean;
      orders: any[];
    }>();

    for (const row of rawLanes) {
      const barberId = Number(row.barber_id);
      if (!barberMap.has(barberId)) {
        barberMap.set(barberId, {
          barberId,
          name: row.barber_name || 'Barber',
          status: row.barber_status || 'available',
          isActive: row.is_active === true,
          orders: [],
        });
      }
      if (row.entry_id && row.queue_status) {
        barberMap.get(barberId)!.orders.push({
          queue_status: row.queue_status,
          duration_minutes: row.duration_minutes,
          timer_started_at: row.timer_started_at,
          service_started_at: row.service_started_at,
          service_ends_at: row.service_ends_at,
          scheduled_start_at: row.scheduled_start_at,
        });
      }
    }

    const eligibleBarbers = [...barberMap.values()].filter(isBarberEligibleForSect);
    const availability = await Promise.all(
      eligibleBarbers.map(async (barber) => ({
        barber,
        isAvailable: await this.isBarberAvailableForWalkInToday(barber.barberId),
      })),
    );
    const candidates: BarberEtaCandidate[] = availability
      .filter(({ isAvailable }) => isAvailable)
      .map(({ barber }) => ({
        barberId: barber.barberId,
        name: barber.name,
        status: barber.status,
        isActive: barber.isActive,
        etaMinutes: calculateTotalWaitTime(barber.orders),
      }));

    return resolveSectAssignment(candidates, tieRangeMinutes);
  }

  private async isBarberAvailableForWalkInToday(barberId: number): Promise<boolean> {
    const today = getManilaNow().todayISO;
    try {
      const schedule = await staffScheduleService.getBarberSchedulePublic(barberId, today, today);
      return schedule.dateDetails[today]?.isOnDuty !== false;
    } catch (error: any) {
      logger.warn('[Queue] Could not verify barber duty schedule for walk-in assignment', {
        barberId,
        error: error?.message,
      });
      return false;
    }
  }

  /**
   * Orchestrates adding a walk-in customer to a barber's queue.
   * If barberId is omitted, evaluates server-side SECT assignment and tie handling.
   * Uses the same Redis + DB locking pattern as joinQueue.
   * 
   * @param data - The walk-in request data (name, optional barber, branch, pre-payment).
   * @returns The newly created walk-in queue entry object.
   */
  async addWalkIn(data: WalkInData): Promise<any> {
    const startedAt = performance.now();
    const { branchId } = data;
    let resolvedBarberId = data.barberId;
    let assignedBarberInfo: BarberEtaCandidate | null = null;

    const serviceIds = data.serviceIds ?? [];
    let services: any[] = [];

    if (!resolvedBarberId) {
      // Server-side SECT assignment for no-preference walk-ins
      const [sectResult, loadedServices] = await Promise.all([
        this.calculateBranchSect(branchId),
        serviceIds.length ? serviceRepository.findByIds(serviceIds) : Promise.resolve([]),
      ]);
      services = loadedServices;
      if (sectResult.eligibleBarbers.length === 0) {
        throw new AppError('No active barbers are currently available for assignment.', 400);
      }
      if (sectResult.isTie && sectResult.tiedBarbers.length > 0) {
        // Tie detected: abstractly select a random barber among tied candidates
        const randomIndex = Math.floor(Math.random() * sectResult.tiedBarbers.length);
        assignedBarberInfo = sectResult.tiedBarbers[randomIndex];
        resolvedBarberId = assignedBarberInfo.barberId;
      } else if (!sectResult.winner) {
        throw new AppError('Unable to auto-assign a barber. Please select a barber manually.', 400);
      } else {
        resolvedBarberId = sectResult.winner.barberId;
        assignedBarberInfo = sectResult.winner;
      }
    } else {
      const [barberIsAvailable, loadedServices, barberIsOnDuty] = await Promise.all([
        queueRepository.isActiveBarberAtBranch(resolvedBarberId, branchId),
        serviceIds.length ? serviceRepository.findByIds(serviceIds) : Promise.resolve([]),
        this.isBarberAvailableForWalkInToday(resolvedBarberId),
      ]);
      services = loadedServices;
      if (!barberIsAvailable || !barberIsOnDuty) {
        throw new AppError('The selected barber is not available at this branch.', 400);
      }
    }

    const barberId: number = resolvedBarberId!;

    if (services.length !== serviceIds.length) {
      throw new AppError('One or more selected services are unavailable.', 400);
    }
    const conflict = validateServiceCombo(services);
    if (conflict) {
      throw new AppError(conflict.reason, 422, true, { conflictingIds: conflict.conflictingIds });
    }
    const durationMinutes = services.reduce(
      (total, service) => total + (Number(service.duration_minutes) || 30),
      0,
    ) || null;

    let lockAcquired = false;
    let txOutcome: { result: any; issuedGuest: any };

    try {
      const lockResult = await acquireBarberLock(barberId);
      ensureBarberLockAcquired(lockResult, 'Sorry, someone else is looking at this slot right now!');
      lockAcquired = true;

      txOutcome = await queueRepository.withTransaction(async (client) => {
        if (data.idempotencyKey) {
          const existing = await queueRepository.findWalkInByIdempotencyKeyForUpdate(client, data.idempotencyKey);
          if (existing) {
            if (Number(existing.branch_id) !== branchId) throw new AppError('This walk-in key belongs to another branch.', 409);
            return { result: existing, issuedGuest: null };
          }
        }

        await this.synchronizeScheduledReservations(barberId, client);

        const position = await queueRepository.getNextPosition(client, barberId);
        const statusInfo = determineInitialStatus(position);
        const barberStatus = await queueRepository.getBarberStatusForUpdate(client, barberId);
        if (isBarberOnBreak(barberStatus) && statusInfo.status === 'serving') {
          statusInfo.status = 'waiting';
          statusInfo.timerStartedAt = null;
        }
        if (statusInfo.status === 'serving') {
          const walkInStartAt = new Date().toISOString();
          const conflicts = await queueRepository.findBarberIntervalConflictsForUpdate(
            client,
            barberId,
            branchId,
            walkInStartAt,
            durationMinutes || 30,
          );
          if (conflicts.length > 0) {
            throw new AppError(
              'This walk-in cannot start immediately because the barber has an overlapping scheduled assignment. Please wait or choose another barber.',
              409,
              true,
              { errorType: 'SlotConflict', conflictingQueueId: conflicts[0].id },
            );
          }
        }
        const createdGuest = await guestService.createForWalkIn(client, {
          branchId,
          customerName: data.customerName,
          idempotencyKey: data.idempotencyKey,
          createdBy: data.createdBy,
        });
        const retailItems = normalizeRetailSaleLines(data.retailItems);
        const entry = await queueRepository.insertGuestWalkIn(client, {
          customerName: data.customerName,
          guestProfileId: Number(createdGuest.profile.guest_profile_id),
          barberId,
          branchId,
          serviceId: serviceIds[0] ?? null,
          serviceIds,
          retailItems: [],
          durationMinutes,
          idempotencyKey: data.idempotencyKey,
          position,
          status: statusInfo.status,
          timerStartedAt: statusInfo.timerStartedAt,
          paymentStatus: data.isPrePaid || data.paymentLines?.length ? 'paid' : 'unpaid',
          isTest: Boolean((data as any).isTest),
        });
        if (!entry) throw new AppError('The walk-in could not be created. Please retry.', 409);
        if (Number(entry.branch_id) !== branchId) throw new AppError('This walk-in key belongs to another branch.', 409);
        if (retailItems.length > 0 && entry?.id) {
          let consumption;
          try {
            consumption = await inventoryRepository.recordRetailSaleConsumption(client, {
              items: retailItems,
              branchId,
              transactionId: null,
              queueEntryId: Number(entry.id),
              createdBy: data.createdBy || null,
              sourceKey: `queue:${entry.id}`,
            });
          } catch (error: any) {
            if (error?.code === 'INVENTORY_RETAIL_INSUFFICIENT_STOCK') {
              throw new AppError(error.message, 409);
            }
            if (error?.code === 'INVENTORY_RETAIL_NOT_SELLABLE') {
              throw new AppError(error.message, 400);
            }
            if (error?.code === 'INVENTORY_RETAIL_SOURCE_CONFLICT') {
              throw new AppError('Retail items could not be recorded safely. Please retry.', 409);
            }
            throw error;
          }
          await queueRepository.updateRetailItems(
            client,
            Number(entry.id),
            consumption.lines.map((line) => ({
              productId: line.productId,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              name: line.name,
            })),
          );
        }
        return { result: entry, issuedGuest: createdGuest };
      });
    } finally {
      // Lock is released as soon as the DB transaction settles. QR generation
      // and guest reference lookups below are pure I/O/CPU work that do not
      // touch the DB row locked by acquireBarberLock, so they must not hold
      // the Redis lock (see issue #211 — avoids approaching the 5s TTL).
      if (lockAcquired) {
        await releaseBarberLock(barberId);
      }
    }

    const { result, issuedGuest } = txOutcome;

    const guestResult = (issuedGuest as { profile: any; qrToken: string | null; qrCodeDataUrl: string | null } | null)
      || (result?.guest_profile_id ? await guestService.getReferenceById(branchId, Number(result.guest_profile_id)) : null);

    const guestQrCode = issuedGuest?.qrToken
      ? await guestService.generateQrCode(issuedGuest.qrToken).catch(() => null)
      : guestResult?.qrCodeDataUrl ?? null;

    resetQueueMaintenanceDebounce(barberId);
    logger.info('[Queue] Walk-in joined queue', {
      event: 'walk_in_joined',
      barberId,
      position: result?.position,
      status: result?.status,
      assignedBy: data.barberId ? 'manual' : 'SECT',
      duration_ms: Math.round(performance.now() - startedAt),
    });
    return {
      ...result,
      guestReference: guestResult?.profile?.guest_reference ?? null,
      guestQrCode,
      guestQrExpiresAt: guestResult?.profile?.qr_expires_at ?? null,
      transactions: [],
      barberId: Number(result?.barber_id) || barberId,
      barberName: result?.barber_id && Number(result.barber_id) !== barberId
        ? result.barber_name : assignedBarberInfo?.name ?? result?.barber_name ?? undefined,
      assignedBy: data.barberId ? 'manual' : 'SECT',
    };
  }

  private async synchronizeScheduledReservations(barberId: number, client?: any): Promise<void> {
    if (!client && shouldDebounceSync(barberId)) {
      return;
    }

    const execute = async (txClient: any) => {
      await queueRepository.lockBarber(txClient, barberId);
      const nowIso = new Date().toISOString();
      const entries = await queueRepository.findScheduledReservationsForUpdate(txClient, barberId);

      // Hydrate missing scheduled start/deadline timestamps if any exist
      for (const entry of entries) {
        if (!entry.scheduled_start_at || !entry.arrival_deadline_at) {
          const scheduledStart = reservationTimeToEpoch(entry.preferred_date, entry.preferred_time);
          if (scheduledStart !== null && Number.isFinite(scheduledStart)) {
            const arrivalDeadline = scheduledStart + 10 * 60 * 1000;
            await queueRepository.hydrateScheduledTimes(
              txClient,
              entry.id,
              new Date(scheduledStart).toISOString(),
              new Date(arrivalDeadline).toISOString()
            );
          }
        }
      }

      if (entries.length > 0) {
        const syncResult = await queueRepository.syncScheduledReservationsSetBased(txClient, barberId, nowIso);
        if (syncResult.rebalanceNeeded) {
          await queueRepository.rebalanceLiveQueue(txClient, barberId);
        }
      }

      // Repair an eligible checked-in guest left waiting at the front of the
      // lane if an earlier promotion was skipped while their scheduled time
      // was still in the future. This also keeps a walk-in lane moving.
      await queueRepository.promoteEligibleFirst(txClient, barberId);
    };

    if (client) {
      await execute(client);
    } else {
      await queueRepository.withTransaction(execute);
    }
  }

  private async isTimeRestrictionBypassed(branchId?: number | null): Promise<boolean> {
    if (!branchId) return false;
    try {
      const settings = await adminRepository.getShopSettings(branchId);
      return Boolean(settings?.bypassTimeRestrictions);
    } catch {
      return false;
    }
  }

  async checkInReservation(
    queueId: number,
    branchId?: number,
    userContext?: AuthoritativeUserContext,
  ): Promise<any> {
    return queueRepository.withTransaction(async (client) => {
      const entry = await queueRepository.findByIdForUpdate(client, queueId);
      if (!entry) throw new AppError('Reservation not found.', 404);
      const checkedIn = await this.checkInEntryInTransaction(client, entry, branchId, userContext);
      if (entry.group_booking_id) {
        const groupEntries = await queueRepository.findGroupQueueEntriesForUpdate(client, String(entry.group_booking_id));
        const hasUnsettled = groupEntries.some((e) => ['pending', 'accepted', 'late'].includes(e.status));
        await queueRepository.updateGroupBookingStatus(
          client,
          String(entry.group_booking_id),
          hasUnsettled ? 'partially_checked_in' : 'checked_in',
        );
      }
      return checkedIn;
    });
  }

  async checkInGroupReservation(
    groupBookingId: string,
    branchId?: number,
    userContext?: AuthoritativeUserContext,
  ): Promise<any> {
    return queueRepository.withTransaction(async (client) => (
      this.checkInGroupReservationInTransaction(client, groupBookingId, branchId, userContext)
    ));
  }

  private async checkInGroupReservationInTransaction(
    client: any,
    groupBookingId: string,
    branchId?: number,
    userContext?: AuthoritativeUserContext,
  ): Promise<any> {
    const groupBooking = await queueRepository.findGroupBookingForUpdate(client, groupBookingId);
    if (!groupBooking) throw new AppError('Group booking not found.', 404);

    const entries = await queueRepository.findGroupQueueEntriesForUpdate(client, groupBookingId);
    if (entries.length === 0) throw new AppError('Group booking not found.', 404);
    const expectedGuests = Number(groupBooking.total_guests);
    if (Number.isInteger(expectedGuests) && expectedGuests > 0 && entries.length !== expectedGuests) {
      throw new AppError(
        `Group booking is incomplete: expected ${expectedGuests} guests but found ${entries.length} queue entries.`,
        409,
      );
    }

    const firstEntry = entries[0];
    if (userContext) {
      this.assertMutationAccess(userContext, firstEntry, 'check-in');
    } else {
      this.assertLegacyBranchAccess(firstEntry, branchId);
    }

    const checkedInEntries = [];
    for (const entry of entries) {
      if (['waiting', 'serving'].includes(String(entry.status))) {
        checkedInEntries.push(entry);
        continue;
      }
      if (['no_show', 'cancelled', 'expired', 'completed', 'paid'].includes(String(entry.status))) {
        continue;
      }
      if (!['accepted', 'late'].includes(entry.status)) {
        throw new AppError(`Guest ${entry.guest_name || entry.id} cannot be checked in from status '${entry.status}'.`, 409);
      }
      checkedInEntries.push(await this.checkInEntryInTransaction(client, entry, branchId, userContext));
    }

    await queueRepository.updateGroupBookingStatus(client, groupBookingId, 'checked_in');
    return {
      ...(checkedInEntries[0] || entries[0]),
      groupBookingId,
      totalGuests: entries.length,
      entries: checkedInEntries,
      groupStatus: 'checked_in',
    };
  }

  private async checkInEntryInTransaction(
    client: any,
    entry: any,
    branchId?: number,
    userContext?: AuthoritativeUserContext,
  ): Promise<any> {
    if (userContext) {
      this.assertMutationAccess(userContext, entry, 'check-in');
    } else {
      this.assertLegacyBranchAccess(entry, branchId);
    }
    if (!['accepted', 'late'].includes(entry.status)) {
      throw new AppError(`Reservation cannot be checked in from status '${entry.status}'.`, 409);
    }

      const scheduledStart = entry.scheduled_start_at
        ? new Date(entry.scheduled_start_at).getTime()
        : reservationTimeToEpoch(entry.preferred_date, entry.preferred_time);
      if (scheduledStart === null) throw new AppError('Reservation has no valid scheduled time.', 400);

      const now = Date.now();
      const targetBranchId = entry.branch_id || branchId;
      const isBypassed = await this.isTimeRestrictionBypassed(targetBranchId);
      if (!isBypassed && now < scheduledStart - RESERVATION_EARLY_CHECK_IN_WINDOW_MS) {
        const displayTime = entry.preferred_time || new Intl.DateTimeFormat('en-US', {
          timeZone: 'Asia/Manila',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }).format(new Date(scheduledStart));
        throw new AppError(`Early check-in is unavailable until 10 minutes before the scheduled arrival time (${displayTime}).`, 422);
      }

      const arrivalDeadline = entry.arrival_deadline_at
        ? new Date(entry.arrival_deadline_at).getTime()
        : scheduledStart + 10 * 60 * 1000;
      if (now >= arrivalDeadline) {
        throw new AppError('The reservation has passed its 10-minute arrival grace period.', 409);
      }

      const queueId = Number(entry.id);
      await queueRepository.lockBarber(client, entry.barber_id);
      const position = await queueRepository.getNextPosition(client, entry.barber_id);
      const activeServingCount = await queueRepository.countActiveServingByBarber(client, entry.barber_id);
      const checkInStatus = activeServingCount === 0 ? 'serving' : 'waiting';
      if (checkInStatus === 'serving') {
        const scheduledStartAt = new Date(scheduledStart).toISOString();
        const conflicts = await queueRepository.findBarberIntervalConflictsForUpdate(
          client,
          entry.barber_id,
          Number(entry.branch_id || branchId),
          scheduledStartAt,
          Number(entry.duration_minutes) || 30,
          queueId,
        );
        if (conflicts.length > 0) {
          throw new AppError('The barber has an overlapping assignment. Please keep this reservation waiting or reassign it.', 409, true, {
            errorType: 'SlotConflict',
            conflictingQueueId: conflicts[0].id,
          });
        }
      }
      const checkInTimer = checkInStatus === 'serving' ? new Date().toISOString() : null;
      resetQueueMaintenanceDebounce(entry.barber_id);
      return queueRepository.checkInReservation(client, {
        queueId,
        status: checkInStatus,
        position,
        timerStartedAt: checkInTimer,
        scheduledStartAt: new Date(scheduledStart).toISOString(),
        arrivalDeadlineAt: new Date(arrivalDeadline).toISOString(),
      });
  }

  async markReservationNoShow(
    queueId: number,
    branchId?: number,
    userContext?: AuthoritativeUserContext,
  ): Promise<any> {
    return queueRepository.withTransaction(async (client) => {
      const entry = await queueRepository.findByIdForUpdate(client, queueId);
      if (!entry) throw new AppError('Reservation not found.', 404);
      if (userContext) {
        this.assertMutationAccess(userContext, entry, 'no-show');
      } else {
        this.assertLegacyBranchAccess(entry, branchId);
      }
      if (entry.status === 'no_show') return entry;
      if (!['pending', 'accepted', 'late'].includes(entry.status)) {
        throw new AppError(`Reservation cannot be marked no-show from status '${entry.status}'.`, 409);
      }

      const scheduledStart = entry.scheduled_start_at
        ? new Date(entry.scheduled_start_at).getTime()
        : reservationTimeToEpoch(entry.preferred_date, entry.preferred_time);

      if (scheduledStart !== null) {
        const now = Date.now();
        const targetBranchId = entry.branch_id || branchId;
        const isBypassed = await this.isTimeRestrictionBypassed(targetBranchId);
        const arrivalDeadline = entry.arrival_deadline_at
          ? new Date(entry.arrival_deadline_at).getTime()
          : scheduledStart + 10 * 60 * 1000;

        if (!isBypassed && now < arrivalDeadline) {
          const displayTime = entry.preferred_time || new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Manila',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          }).format(new Date(scheduledStart));
          throw new AppError(`Reservation can be marked no-show after the 10-minute arrival window (${displayTime}).`, 422);
        }
      }

      resetQueueMaintenanceDebounce(entry.barber_id);
      const res = await queueRepository.markReservationNoShow(client, queueId);
      realtimeBroadcastService.dispatchAppointmentChangeSafely({
        action: 'NO_SHOW',
        queueEntryId: queueId,
        status: 'NO_SHOW',
        customerId: entry.customer_id ?? null,
        barberId: entry.barber_id ?? null,
        branchId: entry.branch_id ?? branchId ?? null,
      });
      if (entry.group_booking_id) {
        const groupEntries = await queueRepository.findGroupQueueEntriesForUpdate(client, String(entry.group_booking_id));
        const hasUnsettled = groupEntries.some((e) => ['pending', 'accepted', 'late'].includes(e.status));
        if (!hasUnsettled) {
          await queueRepository.updateGroupBookingStatus(client, String(entry.group_booking_id), 'checked_in');
        }
      }
      return res;
    });
  }

  /**
   * Retrieves all active queue entries for a specific barber.
   * Cashier live queue results include confirmed scheduled reservations so staff
   * can see them immediately after acceptance, before customer check-in.
   */
  async getBarberQueue(
    barberId: number,
    branchId?: number,
    preferredDate?: string,
    userContext?: AuthoritativeUserContext,
  ): Promise<any[]> {
    const scopedBranchId = userContext
      ? await this.authorizeBarberLane(barberId, userContext)
      : branchId;

    await this.synchronizeScheduledReservations(barberId);
    await this.expireTimers(barberId);

    const effectiveDate = userContext?.role === UserRole.CUSTOMER
      ? (preferredDate || formatManilaDateFromTimestamp(new Date().toISOString()))
      : preferredDate;

    const entries = await queueRepository.findActiveByBarber(barberId, scopedBranchId, effectiveDate);

    return userContext?.role === UserRole.CUSTOMER
      ? QueuePolicy.sanitizeQueueListForCustomer(entries)
      : entries;
  }

  /**
   * Retrieves the customer's currently active queue entry.
   * Conditional: runs timer expiry only if the customer is being served.
   * 
   * @param customerId - The unique ID of the customer.
   * @returns The active queue entry or null if not found.
   */
  async getCustomerActiveQueue(customerId: number): Promise<any | null> {
    let entry = await queueRepository.findActiveByCustomer(customerId);
    if (!entry) return null;

    if (entry.barber_id) {
      await this.synchronizeScheduledReservations(entry.barber_id);
      entry = await queueRepository.findActiveByCustomer(customerId);
      if (!entry) return null;

      if (entry.status === 'serving') {
        const changed = await this.expireTimers(entry.barber_id);
        if (changed) {
          return queueRepository.findActiveByCustomer(customerId);
        }
      }
    }

    return entry;
  }

  /**
   * Advances the queue for a barber by completing the first entry.
   * Shifts everyone up and promotes the next person to 'serving'.
   * 
   * @param barberId - The ID of the barber whose queue should advance.
   * @returns The updated queue list for the barber.
   */
  async advanceQueue(
    barberId: number,
    userContext?: AuthoritativeUserContext,
  ): Promise<any[]> {
    const scopedBranchId = userContext
      ? await this.authorizeBarberLane(barberId, userContext)
      : undefined;

    // Never promote a reservation before its scheduled Manila time, including
    // rows created by older versions that were already waiting/serving.
    await this.synchronizeScheduledReservations(barberId);
    await queueRepository.completeFirstInQueue(barberId);
    await queueRepository.decrementPositionsAfter(barberId);
    await queueRepository.promoteNextToServing(barberId);

    // Reset maintenance debounce to allow fresh state monitoring
    resetQueueMaintenanceDebounce(barberId);

    const updatedQueue = await this.getBarberQueue(barberId, scopedBranchId, undefined, userContext);
    logger.info('[Queue] Queue advanced', {
      event: 'queue_advanced',
      barberId,
      remaining: updatedQueue.length,
    });
    return updatedQueue;
  }

  async declineReservation(
    queueId: number,
    branchId?: number,
    reason?: string,
    cancelType?: string,
    options?: { cashierName?: string; skipGroup?: boolean; preventPendingReservationDecision?: boolean }
  ): Promise<any> {
    const entry = await queueRepository.findById(queueId);
    if (entry?.group_booking_id && !options?.skipGroup) {
      const groupIds = await queueRepository.findGroupQueueEntryIds(String(entry.group_booking_id));
      const entries = [];
      for (const groupId of groupIds) {
        entries.push(await this.cancelReservation(groupId, branchId, reason, cancelType, { ...options, skipGroup: true }));
      }
      return { ...entries[0], groupBookingId: entry.group_booking_id, totalGuests: entries.length, entries };
    }
    return this.cancelReservation(queueId, branchId, reason, cancelType, options);
  }

  async cancelReservation(
    queueId: number,
    branchId?: number,
    reason?: string,
    cancelType?: string,
    options?: { cashierName?: string; skipGroup?: boolean; preventPendingReservationDecision?: boolean }
  ): Promise<any> {
    const entry = await queueRepository.findById(queueId);
    ensureQueueEntryFound(entry);

    if (branchId !== undefined && branchId !== null && entry!.branch_id !== branchId) {
      throw new AppError('Access denied for this branch.', 403);
    }

    if (options?.preventPendingReservationDecision && String(entry!.status).toLowerCase() === 'pending') {
      throw new AppError('This reservation is awaiting admin review.', 403);
    }

    if (!['pending', 'accepted', 'waiting'].includes(entry!.status)) {
      throw new AppError(`Reservation cannot be cancelled from status '${entry!.status}'.`, 409);
    }

    const resolvedCancelType = cancelType || (
      reason?.toLowerCase().includes('barber') || reason?.toLowerCase().includes('break') || reason?.toLowerCase().includes('early')
        ? 'barber_side'
        : 'customer_side'
    );

    const result = await queueRepository.updateStatus(
      queueId,
      'cancelled',
      reason || null,
      resolvedCancelType,
    );

    if (!result) {
      throw new AppError('Reservation was already processed.', 409);
    }

    const cancelledEntry = result;
    if (entry?.barber_id) {
      resetQueueMaintenanceDebounce(entry.barber_id);
    }
    await cacheQueueCancellation(queueId);
    await notificationService.notifyReservationDeclined(cancelledEntry, reason);

    // Asynchronously dispatch transactional decision email without blocking caller
    const decisionType = resolvedCancelType === 'customer_side' ? 'CANCELLED' : 'DECLINED';
    void dispatchReservationDecisionEmailSafely(queueId, decisionType, {
      cashierName: options?.cashierName || (resolvedCancelType === 'customer_side' ? 'Customer Portal' : 'Front Desk'),
      declineReason: reason,
    });

    realtimeBroadcastService.dispatchAppointmentChangeSafely({
      action: 'CANCELLED',
      queueEntryId: queueId,
      status: 'CANCELLED',
      customerId: entry?.customer_id ?? null,
      barberId: entry?.barber_id ?? null,
      branchId: entry?.branch_id ?? branchId ?? null,
    });

    logger.info('[Queue] Reservation cancelled or declined', {
      event: 'reservation_cancelled',
      queueId,
      cancelType: resolvedCancelType,
      status: cancelledEntry?.status,
    });
    return cancelledEntry;
  }

  /**
   * Cancels a specific queue entry and recalculates positions for the remaining list.
   * Synchronizes side effects via Redis cancellation caching.
   * 
   * @param queueId - The ID of the entry to cancel.
   * @returns The updated queue list for the affected barber.
   * @throws Error if the queue entry is not found.
   */
  async cancelQueue(
    queueId: number,
    customerId?: number,
    reason?: string,
    userContext?: AuthoritativeUserContext,
    options?: { allowInService?: boolean },
  ): Promise<any[]> {
    const entry = await queueRepository.findBarberAndPosition(queueId);
    ensureQueueEntryFound(entry);

    if (!userContext) {
      throw new AppError('Queue authorization context is required.', 403);
    }

    this.assertMutationAccess(userContext, entry!, 'cancel');

    const groupBookingId = (entry as any).group_booking_id;
    if (groupBookingId) {
      const group = await queueRepository.findGroupBooking(String(groupBookingId));
      if (String(group?.status || '').toLowerCase() === 'checked_in') {
        throw new AppError('This group booking has already started check-in and cannot be cancelled.', 409);
      }
    }

    const isCustomerCancellation = userContext.role === UserRole.CUSTOMER;
    const actingCustomerId = isCustomerCancellation ? userContext.customerId ?? undefined : undefined;
    if (isCustomerCancellation && customerId !== undefined && customerId !== actingCustomerId) {
      throw new AppError('You can only cancel your own reservation.', 403);
    }

    if (isCustomerCancellation) {
      const scheduledStart = entry!.scheduled_start_at
        ? new Date(entry!.scheduled_start_at).getTime()
        : reservationTimeToEpoch(entry!.preferred_date, entry!.preferred_time);

      if (scheduledStart === null || !Number.isFinite(scheduledStart)) {
        throw new AppError('Reservation has no valid scheduled time.', 400);
      }

      if (scheduledStart - Date.now() < CUSTOMER_CANCELLATION_NOTICE_MS) {
        throw new AppError('Appointments cannot be cancelled less than 24 hours in advance.', 400);
      }
    }

    if (entry!.status === 'completed' || (entry!.status === 'serving' && !options?.allowInService)) {
      throw new AppError('Checked-in or in-service reservations cannot be cancelled.', 409);
    }

    const { barber_id: barberId, position: cancelledPosition } = entry!;

    const cancelledEntry = await queueRepository.updateStatus(
      queueId,
      'cancelled',
      isCustomerCancellation ? (reason?.trim() || null) : undefined,
      isCustomerCancellation ? 'customer_side' : undefined,
      isCustomerCancellation ? 'retained' : undefined,
    );

    if (barberId && cancelledPosition > 0) {
      await queueRepository.decrementPositionsAfter(barberId, cancelledPosition);

      if (cancelledPosition === 1) {
        await queueRepository.promoteNextToServing(barberId);
      }
    }

    // Side-Effect: Cache in Redis via worker to prevent ghost state
    await cacheQueueCancellation(queueId);

    if (isCustomerCancellation) {
      await notificationService.notifyCashierOfCustomerCancellation({
        ...entry!,
        ...cancelledEntry,
        cancel_reason: reason?.trim() || null,
        cancel_type: 'customer_side',
      });

      // Asynchronously dispatch transactional cancellation email to customer
      void dispatchReservationDecisionEmailSafely(queueId, 'CANCELLED', {
        cashierName: 'Customer Portal',
        declineReason: reason?.trim() || null,
      });
    } else if (entry?.customer_id) {
      await notificationService.notifyReservationDeclined(
        {
          ...entry!,
          ...cancelledEntry,
          cancel_reason: reason?.trim() || null,
          cancel_type: 'staff_side',
        },
        reason?.trim() || 'Cancelled by front desk'
      );

      void dispatchReservationDecisionEmailSafely(queueId, 'CANCELLED', {
        cashierName: options?.allowInService ? 'Front Desk' : 'Front Desk',
        declineReason: reason?.trim() || 'Cancelled by front desk',
      });
    }

    if (barberId) {
      resetQueueMaintenanceDebounce(barberId);
      const remaining = isCustomerCancellation
        ? []
        : await this.getBarberQueue(
          barberId,
          userContext.branchId ?? entry!.branch_id ?? undefined,
          undefined,
          userContext,
        );
      realtimeBroadcastService.dispatchAppointmentChangeSafely({
        action: 'CANCELLED',
        queueEntryId: queueId,
        status: 'CANCELLED',
        customerId: entry?.customer_id ?? customerId ?? null,
        barberId: barberId ?? null,
        branchId: userContext.branchId ?? entry!.branch_id ?? null,
      });
      logger.info('[Queue] Queue cancellation completed', {
        event: 'queue_cancelled',
        queueId,
        barberId,
        remaining: remaining.length,
      });
      return remaining;
    }

    realtimeBroadcastService.dispatchAppointmentChangeSafely({
      action: 'CANCELLED',
      queueEntryId: queueId,
      status: 'CANCELLED',
      customerId: entry?.customer_id ?? customerId ?? null,
      barberId: null,
      branchId: userContext?.branchId ?? entry?.branch_id ?? null,
    });
    return [];
  }

  /**
   * Marks a queue entry (typically a walk-in or completed service) as finished.
   * 
   * @param orderId - The unique ID of the queue entry to finish.
   * @returns The updated queue entry object.
   */
  async finishOrder(
    orderId: number,
    branchId?: number,
    specsOrContext?: {
      base_style?: string | null;
      haircut_length?: string | null;
      accent_style?: string | null;
      specs_notes?: string | null;
      custom_specification?: string | null;
      haircut_photo_url?: string | null;
    } | AuthoritativeUserContext,
    userContext?: AuthoritativeUserContext,
  ): Promise<any> {
    const isUserContext = specsOrContext && 'role' in specsOrContext;
    const effectiveUserContext = isUserContext ? (specsOrContext as AuthoritativeUserContext) : userContext;
    const rawSpecs = isUserContext ? undefined : (specsOrContext as any);
    const specs = rawSpecs
      ? {
          ...rawSpecs,
          specs_notes: rawSpecs.specs_notes,
          custom_specification: rawSpecs.custom_specification?.trim()
            ? rawSpecs.custom_specification.trim().slice(0, 100)
            : null,
        }
      : undefined;

    const entry = await queueRepository.findById(orderId);
    ensureQueueEntryFound(entry);
    if (effectiveUserContext) {
      this.assertMutationAccess(effectiveUserContext, entry!, 'complete');
    } else {
      this.assertLegacyBranchAccess(entry!, branchId);
    }
    const bypassWaitingCompletion = entry!.status === 'waiting'
      && await this.isTimeRestrictionBypassed(entry!.branch_id ?? branchId);
    if (entry!.status !== 'serving' && !bypassWaitingCompletion) {
      throw new AppError(`Queue entry cannot be completed from status '${entry!.status}'.`, 409);
    }

    if (entry!.status === 'serving' && typeof (queueRepository as any).preserveBreakDelayForFollowingEntries === 'function') {
      await (queueRepository as any).preserveBreakDelayForFollowingEntries(orderId);
    }

    const finished = typeof (queueRepository as any).completeEntry === 'function'
      ? await (queueRepository as any).completeEntry(orderId, specs)
      : await queueRepository.updateStatus(orderId, 'completed');
    if (entry!.position > 0) {
      await queueRepository.decrementPositionsAfter(entry!.barber_id, entry!.position);
      if (entry!.position === 1 && entry!.status === 'serving') {
        await queueRepository.promoteNextToServing(entry!.barber_id);
      }
    }
    if (entry!.barber_id) {
      resetQueueMaintenanceDebounce(entry!.barber_id);
      void barberService.invalidateBarberCache(entry.barber_id);
    }
    realtimeBroadcastService.dispatchAppointmentChangeSafely({
      action: 'COMPLETED',
      queueEntryId: orderId,
      status: 'COMPLETED',
      customerId: entry?.customer_id ?? null,
      barberId: entry?.barber_id ?? null,
      branchId: entry?.branch_id ?? branchId ?? null,
    });
    logger.info('[Queue] Queue entry finished', {
      event: 'queue_entry_finished',
      queueId: orderId,
      barberId: entry!.barber_id,
      status: finished?.status ?? 'completed',
    });
    return finished;
  }

  async editOfflineWalkIn(
    orderId: number,
    input: {
      idempotencyKey: string;
      expectedBarberId: number;
      expectedServiceIds: number[];
      barberId?: number;
      serviceIds?: number[];
      serviceSnapshot?: Array<{ serviceId: number; name: string; price: number; durationMinutes: number }>;
    },
    userContext: AuthoritativeUserContext,
  ): Promise<any> {
    const { idempotencyKey, expectedBarberId, expectedServiceIds } = input;
    const validateIds = (ids: number[]) => Array.isArray(ids)
      && ids.length > 0
      && ids.length <= 20
      && ids.every((id) => Number.isSafeInteger(id) && id > 0)
      && new Set(ids).size === ids.length;
    if (!idempotencyKey || idempotencyKey.length < 12 || idempotencyKey.length > 160
      || !Number.isSafeInteger(expectedBarberId) || expectedBarberId < 1
      || !validateIds(expectedServiceIds)
      || (input.barberId !== undefined && (!Number.isSafeInteger(input.barberId) || input.barberId < 1))
      || (input.serviceIds !== undefined && !validateIds(input.serviceIds))) {
      throw new AppError('The offline walk-in edit is invalid.', 400);
    }
    if (input.serviceIds && (!Array.isArray(input.serviceSnapshot)
      || input.serviceSnapshot.length !== input.serviceIds.length
      || input.serviceSnapshot.some((service, index) => (
        service.serviceId !== input.serviceIds?.[index]
        || !service.name.trim()
        || !Number.isFinite(service.price)
        || service.price < 0
        || !Number.isFinite(service.durationMinutes)
        || service.durationMinutes < 1
      )))) {
      throw new AppError('The offline service snapshot is invalid.', 400);
    }
    const canonicalRequest = {
      expectedBarberId,
      expectedServiceIds: [...expectedServiceIds].sort((a, b) => a - b),
      barberId: input.barberId ?? null,
      serviceIds: input.serviceIds ?? null,
      serviceSnapshot: input.serviceSnapshot ?? null,
    };
    if (input.barberId === expectedBarberId
      && (!input.serviceIds || [...input.serviceIds].sort((a, b) => a - b).join(',')
        === [...expectedServiceIds].sort((a, b) => a - b).join(','))) {
      throw new AppError('The offline edit does not contain a change.', 400);
    }
    const requestHash = createHash('sha256').update(JSON.stringify(canonicalRequest)).digest('hex');
    const initial = await queueRepository.findById(orderId);
    ensureQueueEntryFound(initial);
    this.assertMutationAccess(userContext, initial!, 'edit-order');
    const branchId = Number(initial!.branch_id);
    if (!Number.isSafeInteger(branchId) || branchId < 1) throw new AppError('The walk-in has no valid branch.', 409);
    const targetBarberId = input.barberId ?? expectedBarberId;
    const barberIds = Array.from(new Set([expectedBarberId, targetBarberId])).sort((a, b) => a - b);

    let replayed = false;
    const updated = await queueRepository.withTransaction(async (client) => {
      const replay = await queueRepository.claimCashierOfflineQueueOperation(client, {
        idempotencyKey,
        queueEntryId: orderId,
        branchId,
        cashierId: userContext.userId ? String(userContext.userId) : null,
        operationType: 'edit',
        requestHash,
      });
      if (replay) {
        replayed = true;
        return replay;
      }

      for (const barberId of barberIds) await queueRepository.lockBarber(client, barberId);
      const entry = await queueRepository.findByIdForUpdate(client, orderId);
      ensureQueueEntryFound(entry);
      this.assertMutationAccess(userContext, entry!, 'edit-order');
      if (Number(entry!.branch_id) !== branchId || entry!.is_walk_in !== true) {
        throw new AppError('Only this branch’s cashier walk-ins can be edited offline.', 409);
      }
      if (Number(entry!.barber_id) !== expectedBarberId) {
        throw new AppError('The barber assignment changed while this walk-in was offline. Review it before retrying.', 409);
      }
      const currentServiceIds = await queueRepository.findQueueServiceIdsForUpdate(client, orderId);
      const sortedExpected = [...expectedServiceIds].sort((a, b) => a - b);
      if (currentServiceIds.length !== sortedExpected.length
        || [...currentServiceIds].sort((a, b) => a - b).some((id, index) => id !== sortedExpected[index])) {
        throw new AppError('The services changed on another terminal. Review this walk-in before retrying.', 409);
      }
      const serviceChanged = Boolean(input.serviceIds && (
        input.serviceIds.length !== currentServiceIds.length
        || [...input.serviceIds].sort((a, b) => a - b).some((id, index) => id !== [...currentServiceIds].sort((a, b) => a - b)[index])
      ));
      const barberChanged = targetBarberId !== expectedBarberId;
      if (!serviceChanged && !barberChanged) {
        throw new AppError('The offline edit does not contain a change.', 409);
      }

      const isPaid = String(entry!.payment_status).toLowerCase() === 'paid';
      if (isPaid) {
        if (serviceChanged || !barberChanged || entry!.status !== 'completed') {
          throw new AppError('Paid walk-ins allow only a barber reassignment; the service and receipt are locked.', 409);
        }
        if (!await queueRepository.isActiveBarberAtBranchForUpdate(client, targetBarberId, branchId)) {
          throw new AppError('The selected barber is no longer active at this branch.', 409);
        }
        const paidUpdate = await queueRepository.reassignPaidOfflineQueueBarber(client, orderId, targetBarberId);
        if (!paidUpdate) throw new AppError('The walk-in could not be reassigned.', 409);
        const response = { ...paidUpdate, service_ids: currentServiceIds };
        await queueRepository.saveCashierOfflineQueueOperationResponse(client, idempotencyKey, response);
        return response;
      }

      if (!['waiting', 'serving'].includes(String(entry!.status))
        || entry!.offline_service_started_idempotency_key) {
        throw new AppError('Service and barber changes are allowed only before the service starts.', 409);
      }
      if (serviceChanged && entry!.status !== 'waiting') {
        throw new AppError('Service changes are allowed only while the walk-in is queued.', 409);
      }
      if (barberChanged && !await queueRepository.isActiveBarberAtBranchForUpdate(client, targetBarberId, branchId)) {
        throw new AppError('The selected barber is no longer active at this branch.', 409);
      }

      let workingEntry = entry!;
      if (barberChanged) {
        const targetPosition = await queueRepository.getNextPosition(client, targetBarberId);
        const moved = await queueRepository.reassignOfflineQueueBarber(client, orderId, targetBarberId, targetPosition);
        if (!moved) throw new AppError('The walk-in could not be reassigned.', 409);
        await queueRepository.rebalanceLiveQueue(client, expectedBarberId);
        await queueRepository.promoteEligibleFirst(client, expectedBarberId);
        await queueRepository.rebalanceLiveQueue(client, targetBarberId);
        await queueRepository.promoteEligibleFirst(client, targetBarberId);
        workingEntry = (await queueRepository.findByIdForUpdate(client, orderId)) || moved;
      }

      let resolvedServices: any[] = [];
      let durationMinutes = Number(workingEntry.duration_minutes) || 30;
      if (serviceChanged && input.serviceIds && input.serviceSnapshot) {
        resolvedServices = await serviceRepository.findByIdsForUpdate(client, input.serviceIds);
        if (resolvedServices.length !== input.serviceIds.length) {
          throw new AppError('One or more selected services are no longer available. Review this walk-in online.', 409);
        }
        const conflict = validateServiceCombo(resolvedServices);
        if (conflict) throw new AppError(conflict.reason, 409);
        for (let index = 0; index < resolvedServices.length; index += 1) {
          const service = resolvedServices[index];
          const cached = input.serviceSnapshot[index];
          const currentPrice = Number(service.price);
          const currentDuration = Number(service.duration_minutes) || 30;
          if (Number(cached.serviceId) !== Number(service.service_id)
            || cached.name.trim() !== String(service.title || '').trim()
            || Math.round(Number(cached.price) * 100) !== Math.round(currentPrice * 100)
            || Number(cached.durationMinutes) !== currentDuration) {
            throw new AppError('A service price or duration changed while this walk-in was offline. Review the order online.', 409);
          }
        }
        durationMinutes = resolvedServices.reduce((total, service) => total + (Number(service.duration_minutes) || 30), 0);
      }
      if (serviceChanged || barberChanged) {
        const targetServiceIds = serviceChanged && input.serviceIds ? input.serviceIds : currentServiceIds;
        const impact = await this.analyzeOrderImpact(client, workingEntry, targetServiceIds, durationMinutes);
        if (impact.preview.impacts.length > 0) {
          throw new AppError('This edit affects a reservation. Reconnect and review the schedule before saving.', 409);
        }
        await queueRepository.updateReservationScheduleEstimates(client, impact.scheduleUpdates.map((update) => ({
          queueId: Number(update.reservation.id),
          estimatedStartAt: update.estimatedStartAt,
          delayMinutes: update.delayMinutes,
          ...(update.delayMinutes <= SCHEDULE_DELAY_THRESHOLD_MINUTES
            ? { scheduleAdjustmentStatus: 'none' as const }
            : {}),
        })));
      }

      let responseEntry = workingEntry;
      if (serviceChanged && input.serviceIds) {
        responseEntry = await queueRepository.updateOfflineQueueServices(client, orderId, input.serviceIds, durationMinutes) || workingEntry;
      }
      responseEntry = { ...responseEntry, service_ids: serviceChanged ? input.serviceIds : currentServiceIds };
      await queueRepository.saveCashierOfflineQueueOperationResponse(client, idempotencyKey, responseEntry);
      return responseEntry;
    });

    if (!replayed) {
      for (const barberId of barberIds) {
        resetQueueMaintenanceDebounce(barberId);
        void barberService.invalidateBarberCache(barberId);
      }
      realtimeBroadcastService.dispatchAppointmentChangeSafely({
        action: 'STATUS_CHANGED',
        queueEntryId: orderId,
        status: updated.status,
        customerId: updated.customer_id ?? null,
        barberId: updated.barber_id ?? null,
        branchId,
      });
    }
    return updated;
  }

  async cancelOfflineWalkIn(
    orderId: number,
    idempotencyKey: string,
    expectedBarberId: number,
    userContext: AuthoritativeUserContext,
  ): Promise<any> {
    if (!idempotencyKey || idempotencyKey.length < 12 || idempotencyKey.length > 160
      || !Number.isSafeInteger(expectedBarberId) || expectedBarberId < 1) {
      throw new AppError('The offline cancellation is invalid.', 400);
    }
    const requestHash = createHash('sha256').update(JSON.stringify({ expectedBarberId })).digest('hex');
    const initial = await queueRepository.findById(orderId);
    ensureQueueEntryFound(initial);
    this.assertMutationAccess(userContext, initial!, 'cancel');
    const branchId = Number(initial!.branch_id);
    let replayed = false;
    const cancelled = await queueRepository.withTransaction(async (client) => {
      const replay = await queueRepository.claimCashierOfflineQueueOperation(client, {
        idempotencyKey,
        queueEntryId: orderId,
        branchId,
        cashierId: userContext.userId ? String(userContext.userId) : null,
        operationType: 'cancel',
        requestHash,
      });
      if (replay) {
        replayed = true;
        return replay;
      }

      await queueRepository.lockBarber(client, expectedBarberId);
      const entry = await queueRepository.findByIdForUpdate(client, orderId);
      ensureQueueEntryFound(entry);
      this.assertMutationAccess(userContext, entry!, 'cancel');
      if (Number(entry!.branch_id) !== branchId || entry!.is_walk_in !== true) {
        throw new AppError('Only this branch’s cashier walk-ins can be cancelled offline.', 409);
      }
      if (Number(entry!.barber_id) !== expectedBarberId) {
        throw new AppError('The barber assignment changed while this walk-in was offline. Review it before retrying.', 409);
      }
      if (entry!.payment_status === 'paid' || !['waiting', 'serving'].includes(String(entry!.status))
        || entry!.offline_service_started_idempotency_key) {
        throw new AppError('Only queued unpaid walk-ins can be cancelled offline.', 409);
      }
      const response = await queueRepository.cancelOfflineQueueEntry(client, orderId);
      if (!response) throw new AppError('The walk-in could not be cancelled.', 409);
      await queueRepository.rebalanceLiveQueue(client, expectedBarberId);
      await queueRepository.promoteEligibleFirst(client, expectedBarberId);
      const result = { ...(await queueRepository.findByIdForUpdate(client, orderId) || response) };
      await queueRepository.saveCashierOfflineQueueOperationResponse(client, idempotencyKey, result);
      return result;
    });
    if (!replayed) {
      resetQueueMaintenanceDebounce(expectedBarberId);
      void barberService.invalidateBarberCache(expectedBarberId);
      realtimeBroadcastService.dispatchAppointmentChangeSafely({
        action: 'STATUS_CHANGED',
        queueEntryId: orderId,
        status: 'cancelled',
        customerId: cancelled.customer_id ?? null,
        barberId: expectedBarberId,
        branchId,
      });
    }
    return cancelled;
  }

  async recordOfflineServiceStart(
    orderId: number,
    idempotencyKey: string,
    userContext: AuthoritativeUserContext,
  ): Promise<any> {
    if (!idempotencyKey || idempotencyKey.length < 12 || idempotencyKey.length > 160) {
      throw new AppError('A valid offline service-start idempotency key is required.', 400);
    }
    const entry = await queueRepository.findById(orderId);
    ensureQueueEntryFound(entry);
    this.assertMutationAccess(userContext, entry!, 'complete');
    return queueRepository.recordOfflineServiceStart(orderId, userContext.branchId ?? undefined, idempotencyKey);
  }

  async completeOfflineService(
    orderId: number,
    idempotencyKey: string,
    userContext: AuthoritativeUserContext,
  ): Promise<any> {
    if (!idempotencyKey || idempotencyKey.length < 12 || idempotencyKey.length > 160) {
      throw new AppError('A valid offline service-completion idempotency key is required.', 400);
    }
    const entry = await queueRepository.findById(orderId);
    ensureQueueEntryFound(entry);
    this.assertMutationAccess(userContext, entry!, 'complete');
    const completed = await queueRepository.completeOfflineService(
      orderId,
      userContext.branchId ?? undefined,
      idempotencyKey,
    );
    const barberId = Number(completed?.barber_id || entry!.barber_id);
    if (Number.isSafeInteger(barberId) && barberId > 0) {
      resetQueueMaintenanceDebounce(barberId);
      void barberService.invalidateBarberCache(barberId);
    }
    realtimeBroadcastService.dispatchAppointmentChangeSafely({
      action: 'COMPLETED',
      queueEntryId: orderId,
      status: 'COMPLETED',
      customerId: completed?.customer_id ?? entry?.customer_id ?? null,
      barberId: completed?.barber_id ?? entry?.barber_id ?? null,
      branchId: completed?.branch_id ?? entry?.branch_id ?? userContext.branchId ?? null,
    });
    return completed;
  }

  private async resolveOrderServices(serviceIds: number[]): Promise<{ services: any[]; durationMinutes: number }> {
    if (!Array.isArray(serviceIds) || serviceIds.length === 0 || serviceIds.length > 20
      || serviceIds.some((id) => !Number.isSafeInteger(id) || id < 1)
      || new Set(serviceIds).size !== serviceIds.length) {
      throw new AppError('At least one unique valid service is required.', 400);
    }

    const services = await serviceRepository.findByIds(serviceIds);
    if (services.length !== serviceIds.length) {
      throw new AppError('One or more selected services are unavailable.', 400);
    }
    const durationMinutes = services.reduce(
      (total, service) => total + (Number(service.duration_minutes) || 30),
      0,
    );
    return { services, durationMinutes: Math.max(1, durationMinutes) };
  }

  private async analyzeOrderImpact(
    client: any,
    entry: any,
    serviceIds: number[],
    proposedDurationMinutes: number,
  ): Promise<OrderImpactAnalysis> {
    const queueId = Number(entry.id);
    const barberId = Number(entry.barber_id);
    const branchId = Number(entry.branch_id);
    if (!Number.isInteger(branchId) || branchId <= 0) {
      throw new AppError('The queue entry has no valid branch assignment.', 409);
    }
    const activeEntries = await queueRepository.findActiveEntriesForScheduleForUpdate(
      client,
      barberId,
      branchId,
    );
    const target = activeEntries.find((candidate) => Number(candidate.id) === queueId) || entry;
    const existingDurationMinutes = minutesForQueueEntry(target);
    const nowRounded = ceilToMinute(Date.now());

    const projectedCompletionForDuration = (targetDurationMinutes: number): string => {
      if (String(target.status) === 'serving') {
        let startedAt = target.service_started_at || target.timer_started_at;
        let startEpoch = startedAt ? new Date(startedAt).getTime() : Number.NaN;
        if (!Number.isFinite(startEpoch) && target.service_ends_at) {
          const storedEnd = new Date(target.service_ends_at).getTime();
          if (Number.isFinite(storedEnd)) startEpoch = storedEnd - existingDurationMinutes * 60_000;
        }
        if (!Number.isFinite(startEpoch)) startEpoch = nowRounded;
        return new Date(Math.max(nowRounded, startEpoch + targetDurationMinutes * 60_000)).toISOString();
      }

      const orderedEntries = [...activeEntries].sort((left, right) =>
        Number(left.position || 0) - Number(right.position || 0) || Number(left.id) - Number(right.id),
      );
      const targetIndex = orderedEntries.findIndex((candidate) => Number(candidate.id) === queueId);
      const precedingEntries = targetIndex >= 0
        ? orderedEntries.slice(0, targetIndex)
        : orderedEntries.filter((candidate) =>
          String(candidate.status) === 'waiting'
          && (Number(candidate.position || 0) < Number(target.position || 0)
            || (Number(candidate.position || 0) === Number(target.position || 0) && Number(candidate.id) < queueId)),
        );
      const serving = precedingEntries.find((candidate) => String(candidate.status) === 'serving')
        || orderedEntries.find((candidate) => String(candidate.status) === 'serving');
      let cursor = nowRounded;
      if (serving) {
        const startedAt = serving.service_started_at || serving.timer_started_at;
        let startEpoch = startedAt ? new Date(startedAt).getTime() : Number.NaN;
        const servingDurationMinutes = minutesForQueueEntry(serving);
        if (!Number.isFinite(startEpoch) && serving.service_ends_at) {
          const storedEnd = new Date(serving.service_ends_at).getTime();
          if (Number.isFinite(storedEnd)) startEpoch = storedEnd - servingDurationMinutes * 60_000;
        }
        cursor = Number.isFinite(startEpoch)
          ? Math.max(nowRounded, startEpoch + servingDurationMinutes * 60_000)
          : nowRounded;
      }
      for (const preceding of precedingEntries) {
        if (String(preceding.status) === 'waiting') {
          cursor += minutesForQueueEntry(preceding) * 60_000;
        }
      }
      return new Date(cursor + targetDurationMinutes * 60_000).toISOString();
    };

    const baselineCompletionAt = projectedCompletionForDuration(existingDurationMinutes);
    const projectedCompletionAt = projectedCompletionForDuration(proposedDurationMinutes);
    const reservations = await queueRepository.findFutureReservationsForSchedule(
      client,
      barberId,
      branchId,
      queueId,
    );
    const scheduleInputs = reservations.map((reservation) => ({
      id: Number(reservation.id),
      scheduledStartAt: reservation.scheduled_start_at,
      durationMinutes: reservation.duration_minutes,
    }));
    const baselineEstimates = calculateScheduleEstimates(baselineCompletionAt, scheduleInputs);
    const revisedEstimates = calculateScheduleEstimates(projectedCompletionAt, scheduleInputs);
    const baselineById = new Map(baselineEstimates.map((estimate) => [estimate.id, estimate]));
    const revisedById = new Map(revisedEstimates.map((estimate) => [estimate.id, estimate]));
    const scheduleUpdates: OrderImpactAnalysis['scheduleUpdates'] = [];
    const impacts: ReservationImpactPreview['impacts'] = [];

    for (const reservation of reservations) {
      const queueEntryId = Number(reservation.id);
      const revised = revisedById.get(queueEntryId);
      if (!revised || !reservation.scheduled_start_at) continue;
      const baselineDelayMinutes = baselineById.get(queueEntryId)?.delayMinutes || 0;
      const addedDelayMinutes = Math.max(0, revised.delayMinutes - baselineDelayMinutes);
      scheduleUpdates.push({ reservation, estimatedStartAt: revised.estimatedStartAt, delayMinutes: revised.delayMinutes, addedDelayMinutes });
      if (addedDelayMinutes <= 0) continue;
      impacts.push({
        queueEntryId,
        customerName: String(reservation.customer_name || 'Customer'),
        scheduledStartAt: normalizeImpactTimestamp(reservation.scheduled_start_at),
        estimatedStartAt: revised.estimatedStartAt,
        delayMinutes: revised.delayMinutes,
        addedDelayMinutes,
      });
    }

    const fingerprintSnapshot = {
      queueId,
      barberId,
      branchId,
      status: String(entry.status),
      serviceIds,
      existingDurationMinutes,
      proposedDurationMinutes,
      baselineCompletionAt,
      projectedCompletionAt,
      activeEntries: activeEntries.map((candidate) => ({
        id: Number(candidate.id),
        position: Number(candidate.position || 0),
        status: String(candidate.status),
        durationMinutes: minutesForQueueEntry(candidate),
        serviceStartedAt: candidate.service_started_at ? normalizeImpactTimestamp(candidate.service_started_at) : null,
        timerStartedAt: candidate.timer_started_at ? normalizeImpactTimestamp(candidate.timer_started_at) : null,
        serviceEndsAt: candidate.service_ends_at ? normalizeImpactTimestamp(candidate.service_ends_at) : null,
      })),
      reservations: scheduleUpdates.map(({ reservation, estimatedStartAt, delayMinutes, addedDelayMinutes }) => ({
        id: Number(reservation.id),
        status: String(reservation.status || ''),
        scheduledStartAt: normalizeImpactTimestamp(reservation.scheduled_start_at),
        existingEstimatedStartAt: reservation.estimated_start_at
          ? normalizeImpactTimestamp(reservation.estimated_start_at)
          : null,
        existingDelayMinutes: Number(reservation.schedule_delay_minutes || 0),
        durationMinutes: Number(reservation.duration_minutes) || 30,
        estimatedStartAt,
        delayMinutes,
        addedDelayMinutes,
      })),
    };

    return {
      preview: {
        previewFingerprint: createHash('sha256').update(JSON.stringify(fingerprintSnapshot)).digest('hex'),
        projectedCompletionAt,
        impacts,
      },
      existingDurationMinutes,
      scheduleUpdates,
    };
  }

  async previewOrderImpact(
    queueId: number,
    serviceIds: number[],
    userContext: AuthoritativeUserContext,
  ): Promise<ReservationImpactPreview> {
    const { durationMinutes } = await this.resolveOrderServices(serviceIds);
    const initialEntry = await queueRepository.findById(queueId);
    if (!initialEntry) throw new AppError('Queue entry not found.', 404);
    const barberId = Number(initialEntry.barber_id);
    if (!Number.isInteger(barberId) || barberId <= 0) {
      throw new AppError('The queue entry has no valid barber assignment.', 409);
    }

    const lockResult = await acquireBarberLock(barberId);
    ensureBarberLockAcquired(lockResult, 'The barber queue is busy. Please retry in a moment.');
    try {
      return await queueRepository.withTransaction(async (client) => {
        const entry = await queueRepository.findByIdForUpdate(client, queueId);
        if (!entry) throw new AppError('Queue entry not found.', 404);
        this.assertMutationAccess(userContext, entry, 'edit-order');
        if (!['waiting', 'serving'].includes(String(entry.status)) || entry.payment_status === 'paid') {
          throw new AppError('Only active unpaid queue orders can be modified.', 409);
        }
        if (Number(entry.barber_id) !== barberId) {
          throw new AppError('The barber assignment changed. Please retry the preview.', 409, true, { errorType: 'RaceCondition' });
        }
        return (await this.analyzeOrderImpact(client, entry, serviceIds, durationMinutes)).preview;
      });
    } finally {
      await releaseBarberLock(barberId);
    }
  }

  async updateQueueIdentity(queueId: number, customerName: string, barberId: number, userContext: AuthoritativeUserContext): Promise<any> {
    const normalizedName = String(customerName || '').trim();
    if (normalizedName.length < 2 || normalizedName.length > 100) throw new AppError('Customer name must be 2-100 characters.', 400);
    if (!Number.isInteger(barberId) || barberId <= 0) throw new AppError('A valid barber is required.', 400);
    const initial = await queueRepository.findById(queueId);
    if (!initial) throw new AppError('Queue entry not found.', 404);
    this.assertMutationAccess(userContext, initial, 'edit-order');
    if (!['waiting', 'serving'].includes(String(initial.status)) || initial.payment_status === 'paid') {
      throw new AppError('Only active unpaid queue customers can be edited.', 409);
    }

    const oldBarberId = Number(initial.barber_id);
    if (oldBarberId === barberId) {
      return queueRepository.withTransaction(async (client) => {
        const entry = await queueRepository.findByIdForUpdate(client, queueId);
        if (!entry) throw new AppError('Queue entry not found.', 404);
        this.assertMutationAccess(userContext, entry, 'edit-order');
        if (!['waiting', 'serving'].includes(String(entry.status)) || entry.payment_status === 'paid') {
          throw new AppError('Only active unpaid queue customers can be edited.', 409);
        }
        if (Number(entry.barber_id) !== oldBarberId) {
          throw new AppError('The barber assignment changed. Please retry.', 409, true, { errorType: 'RaceCondition' });
        }
        const barber = await client.query('SELECT barber_id FROM barbers WHERE barber_id = $1 AND is_active = TRUE', [barberId]);
        if (barber.rowCount !== 1) throw new AppError('Selected barber is not active.', 409);
        return queueRepository.updateQueueIdentity(client, queueId, normalizedName, barberId, Number(entry.position) || 1);
      });
    }

    const barberIds = Array.from(new Set([oldBarberId, barberId])).sort((a, b) => a - b);
    const acquired: number[] = [];
    try {
      for (const id of barberIds) {
        ensureBarberLockAcquired(await acquireBarberLock(id), 'The barber queue is busy. Please retry in a moment.');
        acquired.push(id);
      }

      const movedEntry = await queueRepository.withTransaction(async (client) => {
        for (const id of barberIds) await queueRepository.lockBarber(client, id);
        const entry = await queueRepository.findByIdForUpdate(client, queueId);
        if (!entry) throw new AppError('Queue entry not found.', 404);
        this.assertMutationAccess(userContext, entry, 'edit-order');
        if (!['waiting', 'serving'].includes(String(entry.status)) || entry.payment_status === 'paid') {
          throw new AppError('Only active unpaid queue customers can be edited.', 409);
        }
        if (Number(entry.barber_id) !== oldBarberId) {
          throw new AppError('The barber assignment changed. Please retry.', 409, true, { errorType: 'RaceCondition' });
        }
        const barber = await client.query('SELECT barber_id FROM barbers WHERE barber_id = $1 AND is_active = TRUE', [barberId]);
        if (barber.rowCount !== 1) throw new AppError('Selected barber is not active.', 409);

        const lastPosition = await queueRepository.getNextPosition(client, barberId);
        const updated = await queueRepository.updateQueueIdentity(client, queueId, normalizedName, barberId, lastPosition);
        await queueRepository.rebalanceLiveQueue(client, oldBarberId);
        await queueRepository.promoteEligibleFirst(client, oldBarberId);
        await queueRepository.rebalanceLiveQueue(client, barberId);
        await queueRepository.promoteEligibleFirst(client, barberId);
        return (await queueRepository.findByIdForUpdate(client, queueId)) || updated;
      });

      for (const id of barberIds) resetQueueMaintenanceDebounce(id);
      realtimeBroadcastService.dispatchAppointmentChangeSafely({
        action: 'STATUS_CHANGED',
        queueEntryId: queueId,
        status: movedEntry.status,
        customerId: movedEntry.customer_id ?? null,
        barberId,
        branchId: movedEntry.branch_id ?? null,
      });
      return movedEntry;
    } finally {
      for (const id of acquired.reverse()) await releaseBarberLock(id);
    }
  }

  async updateReservationBarber(queueId: number, barberId: number, userContext: AuthoritativeUserContext): Promise<any> {
    if (!Number.isInteger(barberId) || barberId <= 0) throw new AppError('A valid barber is required.', 400);
    const initial = await queueRepository.findById(queueId);
    if (!initial) throw new AppError('Reservation not found.', 404);
    this.assertMutationAccess(userContext, initial, 'edit-order');
    if (initial.is_walk_in || !['pending', 'accepted', 'late'].includes(String(initial.status))) {
      throw new AppError('Only upcoming reservations can be reassigned.', 409);
    }
    if (Number(initial.barber_id) === barberId) return initial;
    const oldBarberId = Number(initial.barber_id);
    const locks = Array.from(new Set([oldBarberId, barberId])).sort((a, b) => a - b);
    const acquired: number[] = [];
    try {
      for (const id of locks) {
        ensureBarberLockAcquired(await acquireBarberLock(id), 'The barber schedule is busy. Please retry in a moment.');
        acquired.push(id);
      }
      return await queueRepository.withTransaction(async (client) => {
        await queueRepository.lockBarber(client, barberId);
        const entry = await queueRepository.findByIdForUpdate(client, queueId);
        if (!entry || entry.is_walk_in || !['pending', 'accepted', 'late'].includes(String(entry.status))) {
          throw new AppError('Only upcoming reservations can be reassigned.', 409);
        }
        const barber = await client.query('SELECT barber_id FROM barbers WHERE barber_id = $1 AND is_active = TRUE', [barberId]);
        if (barber.rowCount !== 1) throw new AppError('Selected barber is not active.', 409);
        const conflicts = await queueRepository.findBarberIntervalConflictsForUpdate(
          client, barberId, Number(entry.branch_id), new Date(entry.scheduled_start_at).toISOString(), Number(entry.duration_minutes) || 30, queueId,
        );
        if (conflicts.length) throw new AppError('That time slot is already reserved with this barber.', 409);
        return queueRepository.updateReservationIdentity(client, queueId, barberId);
      });
    } finally {
      for (const id of acquired.reverse()) await releaseBarberLock(id);
    }
  }

  async updateOrder(
    queueId: number,
    serviceIds: number[],
    rawRetailItems: unknown,
    userContext: AuthoritativeUserContext,
    reservationImpact?: { previewFingerprint?: string; confirmed?: boolean } | null,
  ): Promise<any> {
    const requestedRetailItems = normalizeRetailSaleLines(rawRetailItems);
    const { durationMinutes } = await this.resolveOrderServices(serviceIds);

    const initialEntry = await queueRepository.findById(queueId);
    if (!initialEntry) throw new AppError('Queue entry not found.', 404);
    if (initialEntry.status === 'completed') {
      return queueRepository.withTransaction(async (client) => {
        const entry = await queueRepository.findByIdForUpdate(client, queueId);
        if (!entry) throw new AppError('Queue entry not found.', 404);
        this.assertMutationAccess(userContext, entry, 'edit-order');
        if (entry.status !== 'completed' || entry.payment_status === 'paid') {
          throw new AppError('Only completed unpaid orders with missing services can be repaired.', 409);
        }
        const existingServiceIds = await queueRepository.findQueueServiceIdsForUpdate(client, queueId);
        if (existingServiceIds.length > 0 || parseRetailItemSnapshots(entry.retail_items).length > 0) {
          throw new AppError('This completed order already has billable items and cannot be changed.', 409);
        }
        if (requestedRetailItems.length > 0) {
          throw new AppError('Select the performed services only when repairing a completed order.', 400);
        }
        if (await queueRepository.hasPaymentActivityForQueue(client, queueId)) {
          throw new AppError('Resolve the existing payment attempt before repairing this order.', 409);
        }
        const updatedOrder = await queueRepository.updateOrderItems(client, queueId, {
          serviceId: serviceIds[0], serviceIds, durationMinutes, retailItems: [],
        });
        await auditService.logSecurityEventInTransaction(client, {
          userId: userContext.userId,
          action: 'QUEUE_ORDER_SERVICES_RESTORED',
          resource: 'queue_entries',
          details: { queueId, branchId: entry.branch_id, serviceIds },
        });
        return updatedOrder;
      });
    }
    const barberId = Number(initialEntry.barber_id);
    if (!Number.isInteger(barberId) || barberId <= 0) {
      throw new AppError('The queue entry has no valid barber assignment.', 409);
    }

    const lockResult = await acquireBarberLock(barberId);
    ensureBarberLockAcquired(lockResult, 'The barber queue is busy. Please retry in a moment.');

    try {
      const transactionResult = await queueRepository.withTransaction(async (client) => {
        const entry = await queueRepository.findByIdForUpdate(client, queueId);
        if (!entry) throw new AppError('Queue entry not found.', 404);
        this.assertMutationAccess(userContext, entry, 'edit-order');
        if (!['waiting', 'serving'].includes(String(entry.status))) {
          throw new AppError('Only active unpaid queue orders can be modified.', 409);
        }
        if (entry.payment_status === 'paid') throw new AppError('Paid orders cannot be modified.', 409);
        if (Number(entry.barber_id) !== barberId) {
          throw new AppError('The barber assignment changed. Please retry the order update.', 409, true, { errorType: 'RaceCondition' });
        }

        const impactAnalysis = await this.analyzeOrderImpact(client, entry, serviceIds, durationMinutes);
        const suppliedFingerprint = reservationImpact?.previewFingerprint;
        if (suppliedFingerprint && suppliedFingerprint !== impactAnalysis.preview.previewFingerprint) {
          throw new AppError(
            'The barber queue or reservation schedule changed. Review the updated impact before saving.',
            409,
            true,
            { errorType: 'ReservationImpactChanged', preview: impactAnalysis.preview },
          );
        }
        if (entry.is_walk_in === true && impactAnalysis.preview.impacts.length > 0
          && (reservationImpact?.confirmed !== true
            || suppliedFingerprint !== impactAnalysis.preview.previewFingerprint)) {
          throw new AppError(
            'This order change affects a same-barber reservation. Cashier confirmation is required.',
            409,
            true,
            { errorType: 'ReservationImpactConfirmationRequired', preview: impactAnalysis.preview },
          );
        }

      const existingRetailItems = parseRetailItemSnapshots(entry.retail_items);
      const existingByProduct = new Map(existingRetailItems.map((item) => [item.productId, item]));
      const requestedByProduct = new Map(requestedRetailItems.map((item) => [item.productId, item.quantity]));
      for (const existing of existingRetailItems) {
        const requestedQuantity = requestedByProduct.get(existing.productId) || 0;
        if (requestedQuantity < existing.quantity) {
          throw new AppError('Existing retail quantities can only be increased after the order is created.', 409);
        }
      }

      const additionalItems = requestedRetailItems
        .map((item) => ({
          productId: item.productId,
          quantity: Number((item.quantity - (existingByProduct.get(item.productId)?.quantity || 0)).toFixed(3)),
        }))
        .filter((item) => item.quantity > 0);

      let retailSnapshots = existingRetailItems;
      if (additionalItems.length > 0) {
        let consumption;
        try {
          consumption = await inventoryRepository.recordRetailSaleConsumption(client, {
            items: additionalItems,
            branchId: entry.branch_id,
            transactionId: null,
            queueEntryId: queueId,
            createdBy: userContext.userId,
            sourceKey: `queue:${queueId}:order-edit:${Date.now()}`,
          });
        } catch (error: any) {
          if (error?.code === 'INVENTORY_RETAIL_INSUFFICIENT_STOCK') throw new AppError(error.message, 409);
          if (error?.code === 'INVENTORY_RETAIL_NOT_SELLABLE') throw new AppError(error.message, 400);
          throw error;
        }
        const snapshotsByProduct = new Map(existingRetailItems.map((item) => [item.productId, item]));
        for (const line of consumption.lines) {
          const previous = snapshotsByProduct.get(line.productId);
          snapshotsByProduct.set(line.productId, {
            productId: line.productId,
            quantity: Number(((previous?.quantity || 0) + line.quantity).toFixed(3)),
            unitPrice: line.unitPrice,
            name: line.name,
          });
        }
        retailSnapshots = [...snapshotsByProduct.values()];
      }

        const serviceEndsAt = entry.status === 'serving'
          ? impactAnalysis.preview.projectedCompletionAt
          : null;

        const updatedOrder = await queueRepository.updateOrderItems(client, queueId, {
          serviceId: serviceIds[0],
          serviceIds,
          durationMinutes,
          retailItems: retailSnapshots,
          serviceEndsAt,
        });

        const delayNotifications: Array<{
          queueEntryId: number;
          customerUserId: string | null;
          customerName: string;
          customerEmail: string | null;
          emailNotificationsEnabled: boolean;
          barberName: string;
          branchName: string;
          branchId: number | null;
          barberId: number | null;
          serviceIds: number[];
          scheduledStartAt: string;
          estimatedStartAt: string;
          delayMinutes: number;
        }> = [];

        const scheduleWriteBatch: Array<{
          queueId: number;
          estimatedStartAt: string;
          delayMinutes: number;
          scheduleAdjustmentStatus?: 'none' | 'pending';
        }> = [];
        for (const update of impactAnalysis.scheduleUpdates) {
          const reservation = update.reservation;
          const shouldNotify = shouldNotifyScheduleDelay(reservation.schedule_delay_minutes, update.delayMinutes);
          const adjustmentStatus = update.delayMinutes <= SCHEDULE_DELAY_THRESHOLD_MINUTES
            ? 'none'
            : (shouldNotify ? 'pending' : undefined);
          scheduleWriteBatch.push({
            queueId: Number(reservation.id),
            estimatedStartAt: update.estimatedStartAt,
            delayMinutes: update.delayMinutes,
            scheduleAdjustmentStatus: adjustmentStatus,
          });

          if (shouldNotify) {
            delayNotifications.push({
              queueEntryId: Number(reservation.id),
              customerUserId: reservation.customer_user_id ? String(reservation.customer_user_id) : null,
              customerName: String(reservation.customer_name || 'Customer'),
              customerEmail: reservation.customer_email ? String(reservation.customer_email) : null,
              emailNotificationsEnabled: reservation.email_notifications_enabled !== false,
              barberName: String(reservation.barber_name || 'your barber'),
              branchName: String(reservation.branch_name || 'DemoShop Barbershop'),
              branchId: reservation.branch_id === null || reservation.branch_id === undefined
                ? null
                : Number(reservation.branch_id),
              barberId: reservation.barber_id === null || reservation.barber_id === undefined
                ? null
                : Number(reservation.barber_id),
              serviceIds: Array.isArray(reservation.service_ids) && reservation.service_ids.length > 0
                ? reservation.service_ids.map(Number)
                : (reservation.service_id ? [Number(reservation.service_id)] : []),
              scheduledStartAt: new Date(reservation.scheduled_start_at).toISOString(),
              estimatedStartAt: update.estimatedStartAt,
              delayMinutes: update.delayMinutes,
            });
          }
        }
        await queueRepository.updateReservationScheduleEstimates(client, scheduleWriteBatch);

        const auditDetails = {
          actorUserId: userContext.userId,
          queueEntryId: queueId,
          barberId,
          branchId: Number(entry.branch_id),
          beforeServiceIds: resolveReservationServiceIds(entry),
          afterServiceIds: serviceIds,
          beforeDurationMinutes: impactAnalysis.existingDurationMinutes,
          afterDurationMinutes: durationMinutes,
          previewFingerprint: impactAnalysis.preview.previewFingerprint,
          confirmed: reservationImpact?.confirmed === true,
          projectedCompletionAt: impactAnalysis.preview.projectedCompletionAt,
          affectedReservations: impactAnalysis.preview.impacts,
        };
        await auditService.logSecurityEventInTransaction(client, {
          userId: userContext.userId,
          action: durationMinutes > impactAnalysis.existingDurationMinutes
            ? 'CASHIER_ORDER_EXTENDED'
            : 'QUEUE_ORDER_UPDATED',
          resource: 'queue_entries',
          details: auditDetails,
        });

        return { updatedOrder, delayNotifications };
      });

      for (const delay of transactionResult.delayNotifications) {
        void notificationService.notifyScheduleDelay({
          customerUserId: delay.customerUserId,
          customerName: delay.customerName,
          queueEntryId: delay.queueEntryId,
          branchId: delay.branchId,
          barberId: delay.barberId,
          barberName: delay.barberName,
          serviceIds: delay.serviceIds,
          scheduledStartAt: formatScheduleTimestamp(delay.scheduledStartAt),
          estimatedStartAt: formatScheduleTimestamp(delay.estimatedStartAt),
          delayMinutes: delay.delayMinutes,
        });
        void dispatchScheduleDelayEmailSafely(delay);
      }

      resetQueueMaintenanceDebounce(barberId);
      return transactionResult.updatedOrder;
    } finally {
      await releaseBarberLock(barberId);
    }
  }

  /**
   * Records that a customer accepts the revised ETA without changing the
   * reservation. This is deliberately server-authorized by customer ownership.
   */
  async keepScheduleAdjustment(customerId: number, queueId: number): Promise<any> {
    const entry = await queueRepository.findById(queueId);
    if (!entry || Number(entry.customer_id) !== Number(customerId)) {
      throw new AppError('Reservation not found.', 404);
    }
    if (!['accepted', 'late'].includes(String(entry.status))) {
      throw new AppError('This reservation can no longer be updated.', 409);
    }

    const lockResult = await acquireBarberLock(Number(entry.barber_id));
    ensureBarberLockAcquired(lockResult, 'The barber queue is busy. Please retry in a moment.');

    try {
      const updated = await queueRepository.withTransaction(async (client) => {
        const locked = await queueRepository.findByIdForUpdate(client, queueId);
        if (!locked || Number(locked.customer_id) !== Number(customerId)) {
          throw new AppError('Reservation not found.', 404);
        }
        const result = await queueRepository.acknowledgeScheduleAdjustment(client, queueId, customerId);
        if (!result) {
          throw new AppError('This reservation no longer has an active schedule adjustment.', 409);
        }
        return result;
      });
      return updated;
    } finally {
      await releaseBarberLock(Number(entry.barber_id));
    }
  }

  /**
   * Moves an adjusted reservation to the following calendar day for the same
   * barber. Availability is checked for UX, then repeated under a barber lock
   * and row-level transaction to prevent two customers claiming one interval.
   */
  async rescheduleScheduleAdjustment(
    customerId: number,
    queueId: number,
    preferredDate: string,
    preferredTime: string,
  ): Promise<any> {
    const requestedDate = String(preferredDate || '').trim();
    const requestedTime = String(preferredTime || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate) || !requestedTime) {
      throw new AppError('A valid next-day date and time are required.', 400);
    }

    const initialEntry = await queueRepository.findById(queueId);
    if (!initialEntry || Number(initialEntry.customer_id) !== Number(customerId)) {
      throw new AppError('Reservation not found.', 404);
    }
    if (!['accepted', 'late'].includes(String(initialEntry.status))) {
      throw new AppError('This reservation can no longer be rescheduled.', 409);
    }
    if (initialEntry.arrived_at) {
      throw new AppError('An arrived reservation cannot be rescheduled.', 409);
    }
    if (!(Number(initialEntry.schedule_delay_minutes) > 0)) {
      throw new AppError('This reservation does not have an active schedule adjustment.', 409);
    }
    if (!initialEntry.scheduled_start_at) {
      throw new AppError('Only scheduled reservations can be rescheduled.', 409);
    }

    const originalDate = formatManilaDateFromTimestamp(new Date(initialEntry.scheduled_start_at).toISOString());
    const expectedNextDate = addOneCalendarDay(originalDate);
    if (!expectedNextDate || requestedDate !== expectedNextDate) {
      throw new AppError('Rescheduling is limited to the next calendar day.', 400);
    }

    const scheduledStartEpoch = reservationTimeToEpoch(requestedDate, requestedTime);
    if (scheduledStartEpoch === null || scheduledStartEpoch <= Date.now()) {
      throw new AppError('Please choose a valid future time.', 400);
    }
    const scheduledStartAt = new Date(scheduledStartEpoch).toISOString();
    const arrivalDeadlineAt = new Date(scheduledStartEpoch + 10 * 60 * 1000).toISOString();
    const barberId = Number(initialEntry.barber_id);
    const branchId = Number(initialEntry.branch_id);
    const serviceIds = resolveReservationServiceIds(initialEntry);
    if (!Number.isInteger(barberId) || !Number.isInteger(branchId) || serviceIds.length === 0) {
      throw new AppError('Reservation details are incomplete. Please contact the front desk.', 409);
    }

    // This read powers the customer-facing error message. The transaction below
    // remains authoritative because another customer may book after this read.
    const availability = await this.getAvailability(barberId, branchId, requestedDate, serviceIds);
    const requestedSlotIsAvailable = availability.availableSlots.some((slot: any) => {
      const slotEpoch = reservationTimeToEpoch(requestedDate, slot.hour);
      return slotEpoch !== null && slotEpoch === scheduledStartEpoch;
    });
    if (!requestedSlotIsAvailable) {
      throw new AppError('That time is no longer available with this barber. Please choose another available slot.', 409, true, {
        errorType: 'SlotConflict',
      });
    }

    const lockResult = await acquireBarberLock(barberId);
    ensureBarberLockAcquired(lockResult, 'The barber queue is busy. Please retry in a moment.');

    try {
      const result = await queueRepository.withTransaction(async (client) => {
        const locked = await queueRepository.findByIdForUpdate(client, queueId);
        if (!locked || Number(locked.customer_id) !== Number(customerId)) {
          throw new AppError('Reservation not found.', 404);
        }
        if (!['accepted', 'late'].includes(String(locked.status))) {
          throw new AppError('This reservation can no longer be rescheduled.', 409);
        }
        if (locked.arrived_at) {
          throw new AppError('An arrived reservation cannot be rescheduled.', 409);
        }
        if (!(Number(locked.schedule_delay_minutes) > 0)) {
          throw new AppError('This reservation does not have an active schedule adjustment.', 409);
        }

        const services = await serviceRepository.findByIds(serviceIds);
        if (services.length !== serviceIds.length) {
          throw new AppError('One or more reservation services are unavailable.', 409);
        }
        const durationMinutes = Number(locked.duration_minutes) > 0
          ? Number(locked.duration_minutes)
          : services.reduce((total, service) => total + (Number(service.duration_minutes) || 30), 0);
        const conflicts = await queueRepository.findReservationIntervalConflictsForUpdate(
          client,
          barberId,
          branchId,
          scheduledStartAt,
          durationMinutes,
          queueId,
        );
        if (conflicts.length > 0) {
          throw new AppError('That time has just been booked with this barber. Please choose another available slot.', 409, true, {
            errorType: 'SlotConflict',
          });
        }

        const updated = await queueRepository.rescheduleReservationForCustomer(client, {
          queueId,
          customerId,
          preferredDate: requestedDate,
          preferredTime: requestedTime,
          scheduledStartAt,
          arrivalDeadlineAt,
        });
        if (!updated) {
          throw new AppError('This reservation can no longer be rescheduled.', 409);
        }

        // The moved reservation may have been part of the delayed chain. Rebuild
        // the remaining same-barber estimates so customers behind it do not keep
        // a stale delay after the slot is released.
        const serving = await queueRepository.findServingEntryForScheduleForUpdate(client, barberId);
        const servingStart = serving?.service_started_at || serving?.timer_started_at;
        const servingStartDate = servingStart ? new Date(servingStart) : null;
        const persistedServiceEnd = serving?.service_ends_at ? new Date(serving.service_ends_at) : null;
        const projectedEndAt = persistedServiceEnd && Number.isFinite(persistedServiceEnd.getTime())
          ? persistedServiceEnd.toISOString()
          : servingStartDate && Number.isFinite(servingStartDate.getTime())
          ? new Date(servingStartDate.getTime() + Number(serving.duration_minutes || 30) * 60_000).toISOString()
          : new Date().toISOString();
        const remainingReservations = await queueRepository.findFutureReservationsForSchedule(
          client,
          barberId,
          branchId,
          queueId,
        );
        const estimates = calculateScheduleEstimates(projectedEndAt, remainingReservations.map((reservation) => ({
          id: Number(reservation.id),
          scheduledStartAt: reservation.scheduled_start_at,
          durationMinutes: reservation.duration_minutes,
        })));
        await queueRepository.updateReservationScheduleEstimates(
          client,
          estimates.map((estimate) => ({
            queueId: estimate.id,
            estimatedStartAt: estimate.estimatedStartAt,
            delayMinutes: estimate.delayMinutes,
            scheduleAdjustmentStatus: estimate.delayMinutes <= SCHEDULE_DELAY_THRESHOLD_MINUTES ? 'none' : undefined,
          })),
        );

        return updated;
      });

      resetQueueMaintenanceDebounce(barberId);
      realtimeBroadcastService.dispatchAppointmentChangeSafely({
        action: 'RESCHEDULED',
        queueEntryId: queueId,
        status: result?.status ?? 'SCHEDULED',
        customerId,
        barberId,
        branchId: result?.branch_id ?? branchId ?? null,
      });
      return result;
    } finally {
      await releaseBarberLock(barberId);
    }
  }

  /**
   * Customer self-service rescheduling for confirmed appointments.
   * The cutoff and conflict check are repeated while the appointment row is
   * locked so the public availability response cannot become stale between
   * validation and the update.
   */
  async rescheduleAppointment(
    customerId: number,
    queueId: number,
    preferredDate: string,
    preferredTime: string,
    requestedBarberId?: number,
  ): Promise<any> {
    const requestedDate = String(preferredDate || '').trim();
    const requestedTime = String(preferredTime || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate) || !requestedTime) {
      throw new AppError('A valid appointment date and time are required.', 400);
    }

    const initialEntry = await queueRepository.findById(queueId);
    if (!initialEntry || Number(initialEntry.customer_id) !== Number(customerId)) {
      throw new AppError('Reservation not found.', 404);
    }
    if (!['pending', 'accepted', 'confirmed'].includes(String(initialEntry.status))) {
      throw new AppError('Only upcoming appointments can be rescheduled.', 409);
    }
    if (await queueRepository.hasCustomerUsedReschedule(queueId)) {
      throw new AppError('This reservation has already used its one-time rescheduling allowance.', 409);
    }
    if (!initialEntry.scheduled_start_at) {
      throw new AppError('Only scheduled appointments can be rescheduled.', 409);
    }

    const originalStart = new Date(initialEntry.scheduled_start_at).getTime();
    if (!Number.isFinite(originalStart) || originalStart - Date.now() < CUSTOMER_CANCELLATION_NOTICE_MS) {
      throw new AppError('Appointments can only be rescheduled at least 24 hours in advance.', 422);
    }

    const branchId = Number(initialEntry.branch_id);
    if (!Number.isInteger(branchId) || branchId <= 0) {
      throw new AppError('Appointment details are incomplete. Please contact the shop.', 409);
    }

    const scheduledStartEpoch = reservationTimeToEpoch(requestedDate, requestedTime);
    if (scheduledStartEpoch === null || scheduledStartEpoch <= Date.now()) {
      throw new AppError('Please choose a valid future time.', 400);
    }
    const scheduledStartAt = new Date(scheduledStartEpoch).toISOString();
    const arrivalDeadlineAt = new Date(scheduledStartEpoch + 10 * 60 * 1000).toISOString();
    const serviceIds = resolveReservationServiceIds(initialEntry);
    const services = await serviceRepository.findByIds(serviceIds);
    if (services.length !== serviceIds.length) {
      throw new AppError('One or more reservation services are unavailable.', 409);
    }
    const durationMinutes = Number(initialEntry.duration_minutes) > 0
      ? Number(initialEntry.duration_minutes)
      : services.reduce((total, service) => total + (Number(service.duration_minutes) || 30), 0);

    let barberId = requestedBarberId || 0;
    if (!barberId) {
      const batchAvailability = await this.getBatchAvailability(branchId, requestedDate, serviceIds);
      const candidates = batchAvailability.slots[requestedTime]?.availableBarberIds || [];
      barberId = Number(candidates[0] || 0);
      if (!barberId) {
        throw new AppError('No available barber was found for that time. Please choose another slot.', 409, true, { errorType: 'SlotConflict' });
      }
    }
    if (!(await queueRepository.isActiveBarberAtBranch(barberId, branchId))) {
      throw new AppError('That barber is not available at this branch.', 409);
    }

    const availability = await this.getAvailability(barberId, branchId, requestedDate, serviceIds);
    const sameSlot = Number(initialEntry.barber_id) === barberId
      && new Date(initialEntry.scheduled_start_at).getTime() === scheduledStartEpoch;
    const requestedSlotIsAvailable = sameSlot || availability.availableSlots.some((slot: any) => {
      const slotEpoch = reservationTimeToEpoch(requestedDate, slot.hour);
      return slotEpoch !== null && slotEpoch === scheduledStartEpoch;
    });
    if (!requestedSlotIsAvailable) {
      throw new AppError('That time is no longer available with this barber. Please choose another available slot.', 409, true, { errorType: 'SlotConflict' });
    }

    const lockResult = await acquireBarberLock(barberId);
    ensureBarberLockAcquired(lockResult, 'The barber queue is busy. Please retry in a moment.');
    try {
      const updated = await queueRepository.withTransaction(async (client) => {
        const locked = await queueRepository.findByIdForUpdate(client, queueId);
        if (!locked || Number(locked.customer_id) !== Number(customerId)) throw new AppError('Reservation not found.', 404);
        if (!['pending', 'accepted', 'confirmed'].includes(String(locked.status))) {
          throw new AppError('Only upcoming appointments can be rescheduled.', 409);
        }
        if (await queueRepository.hasCustomerUsedRescheduleForUpdate(client, queueId)) {
          throw new AppError('This reservation has already used its one-time rescheduling allowance.', 409);
        }
        if (!locked.scheduled_start_at || new Date(locked.scheduled_start_at).getTime() - Date.now() < CUSTOMER_CANCELLATION_NOTICE_MS) {
          throw new AppError('Appointments can only be rescheduled at least 24 hours in advance.', 422);
        }
        const conflicts = await queueRepository.findReservationIntervalConflictsForUpdate(
          client, barberId, branchId, scheduledStartAt, durationMinutes, queueId,
        );
        if (conflicts.length > 0) {
          throw new AppError('That time has just been booked with this barber. Please choose another available slot.', 409, true, { errorType: 'SlotConflict' });
        }
        const result = await client.query(
          `UPDATE queue_entries
           SET barber_id = $3, preferred_date = $4::date, preferred_time = $5,
               scheduled_start_at = $6::timestamptz, arrival_deadline_at = $7::timestamptz,
               estimated_start_at = $6::timestamptz,
               schedule_adjustment_status = 'rescheduled'
           WHERE id = $1 AND customer_id = $2
             AND status::text IN ('pending', 'accepted', 'confirmed')
           RETURNING *`,
          [queueId, customerId, barberId, requestedDate, requestedTime, scheduledStartAt, arrivalDeadlineAt],
        );
        if (!result.rows[0]) throw new AppError('This appointment can no longer be rescheduled.', 409);
        return result.rows[0];
      });
      resetQueueMaintenanceDebounce(barberId);
      if (String(updated.status) === 'pending') {
        await this.dispatchPendingReservationNotification(updated);
      } else {
        await notificationService.notifyReservationConfirmed(updated);
        void dispatchReservationDecisionEmailSafely(queueId, 'CONFIRMED');
        void dispatchBarberBookingEmailSafely(queueId);
      }
      realtimeBroadcastService.dispatchAppointmentChangeSafely({
        action: 'RESCHEDULED',
        queueEntryId: queueId,
        status: updated?.status ?? 'SCHEDULED',
        customerId,
        barberId,
        branchId: updated?.branch_id ?? null,
      });
      return updated;
    } finally {
      await releaseBarberLock(barberId);
    }
  }

  async getPaymentQuote(queueId: number, branchId?: number): Promise<any> {
    const entry = await queueRepository.findById(queueId);
    ensureQueueEntryFound(entry);
    if (branchId && entry!.branch_id !== branchId) throw new AppError('Access denied for this branch.', 403);
    if (entry!.status !== 'completed') throw new AppError('Payment is available only after the service is marked done.', 409);
    const serviceIds = Array.isArray(entry!.service_ids) && entry!.service_ids.length > 0
      ? entry!.service_ids.map(Number)
      : entry!.service_id ? [Number(entry!.service_id)] : [];
    const reservationFeeEligible = isReservationFeeEligible(entry!);

    // These lookups are independent after the queue entry has been validated.
    // Run them together so quote latency is bounded by the slowest query rather
    // than the sum of three remote database round trips.
    const [latestAttempt, services, existingFee] = await Promise.all([
      paymentAttemptRepository.findLatestByQueue(queueId, branchId),
      serviceIds.length ? serviceRepository.findByIds(serviceIds) : Promise.resolve([]),
      reservationFeeEligible
        ? transactionRepository.findReservationFeeByQueueId(queueId, branchId)
        : Promise.resolve(null),
    ]);
    if (latestAttempt && ['pending_verification', 'automated_review_passed', 'flagged'].includes(latestAttempt.status)) {
      throw new AppError('A payment receipt is already being processed.', 409, true, {
        paymentAttemptId: latestAttempt.payment_attempt_id,
        paymentAttemptStatus: latestAttempt.status,
      });
    }
    if (entry!.payment_status === 'paid') throw new AppError('This queue entry has already been paid.', 409);

    if (services.length !== serviceIds.length) throw new AppError('One or more queue services are unavailable.', 409);
    if (services.length === 0 && sumRetailAmount(parseRetailItemSnapshots(entry!.retail_items)) <= 0) {
      throw new AppError('This queue entry has no billable service or retail item linked to it.', 409, true, { code: 'MISSING_BILLABLE_ITEMS' });
    }
    const lines: Array<{ serviceId: number; title: string; amount: number }> = services.map((service: any) => ({
      serviceId: Number(service.service_id),
      title: service.title,
      amount: Number(service.price) || 0,
    }));
    const retailLines = parseRetailItemSnapshots(entry!.retail_items).map((item) => ({
      productId: item.productId,
      title: item.name,
      amount: Number((item.quantity * item.unitPrice).toFixed(2)),
      quantity: item.quantity,
    }));

    // The ₱50 reservation fee (formerly collected separately via "Collect Fee"
    // in Upcoming Bookings) is now folded into the final checkout total.
    if (!existingFee && reservationFeeEligible) {
      lines.push({ serviceId: -1, title: 'Reservation Fee / Deposit', amount: RESERVATION_FEE_AMOUNT });
    }

    const businessDate = new Intl.DateTimeFormat('en-CA', { timeZone: config.gcash.businessTimeZone }).format(new Date());
    return {
      queueId,
      amountDue: Number((
        lines.reduce((sum, line) => sum + line.amount, 0)
        + retailLines.reduce((sum, line) => sum + line.amount, 0)
      ).toFixed(2)),
      lines: [...lines, ...retailLines],
      currency: 'PHP',
      gcashMerchantName: config.gcash.merchantName,
      businessDate,
    };
  }

  async getPaymentReceiptUrl(queueId: number, branchId?: number): Promise<any> {
    const receiptStoragePath = await transactionRepository.findLatestGcashReceiptPath(queueId, branchId);
    if (!receiptStoragePath) throw new AppError('Receipt evidence is unavailable.', 404);
    if (!validateReceiptStoragePath(receiptStoragePath, branchId)) {
      throw new AppError('Receipt evidence is unavailable.', 404);
    }
    const signed = await getAdminClient().storage.from('receipts').createSignedUrl(receiptStoragePath, 60);
    if (signed.error || !signed.data?.signedUrl) throw new AppError('Receipt review link could not be created.', 502);
    return { url: signed.data.signedUrl, expiresInSeconds: 60 };
  }

  async markPaymentPaid(_queueId: number, _branchId?: number, _paymentLines?: any[], _idempotencyKey?: string, _paymentDetails?: any): Promise<never> {
    throw new AppError('Direct payment finalization is disabled. Submit a payment attempt instead.', 410);
  }

  /**
   * @deprecated Payment finalization is owned by PaymentAttemptService. This
   * compatibility method is deliberately disabled so no caller can bypass
   * the durable attempt and manual GCash reconciliation lifecycle.
   */
  async recordPayment(_queueId: number, _branchId?: number, _paymentLines?: any[], _idempotencyKey?: string, _paymentDetails?: any): Promise<never> {
    throw new AppError('Direct payment finalization is disabled. Submit a payment attempt instead.', 410);
  }

  /**
   * Retrieves a specific queue entry by its ID with server-authoritative policy checks.
   * 
   * @param id - The unique ID of the entry to retrieve.
   * @param userContext - The authenticated caller context.
   * @returns The queue entry record (sanitized if customer) or null if not found/unauthorized.
   */
  async getQueueEntry(id: number, userContext?: AuthoritativeUserContext): Promise<any | null> {
    const entry = await queueRepository.findById(id);
    if (!entry) return null;

    if (userContext) {
      const isAuthorized = QueuePolicy.authorizeRead(userContext, entry);
      if (!isAuthorized) {
        return null;
      }
    }

    if (['accepted', 'late', 'waiting', 'serving'].includes(entry.status)) {
      await this.synchronizeScheduledReservations(entry.barber_id);
      const updated = await queueRepository.findById(id);
      const finalEntry = updated || entry;
      return userContext?.role === UserRole.CUSTOMER
        ? QueuePolicy.sanitizeForCustomer(finalEntry)
        : finalEntry;
    }

    return userContext?.role === UserRole.CUSTOMER
      ? QueuePolicy.sanitizeForCustomer(entry)
      : entry;
  }

  /**
   * Calculates and retrieves the availability schedule for a specific barber on a given date.
   * It considers the duration of the requested service, the barber's active queue,
   * and filters out past hours if the requested date is today.
   *
   * @param {number} barberId - The unique identifier of the barber.
   * @param {string} date - The date to check availability for (e.g., 'Oct 15' or 'October 15').
   * @param {string} [serviceId] - The optional unique identifier of the requested service. Used to dynamically adjust the required slot duration.
   * @returns {Promise<Array<{hour: string, isAvailable: boolean, queueCount: number, waitTimeMinutes: number}>>} A promise that resolves to an array of time slot objects containing the hour, availability status, current queue count, and total estimated wait time.
   */
  async getAvailability(
    barberId: number,
    branchId: number,
    date: string,
    serviceIds: number[] = [],
    options: { schedulePrevalidated?: boolean; allowOnlineBookingDisabled?: boolean; barber?: any; services?: any[]; shopSettings?: any } = {},
  ): Promise<AvailabilityResponse> {
    const barber = options.barber || await barberRepository.findBarberById(barberId);
    const rawStatus = String(barber?.status || '').toLowerCase().replace(/_/g, ' ').trim();
    const barberName = String(barber?.name || '').toLowerCase().trim();
    if (!barber || barber.is_active === false || ['suspended'].includes(rawStatus)) {
      return {
        availableSlots: [],
        busyPeriods: [],
        isUnavailable: true,
        reason: 'Barber is absent or unavailable for appointments on this date.',
      };
    }

    const isToday = isDateTodayInManila(date);
    if (isToday) {
        if (['absent', 'leave', 'on leave'].includes(rawStatus)) {
        return {
          availableSlots: [],
          busyPeriods: [],
          isUnavailable: true,
          reason: 'Barber is off duty today.',
        };
      }
    }

    // Check if barber has a scheduled day off or approved leave on requested date
    if (!options.schedulePrevalidated) {
      try {
        const schedule = await staffScheduleService.getBarberSchedulePublic(barberId, date, date);
        const detail = schedule.dateDetails?.[date];
        const isOffDuty = isBarberOffDutyOnDate(schedule, date);
        const isOnlineDisabled = detail?.isOnlineBookingEnabled === false || detail?.reason === 'Online Booking Disabled';

        if (isOffDuty || (isOnlineDisabled && !options.allowOnlineBookingDisabled)) {
          return {
            availableSlots: [],
            busyPeriods: [],
            isUnavailable: true,
            reason: isOnlineDisabled
              ? 'This barber is not accepting online bookings on this date.'
              : (detail?.reason || 'Barber is off duty on this date.'),
          };
        }
      } catch (schedErr: any) {
        logger.warn(`[QueueService] Could not check public barber schedule for date ${date}: ${schedErr?.message}`);
      }
    }

    const isOnBreak = isToday && isBarberOnBreak(barber?.status);
    const { currentMinutes } = getManilaNow();

    let requestedDuration = 30;
    if (serviceIds.length > 0) {
      const services = options.services || await serviceRepository.findByIds(serviceIds);
      if (services.length !== serviceIds.length) {
        throw new AppError('One or more selected services are unavailable.', 400);
      }
      const conflict = validateServiceCombo(services);
      if (conflict) {
        throw new AppError(conflict.reason, 422, true, { conflictingIds: conflict.conflictingIds });
      }
      requestedDuration = services.reduce(
        (total, service) => total + (Number(service.duration_minutes) || 30),
        0
      );
    }

    // Only accepted reservations and real live queue entries block availability.
    // Cancelled entries must reopen their time slot, including barber-side cancellations.
    // Availability is a read-only calculation. Do not run scheduled-reservation
    // synchronization or timer-expiration maintenance from this endpoint; those
    // mutations were causing connection contention before a reservation test.
    const [queueEntries, acceptedReservations] = await Promise.all([
      queueRepository.findActiveByBarber(barberId, branchId, date),
      queueRepository.findAcceptedReservationsForAvailability(barberId, branchId, date),
    ]);

    const allEntries = [...queueEntries, ...acceptedReservations];

    // Process data using our clean utilities and authoritative branch business hours
    let configuredHours: any = undefined;
    try {
      const settings = options.shopSettings !== undefined
        ? options.shopSettings
        : await adminRepository.getShopSettings(branchId);
      configuredHours = settings?.businessHours;
    } catch {
      // fallback to default hours
    }
    const workingHours = getValidWorkingHours(date, configuredHours, requestedDuration);
    const appointments = formatQueueToAppointments(allEntries);

    // Calculate slots and wait times with strict interval collision and break buffering
    const availability = generateTimeSlotAvailability(workingHours, appointments, requestedDuration, {
      isOnBreak,
      isToday,
      currentMinutes,
      breakBufferMinutes: 15,
    });

    const commonWaitTime = calculateTotalWaitTime(
      queueEntries
        .filter((e: any) => e.status === 'waiting' || e.status === 'serving')
        .map((e: any) => ({
          queue_status: e.status === 'serving' ? 'in_chair' : 'waiting',
          duration_minutes: e.duration_minutes || 30,
          timer_started_at: e.timer_started_at,
          service_started_at: e.service_started_at,
          service_ends_at: e.service_ends_at,
          scheduled_start_at: e.scheduled_start_at,
          is_walk_in: e.is_walk_in,
        })),
      { isOnBreak, breakBufferMinutes: 15, breakStartedAt: barber?.break_started_at }
    );

    // Return available starts separately from exact occupied intervals. The UI
    // should not render every unavailable 15-minute slice as a disabled button.
    return {
      availableSlots: availability
        .filter(slot => slot.isAvailable)
        .map(slot => ({
          hour: slot.time,
          isAvailable: true,
          queueCount: slot.queueCount,
          waitTimeMinutes: commonWaitTime,
          isOnBreak: slot.isOnBreak,
          breakBufferMinutes: slot.breakBufferMinutes,
          recommendedArrivalTime: slot.recommendedArrivalTime,
        })),
      busyPeriods: formatBusyPeriods(appointments, commonWaitTime),
      isOnBreak,
    };
  }

  /**
   * Calculates availability for the branch roster behind one public request.
   * The per-barber calculation remains authoritative and is reused here; the
   * batch shape lets clients switch barbers without another HTTP roundtrip.
   */
  async getBatchAvailability(
    branchId: number,
    date: string,
    serviceIds: number[] = [],
    barberIds: number[] = [],
    options: { requireValidatedSchedule?: boolean } = {},
  ): Promise<BatchAvailabilityResponse> {
    const startedAt = performance.now();
    let activeBarbers: any[];
    try {
      // Availability already calculates queue load for each barber below. Do
      // not route through getPublicBarbers here: that endpoint also reads Redis
      // and computes current lane summaries, neither of which batch
      // availability needs. Resolve only the active roster and bulk date
      // schedule, retaining the public-booking interpretation of schedule
      // flags.
      const branchBarbers = await barberRepository.findActiveBarbersByBranch(String(branchId));
      const scheduleByBarber = await staffScheduleService.getCashierBarberAvailability(
        branchBarbers,
        branchId,
        date,
        { publicBookingSemantics: true },
      );
      if (options.requireValidatedSchedule && branchBarbers.some((barber: any) => !scheduleByBarber.has(Number(barber.barber_id)))) {
        throw new AppError('Barber schedules could not be verified for this availability check.', 503);
      }
      activeBarbers = branchBarbers.map((barber: any) => {
        const schedule = scheduleByBarber.get(Number(barber.barber_id));
        return schedule ? {
          ...barber,
          is_off_today: schedule.isOffToday,
          is_on_duty_today: schedule.isOnDutyToday,
          isOnDutyToday: schedule.isOnDutyToday,
          is_online_booking_enabled_today: schedule.isOnlineBookingEnabledToday,
          isOnlineBookingEnabledToday: schedule.isOnlineBookingEnabledToday,
          is_online_booking_enabled: schedule.isOnlineBookingEnabledToday,
          is_available_for_walkins: schedule.isAvailableForWalkins,
          walkin_available: schedule.isAvailableForWalkins,
          schedule_reason: schedule.scheduleReason,
        } : barber;
      });
    } catch (err: any) {
      logger.warn('[QueueService] Could not load date-specific barber roster for batch availability', {
        branchId,
        date,
        error: err?.message || String(err),
      });
      if (options.requireValidatedSchedule) {
        throw new AppError('Barber schedules could not be verified for this availability check.', 503);
      }
      activeBarbers = await barberRepository.findActiveBarbersByBranch(String(branchId));
    }
    const requestedBarberIds = new Set(barberIds);
    const candidates = activeBarbers.filter((barber: any) => (
      requestedBarberIds.size === 0 || requestedBarberIds.has(Number(barber.barber_id))
    ));

    // Availability is calculated independently per barber. A failure while
    // evaluating one barber must not erase valid slots for every other barber
    // in the batch (the previous frontend fan-out used allSettled semantics).
    const services = serviceIds.length ? await serviceRepository.findByIds(serviceIds) : [];
    if (services.length !== serviceIds.length) {
      throw new AppError('One or more selected services are unavailable.', 400);
    }
    const serviceConflict = validateServiceCombo(services);
    if (serviceConflict) {
      throw new AppError(serviceConflict.reason, 422, true, { conflictingIds: serviceConflict.conflictingIds });
    }
    let shopSettings: any;
    try {
      shopSettings = await adminRepository.getShopSettings(branchId);
    } catch {
      if (options.requireValidatedSchedule) {
        throw new AppError('Branch business hours could not be verified for this availability check.', 503);
      }
      shopSettings = null;
    }
    if (options.requireValidatedSchedule) {
      const dayName = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', weekday: 'long' }).format(new Date(`${date}T12:00:00+08:00`));
      const dayHours = Array.isArray(shopSettings?.businessHours)
        ? shopSettings.businessHours.find((entry: any) => String(entry?.day || '').toLowerCase() === dayName.toLowerCase())
        : null;
      const validBusinessTime = (value: unknown) => typeof value === 'string' && /^(?:0?\d|1\d|2[0-3]):[0-5]\d(?:\s?(?:AM|PM))?$/i.test(value.trim());
      if (!dayHours || typeof dayHours.isOpen !== 'boolean' || (dayHours.isOpen && (!validBusinessTime(dayHours.openTime) || !validBusinessTime(dayHours.closeTime)))) {
        throw new AppError('Branch business hours could not be verified for this availability check.', 503);
      }
    }
    const todayIso = getManilaNow().todayISO;
    const isTargetDateToday = date === todayIso;

    let scheduleMap: Record<string, any> = {};
    if (!isTargetDateToday) {
      try {
        scheduleMap = await staffScheduleService.getPublicBarberSchedules(branchId, date, date);
      } catch (err: any) {
        logger.warn('[QueueService] Could not fetch batch public barber schedules for date', { branchId, date, error: err?.message });
      }
    }

    const results = await Promise.allSettled(
      candidates.map(async (barber: any): Promise<{ barberId: number; availability: BatchBarberAvailability }> => {
        const barberId = Number(barber.barber_id);
        const scheduleDetail = isTargetDateToday
          ? undefined
          : scheduleMap[String(barberId)]?.dateDetails?.[date];

        const isOnDuty = isTargetDateToday
          ? (barber.isOnDutyToday ?? barber.is_on_duty_today ?? true)
          : (scheduleDetail?.isOnDuty ?? false);

        const isOnlineBookingEnabled = isTargetDateToday
          ? Boolean(barber.isOnlineBookingEnabledToday ?? barber.is_online_booking_enabled_today ?? barber.is_online_booking_enabled ?? false)
          : Boolean(scheduleDetail?.isOnlineBookingEnabled ?? false);

        const scheduleReason = isTargetDateToday
          ? (barber.schedule_reason || null)
          : (scheduleDetail?.reason || (isOnlineBookingEnabled ? null : 'Online Booking Disabled'));

        const availability = !isOnDuty
          ? {
              availableSlots: [],
              busyPeriods: [],
              isUnavailable: true,
              reason: scheduleReason || 'This barber is off duty on this date.',
            }
          : await this.getAvailability(barberId, branchId, date, serviceIds, {
              schedulePrevalidated: true,
              barber,
              services,
              shopSettings,
            });

        return {
          barberId,
          availability: {
            ...availability,
            isOnDuty: Boolean(isOnDuty),
            isOnlineBookingEnabled,
            ...(barber.is_available_for_walkins !== undefined || barber.walkin_available !== undefined
              ? { isAvailableForWalkins: Boolean(barber.is_available_for_walkins ?? barber.walkin_available) }
              : {}),
            ...(scheduleReason !== null ? { scheduleReason } : {}),
          },
        };
      }),
    );

    const successfulResults = results.filter(
      (result): result is PromiseFulfilledResult<{ barberId: number; availability: BatchBarberAvailability }> =>
        result.status === 'fulfilled',
    );

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        logger.warn('[QueueService] Failed to calculate batch availability for one barber', {
          barberId: Number(candidates[index]?.barber_id),
          error: result.reason?.message || String(result.reason),
        });
      }
    });

    // Preserve validation/database errors when every candidate failed rather
    // than silently returning an empty availability response.
    if (successfulResults.length === 0 && results[0]?.status === 'rejected') {
      throw results[0].reason;
    }

    const barbers: BatchAvailabilityResponse['barbers'] = {};
    const slots: BatchAvailabilityResponse['slots'] = {};

    for (const { value: { barberId, availability } } of successfulResults) {
      const barberKey = String(barberId);
      barbers[barberKey] = availability;
      // The per-barber slots support cashier-created reservations too. Keep
      // the aggregate public booking list limited to online-enabled barbers.
      if (availability.isOnDuty === false || availability.isOnlineBookingEnabled === false) {
        continue;
      }
      for (const slot of availability.availableSlots || []) {
        const summary = slots[slot.hour] || { availableBarberIds: [], totalAvailable: 0 };
        summary.availableBarberIds.push(barberKey);
        summary.totalAvailable += 1;
        slots[slot.hour] = summary;
      }
    }

    logger.info('[Queue] Batch availability calculated', {
      event: 'batch_availability_calculated',
      branchId,
      date,
      requestedBarberCount: candidates.length,
      successfulBarberCount: successfulResults.length,
      duration_ms: Math.round(performance.now() - startedAt),
    });
    return { date, branchId, slots, barbers };
  }

  /**
   * Keeps a serving entry active until staff explicitly completes it.
   * `service_ends_at` is an estimate for display only; a service can run
   * longer than that estimate without leaving the chair.
   */
  async expireTimers(barberId: number): Promise<boolean> {
    void barberId;
    return false;
  }

  /**
   * Executes debounced queue synchronization and timer expiration for a barber.
   * Safe to call across multiple barbers during snapshot generation without write thrashing.
   */
  async runDebouncedMaintenance(barberId: number): Promise<void> {
    await this.synchronizeScheduledReservations(barberId);
    await this.expireTimers(barberId);
  }

  async acceptReservation(queueId: number, branchId?: number, options?: { cashierName?: string; skipGroup?: boolean }): Promise<any> {
    try {
      const groupEntry = await queueRepository.findById(queueId);
      if (groupEntry?.group_booking_id && !options?.skipGroup) {
        const groupIds = await queueRepository.findGroupQueueEntryIds(String(groupEntry.group_booking_id), 'pending');
        const entries = [];
        for (const groupId of groupIds) {
          entries.push(await this.acceptReservation(groupId, branchId, { ...options, skipGroup: true }));
        }
        return { ...entries[0], groupBookingId: groupEntry.group_booking_id, totalGuests: entries.length, entries };
      }

      const result = await queueRepository.withTransaction(async (client) => {
        const entry = await queueRepository.findReservationForAcceptanceForUpdate(client, queueId);

        if (!entry) {
          logger.warn('[acceptReservation] Reservation not found or already processed', { queueId });
          throw new AppError('Reservation not found or already processed.', 404);
        }
        if (branchId !== undefined && branchId !== null && entry.branch_id !== branchId) {
          throw new AppError('Access denied for this branch.', 403);
        }

        const scheduledEpoch = reservationTimeToEpoch(entry.preferred_date, entry.preferred_time);
        const scheduledStartAt = scheduledEpoch === null ? null : new Date(scheduledEpoch).toISOString();
        if (scheduledStartAt && entry.barber_id) {
          await queueRepository.lockBarber(client, entry.barber_id);
          const conflicts = await queueRepository.findBarberIntervalConflictsForUpdate(
            client,
            entry.barber_id,
            Number(entry.branch_id),
            scheduledStartAt,
            Number(entry.resolved_duration) || 30,
            queueId,
          );
          if (conflicts.length > 0) {
            logger.warn('[acceptReservation] Reservation conflict detected', {
              queueId,
              conflictingQueueId: conflicts[0].id,
            });
            throw new AppError(
              'Time slot conflict: the barber already has an overlapping assignment. Please reschedule the customer.',
              409,
              true,
              { errorType: 'SlotConflict', conflictingQueueId: conflicts[0].id },
            );
          }
        }
        const arrivalDeadlineEpoch = getArrivalDeadlineEpoch(entry.preferred_date, entry.preferred_time);
        const isScheduled = scheduledEpoch !== null;
        const isFutureScheduled = isScheduled && scheduledEpoch > Date.now();

        if (isScheduled && arrivalDeadlineEpoch !== null && Date.now() >= arrivalDeadlineEpoch) {
          throw new AppError('Reservation has passed its 10-minute arrival grace period.', 409);
        }

        if (entry.reference_number) {
          await transactionRepository.createReservationFee(client, {
            queueEntryId: queueId,
            branchId: entry.branch_id,
            customerId: entry.customer_id,
            barberId: entry.barber_id,
            paymentMethod: 'GCash',
            gcashRefNo: entry.reference_number,
            amount: 50,
          });
        }

        if (isFutureScheduled || isScheduled) {
          const acceptedStatus = isFutureScheduled ? 'accepted' : 'late';
          return queueRepository.acceptScheduledReservation(
            client,
            queueId,
            acceptedStatus,
            scheduledEpoch === null ? null : new Date(scheduledEpoch).toISOString(),
            arrivalDeadlineEpoch === null ? null : new Date(arrivalDeadlineEpoch).toISOString(),
          );
        }

        const barberId = entry.barber_id;
        if (barberId) await queueRepository.lockBarber(client, barberId);
        const position = await queueRepository.getNextPosition(client, barberId || 0);
        const statusInfo = determineInitialStatus(position);
        return queueRepository.acceptLiveReservation(
          client,
          queueId,
          position,
          statusInfo.status,
          statusInfo.timerStartedAt,
        );
      });

      if (result?.status === 'accepted' || result?.status === 'late') {
        logger.info('[acceptReservation] Reservation accepted', {
          event: 'reservation_accepted',
          queueId,
          status: result.status,
        });
      } else {
        logger.info('[acceptReservation] Added to live queue', {
          event: 'reservation_accepted_live',
          queueId,
          barberId: result?.barber_id,
          position: result?.position,
          status: result?.status,
        });
      }
      if (result?.barber_id) {
        resetQueueMaintenanceDebounce(result.barber_id);
      }
      await notificationService.notifyReservationConfirmed(result);

      // Asynchronously dispatch transactional confirmation email without blocking caller
      void dispatchReservationDecisionEmailSafely(queueId, 'CONFIRMED', options);
      void dispatchBarberBookingEmailSafely(queueId);

      realtimeBroadcastService.dispatchAppointmentChangeSafely({
        action: 'STATUS_CHANGED',
        queueEntryId: queueId,
        status: 'SCHEDULED',
        customerId: result?.customer_id ?? null,
        barberId: result?.barber_id ?? null,
        branchId: result?.branch_id ?? branchId ?? null,
      });

      return result;
    } catch (error: unknown) {
      logger.error('[acceptReservation] Reservation acceptance failed', { queueId, error });
      throw error;
    }
  }

  /**
   * Checks whether a payment reference number or image hash is already used for an existing booking.
   */
  async checkReferenceUniqueness(
    referenceNumber?: string,
    imageHash?: string,
  ): Promise<{ isDuplicate: boolean; isImageDuplicate?: boolean; message?: string }> {
    let isRefDuplicate = false;
    let isHashDuplicate = false;

    if (referenceNumber) {
      const cleanReference = referenceNumber.trim().replace(/\s+/g, '');
      if (cleanReference && /^[A-Za-z0-9-]{8,32}$/.test(cleanReference)) {
        isRefDuplicate = await queueRepository.isReferenceNumberDuplicate(cleanReference);
      }
    }

    if (imageHash) {
      const cleanHash = imageHash.trim();
      if (cleanHash) {
        isHashDuplicate = await queueRepository.isImageHashDuplicate(cleanHash);
      }
    }

    const isDuplicate = isRefDuplicate || isHashDuplicate;
    let message: string | undefined;
    if (isHashDuplicate) {
      message = 'This receipt image has already been submitted for another booking.';
    } else if (isRefDuplicate) {
      message = 'This reference number has already been used and confirmed for a previous booking.';
    }

    return {
      isDuplicate,
      isImageDuplicate: isHashDuplicate,
      message,
    };
  }
}

export const queueService = new QueueService();
export default queueService;
