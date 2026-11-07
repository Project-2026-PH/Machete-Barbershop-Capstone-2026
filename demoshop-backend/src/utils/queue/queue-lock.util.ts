import logger from '../general/logger';

const LOCAL_LOCK_TTL_MS = 5000;

type LocalLock = { expiresAt: number };
const localLocks = new Map<number, LocalLock>();
const localLockOwners = new Set<number>();

/**
 * Utility for managing queue operation locks.
 * Prevents race conditions when multiple customers attempt to join or mutate a barber's queue.
 * Operates purely in-process with 0ms overhead, avoiding unreachable direct database/Redis timeouts.
 */

/**
 * Attempts to acquire an in-process lock for a specific barber.
 * 
 * @param barberId - The ID of the barber to lock.
 * @returns `true` when acquired or `false` when another request owns the lock.
 */
export const acquireBarberLock = async (barberId: number): Promise<boolean> => {
  if (isLocalBarberLockActive(barberId)) {
    logger.warn('[Queue] Race condition prevented while acquiring barber lock', { barberId });
    return false;
  }

  localLocks.set(barberId, { expiresAt: Date.now() + LOCAL_LOCK_TTL_MS });
  localLockOwners.add(barberId);
  return true;
};

const isLocalBarberLockActive = (barberId: number): boolean => {
  const lock = localLocks.get(barberId);
  if (!lock) return false;
  if (lock.expiresAt > Date.now()) return true;

  localLocks.delete(barberId);
  localLockOwners.delete(barberId);
  return false;
};

/**
 * Releases a previously acquired lock for a barber.
 * 
 * @param barberId - The ID of the barber whose lock should be released.
 */
export const releaseBarberLock = async (barberId: number): Promise<void> => {
  localLockOwners.delete(barberId);
  localLocks.delete(barberId);
};
