import { Request, Response } from 'express';
import { BaseController } from './base.controller';
import { cashierService as defaultCashierService } from '../services/cashier.service';
import { queueService as defaultQueueService } from '../services/queue.service';
import defaultLogger from "../utils/general/logger";
import { AppError } from '../utils/error/AppError';
import { guestService as defaultGuestService } from '../services/guest.service';
import { auditService as defaultAuditService } from '../services/audit.service';
import { receiptPrintJobService as defaultReceiptPrintJobService } from '../services/receipt-print-job.service';
import { invoiceProfileService } from '../services/invoice-profile.service';
import { receiptEvidenceUpload } from './payment-attempt.controller';
import { validateReceiptEvidence } from '../utils/cashier/receipt-evidence.util';

const isValidIsoDate = (value: string): boolean => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime())
    && date.getUTCFullYear() === Number(match[1])
    && date.getUTCMonth() + 1 === Number(match[2])
    && date.getUTCDate() === Number(match[3]);
};

interface CashierServicePort {
  finishOrder(id: string, branchId: number): Promise<any>;
  createWalkIn(data: any): Promise<any>;
  createRetailSale(data: any): Promise<any>;
  getDailySummary(branchId: number): Promise<any>;
  getWeeklyPerformance(branchId: number): Promise<any>;
  getBarberBreakdown(branchId: number, dateRange?: string): Promise<any>;
  getDashboardSnapshot(branchId: number, options?: any): Promise<any>;
  getRecentTransactions(...args: any[]): Promise<any>;
  getCustomersServed(...args: any[]): Promise<any>;
  updateBarberStatus(id: string, status: string, branchId: number, actorId?: string | null, req?: any): Promise<any>;
  recordReservationFee(branchId: number, queueId: number, data: any): Promise<any>;
  addReservationFeeGcashReference(branchId: number, transactionId: number, reference: string): Promise<any>;
  addReservationFeeGcashReceipt(branchId: number, transactionId: number, buffer: Buffer, evidence: any, reference?: string): Promise<any>;
  getReservationFeeGcashReceiptUrl(branchId: number, transactionId: number): Promise<any>;
  getPendingReservations(branchId?: number, statusFilter?: string | string[]): Promise<any[]>;
  getPendingReservationsCount(branchId?: number): Promise<number>;
  getQueueSnapshot(branchId: number, targetDate?: string): Promise<any>;
}

interface QueueServicePort {
  createCashierReservation(data: { customerName: string; barberId: number; branchId: number; serviceIds: number[]; preferredDate: string; preferredTime: string; paymentMethod: 'Cash' | 'GCash'; idempotencyKey: string }): Promise<any>;
  acceptReservation(id: number, branchId?: number, options?: { cashierName?: string }): Promise<any>;
  declineReservation(id: number, branchId?: number, reason?: string, cancelType?: string, options?: { cashierName?: string; preventPendingReservationDecision?: boolean }): Promise<any>;
}

interface GuestServicePort {
  redeemQrToken(token: string, branchId?: number): Promise<any>;
  getByReference(branchId: number, reference: string): Promise<any>;
  regenerateQrToken(branchId: number, guestProfileId: number): Promise<any>;
}

interface AuditServicePort {
  logSecurityEvent(input: any): Promise<any>;
}

interface LoggerPort {
  error(message: string, metadata?: any): void;
}

interface ReceiptPrintJobServicePort {
  claim(branchId: number, stationId: unknown): Promise<any>;
  complete(branchId: number, jobId: number, stationId: unknown): Promise<void>;
  fail(branchId: number, jobId: number, stationId: unknown, error: unknown): Promise<void>;
  retry(branchId: number, jobId: number): Promise<void>;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * guest_profiles.created_by is a UUID foreign key. Some older user objects
 * still expose an internal numeric `id`; never pass that value to Postgres.
 */
const getCreatedByUuid = (user: any): string | undefined => {
  const candidates = [user?.user_id, user?.id];
  const uuid = candidates.find((value) => typeof value === 'string' && UUID_PATTERN.test(value));
  return uuid;
};

/**
 * Controller for Cashier operations.
 * Extends BaseController for standardized error handling.
 */
export class CashierController extends BaseController {
  constructor(
    private readonly cashierService: CashierServicePort = defaultCashierService,
    private readonly queueService: QueueServicePort = defaultQueueService,
    private readonly guestService: GuestServicePort = defaultGuestService,
    private readonly auditService: AuditServicePort = defaultAuditService,
    private readonly logger: LoggerPort = defaultLogger,
    private readonly receiptPrintJobService: ReceiptPrintJobServicePort = defaultReceiptPrintJobService,
  ) {
    super();
  }
  async finishOrder(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const branchId = (req.user as any)?.branch_id;
      const finishedOrder = await this.cashierService.finishOrder(id, branchId);
      res.json({ success: true, message: 'Order finished and receipt printed.', order: finishedOrder });
    } catch (err: any) {
      // Detect network errors for offline fallback
      if (err.message?.includes('ENOTFOUND') || err.message?.includes('ECONNRESET') || err.message?.includes('Connection terminated')) {
        res.status(503).json({ error: 'Database connection failed', isNetworkError: true });
        return;
      }
      this.logger.error(`[CashierController] finishOrder error: ${err.message}`, { stack: err.stack });
      if (err.status) { res.status(err.status).json({ error: err.message }); return; }
      res.status(500).json({ error: 'Server error' });
    }
  }

  async createWalkIn(req: Request, res: Response): Promise<void> {
    const startedAt = performance.now();
    try {
      const { customerName, barberId, serviceIds, retailItems, idempotencyKey, isPrePaid, paymentLines, reservationCode } = req.body;
      const branchId = (req.user as any)?.branch_id;
      const createdBy = getCreatedByUuid(req.user);
      const result = await this.cashierService.createWalkIn({
        customerName,
        barberId,
        serviceIds,
        retailItems,
        idempotencyKey,
        paymentLines,
        reservationCode,
        branchId,
        createdBy: createdBy || undefined,
        isPrePaid,
      });
      if (result?.guestReference) {
        void this.auditService.logSecurityEvent({
          userId: (req.user as any)?.id || (req.user as any)?.user_id || null,
          action: 'GUEST_PROFILE_CREATED',
          resource: 'guest_profiles',
          details: { event: 'guest_profile_created', branch_id: branchId, status: 'issued' },
          req,
        }).catch((auditErr: any) => {
          this.logger.error(`[CashierController] Failed to log GUEST_PROFILE_CREATED audit event: ${auditErr?.message}`);
        });
      }
      res.setHeader('Server-Timing', `checkout;dur=${(performance.now() - startedAt).toFixed(1)}`);
      res.status(201).json(result);
    } catch (err: any) {
      if (err.code === 'ENOTFOUND' || err.message?.includes('ENOTFOUND') || err.message?.includes('ECONNRESET') || err.message?.includes('Connection terminated')) {
        res.status(503).json({ error: 'Database connection failed', isNetworkError: true });
        return;
      }
      this.logger.error(`[CashierController] createWalkIn error: ${err.message}`, { stack: err.stack });
      if (err.status) {
        res.status(err.status).json({ error: err.message, message: err.message, ...(err.metadata || {}) });
        return;
      }
      res.status(500).json({ error: 'Server error' });
    }
  }

  async createRetailSale(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const branchId = (req.user as any)?.branch_id;
      const createdBy = String((req.user as any)?.id || (req.user as any)?.user_id || '');
      const result = await this.cashierService.createRetailSale({
        customerName: req.body?.customerName,
        branchId,
        items: req.body?.items,
        paymentMethod: req.body?.paymentMethod,
        gcashRefNo: req.body?.gcashRefNo,
        idempotencyKey: req.body?.idempotencyKey,
        createdBy: createdBy || undefined,
      });
      res.status(201).json(result);
    }, 'CreateRetailSale');
  }

  async claimPrintJob(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const branchId = Number((req.user as any)?.branch_id);
      const job = await this.receiptPrintJobService.claim(branchId, req.body?.stationId);
      res.json({ job });
    }, 'ClaimPrintJob');
  }

  async completePrintJob(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const branchId = Number((req.user as any)?.branch_id);
      const jobId = Number(req.params.id);
      await this.receiptPrintJobService.complete(branchId, jobId, req.body?.stationId);
      res.json({ success: true });
    }, 'CompletePrintJob');
  }

  async failPrintJob(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const branchId = Number((req.user as any)?.branch_id);
      const jobId = Number(req.params.id);
      await this.receiptPrintJobService.fail(branchId, jobId, req.body?.stationId, req.body?.error);
      res.json({ success: true });
    }, 'FailPrintJob');
  }

  async retryPrintJob(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const branchId = Number((req.user as any)?.branch_id);
      const jobId = Number(req.params.id);
      await this.receiptPrintJobService.retry(branchId, jobId);
      res.json({ success: true });
    }, 'RetryPrintJob');
  }

  async redeemGuestQr(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const token = req.body?.token;
      const branchId = (req.user as any)?.branch_id;
      if (typeof token !== 'string' || token.length > 128) {
        throw new AppError('Guest QR code is invalid or expired.', 404);
      }
      const result = await this.guestService.redeemQrToken(token, branchId);
      await this.auditService.logSecurityEvent({
        userId: (req.user as any)?.id || (req.user as any)?.user_id || null,
        action: 'GUEST_QR_REDEEMED',
        resource: 'guest_profiles',
        details: { event: 'guest_qr_redeemed', branch_id: branchId, status: 'redeemed' },
        req,
      });
      res.json(result);
    }, 'RedeemGuestQr');
  }

  async getGuestByReference(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const branchId = (req.user as any)?.branch_id;
      const result = await this.guestService.getByReference(branchId, String(req.params.reference || ''));
      res.json(result);
    }, 'GetGuestByReference');
  }

  async regenerateGuestQr(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const branchId = (req.user as any)?.branch_id;
      const guestProfileId = Number.parseInt(String(req.params.id || ''), 10);
      const result = await this.guestService.regenerateQrToken(branchId, guestProfileId);
      await this.auditService.logSecurityEvent({
        userId: (req.user as any)?.id || (req.user as any)?.user_id || null,
        action: 'GUEST_QR_REISSUED',
        resource: 'guest_profiles',
        details: { event: 'guest_qr_reissued', branch_id: branchId, status: 'issued' },
        req,
      });
      res.json(result);
    }, 'RegenerateGuestQr');
  }

  async getDailySummary(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const branchId = (req.user as any)?.branch_id;
      const result = await this.cashierService.getDailySummary(branchId);
      res.json(result);
    }, 'GetDailySummary');
  }

  async getWeeklyPerformance(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const branchId = (req.user as any)?.branch_id;
      const result = await this.cashierService.getWeeklyPerformance(branchId);
      res.json(result);
    }, 'GetWeeklyPerformance');
  }

  async getBarberBreakdown(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const branchId = (req.user as any)?.branch_id;
      const dateRangeValue = typeof req.query.dateRange === 'string' ? req.query.dateRange : 'today';
      const dateRange = ['today', 'week', 'month'].includes(dateRangeValue) ? dateRangeValue : 'today';
      const result = await this.cashierService.getBarberBreakdown(branchId, dateRange);
      res.json(result);
    }, 'GetBarberBreakdown');
  }

  async getDashboardSnapshot(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const branchId = (req.user as any)?.branch_id;
      const parsePositiveInt = (value: unknown, fallback: number): number => {
        const parsed = Number.parseInt(String(value ?? ''), 10);
        return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
      };
      const sections = typeof req.query.sections === 'string'
        ? req.query.sections.split(',').map((section) => section.trim().toLowerCase()).filter(Boolean)
        : undefined;
      const dateRangeValue = typeof req.query.dateRange === 'string' ? req.query.dateRange : 'all';
      const dateRange = ['all', 'today', 'week', 'month'].includes(dateRangeValue) ? dateRangeValue : 'all';
      const barberDateRangeValue = typeof req.query.barberDateRange === 'string' ? req.query.barberDateRange : 'today';
      const barberDateRange = ['today', 'week', 'month'].includes(barberDateRangeValue) ? barberDateRangeValue : 'today';
      const barberIdValue = Number.parseInt(String(req.query.barberId || ''), 10);
      const barberId = Number.isInteger(barberIdValue) && barberIdValue > 0 ? barberIdValue : undefined;
      const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : undefined;

      const result = await this.cashierService.getDashboardSnapshot(branchId, {
        sections,
        barberDateRange,
        dateRange,
        barberId,
        search,
        page: parsePositiveInt(req.query.page, 1),
        limit: Math.min(parsePositiveInt(req.query.limit, 5), 5),
      });
      res.json(result);
    }, 'GetDashboardSnapshot');
  }

  async getRecentTransactions(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const branchId = (req.user as any)?.branch_id;
      const page = Number.parseInt(String(req.query.page || '1'), 10);
      const limit = Number.parseInt(String(req.query.limit || '5'), 10);
      const dateRangeValue = typeof req.query.dateRange === 'string' ? req.query.dateRange : 'all';
      const dateRange = ['all', 'today', 'week', 'month'].includes(dateRangeValue) ? dateRangeValue : 'all';
      const barberIdValue = Number.parseInt(String(req.query.barberId || ''), 10);
      const barberId = Number.isInteger(barberIdValue) && barberIdValue > 0 ? barberIdValue : undefined;
      const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : undefined;
      const result = await this.cashierService.getRecentTransactions(branchId, page, limit, {
        dateRange,
        barberId,
        search,
      });
      res.json(result);
    }, 'GetRecentTransactions');
  }

  /**
   * Returns paginated sales for the current business day (Asia/Manila).
   * Backs the /cashier/sale/today page.
   */
  async getTodaySales(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const branchId = (req.user as any)?.branch_id;
      const page = Number.parseInt(String(req.query.page || '1'), 10);
      const limit = Number.parseInt(String(req.query.limit || '6'), 10);
      const sortBy = typeof req.query.sortBy === 'string' ? req.query.sortBy : undefined;
      const result = await this.cashierService.getRecentTransactions(branchId, page, limit, {
        todayOnly: true,
        sortBy,
        maxLimit: 50,
      });
      res.json(result);
    }, 'GetTodaySales');
  }

  async addReservationFeeGcashReference(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const transactionId = Number.parseInt(req.params.id as string, 10);
      if (!Number.isInteger(transactionId) || transactionId <= 0) throw new AppError('Invalid transaction ID.', 400);
      const branchId = Number((req.user as any)?.branch_id);
      const { reference } = req.body || {};
      const transaction = await this.cashierService.addReservationFeeGcashReference(branchId, transactionId, reference);
      res.json({ transaction });
    }, 'AddReservationFeeGcashReference');
  }

  async addReservationFeeGcashReceipt(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const transactionId = Number.parseInt(req.params.id as string, 10);
      if (!Number.isInteger(transactionId) || transactionId <= 0) throw new AppError('Invalid transaction ID.', 400);
      if (!req.file) throw new AppError('A receipt image is required.', 400);
      const evidence = validateReceiptEvidence(req.file);
      const branchId = Number((req.user as any)?.branch_id);
      const transaction = await this.cashierService.addReservationFeeGcashReceipt(
        branchId,
        transactionId,
        req.file.buffer,
        evidence,
        req.body?.reference,
      );
      res.json({ transaction });
    }, 'AddReservationFeeGcashReceipt');
  }

  async getReservationFeeGcashReceiptUrl(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const transactionId = Number.parseInt(req.params.id as string, 10);
      if (!Number.isInteger(transactionId) || transactionId <= 0) throw new AppError('Invalid transaction ID.', 400);
      const branchId = Number((req.user as any)?.branch_id);
      res.json(await this.cashierService.getReservationFeeGcashReceiptUrl(branchId, transactionId));
    }, 'GetReservationFeeGcashReceiptUrl');
  }

  /**
   * Returns paginated completed customer service history for the branch.
   * Backs the /cashier/customers-served page.
   */
  async getCustomersServed(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const branchId = (req.user as any)?.branch_id;
      const page = Number.parseInt(String(req.query.page || '1'), 10);
      const limit = Number.parseInt(String(req.query.limit || '6'), 10);
      const sortBy = typeof req.query.sortBy === 'string' ? req.query.sortBy : undefined;
      const result = await this.cashierService.getCustomersServed(branchId, page, limit, {
        sortBy,
        maxLimit: 50,
      });
      res.json(result);
    }, 'GetCustomersServed');
  }

  async updateBarberStatus(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const id = req.params.id as string;
      const { status } = req.body;
      const branchId = (req.user as any)?.branch_id;
      const actorId = (req.user as any)?.user_id || (req.user as any)?.id;
      const result = await this.cashierService.updateBarberStatus(id, status, branchId, actorId, req);
      res.json(result);
    }, 'UpdateBarberStatus');
  }

  async acceptReservation(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const id = req.params.id as string;
      const numId = Number.parseInt(id, 10);
      if (!Number.isInteger(numId) || numId <= 0) {
        throw new AppError('Invalid reservation ID.', 400);
      }
      const cashierName = (req.user as any)?.username || (req.user as any)?.name || (req.user as any)?.first_name || 'Front Desk Cashier';
      const result = await this.queueService.acceptReservation(numId, (req.user as any)?.branch_id, { cashierName });
      res.json(result);
    }, 'AcceptReservation');
  }

  async createManualReservation(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const { customerName, barberId, serviceId, preferredDate, preferredTime, paymentMethod, idempotencyKey } = req.body || {};
      const branchId = Number((req.user as any)?.branch_id);
      if (!Number.isInteger(branchId) || branchId <= 0) throw new AppError('A valid cashier branch is required.', 400);
      if (typeof customerName !== 'string' || customerName.trim().length < 2 || customerName.trim().length > 100) {
        throw new AppError('Enter a customer name between 2 and 100 characters.', 400);
      }
      if (!Number.isSafeInteger(Number(barberId)) || Number(barberId) <= 0 || !Number.isSafeInteger(Number(serviceId)) || Number(serviceId) <= 0) {
        throw new AppError('Select a valid barber and service.', 400);
      }
      if (typeof preferredDate !== 'string' || !isValidIsoDate(preferredDate) || typeof preferredTime !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(preferredTime)) {
        throw new AppError('Select a valid reservation date and time.', 400);
      }
      if (typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(idempotencyKey)) {
        throw new AppError('A valid request key is required.', 400);
      }
      const selectedPaymentMethod = paymentMethod === undefined ? 'Cash' : paymentMethod;
      if (selectedPaymentMethod !== 'Cash' && selectedPaymentMethod !== 'GCash') {
        throw new AppError('Payment method must be Cash or GCash.', 400);
      }
      const result = await this.queueService.createCashierReservation({
        customerName: customerName.trim(), barberId: Number(barberId), branchId,
        serviceIds: [Number(serviceId)], preferredDate, preferredTime, paymentMethod: selectedPaymentMethod, idempotencyKey,
      });
      res.status(201).json(result);
    }, 'CreateManualReservation');
  }

  async declineReservation(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const id = req.params.id as string;
      const queueId = Number.parseInt(id, 10);
      if (!Number.isInteger(queueId) || queueId <= 0) {
        throw new AppError('Invalid reservation ID.', 400);
      }

      const { reason, cancelType } = req.body || {};
      const user = req.user as any;
      const branchId = user?.branch_id;
      const cashierName = user?.username || user?.name || user?.first_name || 'Front Desk Cashier';
      const result = await this.queueService.declineReservation(queueId, branchId, reason, cancelType, {
        cashierName,
        preventPendingReservationDecision: user?.role === 'Cashier',
      });
      res.json(result);
    }, 'DeclineReservation');
  }

  async recordReservationFee(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const id = req.params.id as string;
      const queueId = Number.parseInt(id, 10);
      if (!Number.isInteger(queueId) || queueId <= 0) {
        throw new AppError('Invalid reservation ID.', 400);
      }
      const branchId = Number((req.user as any)?.branch_id);
      const { paymentMethod, amount, gcashRefNo, idempotencyKey } = req.body || {};
      const result = await this.cashierService.recordReservationFee(branchId, queueId, {
        paymentMethod,
        amount: amount !== undefined ? Number(amount) : undefined,
        gcashRefNo,
        idempotencyKey,
      });
      res.status(201).json(result);
    }, 'RecordReservationFee');
  }

  async getPendingReservations(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const configuredBranchId = Number((req.user as any)?.branch_id);
      const branchId = Number.isInteger(configuredBranchId) && configuredBranchId > 0
        ? configuredBranchId
        : undefined;
      const userRole = (req.user as any)?.role;
      const queryStatus = req.query.status as string | undefined;
      // Approval belongs to the shop owner/admin. Ignore client-supplied status filters
      // so a cashier cannot fetch reservations that are still awaiting approval.
      const statusFilter = userRole === 'Cashier' ? 'confirmed' : queryStatus;
      const result = await this.cashierService.getPendingReservations(branchId, statusFilter);
      res.json(result);
    }, 'GetPendingReservations');
  }

  async getPendingReservationsCount(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const configuredBranchId = Number((req.user as any)?.branch_id);
      const branchId = Number.isInteger(configuredBranchId) && configuredBranchId > 0
        ? configuredBranchId
        : undefined;
      const count = await this.cashierService.getPendingReservationsCount(branchId);
      res.json({ count });
    }, 'GetPendingReservationsCount');
  }

  async getQueueSnapshot(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const configuredBranchId = Number((req.user as any)?.branch_id);
      const queryBranchId = req.query.branchId ? Number(req.query.branchId) : undefined;
      const branchId = Number.isInteger(configuredBranchId) && configuredBranchId > 0
        ? configuredBranchId
        : Number.isInteger(queryBranchId) && (queryBranchId ?? 0) > 0
          ? queryBranchId
          : undefined;

      if (!branchId) {
        throw new AppError('Branch ID is required.', 400);
      }

      const rawDate = req.query.date;
      const targetDate = rawDate === undefined || rawDate === null || String(rawDate).trim() === ''
        ? undefined
        : String(rawDate).trim();
      if (targetDate !== undefined && !isValidIsoDate(targetDate)) {
        throw new AppError('date must be a valid ISO date in YYYY-MM-DD format.', 400);
      }

      const userRole = (req.user as any)?.role;
      const result = targetDate === undefined
        ? await this.cashierService.getQueueSnapshot(branchId)
        : await this.cashierService.getQueueSnapshot(branchId, targetDate);
      const cashierResult = userRole === 'Cashier' && Array.isArray(result?.reservations)
        ? {
            ...result,
            reservations: result.reservations.filter((reservation: any) =>
              ['accepted', 'confirmed', 'late'].includes(String(reservation?.status || '').toLowerCase())),
          }
        : result;
      res.json(cashierResult);
    }, 'GetQueueSnapshot');
  }

  async getOfflineReceiptProfile(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const branchId = Number((req.user as any)?.branch_id);
      if (!Number.isSafeInteger(branchId) || branchId < 1) {
        throw new AppError('A branch-scoped cashier session is required.', 403);
      }
      res.json(await invoiceProfileService.get(branchId));
    }, 'GetOfflineReceiptProfile');
  }
}

const controller = new CashierController();

export const finishOrder = controller.finishOrder.bind(controller);
export const createWalkIn = controller.createWalkIn.bind(controller);
export const createRetailSale = controller.createRetailSale.bind(controller);
export const getDailySummary = controller.getDailySummary.bind(controller);
export const getWeeklyPerformance = controller.getWeeklyPerformance.bind(controller);
export const getBarberBreakdown = controller.getBarberBreakdown.bind(controller);
export const getDashboardSnapshot = controller.getDashboardSnapshot.bind(controller);
export const getRecentTransactions = controller.getRecentTransactions.bind(controller);
export const getTodaySales = controller.getTodaySales.bind(controller);
export const addReservationFeeGcashReference = controller.addReservationFeeGcashReference.bind(controller);
export const addReservationFeeGcashReceipt = controller.addReservationFeeGcashReceipt.bind(controller);
export const getReservationFeeGcashReceiptUrl = controller.getReservationFeeGcashReceiptUrl.bind(controller);
export const getCustomersServed = controller.getCustomersServed.bind(controller);
export const updateBarberStatus = controller.updateBarberStatus.bind(controller);
export const acceptReservation = controller.acceptReservation.bind(controller);
export const createManualReservation = controller.createManualReservation.bind(controller);
export const declineReservation = controller.declineReservation.bind(controller);
export const recordReservationFee = controller.recordReservationFee.bind(controller);
export const getPendingReservations = controller.getPendingReservations.bind(controller);
export const getPendingReservationsCount = controller.getPendingReservationsCount.bind(controller);
export const getQueueSnapshot = controller.getQueueSnapshot.bind(controller);
export const getOfflineReceiptProfile = controller.getOfflineReceiptProfile.bind(controller);
export const redeemGuestQr = controller.redeemGuestQr.bind(controller);
export const getGuestByReference = controller.getGuestByReference.bind(controller);
export const regenerateGuestQr = controller.regenerateGuestQr.bind(controller);
export const claimPrintJob = controller.claimPrintJob.bind(controller);
export const completePrintJob = controller.completePrintJob.bind(controller);
export const failPrintJob = controller.failPrintJob.bind(controller);
export const retryPrintJob = controller.retryPrintJob.bind(controller);

export default controller;
