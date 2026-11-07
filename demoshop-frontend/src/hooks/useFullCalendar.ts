import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { api } from '@/config/api';
import { supabase } from '@/config/supabaseClient';
import { useAuth } from '@/components/auth/AuthContext';
import { groupServicesByCategory, parseShortDate, CalendarServiceCategory } from './calendar.utils';
import { bookingService, BarberAvailabilityStatusType } from '@/features/booking/booking.service';
import { AvailabilityResponse } from '@demoshop/shared-types';

export interface Branch {
  branch_id: number;
  id?: number;
  name: string;
}

export interface Barber {
  barber_id: number;
  id?: number;
  name: string;
  avatar?: string;
  image?: string | null;
  profile_picture?: string | null;
  rating?: number | string | null;
  review_count?: number | null;
  reviewCount?: number | null;
  completed_services_count?: number;
  is_top_performer?: boolean;
  isTopPerformer?: boolean;
  rank?: number | null;
  specialties?: string[];
  signature_service?: string | null;
  statusType?: BarberAvailabilityStatusType;
  statusLabel?: string;
  isAvailable?: boolean;
  priority?: number;
  availableSlotCount?: number;
}

export interface Slot {
  isAvailable: boolean;
  hour: string;
  queueCount: number;
  waitTimeMinutes: number;
}

export const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export const useFullCalendar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [serviceCategories, setServiceCategories] = useState<CalendarServiceCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(new Date().getDate());
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [showServiceDropdown, setShowServiceDropdown] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [selectedBarber, setSelectedBarber] = useState<Barber | null>(null);
  const [availableSlots, setAvailableSlots] = useState<Slot[]>([]);
  const [busyPeriods, setBusyPeriods] = useState<AvailabilityResponse['busyPeriods']>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [selectedService, setSelectedService] = useState<any | null>(null);

  // Refs to handle carry-over selections that require loaded lists to match
  const carryBarberRef = useRef<any>(null);
  const carryTimeRef = useRef<string | null>(null);

  // Fetch branches and services once
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [branchesRes, servicesRes] = await Promise.all([
          api.get('/api/queue/public/branches'),
          api.get('/api/services')
        ]);

        const branchesData = Array.isArray(branchesRes.data) ? branchesRes.data : [];
        const servicesData = Array.isArray(servicesRes.data) ? servicesRes.data : [];

        setBranches(branchesData);

        const formatted = groupServicesByCategory(servicesData);
        setServiceCategories(formatted);

        // Check if there is any location state or carry-over first
        let carryBranch: Branch | null = null;
        let carryService: any = null;

        if (location.state && location.state.serviceId) {
          carryService = {
            serviceId: location.state.serviceId,
            serviceName: location.state.serviceName,
            servicePrice: location.state.servicePrice,
            serviceDuration: location.state.serviceDuration,
            serviceDescription: location.state.serviceDescription
          };
        }

        const preSelected = localStorage.getItem('preSelectedBooking');
        if (preSelected) {
          try {
            const data = JSON.parse(preSelected);
            if (data.service) {
              carryService = {
                serviceId: data.service.id || data.service.service_id,
                serviceName: data.service.title || data.service.name,
                servicePrice: data.service.price,
                serviceDuration: data.service.duration_minutes || data.service.duration,
                serviceDescription: data.service.description
              };
            }
            if (data.branch) carryBranch = data.branch;
            if (data.barber) carryBarberRef.current = data.barber;
            if (data.date) {
              const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(data.date).trim());
              if (isoMatch) {
                const year = Number(isoMatch[1]);
                const monthIndex = Number(isoMatch[2]) - 1;
                const day = Number(isoMatch[3]);
                setCurrentDate(new Date(year, monthIndex, 1));
                setSelectedDay(day);
              } else {
                const parsed = parseShortDate(data.date, monthNames);
                if (parsed) {
                  setCurrentDate(new Date(new Date().getFullYear(), parsed.monthIndex, 1));
                  setSelectedDay(parsed.day);
                }
              }
            }
            if (data.time) {
              carryTimeRef.current = data.time;
            }
            localStorage.removeItem('preSelectedBooking');
          } catch (err) {
            console.error('[useFullCalendar] Carry-over error:', err);
          }
        }

        // Apply selected branch
        if (carryBranch) {
          setSelectedBranch(carryBranch);
        } else if (branchesData.length > 0) {
          setSelectedBranch(branchesData[0]);
        }

        // Apply selected service
        if (carryService) {
          setSelectedService(carryService);
        } else if (servicesData.length > 0) {
          const cut = servicesData.find((s: any) => s.title === 'HAIR CUT') || servicesData[0];
          if (cut) {
            setSelectedService({
              serviceId: cut.service_id || cut.id,
              serviceName: cut.title || cut.name,
              servicePrice: cut.price,
              serviceDuration: cut.duration_minutes || cut.duration,
              serviceDescription: cut.description
            });
          }
        }
      } catch (err) {
        console.error("Failed to load initial data for calendar:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchInitialData();
  }, [location.state]);

  // Fetch barbers when branch changes
  useEffect(() => {
    const fetchBarbers = async () => {
      if (!selectedBranch) return;
      const branchId = selectedBranch.branch_id || selectedBranch.id;

      try {
        const res = (await api.get(`/api/queue/public/barbers?branchId=${branchId}`)).data;
        if (Array.isArray(res)) {
          setBarbers(res);
          
          if (carryBarberRef.current) {
            const carryId = carryBarberRef.current.barber_id || carryBarberRef.current.id;
            const matched = res.find(b => (b.barber_id || b.id) === carryId);
            if (matched) {
              setSelectedBarber(matched);
            } else if (res.length > 0) {
              setSelectedBarber(res[0]);
            }
            carryBarberRef.current = null;
          } else if (res.length > 0) {
            setSelectedBarber(res[0]);
          }
        }
      } catch (err) {
        console.error("Failed to fetch barbers:", err);
      }
    };

    if (!carryBarberRef.current) {
      setSelectedBarber(null);
      setBarbers([]);
    }

    void fetchBarbers();
  }, [selectedBranch]);

  const [barberAvailabilities, setBarberAvailabilities] = useState<Record<number, AvailabilityResponse>>({});
  const [isLoadingBarbers, setIsLoadingBarbers] = useState(false);
  const [barberDutyByDate, setBarberDutyByDate] = useState<Record<string, Barber[]>>({});

  const selectedDateIso = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(selectedDay).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, [currentDate, selectedDay]);

  // Pre-fetch month duty schedules for branch barbers so calendar day tiles display live barber bubble icons
  useEffect(() => {
    const fetchMonthSchedules = async () => {
      if (barbers.length === 0) return;
      const year = currentDate.getFullYear();
      const monthNum = currentDate.getMonth() + 1;
      const monthStr = String(monthNum).padStart(2, '0');
      const lastDay = new Date(year, monthNum, 0).getDate();
      const startDate = `${year}-${monthStr}-01`;
      const endDate = `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`;

      try {
        const schedResults = await Promise.all(
          barbers.map(async (b) => {
            const bId = Number(b.barber_id ?? b.id ?? 0);
            try {
              const sched = await bookingService.fetchBarberSchedule(bId, startDate, endDate);
              return { barber: b, sched };
            } catch {
              return { barber: b, sched: null };
            }
          })
        );

        const dutyMap: Record<string, Barber[]> = {};
        for (let d = 1; d <= lastDay; d++) {
          const dayStr = String(d).padStart(2, '0');
          const dateIso = `${year}-${monthStr}-${dayStr}`;
          const dayOfWeek = new Date(year, monthNum - 1, d).getDay();

          const activeBarbers: Barber[] = [];
          for (const item of schedResults) {
            const b = item.barber;
            const sched = item.sched;
            if (!sched) {
              activeBarbers.push(b);
              continue;
            }
            const isExplicitOff = sched.offDutyDates.includes(dateIso);
            const isDetailOff = sched.dateDetails?.[dateIso]?.isOff === true;
            const isRestDay = sched.recurringRestDays.includes(dayOfWeek) && !sched.onlineBookingDates.includes(dateIso);

            if (!isExplicitOff && !isDetailOff && !isRestDay) {
              activeBarbers.push(b);
            }
          }
          dutyMap[dateIso] = activeBarbers;
        }

        setBarberDutyByDate(dutyMap);
      } catch (err) {
        console.error("Failed to load month barber schedules:", err);
      }
    };

    void fetchMonthSchedules();
  }, [barbers, currentDate]);

  // Fetch availability for all barbers on date/service change for instant availability and zero-lag switching
  const [recentlyTakenSlots, setRecentlyTakenSlots] = useState<string[]>([]);
  const prevSlotsRef = useRef<Slot[]>([]);
  const selectedBranchId = selectedBranch?.branch_id || selectedBranch?.id;
  const selectedServiceId = selectedService?.serviceId || selectedService?.service_id || selectedService?.id;
  const barberIdsKey = useMemo(
    () => barbers.map((barber) => Number(barber.barber_id ?? barber.id ?? 0)).filter(Boolean).sort((a, b) => a - b).join(','),
    [barbers],
  );

  // Fetch availability for all barbers with one request on date/service changes.
  const fetchAllBarberAvailabilities = useCallback(async (signal?: AbortSignal) => {
    if (!selectedBranchId || !selectedServiceId || !barberIdsKey) return;
    setIsLoadingBarbers(true);
    setIsLoadingSlots(true);
    try {
      const data = await bookingService.fetchBatchAvailability(
        Number(selectedBranchId),
        selectedDateIso,
        [Number(selectedServiceId)],
        barberIdsKey.split(',').map(Number),
        signal,
      );
      if (!signal?.aborted) {
        const map: Record<number, AvailabilityResponse> = {};
        for (const [barberId, availability] of Object.entries(data.barbers || {})) {
          map[Number(barberId)] = availability;
        }
        setBarberAvailabilities(map);
      }
    } catch (err: any) {
      if (signal?.aborted || err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') return;
      console.error("Failed to load barber availabilities:", err);
    } finally {
      if (!signal?.aborted) {
        setIsLoadingBarbers(false);
        setIsLoadingSlots(false);
      }
    }
  }, [selectedBranchId, selectedServiceId, barberIdsKey, selectedDateIso]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchAllBarberAvailabilities(controller.signal);
    return () => controller.abort();
  }, [fetchAllBarberAvailabilities]);

  // Real-time synchronization when cashier adds/updates queue or reservations
  useEffect(() => {
    const channel = supabase
      .channel('fullcalendar-live-queue-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'queue_entries' },
        () => {
          void fetchAllBarberAvailabilities();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reservations' },
        () => {
          void fetchAllBarberAvailabilities();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchAllBarberAvailabilities]);

  // Track taken slots live to animate when another customer/cashier takes a slot
  useEffect(() => {
    if (prevSlotsRef.current.length > 0 && availableSlots.length > 0) {
      const currentHours = new Set(availableSlots.map(s => s.hour));
      const taken = prevSlotsRef.current
        .filter(s => s.isAvailable && !currentHours.has(s.hour))
        .map(s => s.hour);

      if (taken.length > 0) {
        setRecentlyTakenSlots(prev => Array.from(new Set([...prev, ...taken])));
        const timer = setTimeout(() => {
          setRecentlyTakenSlots(prev => prev.filter(h => !taken.includes(h)));
        }, 4000);
        return () => clearTimeout(timer);
      }
    }
    prevSlotsRef.current = availableSlots;
  }, [availableSlots]);

  // Evaluate barbers with STABLE ORDER: Never dynamically rearrange barber names filter!
  const barbersWithStatus = useMemo(() => {
    const ranked = [...barbers].sort((a, b) => {
      const aRank = typeof a.rank === 'number' ? a.rank : null;
      const bRank = typeof b.rank === 'number' ? b.rank : null;
      if (aRank !== null && bRank !== null) return aRank - bRank;
      if (aRank !== null) return -1;
      if (bRank !== null) return 1;

      const aCuts = Number(a.completed_services_count || 0);
      const bCuts = Number(b.completed_services_count || 0);
      if (bCuts !== aCuts) return bCuts - aCuts;

      const aRating = Number(a.rating || 0);
      const bRating = Number(b.rating || 0);
      if (bRating !== aRating) return bRating - aRating;

      const aReviews = Number(a.review_count || a.reviewCount || 0);
      const bReviews = Number(b.review_count || b.reviewCount || 0);
      if (bReviews !== aReviews) return bReviews - aReviews;

      return Number(a.barber_id ?? a.id ?? 0) - Number(b.barber_id ?? b.id ?? 0);
    });

    const fallbackRankMap = new Map<number, number>();
    ranked.forEach((b, idx) => {
      const id = Number(b.barber_id ?? b.id ?? 0);
      fallbackRankMap.set(id, typeof b.rank === 'number' ? b.rank : idx + 1);
    });
    return barbers.map(barber => {
      const bId = Number(barber.barber_id ?? barber.id ?? 0);
      const avail = barberAvailabilities[bId];
      const evalResult = bookingService.evaluateBarberAvailability(barber, avail, selectedDateIso);
      const slots = avail?.availableSlots || [];
      const computedRank = typeof barber.rank === 'number' ? barber.rank : fallbackRankMap.get(bId) ?? null;
      const isTop = Boolean(barber.is_top_performer ?? barber.isTopPerformer ?? false);
      return {
        ...barber,
        barber_id: bId,
        rank: computedRank,
        is_top_performer: isTop,
        isTopPerformer: isTop,
        statusType: evalResult.statusType,
        statusLabel: evalResult.statusLabel,
        isAvailable: evalResult.isAvailable,
        priority: evalResult.priority,
        availableSlotCount: slots.length,
      };
    }).sort((a, b) => {
      // Stable roster order: Keep consistent ordering so names filter never jumps around
      const idA = a.barber_id ?? a.id ?? 0;
      const idB = b.barber_id ?? b.id ?? 0;
      return idA - idB;
    });
  }, [barbers, barberAvailabilities, selectedDateIso]);

  // Keep selectedBarber synced ONLY if a barber was already selected
  // If user is browsing "All Barbers" (selectedBarber === null), DO NOT automatically force a barber on date changes!
  useEffect(() => {
    if (barbersWithStatus.length === 0) return;
    const currentId = selectedBarber?.barber_id || selectedBarber?.id;
    if (!currentId) return;

    const found = barbersWithStatus.find(b => (b.barber_id || b.id) === currentId);
    if (found && found !== selectedBarber) {
      setSelectedBarber(found);
    }
  }, [barbersWithStatus]);

  // Sync availableSlots and busyPeriods immediately for the selected barber
  useEffect(() => {
    const barberId = selectedBarber?.barber_id || selectedBarber?.id;
    if (!barberId) {
      setAvailableSlots([]);
      setBusyPeriods([]);
      return;
    }
    const avail = barberAvailabilities[barberId];
    if (avail) {
      setAvailableSlots(avail.availableSlots || []);
      setBusyPeriods(avail.busyPeriods || []);
    }
  }, [selectedBarber, barberAvailabilities]);

  // Match carry-over time slot when availableSlots update
  useEffect(() => {
    if (carryTimeRef.current && availableSlots.length > 0) {
      const idx = availableSlots.findIndex(s => s.hour === carryTimeRef.current);
      if (idx !== -1) {
        setSelectedSlot(idx);
      }
      carryTimeRef.current = null;
    }
  }, [availableSlots]);


  const todayDate = useMemo(() => new Date(), []);
  const todayMidnight = useMemo(
    () => new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate()),
    [todayDate]
  );
  const maxBookingDate = useMemo(
    () => new Date(todayMidnight.getFullYear(), todayMidnight.getMonth() + 1, todayMidnight.getDate()),
    [todayMidnight]
  );

  const isPrevDisabled = useMemo(() => {
    return currentDate.getFullYear() <= todayMidnight.getFullYear() && currentDate.getMonth() <= todayMidnight.getMonth();
  }, [currentDate, todayMidnight]);

  const isNextDisabled = useMemo(() => {
    const nextMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    const maxMonth = new Date(maxBookingDate.getFullYear(), maxBookingDate.getMonth(), 1);
    return nextMonth > maxMonth;
  }, [currentDate, maxBookingDate]);

  const handlePrevMonth = () => {
    if (isPrevDisabled) return;
    const prev = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    setCurrentDate(prev);
    if (prev.getMonth() === todayMidnight.getMonth() && prev.getFullYear() === todayMidnight.getFullYear()) {
      if (selectedDay < todayMidnight.getDate()) {
        setSelectedDay(todayMidnight.getDate());
      }
    }
  };

  const handleNextMonth = () => {
    if (isNextDisabled) return;
    const next = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    setCurrentDate(next);
    if (next.getMonth() === maxBookingDate.getMonth() && next.getFullYear() === maxBookingDate.getFullYear()) {
      if (selectedDay > maxBookingDate.getDate()) {
        setSelectedDay(1);
      }
    }
  };

  const handleClearService = () => {
    setSelectedService(null);
    setShowServiceDropdown(false);
    setSelectedCategory(null);
  };

  const handleServiceSelect = (service: any) => {
    setSelectedService({
      serviceId: service.id,
      serviceName: service.title,
      servicePrice: service.price,
      serviceDuration: service.duration,
      serviceDescription: service.description
    });
    setShowServiceDropdown(false);
    setSelectedCategory(null);
  };

  const handleProceed = () => {
    if (!selectedBranch || !selectedService || selectedSlot === null || !availableSlots[selectedSlot]) return;

    const chosenDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), selectedDay);
    if (chosenDate < todayMidnight || chosenDate > maxBookingDate) return;

    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(selectedDay).padStart(2, '0');
    const dateIso = `${year}-${month}-${day}`;

    const bookingData = {
      branch: selectedBranch,
      barber: selectedBarber,
      date: dateIso,
      time: availableSlots[selectedSlot].hour,
      service: selectedService
    };

    localStorage.setItem('preSelectedBooking', JSON.stringify(bookingData));

    if (user) {
      navigate('/dashboard');
    } else {
      navigate('/login');
    }
  };

  return {
    branches,
    selectedBranch,
    setSelectedBranch,
    barbers: barbersWithStatus,
    barberDutyByDate,
    selectedBarber,
    setSelectedBarber,
    isLoadingBarbers,
    serviceCategories,
    selectedService,
    setSelectedService,
    currentDate,
    setCurrentDate,
    selectedDay,
    setSelectedDay,
    availableSlots,
    recentlyTakenSlots,
    busyPeriods,
    selectedSlot,
    setSelectedSlot,
    isLoadingSlots,
    showServiceDropdown,
    setShowServiceDropdown,
    selectedCategory,
    setSelectedCategory,
    isLoading,
    handlePrevMonth,
    handleNextMonth,
    isPrevDisabled,
    isNextDisabled,
    todayDate,
    todayMidnight,
    maxBookingDate,
    handleClearService,
    handleServiceSelect,
    handleProceed,
    isAuthenticated: !!user
  };
};
