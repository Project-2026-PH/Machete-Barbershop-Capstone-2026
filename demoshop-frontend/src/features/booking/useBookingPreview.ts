import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { Branch, Service, AvailabilityResponse } from '@demoshop/shared-types';
import { bookingService, BookingBarber } from './booking.service';
import { useSWR } from '@/hooks/useSWR';

export const useBookingPreview = () => {
  const navigate = useNavigate();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const selectedDate = 'Today';
  const [barbers, setBarbers] = useState<BookingBarber[]>([]);
  const [availability, setAvailability] = useState<Record<string | number, AvailabilityResponse>>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingSlots, setIsLoadingSlots] = useState<boolean>(false);
  const [defaultService, setDefaultService] = useState<Service | null>(null);
  const [selectedBarber, setSelectedBarber] = useState<BookingBarber | null>(null);
  const [hasStartedLoading, setHasStartedLoading] = useState<boolean>(false);
  
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const isInitialMount = useRef<boolean>(true);

  // Setup Intersection Observer to trigger fetch only when visible
  useEffect(() => {
    if (hasStartedLoading) return;

    const currentRef = sectionRef.current;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setHasStartedLoading(true);
        }
      },
      { threshold: 0.1 }
    );

    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) observer.disconnect();
    };
  }, [hasStartedLoading]);

  // Fetch Barbers for a branch
  const fetchBarbers = useCallback(async (branch: Branch) => {
    const data = await bookingService.fetchBarbers(branch.branch_id);
    setBarbers(data);
    setSelectedBarber(null);
    setAvailability({});
  }, []);

  const fetchBranches = useCallback(async () => {
    return await bookingService.fetchBranches();
  }, []);

  const fetchServices = useCallback(async () => {
    return await bookingService.fetchServices();
  }, []);

  const { data: rawBranches } = useSWR(hasStartedLoading ? 'branches' : '', fetchBranches);
  const { data: rawServices } = useSWR(hasStartedLoading ? 'services' : '', fetchServices);

  // Sync SWR responses to component states
  useEffect(() => {
    if (!rawBranches || !rawServices) return;

    const branchesData = rawBranches;
    const servicesData = rawServices;

    const firstBranch = branchesData[0];
    setBranches(branchesData);
    if (!selectedBranch) {
      setSelectedBranch(firstBranch);
    }

    // Find "HAIR CUT" or first service as default
    const cut = servicesData.find(s => s.title === 'HAIR CUT') || servicesData[0];
    setDefaultService(cut);

    if (firstBranch && barbers.length === 0) {
      void bookingService.fetchBarbers(firstBranch.branch_id).then(setBarbers);
    }
    
    setIsLoading(false);
  }, [rawBranches, rawServices, selectedBranch, barbers.length]);

  // Branch change: skip initial mount, only re-fetch when user switches branch
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (!selectedBranch) return;

    void fetchBarbers(selectedBranch);
  }, [selectedBranch, fetchBarbers]);

  const selectedBranchId = selectedBranch?.branch_id;
  const defaultServiceId = defaultService?.service_id;
  const barberIdsKey = useMemo(
    () => barbers.map((barber) => barber.barber_id).sort((a, b) => a - b).join(','),
    [barbers],
  );

  // Fetch availability for all barbers in one request when date/branch/service changes.
  useEffect(() => {
    if (!selectedBranchId || !selectedDate || !defaultServiceId || !barberIdsKey) {
      setAvailability({});
      setIsLoadingSlots(false);
      return;
    }

    const controller = new AbortController();
    const targetDate = bookingService.formatDateForBooking(selectedDate);
    setIsLoadingSlots(true);

    void bookingService.fetchBatchAvailability(
      selectedBranchId,
      targetDate,
      [defaultServiceId],
      barberIdsKey.split(',').map(Number),
      controller.signal,
    ).then((data) => {
      if (!controller.signal.aborted) setAvailability(data.barbers || {});
    }).catch((err: any) => {
      if (controller.signal.aborted || err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') return;
      console.error('[BookingPreview] Failed to load barber availability:', err);
      setAvailability({});
    }).finally(() => {
      if (!controller.signal.aborted) setIsLoadingSlots(false);
    });

    return () => controller.abort();
  }, [selectedBranchId, selectedDate, defaultServiceId, barberIdsKey]);

  // Authoritatively evaluate and prioritize barbers:
  // 1. Available / bookable barbers
  // 2. Walk-in Only • Book Ahead
  // 3. Off Today • Book Ahead / unavailable
  const sortedBarbers = useMemo(() => {
    return barbers.map(barber => {
      const barberAvailability = availability[barber.barber_id];
      const evalResult = bookingService.evaluateBarberAvailability(barber, barberAvailability);
      return {
        ...barber,
        statusType: evalResult.statusType,
        statusLabel: evalResult.statusLabel,
        isAvailable: evalResult.isAvailable,
        priority: evalResult.priority,
      };
    }).sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      if ((b.rating ?? 0) !== (a.rating ?? 0)) {
        return (b.rating ?? 0) - (a.rating ?? 0);
      }
      return a.name.localeCompare(b.name);
    });
  }, [barbers, availability]);

  const handleBookNow = (barber: BookingBarber, slot: string | null) => {
    if (!selectedBranch || !defaultService) return;
    
    const formattedDate = bookingService.formatDateForBooking(selectedDate);
    bookingService.savePreSelectedBooking({
      branch: selectedBranch,
      barber,
      date: formattedDate,
      time: slot,
      service: defaultService
    });
    
    navigate('/booking');
  };

  return {
    sectionRef,
    branches,
    selectedBranch,
    setSelectedBranch,
    selectedDate,
    setSelectedDate: () => {},
    barbers: sortedBarbers,
    availability,
    isLoading,
    isLoadingSlots,
    selectedBarber,
    setSelectedBarber,
    hasStartedLoading,
    handleBookNow,
    dates: ['Today']
  };
};
