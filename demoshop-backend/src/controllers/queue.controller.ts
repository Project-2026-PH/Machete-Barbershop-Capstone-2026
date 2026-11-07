import { Request, Response } from 'express';
import multer from 'multer';
import { BaseController } from './base.controller';
import { AppError } from '../utils/error/AppError';
import { queueService } from '../services/queue.service';
import { queueRepository } from '../repositories/queue.repository';
import logger from '../utils/general/logger';
import {branchService} from "../services/branch.service";
import {barberService} from "../services/barber.service";
import { customerRepository } from '../repositories/customer.repository';
import { barberRepository } from '../repositories/barber.repository';
import { paymentAttemptService } from '../services/payment-attempt.service';
import { receiptService } from '../services/receipt.service';
import { cashierOfflineReceiptPrintService } from '../services/cashier-offline-receipt-print.service';
import { MAX_RECEIPT_BYTES, validateReceiptEvidence } from '../utils/cashier/receipt-evidence.util';
import { AuthoritativeUserContext } from '../security/policies/queue.policy';
import { UserRole } from '@demoshop/shared-types';
import { staffScheduleService } from '../services/staff-schedule.service';
import { validateCreateGroupReservationDto } from '../validators/group-reservation.validator';

export const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_RECEIPT_BYTES },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png'].includes(file.mimetype)) cb(null, true);
    else cb(new AppError('Only JPEG and PNG receipt images are allowed.', 400));
  },
}).single('receipt');

/**
 * Controller for Queue operations.
 * Extends BaseController for standardized error handling.
 */
const isValidIsoDate = (value: string): boolean => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
};

export class QueueController extends BaseController {
  private async getAuthoritativeUserContext(req: Request): Promise<AuthoritativeUserContext> {
    const user = req.user as any;
    const userId = user?.user_id || user?.id;
    if (!userId || !user?.role) {
      throw new AppError('Unauthorized: user context is unavailable.', 401);
    }

    const configuredBranchId = Number(user.branch_id);
    let branchId = Number.isInteger(configuredBranchId) && configuredBranchId > 0
      ? configuredBranchId
      : null;

    let customerId: number | null = null;
    let barberId: number | null = null;

    if (user.role === UserRole.CUSTOMER) {
      customerId = await customerRepository.findCustomerIdByUserId(userId);
    } else if (user.role === UserRole.BARBER) {
      if (user.barber_id && Number(user.barber_id) > 0) {
        barberId = Number(user.barber_id);
      } else {
        barberId = await barberRepository.findBarberIdByUserId(userId);
      }
      if (!branchId && barberId) {
        branchId = await queueRepository.findBarberBranchId(barberId);
      }
    }

    return {
      userId,
      role: user.role,
      branchId,
      customerId,
      barberId,
    };
  }

  /**
   * POST /api/queue/join
   */
  // TODO: Clean this by creating another worker/util class by wrapping all validations
  async joinQueue(req: Request, res: Response): Promise<void> {
    if (req.body?.isGroup || (Array.isArray(req.body?.guests) && req.body.guests.length > 0)) {
      return this.joinGroupQueue(req, res);
    }

    await this.handleRequest(res, async () => {
      const startedAt = performance.now();
      const userId = (req.user as any)?.user_id || (req.user as any)?.id;
      const {
        barberId,
        branchId,
        serviceIds: rawServiceIds,
        serviceId,
        preferredDate,
        preferredTime,
        referenceNumber,
        proofImageUrl,
        imageHash,
        ocrReferenceNumber,
        recipientIdentifierDetected,
        receiptAmountDetected,
        receiptOcrConfidence,
        receiptTransactionDate,
        imageHashes,
        proofImageUrls,
        agreedToTerms,
        idempotencyKey,
      } = req.body;
      const suppliedServiceIds = Array.isArray(rawServiceIds)
        ? rawServiceIds
        : rawServiceIds === undefined && serviceId !== undefined
          ? [serviceId]
          : [];
      const serviceIds = suppliedServiceIds.map(Number);

      logger.info(`[Queue] User ${userId} requested to join queue for Barber ${barberId} at Branch ${branchId}`);

      if (!barberId || !branchId || serviceIds.length === 0) {
        res.status(400).json({ error: 'barberId, branchId, and at least one serviceId are required.' });
        return;
      }
      if (serviceIds.some(id => !Number.isInteger(id) || id <= 0) || new Set(serviceIds).size !== serviceIds.length) {
        res.status(400).json({ error: 'serviceIds must contain unique positive integers.' });
        return;
      }

      const customerId = await queueRepository.findCustomerIdByUserId(userId);
      if (!customerId) {
        res.status(404).json({ error: 'Customer not found.' });
        return;
      }

      const result = await queueService.joinQueue({
        customerId,
        barberId: Number(barberId),
        branchId: Number(branchId),
        serviceIds,
        preferredDate,
        preferredTime,
        referenceNumber: typeof referenceNumber === 'string' ? referenceNumber : undefined,
        proofImageUrl: typeof proofImageUrl === 'string' ? proofImageUrl : undefined,
        paymentMethod: typeof req.body.paymentMethod === 'string' ? req.body.paymentMethod : undefined,
        paymentMethodId: typeof req.body.paymentMethodId === 'string' ? req.body.paymentMethodId : undefined,
        imageHash: typeof imageHash === 'string' ? imageHash : undefined,
        allowDuplicateReceiptImage: true,
        ocrReferenceNumber: typeof ocrReferenceNumber === 'string' ? ocrReferenceNumber : undefined,
        recipientIdentifierDetected: typeof recipientIdentifierDetected === 'string' ? recipientIdentifierDetected : undefined,
        receiptAmountDetected: Number.isFinite(Number(receiptAmountDetected)) ? Number(receiptAmountDetected) : undefined,
        receiptOcrConfidence: Number.isFinite(Number(receiptOcrConfidence)) ? Number(receiptOcrConfidence) : undefined,
        receiptTransactionDate: typeof receiptTransactionDate === 'string' ? receiptTransactionDate : undefined,
        imageHashes: Array.isArray(imageHashes) ? imageHashes.filter((value: unknown): value is string => typeof value === 'string') : undefined,
        proofImageUrls: Array.isArray(proofImageUrls) ? proofImageUrls.filter((value: unknown): value is string => typeof value === 'string') : undefined,
        agreedToTerms: Boolean(agreedToTerms),
        diagnosticIdempotencyKey: typeof idempotencyKey === 'string'
          && /^[A-Za-z0-9_-]{16,100}$/.test(idempotencyKey)
          ? idempotencyKey
          : undefined,
      });

      logger.info('[QueueController] joinQueue succeeded', {
        event: 'queue_join_request_completed',
        position: result.position,
        duration_ms: Math.round(performance.now() - startedAt),
      });
      res.status(201).json(result);
    }, 'JoinQueue');
  }

  /**
   * POST /api/queue/group-join
   */
  async joinGroupQueue(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const userId = (req.user as any)?.user_id || (req.user as any)?.id;
      const dto = validateCreateGroupReservationDto(req.body);

      const customerId = await queueRepository.findCustomerIdByUserId(userId);
      if (!customerId) {
        res.status(404).json({ error: 'Customer not found.' });
        return;
      }

      const receiptAmountDetected = Number.isFinite(Number(req.body.receiptAmountDetected)) ? Number(req.body.receiptAmountDetected) : undefined;
      const receiptOcrConfidence = Number.isFinite(Number(req.body.receiptOcrConfidence)) ? Number(req.body.receiptOcrConfidence) : undefined;
      const receiptTransactionDate = typeof req.body.receiptTransactionDate === 'string' ? req.body.receiptTransactionDate : undefined;
      const imageHashes = Array.isArray(req.body.imageHashes) ? req.body.imageHashes.filter((value: unknown): value is string => typeof value === 'string') : undefined;
      const proofImageUrls = Array.isArray(req.body.proofImageUrls) ? req.body.proofImageUrls.filter((value: unknown): value is string => typeof value === 'string') : undefined;

      const result = await queueService.joinGroupQueue({
        customerId,
        branchId: dto.branchId,
        preferredDate: dto.preferredDate,
        baseTimeSlot: dto.baseTimeSlot,
        isStaggered: dto.isStaggered,
        guests: dto.guests,
        referenceNumber: dto.referenceNumber,
        proofImageUrl: dto.proofImageUrl,
        paymentMethod: dto.paymentMethod,
        paymentMethodId: dto.paymentMethodId,
        imageHash: dto.imageHash,
        allowDuplicateReceiptImage: true,
        ocrReferenceNumber: dto.ocrReferenceNumber,
        recipientIdentifierDetected: dto.recipientIdentifierDetected,
        receiptAmountDetected,
        receiptOcrConfidence,
        receiptTransactionDate,
        imageHashes,
        proofImageUrls,
        agreedToTerms: dto.agreedToTerms,
      });

      logger.info(`[QueueController] joinGroupQueue — success, groupBookingId: ${result.groupBookingId}, totalGuests: ${result.totalGuests}`);
      res.status(201).json(result);
    }, 'JoinGroupQueue');
  }

  /**
   * GET /api/queue/my-position
   */
  async getMyPosition(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req.user as any)?.user_id || (req.user as any)?.id;
      const customerId = await queueRepository.findCustomerIdByUserId(userId);
      if (!customerId) { res.json(null); return; }

      const result = await queueService.getCustomerActiveQueue(customerId);
      res.json(result);
    } catch (err: any) {
      logger.error(`[QueueController] getMyPosition error: ${err.message}`);
      // Return null instead of 500 so the dashboard doesn't crash
      res.json(null);
    }
  }

  /**
   * POST /api/queue/:queueId/complete (staff only)
   */
  async complete(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const queueId = Number.parseInt(req.params.queueId as string, 10);
      const userContext = await this.getAuthoritativeUserContext(req);
      const specs = req.body && typeof req.body === 'object' ? req.body : undefined;
      const result = await queueService.finishOrder(queueId, userContext.branchId ?? undefined, specs, userContext);
      res.json(result);
    }, 'CompleteQueueEntry');
  }

  async startOfflineService(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const queueId = Number.parseInt(req.params.queueId as string, 10);
      if (!Number.isSafeInteger(queueId) || queueId < 1) throw new AppError('Invalid queue ID.', 400);
      const idempotencyKey = req.body?.idempotencyKey;
      if (typeof idempotencyKey !== 'string' || idempotencyKey.trim() !== idempotencyKey
        || idempotencyKey.length < 12 || idempotencyKey.length > 160) {
        throw new AppError('A valid offline service-start idempotency key is required.', 400);
      }
      const userContext = await this.getAuthoritativeUserContext(req);
      const result = await queueService.recordOfflineServiceStart(queueId, idempotencyKey, userContext);
      res.json(result);
    }, 'StartOfflineService');
  }

  async completeOfflineService(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const queueId = Number.parseInt(req.params.queueId as string, 10);
      if (!Number.isSafeInteger(queueId) || queueId < 1) throw new AppError('Invalid queue ID.', 400);
      const idempotencyKey = req.body?.idempotencyKey;
      if (typeof idempotencyKey !== 'string' || idempotencyKey.trim() !== idempotencyKey
        || idempotencyKey.length < 12 || idempotencyKey.length > 160) {
        throw new AppError('A valid offline service-completion idempotency key is required.', 400);
      }
      const userContext = await this.getAuthoritativeUserContext(req);
      const result = await queueService.completeOfflineService(queueId, idempotencyKey, userContext);
      res.json(result);
    }, 'CompleteOfflineService');
  }

  async editOfflineWalkIn(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const queueId = Number.parseInt(req.params.queueId as string, 10);
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      if (!Number.isSafeInteger(queueId) || queueId < 1) throw new AppError('Invalid queue ID.', 400);
      if (typeof body.idempotencyKey !== 'string' || body.idempotencyKey.trim() !== body.idempotencyKey
        || body.idempotencyKey.length < 12 || body.idempotencyKey.length > 160
        || !Number.isSafeInteger(body.expectedBarberId) || body.expectedBarberId < 1
        || !Array.isArray(body.expectedServiceIds)) {
        throw new AppError('A valid offline edit request is required.', 400);
      }
      const userContext = await this.getAuthoritativeUserContext(req);
      const result = await queueService.editOfflineWalkIn(queueId, {
        idempotencyKey: body.idempotencyKey,
        expectedBarberId: body.expectedBarberId,
        expectedServiceIds: body.expectedServiceIds,
        ...(body.barberId !== undefined ? { barberId: body.barberId } : {}),
        ...(body.serviceIds !== undefined ? { serviceIds: body.serviceIds } : {}),
        ...(body.serviceSnapshot !== undefined ? { serviceSnapshot: body.serviceSnapshot } : {}),
      }, userContext);
      res.json(result);
    }, 'EditOfflineWalkIn');
  }

  async cancelOfflineWalkIn(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const queueId = Number.parseInt(req.params.queueId as string, 10);
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      if (!Number.isSafeInteger(queueId) || queueId < 1) throw new AppError('Invalid queue ID.', 400);
      if (typeof body.idempotencyKey !== 'string' || body.idempotencyKey.trim() !== body.idempotencyKey
        || body.idempotencyKey.length < 12 || body.idempotencyKey.length > 160
        || !Number.isSafeInteger(body.expectedBarberId) || body.expectedBarberId < 1) {
        throw new AppError('A valid offline cancellation request is required.', 400);
      }
      const userContext = await this.getAuthoritativeUserContext(req);
      const result = await queueService.cancelOfflineWalkIn(
        queueId,
        body.idempotencyKey,
        body.expectedBarberId,
        userContext,
      );
      res.json(result);
    }, 'CancelOfflineWalkIn');
  }

  async updateOrder(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const queueId = Number.parseInt(req.params.queueId as string, 10);
      if (!Number.isInteger(queueId) || queueId <= 0) throw new AppError('Invalid queue ID.', 400);
      const userContext = await this.getAuthoritativeUserContext(req);
      const serviceIds = Array.isArray(req.body?.serviceIds) ? req.body.serviceIds.map(Number) : [];
      const result = await queueService.updateOrder(
        queueId,
        serviceIds,
        req.body?.retailItems,
        userContext,
        req.body?.reservationImpact,
      );
      res.json(result);
    }, 'UpdateQueueOrder');
  }

  async updateQueueIdentity(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const queueId = Number.parseInt(req.params.queueId as string, 10);
      if (!Number.isInteger(queueId) || queueId <= 0) throw new AppError('Invalid queue ID.', 400);
      const userContext = await this.getAuthoritativeUserContext(req);
      res.json(await queueService.updateQueueIdentity(queueId, req.body?.customerName, Number(req.body?.barberId), userContext));
    }, 'UpdateQueueIdentity');
  }

  async updateReservationBarber(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const queueId = Number.parseInt(req.params.queueId as string, 10);
      if (!Number.isInteger(queueId) || queueId <= 0) throw new AppError('Invalid reservation ID.', 400);
      const userContext = await this.getAuthoritativeUserContext(req);
      res.json(await queueService.updateReservationBarber(queueId, Number(req.body?.barberId), userContext));
    }, 'UpdateReservationBarber');
  }

  async previewOrderImpact(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const queueId = Number.parseInt(req.params.queueId as string, 10);
      if (!Number.isInteger(queueId) || queueId <= 0) throw new AppError('Invalid queue ID.', 400);
      const userContext = await this.getAuthoritativeUserContext(req);
      const serviceIds = Array.isArray(req.body?.serviceIds) ? req.body.serviceIds.map(Number) : [];
      const result = await queueService.previewOrderImpact(queueId, serviceIds, userContext);
      res.json(result);
    }, 'PreviewQueueOrderImpact');
  }

  async getPaymentQuote(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const queueId = Number.parseInt(req.params.queueId as string, 10);
      if (!Number.isInteger(queueId) || queueId <= 0) throw new AppError('Invalid queue ID.', 400);
      const result = await queueService.getPaymentQuote(queueId, (req.user as any)?.branch_id);
      res.json(result);
    }, 'GetPaymentQuote');
  }

  async getPaymentReceiptUrl(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const queueId = Number.parseInt(req.params.queueId as string, 10);
      if (!Number.isInteger(queueId) || queueId <= 0) throw new AppError('Invalid queue ID.', 400);
      const result = await queueService.getPaymentReceiptUrl(queueId, (req.user as any)?.branch_id);
      res.json(result);
    }, 'GetPaymentReceiptUrl');
  }

  async getReceipt(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const queueId = Number.parseInt(req.params.queueId as string, 10);
      if (!Number.isInteger(queueId) || queueId <= 0) throw new AppError('Invalid queue ID.', 400);
      const receipt = await receiptService.getByQueueId(queueId, (req.user as any)?.branch_id, true);
      if (!receipt) throw new AppError('Receipt was not found.', 404);
      res.json(receipt);
    }, 'GetReceipt');
  }

  async recordOfflineReceiptPrintHistory(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const queueId = Number.parseInt(req.params.queueId as string, 10);
      if (!Number.isSafeInteger(queueId) || queueId < 1) throw new AppError('Invalid queue ID.', 400);
      const branchId = Number((req.user as any)?.branch_id);
      if (!Number.isSafeInteger(branchId) || branchId < 1) throw new AppError('A branch-scoped cashier session is required.', 403);
      const body = req.body || {};
      const userId = (req.user as any)?.user_id;
      const cashierId = typeof userId === 'string'
        && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)
        ? userId
        : null;
      if (typeof body.idempotencyKey !== 'string' || body.idempotencyKey.trim() !== body.idempotencyKey
        || body.idempotencyKey.length < 12 || body.idempotencyKey.length > 160) {
        throw new AppError('A valid print-history idempotency key is required.', 400);
      }
      const attempt = Number(body.attempt);
      if (!Number.isSafeInteger(attempt) || attempt < 1 || typeof body.isReprint !== 'boolean') {
        throw new AppError('A valid print attempt and reprint flag are required.', 400);
      }
      if (!['printed', 'print_requested', 'print_failed'].includes(body.outcome)) {
        throw new AppError('A valid print outcome is required.', 400);
      }
      const clientOccurredAt = Number(body.clientOccurredAt);
      if (!Number.isFinite(clientOccurredAt)) throw new AppError('A valid print timestamp is required.', 400);
      const errorMessage = body.errorMessage === null || body.errorMessage === undefined
        ? null
        : typeof body.errorMessage === 'string' ? body.errorMessage.slice(0, 500) : null;
      const result = await cashierOfflineReceiptPrintService.record({
        queueEntryId: queueId,
        branchId,
        cashierId,
        idempotencyKey: body.idempotencyKey,
        attempt,
        outcome: body.outcome,
        isReprint: body.isReprint,
        errorMessage,
        clientOccurredAt: new Date(clientOccurredAt).toISOString(),
      });
      res.json(result);
    }, 'RecordOfflineReceiptPrintHistory');
  }

  async retryReceiptEmail(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const queueId = Number.parseInt(req.params.queueId as string, 10);
      if (!Number.isInteger(queueId) || queueId <= 0) throw new AppError('Invalid queue ID.', 400);
      const receipt = await receiptService.retryEmail(queueId, (req.user as any)?.branch_id);
      res.json(receipt);
    }, 'RetryReceiptEmail');
  }

  async markPaid(req: Request, res: Response): Promise<void> {
    const startedAt = performance.now();
    await this.handleRequest(res, async () => {
      const queueId = Number.parseInt(req.params.queueId as string, 10);
      if (!Number.isInteger(queueId) || queueId <= 0) throw new AppError('Invalid queue ID.', 400);
      const { idempotencyKey, method, amount, gcashReference, cashReceivedAmount } = req.body || {};
      const branchId = (req.user as any)?.branch_id;
      const isCashMethod = typeof method === 'string' && method.trim().toLowerCase() === 'cash';
      const receiptEvidence = !isCashMethod && req.file ? validateReceiptEvidence(req.file) : undefined;
      const result = await paymentAttemptService.create({
        queueId,
        branchId,
        submittedBy: (req.user as any)?.user_id || (req.user as any)?.id || null,
        method,
        amount: Number(amount),
        cashReceivedAmount: cashReceivedAmount === undefined ? undefined : Number(cashReceivedAmount),
        idempotencyKey: typeof idempotencyKey === 'string' ? idempotencyKey : '',
        gcashReference,
        recipientIdentifierDetected: typeof req.body.recipientIdentifierDetected === 'string' ? req.body.recipientIdentifierDetected : undefined,
        merchantIdentity: req.body.merchantIdentity,
        transactionDate: req.body.transactionDate,
        receiptBuffer: req.file?.buffer,
        receiptEvidence,
        cashierConfirmed: req.body.cashierConfirmed === true || req.body.cashierConfirmed === 'true',
        req,
      });
      res.setHeader('Server-Timing', `checkout;dur=${(performance.now() - startedAt).toFixed(1)}`);
      if (result.httpStatus === 202 || result.pendingVerification) res.status(202).json(result);
      else res.json(result);
    }, 'MarkQueueEntryPaid');
  }

  /**
   * POST /api/queue/:queueId/check-in (staff only)
   */
  async checkIn(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const queueId = Number.parseInt(req.params.queueId as string, 10);
      const userContext = await this.getAuthoritativeUserContext(req);
      const result = await queueService.checkInReservation(queueId, userContext.branchId ?? undefined, userContext);
      res.json(result);
    }, 'CheckInReservation');
  }

  /**
   * POST /api/queue/group/:groupBookingId/check-in (staff only)
   */
  async checkInGroup(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const groupBookingId = String(req.params.groupBookingId || '').trim();
      if (!groupBookingId) throw new AppError('Invalid group booking ID.', 400);
      const userContext = await this.getAuthoritativeUserContext(req);
      const result = await queueService.checkInGroupReservation(
        groupBookingId,
        userContext.branchId ?? undefined,
        userContext,
      );
      res.json(result);
    }, 'CheckInGroupReservation');
  }

  /**
   * POST /api/queue/:queueId/no-show (staff only)
   */
  async noShow(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const queueId = Number.parseInt(req.params.queueId as string, 10);
      const userContext = await this.getAuthoritativeUserContext(req);
      const result = await queueService.markReservationNoShow(queueId, userContext.branchId ?? undefined, userContext);
      res.json(result);
    }, 'NoShowReservation');
  }

  /**
   * GET /api/queue/barber/:barberId
   */
  async getBarberQueue(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const barberId = req.params.barberId as string;
      const parsedBarberId = parseInt(barberId, 10);
      if (isNaN(parsedBarberId) || parsedBarberId <= 0) {
        throw new AppError('Invalid barber ID.', 400);
      }
      const rawDate = typeof req.query.date === 'string' ? req.query.date.trim() : undefined;
      const preferredDate = rawDate && isValidIsoDate(rawDate) ? rawDate : undefined;
      const userContext = await this.getAuthoritativeUserContext(req);
      const result = await queueService.getBarberQueue(parsedBarberId, userContext.branchId ?? undefined, preferredDate, userContext);
      res.json(result);
    }, 'GetBarberQueue');
  }

  /**
   * PATCH /api/queue/cancel/:queueId
   */
  async cancelQueue(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const queueId = req.params.queueId as string;
      const parsedQueueId = parseInt(queueId, 10);
      if (isNaN(parsedQueueId)) {
        throw new AppError('Invalid queue ID.', 400);
      }
      try {
        const userContext = await this.getAuthoritativeUserContext(req);
        const customerId = userContext.customerId ?? undefined;

        logger.info(
          `[QueueController] cancelQueue — queueId: ${parsedQueueId}, role: ${userContext.role}, customerId: ${customerId ?? 'none'}`
        );

        if (userContext.role === UserRole.CUSTOMER && !customerId) {
          throw new AppError('Customer not found.', 404);
        }
        const { reason } = req.body || {};
        const normalizedReason = typeof reason === 'string' ? reason.trim() : undefined;
        const result = await queueService.cancelQueue(
          parsedQueueId,
          customerId,
          normalizedReason,
          userContext,
        );
        res.json({ message: 'Queue entry cancelled.', queue: result });
      } catch (err: any) {
        console.error('[CancelQueue Error]:', err);
        if (err instanceof AppError) throw err;
        throw new AppError(err.message || 'Failed to cancel queue entry', 500);
      }
    }, 'CancelQueue');
  }

  /**
   * PATCH /api/queue/advance/:barberId
   */
  async advanceQueue(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const barberId = req.params.barberId as string;
      const userContext = await this.getAuthoritativeUserContext(req);
      const result = await queueService.advanceQueue(parseInt(barberId), userContext);
      res.json({ message: 'Queue advanced.', queue: result });
    }, 'AdvanceQueue');
  }

  /**
   * GET /api/queue/availability
   */
  async getAvailability(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const { barberId, branchId, date, serviceIds: rawServiceIds, serviceId } = req.query;
      if (!barberId || !branchId) { res.status(400).json({ error: 'barberId and branchId are required.' }); return; }

      const parsedBarberId = Number(barberId);
      if (!Number.isInteger(parsedBarberId) || parsedBarberId <= 0) {
        res.status(400).json({ error: 'barberId must be a positive integer.' });
        return;
      }

      const parsedBranchId = Number(branchId);
      if (!Number.isInteger(parsedBranchId) || parsedBranchId <= 0) {
        res.status(400).json({ error: 'branchId must be a positive integer.' });
        return;
      }

      const serviceIdsValue = Array.isArray(rawServiceIds) ? rawServiceIds.join(',') : rawServiceIds;
      const serviceIds = String(serviceIdsValue ?? serviceId ?? '')
        .split(',')
        .filter(Boolean)
        .map(Number);

      if (serviceIds.some(id => !Number.isInteger(id) || id <= 0) || new Set(serviceIds).size !== serviceIds.length) {
        res.status(400).json({ error: 'serviceIds must contain unique positive integers.' });
        return;
      }

      const requestedDate = typeof date === 'string' ? date.trim() : '';
      if (!isValidIsoDate(requestedDate)) {
        res.status(400).json({ error: 'date must be a valid ISO date in YYYY-MM-DD format.' });
        return;
      }

      const result = await queueService.getAvailability(parsedBarberId, parsedBranchId, requestedDate, serviceIds);
      res.json(result);
    }, 'GetAvailability');
  }

  /**
   * GET /api/queue/availability/batch
   * Returns availability for all active branch barbers in one public request.
   */
  async getBatchAvailability(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const { branchId, date, serviceIds: rawServiceIds, barberIds: rawBarberIds } = req.query;
      const parsedBranchId = Number(branchId);
      if (!Number.isInteger(parsedBranchId) || parsedBranchId <= 0) {
        res.status(400).json({ error: 'branchId must be a positive integer.' });
        return;
      }

      const requestedDate = typeof date === 'string' ? date.trim() : '';
      if (!isValidIsoDate(requestedDate)) {
        res.status(400).json({ error: 'date must be a valid ISO date in YYYY-MM-DD format.' });
        return;
      }

      const parsePositiveIds = (rawValue: unknown): number[] => {
        const value = Array.isArray(rawValue) ? rawValue.join(',') : rawValue;
        return String(value ?? '')
          .split(',')
          .filter(Boolean)
          .map(Number);
      };

      const serviceIds = parsePositiveIds(rawServiceIds);
      if (serviceIds.some(id => !Number.isInteger(id) || id <= 0) || new Set(serviceIds).size !== serviceIds.length) {
        res.status(400).json({ error: 'serviceIds must contain unique positive integers.' });
        return;
      }

      const barberIds = parsePositiveIds(rawBarberIds);
      if (barberIds.some(id => !Number.isInteger(id) || id <= 0) || new Set(barberIds).size !== barberIds.length) {
        res.status(400).json({ error: 'barberIds must contain unique positive integers.' });
        return;
      }

      const result = await queueService.getBatchAvailability(
        parsedBranchId,
        requestedDate,
        serviceIds,
        barberIds,
      );
      res.json(result);
    }, 'GetBatchAvailability');
  }

  /**
   * GET /api/queue/public/branches
   */
  async getPublicBranches(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const rawName = (req.query as Record<string, unknown>).name;
      let name: string | undefined = undefined;
      if (typeof rawName === 'string') {
        const trimmed = rawName.trim();
        if (trimmed.length > 100) {
          res.status(400).json({ error: 'Branch name query must be 100 characters or fewer.' });
          return;
        }
        name = trimmed;
      }
      const result = await branchService.getPublicBranches(name as string);
      res.json(result);
    }, 'GetPublicBranches');
  }

  /**
   * GET /api/queue/public/barbers
   */
  async getPublicBarbers(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const rawBranchId = (req.query as Record<string, unknown>).branchId;
      let requestedBranchId: string | undefined = undefined;
      if (rawBranchId !== undefined && rawBranchId !== null && String(rawBranchId).trim() !== '') {
        const parsedBranchId = Number(rawBranchId);
        if (!Number.isInteger(parsedBranchId) || parsedBranchId <= 0) {
          res.status(400).json({ error: 'branchId must be a positive integer.' });
          return;
        }
        requestedBranchId = String(parsedBranchId);
      }

      const rawDate = (req.query as Record<string, unknown>).date || (req.query as Record<string, unknown>).targetDate;
      let requestedDate: string | undefined = undefined;
      if (rawDate !== undefined && rawDate !== null && String(rawDate).trim() !== '') {
        const trimmedDate = String(rawDate).trim();
        if (!isValidIsoDate(trimmedDate)) {
          res.status(400).json({ error: 'date must be a valid ISO date in YYYY-MM-DD format.' });
          return;
        }
        requestedDate = trimmedDate;
      }

      const includeUnavailable = String((req.query as Record<string, unknown>).includeUnavailable || '').toLowerCase() === 'true';
      const result = await barberService.getPublicBarbers(requestedBranchId, requestedDate, includeUnavailable);
      res.json(result);
    }, 'GetPublicBarbers');
  }

  /**
   * GET /api/queue/:queueId
   */
  async getQueueEntry(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const queueId = parseInt(req.params.queueId as string, 10);
      if (isNaN(queueId) || queueId <= 0) {
        res.status(404).json({ error: 'Queue entry not found.' });
        return;
      }

      const userContext = await this.getAuthoritativeUserContext(req);
      const result = await queueService.getQueueEntry(queueId, userContext);
      if (!result) {
        res.status(404).json({ error: 'Queue entry not found.' });
        return;
      }
      res.json(result);
    }, 'GetQueueEntry');
  }

  /**
   * GET /api/queue/public/barber-schedule
   */
  async getPublicBarberSchedule(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const { barberId, startDate, endDate } = req.query;
      if (!barberId) {
        res.status(400).json({ error: 'barberId is required.' });
        return;
      }
      const parsedBarberId = Number(barberId);
      if (!Number.isInteger(parsedBarberId) || parsedBarberId <= 0) {
        res.status(400).json({ error: 'barberId must be a positive integer.' });
        return;
      }
      const rawStartDate = typeof startDate === 'string' ? startDate.trim() : '';
      const rawEndDate = typeof endDate === 'string' ? endDate.trim() : '';
      if (rawStartDate && !isValidIsoDate(rawStartDate)) {
        res.status(400).json({ error: 'startDate must be a valid ISO date in YYYY-MM-DD format.' });
        return;
      }
      if (rawEndDate && !isValidIsoDate(rawEndDate)) {
        res.status(400).json({ error: 'endDate must be a valid ISO date in YYYY-MM-DD format.' });
        return;
      }
      const from = rawStartDate || undefined;
      const to = rawEndDate || undefined;
      const result = await staffScheduleService.getBarberSchedulePublic(parsedBarberId, from, to);
      res.json(result);
    }, 'GetPublicBarberSchedule');
  }

  /**
   * GET /api/queue/public/barber-schedules
   * Returns the requested date range for every active barber in a branch.
   */
  async getPublicBarberSchedules(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const branchId = Number(req.query.branchId);
      const startDate = typeof req.query.startDate === 'string' ? req.query.startDate.trim() : '';
      const endDate = typeof req.query.endDate === 'string' ? req.query.endDate.trim() : '';
      if (!Number.isInteger(branchId) || branchId <= 0) {
        res.status(400).json({ error: 'branchId must be a positive integer.' });
        return;
      }
      if (!isValidIsoDate(startDate) || !isValidIsoDate(endDate)) {
        res.status(400).json({ error: 'startDate and endDate must be valid ISO dates in YYYY-MM-DD format.' });
        return;
      }

      const schedules = await staffScheduleService.getPublicBarberSchedules(branchId, startDate, endDate);
      res.json({ branchId, startDate, endDate, schedules });
    }, 'GetPublicBarberSchedules');
  }

  /**
   * GET /api/queue/check-reference?referenceNumber=...
   */
  async checkReference(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const referenceNumber = String((req.query as Record<string, unknown>).referenceNumber || (req.query as Record<string, unknown>).ref || '').trim();
      const imageHash = String((req.query as Record<string, unknown>).imageHash || '').trim();
      const result = await queueService.checkReferenceUniqueness(referenceNumber, imageHash);
      res.json(result);
    }, 'CheckReference');
  }
}

const controller = new QueueController();

export const joinQueue = controller.joinQueue.bind(controller);
export const joinGroupQueue = controller.joinGroupQueue.bind(controller);
export const getMyPosition = controller.getMyPosition.bind(controller);
export const complete = controller.complete.bind(controller);
export const startOfflineService = controller.startOfflineService.bind(controller);
export const completeOfflineService = controller.completeOfflineService.bind(controller);
export const editOfflineWalkIn = controller.editOfflineWalkIn.bind(controller);
export const cancelOfflineWalkIn = controller.cancelOfflineWalkIn.bind(controller);
export const updateOrder = controller.updateOrder.bind(controller);
export const updateQueueIdentity = controller.updateQueueIdentity.bind(controller);
export const updateReservationBarber = controller.updateReservationBarber.bind(controller);
export const previewOrderImpact = controller.previewOrderImpact.bind(controller);
export const getPaymentQuote = controller.getPaymentQuote.bind(controller);
export const getPaymentReceiptUrl = controller.getPaymentReceiptUrl.bind(controller);
export const getReceipt = controller.getReceipt.bind(controller);
export const recordOfflineReceiptPrintHistory = controller.recordOfflineReceiptPrintHistory.bind(controller);
export const retryReceiptEmail = controller.retryReceiptEmail.bind(controller);
export const markPaid = controller.markPaid.bind(controller);
export const checkIn = controller.checkIn.bind(controller);
export const checkInGroup = controller.checkInGroup.bind(controller);
export const noShow = controller.noShow.bind(controller);
export const getBarberQueue = controller.getBarberQueue.bind(controller);
export const getPublicBarberSchedules = controller.getPublicBarberSchedules.bind(controller);
export const cancelQueue = controller.cancelQueue.bind(controller);
export const advanceQueue = controller.advanceQueue.bind(controller);
export const getAvailability = controller.getAvailability.bind(controller);
export const getBatchAvailability = controller.getBatchAvailability.bind(controller);
export const getPublicBranches = controller.getPublicBranches.bind(controller);
export const getPublicBarbers = controller.getPublicBarbers.bind(controller);
export const getPublicBarberSchedule = controller.getPublicBarberSchedule.bind(controller);
export const getQueueEntry = controller.getQueueEntry.bind(controller);
export const checkReference = controller.checkReference.bind(controller);

export default controller;
