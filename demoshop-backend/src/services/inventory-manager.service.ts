import type { Request } from 'express';
import type { DisposeUnitResponse, ExpirableStockResponse } from '@demoshop/shared-types';
import { getAdminClient } from '../config/supabase';
import { getCache, setCache } from '../redis';
import { AppError } from '../utils/error/AppError';
import { validateReceiptEvidence } from '../utils/cashier/receipt-evidence.util';
import { normalizeReceiptImage } from '../utils/cashier/receipt-image.util';
import { auditService } from './audit.service';
import { adminRepository } from '../repositories/admin.repository';
import { notificationRepository } from '../repositories/notification.repository';
import { emailService } from './email.service';
import {
  createInventoryManagerId,
  inventoryManagerRepository,
  type InventoryHandoutInput,
  type BottleReturnInput,
  type CreatePurchaseOrderInput,
  type InventoryManagerRepositoryErrorCode,
  type PurchaseOrderLineInput,
  type ReceiptInput,
  type StockReportEmailInput,
  type SupplierInput,
  type UpdatePurchaseOrderInput,
} from '../repositories/inventory-manager.repository';

export type InventoryManagerActor = {
  userId: string;
  branchId: number | null | undefined;
  role?: string;
};

type SupplierPayload = {
  name?: unknown;
  contactPerson?: unknown;
  contactNumber?: unknown;
  email?: unknown;
  address?: unknown;
  notes?: unknown;
};

type PurchaseOrderPayload = {
  notes?: unknown;
  status?: unknown;
  lines?: unknown;
};

type ReceiptPayload = {
  branchId?: unknown;
  supplierId?: unknown;
  purchaseDate?: unknown;
  totalAmount?: unknown;
  notes?: unknown;
};

type InventoryHandoutPayload = {
  inventoryStockId?: unknown;
  barberId?: unknown;
  quantity?: unknown;
  notes?: unknown;
};

type BottleReturnPayload = {
  returnCondition?: unknown;
  estimatedRemainingPercent?: unknown;
  notes?: unknown;
};

const inventoryManagerRole = 'Inventory Manager';
const managerRoles = [inventoryManagerRole, 'Owner', 'System Admin', 'Admin', 'ShopAdmin'];
const managerWriteRoles = managerRoles;
const reviewerRoles = ['Owner', 'System Admin', 'Admin', 'ShopAdmin'];

const INVENTORY_RECEIPT_SIGNED_URL_TTL_SECONDS = 3600;
const INVENTORY_RECEIPT_SIGNED_URL_CACHE_TTL_SECONDS = 3300;
const INVENTORY_RECEIPT_UPLOAD_CACHE_CONTROL = '3600';
const receiptSigningInFlight = new Map<string, Promise<string | null>>();
const localReceiptUrlCache = new Map<string, { url: string; expiresAt: number }>();
const LOCAL_RECEIPT_URL_TTL_MS = 5 * 60 * 1000;

const hasRole = (actor: InventoryManagerActor, roles: string[]): boolean => Boolean(actor.role && roles.includes(actor.role));

const requireRole = (actor: InventoryManagerActor, roles: string[], message: string): void => {
  if (!hasRole(actor, roles)) throw new AppError(message, 403);
};

const requireBranch = (actor: InventoryManagerActor): number => {
  const branchId = Number(actor.branchId);
  if (!Number.isInteger(branchId) || branchId <= 0) {
    throw new AppError('A branch-scoped inventory session is required for this operation.', 403);
  }
  return branchId;
};

const requireString = (value: unknown, field: string, maxLength = 500): string => {
  if (typeof value !== 'string' || !value.trim()) throw new AppError(`${field} is required.`, 400);
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new AppError(`${field} is too long.`, 400);
  return normalized;
};

const optionalString = (value: unknown, maxLength = 500): string | null => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new AppError('Text fields must be strings.', 400);
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new AppError('A text field is too long.', 400);
  return normalized || null;
};

const requireUuid = (value: unknown, field: string): string => {
  const normalized = requireString(value, field, 80);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new AppError(`${field} must be a valid identifier.`, 400);
  }
  return normalized;
};

const requirePositiveInteger = (value: unknown, field: string): number => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new AppError(`${field} must be a positive integer.`, 400);
  return parsed;
};

const requireQuantity = (value: unknown, field: string, allowZero = false): number => {
  if (typeof value !== 'number' && typeof value !== 'string') throw new AppError(`${field} must be a valid quantity.`, 400);
  const raw = String(value).trim();
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(raw)) throw new AppError(`${field} must be a valid quantity.`, 400);
  if ((raw.split('.')[1]?.length || 0) > 3) throw new AppError(`${field} must have at most 3 decimal places.`, 400);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < (allowZero ? 0 : Number.EPSILON) || parsed > 1_000_000) {
    throw new AppError(`${field} must be a valid quantity.`, 400);
  }
  return parsed;
};

const optionalMoney = (value: unknown, field: string): number | null => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'number' && typeof value !== 'string') throw new AppError(`${field} must be a valid monetary amount.`, 400);
  const raw = String(value).trim();
  if (!/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(raw)) throw new AppError(`${field} must have at most 2 decimal places.`, 400);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100_000_000) throw new AppError(`${field} must be a valid monetary amount.`, 400);
  return parsed;
};

const optionalEmail = (value: unknown): string | null => {
  const email = optionalString(value, 320);
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError('email must be valid.', 400);
  return email.toLowerCase();
};

const optionalDate = (value: unknown, field: string): string => {
  const date = requireString(value, field, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new AppError(`${field} must use YYYY-MM-DD format.`, 400);
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new AppError(`${field} is invalid.`, 400);
  return date;
};

const mapRepositoryError = (error: unknown): AppError | null => {
  const code = (error as { code?: InventoryManagerRepositoryErrorCode })?.code;
  if (!code) return null;
  const status: Record<InventoryManagerRepositoryErrorCode, number> = {
    INVENTORY_MANAGER_NOT_FOUND: 404,
    INVENTORY_MANAGER_INVALID_BRANCH: 403,
    INVENTORY_MANAGER_INVALID_TRANSITION: 409,
    INVENTORY_MANAGER_DUPLICATE_ACTIVE_ISSUANCE: 409,
    INVENTORY_MANAGER_INVALID_RECEIPT: 404,
    INVENTORY_MANAGER_RECEIPT_NOT_LINKED: 409,
    INVENTORY_MANAGER_STOCK_NOT_FOUND: 404,
    INVENTORY_MANAGER_INSUFFICIENT_STOCK: 409,
    INVENTORY_MANAGER_INVALID_QUANTITY: 400,
    INVENTORY_MANAGER_SUPPLIER_NOT_FOUND: 404,
    INVENTORY_MANAGER_PO_NOT_FOUND: 404,
    INVENTORY_MANAGER_PO_EMPTY: 400,
    INVENTORY_MANAGER_BARBER_NOT_FOUND: 404,
    INVENTORY_MANAGER_LIFECYCLE_NOT_FOUND: 404,
    INVENTORY_MANAGER_REPORT_EMAIL_NOT_FOUND: 404,
  };
  return new AppError((error as Error).message, status[code] || 400);
};

const getErrorMessage = (error: unknown): string => error instanceof Error ? error.message : 'Unknown delivery error.';

const parseSupplierPayload = (payload: SupplierPayload, requireName = true) => ({
  name: requireName ? requireString(payload.name, 'name', 120) : typeof payload.name === 'string' ? payload.name.trim() : undefined,
  contactPerson: optionalString(payload.contactPerson, 120),
  contactNumber: optionalString(payload.contactNumber, 50),
  email: optionalEmail(payload.email),
  address: optionalString(payload.address, 500),
  notes: optionalString(payload.notes, 1000),
});

const parsePurchaseOrderLines = (value: unknown): PurchaseOrderLineInput[] => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 200) {
    throw new AppError('A stock request must contain between 1 and 200 line items.', 400);
  }
  const seen = new Set<number>();
  return value.map((rawLine, index) => {
    if (!rawLine || typeof rawLine !== 'object') throw new AppError(`Line ${index + 1} is invalid.`, 400);
    const line = rawLine as Record<string, unknown>;
    const inventoryStockId = requirePositiveInteger(line.inventoryStockId ?? line.inventory_stock_id, `lines[${index}].inventoryStockId`);
    if (seen.has(inventoryStockId)) throw new AppError('Each inventory item may appear only once in a stock request.', 400);
    seen.add(inventoryStockId);
    const supplierValue = line.supplierId ?? line.supplier_id;
    return {
      inventoryStockId,
      supplierId: supplierValue ? requireUuid(supplierValue, `lines[${index}].supplierId`) : null,
      quantityRequested: requireQuantity(line.quantityRequested ?? line.quantity_requested, `lines[${index}].quantityRequested`),
      unitCost: optionalMoney(line.unitCost ?? line.unit_cost, `lines[${index}].unitCost`),
      notes: optionalString(line.notes, 500),
    };
  });
};

const normalizeEmail = (value: unknown): string => typeof value === 'string' ? value.trim().toLowerCase() : '';

const MANILA_TIME_ZONE = 'Asia/Manila';
const DEFAULT_BUSINESS_HOURS = [
  { day: 'Monday', openTime: '09:00', closeTime: '21:00', isOpen: true },
  { day: 'Tuesday', openTime: '09:00', closeTime: '21:00', isOpen: true },
  { day: 'Wednesday', openTime: '09:00', closeTime: '21:00', isOpen: true },
  { day: 'Thursday', openTime: '09:00', closeTime: '21:00', isOpen: true },
  { day: 'Friday', openTime: '09:00', closeTime: '21:00', isOpen: true },
  { day: 'Saturday', openTime: '09:00', closeTime: '21:00', isOpen: true },
  { day: 'Sunday', openTime: '09:00', closeTime: '21:00', isOpen: false },
];

const getManilaClock = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MANILA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value || '';
  const year = part('year');
  const month = part('month');
  const day = part('day');
  const hour = Number(part('hour'));
  const minute = Number(part('minute'));
  return {
    date: `${year}-${month}-${day}`,
    weekday: part('weekday'),
    minutes: hour * 60 + minute,
  };
};

const parseBusinessTime = (value: unknown): number | null => {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
};

const getBranchBusinessHours = (settings: unknown, weekday: string): { closeTime: number } | null => {
  const settingsObject = settings && typeof settings === 'object' ? settings as Record<string, unknown> : {};
  let businessHours = settingsObject.businessHours;
  if (typeof businessHours === 'string') {
    try {
      businessHours = JSON.parse(businessHours);
    } catch {
      businessHours = null;
    }
  }

  let schedules: any[] = DEFAULT_BUSINESS_HOURS;
  if (Array.isArray(businessHours)) {
    schedules = businessHours;
  } else if (businessHours && typeof businessHours === 'object') {
    schedules = Object.entries(businessHours as Record<string, unknown>).map(([day, schedule]) => ({
      ...(schedule && typeof schedule === 'object' ? schedule as Record<string, unknown> : {}),
      day,
    }));
  }

  const schedule = schedules.find((entry) => String(entry.day || '').toLowerCase() === weekday.toLowerCase());
  if (!schedule || schedule.isOpen === false || schedule.isOpen === 'false' || schedule.isOpen === 0) return null;
  const closeTime = parseBusinessTime(schedule.closeTime);
  return closeTime === null ? null : { closeTime };
};

const formatReminderTime = (minutes: number): string => {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const hour12 = hour % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
};

export class InventoryManagerService {
  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const mapped = mapRepositoryError(error);
      if (mapped) throw mapped;
      throw error;
    }
  }

  private async notifySafely(input: {
    recipientUserId: string;
    event: string;
    type: 'success' | 'info' | 'warning' | 'error';
    title: string;
    message: string;
    branchId: number;
    dedupeKey: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await notificationRepository.insertNotification({ ...input, branchId: input.branchId, dedupeKey: input.dedupeKey });
    } catch {
      // Notification failure must not roll back an already persisted workflow.
    }
  }

  async sendStockCountDueReminders(now: Date = new Date()): Promise<{ branchesChecked: number; notificationsQueued: number }> {
    const localTime = getManilaClock(now);
    const targets = await inventoryManagerRepository.listStockCountReminderTargets(localTime.date);
    const branchesChecked = new Set(targets.map((target: any) => Number(target.branch_id))).size;
    const reminderInputs: Array<{
      recipientUserId: string;
      event: string;
      type: 'warning';
      title: string;
      message: string;
      branchId: number;
      dedupeKey: string;
      metadata: Record<string, unknown>;
    }> = [];

    for (const target of targets as any[]) {
      const businessHours = getBranchBusinessHours(target.settings, localTime.weekday);
      if (!businessHours) continue;

      const submittedShifts = new Set<string>(Array.isArray(target.submitted_shifts) ? target.submitted_shifts : []);
      const shifts: Array<{ shift: 'morning' | 'evening'; dueMinutes: number }> = [
        { shift: 'morning', dueMinutes: 10 * 60 },
        { shift: 'evening', dueMinutes: businessHours.closeTime },
      ];

      for (const { shift, dueMinutes } of shifts) {
        const minutesUntilDue = dueMinutes - localTime.minutes;
        if (submittedShifts.has(shift) || minutesUntilDue < 0 || minutesUntilDue > 120) continue;

        const branchId = Number(target.branch_id);
        const branchName = String(target.branch_name || `Branch ${branchId}`);
        const dueTime = formatReminderTime(dueMinutes);
        const shiftLabel = shift === 'morning' ? 'Morning' : 'Evening';
        reminderInputs.push({
          recipientUserId: String(target.recipient_user_id),
          event: 'inventory_stock_count_due',
          type: 'warning',
          title: `${shiftLabel} stock count due in 2 hours`,
          message: `${shiftLabel} stock count for ${branchName} is due at ${dueTime} today. Please record the count in Stock Count.`,
          branchId,
          dedupeKey: `inventory_stock_count_due:${branchId}:${localTime.date}:${shift}:${target.recipient_user_id}`,
          metadata: { branchId, branchName, countDate: localTime.date, shift, dueTime, route: '/inventory-manager/stock-count' },
        });
      }
    }

    await Promise.all(reminderInputs.map((input) => this.notifySafely(input)));
    return { branchesChecked, notificationsQueued: reminderInputs.length };
  }

  private async notifyPurchaseOrderSubmitted(order: any): Promise<void> {
    const recipients = await adminRepository.findActivePurchaseOrderRecipients(order.branchId);
    const submissionRevision = order.submittedAt || order.submitted_at || new Date().toISOString();
    await Promise.all(recipients.map((recipient) => this.notifySafely({
      recipientUserId: recipient.user_id,
      event: 'inventory_purchase_order_pending',
      type: 'info',
      title: 'Stock request awaiting review',
      message: `${order.poNumber} was submitted for approval with ${order.lines.length} line item(s).`,
      branchId: order.branchId,
      dedupeKey: `inventory_po_pending:${order.id}:${submissionRevision}:${recipient.user_id}`,
    })));
    await Promise.allSettled(recipients.map((recipient) => emailService.sendPurchaseOrderEmail(recipient.email, {
      poNumber: order.poNumber,
      status: 'pending',
      lineCount: order.lines.length,
      notes: order.notes,
      lines: order.lines,
      dashboardUrl: process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL.replace(/\/$/, '')}/admin?tab=purchase-orders&subtab=awaiting-approval` : null,
    })));
  }

  private async notifyPurchaseOrderDecision(order: any): Promise<void> {
    if (!order.createdBy) return;
    const approved = order.status === 'approved';
    const reviewRevision = order.reviewedAt || order.reviewed_at || new Date().toISOString();
    await this.notifySafely({
      recipientUserId: order.createdBy,
      event: approved ? 'inventory_purchase_order_approved' : 'inventory_purchase_order_rejected',
      type: approved ? 'success' : 'warning',
      title: approved ? 'Stock request approved' : 'Stock request rejected',
      message: approved
        ? `${order.poNumber} was approved and is ready to fulfill.`
        : `${order.poNumber} was rejected${order.reviewNotes ? `: ${order.reviewNotes}` : '.'}`,
      branchId: order.branchId,
      dedupeKey: `inventory_po_decision:${order.id}:${order.status}:${reviewRevision}`,
    });
  }

  private async notifyPurchaseOrderFulfilled(order: any): Promise<void> {
    if (!order.createdBy) return;
    const fulfilledRevision = order.fulfilledAt || order.fulfilled_at || new Date().toISOString();
    await this.notifySafely({
      recipientUserId: order.createdBy,
      event: 'inventory_purchase_order_approved',
      type: 'success',
      title: 'Stock request fulfilled',
      message: `${order.poNumber} status updated to fulfilled. Stock items have been received.`,
      branchId: order.branchId,
      dedupeKey: `inventory_po_fulfilled:${order.id}:${fulfilledRevision}`,
    });
    const recipients = await adminRepository.findActivePurchaseOrderRecipients(order.branchId);
    await Promise.allSettled(recipients.map((recipient) => emailService.sendPurchaseOrderEmail(recipient.email, {
      poNumber: order.poNumber,
      status: 'received',
      lineCount: order.lines.length,
      notes: order.notes,
      lines: order.lines,
      dashboardUrl: process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL.replace(/\/$/, '')}/admin?tab=purchase-orders&subtab=history` : null,
    })));
  }

  async listSuppliers(actor: InventoryManagerActor): Promise<any[]> {
    requireRole(actor, managerRoles, 'You are not authorized to manage inventory suppliers.');
    const branchId = actor.branchId == null && hasRole(actor, reviewerRoles) ? null : requireBranch(actor);
    return this.execute(() => inventoryManagerRepository.listSuppliers(branchId));
  }

  async createSupplier(actor: InventoryManagerActor, payload: SupplierPayload, req?: Request): Promise<any> {
    requireRole(actor, managerWriteRoles, 'You are not authorized to create inventory suppliers.');
    const branchId = requireBranch(actor);
    const parsed = parseSupplierPayload(payload);
    const input: SupplierInput = { branchId, createdBy: actor.userId, ...parsed, name: parsed.name! };
    const supplier = await this.execute(() => inventoryManagerRepository.createSupplier(input));
    await auditService.logSecurityEvent({ userId: actor.userId, action: 'INVENTORY_SUPPLIER_CREATED', resource: 'supplier', details: { supplier_id: supplier.id, branch_id: branchId, name: supplier.name }, req });
    return supplier;
  }

  async updateSupplier(actor: InventoryManagerActor, idValue: unknown, payload: SupplierPayload, req?: Request): Promise<any> {
    requireRole(actor, managerWriteRoles, 'You are not authorized to update inventory suppliers.');
    const branchId = requireBranch(actor);
    const id = requireUuid(idValue, 'supplierId');
    const parsed = parseSupplierPayload(payload, false);
    const supplier = await this.execute(() => inventoryManagerRepository.updateSupplier({ id, branchId, ...parsed }));
    await auditService.logSecurityEvent({ userId: actor.userId, action: 'INVENTORY_SUPPLIER_UPDATED', resource: 'supplier', details: { supplier_id: id, branch_id: branchId }, req });
    return supplier;
  }

  async deactivateSupplier(actor: InventoryManagerActor, idValue: unknown, req?: Request): Promise<void> {
    requireRole(actor, managerWriteRoles, 'You are not authorized to deactivate inventory suppliers.');
    const branchId = requireBranch(actor);
    const id = requireUuid(idValue, 'supplierId');
    await this.execute(() => inventoryManagerRepository.deactivateSupplier(id, branchId));
    await auditService.logSecurityEvent({ userId: actor.userId, action: 'INVENTORY_SUPPLIER_DEACTIVATED', resource: 'supplier', details: { supplier_id: id, branch_id: branchId }, req });
  }

  async assignDefaultSupplier(actor: InventoryManagerActor, stockIdValue: unknown, payload: { supplierId?: unknown }, req?: Request): Promise<any> {
    requireRole(actor, managerWriteRoles, 'You are not authorized to assign inventory suppliers.');
    const branchId = requireBranch(actor);
    const inventoryStockId = requirePositiveInteger(stockIdValue, 'inventoryStockId');
    const supplierId = payload.supplierId ? requireUuid(payload.supplierId, 'supplierId') : null;
    const result = await this.execute(() => inventoryManagerRepository.assignDefaultSupplier(inventoryStockId, supplierId, branchId));
    await auditService.logSecurityEvent({ userId: actor.userId, action: 'INVENTORY_DEFAULT_SUPPLIER_ASSIGNED', resource: 'inventory_product', details: { inventory_stock_id: inventoryStockId, default_supplier_id: supplierId, branch_id: branchId }, req });
    return result;
  }

  async listPurchaseOrderCatalog(actor: InventoryManagerActor): Promise<any[]> {
    requireRole(actor, managerRoles, 'You are not authorized to view purchase-order inventory.');
    const branchId = actor.branchId == null && hasRole(actor, reviewerRoles) ? null : requireBranch(actor);
    return this.execute(() => inventoryManagerRepository.listPurchaseOrderCatalog(branchId));
  }

  async getPurchaseOrderSummary(actor: InventoryManagerActor): Promise<{ pending: number; approved: number; totalActive: number }> {
    requireRole(actor, managerRoles, 'You are not authorized to view stock request summaries.');
    const branchId = actor.branchId == null && hasRole(actor, reviewerRoles) ? null : requireBranch(actor);
    return this.execute(() => inventoryManagerRepository.listPurchaseOrderSummary(branchId));
  }

  async listPurchaseOrders(actor: InventoryManagerActor, statusValue?: unknown): Promise<any[]> {
    requireRole(actor, managerRoles, 'You are not authorized to view stock requests.');
    const status = statusValue === undefined || statusValue === '' ? undefined : requireString(statusValue, 'status', 20).toLowerCase();
    if (status && !['draft', 'pending', 'approved', 'rejected', 'fulfilled'].includes(status)) throw new AppError('Invalid purchase-order status.', 400);
    const branchId = actor.branchId == null && hasRole(actor, reviewerRoles) ? null : requireBranch(actor);
    const orders = await this.execute(() => inventoryManagerRepository.listPurchaseOrders(branchId, status));
    return Promise.all(orders.map((order) => this.sanitizePurchaseOrder(order)));
  }

  async createPurchaseOrder(actor: InventoryManagerActor, payload: PurchaseOrderPayload, req?: Request): Promise<any> {
    requireRole(actor, [inventoryManagerRole], 'Only the Inventory Manager can create stock requests.');
    const branchId = requireBranch(actor);
    const lines = parsePurchaseOrderLines(payload.lines);
    const status = payload.status === 'draft' ? 'draft' : 'pending';
    const input: CreatePurchaseOrderInput = { branchId, createdBy: actor.userId, notes: optionalString(payload.notes, 1000), status, lines };
    const order = await this.execute(() => inventoryManagerRepository.createPurchaseOrder(input));
    await auditService.logSecurityEvent({ userId: actor.userId, action: 'INVENTORY_PURCHASE_ORDER_CREATED', resource: 'purchase_order', details: { purchase_order_id: order.id, po_number: order.poNumber, branch_id: branchId, line_count: lines.length }, req });
    if (order.status === 'pending') {
      await auditService.logSecurityEvent({ userId: actor.userId, action: 'INVENTORY_PURCHASE_ORDER_SUBMITTED', resource: 'purchase_order', details: { purchase_order_id: order.id, po_number: order.poNumber, branch_id: branchId }, req });
      try { await this.notifyPurchaseOrderSubmitted(order); } catch { /* notification is non-blocking */ }
    }
    return this.sanitizePurchaseOrder(order);
  }

  async updatePurchaseOrder(actor: InventoryManagerActor, idValue: unknown, payload: PurchaseOrderPayload, req?: Request): Promise<any> {
    requireRole(actor, [inventoryManagerRole], 'Only the Inventory Manager can edit stock requests.');
    const branchId = requireBranch(actor);
    const purchaseOrderId = requireUuid(idValue, 'purchaseOrderId');
    const lines = parsePurchaseOrderLines(payload.lines);
    const status = payload.status === 'draft' ? 'draft' : 'pending';
    const input: UpdatePurchaseOrderInput = { purchaseOrderId, branchId, createdBy: actor.userId, notes: optionalString(payload.notes, 1000), status, lines };
    const order = await this.execute(() => inventoryManagerRepository.updatePurchaseOrder(input));
    await auditService.logSecurityEvent({ userId: actor.userId, action: 'INVENTORY_PURCHASE_ORDER_UPDATED', resource: 'purchase_order', details: { purchase_order_id: purchaseOrderId, po_number: order.poNumber, branch_id: branchId, line_count: lines.length }, req });
    if (order.status === 'pending') {
      await auditService.logSecurityEvent({ userId: actor.userId, action: 'INVENTORY_PURCHASE_ORDER_SUBMITTED', resource: 'purchase_order', details: { purchase_order_id: purchaseOrderId, po_number: order.poNumber, branch_id: branchId }, req });
      try { await this.notifyPurchaseOrderSubmitted(order); } catch { /* notification is non-blocking */ }
    }
    return this.sanitizePurchaseOrder(order);
  }

  async submitPurchaseOrder(actor: InventoryManagerActor, idValue: unknown, req?: Request): Promise<any> {
    requireRole(actor, [inventoryManagerRole], 'Only the Inventory Manager can submit stock requests.');
    const branchId = requireBranch(actor);
    const purchaseOrderId = requireUuid(idValue, 'purchaseOrderId');
    const order = await this.execute(() => inventoryManagerRepository.submitPurchaseOrder(purchaseOrderId, branchId, actor.userId));
    await auditService.logSecurityEvent({ userId: actor.userId, action: 'INVENTORY_PURCHASE_ORDER_SUBMITTED', resource: 'purchase_order', details: { purchase_order_id: purchaseOrderId, po_number: order.poNumber, branch_id: branchId }, req });
    try { await this.notifyPurchaseOrderSubmitted(order); } catch { /* notification is non-blocking */ }
    return this.sanitizePurchaseOrder(order);
  }

  async deletePurchaseOrder(actor: InventoryManagerActor, idValue: unknown, req?: Request): Promise<void> {
    requireRole(actor, [inventoryManagerRole], 'Only the Inventory Manager can delete stock requests.');
    const branchId = requireBranch(actor);
    const purchaseOrderId = requireUuid(idValue, 'purchaseOrderId');
    await this.execute(() => inventoryManagerRepository.deletePurchaseOrder(purchaseOrderId, branchId, actor.userId));
    await auditService.logSecurityEvent({ userId: actor.userId, action: 'INVENTORY_PURCHASE_ORDER_DELETED', resource: 'purchase_order', details: { purchase_order_id: purchaseOrderId, branch_id: branchId }, req });
  }

  async reviewPurchaseOrder(actor: InventoryManagerActor, idValue: unknown, payload: { decision?: unknown; reviewNotes?: unknown; reason?: unknown }, req?: Request): Promise<any> {
    requireRole(actor, reviewerRoles, 'Only Owner or Admin may approve or reject stock requests.');
    const purchaseOrderId = requireUuid(idValue, 'purchaseOrderId');
    const decision = payload.decision;
    if (decision !== 'approved' && decision !== 'rejected') throw new AppError('decision must be approved or rejected.', 400);
    const reviewNotes = optionalString(payload.reviewNotes ?? payload.reason, 1000);
    if (decision === 'rejected' && (!reviewNotes || reviewNotes.length < 10)) throw new AppError('A rejection reason of at least 10 characters is required.', 400);
    const order = await this.execute(() => inventoryManagerRepository.reviewPurchaseOrder({ purchaseOrderId, branchId: actor.branchId == null ? null : requireBranch(actor), reviewedBy: actor.userId, decision, reviewNotes }));
    await auditService.logSecurityEvent({ userId: actor.userId, action: decision === 'approved' ? 'INVENTORY_PURCHASE_ORDER_APPROVED' : 'INVENTORY_PURCHASE_ORDER_REJECTED', resource: 'purchase_order', details: { purchase_order_id: purchaseOrderId, po_number: order.poNumber, branch_id: order.branchId, reason: reviewNotes || null }, req });
    try { await this.notifyPurchaseOrderDecision(order); } catch { /* notification is non-blocking */ }
    return this.sanitizePurchaseOrder(order);
  }

  async restorePurchaseOrderDeletedItems(
    actor: InventoryManagerActor,
    idValue: unknown,
    req?: Request,
  ): Promise<any> {
    requireRole(actor, reviewerRoles, 'Only Owner or Admin may restore deleted items from stock requests.');
    const purchaseOrderId = requireUuid(idValue, 'purchaseOrderId');
    const branchId = actor.branchId == null ? null : requireBranch(actor);
    const result = await this.execute(() =>
      inventoryManagerRepository.restorePurchaseOrderDeletedItems(purchaseOrderId, branchId),
    );
    await auditService.logSecurityEvent({
      userId: actor.userId,
      action: 'INVENTORY_PURCHASE_ORDER_ITEMS_RESTORED',
      resource: 'purchase_order',
      details: {
        purchase_order_id: purchaseOrderId,
        branch_id: branchId,
        restored_count: result.restoredCount,
        restored_items: result.restoredItems,
      },
      req,
    });
    return result;
  }

  async fulfillPurchaseOrder(actor: InventoryManagerActor, idValue: unknown, payload: { receiptId?: unknown }, req?: Request): Promise<any> {
    requireRole(actor, managerWriteRoles, 'You are not authorized to receive stock requests.');
    const purchaseOrderId = requireUuid(idValue, 'purchaseOrderId');
    const receiptId = payload.receiptId ? requireUuid(payload.receiptId, 'receiptId') : null;
    const order = await this.execute(() => inventoryManagerRepository.fulfillPurchaseOrder({ purchaseOrderId, branchId: actor.branchId == null ? null : requireBranch(actor), fulfilledBy: actor.userId, receiptId }));
    await auditService.logSecurityEvent({ userId: actor.userId, action: 'INVENTORY_PURCHASE_ORDER_FULFILLED', resource: 'purchase_order', details: { purchase_order_id: purchaseOrderId, po_number: order.poNumber, branch_id: order.branchId, movement_count: order.movementCount, receipt_id: receiptId }, req });
    await auditService.logSecurityEvent({ userId: actor.userId, action: 'INVENTORY_STOCK_MOVEMENT_CREATED', resource: 'inventory_stock_movement', details: { source_type: 'purchase_order', source_id: purchaseOrderId, branch_id: order.branchId, movement_count: order.movementCount }, req });
    try { await this.notifyPurchaseOrderFulfilled(order); } catch { /* notification is non-blocking */ }
    return this.sanitizePurchaseOrder(order);
  }

  private async signedReceiptUrl(path: string | null): Promise<string | null> {
    if (!path) return null;

    const cacheKey = `storage:signed:receipts:${path}`;
    const localCached = localReceiptUrlCache.get(cacheKey);
    if (localCached) {
      if (localCached.expiresAt > Date.now()) return localCached.url;
      localReceiptUrlCache.delete(cacheKey);
    }

    const cached = await getCache<string>(cacheKey);
    if (cached) {
      localReceiptUrlCache.set(cacheKey, {
        url: cached,
        expiresAt: Date.now() + LOCAL_RECEIPT_URL_TTL_MS,
      });
      return cached;
    }

    const existingRequest = receiptSigningInFlight.get(cacheKey);
    if (existingRequest) return existingRequest;

    const signingRequest = (async () => {
      try {
        const signed = await getAdminClient().storage.from('receipts').createSignedUrl(
          path,
          INVENTORY_RECEIPT_SIGNED_URL_TTL_SECONDS,
        );
        const signedUrl = signed.error || !signed.data?.signedUrl ? null : signed.data.signedUrl;
        if (signedUrl) {
          localReceiptUrlCache.set(cacheKey, {
            url: signedUrl,
            expiresAt: Date.now() + LOCAL_RECEIPT_URL_TTL_MS,
          });
          await setCache(cacheKey, signedUrl, INVENTORY_RECEIPT_SIGNED_URL_CACHE_TTL_SECONDS);
        }
        return signedUrl;
      } catch {
        return null;
      } finally {
        receiptSigningInFlight.delete(cacheKey);
      }
    })();

    receiptSigningInFlight.set(cacheKey, signingRequest);
    return signingRequest;
  }

  private async sanitizeReceipt(record: any): Promise<any> {
    const {
      receiptImagePath,
      attachmentPaths = [],
      ...safe
    } = record;
    const paths = [
      receiptImagePath,
      ...(Array.isArray(attachmentPaths) ? attachmentPaths : []),
    ].filter((path): path is string => typeof path === 'string' && path.length > 0);
    const uniquePaths = [...new Set(paths)];
    const signedEntries = await Promise.all(
      uniquePaths.map(async (path) => [path, await this.signedReceiptUrl(path)] as const),
    );
    const urlByPath = new Map(signedEntries);

    return {
      ...safe,
      receiptImageUrl: receiptImagePath ? urlByPath.get(receiptImagePath) || null : null,
      receiptImageUrls: uniquePaths
        .map((path) => urlByPath.get(path))
        .filter((url): url is string => Boolean(url)),
    };
  }

  private async sanitizePurchaseOrder(order: any): Promise<any> {
    if (!order) return order;
    const { receiptImagePath, receiptAttachmentPaths = [], receiptAttachmentIds = [], ...safe } = order;
    const paths = [receiptImagePath, ...(Array.isArray(receiptAttachmentPaths) ? receiptAttachmentPaths : [])]
      .filter((path): path is string => typeof path === 'string' && path.length > 0);
    const uniquePaths = [...new Set(paths)];
    const signedUrls = await Promise.all(uniquePaths.map((path) => this.signedReceiptUrl(path)));
    const receiptImageUrls = signedUrls.filter((url): url is string => Boolean(url));
    return {
      ...safe,
      receiptImageUrl: receiptImageUrls[0] || null,
      receiptImageUrls,
      receiptImageIds: [null, ...(Array.isArray(receiptAttachmentIds) ? receiptAttachmentIds : [])].slice(0, receiptImageUrls.length),
    };
  }

  async listReceipts(actor: InventoryManagerActor): Promise<any[]> {
    requireRole(actor, managerRoles, 'You are not authorized to view inventory receipts.');
    const branchId = actor.branchId == null && hasRole(actor, reviewerRoles)
      ? null
      : requireBranch(actor);
    const records = await this.execute(() => inventoryManagerRepository.listReceipts(branchId));
    return Promise.all(records.map((record) => this.sanitizeReceipt(record)));
  }

  async uploadReceipt(actor: InventoryManagerActor, payload: ReceiptPayload, files: Express.Multer.File[], req?: Request): Promise<any> {
    requireRole(actor, managerWriteRoles, 'You are not authorized to upload inventory receipts.');
    const requestedBranchId = payload.branchId == null || payload.branchId === '' ? null : Number(payload.branchId);
    const branchId: number = actor.branchId == null && hasRole(actor, reviewerRoles)
      ? (typeof requestedBranchId === 'number' && Number.isInteger(requestedBranchId) && requestedBranchId > 0 ? requestedBranchId : requireBranch(actor))
      : requireBranch(actor);
    if (!files.length) throw new AppError('At least one receipt image is required.', 400);
    const receiptId = createInventoryManagerId();
    const uploadedPaths: string[] = [];

    try {
      const attachments = await Promise.all(files.map(async (file, index) => {
        const evidence = validateReceiptEvidence(file);
        const normalized = await normalizeReceiptImage(file.buffer);
        return {
          file,
          evidence,
          normalized,
          storagePath: `branches/${branchId}/inventory-receipts/${receiptId}-${index}.jpg`,
        };
      }));
      for (const attachment of attachments) {
        const upload = await getAdminClient().storage.from('receipts').upload(
          attachment.storagePath,
          attachment.normalized.buffer,
          {
            contentType: attachment.normalized.contentType,
            cacheControl: INVENTORY_RECEIPT_UPLOAD_CACHE_CONTROL,
            upsert: false,
          },
        );
        if (upload.error) throw new AppError('Receipt image could not be stored securely.', 502);
        uploadedPaths.push(attachment.storagePath);
      }
      const supplierId = payload.supplierId ? requireUuid(payload.supplierId, 'supplierId') : null;
      if (!supplierId) throw new AppError('A supplier is required for a new receipt.', 400);
      const purchaseDate = optionalDate(payload.purchaseDate, 'purchaseDate');
      const receiptNumber = `REC-${purchaseDate.replace(/-/g, '')}-${receiptId.slice(0, 8).toUpperCase()}`;
      const input: ReceiptInput = {
        id: receiptId,
        branchId,
        receiptNumber,
        supplierId,
        purchaseDate,
        totalAmount: optionalMoney(payload.totalAmount, 'totalAmount'),
        receiptImagePath: uploadedPaths[0],
        uploadedBy: actor.userId,
        notes: optionalString(payload.notes, 1000),
      };
      const receipt = await this.execute(() => inventoryManagerRepository.createReceipt(input));
      await this.execute(() => inventoryManagerRepository.addReceiptAttachments(
        uploadedPaths.slice(1).map((storagePath) => ({ receiptId, storagePath, mimeType: 'image/jpeg' })),
      ));
      const primaryEvidence = attachments[0]?.evidence;
      await auditService.logSecurityEvent({ userId: actor.userId, action: 'INVENTORY_RECEIPT_UPLOADED', resource: 'receipt', details: { receipt_id: receiptId, branch_id: branchId, sha256: primaryEvidence?.sha256, content_type: primaryEvidence?.contentType }, req });
      return this.sanitizeReceipt(receipt);
    } catch (error) {
      try { await getAdminClient().storage.from('receipts').remove(uploadedPaths); } catch { /* cleanup is best effort */ }
      throw error;
    }
  }

  async appendReceiptAttachments(actor: InventoryManagerActor, receiptIdValue: unknown, files: Express.Multer.File[], req?: Request): Promise<any> {
    requireRole(actor, managerWriteRoles, 'You are not authorized to add receipt evidence.');
    const receiptId = requireUuid(receiptIdValue, 'receiptId');
    if (files.length === 0) throw new AppError('At least one receipt image is required.', 400);
    const branchId = actor.branchId == null && hasRole(actor, reviewerRoles) ? null : requireBranch(actor);
    if (await this.execute(() => inventoryManagerRepository.receiptHasFulfilledPurchaseOrder(receiptId, branchId))) {
      throw new AppError('Fulfilled stock requests cannot be modified.', 409);
    }
    const receipt = await this.execute(() => inventoryManagerRepository.getReceipt(receiptId, branchId));
    if (!receipt) throw new AppError('Receipt was not found.', 404);
    const uploadedPaths: string[] = [];
    try {
      const attachments = await Promise.all(files.map(async (file, index) => {
        const evidence = validateReceiptEvidence(file);
        const normalized = await normalizeReceiptImage(file.buffer);
        return { evidence, normalized, storagePath: `branches/${receipt.branchId}/inventory-receipts/${receiptId}-additional-${Date.now()}-${index}.jpg` };
      }));
      for (const attachment of attachments) {
        const upload = await getAdminClient().storage.from('receipts').upload(attachment.storagePath, attachment.normalized.buffer, {
          contentType: attachment.normalized.contentType,
          cacheControl: INVENTORY_RECEIPT_UPLOAD_CACHE_CONTROL,
          upsert: false,
        });
        if (upload.error) throw new AppError('Receipt image could not be stored securely.', 502);
        uploadedPaths.push(attachment.storagePath);
      }
      await this.execute(() => inventoryManagerRepository.addReceiptAttachments(uploadedPaths.map((storagePath) => ({ receiptId, storagePath, mimeType: 'image/jpeg' }))));
      await auditService.logSecurityEvent({ userId: actor.userId, action: 'INVENTORY_RECEIPT_ATTACHMENTS_ADDED', resource: 'receipt', details: { receipt_id: receiptId, branch_id: receipt.branchId, attachment_count: uploadedPaths.length }, req });
      const records = await this.execute(() => inventoryManagerRepository.listReceipts(branchId));
      return this.sanitizeReceipt(records.find((record: any) => record.id === receiptId) || receipt);
    } catch (error) {
      try { await getAdminClient().storage.from('receipts').remove(uploadedPaths); } catch { /* cleanup is best effort */ }
      throw error;
    }
  }

  async deleteReceiptAttachment(actor: InventoryManagerActor, receiptIdValue: unknown, attachmentIdValue: unknown, req?: Request): Promise<void> {
    requireRole(actor, managerWriteRoles, 'You are not authorized to remove receipt evidence.');
    const receiptId = requireUuid(receiptIdValue, 'receiptId');
    const attachmentId = requireUuid(attachmentIdValue, 'attachmentId');
    const branchId = actor.branchId == null && hasRole(actor, reviewerRoles) ? null : requireBranch(actor);
    if (await this.execute(() => inventoryManagerRepository.receiptHasFulfilledPurchaseOrder(receiptId, branchId))) {
      throw new AppError('Fulfilled stock requests cannot be modified.', 409);
    }
    const removed = await this.execute(() => inventoryManagerRepository.deleteReceiptAttachment(receiptId, attachmentId, branchId));
    await getAdminClient().storage.from('receipts').remove([removed.storagePath]);
    await auditService.logSecurityEvent({ userId: actor.userId, action: 'INVENTORY_RECEIPT_ATTACHMENT_REMOVED', resource: 'receipt', details: { receipt_id: receiptId, attachment_id: attachmentId, branch_id: branchId }, req });
  }

  async deletePrimaryReceiptImage(actor: InventoryManagerActor, receiptIdValue: unknown, req?: Request): Promise<void> {
    requireRole(actor, managerWriteRoles, 'You are not authorized to remove receipt evidence.');
    const receiptId = requireUuid(receiptIdValue, 'receiptId');
    const branchId = actor.branchId == null && hasRole(actor, reviewerRoles) ? null : requireBranch(actor);
    if (await this.execute(() => inventoryManagerRepository.receiptHasFulfilledPurchaseOrder(receiptId, branchId))) {
      throw new AppError('Fulfilled stock requests cannot be modified.', 409);
    }
    const removed = await this.execute(() => inventoryManagerRepository.promoteAndDeletePrimaryReceiptImage(receiptId, branchId));
    await getAdminClient().storage.from('receipts').remove([removed.storagePath]);
    await auditService.logSecurityEvent({ userId: actor.userId, action: 'INVENTORY_PRIMARY_RECEIPT_IMAGE_REMOVED', resource: 'receipt', details: { receipt_id: receiptId, branch_id: branchId }, req });
  }

  async linkReceipt(actor: InventoryManagerActor, idValue: unknown, payload: { purchaseOrderIds?: unknown }, req?: Request): Promise<any[]> {
    requireRole(actor, managerWriteRoles, 'You are not authorized to link inventory receipts.');
    const receiptId = requireUuid(idValue, 'receiptId');
    if (!Array.isArray(payload.purchaseOrderIds) || payload.purchaseOrderIds.length < 1 || payload.purchaseOrderIds.length > 100) throw new AppError('At least one stock request must be selected.', 400);
    const purchaseOrderIds = [...new Set(payload.purchaseOrderIds.map((id) => requireUuid(id, 'purchaseOrderId')))];
    const result = await this.execute(() => inventoryManagerRepository.linkReceiptToPurchaseOrders(receiptId, purchaseOrderIds, actor.branchId == null ? null : requireBranch(actor)));
    await auditService.logSecurityEvent({ userId: actor.userId, action: 'INVENTORY_RECEIPT_LINKED', resource: 'receipt', details: { receipt_id: receiptId, purchase_order_ids: purchaseOrderIds, branch_id: result[0]?.branchId || actor.branchId }, req });
    return Promise.all(result.map((order) => this.sanitizePurchaseOrder(order)));
  }

  async unlinkReceipt(actor: InventoryManagerActor, purchaseOrderIdValue: unknown, req?: Request): Promise<any> {
    requireRole(actor, reviewerRoles, 'Only Owner or Admin may remove receipt evidence.');
    const purchaseOrderId = requireUuid(purchaseOrderIdValue, 'purchaseOrderId');
    const result = await this.execute(() => inventoryManagerRepository.unlinkReceiptFromPurchaseOrder(
      purchaseOrderId,
      actor.branchId == null ? null : requireBranch(actor),
    ));
    await auditService.logSecurityEvent({
      userId: actor.userId,
      action: 'INVENTORY_RECEIPT_UNLINKED',
      resource: 'purchase_order',
      details: {
        purchase_order_id: purchaseOrderId,
        receipt_id: result.receiptId,
        branch_id: result.order.branchId || actor.branchId || null,
        evidence_retained: true,
      },
      req,
    });
    return this.sanitizePurchaseOrder(result.order);
  }

  async listBarbers(actor: InventoryManagerActor): Promise<any[]> {
    requireRole(actor, managerRoles, 'You are not authorized to view barbers for inventory operations.');
    return this.execute(() => inventoryManagerRepository.listBarbers(requireBranch(actor)));
  }

  async listBottleLifecycle(actor: InventoryManagerActor, statusValue?: unknown): Promise<any[]> {
    requireRole(actor, managerRoles, 'You are not authorized to view bottle lifecycle records.');
    let status: 'issued' | 'returned' | undefined;
    if (statusValue !== undefined && statusValue !== '') {
      if (statusValue !== 'issued' && statusValue !== 'returned') throw new AppError('Invalid lifecycle status.', 400);
      status = statusValue;
    }
    return this.execute(() => inventoryManagerRepository.listBottleLifecycle(requireBranch(actor), status));
  }

  async listInventoryHandouts(actor: InventoryManagerActor): Promise<any[]> {
    requireRole(actor, managerRoles, 'You are not authorized to view inventory handouts.');
    return this.execute(() => inventoryManagerRepository.listInventoryHandouts(requireBranch(actor)));
  }

  async listBottleConsumption(actor: InventoryManagerActor, query?: Record<string, unknown>): Promise<any[]> {
    requireRole(actor, managerRoles, 'You are not authorized to view bottle consumption history.');
    const branchId = requireBranch(actor);
    const options = {
      limit: query?.limit ? Number(query.limit) : undefined,
      barberId: query?.barberId ? Number(query.barberId) : undefined,
      inventoryStockId: query?.inventoryStockId ? Number(query.inventoryStockId) : undefined,
    };
    return this.execute(() => inventoryManagerRepository.listBottleConsumption(branchId, options));
  }

  async listInventoryHandoutCatalog(actor: InventoryManagerActor): Promise<any[]> {
    requireRole(actor, managerRoles, 'You are not authorized to view inventory handout items.');
    return this.execute(() => inventoryManagerRepository.listInventoryHandoutCatalog(requireBranch(actor)));
  }

  async recordInventoryHandout(actor: InventoryManagerActor, payload: InventoryHandoutPayload, req?: Request): Promise<any> {
    requireRole(actor, managerWriteRoles, 'You are not authorized to record inventory handouts.');
    const branchId = requireBranch(actor);
    const input: InventoryHandoutInput = {
      branchId,
      inventoryStockId: requirePositiveInteger(payload.inventoryStockId, 'inventoryStockId'),
      barberId: requirePositiveInteger(payload.barberId, 'barberId'),
      quantity: requirePositiveInteger(payload.quantity, 'quantity'),
      loggedBy: actor.userId,
      notes: optionalString(payload.notes, 1000),
    };
    const lifecycle = await this.execute(() => inventoryManagerRepository.recordInventoryHandout(input));
    const bottleLifecycleId = lifecycle.status === 'issued' ? lifecycle.id : null;
    await auditService.logSecurityEvent({ userId: actor.userId, action: 'INVENTORY_ITEM_HANDED_OUT', resource: bottleLifecycleId ? 'bottle_lifecycle_log' : 'inventory_handout_logs', details: { handout_id: lifecycle.handout?.id ?? lifecycle.id, bottle_lifecycle_id: bottleLifecycleId, inventory_stock_id: input.inventoryStockId, quantity: input.quantity, barber_id: input.barberId, issued_at_customer_count: lifecycle.issuedAtCustomerCount ?? null, branch_id: branchId }, req });
    return lifecycle;
  }

  async returnBottle(actor: InventoryManagerActor, idValue: unknown, _payload: BottleReturnPayload, req?: Request): Promise<any> {
    requireRole(actor, managerWriteRoles, 'You are not authorized to return inventory bottles.');
    const branchId = requireBranch(actor);
    const rawCondition = String(_payload.returnCondition || '').trim().toLowerCase();
    const returnCondition: 'empty' | 'partially_used' = rawCondition === 'partially_used' ? 'partially_used' : 'empty';
    let estimatedRemainingPercent = 0;
    if (returnCondition === 'partially_used') {
      const parsed = Number(_payload.estimatedRemainingPercent);
      estimatedRemainingPercent = Number.isFinite(parsed) ? Math.min(100, Math.max(0, Math.round(parsed))) : 50;
    }
    const input: BottleReturnInput = {
      id: requireUuid(idValue, 'lifecycleId'),
      branchId,
      returnCondition,
      estimatedRemainingPercent,
      notes: optionalString(_payload.notes, 1000),
    };
    const lifecycle = await this.execute(() => inventoryManagerRepository.returnBottle(input));
    await auditService.logSecurityEvent({
      userId: actor.userId,
      action: returnCondition === 'partially_used' ? 'INVENTORY_BOTTLE_RETURNED_PARTIAL' : 'INVENTORY_BOTTLE_RETURNED_EMPTY',
      resource: 'bottle_lifecycle_log',
      details: {
        lifecycle_id: input.id,
        barber_id: lifecycle.barberId,
        return_condition: returnCondition,
        estimated_remaining_percent: estimatedRemainingPercent,
        issued_at_customer_count: lifecycle.issuedAtCustomerCount,
        returned_at_customer_count: lifecycle.returnedAtCustomerCount,
        customers_served: lifecycle.customersServed,
        quantity: lifecycle.quantity,
        branch_id: branchId,
      },
      req,
    });
    return lifecycle;
  }

  async getDailyStockReport(actor: InventoryManagerActor, dateValue?: unknown): Promise<any> {
    requireRole(actor, managerRoles, 'You are not authorized to view stock reports.');
    const reportDate = dateValue ? optionalDate(dateValue, 'date') : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
    return this.execute(() => inventoryManagerRepository.getDailyStockReport({ branchId: requireBranch(actor), reportDate }));
  }

  async sendDailyStockReport(actor: InventoryManagerActor, dateValue?: unknown, req?: Request): Promise<any> {
    requireRole(actor, [inventoryManagerRole], 'Only the Inventory Manager can send daily stock reports.');
    const branchId = requireBranch(actor);
    const reportDate = dateValue ? optionalDate(dateValue, 'date') : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
    const [report, managerContact, recipients] = await Promise.all([
      this.execute(() => inventoryManagerRepository.getDailyStockReport({ branchId, reportDate })),
      this.execute(() => inventoryManagerRepository.findUserContact(actor.userId)),
      this.execute(() => adminRepository.findActiveInventoryEmailRecipients(branchId)),
    ]);
    const requiredShifts = ['morning', 'evening'];
    const missingShift = requiredShifts.find((shift) => {
      const shiftReport = report?.shifts?.find((candidate: any) => candidate.shift === shift);
      return !['pending', 'submitted', 'reviewed', 'approved'].includes(shiftReport?.status);
    });
    if (missingShift) {
      throw new AppError(`Daily stock report cannot be sent until the ${missingShift} stock count is submitted.`, 400);
    }
    const uncountedItems = (report?.items ?? []).filter((item: any) => item.openingQuantity == null || item.closingQuantity == null);
    if (uncountedItems.length > 0) {
      throw new AppError(
        `All items must have morning and evening counts recorded before sending to admin. Missing counts for ${uncountedItems.length} item${uncountedItems.length === 1 ? '' : 's'}.`,
        400,
      );
    }
    const recipient = recipients.find((candidate) => ['admin', 'shopadmin'].includes(String(candidate.role).toLowerCase())) || recipients[0];
    const recipientEmail = normalizeEmail(recipient?.email);
    if (!recipientEmail) throw new AppError('No active Admin/Owner email recipient is configured for this branch.', 409);
    const ccEmail = normalizeEmail(managerContact?.email) || null;
    const emailId = createInventoryManagerId();
    const emailInput: StockReportEmailInput = { id: emailId, branchId, reportDate, sentBy: actor.userId, recipientEmail, ccEmail };
    let emailRecord = await this.execute(() => inventoryManagerRepository.createStockReportEmail(emailInput));

    try {
      const delivery = await emailService.sendStockReportEmail(recipientEmail, ccEmail, reportDate, report);
      if (!delivery.sent) throw new Error(delivery.errorMessage || 'Stock-report email delivery failed.');
      const providerMessageId = delivery.messageId;
      emailRecord = await this.execute(() => inventoryManagerRepository.updateStockReportEmail(emailId, branchId, { status: 'sent', providerMessageId }));
      await auditService.logSecurityEvent({ userId: actor.userId, action: 'INVENTORY_STOCK_REPORT_EMAIL_SENT', resource: 'stock_report_email', details: { stock_report_email_id: emailId, report_date: reportDate, branch_id: branchId, provider_message_id: providerMessageId }, req });
    } catch (error) {
      emailRecord = await this.execute(() => inventoryManagerRepository.updateStockReportEmail(emailId, branchId, { status: 'failed', errorMessage: getErrorMessage(error).slice(0, 500) }));
      await auditService.logSecurityEvent({ userId: actor.userId, action: 'INVENTORY_STOCK_REPORT_EMAIL_FAILED', resource: 'stock_report_email', details: { stock_report_email_id: emailId, report_date: reportDate, branch_id: branchId, error: getErrorMessage(error).slice(0, 200) }, req });
    }
    return { ...emailRecord, reportDate, reportSummary: report.summary };
  }

  async listExpirableStock(actor: InventoryManagerActor): Promise<ExpirableStockResponse> {
    requireRole(actor, managerRoles, 'You do not have permission to view expirable stock.');
    const branchId = actor.branchId == null && hasRole(actor, reviewerRoles) ? null : requireBranch(actor);
    const data = await this.execute(() => inventoryManagerRepository.listExpirableStockBatches(branchId));

    if (data.summary.approachingExpiryCount > 0 && branchId != null) {
      const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
      await this.notifySafely({
        recipientUserId: actor.userId,
        event: 'inventory_stock_approaching_expiry',
        type: 'warning',
        title: 'Expirable Stock Alert',
        message: `${data.summary.approachingExpiryCount} unit(s) are approaching expiry (<= 30 days). Please inspect batch expiration dates.`,
        branchId,
        dedupeKey: `approaching_expiry:${branchId}:${todayStr}:${actor.userId}`,
      });
    }

    return data;
  }

  async disposeExpiredUnit(
    actor: InventoryManagerActor,
    unitIdInput: string,
    reasonInput?: unknown,
    req?: Request,
  ): Promise<DisposeUnitResponse> {
    requireRole(actor, managerWriteRoles, 'Only inventory managers and administrators can dispose expired units.');
    const branchId = actor.branchId == null && hasRole(actor, reviewerRoles) ? null : requireBranch(actor);
    const unitId = requireUuid(unitIdInput, 'unitId');
    const reason = optionalString(reasonInput, 500);

    const result = await this.execute(() =>
      inventoryManagerRepository.disposeExpiredUnit({
        unitId,
        branchId,
        disposedBy: actor.userId,
        reason: reason || undefined,
      }),
    );

    await auditService.logSecurityEvent({
      userId: actor.userId,
      action: 'INVENTORY_EXPIRED_STOCK_DISPOSED',
      resource: 'inventory_stock_batch_unit',
      details: {
        unit_id: result.unit.id,
        batch_id: result.unit.batchId,
        unit_number: result.unit.unitNumber,
        branch_id: branchId,
        expiration_date: result.unit.expirationDate,
        remaining_batch_quantity: result.remainingBatchQuantity,
        remaining_stock_quantity: result.remainingStockQuantity,
        disposed_at: result.unit.disposedAt,
        reason: reason || null,
      },
      req,
    });

    return result;
  }
}

export const inventoryManagerService = new InventoryManagerService();
export default inventoryManagerService;
