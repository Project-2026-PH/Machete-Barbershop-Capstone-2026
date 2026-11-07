const MANILA_TIME_ZONE = 'Asia/Manila';
const MANILA_UTC_OFFSET_HOURS = 8;

export const reservationTimeToEpoch = (
  preferredDate: string | Date | null | undefined,
  preferredTime: string | null | undefined,
): number | null => {
  const dateValue = preferredDate instanceof Date
    ? `${preferredDate.getFullYear()}-${String(preferredDate.getMonth() + 1).padStart(2, '0')}-${String(preferredDate.getDate()).padStart(2, '0')}`
    : String(preferredDate || '');
  const dateMatch = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const timeMatch = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i.exec(String(preferredTime || '').trim());
  if (!dateMatch || !timeMatch) return null;

  let hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);
  const seconds = timeMatch[3] === undefined ? 0 : Number(timeMatch[3]);
  const modifier = (timeMatch[4] || '').toUpperCase();
  if (minutes > 59 || seconds > 59 || (modifier ? hours < 1 || hours > 12 : hours > 23)) return null;

  if (hours === 12 && modifier === 'AM') hours = 0;
  if (hours < 12 && modifier === 'PM') hours += 12;
  if (!modifier && hours >= 1 && hours <= 8) hours += 12;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const dateCheck = new Date(Date.UTC(year, month - 1, day));
  if (dateCheck.getUTCFullYear() !== year || dateCheck.getUTCMonth() !== month - 1 || dateCheck.getUTCDate() !== day) return null;

  return Date.UTC(year, month - 1, day, hours - MANILA_UTC_OFFSET_HOURS, minutes, seconds);
};

export const getManilaDateIso = (date: Date = new Date()): string => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MANILA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return `${year}-${month}-${day}`;
};

export const addDaysToIsoDate = (dateIso: string, days: number): string => {
  const date = new Date(`${dateIso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

export const formatManilaDate = (dateIso: string | null | undefined): string => {
  if (!dateIso) return '—';
  const match = String(dateIso).match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match) return '—';
  const date = new Date(`${match[1]}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: MANILA_TIME_ZONE,
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  }).format(date).replace(/\//g, '-');
};

export const timeToMinutes = (time: string): number => {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i.exec(String(time).trim());
  if (!match) return Number.MAX_SAFE_INTEGER;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const modifier = (match[4] || '').toUpperCase();

  if (minutes > 59) return Number.MAX_SAFE_INTEGER;
  if (modifier ? hours < 1 || hours > 12 : hours > 23) return Number.MAX_SAFE_INTEGER;

  if (hours === 12 && modifier === 'AM') hours = 0;
  if (hours < 12 && modifier === 'PM') hours += 12;
  // If modifier is absent and hours is 1..8 without leading zero, treat as PM (e.g. "1:15" -> 13:15)
  if (!modifier && !match[1].startsWith('0') && hours >= 1 && hours <= 8) hours += 12;
  return hours * 60 + minutes;
};

const LAST_SLOT_MINUTES = 20 * 60 + 30; // 8:30 PM (20:30)
const RESERVATION_LEAD_TIME_MINUTES = 2 * 60; // 2 hours lead time

/**
 * Checks whether today (in Manila time) still has operating hours left
 * that satisfy the 2-hour reservation lead time.
 */
export const possessesRemainingSlotsToday = (now: Date = new Date()): boolean => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MANILA_TIME_ZONE,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(now);

  const hoursStr = parts.find((p) => p.type === 'hour')?.value || '0';
  const minutesStr = parts.find((p) => p.type === 'minute')?.value || '0';

  let currentHour = Number(hoursStr);
  if (currentHour === 24) currentHour = 0;
  const currentMinutes = currentHour * 60 + Number(minutesStr);

  // The last possible appointment start slot is 8:30 PM (1230 min).
  // With 2 hours lead time required, current time must be <= (1230 - 120) = 1110 min (6:30 PM).
  return currentMinutes + RESERVATION_LEAD_TIME_MINUTES <= LAST_SLOT_MINUTES;
};

export const formatManilaTime = (timeStr?: string | null): string => {
  if (!timeStr) return '—';
  const trimmed = String(timeStr).trim();
  const withModMatch = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(trimmed);
  if (withModMatch) {
    let hours = Number(withModMatch[1]);
    let minutes = Math.round(Number(withModMatch[2]) / 15) * 15;
    const mod = withModMatch[3].toUpperCase();
    if (minutes === 60) {
      minutes = 0;
      hours = (hours % 12) + 1;
    }
    return `${hours}:${String(minutes).padStart(2, '0')} ${mod}`;
  }
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/i.exec(trimmed);
  if (match) {
    let hours = Number(match[1]);
    let minutes = Math.round(Number(match[2]) / 15) * 15;
    if (minutes === 60) {
      minutes = 0;
      hours = hours + 1;
    }
    let modifier = 'AM';
    if (hours >= 12 && hours <= 23) {
      modifier = 'PM';
      hours = hours % 12 || 12;
    } else if (hours >= 1 && hours <= 8) {
      modifier = 'PM';
    } else if (hours >= 9 && hours <= 11) {
      modifier = 'AM';
    }
    return `${hours}:${String(minutes).padStart(2, '0')} ${modifier}`;
  }
  return trimmed;
};

/**
 * Formats duration in minutes into a clean hours and minutes string:
 * - < 60 mins: "X mins" (e.g., "30 mins", "45 mins")
 * - Exactly divisible by 60: "X hr" or "X hrs" (e.g., "1 hr", "2 hrs")
 * - > 60 mins with remainder: "X hr Y mins" or "X hrs Y mins" (e.g., "1 hr 15 mins", "1 hr 30 mins", "2 hrs 15 mins")
 */
export const formatDuration = (value: number | string | null | undefined): string => {
  const numeric = Number.parseInt(String(value ?? '').replace(/[^\d]/g, ''), 10);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return typeof value === 'string' && value.trim() ? value : '—';
  }

  if (numeric < 60) {
    return `${numeric} mins`;
  }

  const hours = Math.floor(numeric / 60);
  const remainingMinutes = numeric % 60;
  const hrLabel = hours === 1 ? '1 hr' : `${hours} hrs`;

  if (remainingMinutes === 0) {
    return hrLabel;
  }

  return `${hrLabel} ${remainingMinutes} mins`;
};

/**
 * Formats a canonical timestamp (e.g. UTC ISO string) into Manila local time (Asia/Manila, UTC+08:00).
 * Displays canonical 'PHT' (Philippine Time) timezone marker.
 *
 * Example outputs:
 * - inline: "Sep 21, 2026, 11:42:05 AM PHT"
 * - split: { date: "Sep 21, 2026", time: "11:42:05 AM PHT", full: "Sep 21, 2026, 11:42:05 AM PHT" }
 * - date-only: "Sep 21, 2026"
 * - time-only: "11:42:05 AM PHT"
 */
export function formatManilaAuditTimestamp(
  dateInput: string | number | Date | null | undefined,
  format: 'split'
): { date: string; time: string; full: string; tz: string };
export function formatManilaAuditTimestamp(
  dateInput: string | number | Date | null | undefined,
  format?: 'inline' | 'date-only' | 'time-only'
): string;
export function formatManilaAuditTimestamp(
  dateInput: string | number | Date | null | undefined,
  format: 'split' | 'inline' | 'date-only' | 'time-only' = 'inline'
): { date: string; time: string; full: string; tz: string } | string {
  if (!dateInput) {
    return format === 'split' ? { date: '—', time: '', full: '—', tz: 'PHT' } : '—';
  }

  let date: Date;
  if (dateInput instanceof Date) {
    date = dateInput;
  } else if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    const hasTimezone = trimmed.endsWith('Z') || /[+-]\d{2}(?::?\d{2})?$/.test(trimmed);
    const normalized = hasTimezone ? trimmed : `${trimmed.replace(' ', 'T')}Z`;
    date = new Date(normalized);
  } else {
    date = new Date(dateInput);
  }

  if (Number.isNaN(date.getTime())) {
    return format === 'split' ? { date: '—', time: '', full: '—', tz: 'PHT' } : '—';
  }

  const datePart = new Intl.DateTimeFormat('en-US', {
    timeZone: MANILA_TIME_ZONE,
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  }).format(date);

  const timePart = new Intl.DateTimeFormat('en-US', {
    timeZone: MANILA_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(date);

  const timeWithZone = `${timePart} PHT`;
  const full = `${datePart}, ${timeWithZone}`;

  if (format === 'split') {
    return { date: datePart, time: timePart, full, tz: 'PHT' };
  }
  if (format === 'date-only') return datePart;
  if (format === 'time-only') return timeWithZone;
  return full;
}

/**
 * Returns today's date formatted for Manila business headers (e.g., "September 22, 2026").
 */
export const getManilaHeaderDate = (date: Date = new Date()): string => {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: MANILA_TIME_ZONE,
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
};

/**
 * Formats date and time context for Barber Queue cards with relative 'Today' / 'Tomorrow' context in Manila time.
 */
export const formatManilaQueueDateTime = (
  preferredDate?: string | null,
  preferredTime?: string | null,
  createdAt?: string | null
): { dateContext: string; timeDisplay: string; fullDisplay: string } => {
  const todayManilaIso = getManilaDateIso(new Date());
  const tomorrowManilaIso = addDaysToIsoDate(todayManilaIso, 1);

  let targetIsoDate: string | null = null;
  if (preferredDate) {
    const match = String(preferredDate).match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) targetIsoDate = match[1];
  }
  if (!targetIsoDate && createdAt) {
    targetIsoDate = getManilaDateIso(new Date(createdAt));
  }
  if (!targetIsoDate) {
    targetIsoDate = todayManilaIso;
  }

  let dateContext = 'Today';
  if (targetIsoDate === todayManilaIso) {
    dateContext = 'Today';
  } else if (targetIsoDate === tomorrowManilaIso) {
    dateContext = 'Tomorrow';
  } else {
    try {
      const d = new Date(`${targetIsoDate}T12:00:00Z`);
      dateContext = new Intl.DateTimeFormat('en-US', {
        timeZone: MANILA_TIME_ZONE,
        month: 'short',
        day: 'numeric',
      }).format(d);
    } catch {
      dateContext = targetIsoDate;
    }
  }

  let timeDisplay = '';
  if (preferredTime) {
    timeDisplay = formatManilaTime(preferredTime);
  } else if (createdAt) {
    const d = new Date(createdAt);
    if (!Number.isNaN(d.getTime())) {
      timeDisplay = new Intl.DateTimeFormat('en-US', {
        timeZone: MANILA_TIME_ZONE,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).format(d);
    }
  }

  if (!timeDisplay) {
    timeDisplay = new Intl.DateTimeFormat('en-US', {
      timeZone: MANILA_TIME_ZONE,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(new Date());
  }

  return {
    dateContext,
    timeDisplay,
    fullDisplay: `${dateContext} • ${timeDisplay}`,
  };
};

/**
 * Robust date/time formatter for customer history in Manila timezone.
 */
export const formatManilaServiceDateTime = (
  dateStr?: string | null,
  timeStr?: string | null,
  rawTimestamp?: string | null
): { formattedDate: string; formattedTime: string; fullString: string } => {
  if (!dateStr && !rawTimestamp) {
    return { formattedDate: 'NO PREVIOUS VISITS', formattedTime: '', fullString: 'NO PREVIOUS VISITS' };
  }

  let dateObj: Date | null = null;
  if (rawTimestamp) {
    const d = new Date(rawTimestamp);
    if (!Number.isNaN(d.getTime())) dateObj = d;
  }
  if (!dateObj && dateStr) {
    const combined = timeStr ? `${dateStr} ${timeStr}` : `${dateStr}T12:00:00Z`;
    const d = new Date(combined);
    if (!Number.isNaN(d.getTime())) {
      dateObj = d;
    } else {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const yr = Number.parseInt(parts[0], 10);
        const mo = Number.parseInt(parts[1], 10) - 1;
        const day = Number.parseInt(parts[2], 10);
        dateObj = new Date(Date.UTC(yr, mo, day, 4, 0, 0)); // UTC 04:00 is 12:00 Manila
      }
    }
  }

  if (!dateObj || Number.isNaN(dateObj.getTime())) {
    const fallback = (dateStr || '').toUpperCase();
    return { formattedDate: fallback, formattedTime: (timeStr || '').toUpperCase(), fullString: fallback };
  }

  const formattedDate = new Intl.DateTimeFormat('en-US', {
    timeZone: MANILA_TIME_ZONE,
    month: 'long',
    day: '2-digit',
    year: 'numeric',
  }).format(dateObj).toUpperCase();

  let formattedTime = '';
  if (timeStr) {
    formattedTime = formatManilaTime(timeStr);
  } else {
    formattedTime = new Intl.DateTimeFormat('en-US', {
      timeZone: MANILA_TIME_ZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(dateObj);
  }

  const fullString = formattedTime ? `${formattedDate} • ${formattedTime}` : formattedDate;
  return { formattedDate, formattedTime, fullString };
};

