import type { AppointmentRecord } from '@demoshop/shared-types';

export type ReservationDateFilter = 'all' | 'today' | 'week' | 'month' | 'custom';

export function reservationDateRange(date: ReservationDateFilter, customDate: string, today: string): { startDate?: string; endDate?: string } {
  if (date === 'all' || (date === 'custom' && !customDate)) return {};
  if (date === 'custom') return { startDate: customDate, endDate: customDate };
  const start = new Date(`${today}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - (date === 'week' ? 6 : date === 'month' ? 29 : 0));
  return { startDate: start.toISOString().slice(0, 10), endDate: today };
}

export function reservationDate(appointment: AppointmentRecord): string {
  const raw = appointment.scheduled_date || (appointment as AppointmentRecord & { preferred_date?: string }).preferred_date || appointment.scheduled_start_at || '';
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

function scheduleTime(appointment: AppointmentRecord): number {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i.exec(appointment.scheduled_time?.trim() || '');
  if (!match) return 0;
  let hours = Number(match[1]);
  if (match[3]) hours = hours % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0);
  return hours * 60 + Number(match[2]);
}

export function filterReservations(appointments: AppointmentRecord[], filters: {
  query: string;
  date: ReservationDateFilter;
  customDate: string;
  today: string;
  status: string;
  barber: string;
  sort: 'newest' | 'oldest';
}): AppointmentRecord[] {
  const query = filters.query.trim().toLowerCase();
  const days = filters.date === 'week' ? 6 : 29;
  const lowerDate = new Date(`${filters.today}T00:00:00Z`);
  lowerDate.setUTCDate(lowerDate.getUTCDate() - days);
  const lower = lowerDate.toISOString().slice(0, 10);

  return appointments.filter((appointment) => {
    const date = reservationDate(appointment);
    if (filters.status && String(appointment.status).toUpperCase() !== filters.status) return false;
    if (filters.barber && (appointment.barber_name || 'Unassigned') !== filters.barber) return false;
    if (filters.date === 'today' && date !== filters.today) return false;
    if (filters.date === 'custom' && filters.customDate && date !== filters.customDate) return false;
    if (['week', 'month'].includes(filters.date) && (!date || date < lower || date > filters.today)) return false;
    return !query || [appointment.customer_name, appointment.customer_phone, appointment.barber_name, appointment.reference_number, appointment.service_title, appointment.id]
      .some((value) => String(value || '').toLowerCase().includes(query));
  }).sort((a, b) => {
    const comparison = reservationDate(a).localeCompare(reservationDate(b)) || scheduleTime(a) - scheduleTime(b) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
    return filters.sort === 'newest' ? -comparison : comparison;
  });
}
