import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/ui/Button';
import { api } from '@/config/api';
import type { CustomerInfo } from './queue/types';

interface ReassignmentOption {
  barber_id: number;
  name: string;
  status: string;
  queue_count: number;
}

interface Props {
  customer: CustomerInfo;
  onClose: () => void;
  onSuccess: () => void;
}

export const CashierReassignmentModal: React.FC<Props> = ({ customer, onClose, onSuccess }) => {
  const [options, setOptions] = useState<ReassignmentOption[]>([]);
  const [selectedBarberId, setSelectedBarberId] = useState<number | null>(null);
  const [reason, setReason] = useState('Barber became unavailable');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.get<ReassignmentOption[]>(`/api/queue/${customer.id}/reassignment-options`)
      .then((response) => {
        if (!active) return;
        setOptions(Array.isArray(response.data) ? response.data : []);
        setSelectedBarberId(response.data?.[0]?.barber_id ?? null);
      })
      .catch((err: any) => {
        if (active) setError(err.response?.data?.error || 'Unable to load replacement barbers.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [customer.id]);

  const submit = async () => {
    if (!selectedBarberId || !reason.trim()) {
      setError('Select a replacement barber and provide a reason.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/api/queue/${customer.id}/reassign`, {
        replacementBarberId: selectedBarberId,
        reason: reason.trim(),
      });
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Unable to reassign this guest.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={() => !submitting && onClose()}
      title="Cancel Barber / Reassign"
      size="md"
      footer={(
        <div className="flex w-full justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button variant="primary" onClick={() => void submit()} disabled={submitting || loading || !selectedBarberId}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            Transfer Guest
          </Button>
        </div>
      )}
    >
      <div className="space-y-4 p-1 text-sm text-ivory">
        <div className="rounded-sm border border-amber-500/30 bg-amber-500/[0.08] p-3 text-xs leading-relaxed text-amber-100">
          <div className="mb-1 flex items-center gap-2 font-bold text-amber-300"><AlertTriangle className="h-4 w-4" /> Confirm barber cancellation</div>
          Cancel the assignment for <strong>{customer.name || 'this guest'}</strong>? The ₱50 reservation fee remains <strong>PAID</strong> and will be transferred without another charge.
        </div>

        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ivory-dim">Replacement barber</label>
          {loading ? <div className="flex items-center gap-2 text-xs text-ivory-dim"><Loader2 className="h-4 w-4 animate-spin" /> Loading active barbers…</div> : options.length === 0 ? <p className="text-xs text-red-300">No active replacement barber is available.</p> : (
            <div className="space-y-2">
              {options.map((option) => (
                <button
                  key={option.barber_id}
                  type="button"
                  onClick={() => setSelectedBarberId(option.barber_id)}
                  className={`flex w-full items-center justify-between rounded-sm border p-3 text-left transition-colors ${selectedBarberId === option.barber_id ? 'border-gold bg-gold/10' : 'border-white/10 bg-white/[0.03] hover:border-white/30'}`}
                >
                  <span className="font-semibold">{option.name}</span>
                  <span className="text-xs text-ivory-dim">{option.queue_count} customer{option.queue_count <=0 || option.queue_count <= 1 ? '' : 's'}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <label className="block text-xs text-ivory-dim">
          Reason
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} className="mt-1 w-full rounded-sm border border-white/10 bg-white/[0.04] p-2 text-sm text-ivory outline-none focus:border-gold" />
        </label>
        {error && <div className="rounded-sm border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">{error}</div>}
      </div>
    </Modal>
  );
};

export default CashierReassignmentModal;
