import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/feedback/ToastContext';
import { errorMessage } from '@/features/inventory-manager/shared/utils/formatting';
import { useInventoryRealtime } from '@/features/inventory-manager/shared/hooks/useInventoryRealtime';
import {
  assignInventoryDefaultSupplier,
  createInventoryManagerSupplier,
  deactivateInventoryManagerSupplier,
  listInventoryManagerSuppliers,
  updateInventoryManagerSupplier,
} from '../supplier.service';
import type { InventoryManagerSupplier } from '../supplier.types';
import { listPurchaseOrderCatalog } from '@/features/inventory-manager/features/purchase-orders/purchase-order.service';
import type { PurchaseOrderCatalogItem } from '@/features/inventory-manager/features/purchase-orders/purchase-order.types';

const INITIAL_FORM = {
  name: '',
  contactPerson: '',
  contactNumber: '',
  email: '',
  address: '',
  notes: '',
};

export const useSuppliers = () => {
  const { addToast } = useToast();
  const [suppliers, setSuppliers] = useState<InventoryManagerSupplier[]>([]);
  const [catalog, setCatalog] = useState<PurchaseOrderCatalogItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [defaultItemId, setDefaultItemId] = useState('');
  const [defaultSupplierId, setDefaultSupplierId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [supplierResponse, catalogResponse] = await Promise.all([
        listInventoryManagerSuppliers(),
        listPurchaseOrderCatalog(),
      ]);
      setSuppliers(Array.isArray(supplierResponse.data) ? supplierResponse.data : []);
      setCatalog(Array.isArray(catalogResponse.data) ? catalogResponse.data : []);
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Suppliers could not be loaded',
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
    channelName: 'inventory-manager-suppliers-sync',
    tables: ['suppliers', 'inventory_stock', 'inventory_products'],
    windowEvents: ['demoshop:suppliers-changed', 'demoshop:inventory-changed'],
    onReload: load,
  });

  const reset = useCallback(() => {
    setEditingId(null);
    setForm(INITIAL_FORM);
  }, []);

  const handleEdit = useCallback((supplier: InventoryManagerSupplier) => {
    setEditingId(supplier.id);
    setForm({
      name: supplier.name,
      contactPerson: supplier.contactPerson,
      contactNumber: supplier.contactNumber,
      email: supplier.email,
      address: supplier.address,
      notes: supplier.notes,
    });
  }, []);

  const save = useCallback(async () => {
    if (!form.name.trim()) {
      addToast({
        type: 'error',
        title: 'Supplier name required',
        message: 'Enter a supplier name before saving.',
      });
      return;
    }
    setSaving(true);
    try {
      const response = editingId
        ? await updateInventoryManagerSupplier(editingId, form)
        : await createInventoryManagerSupplier(form);
      setSuppliers((current) =>
        editingId
          ? current.map((supplier) => (supplier.id === editingId ? response.data : supplier))
          : [response.data, ...current],
      );
      addToast({
        type: 'success',
        title: editingId ? 'Supplier updated' : 'Supplier added',
        message: `${response.data.name} is ready for stock requests.`,
      });
      window.dispatchEvent(new Event('demoshop:suppliers-changed'));
      reset();
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Supplier could not be saved',
        message: errorMessage(error, 'Please check the supplier details.'),
      });
    } finally {
      setSaving(false);
    }
  }, [addToast, editingId, form, reset]);

  const deactivate = useCallback(async (supplier: InventoryManagerSupplier) => {
    if (!window.confirm(`Deactivate ${supplier.name}? Existing stock requests will retain their snapshot.`)) return;
    try {
      await deactivateInventoryManagerSupplier(supplier.id);
      setSuppliers((current) =>
        current.map((item) => (item.id === supplier.id ? { ...item, isActive: false } : item)),
      );
      addToast({
        type: 'success',
        title: 'Supplier deactivated',
        message: `${supplier.name} will no longer be offered on new lines.`,
      });
      window.dispatchEvent(new Event('demoshop:suppliers-changed'));
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Supplier could not be deactivated',
        message: errorMessage(error, 'Please try again.'),
      });
    }
  }, [addToast]);

  const assignDefault = useCallback(async () => {
    if (!defaultItemId) return;
    try {
      await assignInventoryDefaultSupplier(defaultItemId, defaultSupplierId || null);
      const selectedSupplier = suppliers.find((supplier) => supplier.id === defaultSupplierId);
      setCatalog((current) =>
        current.map((item) =>
          item.inventoryStockId === defaultItemId
            ? {
                ...item,
                defaultSupplierId: defaultSupplierId || null,
                defaultSupplierName: selectedSupplier?.name || null,
              }
            : item,
        ),
      );
      addToast({
        type: 'success',
        title: 'Default supplier updated',
        message: selectedSupplier
          ? `${selectedSupplier.name} will pre-fill this item.`
          : 'The default supplier was cleared.',
      });
      window.dispatchEvent(new Event('demoshop:suppliers-changed'));
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Default supplier could not be updated',
        message: errorMessage(error, 'Please try again.'),
      });
    }
  }, [addToast, defaultItemId, defaultSupplierId, suppliers]);

  return {
    suppliers,
    catalog,
    editingId,
    form,
    setForm,
    defaultItemId,
    setDefaultItemId,
    defaultSupplierId,
    setDefaultSupplierId,
    loading,
    saving,
    load,
    reset,
    handleEdit,
    save,
    deactivate,
    assignDefault,
  };
};
