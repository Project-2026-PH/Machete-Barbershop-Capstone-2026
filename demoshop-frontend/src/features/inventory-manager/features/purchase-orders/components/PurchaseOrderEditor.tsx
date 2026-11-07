import React from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/feedback/Modal';
import { NumberField } from '@/components/ui/NumberField';
import { Field } from '../../../shared/components/Field';
import { SearchableSelect } from '../../../shared/components/SearchableSelect';
import { formatUnit } from '../../../shared/utils/formatting';
import type { InventoryManagerSupplier } from '../../suppliers/supplier.types';
import type { PurchaseOrderCatalogItem, PurchaseOrderLine } from '../purchase-order.types';
import { suggestedRestockQuantity } from '../purchase-order.rules';

interface PurchaseOrderEditorProps {
  editingId: string | null;
  activeCatalog: PurchaseOrderCatalogItem[];
  catalog: PurchaseOrderCatalogItem[];
  suppliers: InventoryManagerSupplier[];
  lines: PurchaseOrderLine[];
  selectedItem: string;
  quantity: string;
  unitCost: string;
  supplierId: string;
  notes: string;
  saving: boolean;
  onReset: () => void;
  onSelectedItemChange: (itemId: string) => void;
  onSupplierChange: (supplierId: string) => void;
  onUnitCostChange: (unitCost: string) => void;
  onQuantityChange: (quantity: string) => void;
  onNotesChange: (notes: string) => void;
  onAddLine: () => void;
  onEditLine: (index: number) => void;
  editingLineIndex: number | null;
  onCancelEditLine: () => void;
  onRemoveLine: (index: number) => void;
  onSave?: () => void;
  onSaveDraft?: () => void;
}

export const PurchaseOrderEditor: React.FC<PurchaseOrderEditorProps> = ({
  editingId,
  activeCatalog,
  catalog,
  suppliers,
  lines,
  selectedItem,
  quantity,
  unitCost,
  supplierId,
  notes,
  saving,
  onReset,
  onSelectedItemChange,
  onSupplierChange,
  onUnitCostChange,
  onQuantityChange,
  onNotesChange,
  onAddLine,
  onEditLine,
  editingLineIndex,
  onCancelEditLine,
  onRemoveLine,
  onSave,
  onSaveDraft,
}) => {
  const editingLine = editingLineIndex == null ? null : lines[editingLineIndex];
  const editingItem = editingLine ? catalog.find((item) => item.inventoryStockId === editingLine.inventoryStockId) : null;
  const handleSave = onSave || onSaveDraft;

  return (
    <section className="rounded-xl border border-gold/20 bg-gold/5 p-5">
    <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
      <div>
        <h3 className="font-bold">
          {editingId ? 'Edit stock request' : 'New Stock Request'}
        </h3>
        <p className="mt-1 text-xs text-ivory-dim">
          The Stock Request Number is generated on save and the request is sent directly to Admin.
        </p>
      </div>
      {editingId && (
        <button className="text-xs text-gold hover:underline" onClick={onReset}>
          Start a new request
        </button>
      )}
    </div>

    <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1.3fr)_minmax(8rem,0.5fr)_minmax(8rem,0.5fr)_auto]">
      <SearchableSelect
        label="Select Inventory item • Current Stock/s"
        value={selectedItem}
        onChange={(itemId) => {
          onSelectedItemChange(itemId);
          const item = catalog.find((candidate) => candidate.inventoryStockId === itemId);
          onSupplierChange(item?.defaultSupplierId || '');
          onUnitCostChange(item ? String(item.costPrice || '') : '');
          onQuantityChange(item ? String(suggestedRestockQuantity(item)) : '1');
        }}
        placeholder="Select item…"
        searchPlaceholder="Search inventory items…"
        emptyMessage="No items currently need restocking"
        options={activeCatalog
          .filter((item) => item.currentStock <= item.criticalThreshold || item.inventoryStockId === selectedItem)
          .map((item) => ({
            value: item.inventoryStockId,
            label: `${item.name} · ${item.currentStock} ${formatUnit(item.currentStock, item.unit)} ${formatUnit(item.currentStock, 'stock')} left`,
          }))}
      />

      <div className="block space-y-1.5 text-xs text-ivory-dim">
        <span>
          Suggested Quantity
        </span>
        <NumberField
          min={1}
          value={quantity}
          onChange={onQuantityChange}
          ariaLabel="Suggested quantity"
          className="min-h-11 w-full"
        />
        <p id="po-quantity-recommendation" className="text-[11px] font-normal text-ivory-dim">
          Suggested restock quantity. Adjust as needed.
        </p>
      </div>

      <div className="flex items-end">
        <Button className="min-h-11 w-full md:w-auto" onClick={onAddLine}>
          <Plus className="mr-2 h-4 w-4" />
          Add item
        </Button>
      </div>
    </div>

    <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <SearchableSelect
        label="Supplier Name"
        value={supplierId}
        onChange={onSupplierChange}
        placeholder="Use item default"
        searchPlaceholder="Search suppliers…"
        emptyMessage="No active suppliers available"
        options={[
          { value: '', label: 'Use item default' },
          ...suppliers
            .filter((supplier) => supplier.isActive)
            .map((supplier) => ({ value: supplier.id, label: supplier.name })),
        ]}
      />

      <Field
        label="Notes"
        value={notes}
        onChange={(event) => onNotesChange(event.target.value)}
        placeholder="Delivery timing, reason, or notes"
      />
    </div>

    {lines.length > 0 && (
      <div className="mt-4 overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="border-b border-white/10 bg-charcoal text-[10px] font-semibold uppercase tracking-wider text-ivory-dim">
            <tr>
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2">Quantity</th>
              <th className="px-3 py-2">Supplier</th>
              <th className="px-3 py-2">Unit cost</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {lines.map((line, index) => (
              <tr key={`${line.inventoryStockId}-${index}`}>
                <td className="px-3 py-3 font-bold">
                  {line.itemName}
                  <span className="ml-1 text-xs font-normal text-ivory-dim">({line.unit})</span>
                </td>
                <td className="px-3 py-3 text-gold">
                  {line.quantityRequested} {formatUnit(line.quantityRequested, line.unit)}
                </td>
                <td className="px-3 py-3 text-xs text-ivory-dim">
                  {line.supplierName || 'Item default'}
                </td>
                <td className="px-3 py-3 text-xs text-ivory-dim">
                  {line.unitCost == null ? '—' : `₱${line.unitCost.toFixed(2)}`}
                </td>
                <td className="px-3 py-3 text-right">
                  <div className="flex justify-end gap-3">
                    <button
                      className="text-red-300 hover:text-red-200"
                      onClick={() => onRemoveLine(index)}
                      aria-label={`Remove ${line.itemName}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <button
                      className="text-gold hover:text-yellow-200"
                      onClick={() => onEditLine(index)}
                      aria-label={`Edit ${line.itemName}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}

    <div className="mt-4 flex justify-end">
      <Button onClick={handleSave} disabled={saving}>
        {saving ? 'Submitting...' : 'Submit Stock Request'}
      </Button>
    </div>

      <Modal
        isOpen={editingLine != null}
        onClose={onCancelEditLine}
        title="Edit purchase-order item"
        size="sm"
        footer={(
          <>
            <Button variant="ghost" onClick={onCancelEditLine}>Cancel</Button>
            <Button onClick={onAddLine}>Save</Button>
          </>
        )}
      >
        <div className="space-y-4">
          <div className="rounded border border-white/10 bg-white/5 px-3 py-2">
            <p className="text-xs text-ivory-dim">Inventory item</p>
            <p className="mt-1 font-bold text-ivory">
              {editingLine?.itemName || editingItem?.name || 'Selected item'}
              <span className="ml-1 text-xs font-normal text-ivory-dim">({editingLine?.unit || editingItem?.unit})</span>
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="block space-y-1.5 text-xs text-ivory-dim">
              <span>Quantity</span>
              <NumberField
                min={1}
                value={quantity}
                onChange={onQuantityChange}
                ariaLabel="Quantity"
                className="w-full"
              />
            </div>
            <div className="block space-y-1.5 text-xs text-ivory-dim">
              <span>Unit cost</span>
              <NumberField
                min={0}
                step={0.01}
                value={unitCost}
                onChange={onUnitCostChange}
                ariaLabel="Unit cost"
                className="w-full"
              />
            </div>
          </div>

          <SearchableSelect
            label="Supplier Name"
            value={supplierId}
            onChange={onSupplierChange}
            placeholder="Use item default"
            searchPlaceholder="Search suppliers…"
            emptyMessage="No active suppliers available"
            options={[
              { value: '', label: 'Use item default' },
              ...suppliers
                .filter((supplier) => supplier.isActive)
                .map((supplier) => ({ value: supplier.id, label: supplier.name })),
            ]}
          />
        </div>
      </Modal>
    </section>
  );
};
