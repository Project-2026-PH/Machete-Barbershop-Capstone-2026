import {
  cashierRepository as defaultCashierRepository,
  resolveCustomerServedSortKey,
  resolveTransactionSortKey,
} from '../repositories/cashier.repository';
import type {
  CashierCustomerServedQueryOptions,
  CashierTransactionQueryOptions,
} from '../repositories/cashier.repository';
import { transactionRepository as defaultTransactionRepository } from '../repositories/transaction.repository';
import { inventoryRepository as defaultInventoryRepository } from '../repositories/inventory.repository';
import { queueRepository as defaultQueueRepository } from '../repositories/queue.repository';
import { barberRepository as defaultBarberRepository } from '../repositories/barber.repository';
import { adminRepository as defaultAdminRepository } from '../repositories/admin.repository';
import { barberService as defaultBarberService } from './barber.service';
import { realtimeBroadcastService } from './realtime-broadcast.service';
import { paymentAttemptService as defaultPaymentAttemptService } from './payment-attempt.service';
import { receiptService as defaultReceiptService } from './receipt.service';
import defaultDb from '../db';
import { queueService as defaultQueueService } from './queue.service';
import { moneyDrawerService } from './money-drawer.service';
import { WalkInData, RetailSaleData } from '@demoshop/shared-types';
import defaultLogger from '../utils/general/logger';
import { 
  validateBranchAccess, 
  validateOrderForFinish, 
  validateWalkInInput, 
  validateBarberStatus,
  validateRetailSaleInput,
} from '../utils/cashier/cashier-validation.util';
import { 
  formatSummaryResponse, 
  formatBarberBreakdown 
} from '../utils/cashier/cashier-formatter.util';
import { ensureBarberBranchAccess } from '../utils/cashier/cashier-guard.util';
import { prepareOfflineOrder } from '../utils/cashier/cashier-sync.util';
import { logSecurityEvent } from './audit.service';
import { AppError } from '../utils/error/AppError';
import { isBarberOnBreak } from '../utils/queue/sect.util';
import type { PoolClient } from 'pg';
import { getAdminClient } from '../config/supabase';
import type { ReceiptEvidence } from '../utils/cashier/receipt-evidence.util';
import { assertGcashReferenceAvailable, normalizeGcashReference } from '../utils/cashier/payment-reference-guard';
import { normalizeRetailSaleLines } from '../utils/cashier/cashier-retail.util';
import {
  getCachedDailySummary,
  setCachedDailySummary,
  getCachedWeeklyPerformance,
  setCachedWeeklyPerformance,
  getCachedBarberBreakdown,
  setCachedBarberBreakdown,
  invalidateCashierAggregates,
} from '../utils/cashier/cashier-cache.util';

export interface CashierRepositoryPort {
  findOrderById(id: string): Promise<any | null>;
  findReservationByCode(code: string, branchId: number): Promise<any | null>;
  findReservationsByCustomerName(customerName: string, branchId: number): Promise<any[]>;
  findPendingReservations(branchId?: number, statusFilter?: string | string[]): Promise<any[]>;
  countPendingReservations(branchId?: number): Promise<number>;
  getDailySalesSummary(branchId: number): Promise<{ totalRevenue: number; cashSales: number }>;
  getDailyCustomerCount(branchId: number): Promise<number>;
  getWeeklyPerformance(branchId: number): Promise<any[]>;
  getBarberBreakdown(branchId: number, dateRange?: string): Promise<any[]>;
  getRecentTransactions(
    branchId: number,
    limit: number,
    offset: number,
    options: CashierTransactionQueryOptions,
  ): Promise<{ rows: any[]; total: number }>;
  getCustomersServed(
    branchId: number,
    limit: number,
    offset: number,
    options: CashierCustomerServedQueryOptions,
  ): Promise<{ rows: any[]; total: number }>;
  verifyBarberBranch(barberId: string): Promise<number | null>;
  updateBarberStatus(barberId: string, status: string, client?: PoolClient): Promise<void>;
}

export interface QueueServicePort {
  finishOrder(orderId: number, branchId?: number): Promise<any>;
  acceptReservation(queueId: number, branchId?: number, options?: { cashierName?: string }): Promise<any>;
  checkInReservation(queueId: number, branchId: number): Promise<any>;
  addWalkIn(data: WalkInData): Promise<any>;
  runDebouncedMaintenance?(barberId: number): Promise<void>;
}

export interface QueueRepositoryPort {
  findActiveByBranch(branchId: number, preferredDate?: string): Promise<any[]>;
  withBarberReadyForBreak<T>(barberId: number, work: (client: PoolClient) => Promise<T>): Promise<T>;
  promoteNextToServing(barberId: number): Promise<void>;
}

export interface BarberRepositoryPort {
  findActiveBarbersByBranch(branchId?: string): Promise<any[]>;
}

export interface PaymentAttemptServicePort {
  list(branchId?: number, status?: any, openOnly?: boolean): Promise<any[]>;
}

export interface CashierLoggerPort {
  info(message: string): void;
}

export interface ReceiptServicePort {
  createForRetailSale(client: any, input: {
    transactionId: number;
    branchId: number;
    customerName: string;
    paymentMethod: 'Cash' | 'GCash';
    gcashRefNo?: string | null;
    issuedAt?: string | null;
    items: Array<{ productId: number; name: string; quantity: number; unitPrice: number }>;
  }): Promise<any>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const mapRetailInventoryError = (error: any): never => {
  if (error?.code === 'INVENTORY_RETAIL_INSUFFICIENT_STOCK') {
    throw new AppError(error.message, 409);
  }
  if (error?.code === 'INVENTORY_RETAIL_NOT_SELLABLE') {
    throw new AppError(error.message, 400);
  }
  if (error?.code === 'INVENTORY_RETAIL_SOURCE_CONFLICT') {
    throw new AppError('Retail sale consumption could not be recorded safely. Please retry.', 409);
  }
  throw error;
};

const formatServedTransactionId = (rawId: any): string | null => {
  if (rawId === null || rawId === undefined || rawId === '') return null;
  const str = String(rawId).trim();
  if (/^MCH/i.test(str)) return str;
  const ids = str.split(',').map((s) => s.trim()).filter(Boolean);
  if (ids.length > 0 && ids.every((id) => /^\d+$/.test(id))) {
    return ids.map((id) => `MCH - ${id.padStart(4, '0')}`).join(', ');
  }
  return str;
};

/**
 * Service for Cashier business logic.
 * Follows the Coordinator Pattern: orchestrates specialized utilities, 
 * repositories, and other services to handle complex cashier operations.
 */
export class CashierService {
  constructor(
    private readonly cashierRepository: CashierRepositoryPort = defaultCashierRepository,
    private readonly queueService: QueueServicePort = defaultQueueService,
    private readonly logger: CashierLoggerPort = defaultLogger,
    private readonly queueRepository: QueueRepositoryPort = defaultQueueRepository,
    private readonly barberRepository: BarberRepositoryPort = defaultBarberRepository,
    private readonly paymentAttemptService: PaymentAttemptServicePort = defaultPaymentAttemptService,
    private readonly transactionRepository = defaultTransactionRepository,
    private readonly inventoryRepository = defaultInventoryRepository,
    private readonly db = defaultDb,
    private readonly receiptService: ReceiptServicePort = defaultReceiptService,
    private readonly barberService: any = defaultBarberService,
  ) {}

  /**
   * Finishes an order — validates branch auth and payment status.
   */
  async finishOrder(orderId: string, branchId: number) {
    validateBranchAccess(branchId);

    const order = await this.cashierRepository.findOrderById(orderId);
    validateOrderForFinish(order, branchId);

    const finishedOrder = await this.queueService.finishOrder(parseInt(orderId), branchId);

    // Trigger receipt printing (placeholder)
    this.logger.info(`[ReceiptService] Printing receipt for order ID: ${orderId}`);

    await invalidateCashierAggregates(branchId);

    return finishedOrder;
  }

  /**
   * Adds a walk-in customer to the queue.
   */
  async createWalkIn(data: WalkInData) {
    validateWalkInInput(data);
    const retailItems = normalizeRetailSaleLines(data.retailItems);
    const serviceIds = data.serviceIds || [];
    if (retailItems.length > 0 && serviceIds.length === 0) {
      throw new AppError('Retail-only sales must use the retail checkout.', 400);
    }

    const reservation = data.reservationCode
      ? await this.cashierRepository.findReservationByCode(data.reservationCode, data.branchId)
      : null;
    const nameMatches = !reservation && !data.reservationCode && data.customerName && !/^walk[- ]?in( customer)?$/i.test(data.customerName.trim())
      ? await this.cashierRepository.findReservationsByCustomerName(data.customerName, data.branchId)
      : [];
    const reconciledReservation = reservation || (nameMatches.length === 1 ? nameMatches[0] : null);

    if (nameMatches.length > 1 && !data.reservationCode) {
      throw new AppError('Multiple active reservations match this name. Enter the customer booking code before checking in.', 409);
    }

    if (data.reservationCode || reconciledReservation) {
      if (retailItems.length > 0) {
        throw new AppError('Retail items cannot be attached to a reservation check-in.', 400);
      }
      if (!reconciledReservation) {
        throw new AppError('Reservation code was not found for this branch.', 404);
      }

      if (String(reconciledReservation.status).toLowerCase() === 'pending') {
        throw new AppError('This reservation is awaiting admin approval. Ask an admin to approve it before check-in.', 409);
      }
      const checkedIn = await this.queueService.checkInReservation(reconciledReservation.id, data.branchId);
      if (data.isPrePaid || data.paymentLines?.length) {
        throw new AppError('Payment must be submitted after the service is marked done.', 409);
      }
      return { ...checkedIn, reconciledReservation: true };
    }

    if (data.isPrePaid || data.paymentLines?.length) {
      throw new AppError('Payment must be submitted after the service is marked done.', 409);
    }
    if (serviceIds.length === 0) {
      throw new AppError('Select at least one service before adding a walk-in to the queue.', 400);
    }
    return this.queueService.addWalkIn({ ...data, retailItems });
  }

  /**
   * Completes a retail-only POS sale: writes a transaction, decrements stock, and never touches queue_entries.
   */
  async createRetailSale(data: RetailSaleData) {
    const items = normalizeRetailSaleLines(data.items);
    validateRetailSaleInput({ ...data, items });

    const paymentMethod = data.paymentMethod || 'Cash';
    const targetBranchId = data.branchId || 1;
    const settings = await defaultAdminRepository.getShopSettings(targetBranchId);
    const enabledMethods = (settings.paymentMethods || []).filter((pm: any) => pm.enabled);
    const methodMatch = enabledMethods.find((pm: any) =>
      pm.name.toLowerCase() === paymentMethod.trim().toLowerCase() ||
      (pm.id && pm.id.toLowerCase() === paymentMethod.trim().toLowerCase()) ||
      (pm.key && pm.key.toLowerCase() === paymentMethod.trim().toLowerCase())
    );
    if (!methodMatch) {
      throw new AppError(`The payment method "${paymentMethod}" is currently disabled or unavailable.`, 400);
    }

    const customerName = data.customerName?.trim() || 'Retail customer';
    const idempotencyKey = `retail:${data.idempotencyKey}`;
    const cashierId = data.createdBy && UUID_RE.test(data.createdBy) ? data.createdBy : null;

    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const transaction = await this.transactionRepository.createRetailSale(client, {
        branchId: data.branchId,
        cashierId,
        customerName,
        totalAmount: 0,
        paymentMethod,
        gcashRefNo: data.gcashRefNo,
        idempotencyKey,
      });
      const transactionId = Number(transaction.transaction_id);
      let consumption;
      try {
        consumption = await this.inventoryRepository.recordRetailSaleConsumption(client, {
          items,
          branchId: data.branchId,
          transactionId,
          queueEntryId: null,
          createdBy: cashierId,
          sourceKey: idempotencyKey,
        });
      } catch (error) {
        mapRetailInventoryError(error);
      }
      if (!consumption) {
        throw new AppError('Retail sale consumption could not be recorded.', 500);
      }
      if (consumption.recorded > 0) {
        await client.query(
          `UPDATE transactions SET total_amount = $1 WHERE transaction_id = $2`,
          [consumption.totalAmount.toFixed(2), transactionId],
        );
        transaction.total_amount = consumption.totalAmount;
      }

      // Retail sales skip the queue entirely, so the receipt is scoped by
      // transaction rather than queue entry. Built inside the same transaction
      // so the sale and its receipt commit atomically.
      const receipt = await this.receiptService.createForRetailSale(client, {
        transactionId,
        branchId: data.branchId,
        customerName,
        paymentMethod,
        gcashRefNo: data.gcashRefNo,
        issuedAt: transaction.created_at,
        items: consumption.lines.map((line: { productId: number; name: string; quantity: number; unitPrice: number }) => ({
          productId: line.productId,
          name: line.name,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
        })),
      });
      await client.query('COMMIT');

      logSecurityEvent({
        userId: cashierId,
        action: 'CASHIER_RETAIL_SALE',
        resource: 'transactions',
        details: {
          event: 'cashier_retail_sale',
          transaction_id: transactionId,
          branch_id: data.branchId,
          cashier_id: cashierId,
          customer_name: customerName,
          item_count: consumption.lines.length,
          total_amount: Number(transaction.total_amount || consumption.totalAmount || 0),
          product_ids: consumption.lines.map((line: { productId: number }) => line.productId),
          queue_entry_id: null,
        },
      });

      return {
        transactionId,
        queueEntryId: null,
        customerName,
        paymentMethod,
        totalAmount: Number(transaction.total_amount || consumption.totalAmount || 0),
        items: consumption.lines,
        createdAt: transaction.created_at,
        receipt,
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Gets pending reservations for the authenticated cashier branch.
   */
  async getPendingReservations(branchId?: number, statusFilter?: string | string[]) {
    return this.cashierRepository.findPendingReservations(branchId, statusFilter);
  }

  /**
   * Gets the pending reservation count for the authenticated cashier branch.
   */
  async getPendingReservationsCount(branchId?: number): Promise<number> {
    return this.cashierRepository.countPendingReservations(branchId);
  }

  /**
   * Gets daily revenue and customer count for a branch.
   */
  async getDailySummary(branchId: number) {
    validateBranchAccess(branchId);

    const cached = await getCachedDailySummary(branchId);
    if (cached) return cached;

    const [salesSummary, totalCustomers, drawerStatus] = await Promise.all([
      this.cashierRepository.getDailySalesSummary(branchId),
      this.cashierRepository.getDailyCustomerCount(branchId),
      moneyDrawerService.getActiveDrawerFloat(branchId).catch(() => ({ activeFloat: 10000 })),
    ]);

    const formatted = formatSummaryResponse(
      salesSummary.totalRevenue,
      totalCustomers,
      salesSummary.cashSales,
      drawerStatus.activeFloat,
    );
    void setCachedDailySummary(branchId, formatted);
    return formatted;
  }

  /**
   * Gets weekly revenue and customer performance data.
   */
  async getWeeklyPerformance(branchId: number) {
    validateBranchAccess(branchId);

    const cached = await getCachedWeeklyPerformance(branchId);
    if (cached) return cached;

    const data = await this.cashierRepository.getWeeklyPerformance(branchId);
    void setCachedWeeklyPerformance(branchId, data);
    return data;
  }

  /**
   * Gets barber breakdown for the selected period — customer count and services performed.
   */
  async getBarberBreakdown(branchId: number, dateRange = 'today') {
    validateBranchAccess(branchId);

    const cached = await getCachedBarberBreakdown(branchId, dateRange);
    if (cached) return cached;

    const rows = await this.cashierRepository.getBarberBreakdown(branchId, dateRange);
    const formatted = formatBarberBreakdown(rows);
    void setCachedBarberBreakdown(branchId, dateRange, formatted);
    return formatted;
  }

  /**
   * Returns one bounded dashboard payload. Sections are optional so Realtime
   * transaction events can refresh only transaction data without reloading
   * summary and barber aggregates.
   */
  async getDashboardSnapshot(
    branchId: number,
    options: {
      barberDateRange?: string;
      page?: number;
      limit?: number;
      dateRange?: string;
      barberId?: number;
      search?: string;
      sections?: string[];
    } = {},
  ) {
    validateBranchAccess(branchId);

    const requestedSections = new Set(options.sections?.filter(Boolean));
    const includeAll = requestedSections.size === 0 || requestedSections.has('all');
    const includeSummary = includeAll || requestedSections.has('summary');
    const includeBarbers = includeAll || requestedSections.has('barbers');
    const includeTransactions = includeAll || requestedSections.has('transactions');

    const [summary, barbers, transactions] = await Promise.all([
      includeSummary ? this.getDailySummary(branchId) : Promise.resolve(undefined),
      includeBarbers ? this.getBarberBreakdown(branchId, options.barberDateRange || 'today') : Promise.resolve(undefined),
      includeTransactions
        ? this.getRecentTransactions(branchId, options.page || 1, options.limit || 5, {
            dateRange: options.dateRange || 'all',
            barberId: options.barberId,
            search: options.search,
            maxLimit: 20,
          })
        : Promise.resolve(undefined),
    ]);

    return {
      ...(summary !== undefined ? { summary } : {}),
      ...(barbers !== undefined ? { barbers } : {}),
      ...(transactions !== undefined ? {
        transactions: transactions.transactions,
        transactionsTotal: transactions.total,
        transactionsTotalPages: transactions.total_pages,
        transactionsPage: transactions.page,
        transactionsLimit: transactions.limit,
      } : {}),
    };
  }

  /**
   * Gets a paginated, newest-first transaction list for the dashboard.
   *
   * The compact overview widget calls this with the default 5-per-page cap.
   * The dedicated "Today's Sales" page opts into a larger page size and
   * today-only filtering via the options argument.
   */
  async getRecentTransactions(
    branchId: number,
    requestedPage = 1,
    requestedLimit = 5,
    options: {
      todayOnly?: boolean;
      dateRange?: string;
      barberId?: number;
      search?: string;
      sortBy?: string;
      maxLimit?: number;
    } = {},
  ) {
    validateBranchAccess(branchId);

    const maxLimit = options.maxLimit ?? 5;
    const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, maxLimit)
      : Math.min(5, maxLimit);
    const offset = (page - 1) * limit;

    const sortBy = resolveTransactionSortKey(options.sortBy);

    const { rows, total } = await this.cashierRepository.getRecentTransactions(
      branchId,
      limit,
      offset,
      {
        todayOnly: options.todayOnly === true,
        dateRange: options.dateRange,
        barberId: options.barberId,
        search: options.search,
        sortBy,
      },
    );

    return {
      transactions: rows.map((row: any) => ({
        id: row.id,
        amount: Number(row.amount || 0),
        payment_method: row.payment_method,
        gcash_ref_no: row.gcash_ref_no ?? null,
        customer: row.customer,
        barber: row.barber,
        service: row.service,
        created_at: row.created_at,
        transaction_type: row.transaction_type,
        payment_attempt_id: row.payment_attempt_id ?? null,
        receipt_evidence_status: row.receipt_evidence_status ?? null,
        receipt_available: row.receipt_available ?? null,
      })),
      page,
      limit,
      total,
      total_pages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /**
   * Gets a paginated list of completed customer service entries for the branch.
   * Powers the Customers Served history view.
   */
  async getCustomersServed(
    branchId: number,
    requestedPage = 1,
    requestedLimit = 10,
    options: { sortBy?: string; maxLimit?: number } = {},
  ) {
    validateBranchAccess(branchId);

    const maxLimit = options.maxLimit ?? 50;
    const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, maxLimit)
      : Math.min(10, maxLimit);
    const offset = (page - 1) * limit;

    const sortBy = resolveCustomerServedSortKey(options.sortBy);

    const { rows, total } = await this.cashierRepository.getCustomersServed(
      branchId,
      limit,
      offset,
      { sortBy },
    );

    return {
      customers: rows.map((row: any) => ({
        id: row.id,
        customer: row.customer,
        guest_reference: row.guest_reference ?? null,
        barber: row.barber,
        service: row.service,
        served_at: row.served_at || row.created_at,
        created_at: row.created_at,
        total_amount: row.total_amount ?? null,
        payment_method: row.payment_method ?? null,
        payment_created_at: row.payment_created_at ?? null,
        transaction_id: formatServedTransactionId(row.transaction_id),
        gcash_ref_no: row.gcash_ref_no ? `\u2022\u2022\u2022\u2022${String(row.gcash_ref_no).slice(-4)}` : null,
        receipt_evidence_status: row.receipt_evidence_status ?? null,
        receipt_available: row.receipt_available === true,
      })),
      page,
      limit,
      total,
      total_pages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /**
   * Records a distinct reservation fee transaction for a booked reservation.
   */
  async recordReservationFee(branchId: number, queueId: number, data: {
    paymentMethod: string;
    amount?: number;
    gcashRefNo?: string | null;
    idempotencyKey?: string;
  }) {
    if (!data.paymentMethod || typeof data.paymentMethod !== 'string' || !data.paymentMethod.trim()) {
      throw new AppError('Payment method is required.', 400);
    }

    const targetBranchId = branchId || 1;
    let settings: any = null;
    try {
      settings = await defaultAdminRepository.getShopSettings(targetBranchId);
    } catch {
      settings = null;
    }

    const configuredMethods = Array.isArray(settings?.paymentMethods) ? settings.paymentMethods : [];
    if (configuredMethods.length > 0) {
      const enabledMethods = configuredMethods.filter((pm: any) => pm.enabled);
      const methodMatch = enabledMethods.find((pm: any) =>
        pm.name.toLowerCase() === data.paymentMethod.trim().toLowerCase() ||
        (pm.id && pm.id.toLowerCase() === data.paymentMethod.trim().toLowerCase()) ||
        (pm.key && pm.key.toLowerCase() === data.paymentMethod.trim().toLowerCase())
      );
      if (!methodMatch) {
        const knownPaymentMethod = ['cash', 'gcash', 'maya', 'qrph', 'card'].includes(data.paymentMethod.trim().toLowerCase());
        if (!knownPaymentMethod) {
          throw new AppError('Payment method must be Cash or GCash.', 400);
        }
        throw new AppError(`The payment method "${data.paymentMethod}" is currently disabled or unavailable.`, 400);
      }
    } else {
      const norm = data.paymentMethod.trim().toLowerCase();
      if (norm !== 'cash' && norm !== 'gcash') {
        throw new AppError('Payment method must be Cash or GCash.', 400);
      }
    }

    const normMethod = data.paymentMethod.trim().toLowerCase();
    const isCash = normMethod === 'cash';
    if (!isCash && (!data.gcashRefNo || data.gcashRefNo.trim().length < 4)) {
      const isGcash = normMethod.includes('gcash');
      throw new AppError(
        isGcash ? 'A valid GCash reference number is required.' : 'A valid payment reference number is required for digital fee payments.',
        400,
      );
    }
    const order = await this.cashierRepository.findOrderById(String(queueId));
    if (!order) {
      throw new AppError('Reservation queue entry was not found.', 404);
    }
    if (branchId && order.branch_id !== branchId) {
      throw new AppError('Access denied for this branch.', 403);
    }
    if (order.is_walk_in && !order.customer_id) {
      throw new AppError('Reservation fees only apply to booked reservations.', 400);
    }

    const amount = Number(data.amount) > 0 ? Number(data.amount) : 50;
    const transaction = await defaultTransactionRepository.createReservationFee(defaultDb, {
      queueEntryId: queueId,
      branchId: order.branch_id,
      barberId: order.barber_id || null,
      customerId: order.customer_id || null,
      amount,
      paymentMethod: data.paymentMethod,
      gcashRefNo: data.paymentMethod === 'GCash' ? data.gcashRefNo?.trim() || null : null,
      idempotencyKey: data.idempotencyKey,
    });

    this.logger.info(`[ReservationFee] Recorded ${data.paymentMethod} reservation fee of ₱${amount} for queue entry ${queueId}`);

    await invalidateCashierAggregates(branchId);

    return {
      transaction,
      queueEntryId: queueId,
      status: 'recorded',
    };
  }

  async addReservationFeeGcashReference(branchId: number, transactionId: number, reference: string) {
    if (!Number.isInteger(branchId) || branchId <= 0) throw new AppError('A valid cashier branch is required.', 400);
    if (!Number.isInteger(transactionId) || transactionId <= 0) throw new AppError('Invalid transaction ID.', 400);
    const currentReference = await this.transactionRepository.findReservationFeeGcashReference(transactionId, branchId);
    if (currentReference === undefined) throw new AppError('GCash reservation fee was not found for this branch.', 404);
    const requestedReference = String(reference || '').trim();
    const normalizedReference = currentReference && normalizeGcashReference(currentReference) === normalizeGcashReference(requestedReference)
      ? normalizeGcashReference(currentReference)
      : await assertGcashReferenceAvailable(requestedReference);

    let transaction: any;
    try {
      transaction = await this.transactionRepository.addReservationFeeGcashReference(transactionId, branchId, normalizedReference);
    } catch (error: any) {
      if (error?.code === '23505') throw new AppError('This GCash reference number has already been used.', 409);
      throw error;
    }
    if (!transaction) {
      throw new AppError('GCash reservation fee was not found for this branch, or it already has a different reference.', 404);
    }
    await invalidateCashierAggregates(branchId);
    return transaction;
  }

  async addReservationFeeGcashReceipt(branchId: number, transactionId: number, buffer: Buffer, evidence: ReceiptEvidence, reference?: string) {
    if (!Number.isInteger(branchId) || branchId <= 0) throw new AppError('A valid cashier branch is required.', 400);
    if (!Number.isInteger(transactionId) || transactionId <= 0) throw new AppError('Invalid transaction ID.', 400);
    const currentReference = await this.transactionRepository.findReservationFeeGcashReference(transactionId, branchId);
    if (currentReference === undefined) throw new AppError('GCash reservation fee was not found for this branch.', 404);
    const requestedReference = String(reference || '').trim() || currentReference || '';
    if (currentReference && normalizeGcashReference(currentReference) !== normalizeGcashReference(requestedReference)) {
      throw new AppError('This reservation fee already has a different GCash reference number.', 409);
    }
    const normalizedReference = currentReference
      ? normalizeGcashReference(currentReference)
      : await assertGcashReferenceAvailable(requestedReference);
    const extension = evidence.contentType === 'image/png' ? 'png' : 'jpg';
    const storagePath = `branches/${branchId}/reservation-fees/${transactionId}/${evidence.sha256}.${extension}`;
    const upload = await getAdminClient().storage.from('receipts').upload(storagePath, buffer, {
      contentType: evidence.contentType,
      upsert: false,
    });
    if (upload.error) {
      if (/already exists|duplicate/i.test(upload.error.message || '')) {
        throw new AppError('This receipt image has already been uploaded.', 409);
      }
      throw new AppError('Receipt evidence could not be stored.', 502);
    }

    let transaction: any;
    try {
      transaction = await this.transactionRepository.addReservationFeeReceiptEvidence({
        transactionId,
        branchId,
        storagePath,
        sha256: evidence.sha256,
        width: evidence.width,
        height: evidence.height,
        reference: normalizedReference || null,
      });
    } catch (error: any) {
      await getAdminClient().storage.from('receipts').remove([storagePath]);
      if (error?.code === '23505') throw new AppError('This receipt image has already been used.', 409);
      throw error;
    }
    if (!transaction) {
      await getAdminClient().storage.from('receipts').remove([storagePath]);
      throw new AppError('GCash reservation fee was not found for this branch or already has a receipt.', 404);
    }
    await invalidateCashierAggregates(branchId);
    return transaction;
  }

  async getReservationFeeGcashReceiptUrl(branchId: number, transactionId: number) {
    if (!Number.isInteger(branchId) || branchId <= 0 || !Number.isInteger(transactionId) || transactionId <= 0) {
      throw new AppError('Reservation receipt was not found.', 404);
    }
    const path = await this.transactionRepository.findReservationFeeReceiptPath(transactionId, branchId);
    const expectedPrefix = `branches/${branchId}/reservation-fees/${transactionId}/`;
    if (!path || !path.startsWith(expectedPrefix) || !/^[a-f0-9]{64}\.(?:jpg|png)$/i.test(path.slice(expectedPrefix.length))) {
      throw new AppError('Reservation receipt is unavailable.', 404);
    }
    const signed = await getAdminClient().storage.from('receipts').createSignedUrl(path, 60);
    if (signed.error || !signed.data?.signedUrl) throw new AppError('Receipt review link could not be created.', 502);
    return { url: signed.data.signedUrl, expiresInSeconds: 60 };
  }

  /**
   * Updates a barber's status with branch authorization check.
   */
  async updateBarberStatus(
    barberId: string,
    status: string,
    branchId: number,
    actorId?: string | null,
    req?: any
  ) {
    validateBarberStatus(status);

    // Verify barber belongs to same branch
    const barberBranchId = await this.cashierRepository.verifyBarberBranch(barberId);
    ensureBarberBranchAccess(barberBranchId, branchId);

    if (isBarberOnBreak(status)) {
      await this.queueRepository.withBarberReadyForBreak(Number(barberId), (client) =>
        this.cashierRepository.updateBarberStatus(barberId, status, client));
    } else {
      await this.cashierRepository.updateBarberStatus(barberId, status);
      if (status.trim().toLowerCase() === 'available') {
        await this.queueRepository.promoteNextToServing(Number(barberId));
      }
    }

    logSecurityEvent({
      userId: actorId || null,
      action: 'BARBER_ADMIN_STATUS_OVERRIDE',
      resource: 'cashier_barbers',
      details: {
        barber_id: Number(barberId),
        status,
        branch_id: branchId,
      },
      req,
    });

    if (this.barberService?.invalidateBarberCache) {
      await this.barberService.invalidateBarberCache(barberId);
    }

    realtimeBroadcastService.dispatchAppointmentChangeSafely({
      action: 'STATUS_CHANGED',
      barberId: Number(barberId),
      branchId,
      status,
      metadata: { event: 'barber_status_changed', barberId: Number(barberId), status },
    });

    return { success: true, message: 'Status updated' };
  }

  /**
   * Syncs offline orders from SQLite queue to cloud database.
   */
  async syncOfflineOrders(orders: any[], branchId: number | null | undefined) {
    validateBranchAccess(branchId);
    const authenticatedBranchId = branchId as number;
    const syncedIds: number[] = [];
    for (const order of orders) {
      // Data preparation moved to sync utility. Each walk-in is atomic on its
      // own connection and idempotent, so a failed later item can be retried.
      const walkInData = prepareOfflineOrder(order, authenticatedBranchId);
      await this.queueService.addWalkIn(walkInData);
      if (order.id) syncedIds.push(order.id);
    }
    this.logger.info(`[Sync] Successfully synced ${orders.length} offline orders`);
    return { success: true, syncedIds };
  }

  /**
   * Retrieves the unified live queue snapshot for a branch.
   * Consolidates active barbers, branch queue entries, pending reservations,
   * and open payment attempts into a single payload, eliminating client fan-out.
   */
  async getQueueSnapshot(branchId: number, targetDate?: string) {
    validateBranchAccess(branchId);

    const barbers = (this.barberRepository === defaultBarberRepository && this.barberService?.getCashierBarbers)
      ? await this.barberService.getCashierBarbers(branchId, targetDate)
      : await this.barberRepository.findActiveBarbersByBranch(String(branchId));

    // Snapshot reads must remain read-only and fast. Scheduled-reservation
    // synchronization and timer expiration are maintenance work; running them
    // once per barber here caused slow database contention and made every
    // cashier refresh compete with reservation creation. They are handled by
    // queue mutation paths and scheduled maintenance instead.
    const [queueEntries, reservations, paymentAttempts, shopSettings] = await Promise.all([
      this.queueRepository.findActiveByBranch(branchId),
      this.cashierRepository.findPendingReservations(branchId),
      this.paymentAttemptService.list(branchId, undefined, true),
      defaultAdminRepository.getShopSettings(branchId).catch(() => ({ bypassTimeRestrictions: false })),
    ]);

    return {
      barbers,
      queue: queueEntries,
      reservations,
      paymentAttempts,
      bypassTimeRestrictions: Boolean(shopSettings?.bypassTimeRestrictions ?? false),
    };
  }
}

export const cashierService = new CashierService();
export default cashierService;
