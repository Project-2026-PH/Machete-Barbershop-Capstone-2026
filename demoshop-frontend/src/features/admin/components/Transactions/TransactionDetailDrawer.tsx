import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Printer,
  Copy,
  Check,
  Calendar,
  Clock,
  User,
  CreditCard,
  ShieldCheck,
  Receipt,
  Scissors,
  ShoppingBag,
  ExternalLink,
} from 'lucide-react';
import type { TransactionHistoryItem } from '@demoshop/shared-types';
import { Portal } from '@/components/common/Portal';
import { api } from '@/config/api';

interface TransactionDetailDrawerProps {
  transaction: TransactionHistoryItem | null;
  isOpen: boolean;
  onClose: () => void;
}

const formatCurrency = (val?: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(Number(val || 0));

export const TransactionDetailDrawer: React.FC<TransactionDetailDrawerProps> = ({
  transaction,
  isOpen,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [receiptFailed, setReceiptFailed] = useState(false);
  const [receiptFit, setReceiptFit] = useState(true);

  if (!transaction) return null;

  const handleCopyRef = () => {
    navigator.clipboard.writeText(transaction.referenceNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  const loadReceipt = async () => {
    if (!transaction) return;
    setReceiptOpen(true);
    setReceiptLoading(true);
    setReceiptFailed(false);
    setReceiptUrl(null);
    try {
      const { data } = await api.get<{ url: string }>(`/api/admin/transactions/${transaction.id}/receipt-url`);
      setReceiptUrl(data.url);
    } catch {
      setReceiptFailed(true);
    } finally {
      setReceiptLoading(false);
    }
  };

  return (
    <Portal>
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex justify-end overflow-hidden">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={onClose}
              className="fixed inset-0 bg-black/75 backdrop-blur-xs cursor-pointer print:hidden"
            />

            {/* Slide-over Drawer */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="relative w-full max-w-lg h-full bg-charcoal border-l border-white/10 shadow-2xl z-10 flex flex-col overflow-hidden text-ivory print:static print:max-w-none print:w-full print:border-none print:shadow-none"
            >
              {/* Drawer Header */}
              <div className="p-5 border-b border-white/10 flex items-center justify-between bg-charcoal-light/60 print:bg-transparent print:border-b-2 print:border-black">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-sm bg-gold/15 border border-gold/30 flex items-center justify-center text-gold">
                    <Receipt className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-serif text-base font-bold tracking-wider text-ivory">
                        {transaction.referenceNumber}
                      </h3>
                      <button
                        type="button"
                        onClick={handleCopyRef}
                        className="text-ivory-dim hover:text-gold transition-colors p-1 cursor-pointer print:hidden"
                        title="Copy Reference"
                      >
                        {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <p className="text-[11px] text-ivory-dim font-mono">
                      {transaction.invoiceId} • {transaction.formattedDate} at {transaction.formattedTime}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 print:hidden">
                  <button
                    type="button"
                    onClick={onClose}
                    className="p-2 text-ivory-dim hover:text-ivory hover:bg-white/10 rounded-sm transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Drawer Content */}
              <div className="flex-1 overflow-y-auto p-5 space-y-5 print:overflow-visible">
                {/* Status & Channel Banner */}
                <div className="flex items-center justify-between p-3 rounded-sm bg-white/[0.02] border border-white/10">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-ivory-dim">Channel:</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-sm font-semibold border ${
                        transaction.channel === 'online'
                          ? 'bg-gold/15 text-gold border-gold/30'
                          : transaction.channel === 'retail'
                          ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30'
                          : transaction.channelBadge === 'Walk-in Reservation'
                          ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                          : 'bg-zinc-800 text-ivory-dim border-white/10'
                      }`}
                    >
                      {transaction.channelBadge}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                      Settled / Completed
                    </span>
                  </div>
                </div>

                {/* Customer & Staff Information */}
                <div className="grid grid-cols-2 gap-3">
                  {/* Customer Card */}
                  <div className="p-3 bg-charcoal-light/40 border border-white/5 rounded-sm space-y-1">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-gold block">
                      Customer
                    </span>
                    <p className="text-sm font-semibold text-ivory">{transaction.customer.name}</p>
                    {transaction.customer.phone && (
                      <p className="text-xs text-ivory-dim">{transaction.customer.phone}</p>
                    )}
                    {transaction.customer.isGuest && (
                      <span className="inline-block text-[10px] px-1.5 py-0.2 rounded-xs bg-zinc-800 text-zinc-400 font-mono mt-1">
                        Guest Walk-in
                      </span>
                    )}
                  </div>

                  {/* Staff Card */}
                  <div className="p-3 bg-charcoal-light/40 border border-white/5 rounded-sm space-y-1">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-gold block">
                      Assigned Barber
                    </span>
                    <p className="text-sm font-semibold text-ivory">
                      {transaction.barber ? transaction.barber.name : 'Unassigned / Retail Only'}
                    </p>
                    {transaction.cashier && (
                      <p className="text-xs text-ivory-dim truncate">Processed by: {transaction.cashier.name}</p>
                    )}
                  </div>
                </div>

                {/* Session Timestamps (Audit Trail) */}
                <div className="p-3 rounded-sm bg-white/[0.02] border border-white/5 space-y-2">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-gold block">
                    Session Audit Trail
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-ivory-dim block text-[11px]">Appointment Created:</span>
                      <span className="font-mono text-ivory">
                        {transaction.appointmentCreatedAt
                          ? new Date(transaction.appointmentCreatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : 'Immediate Walk-in'}
                      </span>
                    </div>
                    <div>
                      <span className="text-ivory-dim block text-[11px]">Checkout Completed:</span>
                      <span className="font-mono text-ivory">
                        {transaction.serviceCompletedAt
                          ? new Date(transaction.serviceCompletedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : transaction.formattedTime}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Line Item Breakdown */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-ivory">
                      Itemized Breakdown ({transaction.itemCount} item{transaction.itemCount > 1 ? 's' : ''})
                    </span>
                  </div>

                  <div className="border border-white/10 rounded-sm overflow-hidden bg-charcoal-light/30">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-charcoal-light border-b border-white/10 text-ivory-dim text-[11px] font-bold uppercase tracking-wider">
                        <tr>
                          <th className="py-2.5 px-3">Item / Service</th>
                          <th className="py-2.5 px-2 text-center">Qty</th>
                          <th className="py-2.5 px-2 text-right">Unit Price</th>
                          <th className="py-2.5 px-3 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {transaction.lineItems.map((item) => (
                          <tr key={item.id} className="hover:bg-white/[0.02]">
                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-2">
                                {item.type === 'service' ? (
                                  <Scissors className="w-3.5 h-3.5 text-gold shrink-0" />
                                ) : (
                                  <ShoppingBag className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                                )}
                                <div>
                                  <span className="font-semibold text-ivory block leading-tight">{item.name}</span>
                                  {(item as typeof item & { customSpecification?: string | null }).customSpecification && (
                                    <span className="mt-0.5 block text-xs text-amber-500/80">Style: {(item as typeof item & { customSpecification?: string | null }).customSpecification}</span>
                                  )}
                                  {item.category && (
                                    <span className="text-[10px] text-ivory-dim">{item.category}</span>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="py-2.5 px-2 text-center font-mono text-ivory-dim">{item.quantity}</td>
                            <td className="py-2.5 px-2 text-right font-mono text-ivory-dim">
                              {formatCurrency(item.unitPrice)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-semibold text-ivory">
                              {formatCurrency(item.totalPrice)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Payment Breakdown & Financial Allocations */}
                <div className="p-4 bg-charcoal-light/50 border border-white/10 rounded-sm space-y-2.5">
                  <div className="flex justify-between text-xs text-ivory-dim">
                    <span>Subtotal:</span>
                    <span className="font-mono text-ivory">{formatCurrency(transaction.subtotal)}</span>
                  </div>
                  {transaction.discounts > 0 && (
                    <div className="flex justify-between text-xs text-emerald-400">
                      <span>Discount Applied:</span>
                      <span className="font-mono">-{formatCurrency(transaction.discounts)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xs text-ivory-dim">
                    <span>Payment Tender:</span>
                    <span className="font-semibold text-ivory flex items-center gap-1.5 flex-wrap justify-end">
                      <CreditCard className="w-3 h-3 text-gold" />
                      {transaction.paymentMethodDisplay}
                      {transaction.paymentReference && (
                        <span className="text-[10px] font-mono text-ivory-dim">
                          (Ref: {transaction.paymentReference})
                        </span>
                      )}
                      {transaction.receiptAvailable && (
                        <button
                          type="button"
                          onClick={loadReceipt}
                          className="inline-flex items-center gap-1 rounded-sm border border-gold/30 bg-gold/10 px-2 py-1 text-[10px] font-bold text-gold hover:bg-gold/20 transition-colors cursor-pointer print:hidden"
                        >
                          <Receipt className="w-3 h-3" /> View Receipt
                        </button>
                      )}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-white/10 flex justify-between items-baseline">
                    <span className="text-sm font-bold text-ivory uppercase tracking-wider">Gross Total Settled</span>
                    <span className="font-serif text-xl font-bold text-gold">
                      {formatCurrency(transaction.totalAmount)}
                    </span>
                  </div>
                </div>

                {/* Barber Commission Split */}
                <div className="p-3.5 rounded-sm bg-gold/5 border border-gold/20 space-y-2">
                  <div className="flex items-center gap-2 text-gold">
                    <ShieldCheck className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">
                      Revenue Distribution (Audit)
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-ivory-dim block text-[11px]">Barber Commission (40%):</span>
                      <span className="font-serif text-sm font-bold text-emerald-400">
                        {formatCurrency(transaction.barberCommission)}
                      </span>
                    </div>
                    <div>
                      <span className="text-ivory-dim block text-[11px]">Shop Net Allocation:</span>
                      <span className="font-serif text-sm font-bold text-ivory">
                        {formatCurrency(transaction.shopNetSplit)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Drawer Footer Actions */}
              <div className="p-4 border-t border-white/10 bg-charcoal-light flex items-center justify-between gap-3 print:hidden">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 text-xs text-ivory-dim hover:text-ivory rounded-sm transition-colors cursor-pointer"
                >
                  Close
                </button>

                <button
                  type="button"
                  onClick={handlePrint}
                  className="px-4 py-2.5 bg-gold text-charcoal hover:bg-gold-light font-bold text-xs rounded-sm shadow-md flex items-center gap-2 transition-all cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Receipt</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {receiptOpen && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6">
            <motion.button
              type="button"
              aria-label="Close receipt preview"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setReceiptOpen(false)}
              className="absolute inset-0 bg-black/85 backdrop-blur-sm cursor-pointer"
            />
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-label={`Proof for ${transaction.referenceNumber}`}
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97 }}
              className="relative z-10 flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-sm border border-gold/30 bg-charcoal shadow-2xl"
            >
              <header className="flex items-center justify-between gap-4 border-b border-white/10 bg-charcoal-light/60 px-4 py-3 sm:px-5">
                <div className="min-w-0">
                  <h3 className="truncate font-serif text-sm font-bold text-ivory">Proof for {transaction.referenceNumber}</h3>
                  <p className="truncate font-mono text-[11px] text-ivory-dim">Ref: {transaction.paymentReference || '—'}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {receiptUrl && (
                    <>
                      <button type="button" onClick={() => setReceiptFit((fit) => !fit)} className="rounded-sm px-2 py-2 text-xs text-ivory-dim hover:bg-white/10 hover:text-gold" title={receiptFit ? 'Show image at natural size' : 'Fit image'}>
                        {receiptFit ? 'Fit' : '100%'}
                      </button>
                      <a href={receiptUrl} target="_blank" rel="noreferrer" className="rounded-sm p-2 text-ivory-dim hover:bg-white/10 hover:text-gold" title="Open in new tab">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </>
                  )}
                  <button type="button" onClick={() => setReceiptOpen(false)} className="rounded-sm p-2 text-ivory-dim hover:bg-white/10 hover:text-ivory" aria-label="Close receipt preview">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </header>
              <div className="flex min-h-64 flex-1 items-center justify-center overflow-auto bg-black/35 p-3 sm:p-6">
                {receiptLoading ? (
                  <p className="text-sm text-ivory-dim">Loading receipt…</p>
                ) : receiptFailed ? (
                  <div className="space-y-3 text-center">
                    <p className="text-sm text-ivory-dim">Receipt image could not be loaded.</p>
                    <button type="button" onClick={loadReceipt} className="rounded-sm border border-gold/30 bg-gold/10 px-3 py-2 text-xs font-bold text-gold hover:bg-gold/20">Retry</button>
                  </div>
                ) : receiptUrl ? (
                  <img
                    src={receiptUrl}
                    alt={`Payment receipt proof for ${transaction.referenceNumber}`}
                    onError={() => { setReceiptUrl(null); setReceiptFailed(true); }}
                    className={receiptFit ? 'max-h-[72vh] max-w-full object-contain' : 'max-w-none object-none'}
                  />
                ) : null}
              </div>
            </motion.section>
          </div>
        )}
      </AnimatePresence>
    </Portal>
  );
};
