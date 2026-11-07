import React, { useEffect, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, ClipboardCheck, Edit3, Eye, FileImage, Maximize2, Send, Trash2, X } from 'lucide-react';
import { formatDateTime, formatPurchaseOrderStatus, formatUnit, statusClass } from '../../../shared/utils/formatting';
import type { PurchaseOrder } from '../purchase-order.types';
import {
  canEditPurchaseOrder,
  canFulfillPurchaseOrder,
  canSubmitPurchaseOrder,
} from '../purchase-order.state-machine';
import { OrderTracker } from './OrderTracker';

interface PurchaseOrderDetailProps {
  order: PurchaseOrder;
  onBack: () => void;
  onEdit: (order: PurchaseOrder) => void;
  onDelete: (order: PurchaseOrder) => void;
  onSubmit: (order: PurchaseOrder) => void;
  onFulfill: (order: PurchaseOrder) => void;
  busy?: boolean;
}

export const PurchaseOrderDetail: React.FC<PurchaseOrderDetailProps> = ({
  order,
  onBack,
  onEdit,
  onDelete,
  onSubmit,
  onFulfill,
  busy = false,
}) => {
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [receiptViewerIndex, setReceiptViewerIndex] = useState(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsReceiptModalOpen(false);
      }
    };
    if (isReceiptModalOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isReceiptModalOpen]);

  useEffect(() => {
    setReceiptViewerIndex(0);
  }, [order.id, order.receiptImageUrls?.join('|')]);

  const totalAmount = order.lines.reduce((sum, line) => {
    const cost = line.unitCost || 0;
    return sum + line.quantityRequested * cost;
  }, 0);

  const receiptImages = (order.receiptImageUrls && order.receiptImageUrls.length > 0)
    ? order.receiptImageUrls
    : (order.receiptImageUrl ? [order.receiptImageUrl] : []);

  const hasReceiptAttached = receiptImages.length > 0;

  return (
    <div className="space-y-6">
      {/* Navigation & Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-charcoal-light text-ivory-dim transition hover:border-gold hover:text-gold"
            aria-label="Back to stock requests list"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-xl sm:text-2xl font-serif font-bold text-ivory">{order.poNumber}</h2>
              <span
                className={`rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${statusClass[order.status] || statusClass.draft
                  }`}
              >
                {formatPurchaseOrderStatus(order.status)}
              </span>
            </div>
            <p className="mt-1 text-xs text-ivory-dim">
              Created {formatDateTime(order.createdAt)}
              {order.createdByName ? ` by ${order.createdByName}` : ''}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {canEditPurchaseOrder(order.status) && (
            <button
              type="button"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-white/15 bg-charcoal px-3 py-2 text-xs font-semibold hover:border-gold hover:text-gold transition"
              onClick={() => onEdit(order)}
            >
              <Edit3 className="h-3.5 w-3.5" />
              Edit Order
            </button>
          )}
          {order.status === 'draft' && (
            <button
              type="button"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-red-400/30 bg-red-400/5 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-400/15 transition"
              onClick={() => onDelete(order)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete Draft
            </button>
          )}
          {canSubmitPurchaseOrder(order.status) && (
            <button
              type="button"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-gold/50 bg-gold/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-gold hover:bg-gold/20 transition disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => onSubmit(order)}
              disabled={busy}
            >
              <Send className="h-3.5 w-3.5" />
              {busy ? 'Submitting…' : 'Submit For Approval'}
            </button>
          )}
          {canFulfillPurchaseOrder(order.status) && hasReceiptAttached && (
            <button
              type="button"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-emerald-300 hover:bg-emerald-400/20 transition disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => onFulfill(order)}
              disabled={busy}
            >
              <ClipboardCheck className="h-3.5 w-3.5" />
              {busy ? 'Receiving…' : 'Receive & Stock'}
            </button>
          )}
        </div>
      </div>

      {/* Review Notes Alert if rejected or noted */}
      {order.reviewNotes && (
        <div className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-xs text-red-200">
          <p className="font-bold text-red-300">Owner / Admin Note:</p>
          <p className="mt-1 leading-relaxed">{order.reviewNotes}</p>
        </div>
      )}

      {/* Order Tracker Component */}
      <OrderTracker order={order} onViewReceipt={hasReceiptAttached ? () => setIsReceiptModalOpen(true) : undefined} />

      {/* Main Order Content */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Line Items Table (2 cols) */}
        <section className="min-w-0 lg:col-span-2 rounded-xl border border-white/10 bg-charcoal-light p-5">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div>
              <h3 className="font-bold text-sm text-ivory">Requested Items</h3>
              <p className="text-xs text-ivory-dim">
                {order.lines.length} line item{order.lines.length === 1 ? '' : 's'} in this stock request
              </p>
            </div>
            {totalAmount > 0 && (
              <div className="text-right">
                <span className="text-[10px] uppercase tracking-wider text-ivory-dim">Estimated Total</span>
                <p className="text-sm font-bold text-gold">₱{totalAmount.toFixed(2)}</p>
              </div>
            )}
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[500px] text-left text-xs">
              <thead className="border-b border-white/10 bg-charcoal text-[10px] font-semibold uppercase tracking-wider text-ivory-dim">
                <tr>
                  <th className="py-2.5 pr-3">Item</th>
                  <th className="py-2.5 pr-3">Quantity</th>
                  <th className="py-2.5 pr-3">Supplier</th>
                  <th className="py-2.5 pr-3">Unit Cost</th>
                  <th className="py-2.5 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {order.lines.map((line) => {
                  const subtotal = line.unitCost != null ? line.quantityRequested * line.unitCost : null;
                  return (
                    <tr key={line.id || line.inventoryStockId} className="hover:bg-white/5">
                      <td className="py-3 pr-3 font-medium text-ivory">
                        {line.itemName} <span className="text-ivory-dim">({line.unit})</span>
                        {line.notes && <p className="text-[11px] text-ivory-dim/70 mt-0.5">{line.notes}</p>}
                      </td>
                      <td className="py-3 pr-3 font-semibold text-gold">
                        {line.quantityRequested}
                        {line.unit ? ` ${formatUnit(line.quantityRequested, line.unit)}` : ''}
                      </td>
                      <td className="py-3 pr-3 text-ivory-dim">{line.supplierName || '—'}</td>
                      <td className="py-3 pr-3 text-ivory-dim">
                        {line.unitCost == null ? '—' : `₱${line.unitCost.toFixed(2)}`}
                      </td>
                      <td className="py-3 text-right font-medium text-ivory">
                        {subtotal == null ? '—' : `₱${subtotal.toFixed(2)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Sidebar metadata & Evidence */}
        <section className="min-w-0 space-y-4">
          {/* Order Details Card */}
          <div className="rounded-xl border border-white/10 bg-charcoal-light p-5 space-y-3">
            <h4 className="font-bold text-xs uppercase tracking-wider text-gold">Order Summary</h4>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-ivory-dim">Stock Request Number</span>
                <span className="font-mono font-medium text-ivory">{order.poNumber}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-ivory-dim">Current Status</span>
                <span className="font-semibold text-gold">{formatPurchaseOrderStatus(order.status)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-ivory-dim">Created</span>
                <span className="text-ivory">{formatDateTime(order.createdAt)}</span>
              </div>
              {order.submittedAt && (
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-ivory-dim">Submitted</span>
                  <span className="text-ivory">{formatDateTime(order.submittedAt)}</span>
                </div>
              )}
              {order.reviewedAt && (
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-ivory-dim">Reviewed</span>
                  <span className="text-ivory">{formatDateTime(order.reviewedAt)}</span>
                </div>
              )}
              {order.fulfilledAt && (
                <div className="flex justify-between py-1">
                  <span className="text-ivory-dim">Fulfilled</span>
                  <span className="text-ivory">{formatDateTime(order.fulfilledAt)}</span>
                </div>
              )}
            </div>
            {order.notes && (
              <div className="pt-2 border-t border-white/10 text-xs">
                <span className="text-ivory-dim font-medium">Order Notes:</span>
                <p className="mt-1 text-ivory/80 italic">{order.notes}</p>
              </div>
            )}
          </div>

          {/* Receipt Evidence Card */}
          <div className="rounded-xl border border-white/10 bg-charcoal-light p-5 space-y-3">
            <h4 className="font-bold text-xs uppercase tracking-wider text-gold">Proof of Purchase</h4>
            {hasReceiptAttached ? (
              <div className="space-y-3">
                <p className="text-xs text-emerald-400 font-medium flex items-center gap-1.5">
                  <FileImage className="h-4 w-4" />
                  Receipt evidence attached ({receiptImages.length} file{receiptImages.length > 1 ? 's' : ''})
                </p>

                {/* Clickable thumbnail opening modal */}
                <button
                  type="button"
                  onClick={() => setIsReceiptModalOpen(true)}
                  className="group relative block w-full overflow-hidden rounded-lg border border-white/10 bg-black/40 text-left transition hover:border-gold/60 focus:outline-none focus:ring-1 focus:ring-gold"
                  title="Click to view receipt in popup"
                >
                  <img
                    src={receiptImages[0]}
                    alt="Receipt evidence"
                    width={320}
                    height={160}
                    loading="lazy"
                    decoding="async"
                    className="h-40 w-full object-contain transition duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-charcoal/90 px-3 py-1.5 text-xs font-semibold text-gold shadow-lg border border-gold/30">
                      <Maximize2 className="h-3.5 w-3.5" />
                      View Receipt Modal
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setIsReceiptModalOpen(true)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-gold hover:underline"
                >
                  <Eye className="h-3.5 w-3.5" />
                  View receipt modal
                </button>
              </div>
            ) : (
              <div className="text-xs text-ivory-dim space-y-2">
                <p>No receipt has been added to this stock request yet.</p>
                {order.status === 'approved' && (
                  <p className="text-amber-300/90 text-[11px]">
                    Receipt evidence is attached by the admin upon delivery.
                  </p>
                )}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Pop Up Modal for Attached Receipt Evidence */}
      {isReceiptModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => setIsReceiptModalOpen(false)}
        >
          <div
            className="relative flex max-h-[90vh] w-fit max-w-[90vw] min-w-[min(20rem,90vw)] flex-col overflow-y-auto rounded-xl border border-white/10 bg-charcoal p-4 shadow-2xl sm:p-5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold">
                  Receipt Attached
                </p>
                <h3 className="mt-0.5 text-lg font-bold text-ivory">
                  Receipt Photo · {order.poNumber}
                </h3>
                {order.receiptNumber && (
                  <p className="text-xs text-ivory-dim">
                    Receipt #{order.receiptNumber}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setIsReceiptModalOpen(false)}
                className="rounded-lg p-1.5 text-ivory-dim transition hover:bg-white/10 hover:text-ivory"
                aria-label="Close receipt modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body: one responsive image with gallery navigation */}
            <div className="mt-4 flex max-h-[65vh] items-center justify-center gap-2 overflow-auto rounded-lg border border-white/10 bg-black/50 p-2">
              {receiptImages.length > 1 && (
                <button
                  type="button"
                  aria-label="Previous receipt image"
                  onClick={() => setReceiptViewerIndex((current) => (current - 1 + receiptImages.length) % receiptImages.length)}
                  className="shrink-0 rounded-full border border-white/10 p-2 text-ivory-dim hover:text-gold"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}
              <img
                src={receiptImages[receiptViewerIndex]}
                alt={`Receipt ${receiptViewerIndex + 1} of ${receiptImages.length}`}
                width={800}
                height={600}
                loading="lazy"
                decoding="async"
                className="max-h-[60vh] max-w-[min(75vw,48rem)] rounded object-contain"
              />
              {receiptImages.length > 1 && (
                <button
                  type="button"
                  aria-label="Next receipt image"
                  onClick={() => setReceiptViewerIndex((current) => (current + 1) % receiptImages.length)}
                  className="shrink-0 rounded-full border border-white/10 p-2 text-ivory-dim hover:text-gold"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              )}
            </div>
            {receiptImages.length > 1 && <div className="mt-3 flex max-w-[80vw] gap-2 overflow-x-auto pb-1">{receiptImages.map((url, index) => <button key={url} type="button" aria-label={`View receipt image ${index + 1}`} onClick={() => setReceiptViewerIndex(index)} className={`h-16 w-12 shrink-0 overflow-hidden rounded border ${index === receiptViewerIndex ? 'border-gold' : 'border-white/10'}`}><img src={url} alt="" className="h-full w-full object-contain" /></button>)}</div>}
            <div className="mt-4 border-t border-white/10 pt-3 text-xs text-ivory-dim"><p>Image {receiptViewerIndex + 1} of {receiptImages.length}</p><p className="mt-1">Uploaded: {order.fulfilledAt ? formatDateTime(order.fulfilledAt) : order.createdAt ? formatDateTime(order.createdAt) : 'Date unavailable'}</p><p className="mt-1">Filename: Metadata unavailable</p></div>

            {/* Modal Footer */}
            <div className="mt-4 flex justify-end border-t border-white/10 pt-3">
              <button
                type="button"
                onClick={() => setIsReceiptModalOpen(false)}
                className="rounded-lg border border-white/20 bg-charcoal-light px-4 py-2 text-xs font-semibold text-ivory transition hover:border-gold hover:text-gold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PurchaseOrderDetail;

