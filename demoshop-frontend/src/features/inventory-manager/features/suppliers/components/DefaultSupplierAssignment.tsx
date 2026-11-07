import React from 'react';
import { Button } from '@/components/ui/Button';
import { SelectField } from '../../../shared/components/SelectField';
import type { InventoryManagerSupplier } from '../supplier.types';
import type { PurchaseOrderCatalogItem } from '../../purchase-orders/purchase-order.types';

interface DefaultSupplierAssignmentProps {
  catalog: PurchaseOrderCatalogItem[];
  suppliers: InventoryManagerSupplier[];
  defaultItemId: string;
  defaultSupplierId: string;
  onItemChange: (itemId: string) => void;
  onSupplierChange: (supplierId: string) => void;
  onAssign: () => void;
}

export const DefaultSupplierAssignment: React.FC<DefaultSupplierAssignmentProps> = ({
  catalog,
  suppliers,
  defaultItemId,
  defaultSupplierId,
  onItemChange,
  onSupplierChange,
  onAssign,
}) => (
  <section className="rounded-xl border border-white/10 bg-charcoal-light p-5">
    <h3 className="font-bold">Default item assignments</h3>
    <p className="mt-1 text-xs text-ivory-dim">Defaults can be overridden on an individual PO line.</p>
    <div className="mt-4 space-y-3">
      <SelectField
        label="Inventory item"
        value={defaultItemId}
        onChange={(e) => onItemChange(e.target.value)}
      >
        <option value="">Select an item…</option>
        {catalog.map((item) => (
          <option key={item.inventoryStockId} value={item.inventoryStockId}>
            {item.name} ({item.unit})
          </option>
        ))}
      </SelectField>

      <SelectField
        label="Default supplier"
        value={defaultSupplierId}
        onChange={(e) => onSupplierChange(e.target.value)}
      >
        <option value="">No default supplier</option>
        {suppliers
          .filter((supplier) => supplier.isActive)
          .map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
      </SelectField>

      <Button
        variant="outline"
        className="w-full"
        disabled={!defaultItemId}
        onClick={onAssign}
      >
        Save item assignment
      </Button>
    </div>
  </section>
);
