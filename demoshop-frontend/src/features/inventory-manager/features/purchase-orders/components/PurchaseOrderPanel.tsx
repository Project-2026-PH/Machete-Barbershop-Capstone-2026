import React, { useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { usePurchaseOrders } from '../hooks/usePurchaseOrders';
import { PurchaseOrderEditor } from './PurchaseOrderEditor';
import { PurchaseOrderList } from './PurchaseOrderList';
import { PurchaseOrderDetail } from './PurchaseOrderDetail';
import { ReceiptEvidence } from './ReceiptEvidence';
import { Skeleton } from '@/components/ui/Skeleton';
import type { PurchaseOrder } from '../purchase-order.types';
import { PageHeader } from '../../../shared/components/PageHeader';

export interface PurchaseOrderPanelProps {
  activeSubTab?: string;
  selectedPoId?: string;
  onNavigateSubTab?: (subTab: string, detailId?: string) => void;
}

export const PurchaseOrderPanel: React.FC<PurchaseOrderPanelProps> = ({
  activeSubTab,
  selectedPoId,
  onNavigateSubTab,
}) => {
  const {
    orders,
    suppliers,
    catalog,
    receipts,
    activeCatalog,
    filteredOrders,
    editingId,
    notes,
    setNotes,
    lines,
    selectedItem,
    setSelectedItem,
    quantity,
    setQuantity,
    unitCost,
    setUnitCost,
    supplierId,
    setSupplierId,
    statusFilter,
    setStatusFilter,
    receiptId,
    setReceiptId,
    setReceiptFile,
    selectedOrderIds,
    setSelectedOrderIds,
    loading,
    saving,
    busyOrderId,
    resetEditor,
    startEditing,
    addLine,
    editLine,
    editingLineIndex,
    cancelEditLine,
    removeLine,
    saveOrder,
    saveDraft,
    submit,
    fulfill,
    linkReceipt,
    deleteDraft,
  } = usePurchaseOrders();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedItemId = searchParams.get('item');

  // "Create stock request" from a Stock List row passes ?item=<inventoryStockId>.
  // Preselect it once the catalog is available, then drop the param so a later
  // reset does not re-apply it.
  useEffect(() => {
    if (!requestedItemId || loading) return;
    const match = catalog.find((item) => String(item.inventoryStockId) === requestedItemId);
    if (match) setSelectedItem(match.inventoryStockId);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('item');
      return next;
    }, { replace: true });
  }, [catalog, loading, requestedItemId, setSearchParams, setSelectedItem]);

  const handleToggleOrderSelection = (orderId: string) => {
    setSelectedOrderIds((current) =>
      current.includes(orderId) ? current.filter((id) => id !== orderId) : [...current, orderId],
    );
  };

  const handleEdit = (order: PurchaseOrder) => {
    startEditing(order);
    if (onNavigateSubTab) {
      onNavigateSubTab('po-create');
    }
  };

  const isPoStatus = activeSubTab === 'po-status' || activeSubTab === 'orders-by-status';
  const isPoReceipts = activeSubTab === 'po-receipts' || activeSubTab === 'receipts';
  const isPoCreate = activeSubTab === 'po-create' || activeSubTab === 'create' || !activeSubTab;

  const currentOrderDetail = selectedPoId
    ? orders.find(
        (o) =>
          o.poNumber.toLowerCase() === selectedPoId.toLowerCase() ||
          o.id.toLowerCase() === selectedPoId.toLowerCase(),
      )
    : null;

  return (
    <section className="space-y-6">
      {!(isPoStatus && selectedPoId) && (
        <PageHeader
          eyebrow="Stock Requests"
          title={isPoStatus ? 'Order Status' : isPoReceipts ? 'Receipt Evidence' : 'Create Order'}
          description={isPoStatus
            ? 'Track submitted stock requests from Owner/Admin review through delivery and receiving.'
            : isPoReceipts
              ? 'Upload proof of purchase and link one receipt to one or more stock requests.'
              : 'Submit multi-line stock requests directly for Owner/Admin approval, then receive approved orders through the authoritative stock ledger.'}
        />
      )}

      {isPoCreate && (
        <PurchaseOrderEditor
          editingId={editingId}
          activeCatalog={activeCatalog}
          catalog={catalog}
          suppliers={suppliers}
          lines={lines}
          selectedItem={selectedItem}
          quantity={quantity}
          unitCost={unitCost}
          supplierId={supplierId}
          notes={notes}
          saving={saving}
          onReset={resetEditor}
          onSelectedItemChange={setSelectedItem}
          onSupplierChange={setSupplierId}
          onUnitCostChange={setUnitCost}
          onQuantityChange={setQuantity}
          onNotesChange={setNotes}
          onAddLine={addLine}
          onEditLine={editLine}
          editingLineIndex={editingLineIndex}
          onCancelEditLine={cancelEditLine}
          onRemoveLine={removeLine}
          onSave={() => void saveOrder()}
          onSaveDraft={() => void saveOrder()}
        />
      )}

      {isPoStatus && selectedPoId && (
        currentOrderDetail ? (
          <PurchaseOrderDetail
            order={currentOrderDetail}
            onBack={() => onNavigateSubTab?.('po-status')}
            onEdit={handleEdit}
            onSubmit={(order) => void submit(order)}
            onDelete={(order) => void deleteDraft(order)}
            onFulfill={(order) => void fulfill(order)}
            busy={busyOrderId === currentOrderDetail.id}
          />
        ) : loading ? (
          <div className="rounded-xl border border-white/10 bg-charcoal-light p-8 space-y-4">
            <Skeleton className="h-8 w-48 rounded" />
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-48 w-full rounded-xl" />
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 bg-charcoal-light p-8 text-center space-y-4">
            <p className="text-sm text-ivory-dim">
              Stock request <span className="font-mono text-gold">"{selectedPoId}"</span> not found.
            </p>
            <button
              type="button"
              onClick={() => onNavigateSubTab?.('po-status')}
              className="inline-flex items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-4 py-2 text-xs font-bold text-gold hover:bg-gold/20 transition"
            >
              Back to orders list
            </button>
          </div>
        )
      )}

      {isPoStatus && !selectedPoId && (
        <PurchaseOrderList
          orders={filteredOrders}
          statusFilter={statusFilter}
          loading={loading}
          onStatusFilterChange={setStatusFilter}
          onEdit={handleEdit}
          onSubmit={(order) => void submit(order)}
          onDelete={(order) => void deleteDraft(order)}
          onFulfill={(order) => void fulfill(order)}
          onSelectOrder={(order) => onNavigateSubTab?.('po-status', order.poNumber)}
        />
      )}

      {isPoReceipts && (
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <ReceiptEvidence
            receipts={receipts}
            orders={orders}
            receiptId={receiptId}
            selectedOrderIds={selectedOrderIds}
            onReceiptIdChange={setReceiptId}
            onReceiptFileChange={setReceiptFile}
            onToggleOrderSelection={handleToggleOrderSelection}
            onLinkReceipt={() => void linkReceipt()}
          />
        </section>
      )}
    </section>
  );
};

export default PurchaseOrderPanel;
