import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Calendar, Clock, Info, Loader2, UserRound, Shuffle } from 'lucide-react';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/ui/Button';
import { api } from '@/config/api';
import { bookingService } from '@/features/booking/booking.service';
import { useToast } from '@/components/feedback/ToastContext';
import { getManilaDateIso } from '@/utils/manila-date';

interface Props {
  appointment: any | null;
  onClose: () => void;
  onCompleted: () => void;
}

const TIME_PERIODS = [
  { key: 'morning', label: 'Morning', range: 'Before 12:00 PM' },
  { key: 'afternoon', label: 'Afternoon', range: '12:00 PM – 4:59 PM' },
  { key: 'evening', label: 'Evening', range: '5:00 PM onward' },
] as const;

const getSlotMinutes = (slot: string): number => {
  const match = slot.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return Number.NaN;
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const period = match[3]?.toUpperCase();
  if (period === 'PM' && hour < 12) hour += 12;
  if (period === 'AM' && hour === 12) hour = 0;
  return hour * 60 + minute;
};

export const RescheduleAppointmentModal: React.FC<Props> = ({ appointment, onClose, onCompleted }) => {
  const { addToast: notify } = useToast();
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [slots, setSlots] = useState<string[]>([]);
  const [barbers, setBarbers] = useState<any[]>([]);
  const [barberAvailabilityMap, setBarberAvailabilityMap] = useState<Record<string, any>>({});
  const [barberAvailabilityLoading, setBarberAvailabilityLoading] = useState(false);
  const [selectedBarberId, setSelectedBarberId] = useState<number>(0);
  const [barberMode, setBarberMode] = useState<'any' | 'specific'>('any');
  const [pendingBarber, setPendingBarber] = useState<any | null>(null);
  const [upcomingBarber, setUpcomingBarber] = useState<any | null>(null);
  const [upcomingDate, setUpcomingDate] = useState('');
  const [upcomingSlots, setUpcomingSlots] = useState<string[]>([]);
  const [upcomingLoading, setUpcomingLoading] = useState(false);
  const [upcomingReturnSelection, setUpcomingReturnSelection] = useState<{ date: string; time: string } | null>(null);
  const [upcomingSchedule, setUpcomingSchedule] = useState<any | null>(null);
  const [upcomingScheduleLoading, setUpcomingScheduleLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [step, setStepState] = useState<'schedule' | 'barber'>('schedule');
  const [barberModalOpen, setBarberModalOpen] = useState(false);
  const setStep = (nextStep: 'schedule' | 'barber') => {
    setStepState(nextStep);
    setBarberModalOpen(nextStep === 'barber');
  };
  const [selectedTimePeriod, setSelectedTimePeriod] = useState<'morning' | 'afternoon' | 'evening'>('morning');
  const [error, setError] = useState('');

  const queueId = appointment?.queue_entry_id || appointment?.id;
  const barberId = Number(appointment?.barber_id || 0);
  const branchId = Number(appointment?.branch_id || 0);
  const serviceIds = useMemo(() => {
    const fromServices = (appointment?.services || []).map((s: any) => Number(s.service_id ?? s.id)).filter(Boolean);
    if (fromServices.length > 0) return fromServices;
    return (appointment?.service_ids || [appointment?.service_id]).map(Number).filter(Boolean);
  }, [appointment]);
  const minDate = getManilaDateIso(new Date());
  const dateOptions = useMemo(() => Array.from({ length: 14 }, (_, index) => {
    const date = new Date(`${minDate}T12:00:00`);
    date.setDate(date.getDate() + index + 1);
    return date.toISOString().slice(0, 10);
  }), [minDate]);
  const addToast = (toast: any) => {
    if (toast?.title === 'Upcoming availability' && pendingBarber) {
      setUpcomingBarber(pendingBarber);
      setUpcomingDate(dateOptions[0] || '');
      setUpcomingReturnSelection({ date, time });
      setTime('');
      setPendingBarber(null);
      return;
    }
    notify(toast);
  };
  const groupedSlots = useMemo(() => TIME_PERIODS.map((period) => ({
    ...period,
    slots: slots.filter((slot) => {
      const minutes = getSlotMinutes(slot);
      if (period.key === 'morning') return minutes < 12 * 60;
      if (period.key === 'afternoon') return minutes >= 12 * 60 && minutes < 17 * 60;
      return minutes >= 17 * 60;
    }),
  })), [slots]);
  const hasSelectedDate = Boolean(date);
  const barberIdsKey = useMemo(
    () => barbers.map((barber) => Number(barber.id ?? barber.barber_id)).filter(Boolean).sort((a, b) => a - b).join(','),
    [barbers],
  );

  const getBarberAvailabilityFromMap = (barber: any) => {
    const id = Number(barber.id ?? barber.barber_id);
    const availability = barberAvailabilityMap[String(id)];
    const availableSlots = Array.isArray(availability?.availableSlots) ? availability.availableSlots : [];
    const isOnDuty = availability?.isOnDuty ?? barber.isOnDuty ?? barber.isOnDutyToday;
    const isOnlineBookingEnabled = availability?.isOnlineBookingEnabled ?? barber.isOnlineBookingEnabled ?? barber.isOnlineBookingEnabledToday;
    const hasSelectedSlot = Boolean(time);
    const hasSlot = availableSlots.some((slot: any) => String(slot.hour) === String(time));

    const dateLabel = date ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' }).format(new Date(`${date}T12:00:00Z`)) : '';
    if (barberAvailabilityLoading && !availability) return { label: 'Checking availability…', kind: 'loading', selectable: false };
    if (isOnDuty === false) return { label: 'Off on this date', kind: 'off', selectable: false };
    if (isOnlineBookingEnabled === false) return { label: dateLabel ? `Walk-in Only for ${dateLabel}` : 'Walk-in only', kind: 'walkin', selectable: false };
    if (hasSelectedSlot && availability && !hasSlot) return { label: 'Booked at this time', kind: 'busy', selectable: false };
    if (availability) return { label: 'Available', kind: 'available', selectable: true };
    return { label: barber.isAvailable === false ? 'Unavailable' : 'Check availability', kind: 'unknown', selectable: barber.isAvailable !== false };
  };

  useEffect(() => {
    setDate(''); setTime(''); setSlots([]); setLoading(false); setConfirmed(false); setStep('schedule'); setBarberModalOpen(false); setError(''); setSelectedBarberId(barberId); setBarberMode('any'); setPendingBarber(null); setUpcomingBarber(null); setUpcomingDate(''); setUpcomingSlots([]); setUpcomingReturnSelection(null); setUpcomingSchedule(null); setUpcomingScheduleLoading(false);
  }, [appointment]);

  useEffect(() => {
    if (!barberModalOpen && step === 'barber') setStepState('schedule');
  }, [barberModalOpen, step]);

  useEffect(() => {
    if (barberMode !== 'any') return;
    setPendingBarber(null);
    setUpcomingBarber(null);
    setUpcomingDate('');
    setUpcomingSlots([]);
    setUpcomingReturnSelection(null);
  }, [barberMode]);

  useEffect(() => {
    if (!appointment || !branchId) return;
    let cancelled = false;
    api.get(`/api/queue/public/barbers?branchId=${branchId}&date=${date || dateOptions[0]}&includeUnavailable=true`)
      .then((response) => {
        if (!cancelled) setBarbers(Array.isArray(response.data) ? response.data : (response.data?.barbers || []));
      })
      .catch(() => { if (!cancelled) setError('Unable to load available barbers.'); });
    return () => { cancelled = true; };
  }, [appointment, branchId, date, dateOptions]);

  useEffect(() => {
    if (!appointment || !branchId || !date || !barberIdsKey || serviceIds.length === 0) {
      setBarberAvailabilityMap({});
      setBarberAvailabilityLoading(false);
      return;
    }

    const controller = new AbortController();
    setBarberAvailabilityLoading(true);
    bookingService.fetchBatchAvailability(
      branchId,
      date,
      serviceIds,
      barberIdsKey.split(',').map(Number),
      controller.signal,
    ).then((response) => {
      if (!controller.signal.aborted) {
        const nextAvailabilityMap = response.barbers || {};
        setBarberAvailabilityMap(nextAvailabilityMap);
        setBarbers((currentBarbers) => currentBarbers.map((barber) => {
          const availability = nextAvailabilityMap[String(Number(barber.id ?? barber.barber_id))];
          if (!availability) return barber;
          const availableSlots = Array.isArray(availability.availableSlots) ? availability.availableSlots : [];
          const hasSlot = availableSlots.some((slot: any) => String(slot.hour) === String(time));
          const isOnline = availability.isOnDuty !== false && availability.isOnlineBookingEnabled !== false;
          const statusType = availability.isOnDuty === false
            ? 'off_today'
            : availability.isOnlineBookingEnabled === false
              ? 'walkin_only'
              : time && !hasSlot
                ? 'busy_at_time'
                : 'available';
          return { ...barber, isAvailable: isOnline && (!time || hasSlot), statusType };
        }));
      }
    }).catch((error: any) => {
      if (!controller.signal.aborted && error?.code !== 'ERR_CANCELED' && error?.name !== 'CanceledError') {
        setBarberAvailabilityMap({});
      }
    }).finally(() => {
      if (!controller.signal.aborted) setBarberAvailabilityLoading(false);
    });

    return () => controller.abort();
  }, [appointment, branchId, date, barberIdsKey, serviceIds.join(',')]);

  useEffect(() => {
    if (Object.keys(barberAvailabilityMap).length === 0) return;
    setBarbers((currentBarbers) => currentBarbers.map((barber) => {
      const status = getBarberAvailabilityFromMap(barber);
      const statusType = status.kind === 'off'
        ? 'off_today'
        : status.kind === 'walkin'
          ? 'walkin_only'
          : status.kind === 'busy'
            ? 'busy_at_time'
            : 'available';
      return { ...barber, isAvailable: status.selectable, statusType };
    }));
  }, [time, barberAvailabilityMap]);

  useEffect(() => {
    if (!upcomingBarber || !upcomingDate || !branchId || serviceIds.length === 0) {
      setUpcomingSlots([]);
      setUpcomingLoading(false);
      return;
    }

    const controller = new AbortController();
    setUpcomingLoading(true);
    const barberIdForLookup = Number(upcomingBarber.id ?? upcomingBarber.barber_id);
    const params = new URLSearchParams({
      barberId: String(barberIdForLookup),
      branchId: String(branchId),
      date: upcomingDate,
      serviceIds: serviceIds.join(','),
    });
    api.get(`/api/queue/availability?${params.toString()}`, { signal: controller.signal })
      .then((response) => {
        if (!controller.signal.aborted) {
          const nextSlots = Array.isArray(response.data?.availableSlots) ? response.data.availableSlots : [];
          setUpcomingSlots(
            nextSlots
              .filter((slot: any) => slot?.isAvailable !== false)
              .map((slot: any) => String(slot.hour))
              .sort((a: string, b: string) => getSlotMinutes(a) - getSlotMinutes(b)),
          );
        }
      })
      .catch((error: any) => {
        if (!controller.signal.aborted && error?.code !== 'ERR_CANCELED' && error?.name !== 'CanceledError') setUpcomingSlots([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setUpcomingLoading(false);
      });

    return () => controller.abort();
  }, [upcomingBarber, upcomingDate, branchId, serviceIds.join(',')]);

  useEffect(() => {
    if (!upcomingBarber || !dateOptions.length) {
      setUpcomingSchedule(null);
      setUpcomingScheduleLoading(false);
      return;
    }
    const controller = new AbortController();
    setUpcomingScheduleLoading(true);
    const barberIdForLookup = Number(upcomingBarber.id ?? upcomingBarber.barber_id);
    void bookingService.fetchBarberSchedule(
      barberIdForLookup,
      dateOptions[0],
      dateOptions[dateOptions.length - 1],
      controller.signal,
    ).then((schedule) => {
      if (!controller.signal.aborted) setUpcomingSchedule(schedule);
    }).catch(() => {
      if (!controller.signal.aborted) setUpcomingSchedule(null);
    }).finally(() => {
      if (!controller.signal.aborted) setUpcomingScheduleLoading(false);
    });
    return () => controller.abort();
  }, [upcomingBarber, dateOptions]);

  useEffect(() => {
    if (upcomingBarber || !upcomingReturnSelection) return;
    if (date === upcomingReturnSelection.date && !time) {
      setDate(upcomingReturnSelection.date);
      setTime(upcomingReturnSelection.time);
    }
    setUpcomingReturnSelection(null);
  }, [upcomingBarber, upcomingReturnSelection, date, time]);

  const upcomingDateDotClass = (isoDate: string) => {
    if (upcomingScheduleLoading) return 'bg-amber-400';
    const detail = upcomingSchedule?.dateDetails?.[isoDate];
    if (upcomingSchedule?.offDutyDates?.includes(isoDate) || detail?.isOnDuty === false || detail?.isOff) return 'bg-amber-400';
    if (detail?.isOnlineBookingEnabled === false) return 'bg-amber-400';
    if (detail?.isOnlineBookingEnabled === true || upcomingSchedule?.onlineBookingDates?.includes(isoDate)) return 'bg-emerald-400';
    return 'bg-amber-400';
  };

  const isUpcomingDateBookable = (isoDate: string) => {
    if (upcomingScheduleLoading) return false;
    const detail = upcomingSchedule?.dateDetails?.[isoDate];
    if (upcomingSchedule?.offDutyDates?.includes(isoDate) || detail?.isOnDuty === false || detail?.isOff) return false;
    if (detail?.isOnlineBookingEnabled === false) return false;
    return detail?.isOnlineBookingEnabled === true || upcomingSchedule?.onlineBookingDates?.includes(isoDate) === true;
  };

  useEffect(() => {
    if (!upcomingBarber || upcomingScheduleLoading || !upcomingSchedule) return;
    if (isUpcomingDateBookable(upcomingDate)) return;
    const firstBookableDate = dateOptions.find(isUpcomingDateBookable);
    if (firstBookableDate && firstBookableDate !== upcomingDate) {
      setUpcomingDate(firstBookableDate);
      setUpcomingSlots([]);
      setTime('');
    }
  }, [upcomingBarber, upcomingScheduleLoading, upcomingSchedule, upcomingDate, dateOptions]);

  useEffect(() => {
    if (!appointment || !date || !selectedBarberId || !branchId || serviceIds.length === 0) return;
    let cancelled = false;
    setLoading(true); setError('');
    api.get(`/api/queue/availability?barberId=${selectedBarberId}&branchId=${branchId}&date=${date}&serviceIds=${serviceIds.join(',')}`)
      .then((response) => {
        if (!cancelled) setSlots((response.data?.availableSlots || []).filter((s: any) => s?.isAvailable !== false).map((s: any) => String(s.hour)));
      })
      .catch((e) => { if (!cancelled) setError(e?.response?.data?.error || 'Unable to load available times.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [appointment, date, selectedBarberId, branchId, serviceIds.join(',')]);

  const submit = async () => {
    if (!queueId || !date || !time || (barberMode === 'specific' && !selectedBarberId)) return;
    setSubmitting(true);
    try {
      await api.post(`/api/appointments/${queueId}/reschedule`, {
        new_scheduled_date: date,
        new_scheduled_time: time,
        barber_id: barberMode === 'specific' ? selectedBarberId : undefined,
      });
      localStorage.setItem(`appointment-rescheduled:${queueId}`, '1');
      addToast({ type: 'success', title: 'Appointment rescheduled', message: 'Your ₱50 reservation fee remains applied to the new slot.' });
      onCompleted();
    } catch (e: any) {
      addToast({ type: 'error', title: 'Rescheduling failed', message: e?.response?.data?.error || 'That time is no longer available.' });
      setConfirmed(false);
    } finally { setSubmitting(false); }
  };

  const proceedToBarber = () => {
    if (!date || !time) {
      addToast({ type: 'info', title: 'Select a time first', message: 'Choose an available time slot before selecting a barber.' });
      return;
    }
    setStep('barber');
  };

  const getBarberAvailability = (barber: any) => {
    const id = Number(barber.id ?? barber.barber_id);
    const availability = barberAvailabilityMap[String(id)];
    const availableSlots = Array.isArray(availability?.availableSlots) ? availability.availableSlots : [];
    const isOnDuty = availability?.isOnDuty ?? barber.isOnDuty ?? barber.isOnDutyToday;
    const isOnlineBookingEnabled = availability?.isOnlineBookingEnabled ?? barber.isOnlineBookingEnabled ?? barber.isOnlineBookingEnabledToday;
    const hasSelectedSlot = Boolean(time);
    const hasSlot = availableSlots.some((slot: any) => String(slot.hour) === String(time));

    const dateLabel = date ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' }).format(new Date(`${date}T12:00:00Z`)) : '';
    if (barberAvailabilityLoading && !availability) return { label: 'Checking availability…', kind: 'loading', selectable: false };
    if (isOnDuty === false) return { label: 'Off on this date', kind: 'off', selectable: false };
    if (isOnlineBookingEnabled === false) return { label: dateLabel ? `Walk-in Only for ${dateLabel}` : 'Walk-in only', kind: 'walkin', selectable: false };
    if (hasSelectedSlot && availability && !hasSlot) return { label: 'Booked at this time', kind: 'busy', selectable: false };
    if (availability) return { label: 'Available', kind: 'available', selectable: true };
    return { label: barber.isAvailable === false ? 'Unavailable' : 'Check availability', kind: 'unknown', selectable: barber.isAvailable !== false };
  };

  return <Modal isOpen={Boolean(appointment)} onClose={onClose} title={confirmed ? 'Confirm reschedule' : upcomingBarber ? 'Upcoming availability' : barberModalOpen ? 'Choose Your Barber' : 'Reschedule booking'} size="lg" bodyClassName={confirmed ? 'min-h-0' : 'h-[580px] sm:h-[620px]'} footer={confirmed ? <><Button variant="outline" onClick={() => setConfirmed(false)} disabled={submitting}>Back</Button><Button variant="primary" onClick={submit} disabled={submitting}>{submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm Reschedule'}</Button></> : barberModalOpen ? <div className="flex flex-col-reverse sm:flex-row gap-2 w-full sm:justify-end">{upcomingBarber ? <><Button variant="outline" onClick={() => { setUpcomingBarber(null); setUpcomingSlots([]); setUpcomingDate(''); }} className="w-full sm:w-auto px-3 py-2 text-xs sm:px-4 sm:py-2 sm:text-sm">Back to barbers</Button><Button variant="primary" onClick={() => setConfirmed(true)} disabled={!date || !time || !selectedBarberId} className="w-full sm:w-auto px-3 py-2 text-xs sm:px-4 sm:py-2 sm:text-sm">Confirm new time</Button></> : <><Button variant="outline" onClick={() => setStep('schedule')} className="w-full sm:w-auto px-2 py-1.5 text-xs sm:px-4 sm:py-2 sm:text-sm">Back to date and time</Button><Button variant="primary" onClick={() => setConfirmed(true)} disabled={!date || !time || !selectedBarberId} className="w-full sm:w-auto px-2 py-1.5 text-xs sm:px-4 sm:py-2 sm:text-sm">Confirm new time</Button></>}</div> : null}>
    {!confirmed ? <div className={barberModalOpen ? 'hidden' : 'space-y-5'}>
      <div className="flex items-center gap-2 border-b border-white/10 pb-3 text-[10px] uppercase tracking-widest"><span className="rounded-full bg-gold px-2 py-1 font-bold text-charcoal">1</span><span className="text-gold">Date &amp; time</span><span className="h-px flex-1 bg-white/10" /><span className="rounded-full border border-white/20 px-2 py-1 text-ivory-dim">2</span><span className="text-ivory-dim">Barber</span><span className="h-px flex-1 bg-white/10" /><span className="rounded-full border border-white/20 px-2 py-1 text-ivory-dim">3</span><span className="text-ivory-dim">Confirm</span></div>
      {step === 'barber' && <button type="button" onClick={() => setStep('schedule')} className="inline-flex items-center gap-2 text-sm text-ivory-dim hover:text-gold"><ArrowLeft className="w-4 h-4" /> Back to date and time</button>}
      <p className="text-sm text-ivory-dim">Services and barber can stay the same. Pick a new date, time, or barber.</p>
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 flex items-center justify-between gap-3"><div><p className="font-semibold text-ivory">{appointment?.service_name || 'Haircut'}</p><p className="text-sm text-ivory-dim">with {appointment?.barber_name || 'your barber'} · ₱50 deposit paid</p></div><div className="text-right text-sm text-gold"><Calendar className="inline w-4 h-4 mr-1" />{appointment?.date || appointment?.preferred_date || appointment?.appointment_date}<br />{appointment?.time || appointment?.preferred_time || appointment?.appointment_time}</div></div>
      <div><p className="text-sm text-ivory-dim mb-2">Pick a new date</p><div className="grid grid-cols-3 sm:grid-cols-7 gap-2">{dateOptions.map((option) => { const d = new Date(`${option}T12:00:00`); return <button key={option} type="button" onClick={() => { setDate(option); setTime(''); setSlots([]); setLoading(true); setError(''); setSelectedTimePeriod('morning'); }} className={`rounded-lg border p-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 ${date === option ? 'border-gold bg-gold/10 text-gold' : 'border-white/10 text-ivory hover:border-gold/60 hover:bg-gold/10 active:border-gold active:bg-gold/20'}`}><span className="block text-xs">{d.toLocaleDateString('en-US', { weekday: 'short' })}</span><strong>{d.getDate()}</strong></button>; })}</div></div>
      <div className="hidden" style={{ display: step === 'barber' ? undefined : 'none' }}><p className="text-sm text-ivory-dim mb-2">Choose a barber</p><div className="grid grid-cols-1 sm:grid-cols-2 gap-2"><button type="button" onClick={() => { setBarberMode('any'); setSelectedBarberId(barberId); setTime(''); }} className={`rounded-lg border p-3 flex items-center gap-3 text-left ${selectedBarberId === barberId ? 'border-gold bg-gold/10' : 'border-white/10'}`}><Shuffle className="w-5 h-5 text-gold" /><span><strong className="block text-ivory">Any Available Barber</strong><small className="text-ivory-dim">Fastest available match</small></span></button>{barbers.filter((b) => Number(b.id ?? b.barber_id) !== barberId).map((barber) => { const id = Number(barber.id ?? barber.barber_id); return <button key={id} type="button" onClick={() => { setBarberMode('specific'); setSelectedBarberId(id); setTime(''); }} className={`rounded-lg border p-3 flex items-center gap-3 text-left ${selectedBarberId === id ? 'border-gold bg-gold/10' : 'border-white/10'}`}><UserRound className="w-5 h-5 text-gold" /><span><strong className="block text-ivory">{barber.name}</strong><small className="text-ivory-dim">Check availability</small></span></button>; })}</div></div>
        <div className="hidden"><p className="text-sm text-ivory-dim mb-2 flex items-center gap-2"><Clock className="w-4 h-4 text-gold" /> Available times</p>{!date ? <p className="text-sm text-ivory-dim">Pick a date to see open times.</p> : loading ? <p className="text-sm text-ivory-dim">Loading available times…</p> : <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{slots.map((slot) => <button key={slot} type="button" onClick={() => setTime(slot)} className={`rounded-lg border px-3 py-2 text-sm ${time === slot ? 'border-gold bg-gold text-charcoal font-semibold' : 'border-white/10 text-ivory'}`}>{slot}</button>)}</div>}</div>
        {hasSelectedDate && loading && <div className="min-h-[132px] rounded-lg border border-white/10 bg-white/[0.02] flex items-center justify-center text-sm text-ivory-dim"><Loader2 className="w-4 h-4 mr-2 animate-spin text-gold" />Loading available times…</div>}
        {hasSelectedDate && !loading && slots.length > 0 && <div className="space-y-3"><p className="text-sm text-ivory-dim flex items-center gap-2"><Clock className="w-4 h-4 text-gold" /> Time of day</p><div className="grid grid-cols-3 gap-2">{TIME_PERIODS.map((period) => <button key={period.key} type="button" onClick={() => setSelectedTimePeriod(period.key)} className={`rounded-lg border px-2 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 ${selectedTimePeriod === period.key ? 'border-gold bg-gold/15 text-ivory' : 'border-white/10 bg-charcoal/40 text-ivory-dim hover:border-gold/60 hover:bg-gold/10 active:border-gold active:bg-gold/20'}`}><span className="block text-xs font-semibold">{period.label}</span><span className="block text-[10px] opacity-70">{period.range}</span></button>)}</div><div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{(groupedSlots.find((period) => period.key === selectedTimePeriod)?.slots ?? []).map((slot) => <button key={slot} type="button" onClick={() => setTime(slot)} className={`rounded-lg border px-3 py-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 ${time === slot ? 'border-gold bg-gold text-charcoal font-semibold' : 'border-white/10 text-ivory hover:border-gold/60 hover:bg-gold/10 active:border-gold active:bg-gold/20'}`}>{slot}</button>)}</div></div>}
        {step === 'barber' && <div className="space-y-4"><div className="border-t border-white/10 pt-4"><p className="text-xs uppercase tracking-widest text-gold mb-1">Choose a barber</p><p className="text-xs text-ivory-dim">Select any available barber or check a specific barber's availability.</p></div><div className="grid grid-cols-1 sm:grid-cols-2 gap-2"><button type="button" onClick={() => { setBarberMode('any'); setSelectedBarberId(barberId); }} className={`rounded-lg border p-3 flex items-center gap-3 text-left transition ${barberMode === 'any' ? 'border-gold bg-gold/10' : 'border-white/10 hover:border-gold/50'}`}><Shuffle className="w-5 h-5 text-gold shrink-0" /><span><strong className="block text-ivory">Any Available Barber</strong><small className="text-ivory-dim">Fastest available match</small></span></button><button type="button" onClick={() => setBarberMode('specific')} className={`rounded-lg border p-3 flex items-center gap-3 text-left transition ${barberMode === 'specific' ? 'border-gold bg-gold/10' : 'border-white/10 hover:border-gold/50'}`}><UserRound className="w-5 h-5 text-gold shrink-0" /><span><strong className="block text-ivory">Request a specific barber</strong><small className="text-ivory-dim">Check their availability</small></span></button></div>{barberMode === 'specific' && <div className="space-y-3"><p className="text-xs text-ivory-dim">Available barbers can be selected. Walk-in-only and currently booked barbers remain clickable so you can check their upcoming appointment availability.</p><div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{barbers.map((barber) => { const id = Number(barber.id ?? barber.barber_id); const isSelected = selectedBarberId === id; const unavailable = barber.statusType === 'walkin_only' || barber.statusType === 'busy_at_time' || barber.isAvailable === false; return <button key={id} type="button" onClick={() => unavailable ? setPendingBarber(barber) : (setSelectedBarberId(id), setTime(time))} className={`rounded-lg border p-3 text-left transition ${isSelected ? 'border-gold bg-gold/10' : 'border-white/10 hover:border-gold/50'}`}><div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2"><UserRound className="w-4 h-4 text-gold" /><strong className="text-sm text-ivory">{barber.name || 'Barber'}</strong></span><span className={`text-[10px] rounded-full px-2 py-0.5 ${unavailable ? 'text-gold border border-gold/40' : 'text-emerald-300 border border-emerald-400/40'}`}>{unavailable ? (barber.statusType === 'busy_at_time' ? 'Booked' : 'Walk-in only') : 'Available'}</span></div><small className="block mt-1 text-ivory-dim">{unavailable ? 'See available dates' : 'Check availability'}</small></button>; })}</div></div>}{pendingBarber && <div className="rounded-lg border border-gold/40 bg-gold/5 p-3 space-y-3"><p className="text-sm text-ivory"><strong className="text-gold">{pendingBarber.name}</strong> isn't available for online booking on this date.</p><p className="text-xs text-ivory-dim">Would you like to check their upcoming dates and times? Availability will be confirmed for the date you choose.</p><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setPendingBarber(null)}>Choose another barber</Button><Button variant="primary" onClick={() => { setPendingBarber(null); addToast({ type: 'info', title: 'Upcoming availability', message: 'Choose another date to check this barber\'s upcoming schedule.' }); }}>See available dates</Button></div></div>}</div>}
        <div className="hidden">{date && !loading && slots.length > 0 && <div className="space-y-3"><p className="text-sm text-ivory-dim flex items-center gap-2"><Clock className="w-4 h-4 text-gold" /> Time of day</p>{groupedSlots.map((period) => period.slots.length > 0 && <section key={period.key}><div className="flex items-center justify-between mb-1"><span className="text-xs font-bold uppercase tracking-wider text-gold">{period.label}</span><span className="text-[10px] text-ivory-dim">{period.range}</span></div><div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{period.slots.map((slot) => <button key={slot} type="button" onClick={() => setTime(slot)} className={`rounded-lg border px-3 py-2 text-sm ${time === slot ? 'border-gold bg-gold text-charcoal font-semibold' : 'border-white/10 text-ivory'}`}>{slot}</button>)}</div></section>)}</div>}</div>
      <div className="hidden">
      </div><div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 flex gap-3 text-sm text-ivory-dim"><Info className="w-5 h-5 text-gold shrink-0" />Your ₱50 deposit carries over, so there’s nothing to pay. Rescheduling is available once.</div>
      {error && <p className="text-sm text-red-300">{error}</p>}
      {hasSelectedDate && !loading && !error && slots.length === 0 && <p className="text-sm text-amber-300">No available times for this date and barber.</p>}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-3 border-t border-white/10"><div className="min-w-0"><p className="text-xs text-ivory-dim">New appointment</p><strong className="text-sm text-ivory break-words">{date && time ? `${date} · ${time}` : 'Select a date and time'}</strong></div><div className="grid grid-cols-2 sm:flex gap-2 w-full sm:w-auto"><Button variant="outline" onClick={onClose} className="w-full sm:w-auto min-w-0 whitespace-normal px-2 py-1.5 text-xs sm:px-4 sm:py-2 sm:text-sm">Keep current time</Button><Button variant="primary" onClick={step === 'schedule' ? proceedToBarber : () => setConfirmed(true)} disabled={step === 'barber' && (!date || !time || !selectedBarberId)} className="w-full sm:w-auto min-w-0 whitespace-normal px-2 py-1.5 text-xs sm:px-4 sm:py-2 sm:text-sm">{step === 'schedule' ? 'Choose barber' : 'Confirm new time'}</Button></div></div>
    </div> : <div className="space-y-4 text-sm"><p className="text-ivory">You are moving your appointment from <strong>{appointment?.date || appointment?.preferred_date} at {appointment?.time || appointment?.preferred_time}</strong> to <strong>{date} at {time}</strong>.</p><p className="text-gold">Your ₱50 reservation deposit remains applied. No additional reservation fee will be charged.</p></div>}
  {barberModalOpen && !confirmed && !upcomingBarber && <div className="space-y-5">
    <div className="flex items-center justify-between gap-3"><div><button type="button" onClick={() => setStep('schedule')} className="inline-flex items-center gap-2 text-sm text-ivory-dim hover:text-gold"><ArrowLeft className="w-4 h-4" /> Back to date and time</button><h4 className="mt-4 text-2xl sm:text-3xl font-serif font-bold text-ivory">Choose your barber</h4></div><span className="text-xs text-ivory-dim">Step 2 of 3</span></div>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm"><span className="flex items-center gap-2 text-gold"><Calendar className="w-4 h-4" />{date} · {time}</span><span className="text-ivory-dim">{appointment?.service_name || 'Hair cut'} · ₱50 deposit paid</span></div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><button type="button" onClick={() => { setBarberMode('any'); setSelectedBarberId(barberId); }} className={`rounded-xl border p-4 text-left transition ${barberMode === 'any' ? 'border-gold bg-gold/10' : 'border-white/10 hover:border-gold/50'}`}><span className="flex items-center gap-3"><Shuffle className="w-5 h-5 text-gold" /><span><strong className="block text-ivory">Any available barber</strong><small className="text-ivory-dim">Fastest match</small></span></span></button><button type="button" onClick={() => setBarberMode('specific')} className={`rounded-xl border p-4 text-left transition ${barberMode === 'specific' ? 'border-gold bg-gold/10' : 'border-white/10 hover:border-gold/50'}`}><span className="flex items-center gap-3"><UserRound className="w-5 h-5 text-gold" /><span><strong className="block text-ivory">Choose a barber</strong><small className="text-ivory-dim">See who is free</small></span></span></button></div>
    {barberMode === 'specific' && <div className="space-y-3"><p className="text-xs text-ivory-dim">Available barbers can be selected. Walk-in-only and currently booked barbers remain clickable so you can check their upcoming availability.</p><div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{barbers.map((barber) => { const id = Number(barber.id ?? barber.barber_id); const availability = getBarberAvailabilityFromMap(barber); const unavailable = !availability.selectable; const isCurrent = id === barberId; const initials = String(barber.name || 'Barber').split(/\s+/).map((part: string) => part[0]).join('').slice(0, 2).toUpperCase(); return <button key={id} type="button" onClick={() => unavailable ? setPendingBarber(barber) : setSelectedBarberId(id)} className={`rounded-xl border p-3 text-left transition ${selectedBarberId === id ? 'border-gold bg-gold/10' : 'border-white/10 hover:border-gold/50'} ${unavailable ? 'opacity-70' : ''}`}><div className="flex items-center gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold/15 font-semibold text-gold">{initials}</span><span className="min-w-0 flex-1"><strong className="block truncate text-ivory">{barber.name || 'Barber'}</strong><small className="block text-ivory-dim">★ 4.8 · {barber.experience_years || (id % 5 + 3)} yrs{isCurrent ? ' · Current' : ''}</small></span><span className={`rounded-full border px-2 py-0.5 text-[10px] ${unavailable ? 'border-amber-400/50 text-amber-300' : 'border-emerald-400/50 text-emerald-300'}`}>{availability.label}</span></div><span className="mt-2 block text-right text-xs text-ivory-dim">⌁ Check availability</span></button>; })}</div></div>}
    {pendingBarber && <div className="rounded-xl border border-amber-400/40 bg-amber-500/5 p-4 text-sm text-amber-100"><p><strong>{pendingBarber.name}</strong> is walk-in-only or unavailable at this time.</p><button type="button" onClick={() => { setPendingBarber(null); addToast({ type: 'info', title: 'Upcoming availability', message: 'Choose another date to check this barber\'s online schedule.' }); }} className="mt-2 underline underline-offset-4">See upcoming availability</button></div>}
  </div>}
  {!confirmed && upcomingBarber && <div className="space-y-6">
    <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
      <div><p className="text-xs uppercase tracking-[0.2em] text-gold font-bold">Upcoming availability</p><p className="text-sm text-ivory-dim mt-1">{upcomingBarber.name} · choose a date and time</p></div>
      <Button variant="outline" onClick={() => setUpcomingBarber(null)} className="shrink-0 px-3 py-2 text-xs">Back to barbers</Button>
    </div>
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.2em] text-gold font-bold">1. Select date</p><p className="text-xs text-ivory-dim mt-1">Choose your preferred appointment day</p><div className="mt-2 space-y-1 text-[10px] text-ivory-dim"><p className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-400" />Reservation</p><p className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-amber-400" />Walk-in rotation</p></div></div><span className="text-xl font-serif font-bold text-ivory">{new Date(`${dateOptions[0]}T12:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span></div>
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">{dateOptions.map((option) => { const optionDate = new Date(`${option}T12:00:00`); const selected = upcomingDate === option; const bookable = isUpcomingDateBookable(option); return <button key={option} type="button" disabled={!bookable} onClick={() => { setUpcomingDate(option); setUpcomingSlots([]); setTime(''); }} className={`relative rounded-sm border p-3 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 ${!bookable ? 'border-white/5 bg-black/20 text-ivory-dim/50 cursor-not-allowed' : selected ? 'border-gold bg-gold text-charcoal shadow-[0_0_20px_rgba(212,175,55,0.3)]' : 'border-white/10 text-ivory hover:border-gold/50 hover:bg-white/[0.05]'}`}><span className={`absolute right-2 top-2 h-2 w-2 rounded-full ${upcomingDateDotClass(option)}`} /><span className="block text-xs uppercase">{optionDate.toLocaleDateString('en-US', { weekday: 'short' })}</span><strong className="block text-xl font-serif">{optionDate.getDate()}</strong></button>; })}</div>
    </div>
    <div className="space-y-4 border-t border-white/10 pt-6"><div><p className="text-xs uppercase tracking-[0.2em] text-gold font-bold">2. Select time slot</p><p className="text-xs text-ivory-dim mt-1">Available slots for {upcomingDate}</p></div>{upcomingLoading ? <div className="min-h-[132px] rounded-lg border border-white/10 bg-white/[0.02] flex items-center justify-center text-sm text-ivory-dim"><Loader2 className="w-4 h-4 mr-2 animate-spin text-gold" />Checking availability...</div> : upcomingSlots.length > 0 ? <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{upcomingSlots.map((slot) => <button key={slot} type="button" onClick={() => { setDate(upcomingDate); setTime(slot); setSelectedBarberId(Number(upcomingBarber.id ?? upcomingBarber.barber_id)); setBarberMode('specific'); setUpcomingBarber(null); }} className="rounded-sm border border-white/10 px-3 py-2.5 text-sm text-ivory transition hover:border-gold/60 hover:bg-gold/10 active:border-gold active:bg-gold/20">{slot}</button>)}</div> : <p className="rounded-lg border border-white/10 p-4 text-sm text-ivory-dim">No available times for this barber on this date.</p>}</div>
  </div>}
  {barberModalOpen && false && (
    <div className="space-y-5"><button type="button" onClick={() => setBarberModalOpen(false)} className="inline-flex items-center gap-2 text-sm text-ivory-dim hover:text-gold"><ArrowLeft className="w-4 h-4" /> Back to date and time</button><p className="text-sm text-ivory-dim">Services and barber can stay the same. Pick a new barber for your selected date and time.</p><div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 flex items-center justify-between gap-3"><div><p className="font-semibold text-ivory">{appointment?.service_name || 'Haircut'}</p><p className="text-sm text-ivory-dim">{date} at {time} · ₱50 deposit paid</p></div><Calendar className="w-5 h-5 text-gold" /></div><div><p className="text-xs uppercase tracking-widest text-gold mb-2">Choose a barber</p><div className="grid grid-cols-1 sm:grid-cols-2 gap-2"><button type="button" onClick={() => { setBarberMode('any'); setSelectedBarberId(barberId); }} className={`rounded-lg border p-3 flex items-center gap-3 text-left transition ${barberMode === 'any' ? 'border-gold bg-gold/10' : 'border-white/10 hover:border-gold/50'}`}><Shuffle className="w-5 h-5 text-gold shrink-0" /><span><strong className="block text-ivory">Any Available Barber</strong><small className="text-ivory-dim">Fastest available match</small></span></button><button type="button" onClick={() => setBarberMode('specific')} className={`rounded-lg border p-3 flex items-center gap-3 text-left transition ${barberMode === 'specific' ? 'border-gold bg-gold/10' : 'border-white/10 hover:border-gold/50'}`}><UserRound className="w-5 h-5 text-gold shrink-0" /><span><strong className="block text-ivory">Request a specific barber</strong><small className="text-ivory-dim">Check their availability</small></span></button></div></div>{barberMode === 'specific' && <div className="space-y-3"><p className="text-xs text-ivory-dim">Available barbers can be selected. Walk-in-only and currently booked barbers remain clickable so you can check their upcoming availability.</p><div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{barbers.map((barber) => { const id = Number(barber.id ?? barber.barber_id); const unavailable = barber.statusType === 'walkin_only' || barber.statusType === 'busy_at_time' || barber.isAvailable === false; return <button key={id} type="button" onClick={() => unavailable ? setPendingBarber(barber) : setSelectedBarberId(id)} className={`rounded-lg border p-3 text-left transition ${selectedBarberId === id ? 'border-gold bg-gold/10' : 'border-white/10 hover:border-gold/50'}`}><div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2"><UserRound className="w-4 h-4 text-gold" /><strong className="text-sm text-ivory">{barber.name || 'Barber'}</strong></span><span className={`text-[10px] rounded-full px-2 py-0.5 ${unavailable ? 'text-gold border border-gold/40' : 'text-emerald-300 border border-emerald-400/40'}`}>{unavailable ? 'Check dates' : 'Available'}</span></div><small className="block mt-1 text-ivory-dim">{unavailable ? 'See available dates' : 'Check availability'}</small></button>; })}</div></div>}{pendingBarber && <div className="rounded-lg border border-gold/40 bg-gold/5 p-3 space-y-3"><p className="text-sm text-ivory"><strong className="text-gold">{pendingBarber.name}</strong> is not available for online booking on this date.</p><p className="text-xs text-ivory-dim">Would you like to check their upcoming dates and times?</p><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setPendingBarber(null)}>Choose another barber</Button><Button variant="primary" onClick={() => { setPendingBarber(null); addToast({ type: 'info', title: 'Upcoming availability', message: 'Choose another date to check this barber\'s upcoming schedule.' }); }}>See available dates</Button></div></div>}</div>
  )}
  </Modal>;
};
