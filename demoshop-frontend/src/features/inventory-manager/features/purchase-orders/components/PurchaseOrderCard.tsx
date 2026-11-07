import React from 'react';
import { ClipboardCheck, Edit3, FileImage, Send, Trash2 } from 'lucide-react';
import { formatDateTime, formatPurchaseOrderStatus, statusClass } from '../../../shared/utils/formatting';
import type { PurchaseOrder } from '../purchase-order.types';
import {
  canEditPurchaseOrder,
  canFulfillPurchaseOrder,
  canSubmitPurchaseOrder,
} from '../purchase-order.state-machine';

interface PurchaseOrderCardProps {
  order: PurchaseOrder;
  onEdit: (order: PurchaseOrder) => void;
  onDelete: (order: PurchaseOrder) => void;
  onSubmit: (order: PurchaseOrder) => void;
  onFulfill: (order: PurchaseOrder) => void;
}

export const PurchaseOrderCard: React.FC<PurchaseOrderCardProps> = ({
  order,
  onEdit,
  onDelete,
  onSubmit,
  onFulfill,
}) => (
  <article className="rounded-lg border border-white/10 bg-charcoal p-4">
    <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="font-bold text-gold">{order.poNumber}</h4>
          <span
            className={`rounded-full border px-2 py-1 text-[11px] font-bold uppercase ${
              statusClass[order.status] || statusClass.draft
            }`}
          >
            {formatPurchaseOrderStatus(order.status)}
          </span>
        </div>
        <p className="mt-1 text-xs text-ivory-dim">
          {order.lines.length} line item(s) · created {formatDateTime(order.createdAt)}
        </p>
        {order.receiptImageUrl && (
          <a
            href={order.receiptImageUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs text-gold hover:underline"
          >
            <FileImage className="h-3.5 w-3.5" />
            View receipt evidence
          </a>
        )}
        {order.reviewNotes && (
          <p className="mt-2 rounded border border-red-400/20 bg-red-400/5 px-3 py-2 text-xs text-red-200">
            Review note: {order.reviewNotes}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {canEditPurchaseOrder(order.status) && (
          <button
            className="inline-flex min-h-10 items-center gap-1 rounded border border-white/15 px-3 text-xs hover:border-gold hover:text-gold"
            onClick={() => onEdit(order)}
          >
            <Edit3 className="h-3.5 w-3.5" />
            Edit
          </button>
        )}
        {order.status === 'draft' && (
          <button
            type="button"
            className="inline-flex min-h-10 items-center gap-1 rounded border border-red-400/30 px-3 text-xs text-red-300 hover:bg-red-400/10"
            onClick={() => onDelete(order)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        )}
        {canSubmitPurchaseOrder(order.status) && (
          <button
            className="inline-flex min-h-10 items-center gap-1 rounded border border-gold/40 px-3 text-xs text-gold hover:bg-gold/10"
            onClick={() => onSubmit(order)}
          >
            <Send className="h-3.5 w-3.5" />
            Submit
          </button>
        )}
        {canFulfillPurchaseOrder(order.status) && (
          <button
            className="inline-flex min-h-10 items-center gap-1 rounded border border-emerald-400/30 px-3 text-xs text-emerald-300 hover:bg-emerald-400/10"
            onClick={() => onFulfill(order)}
          >
            <ClipboardCheck className="h-3.5 w-3.5" />
            Receive
          </button>
        )}
      </div>
    </div>

    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[580px] text-left text-xs">
        <thead className="border-b border-white/10 bg-charcoal text-[10px] font-semibold uppercase tracking-wider text-ivory-dim">
          <tr>
            <th className="py-2 pr-3">Item</th>
            <th className="py-2 pr-3">Quantity</th>
            <th className="py-2 pr-3">Supplier</th>
            <th className="py-2">Unit cost</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {order.lines.map((line) => (
            <tr key={line.id || line.inventoryStockId}>
              <td className="py-2 pr-3">
                {line.itemName} <span className="text-ivory-dim">({line.unit})</span>
              </td>
              <td className="py-2 pr-3 text-gold">{line.quantityRequested}</td>
              <td className="py-2 pr-3 text-ivory-dim">{line.supplierName || '—'}</td>
              <td className="py-2 text-ivory-dim">
                {line.unitCost == null ? '—' : `₱${line.unitCost.toFixed(2)}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </article>
);
