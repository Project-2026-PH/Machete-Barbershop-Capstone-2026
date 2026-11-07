/**
 * Worker utility to handle standardized formatting for queue entries.
 * Isolates the "How" of data and cache management from the "What" of the application flow.
 */

/**
 * Prepares the final data object for joining a queue.
 * Merges customer input with position and status details.
 * 
 * @param data - The original join request data.
 * @param position - The calculated position in the queue.
 * @param statusInfo - The status and timer info determined for this position.
 * @returns A standardized database entry object.
 */
export const prepareJoinPayload = (
  data: any,
  position: number,
  statusInfo: { status: string; timerStartedAt: string | null }
) => {
  return {
    customerId: data.customerId,
    barberId: data.barberId,
    branchId: data.branchId,
    serviceId: data.serviceId,
    position,
    ...statusInfo,
  };
};

/**
 * Prepares the final data object for a walk-in queue entry.
 * Merges customer input with position and payment status.
 * 
 * @param data - The original walk-in request data.
 * @param position - The calculated position in the queue.
 * @returns A standardized database entry object for walk-ins.
 */
export const prepareWalkInPayload = (data: any, position: number, serviceData?: {
  serviceIds?: number[];
  durationMinutes?: number | null;
  status?: string;
  timerStartedAt?: string | null;
}) => {
  return {
    customerName: data.customerName,
    barberId: data.barberId,
    branchId: data.branchId,
    serviceId: serviceData?.serviceIds?.[0] ?? null,
    serviceIds: serviceData?.serviceIds ?? data.serviceIds ?? [],
    durationMinutes: serviceData?.durationMinutes ?? null,
    idempotencyKey: data.idempotencyKey ?? null,
    position,
    status: serviceData?.status ?? 'waiting',
    timerStartedAt: serviceData?.timerStartedAt ?? null,
    paymentStatus: data.isPrePaid || data.paymentLines?.length ? 'paid' : 'unpaid',
  };
};

/**
 * Retained as a compatibility hook for callers. Queue cancellation is authoritative
 * in PostgreSQL; no code reads the old Redis cancellation key.
 * 
 * @param queueId - The ID of the queue entry that was cancelled.
 */
export const cacheQueueCancellation = async (queueId: number): Promise<void> => {
  void queueId;
};
