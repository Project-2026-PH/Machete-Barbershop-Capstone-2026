import { AppError } from '../error/AppError';
import { WalkInData, BarberStatus } from '@demoshop/shared-types';

/**
 * Ensures a valid branch identification is provided.
 */
export const validateBranchAccess = (branchId: number | null | undefined): void => {
  if (!Number.isInteger(branchId) || (branchId ?? 0) < 1) {
    throw new AppError('User does not belong to a branch.', 400);
  }
};

/**
 * Validates if an order can be finished by checking branch ownership and payment.
 */
export const validateOrderForFinish = (order: any, branchId: number): void => {
  if (!order) {
    throw new AppError('Order not found.', 404);
  }
  if (order.branch_id !== branchId) {
    throw new AppError('Not authorized for this branch.', 403);
  }
  if (order.payment_status === 'unpaid') {
    throw new AppError('Payment required before printing receipt', 400);
  }
};

/**
 * Validates required fields for a new walk-in customer.
 */
export const validateWalkInInput = (data: WalkInData): void => {
  const customerName = data.customerName?.trim() || '';
  if (!customerName) {
    throw new AppError('Customer name is required.', 400);
  }
  if (customerName.length < 2) {
    throw new AppError('Customer name must contain at least 2 characters.', 400);
  }
  if (customerName.length > 120) {
    throw new AppError('Customer name is too long.', 413);
  }
  if (data.barberId !== undefined && data.barberId !== null) {
    if (!Number.isInteger(data.barberId) || data.barberId < 1) {
      throw new AppError('A valid barber is required.', 400);
    }
  }
  if (data.serviceIds !== undefined) {
    if (!Array.isArray(data.serviceIds) || data.serviceIds.length > 20 || data.serviceIds.some((id) => !Number.isSafeInteger(id) || id < 1)) {
      throw new AppError('Walk-in services must contain valid service IDs.', 400);
    }
    if (new Set(data.serviceIds).size !== data.serviceIds.length) {
      throw new AppError('Walk-in services cannot contain duplicates.', 400);
    }
  }
  if (data.retailItems !== undefined) {
    if (!Array.isArray(data.retailItems) || data.retailItems.length > 50) {
      throw new AppError('Retail items are invalid.', 400);
    }
    for (const line of data.retailItems) {
      if (!Number.isSafeInteger(line.productId) || line.productId < 1 || !Number.isFinite(line.quantity) || line.quantity <= 0) {
        throw new AppError('Retail items must contain valid product IDs and quantities.', 400);
      }
    }
  }
  if (data.idempotencyKey !== undefined && (!/^[A-Za-z0-9._:-]{8,120}$/.test(data.idempotencyKey))) {
    throw new AppError('A valid walk-in idempotency key is required.', 400);
  }
  if (data.reservationCode !== undefined && (!/^MCH-\d{1,10}$/i.test(data.reservationCode.trim()))) {
    throw new AppError('A valid reservation code is required.', 400);
  }
  if (data.paymentLines !== undefined) {
    if (!Array.isArray(data.paymentLines) || data.paymentLines.length > 20) {
      throw new AppError('Payment lines are invalid.', 400);
    }
    for (const line of data.paymentLines) {
      if (!Number.isSafeInteger(line.serviceId) || line.serviceId < 1 || !['Cash', 'GCash'].includes(line.method)) {
        throw new AppError('Payment lines contain invalid service or payment method.', 400);
      }
      if (line.method === 'GCash' && !/^\d{4}$/.test(line.gcashRefLast4 || '')) {
        throw new AppError('GCash payments require a 4-digit reference.', 400);
      }
    }
    if (new Set(data.paymentLines.map((line) => line.serviceId)).size !== data.paymentLines.length) {
      throw new AppError('Payment lines cannot contain duplicate services.', 400);
    }
  }
  validateBranchAccess(data.branchId);
};

export const validateRetailSaleInput = (data: {
  customerName?: string;
  branchId: number;
  items: Array<{ productId: number; quantity: number }>;
  paymentMethod?: string;
  gcashRefNo?: string | null;
  idempotencyKey?: string;
}): void => {
  validateBranchAccess(data.branchId);
  const customerName = data.customerName?.trim() || '';
  if (customerName && customerName.length < 2) {
    throw new AppError('Customer name must contain at least 2 characters.', 400);
  }
  if (customerName.length > 120) {
    throw new AppError('Customer name is too long.', 413);
  }
  if (!Array.isArray(data.items) || data.items.length === 0) {
    throw new AppError('At least one retail product is required.', 400);
  }
  if (data.items.length > 50) {
    throw new AppError('Too many retail items in this sale.', 400);
  }
  for (const line of data.items) {
    if (!Number.isSafeInteger(line.productId) || line.productId < 1 || !Number.isFinite(line.quantity) || line.quantity <= 0) {
      throw new AppError('Retail items must contain valid product IDs and quantities.', 400);
    }
  }
  if (data.idempotencyKey !== undefined && (!/^[A-Za-z0-9._:-]{8,120}$/.test(data.idempotencyKey))) {
    throw new AppError('A valid retail sale idempotency key is required.', 400);
  }
  if (!data.idempotencyKey) {
    throw new AppError('A valid retail sale idempotency key is required.', 400);
  }
  const method = data.paymentMethod || 'Cash';
  if (!['Cash', 'GCash'].includes(method)) {
    throw new AppError('Payment method must be Cash or GCash.', 400);
  }
  if (method === 'GCash' && !String(data.gcashRefNo || '').trim()) {
    throw new AppError('A valid GCash reference number is required.', 400);
  }
};

export const validateBarberStatus = (status: string): void => {
  const normalized = (status || '').trim().toLowerCase().replace(/\s+/g, '_');
  const validStatuses = [
    'available',
    'serving',
    'busy',
    'break',
    'on_break',
    'leave',
    'absent',
    'suspended',
    'offline',
  ];
  if (!validStatuses.includes(normalized)) {
    throw new AppError('Invalid status', 400);
  }
};
