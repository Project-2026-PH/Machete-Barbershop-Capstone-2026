import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Modal } from '../../../../components/feedback/Modal';
import type { BarberInfo } from './types';
import type { LocalWalkInTransaction } from '../../services/cashier-offline.repository';

interface CachedOfflineService {
  id: string;
  name: string;
  price: number;
  duration: number;
  priceKnown: boolean;
  durationKnown: boolean;
}

interface OfflineWalkInEditModalProps {
  transaction: LocalWalkInTransaction | null;
  services: CachedOfflineService[];
  barbers: BarberInfo[];
  catalogReady: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSave: (changes: {
    serviceIds?: number[];
    serviceSnapshot?: Array<{ serviceId: number; name: string; price: number; durationMinutes: number }>;
    barberId?: number;
    barberName?: string;
  }) => Promise<void>;
}

const money = (amount: number): string => amount.toLocaleString('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default function OfflineWalkInEditModal({
  transaction,
  services,
  barbers,
  catalogReady,
  isSaving,
  onClose,
  onSave,
}: OfflineWalkInEditModalProps) {
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [barberId, setBarberId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setServiceIds(transaction?.serviceIds.map(String) || []);
    setBarberId(String(transaction?.barberId ?? ''));
    setError(null);
  }, [transaction?.localId]);

  const canChangeServices = Boolean(transaction
    && transaction.status === 'queued'
    && transaction.paymentStatus !== 'paid');
  const canChangeBarber = Boolean(transaction && (
    transaction.paymentStatus === 'paid'
      ? transaction.status === 'completed'
      : transaction.status === 'queued'
  ));
  const selectedServiceIds = serviceIds.map(Number);
  const serviceChanged = Boolean(transaction && (
    selectedServiceIds.length !== transaction.serviceIds.length
      || selectedServiceIds.some((id, index) => id !== transaction.serviceIds[index])
  ));
  const barberChanged = Boolean(transaction && Number(barberId) !== transaction.barberId);
  const selectedServiceDetails = useMemo(() => selectedServiceIds.map((id) => {
    const cached = services.find((service) => Number(service.id) === id);
    if (!serviceChanged) {
      const snapshot = transaction?.serviceSnapshot.find((service) => service.serviceId === id);
      if (snapshot) return snapshot;
    }
    if (!cached || !cached.priceKnown || !cached.durationKnown) return null;
    return { serviceId: id, name: cached.name, price: cached.price, durationMinutes: cached.duration };
  }), [selectedServiceIds.join(','), serviceChanged, services, transaction]);
  const totals = selectedServiceDetails.every(Boolean)
    ? (selectedServiceDetails as NonNullable<typeof selectedServiceDetails[number]>[]).reduce((sum, service) => ({
      amount: sum.amount + service.price,
      duration: sum.duration + service.durationMinutes,
    }), { amount: 0, duration: 0 })
    : null;
  const selectedBarber = barbers.find((barber) => barber.id === barberId);
  const missingCurrentService = Boolean(transaction?.serviceIds.some((id) => !services.some((service) => Number(service.id) === id)));
  const missingCurrentBarber = Boolean(transaction?.barberId && !barbers.some((barber) => Number(barber.id) === transaction.barberId));

  const toggleService = (id: string) => {
    setServiceIds((current) => current.includes(id)
      ? current.filter((value) => value !== id)
      : [...current, id]);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!transaction || submitting || isSaving) return;
    if (!serviceChanged && !barberChanged) {
      setError('No changes to save.');
      return;
    }
    if (serviceChanged && (!catalogReady || !totals || selectedServiceIds.length === 0)) {
      setError('A current cached service and price are required. Reconnect or choose an available cached service.');
      return;
    }
    if (barberChanged && (!catalogReady || !selectedBarber)) {
      setError('That barber is not available in the cached branch catalog. Choose a cached barber or reconnect.');
      return;
    }
    try {
      setSubmitting(true);
      setError(null);
      await onSave({
        ...(serviceChanged ? {
          serviceIds: selectedServiceIds,
          serviceSnapshot: selectedServiceDetails as Array<{
            serviceId: number;
            name: string;
            price: number;
            durationMinutes: number;
          }>,
        } : {}),
        ...(barberChanged && selectedBarber ? {
          barberId: Number(selectedBarber.id),
          barberName: selectedBarber.name,
        } : {}),
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the offline walk-in changes.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={Boolean(transaction)} onClose={submitting || isSaving ? () => undefined : onClose} title="Edit Walk-in" size="md">
      {transaction && (
        <form onSubmit={submit} className="space-y-4 p-5 text-ivory">
          <p className="text-xs text-ivory-dim">Changes are saved locally in order and synced when the connection returns.</p>

          {transaction.paymentStatus === 'paid' && (
            <div className="rounded-sm border border-amber-300/30 bg-amber-300/10 p-3 text-xs text-amber-100">
              Cash has been recorded. The service and printed receipt stay unchanged; only the barber may be reassigned.
            </div>
          )}

          <fieldset disabled={!canChangeServices || !catalogReady} className="space-y-2 disabled:opacity-60">
            <legend className="mb-2 text-[10px] font-bold uppercase tracking-wider text-ivory-dim">Services</legend>
            {services.length === 0 ? (
              <p className="rounded-sm border border-white/10 bg-white/[0.02] p-3 text-xs text-ivory-dim">The cached service catalog is unavailable. Reconnect before changing services.</p>
            ) : (
              <div className="max-h-52 space-y-1 overflow-y-auto rounded-sm border border-white/10 bg-black/20 p-2">
                {services.map((service) => (
                  <label key={service.id} className="flex cursor-pointer items-center gap-3 rounded-sm p-2 hover:bg-white/5">
                    <input
                      type="checkbox"
                      checked={serviceIds.includes(service.id)}
                      onChange={() => toggleService(service.id)}
                      disabled={!service.priceKnown || !service.durationKnown}
                      className="accent-[#d4a017]"
                    />
                    <span className="min-w-0 flex-1 text-xs text-ivory">{service.name}</span>
                    <span className="whitespace-nowrap text-[11px] text-ivory-dim">
                      {service.priceKnown ? `₱${money(service.price)}` : 'Price unavailable'}
                      {service.durationKnown ? ` · ${service.duration} min` : ''}
                    </span>
                  </label>
                ))}
              </div>
            )}
            {missingCurrentService && canChangeServices && (
              <p className="text-xs text-amber-200">A current service is missing from the cached catalog. Keep the order unchanged or choose another cached service.</p>
            )}
            {serviceChanged && totals && (
              <div className="flex justify-between border-t border-white/10 pt-2 text-xs">
                <span className="text-ivory-dim">Updated total · {totals.duration} min</span>
                <strong className="text-gold">₱{money(totals.amount)}</strong>
              </div>
            )}
          </fieldset>

          <label className="block space-y-1 text-xs">
            <span className="font-bold uppercase tracking-wider text-ivory-dim">Barber</span>
            <select
              value={barberId}
              onChange={(event) => setBarberId(event.target.value)}
              disabled={!canChangeBarber || !catalogReady}
              className="h-10 w-full rounded-sm border border-white/15 bg-black/30 px-3 text-sm text-ivory outline-none focus:border-gold disabled:opacity-60"
            >
              {missingCurrentBarber && <option value={String(transaction.barberId)}>Current barber unavailable offline</option>}
              {barbers.map((barber) => <option key={barber.id} value={barber.id}>{barber.name}</option>)}
            </select>
          </label>

          {!catalogReady && <p className="text-xs text-amber-200">The cached catalog is stale or unavailable. Reconnect before changing this walk-in.</p>}
          {error && <p role="alert" className="rounded-sm border border-red-400/30 bg-red-500/10 p-3 text-xs text-red-200">{error}</p>}
          <div className="flex gap-2">
            <button type="button" disabled={submitting || isSaving} onClick={onClose} className="h-10 flex-1 rounded-sm border border-white/10 text-xs font-bold uppercase text-ivory-dim hover:bg-white/5 disabled:opacity-40">Cancel</button>
            <button type="submit" disabled={submitting || isSaving || (!serviceChanged && !barberChanged)} className="h-10 flex-1 rounded-sm bg-gold text-xs font-bold uppercase text-charcoal hover:bg-gold-dim disabled:cursor-not-allowed disabled:opacity-40">
              {submitting || isSaving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
