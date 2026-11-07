import React from 'react';
import { FileImage } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SelectField } from '../../../shared/components/SelectField';
import type { PurchaseOrder } from '../purchase-order.types';
import { formatPurchaseOrderStatus } from '../../../shared/utils/formatting';

interface ReceiptEvidenceProps {
  receipts: any[];
  orders: PurchaseOrder[];
  receiptId: string;
  selectedOrderIds: string[];
  onReceiptIdChange: (receiptId: string) => void;
  onReceiptFileChange: (file: File | null) => void;
  onToggleOrderSelection: (orderId: string) => void;
  onLinkReceipt: () => void;
}

export const ReceiptEvidence: React.FC<ReceiptEvidenceProps> = ({
  receipts,
  orders,
  receiptId,
  selectedOrderIds,
  onReceiptIdChange,
  onReceiptFileChange,
  onToggleOrderSelection,
  onLinkReceipt,
}) => (
  <section className="rounded-xl border border-white/10 bg-charcoal-light p-5">
    <div className="flex items-center gap-2">
      <FileImage className="h-4 w-4 text-gold" />
      <div>
        <h3 className="font-bold">Shared receipt evidence</h3>
        <p className="mt-1 text-xs text-ivory-dim">
          Upload once, then link the same private receipt to multiple POs.
        </p>
      </div>
    </div>

    <div className="mt-4 space-y-3">
      <SelectField
        label="Receipt"
        value={receiptId}
        onChange={(event) => onReceiptIdChange(event.target.value)}
      >
        <option value="">Select a receipt…</option>
        {receipts.map((receipt) => (
          <option key={receipt.id} value={receipt.id}>
            {receipt.receiptNumber || receipt.id.slice(0, 8)} · linked{' '}
            {receipt.linkedPurchaseOrderCount || 0}
          </option>
        ))}
      </SelectField>

      <label className="block text-xs text-ivory-dim">
        <span>New receipt image for the next receive action</span>
        <input
          type="file"
          accept="image/jpeg,image/png"
          className="mt-1.5 block w-full text-xs text-ivory-dim file:mr-3 file:rounded file:border-0 file:bg-gold file:px-3 file:py-2 file:text-xs file:font-bold file:text-charcoal"
          onChange={(event) => onReceiptFileChange(event.target.files?.[0] || null)}
        />
      </label>

      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wider text-ivory-dim">
          Link selected receipt to
        </p>
        {orders
          .filter((order) => order.status !== 'rejected')
          .map((order) => (
            <label key={order.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selectedOrderIds.includes(order.id)}
                onChange={() => onToggleOrderSelection(order.id)}
              />
              {order.poNumber} <span className="text-xs text-ivory-dim">({formatPurchaseOrderStatus(order.status)})</span>
            </label>
          ))}
      </div>

      <Button
        variant="outline"
        className="w-full"
        disabled={!receiptId || selectedOrderIds.length === 0}
        onClick={onLinkReceipt}
      >
        Link receipt to selected POs
      </Button>
    </div>
  </section>
);
