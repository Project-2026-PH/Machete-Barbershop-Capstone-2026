import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { Modal } from '@/components/feedback/Modal';
import {
  getCashierOfflineNextAction,
  getCashierOfflineStatusLabel,
  buildCashierOfflineWorklist,
  type CashierOfflineWorklistItem,
} from '../services/cashier-offline-worklist';
import { getCashierConnectivityStatus } from '../services/cashier-connectivity';

interface CashierOfflineWorklistModalProps {
  isOpen: boolean;
  onClose: () => void;
  branchId: number;
  cashierId: string;
}

const currency = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });

const operationLabel = (type: CashierOfflineWorklistItem['operation']['type']): string => ({
  create: 'Walk-in creation',
  edit: 'Walk-in edit or service start',
  assign_barber: 'Barber assignment',
  change_service: 'Service change',
  capture_cash: 'Cash payment and receipt',
  complete: 'Service completion',
  cancel: 'Walk-in cancellation',
  print_metadata: 'Receipt print history',
})[type];

export const CashierOfflineWorklistModal: React.FC<CashierOfflineWorklistModalProps> = ({
  isOpen,
  onClose,
  branchId,
  cashierId,
}) => {
  const [items, setItems] = useState<CashierOfflineWorklistItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryingOperationId, setRetryingOperationId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!Number.isInteger(branchId) || branchId < 1 || !cashierId) {
      setItems([]);
      return;
    }
    setIsLoading(true);
    setLoadError(null);
    try {
      const repository = await import('../services/cashier-offline.repository');
      const [transactions, operations] = await Promise.all([
        repository.listLocalWalkIns(`${branchId}:${cashierId}`),
        repository.listCashierOutboxJournal(branchId, cashierId),
      ]);
      setItems(buildCashierOfflineWorklist(transactions, operations));
    } catch (error) {
      setItems([]);
      setLoadError(error instanceof Error ? error.message : 'Offline work could not be loaded.');
    } finally {
      setIsLoading(false);
    }
  }, [branchId, cashierId]);

  useEffect(() => {
    if (!isOpen) return;
    void refresh();
    const refreshFromWindow = () => { void refresh(); };
    window.addEventListener('cashier-offline-outbox-changed', refreshFromWindow);
    window.addEventListener('cashier-offline-record-synced', refreshFromWindow);
    window.addEventListener('cashier-offline-record-retryable', refreshFromWindow);
    window.addEventListener('cashier-offline-record-conflict', refreshFromWindow);

    let channel: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') channel = new BroadcastChannel('demoshop-cashier-offline-outbox');
    } catch {}
    channel?.addEventListener('message', refreshFromWindow);
    return () => {
      window.removeEventListener('cashier-offline-outbox-changed', refreshFromWindow);
      window.removeEventListener('cashier-offline-record-synced', refreshFromWindow);
      window.removeEventListener('cashier-offline-record-retryable', refreshFromWindow);
      window.removeEventListener('cashier-offline-record-conflict', refreshFromWindow);
      channel?.close();
    };
  }, [isOpen, refresh]);

  const retryOperation = async (item: CashierOfflineWorklistItem) => {
    setRetryingOperationId(item.operation.operationId);
    try {
      const repository = await import('../services/cashier-offline.repository');
      const retried = await repository.retryCashierOutboxOperation(
        item.operation.operationId,
        branchId,
        cashierId,
      );
      if (retried) {
        window.dispatchEvent(new Event('cashier-offline-sync-requested'));
        await refresh();
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Retry could not be queued.');
    } finally {
      setRetryingOperationId(null);
    }
  };

  const isOnline = getCashierConnectivityStatus() === 'online';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Offline cashier work"
      size="2xl"
      bodyClassName="max-h-[72vh] overflow-y-auto"
    >
      <p className="mb-4 text-sm text-ivory-dim">
        This list is saved on this cashier device and scoped to your signed-in branch and account.
        A payment conflict must be reconciled before any new cash is collected.
      </p>

      {loadError && (
        <div role="alert" className="mb-4 rounded border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">
          {loadError}
        </div>
      )}

      {isLoading && items.length === 0 ? (
        <div className="flex items-center gap-2 py-8 text-sm text-ivory-dim">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading saved cashier work…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded border border-white/10 bg-white/[0.03] p-6 text-center text-sm text-ivory-dim">
          No unsynced cashier work for this account.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const { transaction, operation } = item;
            const localTotal = transaction.serviceSnapshot.reduce((total, service) => total + service.price, 0);
            const operationAmount = Number((operation.payload as { payment?: { amount?: number } } | null)?.payment?.amount);
            const amount = Number.isFinite(operationAmount) && operationAmount > 0 ? operationAmount : localTotal;
            const hasConflict = operation.status === 'conflict' || operation.status === 'permanent_failure';
            return (
              <article key={operation.operationId} className="rounded border border-white/10 bg-charcoal-light/40 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-ivory">{transaction.customerName}</h3>
                    <p className="mt-1 text-xs text-ivory-dim">
                      {operationLabel(operation.type)} · {new Date(operation.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <span className={`rounded px-2 py-1 text-[11px] font-semibold ${
                    hasConflict
                      ? 'bg-red-400/10 text-red-200'
                      : operation.status === 'retryable'
                        ? 'bg-amber-400/10 text-amber-200'
                        : 'bg-white/10 text-ivory-dim'
                  }`}>
                    {getCashierOfflineStatusLabel(operation.status)}
                  </span>
                </div>

                <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                  <div>
                    <dt className="text-ivory-dim">Barber</dt>
                    <dd className="text-ivory">{transaction.barberName || 'Not assigned'}</dd>
                  </div>
                  <div>
                    <dt className="text-ivory-dim">Local total</dt>
                    <dd className="text-ivory">{currency.format(amount)}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-ivory-dim">Services</dt>
                    <dd className="text-ivory">
                      {transaction.serviceSnapshot.map((service) => service.name).join(', ') || 'No service details'}
                    </dd>
                  </div>
                </dl>

                {hasConflict && (
                  <div className="mt-3 flex items-start gap-2 rounded border border-red-300/20 bg-red-300/[0.06] p-3 text-xs text-red-100">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <div className="font-semibold">Server reason</div>
                      <p className="mt-1">{operation.lastError || 'The server rejected this operation.'}</p>
                    </div>
                  </div>
                )}

                <div className="mt-3 text-xs text-ivory-dim">
                  <span className="font-semibold text-ivory">Next action: </span>
                  {getCashierOfflineNextAction(item)}
                </div>

                {operation.status === 'retryable' && (
                  <button
                    type="button"
                    onClick={() => void retryOperation(item)}
                    disabled={!isOnline || retryingOperationId === operation.operationId}
                    className="mt-3 inline-flex items-center gap-2 rounded bg-gold px-3 py-2 text-xs font-semibold text-charcoal hover:bg-gold-dim disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {retryingOperationId === operation.operationId
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <RefreshCw className="h-3.5 w-3.5" />}
                    Retry saved operation
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}
    </Modal>
  );
};
