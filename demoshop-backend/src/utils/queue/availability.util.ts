const SHOP_OPEN_MINUTES = 9 * 60;   // 9:00 AM
const SHOP_CLOSE_MINUTES = 21 * 60;  // 9:00 PM
const SLOT_INTERVAL_MINUTES = 15;

const formatTimeFromMinutes = (totalMinutes: number): string => {
  const hours24 = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  const modifier = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${String(minutes).padStart(2, '0')} ${modifier}`;
};

/**
 * Represents an appointment blocking a time slot.
 */
interface Appointment {
  startTime: string;
  durationMinutes: number;
}

export interface BusyPeriod {
  startTime: string;
  endTime: string;
  queueCount: number;
  waitTimeMinutes: number;
}

/**
 * Converts 12-hour or 24-hour time strings to minutes from midnight.
 * Invalid or missing values return 0 for backward-compatible callers.
 */
export const timeToMinutes = (timeStr?: string | null): number => {
  if (!timeStr || typeof timeStr !== 'string') return 0;

  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i.exec(timeStr.trim());
  if (!match) return 0;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3] === undefined ? 0 : Number(match[3]);
  const modifier = (match[4] || '').toUpperCase();

  if (minutes > 59 || seconds > 59) return 0;
  if (modifier ? hours < 1 || hours > 12 : hours > 23) return 0;

  if (hours === 12 && modifier === 'AM') hours = 0;
  if (hours < 12 && modifier === 'PM') hours += 12;
  // If modifier is absent and hours is 1..8 without leading zero (e.g. "1:00"), it is afternoon (1:00 PM - 8:59 PM) in barbershop hours
  if (!modifier && !match[1].startsWith('0') && hours >= 1 && hours <= 8) hours += 12;
  return hours * 60 + minutes;
};

/**
 * Checks whether two intervals [aStart, aEnd) and [bStart, bEnd) overlap.
 */
const intervalsOverlap = (
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): boolean => aStart < bEnd && bStart < aEnd;

export interface TimeSlotOption {
  time: string;
  isAvailable: boolean;
  queueCount: number;
  isOnBreak?: boolean;
  breakBufferMinutes?: number;
  recommendedArrivalTime?: string;
}

/**
 * Gets the current time in Manila (Asia/Manila timezone) with minutes from midnight and ISO date.
 */
export const getManilaNow = (): { manilaDate: Date; currentMinutes: number; todayISO: string } => {
  const now = new Date();
  const manilaTimeStr = now.toLocaleString('en-US', { timeZone: 'Asia/Manila' });
  const manilaNow = new Date(manilaTimeStr);
  const finalManilaNow = isNaN(manilaNow.getTime()) ? now : manilaNow;
  const currentMinutes = finalManilaNow.getHours() * 60 + finalManilaNow.getMinutes();
  const yyyy = finalManilaNow.getFullYear();
  const mm = String(finalManilaNow.getMonth() + 1).padStart(2, '0');
  const dd = String(finalManilaNow.getDate()).padStart(2, '0');
  const todayISO = `${yyyy}-${mm}-${dd}`;
  return { manilaDate: finalManilaNow, currentMinutes, todayISO };
};

/**
 * Checks if a requested date string refers to today in Manila timezone.
 */
export const isDateTodayInManila = (requestedDate?: string): boolean => {
  if (!requestedDate) return false;
  const { manilaDate, todayISO } = getManilaNow();
  const todayShort = manilaDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const todayLong = manilaDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

  return (
    requestedDate === todayShort ||
    requestedDate === todayLong ||
    requestedDate === todayISO ||
    requestedDate.includes(todayISO)
  );
};

/**
 * Generates a strict availability schedule for a barber on a given day.
 *
 * A slot at time S with duration D is AVAILABLE only when the full window
 * [S, S+D) does not overlap ANY existing appointment AND fits within shop
 * closing time (last working hour + 60 min).
 *
 * If the barber is on break and the slot is within the immediate upcoming window (next 30 mins),
 * a 15-minute buffer is added to the recommended arrival time.
 *
 * @param workingHours     - Array of start times e.g. ["10:00 AM", "10:15 AM", ...]
 * @param appointments     - Active appointments for the barber on this date
 * @param requestedDuration - Total duration in minutes of the requested service(s)
 * @param options          - Optional metadata for break buffering and current time context
 */
export const generateTimeSlotAvailability = (
  workingHours: string[],
  appointments: Appointment[],
  requestedDuration: number = 30,
  options?: {
    isOnBreak?: boolean;
    isToday?: boolean;
    currentMinutes?: number;
    breakBufferMinutes?: number;
  }
): TimeSlotOption[] => {
  if (workingHours.length === 0) return [];

  // Shop closes at 9:00 PM (SHOP_CLOSE_MINUTES)
  const shopCloseMinutes = SHOP_CLOSE_MINUTES;
  const isOnBreak = options?.isOnBreak ?? false;
  const isToday = options?.isToday ?? false;
  const nowMinutes = options?.currentMinutes ?? getManilaNow().currentMinutes;
  const breakBuffer = options?.breakBufferMinutes ?? 15;

  // Pre-compute appointment intervals once (avoids repeated parsing per slot).
  const apptIntervals = appointments.map(appt => ({
    start: timeToMinutes(appt.startTime),
    end: timeToMinutes(appt.startTime) + (appt.durationMinutes || 30),
  }));

  return workingHours.map(time => {
    const slotStart = timeToMinutes(time);
    const bookingEnd = slotStart + requestedDuration;

    // --- Availability: strict zero-overlap check for the full booking window ---
    const fitsInShopHours = bookingEnd <= shopCloseMinutes;
    const hasNoConflict = apptIntervals.every(
      appt => !intervalsOverlap(slotStart, bookingEnd, appt.start, appt.end)
    );
    const isAvailable = fitsInShopHours && hasNoConflict;

    // --- Queue count: collisions within the 60-min display window [S, S+60) ---
    const displayWindowEnd = slotStart + 60;
    const queueCount = apptIntervals.filter(
      appt => intervalsOverlap(slotStart, displayWindowEnd, appt.start, appt.end)
    ).length;

    // --- Rule: Immediate upcoming slot (within next 30 min) while barber is On Break gets 15-min buffer ---
    const isImmediateSlot = isToday && (slotStart >= nowMinutes && slotStart <= nowMinutes + 30);
    const slotBreakBuffer = (isOnBreak && isImmediateSlot) ? breakBuffer : 0;
    const recommendedArrivalTime = slotBreakBuffer > 0
      ? formatTimeFromMinutes(slotStart + slotBreakBuffer)
      : time;

    return {
      time,
      isAvailable,
      queueCount,
      isOnBreak,
      breakBufferMinutes: slotBreakBuffer,
      recommendedArrivalTime,
    };
  });
};

/**
 * Creates exact occupied intervals for the UI from appointment start times and
 * service durations. This intentionally does not infer periods by grouping
 * unavailable 15-minute slots.
 */
export const formatBusyPeriods = (
  appointments: Appointment[],
  waitTimeMinutes = 0,
): BusyPeriod[] => {
  const rawPeriods = appointments
    .map((appointment) => {
      const startMinutes = timeToMinutes(appointment.startTime);
      const durationMinutes = Number(appointment.durationMinutes) || 30;
      const endMinutes = startMinutes + durationMinutes;

      return {
        startMinutes,
        endMinutes,
        queueCount: 1,
        waitTimeMinutes: Math.max(0, Number(waitTimeMinutes) || 0),
      };
    })
    .filter((period) => (
      period.startMinutes >= SHOP_OPEN_MINUTES &&
      period.startMinutes < SHOP_CLOSE_MINUTES &&
      period.endMinutes > period.startMinutes
    ))
    .sort((a, b) => a.startMinutes - b.startMinutes);

  if (rawPeriods.length === 0) return [];

  // Merge contiguous back-to-back or overlapping intervals
  // (e.g. 5:00-5:30 and 5:30-6:00 and 6:00-6:30 merge into 5:00-6:30)
  const merged: typeof rawPeriods = [];
  let current = { ...rawPeriods[0] };

  for (let i = 1; i < rawPeriods.length; i++) {
    const next = rawPeriods[i];
    if (next.startMinutes <= current.endMinutes) {
      current.endMinutes = Math.max(current.endMinutes, next.endMinutes);
      current.queueCount += next.queueCount;
    } else {
      merged.push(current);
      current = { ...next };
    }
  }
  merged.push(current);

  return merged.map((period) => ({
    startTime: formatTimeFromMinutes(period.startMinutes),
    endTime: formatTimeFromMinutes(period.endMinutes),
    queueCount: period.queueCount,
    waitTimeMinutes: period.waitTimeMinutes,
  }));
};

/**
 * Determines valid working hours based on the requested date.
 * If the date is today (in Manila time), it filters out hours that have already passed.
 */
export const getValidWorkingHours = (
  requestedDate: string,
  businessHours?: Array<{ day: string; openTime: string; closeTime: string; isOpen: boolean }>,
  requestedDuration: number = 30,
): string[] => {
  let openMin = SHOP_OPEN_MINUTES;
  let closeMin = SHOP_CLOSE_MINUTES;

  if (businessHours && Array.isArray(businessHours) && businessHours.length > 0) {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const parts = requestedDate.split('-').map(Number);
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
      const dayName = dayNames[d.getUTCDay()];
      const daySchedule = businessHours.find((h) => h.day?.toLowerCase() === dayName.toLowerCase());

      if (daySchedule) {
        if (!daySchedule.isOpen) {
          return []; // Shop is closed on this day
        }
        const parsedOpen = timeToMinutes(daySchedule.openTime);
        const parsedClose = timeToMinutes(daySchedule.closeTime);
        if (parsedOpen !== undefined && parsedClose !== undefined && parsedClose > parsedOpen) {
          openMin = parsedOpen;
          closeMin = parsedClose;
        }
      }
    }
  }

  // Evening slots is until 8:00 PM only (exclude 8:15 - 8:30).
  // Customer cutoff is 8:30 PM (or closeMin if earlier).
  const MAX_SLOT_MINUTES = 20 * 60; // 8:00 PM
  const CUTOFF_MINUTES = 20 * 60 + 30; // 8:30 PM
  const effectiveCutoff = Math.min(CUTOFF_MINUTES, closeMin);
  const maxAllowedSlot = Math.min(MAX_SLOT_MINUTES, effectiveCutoff - 30);
  const lastSlotMin = Math.min(maxAllowedSlot, effectiveCutoff - requestedDuration);

  const slotCount = Math.floor((lastSlotMin - openMin) / SLOT_INTERVAL_MINUTES) + 1;
  if (slotCount <= 0) return [];

  const ALL_WORKING_HOURS = Array.from(
    { length: slotCount },
    (_, index) => formatTimeFromMinutes(openMin + index * SLOT_INTERVAL_MINUTES),
  );

  const isToday = isDateTodayInManila(requestedDate);

  // Future date -> all hours available for display.
  if (!isToday) return ALL_WORKING_HOURS;

  // Today -> filter out hours already past, with a small grace period.
  const { currentMinutes } = getManilaNow();
  const GRACE_PERIOD = 5;

  return ALL_WORKING_HOURS.filter(hour => {
    const hourMinutes = timeToMinutes(hour);
    return (hourMinutes + GRACE_PERIOD) > currentMinutes;
  });
};

/**
 * Maps queue entries to appointment intervals in Manila local time. Walk-ins
 * use their actual or projected start and remain occupied while still active.
 */
export const formatQueueToAppointments = (queueEntries: any[]): Appointment[] => {
  return queueEntries.map((entry: any) => {
    const actualWalkinStart = entry.is_walk_in === true && entry.status === 'serving'
      ? entry.service_started_at
      : null;
    if (!actualWalkinStart && entry.preferred_time) {
      return {
        startTime: entry.preferred_time,
        durationMinutes: entry.duration_minutes || 30,
      };
    }

    const projectedStart = new Date(actualWalkinStart || entry.estimated_start_at || entry.created_at);
    const isActiveWalkin = entry.is_walk_in === true && (entry.status === 'waiting' || entry.status === 'serving');
    const startAt = isActiveWalkin && projectedStart.getTime() < Date.now()
      ? new Date()
      : projectedStart;
    const startTime = isNaN(startAt.getTime())
      ? '12:00 AM'
      : startAt.toLocaleTimeString('en-US', {
          timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: true,
        });

    return {
      startTime,
      durationMinutes: entry.duration_minutes || 30,
    };
  });
};
