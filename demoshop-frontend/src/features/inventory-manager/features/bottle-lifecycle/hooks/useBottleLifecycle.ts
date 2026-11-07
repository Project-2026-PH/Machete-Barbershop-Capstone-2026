import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '@/components/feedback/ToastContext';
import { errorMessage } from '@/features/inventory-manager/shared/utils/formatting';
import { useInventoryRealtime } from '@/features/inventory-manager/shared/hooks/useInventoryRealtime';
import type { PurchaseOrderCatalogItem } from '@/features/inventory-manager/features/purchase-orders/purchase-order.types';
import type { BottleLifecycle, InventoryHandout, InventoryManagerBarber } from '../lifecycle.types';
import {
  loadBottleLifecycleWorkspace,
  recordInventoryHandout,
  returnBottle,
  type BottleReturnPayload,
} from '../lifecycle.service';

export const useBottleLifecycle = () => {
  const { addToast } = useToast();
  const [records, setRecords] = useState<BottleLifecycle[]>([]);
  const [handouts, setHandouts] = useState<InventoryHandout[]>([]);
  const [barbers, setBarbers] = useState<InventoryManagerBarber[]>([]);
  const [catalog, setCatalog] = useState<PurchaseOrderCatalogItem[]>([]);
  const [itemId, setItemId] = useState('');
  const [barberId, setBarberId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [isIssuing, setIsIssuing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [recordsResponse, barberResponse, catalogResponse, handoutResponse] =
        await loadBottleLifecycleWorkspace();
      setRecords(Array.isArray(recordsResponse.data) ? recordsResponse.data : []);
      setBarbers(Array.isArray(barberResponse.data) ? barberResponse.data : []);
      setCatalog(Array.isArray(catalogResponse.data) ? catalogResponse.data : []);
      setHandouts(Array.isArray(handoutResponse.data) ? handoutResponse.data : []);
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Lifecycle records could not be loaded',
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
    channelName: 'inventory-manager-lifecycle-sync',
    tables: ['bottle_lifecycle_logs', 'inventory_handout_logs', 'inventory_stock', 'barbers'],
    windowEvents: ['demoshop:bottle-lifecycle-changed', 'demoshop:inventory-changed'],
    onReload: load,
  });

  const activeRecords = useMemo(
    () => records.filter((record) => record.status === 'issued'),
    [records],
  );

  const consumableCatalog = useMemo(
    () => catalog.filter((item) => String(item.category).toLowerCase() === 'barber_supplies'),
    [catalog],
  );

  const issue = useCallback(async () => {
    if (isIssuing) return;
    const inventoryStockId = Number(itemId);
    const selectedBarberId = Number(barberId);
    if (!Number.isSafeInteger(inventoryStockId) || inventoryStockId <= 0) {
      addToast({
        type: 'error',
        title: 'Select a consumable',
        message: 'Choose an active barbering consumable to hand out.',
      });
      return;
    }
    if (!Number.isSafeInteger(selectedBarberId) || selectedBarberId <= 0) {
      addToast({
        type: 'error',
        title: 'Select a barber',
        message: 'Choose the barber receiving this handout.',
      });
      return;
    }
    const issuedQuantity = Number(quantity);
    if (!Number.isFinite(issuedQuantity) || issuedQuantity <= 0) {
      addToast({ type: 'error', title: 'Enter a valid quantity', message: 'Handout quantity must be greater than zero.' });
      return;
    }
    // Measured units (grams, ml, ...) can be fractional; counted units must be whole.
    const selectedUnit = consumableCatalog.find((item) => Number(item.inventoryStockId) === inventoryStockId)?.unit ?? '';
    const measuredUnits = ['g', 'gram', 'grams', 'kg', 'ml', 'l', 'liter', 'liters', 'litre', 'litres'];
    const isMeasuredUnit = measuredUnits.includes(selectedUnit.trim().toLowerCase());
    if (!isMeasuredUnit && !Number.isInteger(issuedQuantity)) {
      addToast({ type: 'error', title: 'Enter a whole quantity', message: 'Consumable handouts must use a whole number of units.' });
      return;
    }
    setIsIssuing(true);
    try {
      const response = await recordInventoryHandout({ inventoryStockId, barberId: selectedBarberId, quantity: issuedQuantity, notes });
      if (response.data.status === 'issued') setRecords((current) => [response.data as BottleLifecycle, ...current]);
      if (response.data.handout) setHandouts((current) => [response.data.handout, ...current]);
      setItemId('');
      setBarberId('');
      setQuantity('1');
      setNotes('');
      addToast({
        type: 'success',
        title: 'Stock handout recorded',
        message: `${issuedQuantity} ${response.data.unit} of ${response.data.itemName} handed to ${response.data.barberName}.`,
      });
      window.dispatchEvent(new Event('demoshop:bottle-lifecycle-changed'));
      window.dispatchEvent(new Event('demoshop:inventory-changed'));
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Handout could not be recorded',
        message: errorMessage(error, 'Select a consumable and barber, enter the quantity, then try again.'),
      });
    } finally {
      setIsIssuing(false);
    }
  }, [addToast, barberId, consumableCatalog, isIssuing, itemId, notes, quantity]);

  const completeReturn = useCallback(
    async (record: BottleLifecycle, payload: BottleReturnPayload = {}) => {
      try {
        const response = await returnBottle(record.id, payload);
        setRecords((current) => current.map((r) => (r.id === record.id ? response.data : r)));
        addToast({
          type: 'success',
          title: 'Bottle return logged',
          message: `${response.data.customersServed ?? 0} customers served during this issuance.`,
        });
        window.dispatchEvent(new Event('demoshop:bottle-lifecycle-changed'));
        window.dispatchEvent(new Event('demoshop:inventory-changed'));
      } catch (error) {
        addToast({
          type: 'error',
          title: 'Return could not be logged',
          message: errorMessage(error, 'The system could not capture a valid current customer total.'),
        });
      }
    },
    [addToast],
  );

  return {
    records,
    handouts,
    barbers,
    catalog,
    itemId,
    setItemId,
    barberId,
    setBarberId,
    notes,
    setNotes,
    loading,
    isIssuing,
    activeRecords,
    consumableCatalog,
    quantity,
    setQuantity,
    issue,
    completeReturn,
  };
};
