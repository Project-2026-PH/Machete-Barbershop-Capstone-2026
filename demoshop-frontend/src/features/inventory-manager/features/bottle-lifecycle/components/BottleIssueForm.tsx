import React from 'react';
import { Loader2, PackagePlus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field } from '../../../shared/components/Field';
import { SearchableSelect } from '../../../shared/components/SearchableSelect';
import type { PurchaseOrderCatalogItem } from '../../purchase-orders/purchase-order.types';
import type { InventoryManagerBarber } from '../lifecycle.types';

interface BottleIssueFormProps {
  consumableCatalog: PurchaseOrderCatalogItem[];
  barbers: InventoryManagerBarber[];
  itemId: string;
  barberId: string;
  quantity: string;
  notes: string;
  isIssuing?: boolean;
  onItemIdChange: (id: string) => void;
  onBarberIdChange: (id: string) => void;
  onQuantityChange: (quantity: string) => void;
  onNotesChange: (notes: string) => void;
  onIssue: () => void;
}

export const BottleIssueForm: React.FC<BottleIssueFormProps> = ({
  consumableCatalog,
  barbers,
  itemId,
  barberId,
  quantity,
  notes,
  isIssuing = false,
  onItemIdChange,
  onBarberIdChange,
  onQuantityChange,
  onNotesChange,
  onIssue,
}) => (
  <section className="rounded-xl border border-gold/20 bg-gold/5 p-5">
    <h3 className="font-bold">Record stock handout</h3>
    <p className="mt-1 text-xs text-ivory-dim">
      Record the item, quantity, barber, and staff member handing it out. Bottles are treated as
      empty when returned; no remaining-percentage estimate is needed.
    </p>

    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.65fr)_minmax(0,1fr)_auto]">
      <SearchableSelect
        label="Consumable"
        value={itemId}
        onChange={onItemIdChange}
        placeholder="Select an item to hand out"
        searchPlaceholder="Search consumables…"
        emptyMessage="No barbering consumables available"
        options={consumableCatalog.map((item) => ({
          value: String(item.inventoryStockId),
          label: `${item.name} (${item.unit})`,
        }))}
      />

      <Field
        label="Quantity"
        type="number"
        min="1"
        step="1"
        value={quantity}
        onChange={(event) => onQuantityChange(event.target.value)}
      />

      <SearchableSelect
        label="Barber"
        value={barberId}
        onChange={onBarberIdChange}
        placeholder="Select barber…"
        searchPlaceholder="Search barbers…"
        emptyMessage="No barbers available"
        options={barbers.map((barber) => ({
          value: String(barber.id),
          label: barber.name,
        }))}
      />

      <Field
        label="Notes"
        value={notes}
        onChange={(event) => onNotesChange(event.target.value)}
        placeholder=""
      />

      <div className="flex items-end">
        <Button
          className="w-full disabled:cursor-not-allowed disabled:opacity-60"
          onClick={onIssue}
          disabled={isIssuing}
        >
          {isIssuing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Issuing...
            </>
          ) : (
            <>
              <PackagePlus className="mr-2 h-4 w-4" />
              Record handout
            </>
          )}
        </Button>
      </div>
    </div>
  </section>
);
