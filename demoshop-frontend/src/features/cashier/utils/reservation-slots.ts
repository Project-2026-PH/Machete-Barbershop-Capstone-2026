/**
 * Pure functions and utilities for calculating reservation slot availability.
 * UI-free and network-free for deterministic unit testing.
 */

export const DEFAULT_DURATION_MIN = 30;
export const DEFAULT_OPEN_TIME = '09:00';
export const DEFAULT_CLOSE_TIME = '20:00';
export const DEFAULT_BOOKING_BUFFER_MINUTES = 0;
export const SLOT_INTERVAL_MINUTES = 15;

export interface SlotBarber {
  id: string | number;
  name: string;
  is_active?: boolean;
}

export interface SlotBookingEntry {
  barberId?: string | number | null;
  barber_id?: string | number | null;
  date?: string | null;
  scheduledDate?: string | null;
  reservation_date?: string | null;
  preferredDate?: string | null;
  preferredTime?: string | null;
  estMinutes?: number | null;
  time?: string | null;
  scheduledTime?: string | null;
  reservation_time?: string | null;
  duration?: number | null;
  durationMinutes?: number | null;
  duration_minutes?: number | null;
  status?: string | null;
}

export interface AvailableSlot {
  time24: string; // e.g. "12:30"
  time12: string; // e.g. "12:30 PM"
  hour: number;
  minute: number;
  period: 'AM' | 'PM';
  minutesFromMidnight: number;
  availableBarbers: Array<{ id: string | number; name: string }>;
}

export interface CandidateSlot {
  time24: string;
  time12: string;
  minutes: number;
  isAvailable: boolean;
  blockedReason?: string;
  busyUntilTime12?: string;
  availableBarbers: Array<{ id: string | number; name: string }>;
}

export interface SlotCalculationOptions {
  serviceDuration?: number | null;
  date: string; // ISO format "YYYY-MM-DD"
  barberId?: string | number | 'any' | null;
  barbers?: SlotBarber[];
  existingBookings?: SlotBookingEntry[];
  queueEntries?: SlotBookingEntry[];
  shopHours?: {
    openTime?: string;
    closeTime?: string;
    isOpen?: boolean;
  } | null;
  bufferMinutes?: number;
  now?: Date | number | { todayIso: string; currentMinutes: number };
  slotIntervalMinutes?: number;
  /** When supplied, only starts verified by the server may be suggested. */
  verifiedStartTimes?: Record<string, string[]>;
}

export interface SlotCalculationResult {
  availableSlots: AvailableSlot[];
  allSlots: CandidateSlot[];
  earliestSlot: AvailableSlot | null;
  isFullyBooked: boolean;
  suggestedHelperText: string | null;
}

/**
 * Converts 12-hour or 24-hour time string to minutes from midnight (0–1439).
 */
export function timeToMinutes(timeStr?: string | null): number {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i.exec(timeStr.trim());
  if (!match) return 0;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const modifier = (match[3] || '').toUpperCase();

  if (minutes > 59) return 0;
  if (modifier ? hours < 1 || hours > 12 : hours > 23) return 0;

  if (hours === 12 && modifier === 'AM') hours = 0;
  if (hours < 12 && modifier === 'PM') hours += 12;

  return hours * 60 + minutes;
}

/**
 * Converts minutes from midnight into 24-hour "HH:mm" format.
 */
export function minutesToTime24(totalMinutes: number): string {
  const norm = ((Math.floor(totalMinutes) % 1440) + 1440) % 1440;
  const hours = Math.floor(norm / 60);
  const minutes = norm % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Converts minutes from midnight into 12-hour "h:mm A" format (e.g. "12:30 PM").
 */
export function minutesToTime12(totalMinutes: number): string {
  const norm = ((Math.floor(totalMinutes) % 1440) + 1440) % 1440;
  const hours24 = Math.floor(norm / 60);
  const minutes = norm % 60;
  const period: 'AM' | 'PM' = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${String(minutes).padStart(2, '0')} ${period}`;
}

/** Prefer a verified opening in the requested AM/PM period, then the day's first opening. */
export function selectAvailableTimeInPeriod(requestedTime: string, availableTimes: string[]): string | null {
  const requestedMinutes = timeToMinutes(requestedTime);
  const ordered = [...availableTimes].sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
  const samePeriod = ordered.filter((time) => (timeToMinutes(time) >= 720) === (requestedMinutes >= 720));
  return samePeriod.find((time) => timeToMinutes(time) >= requestedMinutes)
    || samePeriod[0] || ordered[0] || null;
}

/**
 * Splits a "HH:mm" 24-hour string into 12-hour components for form inputs.
 */
export function splitTime24(time24: string): { hour12: string; minute: string; period: 'AM' | 'PM' } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time24.trim());
  if (!match) {
    return { hour12: '', minute: '', period: 'AM' };
  }
  const h24 = Number(match[1]);
  const m = match[2];
  const h12 = h24 % 12 || 12;
  const period: 'AM' | 'PM' = h24 >= 12 ? 'PM' : 'AM';
  return { hour12: String(h12), minute: m, period };
}

/**
 * Returns true if half-open intervals [aStart, aEnd) and [bStart, bEnd) overlap.
 */
export function intervalsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

const TERMINAL_STATUSES = new Set([
  'cancelled',
  'declined',
  'rejected',
  'no_show',
  'cancelled_by_customer',
  'cancelled_by_barber',
]);

function extractDateIso(entry: SlotBookingEntry): string | null {
  const raw = entry.date || entry.scheduledDate || entry.reservation_date || entry.preferredDate;
  if (!raw) return null;
  return raw.slice(0, 10);
}

function resolveNowContext(nowInput?: Date | number | { todayIso: string; currentMinutes: number }): {
  todayIso: string;
  currentMinutes: number;
} {
  if (nowInput && typeof nowInput === 'object' && 'todayIso' in nowInput && 'currentMinutes' in nowInput) {
    return nowInput;
  }
  const dateObj = typeof nowInput === 'number'
    ? new Date(nowInput)
    : (nowInput instanceof Date ? nowInput : new Date());

  // Asia/Manila date and minutes
  const manilaString = dateObj.toLocaleString('en-US', { timeZone: 'Asia/Manila' });
  const manilaDate = new Date(manilaString);
  const valid = !isNaN(manilaDate.getTime()) ? manilaDate : dateObj;

  const yyyy = valid.getFullYear();
  const mm = String(valid.getMonth() + 1).padStart(2, '0');
  const dd = String(valid.getDate()).padStart(2, '0');
  const todayIso = `${yyyy}-${mm}-${dd}`;
  const currentMinutes = valid.getHours() * 60 + valid.getMinutes();

  return { todayIso, currentMinutes };
}

/**
 * Calculates candidate and available slots for a given day, service duration, and barber.
 * Pure and deterministic.
 */
export function calculateAvailableSlots(options: SlotCalculationOptions): SlotCalculationResult {
  const duration = Number(options.serviceDuration);
  const effectiveDuration = Number.isInteger(duration) && duration > 0 ? duration : DEFAULT_DURATION_MIN;
  const buffer = typeof options.bufferMinutes === 'number' && options.bufferMinutes >= 0
    ? options.bufferMinutes
    : DEFAULT_BOOKING_BUFFER_MINUTES;
  const interval = options.slotIntervalMinutes && options.slotIntervalMinutes > 0
    ? options.slotIntervalMinutes
    : SLOT_INTERVAL_MINUTES;

  // Shop hours
  if (options.shopHours?.isOpen === false) {
    return {
      availableSlots: [],
      allSlots: [],
      earliestSlot: null,
      isFullyBooked: true,
      suggestedHelperText: null,
    };
  }

  const openMinutes = timeToMinutes(options.shopHours?.openTime || DEFAULT_OPEN_TIME);
  const closeMinutes = timeToMinutes(options.shopHours?.closeTime || DEFAULT_CLOSE_TIME);

  const { todayIso, currentMinutes } = resolveNowContext(options.now);
  const isToday = options.date === todayIso;

  // Active barbers pool
  const allBarbers = (options.barbers || []).filter((b) => b.is_active !== false);
  const barberMap = new Map<string, SlotBarber>();
  allBarbers.forEach((b) => barberMap.set(String(b.id), b));

  const targetBarbers: SlotBarber[] = (options.barberId && options.barberId !== 'any')
    ? [
        barberMap.get(String(options.barberId)) || {
          id: String(options.barberId),
          name: `Barber #${options.barberId}`,
        },
      ]
    : allBarbers.length > 0
    ? allBarbers
    : [{ id: 'default', name: 'Barber' }];

  // Collect and group blocked intervals per barber for options.date
  const allEntries: SlotBookingEntry[] = [
    ...(options.existingBookings || []),
    ...(options.queueEntries || []),
  ];

  const blockedIntervalsByBarber = new Map<string, Array<{ start: number; end: number }>>();
  targetBarbers.forEach((b) => blockedIntervalsByBarber.set(String(b.id), []));

  for (const entry of allEntries) {
    if (entry.status && TERMINAL_STATUSES.has(entry.status.toLowerCase())) {
      continue;
    }
    const entryDate = extractDateIso(entry);
    if (entryDate && entryDate !== options.date) {
      continue;
    }
    const rawTime = entry.time || entry.scheduledTime || entry.reservation_time || entry.preferredTime;
    if (!rawTime) continue;

    const start = timeToMinutes(rawTime);
    const entryDuration = Number(entry.durationMinutes || entry.duration || entry.duration_minutes || entry.estMinutes) || DEFAULT_DURATION_MIN;
    const end = start + entryDuration + buffer;

    const entryBarberId = entry.barberId !== undefined && entry.barberId !== null
      ? String(entry.barberId)
      : (entry.barber_id !== undefined && entry.barber_id !== null ? String(entry.barber_id) : '');

    if (entryBarberId && blockedIntervalsByBarber.has(entryBarberId)) {
      blockedIntervalsByBarber.get(entryBarberId)!.push({ start, end });
    } else if (!entryBarberId && targetBarbers.length === 1) {
      // If single barber selected and entry has no specific barber, treat as blocking that single barber
      blockedIntervalsByBarber.get(String(targetBarbers[0].id))!.push({ start, end });
    }
  }

  // Adjacent bookings form one continuous busy period for an accurate "booked until" message.
  for (const [id, intervals] of blockedIntervalsByBarber) {
    const merged: Array<{ start: number; end: number }> = [];
    for (const interval of intervals.sort((a, b) => a.start - b.start)) {
      const previous = merged[merged.length - 1];
      if (previous && interval.start <= previous.end) previous.end = Math.max(previous.end, interval.end);
      else merged.push({ ...interval });
    }
    blockedIntervalsByBarber.set(id, merged);
  }

  const allSlots: CandidateSlot[] = [];
  const availableSlots: AvailableSlot[] = [];

  for (let slotStart = openMinutes; slotStart < closeMinutes; slotStart += interval) {
    const slotEnd = slotStart + effectiveDuration;
    const time24 = minutesToTime24(slotStart);
    const time12 = minutesToTime12(slotStart);

    // Rule 1: Slot must fit within shop closing hours
    if (slotEnd > closeMinutes) {
      allSlots.push({
        time24,
        time12,
        minutes: slotStart,
        isAvailable: false,
        blockedReason: 'Service duration exceeds shop closing hours',
        availableBarbers: [],
      });
      continue;
    }

    // Rule 2: Cannot book in past if date is today
    if (isToday && slotStart < currentMinutes) {
      allSlots.push({
        time24,
        time12,
        minutes: slotStart,
        isAvailable: false,
        blockedReason: 'Past time',
        availableBarbers: [],
      });
      continue;
    }

    // Rule 3: Find which target barbers are free for [slotStart, slotEnd)
    const freeBarbers = targetBarbers.filter((barber) => {
      if (options.verifiedStartTimes && !options.verifiedStartTimes[String(barber.id)]
        ?.some((start) => timeToMinutes(start) === slotStart)) return false;
      const intervals = blockedIntervalsByBarber.get(String(barber.id)) || [];
      const hasConflict = intervals.some((intervalBlock) =>
        intervalsOverlap(slotStart, slotEnd, intervalBlock.start, intervalBlock.end)
      );
      return !hasConflict;
    });

    const isAvailable = freeBarbers.length > 0;
    let blockedReason: string | undefined = undefined;
    let busyUntilTime12: string | undefined = undefined;

    if (!isAvailable) {
      const conflictingEnds: number[] = [];
      targetBarbers.forEach((barber) => {
        const intervals = blockedIntervalsByBarber.get(String(barber.id)) || [];
        intervals.forEach((block) => {
          if (intervalsOverlap(slotStart, slotEnd, block.start, block.end)) {
            conflictingEnds.push(block.end);
          }
        });
      });

      if (conflictingEnds.length > 0) {
        const minEnd = Math.min(...conflictingEnds);
        busyUntilTime12 = minutesToTime12(minEnd);
        blockedReason = targetBarbers.length === 1
          ? `${targetBarbers[0].name} is booked until ${busyUntilTime12}`
          : `All barbers booked until ${busyUntilTime12}`;
      } else {
        blockedReason = targetBarbers.length === 1
          ? `${targetBarbers[0].name} is booked at this time`
          : 'All barbers booked at this time';
      }
    }

    const candidateSlot: CandidateSlot = {
      time24,
      time12,
      minutes: slotStart,
      isAvailable,
      blockedReason,
      busyUntilTime12,
      availableBarbers: freeBarbers.map((b) => ({ id: b.id, name: b.name })),
    };
    allSlots.push(candidateSlot);

    if (isAvailable) {
      const h24 = Math.floor(slotStart / 60);
      const m = slotStart % 60;
      const period: 'AM' | 'PM' = h24 >= 12 ? 'PM' : 'AM';
      const h12 = h24 % 12 || 12;

      availableSlots.push({
        time24,
        time12,
        hour: h12,
        minute: m,
        period,
        minutesFromMidnight: slotStart,
        availableBarbers: freeBarbers.map((b) => ({ id: b.id, name: b.name })),
      });
    }
  }

  const earliestSlot = availableSlots.length > 0 ? availableSlots[0] : null;
  const isFullyBooked = availableSlots.length === 0;

  let suggestedHelperText: string | null = null;
  if (earliestSlot) {
    const barber = earliestSlot.availableBarbers[0];
    suggestedHelperText = barber?.name
      ? `Suggested: ${earliestSlot.time12} · ${barber.name} free`
      : `Suggested: ${earliestSlot.time12}`;
  }

  return {
    availableSlots,
    allSlots,
    earliestSlot,
    isFullyBooked,
    suggestedHelperText,
  };
}

/**
 * Pure function returning sorted array of available start time strings (HH:mm 24-hr format).
 */
export function getAvailableStartTimes(options: SlotCalculationOptions): string[] {
  return calculateAvailableSlots(options).availableSlots.map((slot) => slot.time24);
}

/**
 * Finds the next date (after options.startDate) with at least one available slot.
 * Checks up to maxDaysAhead (default 14).
 */
export function findNextAvailableDate(
  options: Omit<SlotCalculationOptions, 'date'> & { startDate: string; maxDaysAhead?: number }
): string | null {
  const maxDays = options.maxDaysAhead ?? 14;
  const [year, month, day] = options.startDate.split('-').map(Number);
  if (!year || !month || !day) return null;

  for (let offset = 1; offset <= maxDays; offset++) {
    const nextDateObj = new Date(year, month - 1, day + offset);
    const yyyy = nextDateObj.getFullYear();
    const mm = String(nextDateObj.getMonth() + 1).padStart(2, '0');
    const dd = String(nextDateObj.getDate()).padStart(2, '0');
    const nextDateIso = `${yyyy}-${mm}-${dd}`;

    const result = calculateAvailableSlots({
      ...options,
      date: nextDateIso,
    });

    if (result.availableSlots.length > 0) {
      return nextDateIso;
    }
  }

  return null;
}

/**
 * Extracts shop hours for a specific date from business hours settings.
 * Falls back to default shop hours (09:00 - 20:00).
 */
export function getShopHoursForDate(
  dateIso: string,
  businessHoursConfig?: unknown
): { openTime: string; closeTime: string; isOpen: boolean } {
  if (!dateIso) {
    return {
      openTime: DEFAULT_OPEN_TIME,
      closeTime: DEFAULT_CLOSE_TIME,
      isOpen: true,
    };
  }

  const [year, month, day] = dateIso.split('-').map(Number);
  const dateObj = new Date(year, month - 1, day);
  const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });

  if (Array.isArray(businessHoursConfig)) {
    const match = businessHoursConfig.find(
      (h) => typeof h?.day === 'string' && h.day.toLowerCase() === dayName.toLowerCase()
    );
    if (match) {
      return {
        openTime: match.openTime || DEFAULT_OPEN_TIME,
        closeTime: match.closeTime || DEFAULT_CLOSE_TIME,
        isOpen: match.isOpen !== false,
      };
    }
  } else if (businessHoursConfig && typeof businessHoursConfig === 'object') {
    const record = businessHoursConfig as Record<string, any>;
    const match = record[dayName] || record[dayName.toLowerCase()];
    if (match) {
      return {
        openTime: match.openTime || DEFAULT_OPEN_TIME,
        closeTime: match.closeTime || DEFAULT_CLOSE_TIME,
        isOpen: match.isOpen !== false,
      };
    }
  }

  return {
    openTime: DEFAULT_OPEN_TIME,
    closeTime: DEFAULT_CLOSE_TIME,
    isOpen: true,
  };
}

/**
 * Formats all-caps or unformatted service names to clean Title Case.
 * e.g. "HAIR CUT W/SHAMPOO" -> "Hair Cut w/ Shampoo"
 *      "HAIR CUT + HOT OIL" -> "Hair Cut + Hot Oil"
 */
export function formatServiceTitle(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';

  return raw
    .toLowerCase()
    .split(' ')
    .map((word) => {
      if (word === '+' || word === '&') return word;
      if (word.startsWith('w/')) {
        const rest = word.slice(2);
        return 'w/ ' + (rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : '');
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ')
    .replace(/\s*\+\s*/g, ' + ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Formats duration in minutes into a human-friendly string.
 * If 60 minutes or more, formats as hours and minutes (e.g. "1 hr", "1 hr 15 min", "2 hrs").
 * If under 60 minutes, formats as minutes (e.g. "20 min", "30 min", "45 min").
 */
export function formatDurationHuman(totalMinutes?: number | null): string {
  const m = Number(totalMinutes);
  if (!Number.isFinite(m) || m <= 0) return '0 min';

  if (m < 60) {
    return `${m} min`;
  }

  const hours = Math.floor(m / 60);
  const remainingMins = m % 60;
  const hrLabel = hours === 1 ? '1 hr' : `${hours} hrs`;

  if (remainingMins === 0) {
    return hrLabel;
  }

  return `${hrLabel} ${remainingMins} min`;
}

/** Returns only bookable suggestions, starting at or after the entered time. */
export function getRelevantSlotChips(
  allSlots: CandidateSlot[],
  targetMinutes?: number | null,
  maxChips: number = 4,
): CandidateSlot[] {
  const available = allSlots.filter((slot) => slot.isAvailable)
    .sort((a, b) => a.minutes - b.minutes);
  const upcoming = targetMinutes == null || !Number.isFinite(targetMinutes)
    ? available : available.filter((slot) => slot.minutes >= targetMinutes);
  return (upcoming.length > 0 ? upcoming : available).slice(0, Math.max(0, maxChips));
}
