import type { CashierOutboxOperation, LocalWalkInTransaction } from './cashier-offline.repository';

export interface CashierOfflineWorklistItem {
  transaction: LocalWalkInTransaction;
  operation: CashierOutboxOperation;
}

export const buildCashierOfflineWorklist = (
  transactions: LocalWalkInTransaction[],
  operations: CashierOutboxOperation[],
): CashierOfflineWorklistItem[] => {
  const transactionById = new Map(transactions.map((transaction) => [transaction.localId, transaction]));
  const firstUnresolvedOperationByTransaction = new Map<string, CashierOutboxOperation>();

  for (const operation of [...operations].sort((left, right) => left.sequence - right.sequence)) {
    if (operation.status === 'synced' || firstUnresolvedOperationByTransaction.has(operation.localTransactionId)) continue;
    firstUnresolvedOperationByTransaction.set(operation.localTransactionId, operation);
  }

  return [...firstUnresolvedOperationByTransaction.values()]
    .flatMap((operation) => {
      const transaction = transactionById.get(operation.localTransactionId);
      return transaction ? [{ transaction, operation }] : [];
    })
    .sort((left, right) => left.operation.createdAt - right.operation.createdAt);
};

export const getCashierOfflineNextAction = (item: CashierOfflineWorklistItem): string => {
  const { operation, transaction } = item;
  if (operation.status === 'retryable') return 'Retry the saved operation when the connection is available.';
  if (operation.type === 'capture_cash' || transaction.paymentStatus === 'paid') {
    return 'Do not collect cash again. Ask a manager to reconcile the existing local payment first.';
  }
  if (operation.type === 'edit' && /barber|lane|serving|assigned/i.test(operation.lastError || '')) {
    return 'Reassign the walk-in to an available barber in the online queue, then flag the mismatch for Admin review.';
  }
  if (operation.status === 'conflict' || operation.status === 'permanent_failure') {
    return 'Review the server reason and flag this transaction for Admin review before repeating the action.';
  }
  return 'Keep this transaction on the cashier device; it will replay automatically when online.';
};

export const getCashierOfflineStatusLabel = (status: CashierOutboxOperation['status']): string => ({
  pending: 'Pending sync',
  sending: 'Syncing',
  retryable: 'Retry needed',
  conflict: 'Conflict',
  permanent_failure: 'Failed',
  synced: 'Synced',
})[status];
