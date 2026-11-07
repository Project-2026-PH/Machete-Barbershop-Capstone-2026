import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { AlertTriangle, Check, ChevronDown, RefreshCw, X } from 'lucide-react';
import { api } from '@/config/api';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/feedback/ToastContext';
import { LogoutModal } from '@/components/common/LogoutModal';
import { Modal } from '@/components/feedback/Modal';
import { useSearchHighlight } from '@/features/admin/hooks/useSearchHighlight';
import { useInventoryRealtime } from '@/features/inventory-manager/shared/hooks/useInventoryRealtime';
import type { PurchaseOrder, PurchaseOrderLine } from '@/features/inventory-manager/inventory-manager.service';

const errorMessage = (error: any, fallback: string) => error?.response?.data?.message || error?.response?.data?.error || fallback;
const formatDate = (value?: string | null) => value ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
const formatTime = (value?: string | null) => value ? new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '—';
const formatExactDate = (value?: string | null) => value ? new Date(value).toLocaleString() : '—';

export const PurchaseOrderReviewPanel: React.FC = () => {
  const { addToast } = useToast();
  const [searchParams] = useSearchParams();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [approvalTarget, setApprovalTarget] = useState<PurchaseOrder | null>(null);
  const [deletedItemsTarget, setDeletedItemsTarget] = useState<{ order: PurchaseOrder; deletedLines: PurchaseOrderLine[] } | null>(null);
  const [isProcessingDeleted, setIsProcessingDeleted] = useState(false);
  const [catalog, setCatalog] = useState<Array<{ inventoryStockId: string; currentStock: number; unit: string }>>([]);

  const searchQuery = (searchParams.get('search') || searchParams.get('q') || '').trim().toLowerCase();
  const highlightId = searchParams.get('highlightId');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [response, catalogResponse] = await Promise.all([
        api.get<PurchaseOrder[]>('/api/inventory/purchase-orders'),
        api.get<Array<{ inventoryStockId: string; currentStock: number; unit: string }>>('/api/inventory/purchase-orders/catalog'),
      ]);
      setOrders(Array.isArray(response.data) ? response.data : []);
      setCatalog(Array.isArray(catalogResponse.data) ? catalogResponse.data : []);
    } catch (error) {
      addToast({ type: 'error', title: 'Stock requests could not be loaded', message: errorMessage(error, 'Please try again.') });
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { void load(); }, [load]);

  useInventoryRealtime({
    channelName: 'admin-po-review-sync',
    tables: ['purchase_orders', 'po_line_items'],
    windowEvents: ['demoshop:purchase-orders-changed'],
    onReload: load,
  });

  const isLineDeleted = useCallback((line: PurchaseOrderLine) => {
    if (line.isDeleted) return true;
    return !catalog.some((item) => item.inventoryStockId === String(line.inventoryStockId));
  }, [catalog]);

  const review = async (order: PurchaseOrder, decision: 'approved' | 'rejected', reason?: string) => {
    if (decision === 'rejected' && !reason && !window.confirm(`Reject stock request ${order.poNumber}? This action will notify the Inventory Manager.`)) return;
    setActionId(order.id);
    try {
      const response = await api.patch<PurchaseOrder>(`/api/inventory/purchase-orders/${order.id}/review`, { decision, reviewNotes: reason });
      setOrders((current) => current.map((item) => item.id === order.id ? response.data : item));
      setRejectingId(null);
      setRejectionReason('');
      window.dispatchEvent(new Event('demoshop:purchase-orders-changed'));
      addToast({ type: 'success', title: decision === 'approved' ? 'Stock request approved' : 'Stock request rejected', message: `${order.poNumber} was updated and the Inventory Manager was notified.` });
    } catch (error) {
      addToast({ type: 'error', title: 'Stock request review failed', message: errorMessage(error, 'Please try again.') });
    } finally {
      setActionId(null);
    }
  };

  const approve = (order: PurchaseOrder) => {
    const deletedLines = order.lines.filter(isLineDeleted);
    if (deletedLines.length > 0) {
      setDeletedItemsTarget({ order, deletedLines });
      return;
    }
    setApprovalTarget(order);
  };

  const handleRestoreAndApprove = async (order: PurchaseOrder) => {
    setIsProcessingDeleted(true);
    try {
      const res = await api.post(`/api/inventory/purchase-orders/${order.id}/restore-deleted-items`);
      addToast({
        type: 'success',
        title: 'Item(s) re-added to inventory',
        message: `${res.data?.restoredCount ?? 1} item(s) restored to the inventory table. Approving request…`,
      });
      await review(order, 'approved');
      setDeletedItemsTarget(null);
      void load();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Failed to re-add items',
        message: errorMessage(err, 'Could not restore deleted items to inventory.'),
      });
    } finally {
      setIsProcessingDeleted(false);
    }
  };

  const handleDisregard = async (order: PurchaseOrder) => {
    setIsProcessingDeleted(true);
    try {
      await review(order, 'rejected', 'Disregarded: item removed from inventory');
      setDeletedItemsTarget(null);
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Failed to disregard request',
        message: errorMessage(err, 'Could not reject request.'),
      });
    } finally {
      setIsProcessingDeleted(false);
    }
  };

  const pending = orders.filter((order) => {
    if (order.status !== 'pending') return false;
    if (!searchQuery) return true;
      return (
      order.poNumber.toLowerCase().includes(searchQuery) ||
      order.id.toLowerCase().includes(searchQuery) ||
      order.lines.some((line) => line.itemName?.toLowerCase().includes(searchQuery))
    );
  });

  // Activate glow highlight and smooth scroll-into-view
  useSearchHighlight(!loading && pending.length > 0);

  // Automatically expand the matching purchase order on deep link
  useEffect(() => {
    if (loading || orders.length === 0) return;
    const matched = orders.find((o) => {
      if (highlightId && (`po-${o.id}` === highlightId || o.id === highlightId || o.poNumber === highlightId || `po-${o.poNumber}` === highlightId)) return true;
      if (searchQuery && (o.poNumber.toLowerCase() === searchQuery || o.id.toLowerCase() === searchQuery)) return true;
      return false;
    });
    if (matched) {
      setExpandedId(matched.id);
    }
  }, [loading, orders, highlightId, searchQuery]);

  return (
    <section className="rounded-xl border border-gold/20 bg-gold/5 p-4 md:p-5">
      <LogoutModal
        isOpen={Boolean(approvalTarget)}
        onClose={() => setApprovalTarget(null)}
        onConfirm={() => {
          if (approvalTarget) void review(approvalTarget, 'approved');
          setApprovalTarget(null);
        }}
        isLoading={Boolean(approvalTarget && actionId === approvalTarget.id)}
        title="Approve stock request?"
        message={approvalTarget ? `Approve stock request ${approvalTarget.poNumber}?` : ''}
        confirmLabel="Approve request"
        loadingLabel="Approving…"
      />

      {/* Confirmation Modal for Deleted Item Edge Case */}
      <Modal
        isOpen={Boolean(deletedItemsTarget)}
        onClose={() => !isProcessingDeleted && setDeletedItemsTarget(null)}
        title="Deleted Item Detected in Stock Request"
        size="md"
        footer={
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 w-full">
            <Button
              variant="ghost"
              onClick={() => setDeletedItemsTarget(null)}
              disabled={isProcessingDeleted}
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              className="border-red-500/40 text-red-400 hover:bg-red-500/10 hover:text-red-300"
              onClick={() => {
                if (deletedItemsTarget) {
                  void handleDisregard(deletedItemsTarget.order);
                }
              }}
              disabled={isProcessingDeleted}
            >
              Disregard Stock Request
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (deletedItemsTarget) {
                  void handleRestoreAndApprove(deletedItemsTarget.order);
                }
              }}
              disabled={isProcessingDeleted}
            >
              {isProcessingDeleted ? 'Re-adding & Approving…' : 'Re-add to Inventory & Approve'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4 py-2 text-sm text-ivory">
          <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-300">
                Item(s) deleted after request submission
              </p>
              <p className="mt-1 text-xs text-ivory-dim">
                The following item(s) in stock request <strong className="text-gold">{deletedItemsTarget?.order.poNumber}</strong> were deleted from the inventory table after submission:
              </p>
              <ul className="mt-2 list-inside list-disc space-y-1 text-xs font-medium text-amber-200">
                {deletedItemsTarget?.deletedLines.map((line) => (
                  <li key={line.id || line.inventoryStockId}>
                    {line.itemName || 'Unnamed item'} ({line.quantityRequested} {line.unit || 'unit'})
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="text-xs text-ivory-dim">
            Please select how you would like to handle this request:
          </p>
          <div className="space-y-2 text-xs">
            <div className="rounded border border-white/10 bg-white/5 p-2.5">
              <strong className="text-gold">Re-add to Inventory:</strong> Restores the deleted item(s) back to the inventory table with active status and approves this stock request.
            </div>
            <div className="rounded border border-white/10 bg-white/5 p-2.5">
              <strong className="text-gold">Disregard Stock Request:</strong> Rejects this request and notifies the Inventory Manager that the item has been removed from inventory.
            </div>
          </div>
        </div>
      </Modal>

      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold">Procurement approval</p>
          <h3 className="mt-1 text-lg font-bold">Stock requests awaiting review</h3>
          <p className="mt-1 text-xs text-ivory-dim">Approve or reject submitted POs here. Approval does not change stock; receiving is recorded separately by inventory operations.</p>
        </div>
        <Button variant="outline" onClick={() => void load()}>
          <RefreshCw className="mr-2 h-4 w-4" />Refresh
        </Button>
      </div>

      {loading ? (
        <div className="mt-5 space-y-3" aria-label="Loading stock requests">
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-20 w-full rounded-lg" />
        </div>
      ) : pending.length === 0 ? (
        <div className="mt-5 flex min-h-[180px] items-center justify-center rounded border border-white/10 bg-charcoal-light p-4 text-center text-sm text-ivory-dim">
          {searchQuery ? `No stock requests match "${searchQuery}".` : 'No stock requests are awaiting approval.'}
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {pending.map((order) => (
            <article key={order.id} data-search-id={`po-${order.id} po-${order.poNumber} ${order.id} ${order.poNumber}`} className="rounded-lg border border-white/10 bg-charcoal-light p-4">
              <div className="grid gap-3 border-b border-white/10 pb-4 sm:grid-cols-4">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-ivory-dim">Request ID</p>
                  <p className="mt-1 font-bold text-gold">{order.poNumber}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-ivory-dim">Requested by</p>
                  <p className="mt-1 text-sm">{order.createdByName || 'Inventory Manager'}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-ivory-dim">Requested</p>
                  <p className="mt-1 text-sm">{formatDate(order.submittedAt)}</p>
                  <p className="text-xs text-ivory-dim">{formatTime(order.submittedAt)} · {order.lines.length} item{order.lines.length === 1 ? '' : 's'}</p>
                </div>
                <div className="flex items-start justify-between gap-3 sm:justify-end">
                  <span className="mt-1 inline-flex rounded-full border border-gold/40 bg-gold/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-gold">Pending approval</span>
                  <button type="button" aria-label={`${expandedId === order.id ? 'Hide' : 'View'} details for ${order.poNumber}`} aria-expanded={expandedId === order.id} className="text-ivory-dim hover:text-gold" onClick={() => setExpandedId(expandedId === order.id ? null : order.id)}>
                    <ChevronDown className={`h-4 w-4 transition-transform ${expandedId === order.id ? 'rotate-180' : ''}`} />
                  </button>
                </div>
              </div>
              {expandedId === order.id && (
                <div className="mt-4 space-y-4">
                  <div className="rounded border border-white/10 bg-charcoal p-3 text-xs">
                    <p className="font-bold text-gold">Request context</p>
                    <p className="mt-1 text-ivory-dim">{order.notes || 'No justification provided.'}</p>
                    <p className="mt-2 text-ivory-dim">Exact submission time: <span className="text-ivory">{formatExactDate(order.submittedAt)}</span></p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[680px] text-left text-xs">
                      <thead className="border-b border-white/10 text-[10px] uppercase tracking-wider text-ivory-dim">
                        <tr>
                          <th className="py-2 pr-3">Item</th>
                          <th className="py-2 pr-3">Available stock</th>
                          <th className="py-2 pr-3">Quantity</th>
                          <th className="py-2 pr-3">Supplier</th>
                          <th className="py-2">Unit cost</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {order.lines.map((line) => {
                          const stock = catalog.find((item) => item.inventoryStockId === String(line.inventoryStockId));
                          const lineIsDeleted = isLineDeleted(line);
                          return (
                            <tr key={line.id || line.inventoryStockId}>
                              <td className="py-2 pr-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span>{line.itemName} ({line.unit || stock?.unit || 'unit'})</span>
                                  {lineIsDeleted && (
                                    <span className="inline-flex items-center rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">
                                      Deleted from inventory
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-2 pr-3 text-ivory">
                                {lineIsDeleted ? (
                                  <span className="text-amber-400/80 italic">Item removed</span>
                                ) : (
                                  stock ? `${stock.currentStock} ${stock.unit}` : 'Not available'
                                )}
                              </td>
                              <td className="py-2 pr-3 text-ivory">{line.quantityRequested}</td>
                              <td className="py-2 pr-3 text-ivory-dim">{line.supplierName || 'Not provided'}</td>
                              <td className="py-2 text-ivory-dim">{line.unitCost == null ? 'Not provided' : `₱${line.unitCost.toFixed(2)}`}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => approve(order)} disabled={actionId === order.id}>
                      <Check className="mr-2 h-4 w-4" />{actionId === order.id ? 'Updating…' : 'Approve'}
                    </Button>
                    <Button variant="outline" onClick={() => { setRejectingId(order.id); setRejectionReason(''); }} disabled={actionId === order.id}>
                      <X className="mr-2 h-4 w-4" />Reject
                    </Button>
                  </div>
                  {rejectingId === order.id && (
                    <div className="rounded border border-red-400/25 bg-red-400/5 p-3">
                      <label className="block text-xs text-ivory-dim">
                        <span>Rejection reason (at least 10 characters)</span>
                        <textarea rows={3} value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} className="mt-1.5 w-full rounded border border-white/10 bg-charcoal px-3 py-2 text-sm text-ivory outline-none focus:border-gold/60" />
                      </label>
                      <div className="mt-2 flex justify-end">
                        <Button variant="outline" disabled={rejectionReason.trim().length < 10 || actionId === order.id} onClick={() => void review(order, 'rejected', rejectionReason.trim())}>Confirm rejection</Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
};

export default PurchaseOrderReviewPanel;
