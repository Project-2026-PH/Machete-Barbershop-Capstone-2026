import { WalkInData } from '@demoshop/shared-types';

/**
 * Prepares an offline order for synchronization.
 * Handles JSON parsing of payload and defaults.
 */
export const prepareOfflineOrder = (order: any, authenticatedBranchId: number): WalkInData => {
  const embeddedPayload = order.payload
    ? (typeof order.payload === 'string' ? JSON.parse(order.payload) : order.payload)
    : null;
  // Prefer the top-level canonical command. Older queued records may contain
  // the command under payload, but must not lose the top-level barber ID.
  const payload = Number.isInteger(order.barberId) ? order : embeddedPayload || order;

  return {
    customerName: String(payload.customerName || '').trim(),
    barberId: Number(payload.barberId),
    serviceIds: Array.isArray(payload.serviceIds) ? payload.serviceIds.map(Number) : undefined,
    idempotencyKey: typeof payload.idempotencyKey === 'string' ? payload.idempotencyKey : undefined,
    paymentLines: Array.isArray(payload.paymentLines) ? payload.paymentLines.map((line: any) => ({
      serviceId: Number(line.serviceId),
      method: line.method,
      gcashRefLast4: line.gcashRefLast4 || null,
    })) : undefined,
    reservationCode: typeof payload.reservationCode === 'string' ? payload.reservationCode.trim().toUpperCase() : undefined,
    branchId: authenticatedBranchId,
    isPrePaid: Boolean(payload.isPrePaid),
  };
};
