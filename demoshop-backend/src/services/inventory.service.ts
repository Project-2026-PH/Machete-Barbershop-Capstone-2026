import crypto from 'crypto';
import type { Request } from 'express';
import { UserRole, type InventoryForecastResponse, type InventoryReportResponse } from '@demoshop/shared-types';
import {
  inventoryRepository,
  type CreateInventoryItemInput,
  type ReviewStockCountInput,
  type SubmitStockCountInput,
  type UpdateInventoryStockInput,
  type ReplenishStockInput,
  type ListStockCountsOptions,
  type InventoryReportQueryInput,
  type UpdateInventoryCostPriceInput,
} from '../repositories/inventory.repository';

import { auditService } from './audit.service';
import { AppError } from '../utils/error/AppError';
import logger from '../utils/general/logger';
import { getAdminClient } from '../config/supabase';
import { validateImageBuffer } from '../utils/general/image-upload.util';

type Actor = {
  userId: string;
  branchId: number | null | undefined;
  role?: string;
};

type StockCountPayload = {
  countDate?: unknown;
  shift?: unknown;
  notes?: unknown;
  lines?: unknown;
};

type InventoryItemPayload = {
  name?: unknown;
  unit?: unknown;
  initialQuantity?: unknown;
  costPrice?: unknown;
  retailPrice?: unknown;
  category?: unknown;
  assignedBarberId?: unknown;
  supplierId?: unknown;
  expirationDate?: unknown;
};

type CostPricePayload = {
  name?: unknown;
  costPrice?: unknown;
  unit?: unknown;
  retailPrice?: unknown;
  category?: unknown;
  expirationDate?: unknown;
};

type StockQuantityPayload = {
  quantity?: unknown;
  reason?: unknown;
};

const parseExpirationDate = (val: unknown): string | null | undefined => {
  if (val === undefined) return undefined;
  if (val === null || val === '') return null;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed) || isNaN(Date.parse(trimmed))) {
      throw new AppError('expirationDate must be a valid date in YYYY-MM-DD format.', 400);
    }
    return trimmed;
  }
  throw new AppError('expirationDate must be a valid date string.', 400);
};
const cashierRoles = [UserRole.CASHIER, UserRole.INVENTORY_MANAGER, UserRole.OWNER, UserRole.SYSTEM_ADMIN, 'Admin', 'ShopAdmin'];
const reviewerRoles = [UserRole.OWNER, UserRole.SYSTEM_ADMIN, 'Admin', 'ShopAdmin'];
const inventoryViewerRoles = [...cashierRoles, UserRole.BARBER];
const forecastViewerRoles = [UserRole.INVENTORY_MANAGER, UserRole.OWNER, UserRole.SYSTEM_ADMIN, UserRole.ADMIN, UserRole.SHOP_ADMIN];

const requireRole = (actor: Actor, roles: string[], message: string): void => {
  if (!actor.role || !roles.includes(actor.role)) throw new AppError(message, 403);
};

const requirePositiveInteger = (value: unknown, field: string): number => {
  if (
    (typeof value !== 'number' && typeof value !== 'string') ||
    (typeof value === 'string' && value.trim() === '')
  ) {
    throw new AppError(`${field} must be a positive integer.`, 400);
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new AppError(`${field} must be a positive integer.`, 400);
  return parsed;
};

const requireQuantity = (value: unknown, field: string, allowZero = false): number => {
  if (
    (typeof value !== 'number' && typeof value !== 'string') ||
    (typeof value === 'string' && value.trim() === '')
  ) {
    throw new AppError(`${field} must be a valid non-negative quantity.`, 400);
  }
  const rawValue = typeof value === 'string' ? value.trim() : String(value);
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(rawValue)) {
    throw new AppError(`${field} must be a valid non-negative quantity.`, 400);
  }
  const decimalPlaces = rawValue.includes('.') ? rawValue.split('.')[1].length : 0;
  if (decimalPlaces > 3) {
    throw new AppError(`${field} must have at most 3 decimal places.`, 400);
  }
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed < (allowZero ? 0 : Number.EPSILON) || parsed > 1_000_000) {
    throw new AppError(`${field} must be a valid non-negative quantity.`, 400);
  }
  return parsed;
};

const requireCostPrice = (value: unknown, field = 'costPrice'): number => {
  if (
    (typeof value !== 'number' && typeof value !== 'string')
    || (typeof value === 'string' && value.trim() === '')
  ) {
    throw new AppError(`${field} must be a valid non-negative monetary amount.`, 400);
  }
  const rawValue = typeof value === 'string' ? value.trim() : String(value);
  if (!/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(rawValue)) {
    throw new AppError(`${field} must have at most 2 decimal places.`, 400);
  }
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 99_999_999.99) {
    throw new AppError(`${field} must be between 0 and 99,999,999.99.`, 400);
  }
  return Number(parsed.toFixed(2));
};

const optionalNotes = (value: unknown): string | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value.trim().length > 1000) throw new AppError('Notes must be 1,000 characters or fewer.', 400);
  return value.trim() || undefined;
};

const validateDate = (value: unknown): string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new AppError('countDate must use YYYY-MM-DD format.', 400);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new AppError('countDate is not a valid calendar date.', 400);
  return value;
};

const mapStockCountRepositoryError = (error: unknown): AppError | null => {
  switch ((error as { code?: string } | null)?.code) {
    case 'INVENTORY_STOCK_COUNT_NOT_FOUND':
      return new AppError('Stock count was not found.', 404);
    case 'INVENTORY_STOCK_COUNT_ALREADY_REVIEWED':
      return new AppError('This stock count has already been reviewed.', 409);
    case 'INVENTORY_STOCK_COUNT_NO_LINES':
      return new AppError('Stock count has no count lines.', 409);
    case 'INVENTORY_STOCK_COUNT_INVALID_LINES':
      return new AppError('Stock count contains an invalid inventory line.', 409);
    case 'INVENTORY_STOCK_COUNT_DUPLICATE_LINES':
      return new AppError('One or more added stock items are already in this count.', 409);
    case 'INVENTORY_STOCK_NOT_FOUND':
      return new AppError('One or more inventory items were not found.', 404);
    case 'INVENTORY_STOCK_ALREADY_EXISTS':
      return new AppError('This inventory item already exists for the selected category and barber.', 409);
    case 'INVENTORY_BARBER_NOT_FOUND':
      return new AppError('The selected barber was not found or is inactive.', 404);
    default:
      return null;
  }
};

export class InventoryService {
  async listInventory(actor: Actor): Promise<any[]> {
    requireRole(actor, inventoryViewerRoles, 'You are not authorized to view inventory.');
    return inventoryRepository.listInventory();
  }

  async listRetailCatalog(actor: Actor): Promise<any[]> {
    requireRole(actor, inventoryViewerRoles, 'You are not authorized to view inventory.');
    return inventoryRepository.listRetailCatalog();
  }

  async getInventoryForecast(actor: Actor): Promise<InventoryForecastResponse> {
    requireRole(actor, forecastViewerRoles, 'You are not authorized to view inventory forecasts.');
    return inventoryRepository.listInventoryForecast();
  }

  async createInventoryItem(actor: Actor, payload: InventoryItemPayload, req?: Request): Promise<any> {
    requireRole(actor, reviewerRoles, 'Only Owner or Shop Admin can add inventory items.');
    const name = typeof payload.name === 'string' ? payload.name.trim() : '';
    const unit = typeof payload.unit === 'string' ? payload.unit.trim() : '';
    if (name.length < 1 || name.length > 120) throw new AppError('Item name must be between 1 and 120 characters.', 400);
    if (unit.length < 1 || unit.length > 32) throw new AppError('Quantity unit must be between 1 and 32 characters.', 400);
    const initialQuantity = requireQuantity(payload.initialQuantity ?? 0, 'initialQuantity', true);
    const costPrice = requireCostPrice(payload.costPrice ?? 0);
    const rawCategory = payload.category ?? 'shared_retail';
    if (rawCategory !== 'barber_assigned' && rawCategory !== 'barber_consumables' && rawCategory !== 'shared_retail') {
      throw new AppError('category must be barber_assigned, barber_consumables, or shared_retail.', 400);
    }
    if (rawCategory !== 'shared_retail' && !Number.isInteger(initialQuantity)) {
      throw new AppError('Barber-supply stock must use a whole-unit quantity.', 400);
    }
    const ownershipType: 'barber_assigned' | 'shared_retail' = (rawCategory === 'barber_assigned' || rawCategory === 'barber_consumables')
      ? 'barber_assigned'
      : 'shared_retail';
    const retailPrice = ownershipType === 'shared_retail' && payload.retailPrice !== undefined && payload.retailPrice !== ''
      ? requireCostPrice(payload.retailPrice, 'retailPrice')
      : null;
    let supplierId: string | null = null;
    if (ownershipType === 'barber_assigned' && payload.supplierId) {
      if (typeof payload.supplierId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.supplierId)) {
        throw new AppError('supplierId must be a valid supplier identifier.', 400);
      }
      supplierId = payload.supplierId;
    }
    const expirationDate = parseExpirationDate(payload.expirationDate);
    const data: CreateInventoryItemInput = {
      name,
      unit,
      initialQuantity,
      costPrice,
      retailPrice,
      ownershipType,
      supplierId,
      supplierBranchId: actor.branchId == null ? null : Number(actor.branchId),
      createdBy: actor.userId,
    };
    if (expirationDate !== undefined) {
      data.expirationDate = expirationDate;
    }
    try {
      const item = await inventoryRepository.createInventoryItem(data);
      await auditService.logSecurityEvent({
        userId: actor.userId,
        action: 'INVENTORY_ITEM_CREATED',
        resource: 'inventory_product',
        details: {
          inventory_stock_id: item.id,
          item_name: item.name,
          unit: item.unit,
          cost_price: item.costPrice,
          initial_quantity: initialQuantity,
          category: ownershipType,
          expiration_date: item.expirationDate || undefined,
        },
        req,
      });
      return item;
    } catch (error) {
      if ((error as any)?.code === '23505') throw new AppError('An inventory item with this name and unit already exists.', 409);
      const mappedError = mapStockCountRepositoryError(error);
      if (mappedError) throw mappedError;
      throw error;
    }
  }

  async bulkDeleteInventoryItems(actor: Actor, itemIdsValue: unknown, req?: Request): Promise<any> {
    requireRole(actor, reviewerRoles, 'Only Owner or Shop Admin can remove inventory items.');
    let ids: number[] = [];
    if (Array.isArray(itemIdsValue)) {
      ids = itemIdsValue.map((id) => requirePositiveInteger(id, 'itemId'));
    } else if (typeof itemIdsValue === 'string' || typeof itemIdsValue === 'number') {
      ids = [requirePositiveInteger(itemIdsValue, 'itemId')];
    } else {
      throw new AppError('itemIds must be an array of item IDs.', 400);
    }

    if (ids.length === 0) {
      throw new AppError('At least one item ID is required for deletion.', 400);
    }

    const result = await inventoryRepository.bulkDeleteInventoryItems(ids);

    await auditService.logSecurityEvent({
      userId: actor.userId,
      action: 'INVENTORY_ITEMS_BULK_DELETED',
      resource: 'inventory_item',
      details: {
        deleted_count: result.deletedCount,
        item_ids: result.itemIds,
        deleted_items: result.deletedItems,
      },
      req,
    });

    return result;
  }

  async updateInventoryCostPrice(
    actor: Actor,
    inventoryStockIdValue: unknown,
    payload: CostPricePayload,
    req?: Request,
  ): Promise<any> {
    requireRole(actor, reviewerRoles, 'Only Owner or Shop Admin can edit inventory cost prices.');
    const category = payload.category === 'shared_retail' || payload.category === 'barber_assigned'
      ? payload.category
      : undefined;
    const expirationDate = parseExpirationDate(payload.expirationDate);
    const data: UpdateInventoryCostPriceInput = {
      inventoryStockId: requirePositiveInteger(inventoryStockIdValue, 'inventoryStockId'),
      costPrice: requireCostPrice(payload.costPrice),
      retailPrice: payload.retailPrice === undefined || payload.retailPrice === null || payload.retailPrice === ''
        ? null
        : requireCostPrice(payload.retailPrice, 'retailPrice'),
      ownershipType: category,
    };
    if (payload.name !== undefined) {
      const name = typeof payload.name === 'string' ? payload.name.trim() : '';
      if (name.length < 1 || name.length > 120) throw new AppError('Item name must be between 1 and 120 characters.', 400);
      data.name = name;
    }
    if (payload.unit !== undefined) {
      const unit = typeof payload.unit === 'string' ? payload.unit.trim() : '';
      if (unit.length < 1 || unit.length > 32) throw new AppError('Quantity unit must be between 1 and 32 characters.', 400);
      data.unit = unit;
    }
    if (expirationDate !== undefined) {
      data.expirationDate = expirationDate;
    }
    let result: any;
    try {
      result = await inventoryRepository.updateInventoryCostPrice(data);
    } catch (error) {
      const mappedError = mapStockCountRepositoryError(error);
      if (mappedError) throw mappedError;
      throw error;
    }
    await auditService.logSecurityEvent({
      userId: actor.userId,
      action: 'INVENTORY_PRODUCT_COST_PRICE_UPDATED',
      resource: 'inventory_product',
      details: {
        inventory_stock_id: data.inventoryStockId,
        inventory_product_id: result.productId,
        name: result.name ?? data.name,
        previous_cost_price: result.previousCostPrice,
        cost_price: result.costPrice,
        unit: result.unit ?? data.unit,
        retail_price: result.retailPrice,
        expiration_date: result.expirationDate ?? undefined,
      },
      req,
    });
    return result;
  }

  async updateStockQuantity(
    actor: Actor,
    inventoryStockIdValue: unknown,
    payload: StockQuantityPayload,
    req?: Request,
  ): Promise<any> {
    requireRole(actor, reviewerRoles, 'Only Owner or Shop Admin can edit inventory stock.');
    const data: UpdateInventoryStockInput = {
      inventoryStockId: requirePositiveInteger(inventoryStockIdValue, 'inventoryStockId'),
      quantity: requireQuantity(payload.quantity, 'quantity', true),
      reason: optionalNotes(payload.reason),
      updatedBy: actor.userId,
    };
    let item: any;
    try {
      item = await inventoryRepository.updateStockQuantity(data);
    } catch (error) {
      const mappedError = mapStockCountRepositoryError(error);
      if (mappedError) throw mappedError;
      throw error;
    }
    await auditService.logSecurityEvent({
      userId: actor.userId,
      action: 'INVENTORY_STOCK_MANUALLY_ADJUSTED',
      resource: 'inventory_stock',
      details: {
        inventory_stock_id: data.inventoryStockId,
        item_name: item.name,
        quantity_before: item.quantityBefore,
        quantity_delta: item.quantityDelta,
        quantity_after: item.quantityAfter,
        adjustment_source: 'admin_direct_edit',
        reason: data.reason || 'Direct stock edit',
      },
      req,
    });
    return item;
  }

  async replenishStock(
    actor: Actor,
    inventoryStockIdValue: unknown,
    payload: { quantity?: unknown; notes?: unknown; unitCost?: unknown; unit_cost?: unknown },
    req?: Request,
  ): Promise<any> {
    requireRole(actor, reviewerRoles, 'Only Owner or Shop Admin can replenish inventory stock.');
    const data: ReplenishStockInput = {
      inventoryStockId: requirePositiveInteger(inventoryStockIdValue, 'inventoryStockId'),
      quantity: requireQuantity(payload.quantity, 'quantity', false),
      unitCost: requireCostPrice(payload.unitCost ?? payload.unit_cost, 'unitCost'),
      notes: optionalNotes(payload.notes),
      replenishedBy: actor.userId,
    };
    let item: any;
    try {
      item = await inventoryRepository.replenishStock(data);
    } catch (error) {
      const mappedError = mapStockCountRepositoryError(error);
      if (mappedError) throw mappedError;
      throw error;
    }
    await auditService.logSecurityEvent({
      userId: actor.userId,
      action: 'INVENTORY_STOCK_REPLENISHED',
      resource: 'inventory_stock',
      details: {
        inventory_stock_id: data.inventoryStockId,
        item_name: item.name,
        quantity_added: data.quantity,
        quantity_before: item.quantityBefore,
        quantity_after: item.quantityAfter,
        unit_cost: data.unitCost,
        reason: data.notes || 'Direct shelf replenishment',
      },
      req,
    });
    return item;
  }

  async listConsumption(actor: Actor, limitValue?: unknown): Promise<any[]> {
    requireRole(actor, inventoryViewerRoles, 'You are not authorized to view inventory consumption.');
    const limit = limitValue === undefined ? 100 : requirePositiveInteger(limitValue, 'limit');
    if (limit > 500) throw new AppError('limit cannot exceed 500.', 400);
    return inventoryRepository.listConsumption(limit);
  }

  /**
   * Authorizes an inventory viewer and retrieves a bounded, newest-first movement report.
   * Returns repository rows classified for estimated consumption, physical count corrections, receipts, or manual adjustments.
   */
  async listStockMovements(actor: Actor, limitValue?: unknown): Promise<any[]> {
    requireRole(actor, inventoryViewerRoles, 'You are not authorized to view inventory movements.');
    const limit = limitValue === undefined ? 100 : requirePositiveInteger(limitValue, 'limit');
    if (limit > 500) throw new AppError('limit cannot exceed 500.', 400);
    return inventoryRepository.listStockMovements(limit);
  }

  async submitStockCount(actor: Actor, payload: StockCountPayload, req?: Request): Promise<any> {
    requireRole(actor, cashierRoles, 'Only cashier-compatible staff may submit stock counts.');
    const branchId = actor.branchId ?? null;
    if (!Array.isArray(payload.lines) || payload.lines.length === 0 || payload.lines.length > 500) {
      throw new AppError('At least one stock count line is required.', 400);
    }
    const seen = new Set<number>();
    const lines = payload.lines.map((rawLine) => {
      if (!rawLine || typeof rawLine !== 'object') throw new AppError('Each count line must be an object.', 400);
      const line = rawLine as Record<string, unknown>;
      const inventoryStockId = requirePositiveInteger(line.inventoryStockId, 'inventoryStockId');
      if (seen.has(inventoryStockId)) throw new AppError('Each stock item may appear only once in a count.', 400);
      seen.add(inventoryStockId);
      return {
        inventoryStockId,
        countedQuantity: requireQuantity(line.countedQuantity, 'countedQuantity', true),
        notes: optionalNotes(line.notes),
      };
    });
    const shift = payload.shift;
    if (shift !== 'morning' && shift !== 'afternoon' && shift !== 'evening') throw new AppError('shift must be morning, afternoon, or evening.', 400);
    const data: SubmitStockCountInput = {
      branchId,
      submittedBy: actor.userId,
      countDate: validateDate(payload.countDate),
      shift,
      notes: optionalNotes(payload.notes),
      submittedByRole: actor.role === UserRole.INVENTORY_MANAGER ? 'inventory_manager' : actor.role === UserRole.CASHIER ? 'cashier' : 'admin',
      lines,
    };
    try {
      const count = await inventoryRepository.createStockCount(data);
      await auditService.logSecurityEvent({ userId: actor.userId, action: 'INVENTORY_COUNT_SUBMITTED', resource: 'inventory_stock_count', details: { stock_count_id: count.id, branch_id: branchId, shift, line_count: lines.length }, req });
      return count;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '';
      if (errorMessage.includes('already been submitted') || errorMessage.includes('already been approved')) {
        throw new AppError('A count for this date and shift has already been submitted.', 409);
      }
      if ((error as any)?.code === '23505' || errorMessage.includes('already exists')) {
        throw new AppError('A count for this date and shift already exists.', 409);
      }
      const mappedError = mapStockCountRepositoryError(error);
      if (mappedError) throw mappedError;
      throw error;
    }
  }

  async listPendingStockCounts(actor: Actor): Promise<any[]> {
    requireRole(actor, reviewerRoles, 'Only Owner, Admin, or Shop Admin can review stock counts.');
    return inventoryRepository.listPendingStockCounts();
  }

  async reviewStockCount(
    actor: Actor,
    stockCountIdValue: unknown,
    payload: {
      decision?: unknown;
      status?: unknown;
      reason?: unknown;
      rejectionReason?: unknown;
      additionalLines?: unknown;
    },
    req?: Request,
  ): Promise<any> {
    requireRole(actor, reviewerRoles, 'Only Owner, Admin, or Shop Admin can review stock counts.');
    const branchId = actor.branchId ?? null;
    const stockCountId = requirePositiveInteger(stockCountIdValue, 'stockCountId');
    if (payload.decision !== undefined && payload.status !== undefined && payload.decision !== payload.status) {
      throw new AppError('decision and status must match when both are provided.', 400);
    }
    const decision = payload.decision ?? payload.status;
    if (decision !== 'approved' && decision !== 'rejected') throw new AppError('status must be approved or rejected.', 400);
    const reason = optionalNotes(payload.reason ?? payload.rejectionReason);
    if (decision === 'rejected' && (!reason || reason.length < 3)) {
      throw new AppError('A meaningful rejection reason is required.', 400);
    }
    if (decision === 'rejected' && payload.additionalLines !== undefined) {
      throw new AppError('Additional stock items can only be added when approving a count.', 400);
    }

    let additionalLines: ReviewStockCountInput['additionalLines'];
    if (payload.additionalLines !== undefined) {
      if (!Array.isArray(payload.additionalLines) || payload.additionalLines.length > 500) {
        throw new AppError('additionalLines must contain 500 items or fewer.', 400);
      }
      const seen = new Set<number>();
      additionalLines = payload.additionalLines.map((rawLine) => {
        if (!rawLine || typeof rawLine !== 'object') throw new AppError('Each added count line must be an object.', 400);
        const line = rawLine as Record<string, unknown>;
        const inventoryStockId = requirePositiveInteger(line.inventoryStockId, 'inventoryStockId');
        if (seen.has(inventoryStockId)) throw new AppError('Each added stock item may appear only once.', 400);
        seen.add(inventoryStockId);
        return {
          inventoryStockId,
          countedQuantity: requireQuantity(line.countedQuantity, 'countedQuantity', true),
          notes: optionalNotes(line.notes),
        };
      });
    }

    const data: ReviewStockCountInput = {
      branchId,
      stockCountId,
      reviewedBy: actor.userId,
      decision,
      reason,
      additionalLines,
    };
    let count: any;
    try {
      count = await inventoryRepository.reviewStockCount(data);
    } catch (error) {
      const mappedError = mapStockCountRepositoryError(error);
      if (mappedError) throw mappedError;
      throw error;
    }
    const reviewDetails = {
      stock_count_id: stockCountId,
      branch_id: branchId,
      shift: count?.shift,
      line_count: Array.isArray(count?.lines) ? count.lines.length : undefined,
      additional_line_count: additionalLines?.length || 0,
      movement_count: Number(count?.movementCount) || 0,
      reason: reason || null,
    };
    await auditService.logSecurityEvent({
      userId: actor.userId,
      action: data.decision === 'approved' ? 'INVENTORY_COUNT_APPROVED' : 'INVENTORY_COUNT_REJECTED',
      resource: 'inventory_stock_count',
      details: reviewDetails,
      req,
    });
    if (data.decision === 'approved') {
      await auditService.logSecurityEvent({
        userId: actor.userId,
        action: 'INVENTORY_STOCK_ADJUSTED',
        resource: 'inventory_stock',
        details: { ...reviewDetails, adjustment_source: 'approved_count' },
        req,
      });
      if (Number(count?.movementCount) > 0) {
        await auditService.logSecurityEvent({
          userId: actor.userId,
          action: 'INVENTORY_STOCK_MOVEMENT_CREATED',
          resource: 'inventory_stock_movement',
          details: { ...reviewDetails, adjustment_source: 'approved_count' },
          req,
        });
      }
    }
    return {
      ...count,
      auditTrail: [
        {
          action: data.decision === 'approved' ? 'INVENTORY_COUNT_APPROVED' : 'INVENTORY_COUNT_REJECTED',
          resource: 'inventory_stock_count',
          actorId: actor.userId,
          branchId,
          recordedAt: count?.reviewedAt || new Date().toISOString(),
        },
        ...(data.decision === 'approved'
          ? [
              {
                action: 'INVENTORY_STOCK_ADJUSTED',
                resource: 'inventory_stock',
                actorId: actor.userId,
                branchId,
                recordedAt: count?.reviewedAt || new Date().toISOString(),
              },
              ...(Number(count?.movementCount) > 0
                ? [{
                    action: 'INVENTORY_STOCK_MOVEMENT_CREATED',
                    resource: 'inventory_stock_movement',
                    actorId: actor.userId,
                    branchId,
                    recordedAt: count?.reviewedAt || new Date().toISOString(),
                  }]
                : []),
            ]
          : []),
      ],
    };
  }

  async listStockCounts(
    actor: Actor,
    query: { status?: unknown; startDate?: unknown; endDate?: unknown; limit?: unknown } = {},
  ): Promise<any[]> {
    requireRole(actor, reviewerRoles, 'Only Owner, Admin, or Shop Admin can view physical count history.');
    const options: ListStockCountsOptions = {};
    if (typeof query.status === 'string' && query.status.trim()) {
      options.status = query.status.trim();
    }
    if (query.startDate) {
      options.startDate = validateDate(query.startDate);
    }
    if (query.endDate) {
      options.endDate = validateDate(query.endDate);
    }
    if (options.startDate && options.endDate && options.startDate > options.endDate) {
      throw new AppError('startDate cannot be after endDate.', 400);
    }
    if (query.limit !== undefined) {
      options.limit = requirePositiveInteger(query.limit, 'limit');
    }
    return inventoryRepository.listStockCounts(options);
  }

  async getPhysicalCountVariances(
    actor: Actor,
    query: { startDate?: unknown; endDate?: unknown } = {},
  ): Promise<any[]> {
    requireRole(actor, reviewerRoles, 'Only Owner, Admin, or Shop Admin can view count variances.');
    const startDate = query.startDate ? validateDate(query.startDate) : new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const endDate = query.endDate ? validateDate(query.endDate) : new Date().toISOString().slice(0, 10);
    if (startDate > endDate) {
      throw new AppError('startDate cannot be after endDate.', 400);
    }
    return inventoryRepository.getPhysicalCountVariances(startDate, endDate);
  }

  async getInventoryReport(
    actor: Actor,
    query: { startDate?: unknown; endDate?: unknown; period?: unknown; inventoryStockId?: unknown; view?: unknown } = {},
  ): Promise<InventoryReportResponse> {
    requireRole(actor, reviewerRoles, 'Only Owner, Admin, or Shop Admin can view inventory reports.');
    const today = new Date().toISOString().slice(0, 10);
    const startDate = query.startDate ? validateDate(query.startDate) : today;
    const endDate = query.endDate ? validateDate(query.endDate) : today;
    if (startDate > endDate) {
      throw new AppError('startDate cannot be after endDate.', 400);
    }

    const period = query.period === 'daily' || query.period === 'weekly' || query.period === 'custom'
      ? query.period
      : 'daily';

    const inventoryStockId = query.inventoryStockId !== undefined && query.inventoryStockId !== ''
      ? requirePositiveInteger(query.inventoryStockId, 'inventoryStockId')
      : undefined;

    const data: InventoryReportQueryInput = {
      startDate,
      endDate,
      period,
      inventoryStockId,
      ...(query.view === 'summary' ? { view: 'summary' as const } : {}),
    };

    return inventoryRepository.getInventoryReport(data);
  }

  async getInventoryAlerts(actor: Actor): Promise<any[]> {
    requireRole(actor, cashierRoles, 'You are not authorized to view inventory alerts.');
    return inventoryRepository.getInventoryAlerts();
  }

  async updateRetailPresentation(
    actor: Actor,
    productIdOrStockIdValue: unknown,
    payload: {
      name?: unknown;
      unit?: unknown;
      costPrice?: unknown;
      retailPrice?: unknown;
      retailCategory?: unknown;
      tags?: unknown;
      showInShop?: unknown;
      imageUrl?: unknown;
    },
    req?: Request,
  ): Promise<any> {
    requireRole(actor, reviewerRoles, 'Only Owner, Admin, or Shop Admin can edit retail product presentations.');
    const id = requirePositiveInteger(productIdOrStockIdValue, 'productId');

    const updateData: {
      name?: string;
      unit?: string;
      costPrice?: number;
      retailPrice?: number | null;
      retailCategory?: string | null;
      tags?: string[];
      showInShop?: boolean;
      imageUrl?: string | null;
    } = {};

    if (payload.name !== undefined) {
      const name = typeof payload.name === 'string' ? payload.name.trim() : '';
      if (name.length < 1 || name.length > 120) throw new AppError('Item name must be between 1 and 120 characters.', 400);
      updateData.name = name;
    }

    if (payload.unit !== undefined) {
      const unit = typeof payload.unit === 'string' ? payload.unit.trim() : '';
      if (unit.length < 1 || unit.length > 32) throw new AppError('Quantity unit must be between 1 and 32 characters.', 400);
      updateData.unit = unit;
    }

    if (payload.costPrice !== undefined && payload.costPrice !== null && payload.costPrice !== '') {
      updateData.costPrice = requireCostPrice(payload.costPrice);
    }

    if (payload.retailPrice !== undefined) {
      updateData.retailPrice = (payload.retailPrice === null || payload.retailPrice === '')
        ? null
        : requireCostPrice(payload.retailPrice, 'retailPrice');
    }

    if (payload.retailCategory !== undefined) {
      updateData.retailCategory = typeof payload.retailCategory === 'string' && payload.retailCategory.trim() !== ''
        ? payload.retailCategory.trim()
        : null;
    }

    if (payload.tags !== undefined) {
      if (Array.isArray(payload.tags)) {
        updateData.tags = Array.from(new Set(payload.tags.map((t) => String(t).trim()).filter(Boolean)));
      } else {
        updateData.tags = [];
      }
    }

    if (payload.showInShop !== undefined) {
      updateData.showInShop = Boolean(payload.showInShop);
    }

    if (payload.imageUrl !== undefined) {
      updateData.imageUrl = typeof payload.imageUrl === 'string' && payload.imageUrl.trim() !== ''
        ? payload.imageUrl.trim()
        : null;
    }

    let updatedItem: any;
    try {
      updatedItem = await inventoryRepository.updateRetailPresentation(id, updateData);
    } catch (error: any) {
      if (error?.code === 'INVENTORY_STOCK_NOT_FOUND') {
        throw new AppError('Inventory product not found.', 404);
      }
      throw error;
    }

    if (!updatedItem) {
      throw new AppError('Inventory product not found.', 404);
    }

    await auditService.logSecurityEvent({
      userId: actor.userId,
      action: 'RETAIL_PRODUCT_PRESENTATION_UPDATED',
      resource: 'inventory_product',
      details: {
        target_id: id,
        updates: updateData,
      },
      req,
    });

    return updatedItem;
  }

  async uploadProductImage(
    actor: Actor,
    productIdOrStockIdValue: unknown,
    fileBuffer: Buffer,
    _mimeType: string,
    req?: Request,
  ): Promise<{ imageUrl: string }> {
    requireRole(actor, reviewerRoles, 'Only Owner, Admin, or Shop Admin can upload product images.');
    const id = requirePositiveInteger(productIdOrStockIdValue, 'productId');

    const detected = validateImageBuffer(fileBuffer);
    const randomKey = crypto.randomBytes(8).toString('hex');
    const filePath = `products/prod_${id}_${Date.now()}_${randomKey}.${detected.extension}`;

    const adminClient = getAdminClient();
    const { error: uploadError } = await adminClient.storage
      .from('avatars')
      .upload(filePath, fileBuffer, {
        contentType: detected.mimeType,
        upsert: false,
      });

    if (uploadError) {
      logger.error(`[uploadProductImage] Storage upload failed: ${uploadError.message}`);
      throw new AppError('Failed to upload product image. Please try again.', 500);
    }

    const { data: { publicUrl } } = adminClient.storage
      .from('avatars')
      .getPublicUrl(filePath);

    await inventoryRepository.updateRetailPresentation(id, { imageUrl: publicUrl });

    await auditService.logSecurityEvent({
      userId: actor.userId,
      action: 'RETAIL_PRODUCT_IMAGE_UPLOADED',
      resource: 'inventory_product',
      details: {
        target_id: id,
        image_url: publicUrl,
      },
      req,
    });

    return { imageUrl: publicUrl };
  }

  async deleteProductImage(
    actor: Actor,
    productIdOrStockIdValue: unknown,
    req?: Request,
  ): Promise<{ success: boolean; imageUrl: null }> {
    requireRole(actor, reviewerRoles, 'Only Owner, Admin, or Shop Admin can delete product images.');
    const id = requirePositiveInteger(productIdOrStockIdValue, 'productId');

    await inventoryRepository.updateRetailPresentation(id, { imageUrl: null });

    await auditService.logSecurityEvent({
      userId: actor.userId,
      action: 'RETAIL_PRODUCT_IMAGE_REMOVED',
      resource: 'inventory_product',
      details: { target_id: id },
      req,
    });

    return { success: true, imageUrl: null };
  }

  async listRetailTags(_actor?: Actor): Promise<string[]> {
    return inventoryRepository.listRetailTags();
  }

  async createRetailTag(actor: Actor, name: string, req?: Request): Promise<{ name: string }> {
    requireRole(actor, reviewerRoles, 'Only Owner, Admin, or Shop Admin can create retail tags.');
    const clean = String(name || '').trim();
    if (!clean) throw new AppError('Tag name cannot be empty.', 400);
    const created = await inventoryRepository.createRetailTag(clean);
    await auditService.logSecurityEvent({
      userId: actor.userId,
      action: 'RETAIL_TAG_CREATED',
      resource: 'retail_tag',
      details: { name: created },
      req,
    });
    return { name: created };
  }

  async listRetailCategories(_actor?: Actor): Promise<string[]> {
    return inventoryRepository.listRetailCategories();
  }

  async createRetailCategory(actor: Actor, name: string, req?: Request): Promise<{ name: string }> {
    requireRole(actor, reviewerRoles, 'Only Owner, Admin, or Shop Admin can create retail categories.');
    const clean = String(name || '').trim();
    if (!clean) throw new AppError('Category name cannot be empty.', 400);
    const created = await inventoryRepository.createRetailCategory(clean);
    await auditService.logSecurityEvent({
      userId: actor.userId,
      action: 'RETAIL_CATEGORY_CREATED',
      resource: 'retail_category',
      details: { name: created },
      req,
    });
    return { name: created };
  }

  async getPublicShopProducts(): Promise<any[]> {
    return inventoryRepository.getPublicShopProducts();
  }
}

export const inventoryService = new InventoryService();

