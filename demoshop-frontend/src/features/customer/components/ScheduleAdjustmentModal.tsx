import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, Clock, Loader2 } from 'lucide-react';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/ui/Button';
import { api } from '@/config/api';
import { useToast } from '@/components/feedback/ToastContext';
import { addDaysToIsoDate, getManilaDateIso } from '@/utils/manila-date';

interface ScheduleAdjustmentModalProps {
  notification: any | null;
  onClose: () => void;
  onCompleted: () => void;
}

const getErrorMessage = (error: any): string => (
  error?.response?.data?.error
  || error?.response?.data?.message
  || 'The selected time could not be reserved. Please choose another available slot.'
);

export const ScheduleAdjustmentModal: React.FC<ScheduleAdjustmentModalProps> = ({
  notification,
  onClose,
  onCompleted,
}) => {
  const { addToast } = useToast();
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [selectedTime, setSelectedTime] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const metadata = notification?.metadata || {};
  const queueId = Number(metadata.reservation_id || notification?.queue_entry_id || 0);
  const barberId = Number(metadata.barber_id || notification?.barber_id || 0);
  const branchId = Number(metadata.branch_id || notification?.branch_id || 0);
  const serviceIds = Array.isArray(metadata.service_ids)
    ? metadata.service_ids.map(Number).filter((id: number) => Number.isInteger(id) && id > 0)
    : [];

  const nextDate = useMemo(() => {
    const scheduled = metadata.scheduled_start_at;
    if (!scheduled) return '';
    return addDaysToIsoDate(getManilaDateIso(new Date(String(scheduled))), 1);
  }, [metadata.scheduled_start_at]);

  useEffect(() => {
    if (!notification) return;
    setAvailableSlots([]);
    setSelectedTime('');
    setLoadError(null);

    if (!queueId || !barberId || !branchId || !nextDate || serviceIds.length === 0) {
      setIsLoading(false);
      setLoadError('This adjustment notice is missing booking details. Please contact the front desk.');
      return;
    }

    let cancelled = false;
    const loadSlots = async () => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({
          barberId: String(barberId),
          branchId: String(branchId),
          date: nextDate,
          serviceIds: serviceIds.join(','),
        });
        const response = await api.get(`/api/queue/availability?${params.toString()}`);
        const slots = Array.isArray(response.data?.availableSlots)
          ? response.data.availableSlots
          : (Array.isArray(response.data) ? response.data : []);
        if (!cancelled) {
          setAvailableSlots(slots.filter((slot: any) => slot?.isAvailable !== false).map((slot: any) => String(slot.hour)));
        }
      } catch (error: any) {
        if (!cancelled) setLoadError(getErrorMessage(error));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void loadSlots();
    return () => {
      cancelled = true;
    };
  }, [notification, queueId, barberId, branchId, nextDate, serviceIds.join(',')]);

  const handleSubmit = async () => {
    if (!selectedTime || !queueId) return;
    setIsSubmitting(true);
    try {
      await api.post(`/api/customers/reservations/${queueId}/reschedule-next-day`, {
        preferredDate: nextDate,
        preferredTime: selectedTime,
      });
      addToast({
        type: 'success',
        title: 'Reservation rescheduled',
        message: `Your appointment was moved to ${nextDate} at ${selectedTime} with the same barber.`,
      });
      onCompleted();
    } catch (error: any) {
      addToast({ type: 'error', title: 'Time unavailable', message: getErrorMessage(error) });
      // A race may have consumed the displayed slot; reload before another attempt.
      setSelectedTime('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={Boolean(notification)}
      onClose={onClose}
      title="Reschedule with the Same Barber"
      size="md"
      footer={(
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button variant="primary" onClick={() => void handleSubmit()} disabled={!selectedTime || isSubmitting || isLoading}>
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm New Time'}
          </Button>
        </>
      )}
    >
      <div className="space-y-5">
        <div className="rounded-lg border border-gold/30 bg-gold/5 p-4 text-sm text-ivory-dim">
          <p className="text-ivory font-semibold">Choose an available time for the next day.</p>
          <p className="mt-1">Your barber and reservation services remain unchanged. Occupied times cannot be selected.</p>
        </div>

        <div className="flex items-center gap-2 text-sm text-ivory">
          <Calendar className="w-4 h-4 text-gold" />
          <span>{nextDate || 'Next day'}</span>
          <Clock className="w-4 h-4 ml-3 text-gold" />
          <span>Same barber</span>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-8 text-ivory-dim text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Checking available times...
          </div>
        )}

        {!isLoading && loadError && (
          <p className="rounded-lg border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-200">{loadError}</p>
        )}

        {!isLoading && !loadError && availableSlots.length === 0 && (
          <p className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-ivory-dim">
            No available times remain with this barber on the next day.
          </p>
        )}

        {!isLoading && availableSlots.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-56 overflow-y-auto pr-1">
            {availableSlots.map((slot) => (
              <button
                key={slot}
                type="button"
                onClick={() => setSelectedTime(slot)}
                className={`rounded-lg border px-3 py-3 text-sm transition-colors ${selectedTime === slot
                  ? 'border-gold bg-gold text-charcoal font-bold'
                  : 'border-white/10 bg-white/5 text-ivory hover:border-gold/50 hover:bg-gold/10'}`}
              >
                {slot}
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ScheduleAdjustmentModal;
