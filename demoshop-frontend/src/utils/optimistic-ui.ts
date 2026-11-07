import { offlineQueue, OfflinePayload } from '../features/cashier/services/offlineQueue';

export interface OptimisticMutationConfig<T> {
  currentState: T;
  optimisticState: T;
  updateState: (newState: T) => void;
  asyncAction: () => Promise<unknown>;
  offlinePayload?: OfflinePayload;
  onError?: (error: unknown) => void;
}

/**
 * Optimistic UI update wrapper with instant UI mutation, offline queue backing, and automatic rollback.
 */
export async function executeOptimisticMutation<T>({
  currentState,
  optimisticState,
  updateState,
  asyncAction,
  offlinePayload,
  onError
}: OptimisticMutationConfig<T>): Promise<boolean> {
  // Instant UI update (Optimistic)
  updateState(optimisticState);

  // 2. Check offline connection
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    if (offlinePayload) {
      await offlineQueue.save(offlinePayload);
    }
    return true;
  }

  // 3. Attempt online action with automatic rollback
  try {
    await asyncAction();
    return true;
  } catch (error) {
    console.error('[OptimisticUI] Action failed, rolling back local state:', error);
    updateState(currentState);

    if (offlinePayload) {
      console.warn('[OptimisticUI] Persisting failed mutation to offline sync queue');
      await offlineQueue.save(offlinePayload);
    }

    if (onError) {
      onError(error);
    }
    return false;
  }
}
