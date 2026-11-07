/**
 * Business logic for queue state transitions and debouncing.
 * Standardizes how service statuses and timers are initialized.
 */

// Debounce map: prevents concurrent reads from all triggering expireTimers
// Key: barberId, Value: timestamp of last expiry check
const lastExpireCheck = new Map<number, number>();
const EXPIRE_DEBOUNCE_MS = 5000;

// Debounce map: prevents concurrent reads from all triggering synchronizeScheduledReservations
// Key: barberId, Value: timestamp of last sync check
const lastSyncCheck = new Map<number, number>();
const SYNC_DEBOUNCE_MS = 5000;

/**
 * Determines the initial status and timer start time for a new queue entry.
 * 
 * @param position - The current position in the queue (1-based).
 * @returns An object containing the status and the ISO timestamp of when the timer started.
 * 
 * Logic:
 * - Position 1: Immediately starts as 'serving'.
 * - Other: Starts as 'waiting' with no timer.
 */
export const determineInitialStatus = (position: number): { status: string; timerStartedAt: string | null } => {
  const isServing = position === 1;
  return {
    status: isServing ? 'serving' : 'waiting',
    timerStartedAt: isServing ? new Date().toISOString() : null,
  };
};

/**
 * Checks if a barber's queue expiry check should be debounced.
 * Prevents multiple concurrent requests from triggering expensive DB cleanup.
 * 
 * @param barberId - The ID of the barber whose queue is being checked.
 * @returns True if the check should be skipped (debounced), false otherwise.
 */
export const shouldDebounceExpiry = (barberId: number): boolean => {
  const lastCheck = lastExpireCheck.get(barberId);
  const now = Date.now();
  
  if (lastCheck && (now - lastCheck) < EXPIRE_DEBOUNCE_MS) {
    return true;
  }
  
  lastExpireCheck.set(barberId, now);
  return false;
};

/**
 * Checks if a barber's scheduled reservation synchronization should be debounced on read.
 * Prevents multiple concurrent read requests from acquiring write locks and transactions.
 * 
 * @param barberId - The ID of the barber whose reservations are being checked.
 * @returns True if the check should be skipped (debounced), false otherwise.
 */
export const shouldDebounceSync = (barberId: number): boolean => {
  const lastCheck = lastSyncCheck.get(barberId);
  const now = Date.now();
  
  if (lastCheck && (now - lastCheck) < SYNC_DEBOUNCE_MS) {
    return true;
  }
  
  lastSyncCheck.set(barberId, now);
  return false;
};

/**
 * Resets the expiry debounce timer for a barber.
 * Typically used when the queue state manually changes (e.g., advancing the queue).
 * 
 * @param barberId - The ID of the barber to clear from the debounce map.
 */
export const resetExpiryDebounce = (barberId: number): void => {
  lastExpireCheck.delete(barberId);
};

/**
 * Resets the sync debounce timer for a barber.
 * 
 * @param barberId - The ID of the barber to clear from the debounce map.
 */
export const resetSyncDebounce = (barberId: number): void => {
  lastSyncCheck.delete(barberId);
};

/**
 * Resets all queue maintenance debounce timers for a barber.
 * Invoked on all state-mutating queue operations.
 * 
 * @param barberId - The ID of the barber to clear from all debounce maps.
 */
export const resetQueueMaintenanceDebounce = (barberId: number): void => {
  lastExpireCheck.delete(barberId);
  lastSyncCheck.delete(barberId);
};

