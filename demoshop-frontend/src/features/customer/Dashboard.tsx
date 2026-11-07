import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  CheckCircle,
  Info,
  AlertTriangle,
  Moon,
  Sun,
  User,
  Calendar,
  LayoutDashboard,
  Store,
  Scissors,
  Shield
} from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';

// General Components
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/feedback/ToastContext';
import { NotificationBell, type AppNotification } from '@/components/common/NotificationBell';

import { BottomNavigation } from './components/BottomNavigation';
import { SidebarNavigation } from './components/SidebarNavigation';
import { ModuleSwitcher } from '@/components/navigation/ModuleSwitcher';

// Components Tab
import { OverviewTab } from './components/OverviewTab';
import { useNavigate, useParams } from 'react-router';
import { Modal } from '@/components/feedback/Modal';
import { EmergencyRebookingModal, type AffectedBookingNotice } from './components/EmergencyRebookingModal';
import { BookingConfirmedAlertModal, type ConfirmedBookingAlertData } from './components/BookingConfirmedAlertModal';
import { ScheduleAdjustmentModal } from './components/ScheduleAdjustmentModal';
import { services, barbers, timeSlots, branches, getBranchStatus } from './data';

import { api } from '@/config/api';
import { bookingService } from '@/features/booking/booking.service';
import { addDaysToIsoDate, getManilaDateIso } from '@/utils/manila-date';
import { useAuth } from '@/components/auth/AuthContext';
import { useSWR } from '@/hooks/useSWR';
import { supabase } from '@/config/supabaseClient';
import { customerCache, makeCacheKey } from '@/features/customer/services/customer-cache';
import { isActiveCustomerQueueEntry } from './services/customer-queue-state';

const BookTab = React.lazy(() => import('./components/BookTab').then((module) => ({ default: module.BookTab })));
const ProfileTab = React.lazy(() => import('./components/ProfileTab').then((module) => ({ default: module.ProfileTab })));
const PaymentsTab = React.lazy(() => import('./components/PaymentsTab').then((module) => ({ default: module.PaymentsTab })));
const SettingsTab = React.lazy(() => import('./components/SettingsTab').then((module) => ({ default: module.SettingsTab })));
const QueueTab = React.lazy(() => import('./components/QueueTab').then((module) => ({ default: module.QueueTab })));
const HistoryTab = React.lazy(() => import('./components/HistoryTab').then((module) => ({ default: module.HistoryTab })));
import { createHasuraFallbackGroup } from '@/utils/hasura-realtime-group';
import { createRealtimeFallback } from '@/utils/supabase-realtime';
import {
  getBookingCheckpoint,
  saveBookingCheckpoint,
  clearBookingCheckpoint,
} from '@/features/booking/booking-checkpoint';

const CUSTOMER_VISIBLE_NOTIFICATION_EVENTS = ['reservation_pending', 'reservation_confirmed', 'reservation_declined', 'reservation_cancelled', 'schedule_delay', 'schedule_adjusted'] as const;
const CUSTOMER_POPUP_NOTIFICATION_EVENTS = ['reservation_declined', 'reservation_cancelled', 'reservation_confirmed', 'schedule_delay', 'schedule_adjusted'] as const;

const fetchCustomerResource = <T,>(
  key: string,
  domain: 'reservation-history' | 'queue-position' | 'default',
  path: string,
  forceRevalidate = false,
): Promise<T> => customerCache.fetch<T>(
  key,
  domain,
  async (signal) => {
    const response = await api.get<T>(path, { signal });
    return response.data;
  },
  { forceRevalidate },
);

export const Dashboard = () => {
  const navigate = useNavigate();
  const { '*': tabPath } = useParams();
  const activeTab = tabPath || 'overview';
  const { logout, user, authReady, isSystemAdmin, supabaseToken, refetchMe } = useAuth();
  const { addToast } = useToast();
  const customerScope = String((user as any)?.user_id || (user as any)?.id || 'current');

  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState<boolean>(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [theme, setTheme] = useState<string>(localStorage.getItem('theme') || 'dark');
  const [selectedNotification, setSelectedNotification] = useState<any | null>(null);
  const [scheduleAdjustmentNotification, setScheduleAdjustmentNotification] = useState<any | null>(null);
  const [emergencyNotice, setEmergencyNotice] = useState<AffectedBookingNotice | null>(null);
  // Deposit transfers are handled only by the dedicated emergency
  // cancellation modal. Do not restore the old generic rebooking context from
  // localStorage, because it could show a transferred deposit for a rejected
  // receipt or ordinary cancellation.
  const [rebookingContext, setRebookingContextState] = useState<{ queueId: number } | null>(null);
  const [isManualRebooking, setIsManualRebooking] = useState(false);

  const setRebookingContext = useCallback((ctx: { queueId: number } | null) => {
    setRebookingContextState(ctx);
  }, []);
  const [confirmedBookingAlert, setConfirmedBookingAlert] = useState<ConfirmedBookingAlertData | null>(null);
  const activeQueueRef = useRef<any>(null);


  // Sync avatar profile picture from global AuthContext
  useEffect(() => {
    const pic = user?.profile_picture || (user as any)?.profilePicture;
    if (pic) {
      setUserData((prev: any) => (prev ? { ...prev, profile_picture: pic } : prev));
    }
  }, [user?.profile_picture, (user as any)?.profilePicture]);



  // Global Loading & Error States
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // User Data State
  const [userData, setUserData] = useState<any | null>(null);
  const [upcomingAppointmentData, setUpcomingAppointmentData] = useState<any | null>(null);
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [transactionsData, setTransactionsData] = useState<any[]>([]);

  // Queue State
  const [activeQueue, setActiveQueue] = useState<any | null>(null);

  // Sync ref with activeQueue
  useEffect(() => {
    activeQueueRef.current = activeQueue;
  }, [activeQueue]);

  // Booking State with Checkpoint Recovery
  const [initialBookingCheckpoint] = useState(() => getBookingCheckpoint());
  const [bookingStep, setBookingStep] = useState(() => {
    if (initialBookingCheckpoint?.isRebooking) {
      return (typeof window !== 'undefined' && window.innerWidth < 768) ? 5 : 4;
    }
    return initialBookingCheckpoint?.bookingMode ? (initialBookingCheckpoint?.step ?? 0) : 0;
  });
  const [bookingResetVersion, setBookingResetVersion] = useState(0);
  const [selectedService, setSelectedService] = useState<any>(() => initialBookingCheckpoint?.selectedService || null);
  const [selectedBarber, setSelectedBarber] = useState<any>(() => initialBookingCheckpoint?.selectedBarber || null);
  const [selectedDate, setSelectedDate] = useState<string | null>(() => initialBookingCheckpoint?.selectedDate || null);
  const [selectedTime, setSelectedTime] = useState<string | null>(() => initialBookingCheckpoint?.selectedTime || null);
  const [selectedBranch, setSelectedBranch] = useState(() => {
    const saved = localStorage.getItem('selectedBranch');
    return saved ? JSON.parse(saved) : (initialBookingCheckpoint?.selectedBranch || null);
  });
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );

  useEffect(() => {
    const handleResize = () => {
      setIsMobileViewport(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isTimeSlotLocked = activeTab === 'book' && (
    (bookingStep === 2 && isMobileViewport) ||
    (bookingStep === 1 && !isMobileViewport)
  );

  // Persist booking state checkpoint on progress
  useEffect(() => {
    if (bookingStep > 0 || selectedService || selectedBarber || selectedDate || selectedTime) {
      saveBookingCheckpoint({
        step: bookingStep,
        selectedService,
        selectedBarber,
        selectedDate,
        selectedTime,
        selectedBranch,
        isRebooking: Boolean(rebookingContext),
        rebookingQueueId: rebookingContext?.queueId ?? null,
      });
    }
  }, [bookingStep, selectedService, selectedBarber, selectedDate, selectedTime, selectedBranch, rebookingContext]);

  const [branchesList, setBranchesList] = useState(branches);
  const [servicesList, setServicesList] = useState(services);
  const [barbersList, setBarbersList] = useState(barbers);
  const barbersListRef = useRef<any[]>(barbers);

  useEffect(() => {
    barbersListRef.current = barbersList;
  }, [barbersList]);

  // Helper to switch tabs via navigation
  const setActiveTab = useCallback((newTab: string) => {
    navigate(`/dashboard/${newTab}`);
  }, [navigate]);

  // Helper to reset booking form back to step 0 and clear checkpoint
  const resetBookingForm = useCallback((initialStep = 0) => {
    clearBookingCheckpoint();
    setRebookingContext(null);
    setIsManualRebooking(false);
    setBookingResetVersion((version) => version + 1);
    setBookingStep(initialStep);
    setSelectedService(null);
    setSelectedBarber(null);
    setSelectedDate(null);
    setSelectedTime(null);
  }, [setRebookingContext]);

  const onJoinQueue = useCallback((data: any) => {
    setActiveQueue(data);
    resetBookingForm();
    setActiveTab('queue');
  }, [setActiveQueue, setActiveTab, resetBookingForm]);

  // The server is authoritative after a reservation is committed. A refresh can
  // restore the old payment-step draft from localStorage even though the join
  // request already created a pending queue entry.
  const reconcileServerQueueEntry = useCallback((entry: any) => {
    setActiveQueue(entry);
    if (getBookingCheckpoint()) {
      resetBookingForm();
      setActiveTab('queue');
    }
  }, [resetBookingForm, setActiveQueue, setActiveTab]);

  const handleNewNotification = useCallback((notification: AppNotification) => {
    if (notification.event === 'reservation_confirmed') {
      const qId = notification.queue_entry_id || activeQueueRef.current?.id;
      const bName = activeQueueRef.current?.barber_name
        || activeQueueRef.current?.barber?.name
        || barbersListRef.current?.find((b: any) => b.id === activeQueueRef.current?.barber_id)?.name;
      const guestCount = (notification as any)?.metadata?.guestCount
        || (notification as any)?.metadata?.total_guests
        || activeQueueRef.current?.total_guests
        || (activeQueueRef.current?.isGroup ? activeQueueRef.current?.guests?.length : 1);
      const totalDeposit = (notification as any)?.metadata?.totalDeposit
        || (notification as any)?.metadata?.total_deposit
        || activeQueueRef.current?.total_deposit
        || (guestCount && guestCount > 1 ? guestCount * 50 : 50);

      setConfirmedBookingAlert({
        id: qId,
        barberName: bName,
        serviceName: activeQueueRef.current?.service?.name || activeQueueRef.current?.service_name,
        preferredDate: activeQueueRef.current?.preferred_date || activeQueueRef.current?.scheduled_start_at,
        preferredTime: activeQueueRef.current?.preferred_time,
        branchName: activeQueueRef.current?.branch?.name || activeQueueRef.current?.branch_name,
        guestCount,
        totalDeposit,
      });
      return;
    }
    setSelectedNotification(notification);
    void api.patch(`/api/notifications/${notification.id}/read`).then(() => {
      window.dispatchEvent(new CustomEvent('demoshop:notification-read', { detail: { id: notification.id } }));
    }).catch(() => undefined);
  }, []);

  // Persist branch selection
  useEffect(() => {
    if (selectedBranch) {
      localStorage.setItem('selectedBranch', JSON.stringify(selectedBranch));
    }
  }, [selectedBranch]);

  // Dynamic Branch Context
  const userBranch = selectedBranch ? selectedBranch.name : "Select a Branch";


  // Theme Toggle Effect
  useEffect(() => {
    if (theme === 'light') {
      document.body.classList.add('light-mode');
    } else {
      document.body.classList.remove('light-mode');
    }
  }, [theme]);

  const refreshCustomerActivity = useCallback(async () => {
    if (!authReady) return;
    try {
      const [historyRes, transactionsRes, upcomingRes] = await Promise.allSettled([
        fetchCustomerResource<any[]>(makeCacheKey('reservation-history', customerScope), 'reservation-history', '/api/customers/history', true),
        fetchCustomerResource<any[]>(makeCacheKey('default', 'customer-transactions', customerScope), 'default', '/api/customers/transactions', true),
        fetchCustomerResource<any>(makeCacheKey('default', 'upcoming-appointment', customerScope), 'default', '/api/customers/upcoming', true),
      ]);

      if (historyRes.status === 'fulfilled' && historyRes.value) {
        setHistoryData(historyRes.value);
      }
      if (transactionsRes.status === 'fulfilled' && transactionsRes.value) {
        setTransactionsData(transactionsRes.value);
      }
      if (upcomingRes.status === 'fulfilled') {
        setUpcomingAppointmentData(upcomingRes.value || null);
      }

      try {
        const newEntry = await fetchCustomerResource<any>(makeCacheKey('queue-position', customerScope), 'queue-position', '/api/queue/my-position', true);
        if (isActiveCustomerQueueEntry(newEntry)) {
          const prevStatus = activeQueueRef.current?.status;
          // If status transitioned from pending to accepted, trigger confirmation modal
          if (prevStatus === 'pending' && (newEntry.status === 'accepted' || newEntry.status === 'waiting')) {
            const bName = newEntry.barber_name
              || newEntry.barber?.name
              || activeQueueRef.current?.barber?.name
              || activeQueueRef.current?.barber_name
              || barbersListRef.current?.find((b: any) => b.id === newEntry.barber_id || b.id === activeQueueRef.current?.barber_id)?.name;
            setConfirmedBookingAlert({
              id: newEntry.id,
              barberName: bName,
              serviceName: newEntry.service_name || newEntry.service?.name || activeQueueRef.current?.service_name,
              preferredDate: newEntry.preferred_date || newEntry.scheduled_start_at || activeQueueRef.current?.preferred_date,
              preferredTime: newEntry.preferred_time || activeQueueRef.current?.preferred_time,
              branchName: newEntry.branch_name || newEntry.branch?.name || activeQueueRef.current?.branch_name,
            });
          }
          reconcileServerQueueEntry(newEntry);
        } else {
          setActiveQueue(null);
        }
      } catch {
        // Expected when customer is not in queue
        setActiveQueue(null);
      }
    } catch (refreshErr) {
      console.warn('[Dashboard] Realtime customer refresh failed:', refreshErr);
    }
  }, [authReady, customerScope, reconcileServerQueueEntry]);

  // Initial Data Fetch
  useEffect(() => {
    if (!authReady) return;

    const fetchData = async () => {
      try {
        // Load independent customer resources together. The cache shares
        // identical requests with refreshes and keeps warm data available on
        // remounts while each resource revalidates independently.
        const [profileRes, historyRes, transactionsRes, upcomingRes, queueRes, noticeRes] = await Promise.allSettled([
          fetchCustomerResource<any>(makeCacheKey('default', 'customer-profile', customerScope), 'default', '/api/customers/profile'),
          fetchCustomerResource<any[]>(makeCacheKey('reservation-history', customerScope), 'reservation-history', '/api/customers/history'),
          fetchCustomerResource<any[]>(makeCacheKey('default', 'customer-transactions', customerScope), 'default', '/api/customers/transactions'),
          fetchCustomerResource<any>(makeCacheKey('default', 'upcoming-appointment', customerScope), 'default', '/api/customers/upcoming'),
          fetchCustomerResource<any>(makeCacheKey('queue-position', customerScope), 'queue-position', '/api/queue/my-position'),
          api.get('/api/queue/emergency-notice'),
        ]);

        if (profileRes.status === 'fulfilled' && profileRes.value) {
          const profile = profileRes.value;
          setUserData(profile);
        } else {
          throw new Error("Failed to fetch profile");
        }

        if (historyRes.status === 'fulfilled' && historyRes.value) setHistoryData(historyRes.value);
        if (transactionsRes.status === 'fulfilled' && transactionsRes.value) setTransactionsData(transactionsRes.value);
        if (upcomingRes.status === 'fulfilled') setUpcomingAppointmentData(upcomingRes.value || null);

        if (queueRes.status === 'fulfilled' && isActiveCustomerQueueEntry(queueRes.value)) {
          setActiveQueue(queueRes.value);
        } else {
          setActiveQueue(null);
        }

        if (noticeRes.status === 'fulfilled' && noticeRes.value.data) {
          setEmergencyNotice(noticeRes.value.data);
        }

      } catch (error) {
        console.error("Failed to fetch dashboard data", error);
        setError("Failed to load data. Please try again later (╯°□°）╯︵ ┻━┻ .");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [authReady, customerScope, navigate, reconcileServerQueueEntry]);

  // Keep customer history, haircuts stats, and upcoming appointment synchronized in real time.
  useEffect(() => {
    if (!authReady) return;

    const handleRefresh = async (): Promise<void> => {
      customerCache.debounce('customer-dashboard-activity-refresh', 300, () => {
        void refreshCustomerActivity();
      });
    };

    let lastFocusRefresh = Date.now();
    const handleWindowFocus = () => {
      const now = Date.now();
      if (now - lastFocusRefresh > 20_000) {
        lastFocusRefresh = now;
        handleRefresh();
      }
    };

    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('demoshop:notifications-changed', handleRefresh);
    window.addEventListener('demoshop:reservations-changed', handleRefresh);
    window.addEventListener('demoshop:queue-updated', handleRefresh);
    const handleNotificationReceived = (event: Event) => {
      const notification = (event as CustomEvent).detail;
      if (
        notification?.event === 'reservation_cancelled' ||
        notification?.event === 'reservation_declined'
      ) {
        const cancelledQueueId = Number(notification?.queue_entry_id || notification?.metadata?.queue_id || 0);
        const currentQueueId = Number(activeQueueRef.current?.id || 0);
        if (!cancelledQueueId || cancelledQueueId === currentQueueId) {
          setActiveQueue(null);
          if (activeTab === 'queue') setActiveTab('overview');
        }
        handleRefresh();
      }
    };
    window.addEventListener('demoshop:notification-received', handleNotificationReceived);

    const currentCustId = userData?.customer_id || (user as any)?.customerId || (user as any)?.id;
    const customerId = Number(currentCustId);
    if (supabaseToken) supabase.realtime.setAuth(supabaseToken);

    const handleQueueSnapshot = (entries: any[]) => {
      const myEntry = entries.find((entry: any) => Number(entry.customer_id) === customerId);
      if (myEntry) {
        const isTransitionToConfirmed = activeQueueRef.current?.status === 'pending'
          && (myEntry.status === 'accepted' || myEntry.status === 'waiting');
        if (isTransitionToConfirmed) {
          const resolveBarberName = (entryBarberId?: number | null, fallbackName?: string) => {
            if (fallbackName && fallbackName !== 'Assigned Barber') return fallbackName;
            const match = barbersListRef.current?.find((barber: any) =>
              (entryBarberId && (barber.id === entryBarberId || barber.barber_id === entryBarberId)) ||
              (activeQueueRef.current?.barber_id && (barber.id === activeQueueRef.current.barber_id || barber.barber_id === activeQueueRef.current.barber_id))
            );
            return match?.name || fallbackName || activeQueueRef.current?.barber?.name || activeQueueRef.current?.barber_name || undefined;
          };
          setConfirmedBookingAlert({
            id: myEntry.id,
            barberName: resolveBarberName(myEntry.barber_id, myEntry.barber_name),
            serviceName: myEntry.service_name || activeQueueRef.current?.service?.name || activeQueueRef.current?.service_name,
            preferredDate: myEntry.preferred_date || myEntry.scheduled_start_at || activeQueueRef.current?.preferred_date,
            preferredTime: myEntry.preferred_time || activeQueueRef.current?.preferred_time,
            branchName: myEntry.branch_name || activeQueueRef.current?.branch?.name || activeQueueRef.current?.branch_name,
          });
        }
      }
      handleRefresh();
    };

    const handleQueueChange = (payload: any) => {
      const newRow = payload?.new;
      const oldRow = payload?.old;
      if (newRow && Number(newRow.customer_id) === customerId) {
        const isTransitionToConfirmed = (oldRow?.status === 'pending' || activeQueueRef.current?.status === 'pending')
          && (newRow.status === 'accepted' || newRow.status === 'waiting');
        if (isTransitionToConfirmed) {
          const match = barbersListRef.current?.find((barber: any) =>
            (newRow.barber_id && (barber.id === newRow.barber_id || barber.barber_id === newRow.barber_id)) ||
            (activeQueueRef.current?.barber_id && (barber.id === activeQueueRef.current.barber_id || barber.barber_id === activeQueueRef.current.barber_id))
          );
          setConfirmedBookingAlert({
            id: newRow.id,
            barberName: match?.name || newRow.barber_name || activeQueueRef.current?.barber?.name || activeQueueRef.current?.barber_name || undefined,
            serviceName: newRow.service_name || activeQueueRef.current?.service?.name || activeQueueRef.current?.service_name,
            preferredDate: newRow.preferred_date || newRow.scheduled_start_at || activeQueueRef.current?.preferred_date,
            preferredTime: newRow.preferred_time || activeQueueRef.current?.preferred_time,
            branchName: newRow.branch_name || activeQueueRef.current?.branch?.name || activeQueueRef.current?.branch_name,
          });
        } else if (newRow.status === 'cancelled' && activeQueueRef.current?.id === newRow.id) {
          setActiveQueue(null);
        }
      }
      handleRefresh();
    };

    let realtimeGroup: ReturnType<typeof createHasuraFallbackGroup> | null = null;
    if (Number.isInteger(customerId) && customerId > 0) {
      realtimeGroup = createHasuraFallbackGroup({
        onFallbackActivate: handleRefresh,
        onBothUnavailable: handleRefresh,
        degradedIntervalMs: 60_000,
        subscribeFallback: (onStatus) => {
          const channel = supabase
            .channel(`customer-dashboard-queue-${customerId}-fallback`)
            .on(
              'postgres_changes',
              { event: '*', schema: 'public', table: 'queue_entries', filter: `customer_id=eq.${customerId}` },
              handleQueueChange,
            )
            .subscribe(onStatus);
          return () => { void supabase.removeChannel(channel); };
        },
      });
      realtimeGroup.subscribe(
        `subscription WatchCustomerDashboardQueue($customerId: Int!) {
           queue_entries(where: { customer_id: { _eq: $customerId } }, order_by: { id: desc }, limit: 10) {
             id
             customer_id
             barber_id
             branch_id
             service_id
             status
             is_walk_in
             preferred_date
             preferred_time
             scheduled_start_at
             created_at
           }
         }`,
        { customerId },
        (data: any) => {
          if (Array.isArray(data?.queue_entries)) handleQueueSnapshot(data.queue_entries);
        },
        (err: unknown) => console.warn('[CustomerDashboard] Hasura subscription error:', err),
      );
    }

    const ordersFallbackController = createRealtimeFallback({
      telemetryChannel: `customer-dashboard-orders-${customerId || 'unknown'}`,
      refresh: refreshCustomerActivity,
      fallbackIntervalMs: 60_000,
    });
    const ordersChannel = supabase
      .channel(`customer-dashboard-orders-${customerId || 'unknown'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, handleRefresh)
      .subscribe((status, error) => ordersFallbackController.onStatus(status, error));

    return () => {
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('demoshop:notifications-changed', handleRefresh);
      window.removeEventListener('demoshop:reservations-changed', handleRefresh);
      window.removeEventListener('demoshop:queue-updated', handleRefresh);
      window.removeEventListener('demoshop:notification-received', handleNotificationReceived);
      realtimeGroup?.cleanup();
      ordersFallbackController.cleanup();
      void supabase.removeChannel(ordersChannel).catch((err) => {
        console.warn('[Dashboard] Failed to remove realtime channel:', err);
      });
    };
  }, [activeTab, authReady, refreshCustomerActivity, setActiveTab, supabaseToken, user, userData]);

  // Handle pre-selected booking from home page preview or Rebook action
  useEffect(() => {
    const preSelected = localStorage.getItem('preSelectedBooking');
    if (preSelected) {
      try {
        const data = JSON.parse(preSelected);
        if (data.branch) {
          const branch = { ...data.branch, id: data.branch.id || data.branch.branch_id };
          setSelectedBranch(branch);
        }
        if (data.service) {
          const service = {
            ...data.service,
            id: data.service.id || data.service.service_id || data.service.serviceId,
            name: data.service.name || data.service.title || data.service.serviceName,
            duration: data.service.duration || data.service.duration_minutes || data.service.serviceDuration,
            price: data.service.price || data.service.servicePrice,
          };
          setSelectedService(service);
        }
        if (data.barber) {
          const barber = { ...data.barber, id: data.barber.id || data.barber.barber_id };
          setSelectedBarber(barber);
        }
        if (data.date) setSelectedDate(data.date);

        const isMobileBooking = typeof window !== 'undefined' && window.innerWidth < 768;

        // If a time slot was picked, continue to barber selection. Otherwise,
        // land on the date/time step so customers can choose an appointment time.
        if (data.time) {
          setSelectedTime(data.time);
          setBookingStep(isMobileBooking ? 4 : 3);
        } else if (data.date || data.barber) {
          setBookingStep(isMobileBooking ? 2 : 1);
        } else {
          setBookingStep(1); // Start from service selection (pre-selected)
        }

        // Consumed the carry-over
        localStorage.removeItem('preSelectedBooking');
        // Ensure we are on the booking tab
        navigate('/dashboard/book');
      } catch (err) {
        console.error('[Dashboard] Failed to parse preSelectedBooking:', err);
      }
    }
  }, [navigate]);

  const fetchBranches = useCallback(async () => {
    const res = await api.get('/api/queue/public/branches');
    return res.data || [];
  }, []);

  const fetchServices = useCallback(async () => {
    const res = await api.get('/api/services');
    return res.data || [];
  }, []);

  const fetchBarbers = useCallback(async () => {
    const res = await api.get('/api/queue/public/barbers');
    return Array.isArray(res.data) ? res.data : [];
  }, []);

  const { data: rawBranches } = useSWR('branches', fetchBranches, { domain: 'services' });
  const { data: rawServices } = useSWR('services', fetchServices, { domain: 'services' });
  const { data: rawBarbers } = useSWR('public-barbers', fetchBarbers, { domain: 'barbers', refreshInterval: 15_000 });

  // Map branches and set default selected branch
  useEffect(() => {
    if (rawBranches && Array.isArray(rawBranches) && rawBranches.length > 0) {
      const mapped = rawBranches.map(b => ({
        id: b.branch_id || b.id,
        name: b.name,
        area: b.area || 'Bulacan',
        address: b.address,
        phone: b.phone || '(02) 8555-0123',
        hours: b.hours || 'Mon-Sat: 10am - 9pm',
        image: b.image || 'https://images.unsplash.com/photo-1503951914875-befbb6470523?q=80&w=2068&auto=format&fit=crop',
        status: getBranchStatus(b.hours || 'Mon-Sat: 10am - 9pm'),
        branch_id: b.branch_id || b.id,
      }));
      setBranchesList(mapped);
      setSelectedBranch((prev: any) => prev || mapped[0]);
    }
  }, [rawBranches]);

  // Map services
  useEffect(() => {
    if (rawServices && Array.isArray(rawServices)) {
      const mapped = rawServices.map(s => ({
        id: s.service_id || s.id,
        name: s.title || s.name,
        duration: s.duration_minutes ? `${s.duration_minutes} min` : (s.duration || '45 min'),
        price: typeof s.price === 'number' ? `₱${s.price}` : (s.price || '₱450'),
        description: s.description || '',
        service_id: s.service_id || s.id,
        category: s.category || 'OTHER',
        sub_category: s.sub_category || null,
      }));
      setServicesList(mapped);
    }
  }, [rawServices]);

  // Map barbers and preload duty schedules concurrently
  useEffect(() => {
    if (rawBarbers && Array.isArray(rawBarbers)) {
      const mapped = rawBarbers.map(b => ({
        id: b.barber_id || b.id,
        name: b.name,
        specialty: b.specialty || null,
        specialties: Array.isArray(b.specialties) ? b.specialties : [],
        rating: b.rating ?? null,
        review_count: Number(b.review_count) || 0,
        completed_services_count: Number(b.completed_services_count) || 0,
        is_top_performer: Boolean(b.is_top_performer || b.isTopPerformer),
        isTopPerformer: Boolean(b.is_top_performer || b.isTopPerformer),
        rank: typeof b.rank === 'number' ? b.rank : null,
        signature_service: b.signature_service || null,
        service_completed_counts: b.service_completed_counts || {},
        image: b.profile_picture || b.image || null,
        status: b.status || 'Available',
        break_started_at: b.break_started_at || null,
        barber_id: b.barber_id || b.id,
        is_off_today: Boolean(b.is_off_today),
        schedule_reason: b.schedule_reason || null,
        is_on_duty_today: b.is_on_duty_today ?? !b.is_off_today,
        isOnDutyToday: b.isOnDutyToday ?? b.is_on_duty_today ?? !b.is_off_today,
        is_online_booking_enabled_today: Boolean(b.is_online_booking_enabled_today ?? b.isOnlineBookingEnabledToday),
        isOnlineBookingEnabledToday: Boolean(b.isOnlineBookingEnabledToday ?? b.is_online_booking_enabled_today),
        is_available_for_walkins: b.is_available_for_walkins ?? (b.is_on_duty_today ?? !b.is_off_today),
        walkin_available: b.walkin_available ?? (b.is_on_duty_today ?? !b.is_off_today),
      }));
      setBarbersList(mapped);

      const branchId = Number(
        selectedBranch?.id || selectedBranch?.branch_id ||
        branchesList[0]?.id || 1,
      );
      if (Number.isInteger(branchId) && branchId > 0) {
        const startDate = getManilaDateIso();
        void bookingService.fetchBarberSchedules(
          branchId,
          startDate,
          addDaysToIsoDate(startDate, 30),
        ).catch((scheduleError) => {
          console.warn('[Dashboard] Could not preload barber schedules:', scheduleError);
        });
      }
    }
  }, [rawBarbers, selectedBranch?.id, selectedBranch?.branch_id, branchesList]);


  // The Queue tab represents an upcoming/active reservation only. If a
  // cancellation or another terminal status removes the active entry while
  // the customer is viewing Queue, return them to Overview automatically.
  useEffect(() => {
    if (!isLoading && activeTab === 'queue' && !activeQueue) {
      setActiveTab('overview');
    } else if (!isLoading && activeTab === 'book' && activeQueue) {
      setActiveTab('queue');
    }
  }, [activeQueue, activeTab, isLoading, setActiveTab]);

  // Handle Profile Save
  const handleSaveProfile = async (dataOrEvent: any) => {
    if (dataOrEvent && typeof dataOrEvent.preventDefault === 'function') {
      dataOrEvent.preventDefault();
    }

    const payload = dataOrEvent?.target ? {
      firstName: dataOrEvent.target.firstName?.value?.trim(),
      lastName: dataOrEvent.target.lastName?.value?.trim(),
      email: dataOrEvent.target.email?.value?.trim(),
    } : {
      firstName: dataOrEvent?.firstName !== undefined ? String(dataOrEvent.firstName).trim() : undefined,
      lastName: dataOrEvent?.lastName !== undefined ? String(dataOrEvent.lastName).trim() : undefined,
      email: dataOrEvent?.email !== undefined ? String(dataOrEvent.email).trim() : undefined,
    };

    const response = await api.put('/api/customers/profile', payload);
    const updated = response.data?.profile || payload;

    setUserData((prev: any) => ({
      ...prev,
      first_name: updated.first_name ?? payload.firstName ?? prev?.first_name,
      last_name: updated.last_name ?? payload.lastName ?? prev?.last_name,
      email: updated.email ?? payload.email ?? prev?.email,
    }));

    customerCache.markStale(makeCacheKey('default', 'customer-profile', customerScope));
    await refetchMe();
    return response.data;
  };

  const handleBookReset = useCallback(() => {
    resetBookingForm();
    setActiveTab('book');
  }, [resetBookingForm, setActiveTab]);

  const getIcon = (type: string) => {
    switch (type) {
      case 'success': return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'warning': return <AlertTriangle className="w-5 h-5 text-yellow-400" />;
      default: return <Info className="w-5 h-5 text-blue-400" />;
    }
  };

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
  };

  const handleLogout = useCallback(() => {
    setIsLogoutModalOpen(true);
  }, []);

  const confirmLogout = async () => {
    await logout();
  };

  const progressPercentage = 75;
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progressPercentage / 100) * circumference;

  const renderContent = () => {
    if (error) {
      return (
        <div className="flex flex-col items-center justify-center gap-6 py-20 text-center w-full max-w-md mx-auto animate-fade-in">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 mb-2">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-serif font-bold text-ivory">Failed to load data, try again later</h3>
            <p className="text-sm text-ivory-dim leading-relaxed">{error}</p>
          </div>
          <Button variant="outline" className="border-gold text-gold hover:bg-gold/10" onClick={() => window.location.reload()}>
            Retry Connection
          </Button>
        </div>
      );
    }

    return (
      <React.Suspense
        fallback={(
          <div className="flex min-h-48 items-center justify-center gap-3 text-sm text-ivory-dim" role="status" aria-live="polite">
            <span aria-hidden="true" className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gold/30 border-t-gold" />
            Loading section…
          </div>
        )}
      >
      <>
        {activeTab === 'overview' && (
          <OverviewTab userData={userData} historyData={historyData} upcomingAppointmentData={upcomingAppointmentData} setActiveTab={setActiveTab} userBranch={userBranch} />
        )}
        {activeTab === 'book' && (
          <BookTab
            key={bookingResetVersion}
            bookingStep={bookingStep}
            setBookingStep={setBookingStep}
            selectedService={selectedService}
            setSelectedService={setSelectedService}
            selectedBarber={selectedBarber}
            setSelectedBarber={setSelectedBarber}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            selectedTime={selectedTime}
            setSelectedTime={setSelectedTime}
            handleBookReset={handleBookReset}
            services={servicesList}
            barbers={barbersList}
            timeSlots={timeSlots}
            userBranch={userBranch}
            selectedBranch={selectedBranch}
            setSelectedBranch={setSelectedBranch}
            branches={branchesList}
            onJoinQueue={onJoinQueue}
            historyData={historyData}
            isSidebarCollapsed={isSidebarCollapsed}
            isRebooking={Boolean(rebookingContext)}
            isManualRebooking={isManualRebooking}
            rebookingQueueId={rebookingContext?.queueId ?? null}
            onRebookingCompleted={() => setRebookingContext(null)}
          />
        )}
        {activeTab === 'queue' && (
          <QueueTab
            activeQueue={activeQueue}
            setActiveQueue={setActiveQueue}
            setActiveTab={setActiveTab}
            resetBookingForm={resetBookingForm}
            barbers={barbersList}
            services={servicesList}
            branches={branchesList}
            onBookingConfirmed={(bookingData) => setConfirmedBookingAlert(bookingData)}
          />
        )}
        {activeTab === 'history' && <HistoryTab historyData={historyData} setActiveTab={setActiveTab} isLoading={isLoading} />}
        {activeTab === 'payments' && <PaymentsTab transactionsData={transactionsData} setActiveTab={setActiveTab} />}
        {activeTab === 'profile' && <ProfileTab userData={userData} handleSaveProfile={handleSaveProfile} onLogout={handleLogout} />}
        {activeTab === 'settings' && <SettingsTab setActiveTab={setActiveTab} />}
        {!['overview', 'book', 'queue', 'history', 'payments', 'profile', 'settings'].includes(activeTab) && (
          <div className="text-ivory-dim">Section under construction.</div>
        )}
      </>
      </React.Suspense>
    );
  };

  return (
    <>
      <div className="h-screen bg-charcoal flex flex-col lg:flex-row overflow-hidden pb-24 lg:pb-0">

        <SidebarNavigation
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          activeQueue={activeQueue}
          userBranch={userBranch}
          onCollapsedChange={setIsSidebarCollapsed}
        />

        {/* Main Content */}
        <main className={`flex-1 relative w-full flex flex-col h-full overflow-hidden transition-[margin-left] duration-200 ease-in-out ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'}`}>
          {/* Background Texture */}
          <div className="absolute inset-0 bg-texture opacity-30 pointer-events-none"></div>

          {/* Ambient Glow */}
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-gold/5 rounded-full blur-[120px] pointer-events-none"></div>

          {/* Top Bar */}
          <header className="h-20 bg-charcoal/95 backdrop-blur-md border-b border-white/5 shrink-0 px-4 md:px-8 flex justify-between items-center relative z-30">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3 md:hidden">
                <img src="/demoshop_logo.png" alt="Logo" width={128} height={32} decoding="async" className="h-8 w-auto" />
              </div>
              <h2 className="text-xl font-serif font-bold text-ivory capitalize tracking-wide">{activeTab}</h2>
            </div>

            <div className="flex items-center gap-3 md:gap-6">
              {/* Notification Dropdown */}
              <NotificationBell
                visibleEvents={CUSTOMER_VISIBLE_NOTIFICATION_EVENTS}
                popupEvents={CUSTOMER_POPUP_NOTIFICATION_EVENTS}
                onSelect={setSelectedNotification}
                onNewNotification={handleNewNotification}
              />

              {/* Direct Theme Toggle */}
              <button
                type="button"
                onClick={toggleTheme}
                title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                className="w-9 h-9 rounded-full bg-white/5 border border-white/10 hover:border-gold/40 hover:bg-gold/10 text-ivory-dim hover:text-gold flex items-center justify-center transition-all cursor-pointer shadow-sm shrink-0"
              >
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>

              <div className="pl-3 md:pl-6 border-l border-white/10">
                <ModuleSwitcher
                  currentModuleId="customer"
                  onOpenProfile={() => setActiveTab('profile')}
                  profileLabel="Profile"
                  forceProfileMenu
                  hideModuleOptions
                  logoutLabel="Log Out"
                  onLogout={handleLogout}
                  displayName={userData?.first_name || (user as any)?.first_name}
                />
              </div>
            </div>
          </header>

          {/* Scrollable Content Area */}
          <div className={`flex-1 ${isTimeSlotLocked ? 'overflow-hidden min-h-0 p-2 md:p-3' : 'overflow-y-auto p-2 sm:p-4 md:p-8'} relative z-0 custom-scrollbar`}>
            <div className={`flex justify-center ${isTimeSlotLocked ? 'h-full min-h-0' : 'min-h-full'} w-full max-w-7xl mx-auto`}>
              {renderContent()}
            </div>
          </div>

          {/* Docked Footer Slot (outside scrollable steps, docked at bottom of main viewport) */}
          <div id="dashboard-docked-footer-slot" className="shrink-0 relative z-30 w-full" />
        </main>

        {/* Emergency Rebooking Modal */}
        {emergencyNotice && (
          <EmergencyRebookingModal
            notice={emergencyNotice}
            onClose={() => setEmergencyNotice(null)}
            onRebooked={() => {
              setEmergencyNotice(null);
              navigate('/dashboard/queue');
            }}
            onRefunded={() => {
              setEmergencyNotice(null);
            }}
          />
        )}

        {/* Notification Detail Modal */}
        <Modal
          isOpen={!!selectedNotification}
          onClose={() => setSelectedNotification(null)}
          title={selectedNotification?.title || 'Notification'}
          footer={
            <Button variant="primary" onClick={() => setSelectedNotification(null)}>
              Close
            </Button>
          }
        >
          <div className="space-y-4">
            <div className="flex items-center gap-2.5 text-xs text-ivory-dim border-b border-white/10 pb-3 font-mono">
              {selectedNotification && getIcon(selectedNotification.type)}
              <span>{selectedNotification?.created_at ? new Date(selectedNotification.created_at).toLocaleString() : ''}</span>
            </div>

            {/* Formatted Message Layout */}
            <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 text-left space-y-2.5">
              <p className="text-sm text-ivory leading-relaxed font-normal">
                {selectedNotification?.message}
              </p>
            </div>

            {(selectedNotification?.event === 'schedule_adjusted' || selectedNotification?.event === 'schedule_delay') && (
              <div className="pt-2 border-t border-white/10 mt-4 space-y-3">
                <div className="text-[11px] font-semibold text-gold uppercase tracking-wider text-left">
                  Choose what to do with this reservation:
                </div>
                <Button
                  variant="primary"
                  className="w-full bg-gold hover:bg-gold-light text-charcoal font-bold py-3 rounded-lg cursor-pointer text-xs uppercase tracking-wider"
                  onClick={async () => {
                    const notif = selectedNotification;
                    const queueId = Number(notif?.metadata?.reservation_id || notif?.queue_entry_id || 0);
                    if (!queueId) return;
                    try {
                      await api.post(`/api/customers/reservations/${queueId}/keep-adjustment`);
                      setSelectedNotification(null);
                      void refreshCustomerActivity();
                    } catch (error) {
                      console.error('[Dashboard] Failed to keep adjusted reservation:', error);
                    }
                  }}
                >
                  Keep Appointment with Same Barber
                </Button>
                <Button
                  variant="outline"
                  className="w-full border-white/15 text-ivory hover:bg-white/10 font-semibold py-2.5 rounded-lg cursor-pointer text-xs uppercase tracking-wider"
                  onClick={() => {
                    setScheduleAdjustmentNotification(selectedNotification);
                    setSelectedNotification(null);
                  }}
                >
                  Reschedule to Next Day
                </Button>
              </div>
            )}

            {(selectedNotification?.event?.includes('declined') ||
              selectedNotification?.event?.includes('cancelled') ||
              selectedNotification?.message?.toLowerCase().includes('declined') ||
              selectedNotification?.message?.toLowerCase().includes('cancelled')) && (
                <div className="pt-2 border-t border-white/10 mt-4 space-y-3">
                  <div className="text-[11px] font-semibold text-gold uppercase tracking-wider text-left">
                    Choose Re-booking Option:
                  </div>

                  <Button
                    variant="primary"
                    className="w-full bg-gold hover:bg-gold-light text-charcoal font-bold flex items-center justify-center gap-2 py-3 rounded-lg cursor-pointer text-xs uppercase tracking-wider shadow-md transition-all active:scale-[0.98]"
                    onClick={async () => {
                      const notif = selectedNotification;
                      setSelectedNotification(null);
                      try {
                        const meta = typeof notif?.metadata === 'string'
                          ? (() => { try { return JSON.parse(notif.metadata); } catch { return {}; } })()
                          : (notif?.metadata || {});
                        const queueId = Number(notif?.queue_entry_id || meta?.queue_id || meta?.original_queue_id || 0);

                        // 1. Fetch details of the cancelled booking if available
                        let originalEntry: any = null;
                        if (queueId > 0) {
                          try {
                            const entryRes = await api.get(`/api/queue/${queueId}`);
                            originalEntry = entryRes.data;
                          } catch (entryErr) {
                            console.warn('[Dashboard] Could not fetch original queue entry by ID:', entryErr);
                            originalEntry = historyData.find((h: any) => Number(h.id) === queueId) || null;
                          }
                        }

                        const cancelledBarberId = Number(
                          originalEntry?.barber_id
                          || notif?.barber_id
                          || meta?.barber_id
                          || meta?.original_barber_id
                          || 0
                        );

                        const branchId = Number(
                          originalEntry?.branch_id
                          || notif?.branch_id
                          || meta?.branch_id
                          || selectedBranch?.id
                          || selectedBranch?.branch_id
                          || 1
                        );

                        // 2. Resolve pre-filled appointment details from original booking first
                        const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
                        const origDateStr = originalEntry?.preferred_date
                          ? String(originalEntry.preferred_date).slice(0, 10)
                          : (selectedDate || todayStr);
                        const targetDate = origDateStr >= todayStr ? origDateStr : todayStr;
                        const targetTime = originalEntry?.preferred_time || selectedTime || '10:00 AM';

                        // 3. Fetch public barbers and authoritative schedules for targetDate in parallel
                        const [barbersRes, schedulesRes] = await Promise.all([
                          api.get('/api/queue/public/barbers', {
                            params: { branchId: String(branchId) },
                          }),
                          api.get('/api/queue/public/barber-schedules', {
                            params: {
                              branchId: String(branchId),
                              startDate: targetDate,
                              endDate: targetDate,
                            },
                          }).catch(() => ({ data: { schedules: {} } })),
                        ]);

                        const barbersList: any[] = Array.isArray(barbersRes.data) ? barbersRes.data : [];
                        const schedules: Record<string, any> = schedulesRes.data?.schedules || schedulesRes.data || {};

                        // 4. Candidate pool explicitly filters out the cancelled barber's ID (barber.id !== cancelledBarberId)
                        // Strictly evaluate barbers who are on-duty and online-bookable on the targetDate.
                        const candidatePool = barbersList.filter((b: any) => {
                          const candidateId = Number(b.barber_id ?? b.id ?? 0);
                          if (!candidateId || (cancelledBarberId > 0 && candidateId === cancelledBarberId)) {
                            return false;
                          }
                          const rawStatus = String(b.status || '').toLowerCase().trim();
                          if (rawStatus === 'suspended' || rawStatus === 'leave' || rawStatus === 'offline') {
                            return false;
                          }

                          const sched = schedules[String(candidateId)];
                          if (sched) {
                            const isOffOnTargetDate = sched.offDutyDates?.includes(targetDate) || sched.dateDetails?.[targetDate]?.isOff;
                            if (isOffOnTargetDate) return false;
                            const isOnline = sched.dateDetails?.[targetDate]?.isOnlineBookingEnabled;
                            if (isOnline !== true) {
                              return false;
                            }
                          } else if (targetDate === todayStr) {
                            if (b.is_off_today) return false;
                            const isOnline = b.is_online_booking_enabled_today ?? b.is_online_booking_enabled ?? b.isOnlineBookingEnabledToday;
                            if (isOnline !== true) return false;
                          } else {
                            return false;
                          }
                          return true;
                        });

                        const eligiblePool = candidatePool;

                        if (eligiblePool.length === 0) {
                          setRebookingContext(null);
                          addToast({
                            type: 'warning',
                            title: 'No Replacement Barber Available',
                            message: `No online-eligible barber is on duty on ${targetDate}. Please choose a date and barber manually.`,
                          });
                          setActiveTab('book');
                          return;
                        }

                        // 5. Sort by shortest queue (queue_count ascending, then eta_minutes ascending)
                        eligiblePool.sort((a: any, b: any) => {
                          const qA = Number(a.queue_count ?? a.active_count ?? 0);
                          const qB = Number(b.queue_count ?? b.active_count ?? 0);
                          if (qA !== qB) return qA - qB;
                          const etaA = Number(a.eta_minutes ?? a.etaMinutes ?? 0);
                          const etaB = Number(b.eta_minutes ?? b.etaMinutes ?? 0);
                          return etaA - etaB;
                        });

                        const targetBarber = eligiblePool[0];

                        const originalServiceId = Number(
                          originalEntry?.service_ids?.[0]
                          || originalEntry?.service_id
                          || 0
                        );
                        const targetService = (originalServiceId > 0 && servicesList.find((s: any) => Number(s.id ?? s.service_id) === originalServiceId))
                          || servicesList[0]
                          || { id: 1, name: 'Hair Cut', duration: '45 min', price: '₱450' };

                        const targetBranch = branchesList.find((b: any) => Number(b.id ?? b.branch_id) === branchId)
                          || selectedBranch
                          || branchesList[0];

                        const replacementBarberObj = {
                          id: targetBarber.barber_id ?? targetBarber.id,
                          barber_id: targetBarber.barber_id ?? targetBarber.id,
                          name: targetBarber.name,
                          image: targetBarber.image || targetBarber.profile_picture || null,
                          is_auto_assigned: true,
                          assigned_barber_name: targetBarber.name,
                        };

                        // 6. Direct routing to Step 4 (Confirm Booking / Checkout)
                        const isMobileViewport = typeof window !== 'undefined' && window.innerWidth < 768;
                        const checkoutStep = isMobileViewport ? 5 : 4;

                        // Save checkpoint so BookTab initializes directly on checkout with pre-selected state
                        saveBookingCheckpoint({
                          step: checkoutStep,
                          bookingMode: 'single',
                          selectedServices: [targetService],
                          selectedService: targetService,
                          selectedBarber: replacementBarberObj,
                          selectedDate: targetDate,
                          selectedTime: targetTime,
                          selectedBranch: targetBranch,
                          // A regular cancellation or receipt rejection starts
                          // a new booking and does not transfer the old deposit.
                          termsAgreed: false,
                        });

                        // Deposit transfers are reserved for the dedicated
                        // emergency cancellation flow. This notification is a
                        // normal cancellation/rejection, so make it a fresh
                        // booking that follows the regular payment path.
                        setRebookingContext(null);
                        setIsManualRebooking(false);

                        setSelectedBarber(replacementBarberObj);
                        setSelectedService(targetService);
                        setSelectedDate(targetDate);
                        setSelectedTime(targetTime);
                        setSelectedBranch(targetBranch);
                        setBookingStep(checkoutStep);
                        setBookingResetVersion((v) => v + 1);
                        setActiveTab('book');
                      } catch (err: any) {
                        console.error('[Dashboard] Auto rebooking shortest queue failed:', err);
                        setRebookingContext(null);
                        addToast({
                          type: 'error',
                          title: 'Auto-Rejoin Error',
                          message: err?.response?.data?.error || err?.message || 'Could not complete auto-rejoin. Please choose a barber manually.',
                        });
                        setActiveTab('book');
                      }
                    }}
                  >
                    <Calendar className="w-4 h-4 text-charcoal shrink-0" />
                    Auto-Join Shortest Queue Barber
                  </Button>

                  <Button
                    variant="outline"
                    className="w-full border-white/15 text-ivory hover:bg-white/10 font-semibold flex items-center justify-center gap-2 py-2.5 rounded-lg cursor-pointer text-xs uppercase tracking-wider transition-all"
                    onClick={async () => {
                      const notif = selectedNotification;
                      const meta = typeof notif?.metadata === 'string'
                        ? (() => { try { return JSON.parse(notif.metadata); } catch { return {}; } })()
                        : (notif?.metadata || {});
                      const queueId = Number(notif?.queue_entry_id || meta?.queue_id || meta?.original_queue_id || 0);

                      let originalEntry: any = historyData.find((entry: any) => Number(entry.id) === queueId) || null;
                      if (queueId > 0) {
                        try {
                          const entryRes = await api.get(`/api/queue/${queueId}`);
                          originalEntry = entryRes.data;
                        } catch (error) {
                          console.warn('[Dashboard] Could not fetch declined booking details for manual rebooking:', error);
                        }
                      }

                      const originalServiceId = Number(
                        originalEntry?.service_ids?.[0]
                        || originalEntry?.service_id
                        || 0
                      );
                      const targetService = (originalServiceId > 0 && servicesList.find(
                        (service: any) => Number(service.id ?? service.service_id) === originalServiceId,
                      )) || servicesList[0] || null;
                      const targetBranchId = Number(originalEntry?.branch_id || meta?.branch_id || 0);
                      const targetBranch = branchesList.find(
                        (branch: any) => Number(branch.id ?? branch.branch_id) === targetBranchId,
                      ) || selectedBranch || branchesList[0] || null;

                      // Manual rebooking must choose a fresh date/time and barber.
                      // Keep the original service, but create a fresh booking
                      // so the regular reservation fee is collected again.
                      resetBookingForm(2);
                      setIsManualRebooking(false);
                      setSelectedService(targetService);
                      setRebookingContext(null);
                      setSelectedBranch(targetBranch);
                      setBookingStep(2);
                      setSelectedNotification(null);
                      setActiveTab('book');
                    }}
                  >
                    Select Barber & Slot Manually
                  </Button>
                </div>
              )}
          </div>
        </Modal>

        <ScheduleAdjustmentModal
          notification={scheduleAdjustmentNotification}
          onClose={() => setScheduleAdjustmentNotification(null)}
          onCompleted={() => {
            setScheduleAdjustmentNotification(null);
            void refreshCustomerActivity();
          }}
        />


        <BottomNavigation activeTab={activeTab} setActiveTab={setActiveTab} activeQueue={activeQueue} onLogout={handleLogout} />

        {/* Logout Confirmation Modal */}
        <Modal
          isOpen={isLogoutModalOpen}
          onClose={() => setIsLogoutModalOpen(false)}
          title="Confirm Logout"
          size="sm"
          footer={
            <>
              <Button variant="outline" onClick={() => setIsLogoutModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" className="bg-gold-600 hover:bg-gold-700 border-gold-600 text-black" onClick={confirmLogout}>
                Logout
              </Button>
            </>
          }
        >
          <p className="text-ivory">Are you sure you want to log out?</p>
        </Modal>

        {/* Real-time Booking Confirmed Alert Modal */}
        <BookingConfirmedAlertModal
          isOpen={Boolean(confirmedBookingAlert)}
          data={confirmedBookingAlert}
          onClose={() => {
            setConfirmedBookingAlert(null);
            void refreshCustomerActivity();
          }}
          onViewBooking={() => {
            setConfirmedBookingAlert(null);
            void refreshCustomerActivity();
            setActiveTab('queue');
          }}
        />
      </div>
    </>
  );
};
