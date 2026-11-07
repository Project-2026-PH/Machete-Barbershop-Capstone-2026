import React, { useMemo, useState } from 'react';
import { DatePicker } from '@/components/ui/DatePicker';
import { useNavigate } from 'react-router';
import { CalendarDays, Clock, ArrowUpRight } from 'lucide-react';
import { getManilaDateIso, addDaysToIsoDate, timeToMinutes } from '@/utils/manila-date';
import type { ReservationInfo, BarberInfo } from '../queue/types';

interface TodaysReservationsSectionProps {
  reservations: ReservationInfo[];
  barbers: BarberInfo[];
  loading?: boolean;
}

const formatDisplayDate = (dateStr: string | null | undefined, timeStr: string | null | undefined, today: string, tomorrow: string) => {
  const time = timeStr || '';
  if (!dateStr) return time || 'Scheduled';

  const cleanDate = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr.slice(0, 10);
  if (cleanDate === today) {
    return time ? `Today · ${time}` : 'Today';
  }
  if (cleanDate === tomorrow) {
    return time ? `Tomorrow · ${time}` : 'Tomorrow';
  }

  try {
    const parts = cleanDate.split('-');
    if (parts.length === 3) {
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      const formatted = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric' }).format(d);
      return time ? `${formatted} · ${time}` : formatted;
    }
  } catch {}

  return time ? `${cleanDate} · ${time}` : cleanDate;
};

export const TodaysReservationsSection: React.FC<TodaysReservationsSectionProps> = ({
  reservations,
  barbers,
  loading = false,
}) => {
  const navigate = useNavigate();
  const [reservationDate, setReservationDate] = useState('');

  // Active reservations: prioritize today, followed by upcoming scheduled appointments
  const activeReservations = useMemo(() => {
    const today = getManilaDateIso();
    const tomorrow = addDaysToIsoDate(today, 1);

    return reservations
      .filter((r) => {
        // Filter out cancellations and terminal records
        const s = (r.status || '').toLowerCase();
        const isActiveStatus = s === 'pending' || s === 'accepted' || s === 'confirmed' || s === 'late';
        if (!isActiveStatus) return false;

        // Normalize date
        const rDate = r.date ? (r.date.includes('T') ? r.date.split('T')[0] : r.date.slice(0, 10)) : null;

        // Omit past dates older than today
        if (rDate && rDate < today) return false;
        if (reservationDate && rDate !== reservationDate) return false;

        return true;
      })
      .sort((a, b) => {
        const dateA = a.date ? (a.date.includes('T') ? a.date.split('T')[0] : a.date.slice(0, 10)) : '9999-12-31';
        const dateB = b.date ? (b.date.includes('T') ? b.date.split('T')[0] : b.date.slice(0, 10)) : '9999-12-31';

        const dateDiff = dateA.localeCompare(dateB);
        if (dateDiff !== 0) return dateDiff;

        return timeToMinutes(a.time || '') - timeToMinutes(b.time || '');
      });
  }, [reservations, reservationDate]);

  const today = useMemo(() => getManilaDateIso(), []);
  const tomorrow = useMemo(() => addDaysToIsoDate(today, 1), [today]);

  const getBarberName = (barberId: string) => {
    const b = barbers.find((item) => String(item.id) === String(barberId));
    return b?.name || 'Any Barber';
  };

  const getStatusBadge = (status: string) => {
    const s = (status || '').toLowerCase();
    switch (s) {
      case 'accepted':
      case 'confirmed':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-500/15 text-sky-400 border border-sky-500/30">
            Confirmed
          </span>
        );
      case 'late':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            Late
          </span>
        );
      case 'pending':
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gold/15 text-gold border border-gold/30">
            Pending
          </span>
        );
    }
  };

  return (
    <section
      aria-labelledby="upcoming-reservations-heading"
      className="rounded-sm border border-white/10 bg-white/5 p-4 sm:p-5 card-gold-accent flex flex-col gap-3.5 h-full"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/5 pb-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-gold shrink-0" />
          <div>
            <div className="flex items-center gap-2">
              <h2
                id="upcoming-reservations-heading"
                className="text-xs font-bold uppercase tracking-widest text-gold"
              >
                Upcoming Reservations
              </h2>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-semibold bg-white/10 text-ivory">
                {activeReservations.length}
              </span>
            </div>
            <p className="text-[11px] text-ivory-dim mt-0.5">Scheduled appointments & bookings</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate('/cashier/queue')}
          className="group inline-flex items-center gap-1 text-xs text-ivory-dim hover:text-gold transition-colors py-1 px-2.5 rounded-sm border border-white/10 hover:border-gold/30 bg-charcoal/50 cursor-pointer"
          title="Open Reservations Table & Booking Board"
        >
          <span>View All</span>
          <ArrowUpRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </button>
      </div>

      <DatePicker value={reservationDate} onChange={setReservationDate} className="w-full" />

      {/* List of Active Reservations */}
      {loading && activeReservations.length === 0 ? (
        <div className="py-8 text-center text-xs text-ivory-dim animate-pulse">
          Loading reservations…
        </div>
      ) : activeReservations.length === 0 ? (
        <div className="py-8 text-center text-xs text-ivory-dim italic border border-dashed border-white/5 rounded-sm bg-white/[0.01]">
          {reservationDate ? 'No upcoming appointments on this date.' : 'No upcoming appointments scheduled.'}
        </div>
      ) : (
        <div className="space-y-2.5 max-h-[22rem] overflow-y-auto custom-scrollbar pr-1">
          {activeReservations.map((reservation) => {
            const barberName = getBarberName(reservation.barberId);
            const dateLabel = formatDisplayDate(reservation.date, reservation.time, today, tomorrow);
            const isToday = reservation.date ? (reservation.date.includes('T') ? reservation.date.split('T')[0] : reservation.date.slice(0, 10)) === today : false;

            return (
              <div
                key={reservation.id}
                className="p-3 rounded-sm border border-white/5 bg-charcoal/40 hover:bg-white/[0.02] hover:border-white/10 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="min-w-0 pr-2">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-ivory truncate">{reservation.name || 'Customer'}</p>
                    {getStatusBadge(reservation.status)}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-ivory-dim mt-1">
                    <span className="text-ivory-dim truncate">{reservation.service}</span>
                    <span>·</span>
                    <span className="text-gold truncate">Barber: {barberName}</span>
                  </div>
                </div>

                <div className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-sm border shrink-0 self-start sm:self-auto ${
                  isToday 
                    ? 'bg-gold/10 text-gold border-gold/30' 
                    : 'bg-charcoal/80 text-ivory border-white/10'
                }`}>
                  <Clock className={`w-3.5 h-3.5 ${isToday ? 'text-gold' : 'text-ivory-dim'}`} />
                  <span>{dateLabel}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default TodaysReservationsSection;
