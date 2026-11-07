import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '@/components/feedback/ToastContext';
import { errorMessage, todayInManila } from '@/features/inventory-manager/shared/utils/formatting';
import { useInventoryRealtime } from '@/features/inventory-manager/shared/hooks/useInventoryRealtime';
import type { InventoryManagerSupplier } from '@/features/inventory-manager/features/suppliers/supplier.types';
import type {
  PurchaseOrder,
  PurchaseOrderCatalogItem,
  PurchaseOrderLine,
} from '../purchase-order.types';
import {
  createPurchaseOrder,
  deletePurchaseOrder,
  fulfillPurchaseOrder,
  linkInventoryReceipt,
  loadPurchaseOrderWorkspace,
  submitPurchaseOrder,
  updatePurchaseOrder,
  uploadInventoryReceipt,
} from '../purchase-order.service';
import { getItemsNeedingRestock, suggestedRestockQuantity } from '../purchase-order.rules';

export const usePurchaseOrders = () => {
  const { addToast } = useToast();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<InventoryManagerSupplier[]>([]);
  const [catalog, setCatalog] = useState<PurchaseOrderCatalogItem[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<PurchaseOrderLine[]>([]);
  const [selectedItem, setSelectedItem] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitCost, setUnitCost] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [editingLineIndex, setEditingLineIndex] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [receiptId, setReceiptId] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const saveInFlightRef = useRef(false);
  const hasLoadedRef = useRef(false);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const busyOrderRef = useRef<string | null>(null);

  // Background refreshes (realtime, notifications, tab focus) keep the current
  // rows on screen instead of flashing the skeleton.
  const load = useCallback(async () => {
    if (!hasLoadedRef.current) setLoading(true);
    try {
      const [orderResponse, supplierResponse, catalogResponse, receiptResponse] =
        await loadPurchaseOrderWorkspace();
      setOrders(Array.isArray(orderResponse.data) ? orderResponse.data : []);
      setSuppliers(Array.isArray(supplierResponse.data) ? supplierResponse.data : []);
      setCatalog(Array.isArray(catalogResponse.data) ? catalogResponse.data : []);
      setReceipts(Array.isArray(receiptResponse.data) ? receiptResponse.data : []);
      hasLoadedRef.current = true;
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Stock requests could not be loaded',
        message: errorMessage(error, 'Please try again.'),
      });
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    void load();
  }, [load]);

  useInventoryRealtime({
    channelName: 'inventory-manager-po-sync',
    tables: [
      'purchase_orders',
      'po_line_items',
      'receipts',
      'suppliers',
      'inventory_stock',
      'inventory_stock_movements',
    ],
    windowEvents: [
      'demoshop:purchase-orders-changed',
      'demoshop:inventory-changed',
      'demoshop:suppliers-changed',
      'demoshop:notification-received',
    ],
    refetchOnFocus: true,
    onReload: load,
  });

  const activeCatalog = useMemo(
    () => catalog.filter(
      (item) => !lines.some((line) => line.inventoryStockId === item.inventoryStockId)
        || item.inventoryStockId === selectedItem,
    ),
    [catalog, lines, selectedItem],
  );

  const filteredOrders = useMemo(
    () => (statusFilter === 'all' ? orders : orders.filter((order) => order.status === statusFilter)),
    [orders, statusFilter],
  );

  const needsRestocking = useMemo(() => getItemsNeedingRestock(catalog), [catalog]);

  const resetEditor = useCallback(() => {
    setEditingId(null);
    setNotes('');
    setLines([]);
    setSelectedItem('');
    setQuantity('1');
    setUnitCost('');
    setSupplierId('');
    setEditingLineIndex(null);
  }, []);

  const startEditing = useCallback((order: PurchaseOrder) => {
    setEditingId(order.id);
    setNotes(order.notes || '');
    setLines(
      order.lines.map((line) => ({
        ...line,
        inventoryStockId: String(line.inventoryStockId),
      })),
    );
    setEditingLineIndex(null);
  }, []);

  const editLine = useCallback((index: number) => {
    const line = lines[index];
    if (!line) return;
    setEditingLineIndex(index);
    setSelectedItem(line.inventoryStockId);
    setQuantity(String(line.quantityRequested));
    setUnitCost(line.unitCost == null ? '' : String(line.unitCost));
    setSupplierId(line.supplierId || '');
  }, [lines]);

  const cancelEditLine = useCallback(() => {
    setEditingLineIndex(null);
    setSelectedItem('');
    setQuantity('1');
    setUnitCost('');
    setSupplierId('');
  }, []);

  const addLine = useCallback(() => {
    const item = catalog.find((candidate) => candidate.inventoryStockId === selectedItem);
    const parsedQuantity = Number(quantity);
    if (!item || !Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      addToast({
        type: 'error',
        title: 'Line item incomplete',
        message: 'Select an item and enter a quantity greater than zero.',
      });
      return;
    }
    const resolvedSupplierId = supplierId || item.defaultSupplierId;
    const resolvedSupplierName =
      suppliers.find((supplier) => supplier.id === resolvedSupplierId)?.name || item.defaultSupplierName;

    const nextLine = {
        inventoryStockId: item.inventoryStockId,
        itemName: item.name,
        unit: item.unit,
        quantityRequested: parsedQuantity,
        unitCost: unitCost.trim() ? Number(unitCost) : null,
        supplierId: resolvedSupplierId,
        supplierName: resolvedSupplierName,
    };
    setLines((current) => editingLineIndex == null
      ? [...current, nextLine]
      : current.map((line, index) => (index === editingLineIndex ? nextLine : line)));
    setEditingLineIndex(null);
    setSelectedItem('');
    setQuantity('1');
    setUnitCost('');
    setSupplierId('');
  }, [addToast, catalog, editingLineIndex, quantity, selectedItem, supplierId, suppliers, unitCost]);

  const removeLine = useCallback((index: number) => {
    setLines((current) => current.filter((_, currentIndex) => currentIndex !== index));
    setEditingLineIndex((current) => {
      if (current == null) return null;
      if (current === index) return null;
      return current > index ? current - 1 : current;
    });
  }, []);

  const addNeedsRestockingToDraft = useCallback(
    (item: PurchaseOrderCatalogItem) => {
      if (lines.some((line) => line.inventoryStockId === item.inventoryStockId)) {
        addToast({
          type: 'info',
          title: 'Already in this draft',
          message: `${item.name} is already a line item on the current draft.`,
        });
        return;
      }
      setLines((current) => [
        ...current,
        {
          inventoryStockId: item.inventoryStockId,
          itemName: item.name,
          unit: item.unit,
          quantityRequested: suggestedRestockQuantity(item),
          unitCost: item.costPrice || null,
          supplierId: item.defaultSupplierId,
          supplierName: item.defaultSupplierName,
        },
      ]);
      addToast({
        type: 'success',
        title: 'Added to draft',
        message: `${item.name} was added to the current purchase-order draft.`,
      });
    },
    [addToast, lines],
  );

  const saveOrder = useCallback(async () => {
    // Guard synchronously as well as through the button's `saving` state. React
    // may not have re-rendered yet when a user clicks Save twice quickly.
    if (saveInFlightRef.current) return;
    if (lines.length === 0) {
      addToast({
        type: 'error',
        title: 'Add at least one line',
        message: 'A stock request needs an inventory item before it can be saved.',
      });
      return;
    }
    saveInFlightRef.current = true;
    setSaving(true);
    try {
      const response = editingId
        ? await updatePurchaseOrder(editingId, notes, lines, 'pending')
        : await createPurchaseOrder(notes, lines, 'pending');
      let finalOrder = response.data;
      if (finalOrder.status !== 'pending') {
        const submitResponse = await submitPurchaseOrder(finalOrder.id);
        finalOrder = submitResponse.data;
      }
      setOrders((current) =>
        editingId
          ? current.map((order) => (order.id === editingId ? finalOrder : order))
          : [finalOrder, ...current],
      );
      resetEditor();
      addToast({
        type: 'success',
        title: 'Stock request submitted',
        message: `${finalOrder.poNumber} was sent directly to admin for approval.`,
      });
      window.dispatchEvent(new Event('demoshop:purchase-orders-changed'));
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Stock request could not be saved',
        message: errorMessage(error, 'Check the line items and try again.'),
      });
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  }, [addToast, editingId, lines, notes, resetEditor]);

  const deleteDraft = useCallback(async (order: PurchaseOrder) => {
    if (order.status !== 'draft' || !window.confirm(`Delete draft ${order.poNumber}?`)) return;
    try {
      await deletePurchaseOrder(order.id);
      setOrders((current) => current.filter((item) => item.id !== order.id));
      if (editingId === order.id) resetEditor();
      addToast({ type: 'success', title: 'Draft deleted', message: `${order.poNumber} was deleted.` });
      window.dispatchEvent(new Event('demoshop:purchase-orders-changed'));
    } catch (error) {
      addToast({ type: 'error', title: 'Draft could not be deleted', message: errorMessage(error, 'Please try again.') });
    }
  }, [addToast, editingId, resetEditor]);

  const submit = useCallback(
    async (order: PurchaseOrder) => {
      if (busyOrderRef.current) return;
      busyOrderRef.current = order.id;
      setBusyOrderId(order.id);
      try {
        const response = await submitPurchaseOrder(order.id);
        setOrders((current) => current.map((item) => (item.id === order.id ? response.data : item)));
        if (editingId === order.id) resetEditor();
        addToast({
          type: 'success',
          title: 'Stock request submitted',
          message: `${order.poNumber} is waiting for Owner/Admin approval.`,
        });
        window.dispatchEvent(new Event('demoshop:purchase-orders-changed'));
      } catch (error) {
        addToast({
          type: 'error',
          title: 'Stock request could not be submitted',
          message: errorMessage(error, 'Please try again.'),
        });
      } finally {
        busyOrderRef.current = null;
        setBusyOrderId(null);
      }
    },
    [addToast, editingId, resetEditor],
  );

  const fulfill = useCallback(
    async (order: PurchaseOrder) => {
      if (busyOrderRef.current) return;
      busyOrderRef.current = order.id;
      setBusyOrderId(order.id);
      try {
        let selectedReceiptId = receiptId || order.receiptId || null;
        if (receiptFile) {
          const upload = await uploadInventoryReceipt({
            file: receiptFile,
            purchaseDate: todayInManila(),
          });
          selectedReceiptId = upload.data.id;
          setReceipts((current) => [upload.data, ...current]);
          setReceiptId(upload.data.id);
          setReceiptFile(null);
        }
        const response = await fulfillPurchaseOrder(order.id, selectedReceiptId);
        setOrders((current) => current.map((item) => (item.id === order.id ? response.data : item)));
        addToast({
          type: 'success',
          title: 'Stock request fulfilled',
          message: `${order.poNumber} was received and stock movements were recorded.`,
        });
        window.dispatchEvent(new Event('demoshop:purchase-orders-changed'));
        window.dispatchEvent(new Event('demoshop:inventory-changed'));
      } catch (error) {
        addToast({
          type: 'error',
          title: 'Stock request could not be fulfilled',
          message: errorMessage(error, 'Upload a valid receipt or try again.'),
        });
      } finally {
        busyOrderRef.current = null;
        setBusyOrderId(null);
      }
    },
    [addToast, receiptFile, receiptId],
  );

  const linkReceipt = useCallback(async () => {
    if (!receiptId || selectedOrderIds.length === 0) return;
    try {
      const response = await linkInventoryReceipt(receiptId, selectedOrderIds);
      setOrders((current) =>
        current.map(
          (order) => response.data.find((updated: PurchaseOrder) => updated.id === order.id) || order,
        ),
      );
      setSelectedOrderIds([]);
      addToast({
        type: 'success',
        title: 'Receipt linked',
        message: 'The same receipt is now linked to the selected stock requests.',
      });
      window.dispatchEvent(new Event('demoshop:purchase-orders-changed'));
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Receipt could not be linked',
        message: errorMessage(error, 'Please select valid stock requests.'),
      });
    }
  }, [addToast, receiptId, selectedOrderIds]);

  return {
    orders,
    suppliers,
    catalog,
    receipts,
    activeCatalog,
    filteredOrders,
    needsRestocking,
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
    receiptFile,
    setReceiptFile,
    selectedOrderIds,
    setSelectedOrderIds,
    loading,
    saving,
    busyOrderId,
    load,
    resetEditor,
    startEditing,
    addLine,
    editLine,
    editingLineIndex,
    cancelEditLine,
    removeLine,
    addNeedsRestockingToDraft,
    saveOrder,
    saveDraft: saveOrder,
    deleteDraft,
    submit,
    fulfill,
    linkReceipt,
  };
};
