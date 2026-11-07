export interface ScheduledGuestCalculation {
  guestIndex: number;
  guestName: string;
  barberId: string;
  barberName: string;
  serviceIds: number[];
  durationMinutes: number;
  startMinutes: number;
  endMinutes: number;
  scheduledTime12h: string; // e.g. "2:00 PM"
  scheduledTime24h: string; // e.g. "14:00"
  estimatedEndTime12h: string; // e.g. "2:45 PM"
  estimatedEndTime24h: string; // e.g. "14:45"
  isSequential: boolean;
  sequentialOffsetMinutes: number;
  precedingGuestName?: string;
  badgeLabel: string;
}

export const parseTimeToMinutes = (time: string): number => {
  const trimmed = String(time || '').trim();
  const match12 = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(trimmed);
  if (match12) {
    let hours = Number(match12[1]);
    if (hours === 12) hours = 0;
    if (match12[3].toUpperCase() === 'PM') hours += 12;
    return hours * 60 + Number(match12[2]);
  }
  const match24 = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(trimmed);
  if (match24) {
    return Number(match24[1]) * 60 + Number(match24[2]);
  }
  return Number.MAX_SAFE_INTEGER;
};

export const formatMinutesTo12Hour = (minutes: number): string => {
  if (!Number.isFinite(minutes) || minutes < 0 || minutes === Number.MAX_SAFE_INTEGER) return '—';
  let hours = Math.floor(minutes / 60) % 24;
  const mins = minutes % 60;
  const period = hours >= 12 ? 'PM' : 'AM';
  if (hours === 0) hours = 12;
  else if (hours > 12) hours -= 12;
  return `${hours}:${String(mins).padStart(2, '0')} ${period}`;
};

export const formatMinutesTo24Hour = (minutes: number): string => {
  if (!Number.isFinite(minutes) || minutes < 0 || minutes === Number.MAX_SAFE_INTEGER) return '—';
  const hours = Math.floor(minutes / 60) % 24;
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

export const getServiceDurationMinutes = (service: any): number => {
  const rawDuration = service?.duration_minutes ?? service?.duration;
  if (typeof rawDuration === 'number' && Number.isFinite(rawDuration) && rawDuration > 0) return rawDuration;
  const durationText = String(rawDuration ?? '').trim();
  const hours = durationText.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i);
  const minutes = durationText.match(/(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|m)\b/i);
  if (hours || minutes) return Number(hours?.[1] || 0) * 60 + Number(minutes?.[1] || 0);
  const numeric = Number(durationText);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 30;
};

export interface RawGuestInput {
  guestIndex: number;
  guestName?: string;
  services?: any[];
  barberId?: string | number;
  barberName?: string;
  barber?: any;
}

export interface BarberChairPoolItem {
  id: string | number;
  name: string;
  initialFreeMinutes: number;
}

export interface CalculateGroupScheduleOptions {
  isStaggeredMode?: boolean;
  availableChairsCount?: number;
  barberPool?: BarberChairPoolItem[];
}

/**
 * Computes sequential and concurrent schedule timings for a group of guests.
 * When barberPool is provided, applies Shortest Estimated Completion Algorithm (SECA)
 * to align auto-assigned guests with the barbers who complete their services first.
 */
export const calculateGroupSchedule = (
  baseTime: string,
  guests: RawGuestInput[],
  options?: CalculateGroupScheduleOptions
): ScheduledGuestCalculation[] => {
  const baseMinutes = parseTimeToMinutes(baseTime);
  if (!Number.isFinite(baseMinutes) || baseMinutes === Number.MAX_SAFE_INTEGER) {
    return [];
  }

  const results: ScheduledGuestCalculation[] = [];
  const barberTracker = new Map<string, { nextFree: number; lastGuestName: string; lastGuestIndex: number }>();

  // SECA branch: real barber availability pool is provided
  if (Array.isArray(options?.barberPool) && options.barberPool.length > 0) {
    const chairs = options.barberPool.map((b) => ({
      id: String(b.id),
      name: b.name,
      nextFreeMinutes: Math.max(baseMinutes, b.initialFreeMinutes),
      assignedCount: 0,
      lastGuestName: '',
    }));

    for (let i = 0; i < guests.length; i++) {
      const g = guests[i];
      const guestIndex = g.guestIndex || (i + 1);
      const guestName = g.guestName?.trim() || (guestIndex === 1 ? 'Guest 1 (You)' : `Guest ${guestIndex}`);
      const services = Array.isArray(g.services) ? g.services : [];
      const durationMinutes = services.reduce((acc, s) => acc + getServiceDurationMinutes(s), 0) || 30;
      const serviceIds = services.map(s => Number(s.id ?? s.service_id)).filter(id => Number.isFinite(id) && id > 0);

      const barberIdStr = String(g.barberId || g.barber?.id || g.barber?.barber_id || '');
      const isAutoAssign = !barberIdStr || barberIdStr === 'auto' || barberIdStr === '0' || g.barber?.is_auto_assigned;

      let chosenChair: typeof chairs[0];
      let startMinutes: number;
      let precedingGuestName: string | undefined;

      if (!isAutoAssign) {
        // Specific barber explicitly requested by customer
        const specificChair = chairs.find((c) => c.id === barberIdStr);
        if (specificChair) {
          chosenChair = specificChair;
          startMinutes = chosenChair.nextFreeMinutes;
          if (startMinutes > baseMinutes) {
            precedingGuestName = chosenChair.lastGuestName || `${chosenChair.name} finishes previous booking`;
          }
        } else {
          const prev = barberTracker.get(barberIdStr);
          startMinutes = prev ? prev.nextFree : baseMinutes;
          precedingGuestName = prev?.lastGuestName;
          chosenChair = {
            id: barberIdStr,
            name: g.barberName || g.barber?.name || 'Selected Barber',
            nextFreeMinutes: startMinutes,
            assignedCount: 0,
            lastGuestName: '',
          };
          chairs.push(chosenChair);
        }
      } else {
        // Auto-assign ("Any Available Barber"): Shortest Estimated Completion Algorithm
        // Sort by earliest available minute, then fewest assigned guests in this booking
        chairs.sort((a, b) => {
          if (a.nextFreeMinutes !== b.nextFreeMinutes) {
            return a.nextFreeMinutes - b.nextFreeMinutes;
          }
          return a.assignedCount - b.assignedCount;
        });

        chosenChair = chairs[0];
        startMinutes = chosenChair.nextFreeMinutes;
        if (startMinutes > baseMinutes) {
          precedingGuestName = chosenChair.lastGuestName
            ? `${chosenChair.lastGuestName} finishes`
            : `${chosenChair.name} finishes previous booking`;
        }
      }

      const endMinutes = startMinutes + durationMinutes;
      chosenChair.nextFreeMinutes = endMinutes;
      chosenChair.assignedCount += 1;
      chosenChair.lastGuestName = guestName;

      barberTracker.set(chosenChair.id, {
        nextFree: endMinutes,
        lastGuestName: guestName,
        lastGuestIndex: guestIndex,
      });

      const isSequential = startMinutes > baseMinutes;
      const sequentialOffsetMinutes = startMinutes - baseMinutes;
      const start12h = formatMinutesTo12Hour(startMinutes);
      const end12h = formatMinutesTo12Hour(endMinutes);

      let badgeLabel: string;
      if (isSequential) {
        badgeLabel = precedingGuestName
          ? `Sequential Slot: Estimated at ${start12h} (${precedingGuestName.startsWith('After') ? precedingGuestName : `After ${precedingGuestName}`})`
          : `Sequential Slot: Estimated at ${start12h}`;
      } else {
        badgeLabel = `Starts at ${start12h} (Estimated ${durationMinutes} mins)`;
      }

      results.push({
        guestIndex,
        guestName,
        barberId: chosenChair.id,
        barberName: chosenChair.name,
        serviceIds,
        durationMinutes,
        startMinutes,
        endMinutes,
        scheduledTime12h: start12h,
        scheduledTime24h: formatMinutesTo24Hour(startMinutes),
        estimatedEndTime12h: end12h,
        estimatedEndTime24h: formatMinutesTo24Hour(endMinutes),
        isSequential,
        sequentialOffsetMinutes,
        precedingGuestName,
        badgeLabel,
      });
    }

    return results;
  }

  // Fallback branch: no barber pool provided (retains legacy behavior for tests/fallbacks)
  const isStaggered = Boolean(options?.isStaggeredMode);
  const availableChairs = Math.max(1, options?.availableChairsCount ?? 2);
  const chairFreeTimes: Array<{ freeMinutes: number; guestName: string; guestIndex: number }> = [];

  for (let i = 0; i < guests.length; i++) {
    const g = guests[i];
    const guestIndex = g.guestIndex || (i + 1);
    const guestName = g.guestName?.trim() || (guestIndex === 1 ? 'Guest 1 (You)' : `Guest ${guestIndex}`);
    const services = Array.isArray(g.services) ? g.services : [];
    const durationMinutes = services.reduce((acc, s) => acc + getServiceDurationMinutes(s), 0) || 30;
    const serviceIds = services.map(s => Number(s.id ?? s.service_id)).filter(id => Number.isFinite(id) && id > 0);

    const barberIdStr = String(g.barberId || g.barber?.id || g.barber?.barber_id || '');
    const isAutoAssign = !barberIdStr || barberIdStr === 'auto' || barberIdStr === '0' || g.barber?.is_auto_assigned;
    const barberName = g.barberName || g.barber?.name || (isAutoAssign ? 'Any Available Barber' : 'Selected Barber');

    let startMinutes = baseMinutes;
    let precedingGuestName: string | undefined;

    if (isStaggered && i >= availableChairs) {
      if (!isAutoAssign && barberTracker.has(barberIdStr)) {
        const prev = barberTracker.get(barberIdStr)!;
        startMinutes = prev.nextFree;
        precedingGuestName = prev.lastGuestName;
      } else if (chairFreeTimes.length > 0) {
        chairFreeTimes.sort((a, b) => a.freeMinutes - b.freeMinutes);
        const earliest = chairFreeTimes[0];
        startMinutes = earliest.freeMinutes;
        precedingGuestName = `${earliest.guestName} finishes`;
        earliest.freeMinutes = startMinutes + durationMinutes;
        earliest.guestName = guestName;
        earliest.guestIndex = guestIndex;
      }
    } else {
      if (!isAutoAssign && barberTracker.has(barberIdStr)) {
        const prev = barberTracker.get(barberIdStr)!;
        startMinutes = prev.nextFree;
        precedingGuestName = prev.lastGuestName;
      } else {
        startMinutes = baseMinutes;
      }

      if (isStaggered && i < availableChairs) {
        chairFreeTimes.push({
          freeMinutes: startMinutes + durationMinutes,
          guestName,
          guestIndex,
        });
      }
    }

    const endMinutes = startMinutes + durationMinutes;

    if (!isAutoAssign) {
      barberTracker.set(barberIdStr, {
        nextFree: endMinutes,
        lastGuestName: guestName,
        lastGuestIndex: guestIndex,
      });
    }

    const isSequential = startMinutes > baseMinutes;
    const sequentialOffsetMinutes = startMinutes - baseMinutes;
    const start12h = formatMinutesTo12Hour(startMinutes);
    const end12h = formatMinutesTo12Hour(endMinutes);

    let badgeLabel: string;
    if (isSequential) {
      badgeLabel = precedingGuestName
        ? `Sequential Slot: Estimated at ${start12h} (${precedingGuestName.startsWith('After') ? precedingGuestName : `After ${precedingGuestName}`})`
        : `Sequential Slot: Estimated at ${start12h}`;
    } else {
      badgeLabel = `Starts at ${start12h} (Estimated ${durationMinutes} mins)`;
    }

    results.push({
      guestIndex,
      guestName,
      barberId: barberIdStr,
      barberName,
      serviceIds,
      durationMinutes,
      startMinutes,
      endMinutes,
      scheduledTime12h: start12h,
      scheduledTime24h: formatMinutesTo24Hour(startMinutes),
      estimatedEndTime12h: end12h,
      estimatedEndTime24h: formatMinutesTo24Hour(endMinutes),
      isSequential,
      sequentialOffsetMinutes,
      precedingGuestName,
      badgeLabel,
    });
  }

  return results;
};
