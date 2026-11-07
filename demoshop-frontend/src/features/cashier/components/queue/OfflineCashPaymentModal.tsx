import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Banknote } from 'lucide-react';
import { Modal } from '../../../../components/feedback/Modal';
import type { LocalWalkInTransaction } from '../../services/cashier-offline.repository';
import { normalizeLocalCashCapture } from '../../services/cashier-offline-payment';

interface OfflineCashPaymentModalProps {
  transaction: LocalWalkInTransaction | null;
  onClose: () => void;
  onConfirm: (tenderedAmount: number) => Promise<void>;
}

const money = (amount: number): string => amount.toLocaleString('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default function OfflineCashPaymentModal({ transaction, onClose, onConfirm }: OfflineCashPaymentModalProps) {
  const [tendered, setTendered] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setTendered('');
    setConfirmed(false);
    setError(null);
  }, [transaction?.localId]);
  const amountDue = useMemo(() => transaction
    ? transaction.serviceSnapshot.reduce((total, service) => total + Math.round(service.price * 100), 0) / 100
    : 0, [transaction]);
  const capture = Number(tendered);
  const change = Number.isFinite(capture) && capture >= amountDue ? Math.round((capture - amountDue) * 100) / 100 : null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!transaction || submitting || !confirmed) return;
    try {
      const normalized = normalizeLocalCashCapture(amountDue, capture);
      setSubmitting(true);
      setError(null);
      await onConfirm(normalized.tenderedAmount);
      setTendered('');
      setConfirmed(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to save the local cash payment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={Boolean(transaction)} onClose={submitting ? () => undefined : onClose} title="Record Offline Cash" size="sm">
      {transaction && (
        <form onSubmit={submit} className="space-y-4 p-5 text-ivory">
          <div className="rounded-sm border border-amber-300/30 bg-amber-300/10 p-3 text-xs text-amber-100">
            Provisional receipt only. This payment is saved on this device and will sync later. It is not a tax invoice.
          </div>
          <div className="rounded-sm border border-white/10 bg-white/[0.02] p-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-ivory-dim">Completed service · {transaction.customerName}</div>
            <div className="my-2 space-y-1">
              {transaction.serviceSnapshot.map((service) => (
                <div key={service.serviceId} className="flex justify-between gap-3 text-xs text-ivory-dim">
                  <span>{service.name}</span><span>₱{money(service.price)}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between border-t border-white/10 pt-2 font-bold text-gold">
              <span>Total due</span><span>₱{money(amountDue)}</span>
            </div>
          </div>
          <label className="block space-y-1 text-xs">
            <span className="font-bold uppercase tracking-wider text-ivory-dim">Cash received</span>
            <input
              inputMode="decimal"
              min="0"
              step="0.01"
              value={tendered}
              onChange={(event) => setTendered(event.target.value)}
              className="h-10 w-full rounded-sm border border-white/15 bg-black/30 px-3 text-sm text-ivory outline-none focus:border-gold"
              autoFocus
            />
          </label>
          <div className="flex justify-between rounded-sm border border-white/10 bg-white/5 p-3 text-sm">
            <span className="text-ivory-dim">Change due</span>
            <strong className={change === null ? 'text-ivory-dim' : 'text-gold'}>{change === null ? '—' : `₱${money(change)}`}</strong>
          </div>
          <label className="flex items-start gap-2 text-xs text-ivory">
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5 accent-[#d4a017]" />
            <span>I received the cash and gave the displayed change.</span>
          </label>
          {error && <p role="alert" className="rounded-sm border border-red-400/30 bg-red-500/10 p-3 text-xs text-red-200">{error}</p>}
          <div className="flex gap-2">
            <button type="button" disabled={submitting} onClick={onClose} className="h-10 flex-1 rounded-sm border border-white/10 text-xs font-bold uppercase text-ivory-dim hover:bg-white/5 disabled:opacity-40">Cancel</button>
            <button type="submit" disabled={submitting || !confirmed || change === null} className="flex h-10 flex-1 items-center justify-center gap-2 rounded-sm bg-gold text-xs font-bold uppercase text-charcoal hover:bg-gold-dim disabled:cursor-not-allowed disabled:opacity-40">
              <Banknote className="h-4 w-4" />{submitting ? 'Saving…' : 'Record Cash'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
