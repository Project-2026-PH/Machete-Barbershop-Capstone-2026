import { api } from '@/config/api';
import { Branch, Barber, Service, AvailabilityResponse, BatchAvailabilityResponse } from '@demoshop/shared-types';
import { getManilaDateIso, addDaysToIsoDate } from '@/utils/manila-date';
import { customerCache, makeCacheKey } from '@/features/customer/services/customer-cache';

export interface BookingBarber extends Partial<Barber> {
  barber_id: number;
  name: string;
  specialty?: string;
  specialties?: string[];
  rating?: number | null;
  review_count?: number;
  bio?: string;
  image?: string;
  branch_id: number;
  status?: string;
  statusType?: BarberAvailabilityStatusType;
  statusLabel?: string;
  isAvailable?: boolean;
  priority?: number;
  is_top_performer?: boolean;
  isTopPerformer?: boolean;
  rank?: number | null;
  completed_services_count?: number;
  availableSlotCount?: number;
}

export type BarberAvailabilityStatusType = 'available' | 'walkin_only' | 'serving' | 'day_off' | 'off_today';

export interface BarberAvailabilityEvaluation {
  statusType: BarberAvailabilityStatusType;
  statusLabel: string;
  isAvailable: boolean;
  priority: number; // 1 = available, 2 = walkin_only, 3 = off_today / day_off
}

export const mockBarbers: BookingBarber[] = [];

type PublicBarberScheduleMap = Record<string, {
  barberId: number;
  barberName: string;
  offDutyDates: string[];
  onlineBookingDates: string[];
  recurringRestDays: number[];
  dateDetails: Record<string, { isOff: boolean; isOnDuty?: boolean; isOnlineBookingEnabled?: boolean; reason: string }>;
}>;


/**
 * Service to handle booking data interactions, normalization, and caching/storage actions.
 */
export const bookingService = {
  /**
   * Authoritatively evaluates barber availability and status type using backend schedule & availability data.
   */
  evaluateBarberAvailability: (
    barber: any,
    availability?: AvailabilityResponse | null,
    targetDate?: string
  ): BarberAvailabilityEvaluation => {
    const todayIso = getManilaDateIso();
    const isTargetToday = !targetDate || targetDate === todayIso;

    // 1. Explicit backend availability response failure/unavailable
    if (availability?.isUnavailable) {
      const reason = (availability.reason || '').toLowerCase();
      if (reason.includes('online booking disabled') || reason.includes('walk-in')) {
        return {
          statusType: 'walkin_only',
          statusLabel: isTargetToday ? 'Walk-in Only • Book Ahead' : 'Walk-in Only',
          isAvailable: false,
          priority: 2,
        };
      }
      return {
        statusType: 'off_today',
        statusLabel: isTargetToday ? 'Off Today • Book Ahead' : (availability.reason || 'Off Duty on this date'),
        isAvailable: false,
        priority: 3,
      };
    }

    // 2. FOR FUTURE DATES: Enable booking ahead based on future schedule & available slots
    if (!isTargetToday) {
      if (availability && Array.isArray(availability.availableSlots)) {
        if (availability.availableSlots.length > 0) {
          return {
            statusType: 'available',
            statusLabel: 'Available to Book',
            isAvailable: true,
            priority: 1,
          };
        } else {
          return {
            statusType: 'off_today',
            statusLabel: 'Fully Booked',
            isAvailable: false,
            priority: 3,
          };
        }
      }
      // If availability is still loading for a future date, default to active check
      const rawStatus = (barber.status || 'Available').toString().toLowerCase().trim();
      const isInactive = rawStatus === 'unavailable' || rawStatus === 'inactive' || rawStatus === 'suspended';
      if (isInactive) {
        return {
          statusType: 'off_today',
          statusLabel: 'Unavailable',
          isAvailable: false,
          priority: 3,
        };
      }
      return {
        statusType: 'available',
        statusLabel: 'Available to Book',
        isAvailable: true,
        priority: 1,
      };
    }

    // 3. FOR TODAY: Apply live in-shop floor status
    const rawStatus = (barber.status || 'Available').toString().toLowerCase().trim();
    const isExplicitOff = ['day off', 'day_off', 'off duty', 'off_duty', 'offduty'].includes(rawStatus);
    const isLeave = rawStatus === 'leave' || rawStatus.includes('leave');
    const isBreak = rawStatus === 'break' || rawStatus.includes('break');
    const isInactive = rawStatus === 'unavailable' || rawStatus === 'inactive' || rawStatus === 'suspended';

    const isOnDuty = barber.isOnDutyToday !== undefined
      ? Boolean(barber.isOnDutyToday)
      : (barber.is_on_duty_today !== undefined ? Boolean(barber.is_on_duty_today) : !barber.is_off_today);

    const isOnlineBookingEnabled = barber.isOnlineBookingEnabledToday !== undefined
      ? Boolean(barber.isOnlineBookingEnabledToday)
      : (barber.is_online_booking_enabled_today !== undefined
          ? Boolean(barber.is_online_booking_enabled_today)
          : (barber.is_online_booking_enabled !== undefined ? Boolean(barber.is_online_booking_enabled) : true));

    const isOffSchedule = !isOnDuty || barber.is_off_today === true || isExplicitOff;

    if (isLeave || isOffSchedule) {
      return {
        statusType: 'off_today',
        statusLabel: 'Off Today • Book Ahead',
        isAvailable: false,
        priority: 3,
      };
    }

    if (isBreak) {
      return {
        statusType: 'day_off',
        statusLabel: 'On Break',
        isAvailable: false,
        priority: 3,
      };
    }

    if (isInactive) {
      return {
        statusType: 'day_off',
        statusLabel: 'Unavailable',
        isAvailable: false,
        priority: 3,
      };
    }

    if (isOnDuty && !isOnlineBookingEnabled) {
      return {
        statusType: 'walkin_only',
        statusLabel: 'Walk-in Only • Book Ahead',
        isAvailable: false,
        priority: 2,
      };
    }

    if (availability && Array.isArray(availability.availableSlots) && availability.availableSlots.length === 0) {
      return {
        statusType: 'off_today',
        statusLabel: 'Fully Booked Today • Book Ahead',
        isAvailable: false,
        priority: 3,
      };
    }

    return {
      statusType: 'available',
      statusLabel: 'Available',
      isAvailable: true,
      priority: 1,
    };
  },

  /**
   * Fetches the list of active branches.
   */
  fetchBranches: async (): Promise<Branch[]> => {
    try {
      const res = await api.get('/api/queue/public/branches');
      return Array.isArray(res.data) ? res.data : [];
    } catch (err) {
      console.error('[BookingService] Failed to fetch branches:', err);
      return [];
    }
  },

  /**
   * Fetches all available services with caching.
   */
  fetchServices: async (): Promise<Service[]> => {
    return customerCache.fetch(
      makeCacheKey('services', 'all'),
      'services',
      async () => {
        try {
          const res = await api.get('/api/services');
          return Array.isArray(res.data) ? res.data : [];
        } catch (err) {
          console.error('[BookingService] Failed to fetch services:', err);
          throw err;
        }
      }
    );
  },

  /**
   * Fetches barbers registered to a specific branch. Falls back to mock values if unavailable.
   */
  fetchBarbers: async (branchId: number): Promise<BookingBarber[]> => {
    return customerCache.fetch(
      makeCacheKey('barbers', branchId),
      'barbers',
      async () => {
        try {
          const res = await api.get(`/api/queue/public/barbers?branchId=${branchId}`);
          if (res.data && Array.isArray(res.data) && res.data.length > 0) {
            return res.data.map((b: any) => ({
              ...b,
              barber_id: b.barber_id || b.id
            }));
          }
        } catch (err) {
          console.error('[BookingService] Failed to fetch barbers:', err);
          throw err;
        }
        return [];
      },
      { tags: [`branch:${branchId}`] }
    );
  },

  /**
   * Fetches timeslot availability for a specific barber on a given date and service.
   * Ensures canonical ISO date (YYYY-MM-DD) and branchId are provided.
   */
  fetchAvailability: async (
    barberId: number,
    dateStr: string,
    serviceId: number,
    branchId?: number
  ): Promise<AvailabilityResponse> => {
    try {
      const canonicalDate = /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
        ? dateStr
        : bookingService.formatDateForBooking(dateStr);

      const params = new URLSearchParams({
        barberId: String(barberId),
        date: canonicalDate,
        serviceId: String(serviceId),
      });

      if (branchId) {
        params.append('branchId', String(branchId));
      }

      const res = await api.get(`/api/queue/availability?${params.toString()}`);
      if (Array.isArray(res.data)) {
        return {
          availableSlots: res.data.filter((slot: any) => slot.isAvailable),
          busyPeriods: [],
        };
      }
      return {
        availableSlots: Array.isArray(res.data?.availableSlots) ? res.data.availableSlots : [],
        busyPeriods: Array.isArray(res.data?.busyPeriods) ? res.data.busyPeriods : [],
      };
    } catch (err) {
      console.error('[BookingService] Failed to fetch availability for barber:', barberId, err);
      return { availableSlots: [], busyPeriods: [] };
    }
  },

  /**
   * Fetches availability for all candidate barbers in one request, with in-flight coalescing and caching.
   */
  fetchBatchAvailability: async (
    branchId: number,
    dateStr: string,
    serviceIds: number[] = [],
    barberIds: number[] = [],
    signal?: AbortSignal,
    options: { throwOnError?: boolean; forceRevalidate?: boolean } = {},
  ): Promise<BatchAvailabilityResponse> => {
    const canonicalDate = /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
      ? dateStr
      : bookingService.formatDateForBooking(dateStr);

    const sKey = serviceIds.length > 0 ? [...new Set(serviceIds)].sort((a, b) => a - b).join('-') : 'all';
    const bKey = barberIds.length > 0 ? [...new Set(barberIds)].sort((a, b) => a - b).join('-') : 'all';
    const cacheKey = makeCacheKey('slot-availability', branchId, canonicalDate, sKey, bKey);

    return customerCache.fetch(
      cacheKey,
      'slot-availability',
      async (fetchSignal) => {
        const params = new URLSearchParams({
          branchId: String(branchId),
          date: canonicalDate,
        });
        if (serviceIds.length > 0) params.set('serviceIds', [...new Set(serviceIds)].sort((a, b) => a - b).join(','));
        if (barberIds.length > 0) params.set('barberIds', [...new Set(barberIds)].sort((a, b) => a - b).join(','));

        try {
          const res = await api.get(`/api/queue/availability/batch?${params.toString()}`, { signal: fetchSignal });
          return {
            date: res.data?.date || canonicalDate,
            branchId: Number(res.data?.branchId || branchId),
            slots: res.data?.slots || {},
            barbers: res.data?.barbers || {},
          };
        } catch (err: any) {
          if (fetchSignal?.aborted || signal?.aborted || err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') {
            throw err;
          }
          console.error('[BookingService] Failed to fetch batch availability:', {
            branchId,
            date: canonicalDate,
            serviceCount: serviceIds.length,
            barberCount: barberIds.length,
            error: err?.message || String(err),
          });
          // Never cache an error-shaped empty response. Callers that need a
          // fallback can handle the rejected promise at their boundary.
          throw err;
        }
      },
      {
        signal,
        forceRevalidate: options.forceRevalidate,
        tags: [`branch:${branchId}`, `date:${canonicalDate}`],
      }
    );
  },

  /**
   * Fetches the public schedules for every active barber in one branch-scoped request with caching and coalescing.
   */
  fetchBarberSchedules: async (
    branchId: number,
    startDate: string,
    endDate: string,
    signal?: AbortSignal,
    options: { forceRevalidate?: boolean } = {},
  ): Promise<PublicBarberScheduleMap> => {
    const cacheKey = makeCacheKey('barber-schedules', branchId, startDate, endDate);

    return customerCache.fetch(
      cacheKey,
      'barber-schedules',
      async (fetchSignal) => {
        try {
          const params = new URLSearchParams({
            branchId: String(branchId),
            startDate,
            endDate,
          });
          const res = await api.get(`/api/queue/public/barber-schedules?${params.toString()}`, { signal: fetchSignal });
          return (res.data?.schedules || {}) as PublicBarberScheduleMap;
        } catch (err: any) {
          if (fetchSignal?.aborted || signal?.aborted || err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') {
            throw err;
          }
          console.warn('[BookingService] Failed to fetch barber schedules:', err);
          throw err;
        }
      },
      {
        signal,
        forceRevalidate: options.forceRevalidate,
        tags: [`branch:${branchId}`],
      }
    );
  },


  /**
   * Fetches public rostered schedule, recurring rest days, and approved leave dates for a barber.
   */
  fetchBarberSchedule: async (
    barberId: number,
    startDate?: string,
    endDate?: string,
    signal?: AbortSignal,
  ): Promise<{
    barberId: number;
    barberName: string;
    offDutyDates: string[];
    onlineBookingDates: string[];
    recurringRestDays: number[];
    dateDetails: Record<string, { isOff: boolean; isOnDuty?: boolean; isOnlineBookingEnabled?: boolean; reason: string }>;
  }> => {
    try {
      const params = new URLSearchParams({ barberId: String(barberId) });
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      const res = await api.get(`/api/queue/public/barber-schedule?${params.toString()}`, { signal });
      if (res.data) {
        return {
          barberId: res.data.barberId || barberId,
          barberName: res.data.barberName || 'Barber',
          offDutyDates: Array.isArray(res.data.offDutyDates) ? res.data.offDutyDates : [],
          onlineBookingDates: Array.isArray(res.data.onlineBookingDates) ? res.data.onlineBookingDates : [],
          recurringRestDays: Array.isArray(res.data.recurringRestDays) ? res.data.recurringRestDays : [],
          dateDetails: res.data.dateDetails || {},
        };
      }
    } catch (err: any) {
      if (signal?.aborted || err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') {
        throw err;
      }
      console.warn('[BookingService] Failed to fetch barber schedule, defaulting:', err);
    }
    return {
      barberId,
      barberName: 'Barber',
      offDutyDates: [],
      onlineBookingDates: [],
      recurringRestDays: [0], // Default Sunday rest day
      dateDetails: {},
    };
  },

  /**
   * Formats string representations of dates (e.g. 'Today', 'Tomorrow') to canonical ISO format (YYYY-MM-DD).
   * Employs Manila timezone calculations to prevent calendar day shifts across UTC boundaries.
   */
  formatDateForBooking: (selectedDate: string): string => {
    const trimmed = String(selectedDate || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    const todayIso = getManilaDateIso();
    if (trimmed === 'Today') {
      return todayIso;
    }
    if (trimmed === 'Tomorrow') {
      return addDaysToIsoDate(todayIso, 1);
    }

    // Defensive parsing for legacy short/long representations e.g. "Sep 30" or "September 30"
    const monthMatch = /^([a-zA-Z]+)\s+(\d{1,2})$/.exec(trimmed);
    if (monthMatch) {
      const monthNames = [
        'january', 'february', 'march', 'april', 'may', 'june',
        'july', 'august', 'september', 'october', 'november', 'december'
      ];
      const mIdx = monthNames.findIndex(m => m.startsWith(monthMatch[1].toLowerCase()));
      if (mIdx !== -1) {
        const year = Number(todayIso.slice(0, 4));
        const month = String(mIdx + 1).padStart(2, '0');
        const day = String(Number(monthMatch[2])).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
    }

    return todayIso;
  },

  /**
   * Safely maps and stores the current selection payload into the client's transient local storage.
   */
  savePreSelectedBooking: (params: {
    branch: Branch;
    barber: BookingBarber;
    date: string;
    time: string | null;
    service: Service;
  }): void => {
    const bookingData = {
      branch: { ...params.branch, id: params.branch.branch_id },
      barber: { id: params.barber.barber_id, name: params.barber.name },
      date: params.date,
      time: params.time,
      service: { ...params.service, id: params.service.service_id }
    };
    localStorage.setItem('preSelectedBooking', JSON.stringify(bookingData));
  }
};
