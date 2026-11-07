import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Calendar,
  Check,
  CheckCircle,
  Clock,
  Info,
  Package,
  Shield,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { api } from '@/config/api';
import { useAuth } from '@/components/auth/AuthContext';
import { useSWR } from '@/hooks/useSWR';
import { supabase } from '@/config/supabaseClient';
import { createHasuraFallbackGroup } from '@/utils/hasura-realtime-group';
import { createRealtimeFallback } from '@/utils/supabase-realtime';
import {
  fetchNotifications as fetchSharedNotifications,
  getNotificationCountCacheKey,
  fetchUnreadNotificationCount,
  invalidateNotificationCache,
} from '@/features/notifications/notification-cache';
import type { NotificationRecord } from '@/features/notifications/notification-cache';
import { playNotificationSound, registerNotificationSoundUnlock } from '@/utils/notificationSound';

export type AppNotification = NotificationRecord;

const MAX_LIVE_POPUP_AGE_MS = 2 * 60 * 1000; // 2 minutes
const CLOCK_SKEW_TOLERANCE_MS = 30 * 1000; // 30 seconds

export const isNotificationRecent = (createdAt: string, maxAgeMs = MAX_LIVE_POPUP_AGE_MS): boolean => {
  if (!createdAt) return false;
  const time = new Date(createdAt).getTime();
  if (Number.isNaN(time)) return false;
  const age = Date.now() - time;
  return age >= -CLOCK_SKEW_TOLERANCE_MS && age <= maxAgeMs;
};

// Module-level set per user to persist announced notification IDs across component unmount/remount in the session
const sessionAnnouncedNotificationIdsByUser = new Map<string, Set<string>>();

const getSessionAnnouncedSet = (userId: string): Set<string> => {
  let set = sessionAnnouncedNotificationIdsByUser.get(userId);
  if (!set) {
    set = new Set<string>();
    sessionAnnouncedNotificationIdsByUser.set(userId, set);
  }
  return set;
};

const DEFAULT_POPUP_EVENTS = [
  'reservation_cancelled', 
  'reservation_declined',
  'barber_shift_approved',
  'barber_shift_declined',
  'barber_shift_request',
  'user_role_updated',
] as const;

interface NotificationBellProps {
  badgeCount?: number;
  visibleEvents?: readonly string[];
  popupEvents?: readonly string[];
  onSelect?: (notification: AppNotification) => void;
  onNewNotification?: (notification: AppNotification) => void;
}

const formatRelativeTime = (createdAt: string): string => {
  if (!createdAt) return '';
  const notifDate = new Date(createdAt);
  const time = notifDate.getTime();
  if (Number.isNaN(time)) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDays = Math.floor(diffHour / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return notifDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const getNotificationBadge = (event: string, type: AppNotification['type']) => {
  const evt = event?.toLowerCase() || '';
  if (evt.includes('reservation') || evt.includes('queue')) {
    if (evt.includes('cancelled') || evt.includes('declined')) {
      return (
        <div className="w-8 h-8 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 shrink-0">
          <AlertTriangle className="w-4 h-4" />
        </div>
      );
    }
    return (
      <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
        <Calendar className="w-4 h-4" />
      </div>
    );
  }
  if (evt.includes('shift')) {
    if (evt.includes('declined')) {
      return (
        <div className="w-8 h-8 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 shrink-0">
          <AlertTriangle className="w-4 h-4" />
        </div>
      );
    }
    return (
      <div className="w-8 h-8 rounded-full bg-gold/10 border border-gold/20 flex items-center justify-center text-gold shrink-0">
        <Clock className="w-4 h-4" />
      </div>
    );
  }
  if (evt.includes('inventory') || evt.includes('restock')) {
    return (
      <div className="w-8 h-8 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
        <Package className="w-4 h-4" />
      </div>
    );
  }
  if (evt.includes('role')) {
    return (
      <div className="w-8 h-8 rounded-full bg-gold/15 border border-gold/30 flex items-center justify-center text-gold shrink-0">
        <Shield className="w-4 h-4" />
      </div>
    );
  }
  if (type === 'success') {
    return (
      <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
        <CheckCircle className="w-4 h-4" />
      </div>
    );
  }
  if (type === 'warning' || type === 'error') {
    return (
      <div className="w-8 h-8 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 shrink-0">
        <AlertTriangle className="w-4 h-4" />
      </div>
    );
  }
  return (
    <div className="w-8 h-8 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
      <Info className="w-4 h-4" />
    </div>
  );
};

export const NotificationBell: React.FC<NotificationBellProps> = ({
  badgeCount,
  visibleEvents,
  popupEvents = DEFAULT_POPUP_EVENTS,
  onSelect,
  onNewNotification,
}) => {
  const { authReady, user, supabaseToken } = useAuth();
  const rawUserId = (user as any)?.id || (user as any)?.user_id;
  const notificationUserId = rawUserId ? String(rawUserId) : '';
  const isAuthenticated = Boolean(authReady && notificationUserId && notificationUserId !== 'anonymous');
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [isWiggling, setIsWiggling] = useState(false);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isMuted, setIsMuted] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('demoshop_sound_muted') === 'true';
  });

  const notificationRef = useRef<HTMLDivElement>(null);
  const announcedNotificationIds = useRef(new Set<string>());
  const knownNotificationIds = useRef(new Set<string>());
  const notificationIdsSeeded = useRef(false);
  const lastSeededUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    return registerNotificationSoundUnlock(isAuthenticated);
  }, [isAuthenticated]);

  const toggleSound = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMuted((prev) => {
      const next = !prev;
      localStorage.setItem('demoshop_sound_muted', String(next));
      return next;
    });
  };

  const { data: unreadCountData, mutate: refreshUnreadCount } = useSWR<number>(
    isAuthenticated ? getNotificationCountCacheKey(notificationUserId) : '',
    fetchUnreadNotificationCount,
    {
      refreshInterval: 60_000,
      revalidateOnMount: true,
    }
  );

  const visibleEventsKey = visibleEvents === undefined ? 'all' : visibleEvents.join('\u0000');
  const popupEventsKey = popupEvents.join('\u0000');

  const refreshNotifications = useCallback(async (cursor?: number, announceNew = false): Promise<void> => {
    if (!isAuthenticated) {
      setNotifications([]);
      setNextCursor(null);
      return;
    }

    const sessionAnnounced = getSessionAnnouncedSet(notificationUserId);
    const page = await fetchSharedNotifications(notificationUserId, cursor);
    const knownIds = knownNotificationIds.current;

    if (!cursor && !notificationIdsSeeded.current) {
      page.items.forEach((item) => {
        const idStr = String(item.id);
        announcedNotificationIds.current.add(idStr);
        sessionAnnounced.add(idStr);
      });
      notificationIdsSeeded.current = true;
    } else if (!cursor && announceNew) {
      page.items
        .filter((item) => !knownIds.has(String(item.id)))
        .filter((item) => !item.read)
        .filter((item) => isNotificationRecent(item.created_at))
        .filter((item) => popupEvents.includes(item.event) && (!visibleEvents || visibleEvents.includes(item.event)))
        .forEach((item) => {
          const idStr = String(item.id);
          if (announcedNotificationIds.current.has(idStr) || sessionAnnounced.has(idStr)) return;
          announcedNotificationIds.current.add(idStr);
          sessionAnnounced.add(idStr);
          if (!isMuted) playNotificationSound(isAuthenticated);
          onNewNotification?.(item);
          window.dispatchEvent(new CustomEvent('demoshop:notifications-changed', { detail: item }));
          window.dispatchEvent(new CustomEvent('demoshop:notification-received', { detail: item }));
        });
    }

    setNotifications((current) =>
      cursor ? [...current, ...page.items.filter((item) => !current.some((existing) => existing.id === item.id))] : page.items
    );
    page.items.forEach((item) => {
      const idStr = String(item.id);
      knownNotificationIds.current.add(idStr);
      sessionAnnounced.add(idStr);
    });
    setNextCursor(page.nextCursor);
  }, [isAuthenticated, isMuted, notificationUserId, onNewNotification, popupEventsKey, visibleEventsKey]);

  const loadOlderNotifications = useCallback(async (): Promise<void> => {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      await refreshNotifications(nextCursor);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, nextCursor, refreshNotifications]);

  const triggerArrivalEffect = useCallback(() => {
    setIsWiggling(true);
    const timer = setTimeout(() => setIsWiggling(false), 1000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (supabaseToken) supabase.realtime.setAuth(supabaseToken);
 
    const handleRefresh = () => {
      triggerArrivalEffect();
      void refreshUnreadCount();
      void refreshNotifications(undefined, true);
    };

    window.addEventListener('demoshop:reservations-changed', handleRefresh);
    window.addEventListener('demoshop:appointments-changed', handleRefresh);

    return () => {
      window.removeEventListener('demoshop:reservations-changed', handleRefresh);
      window.removeEventListener('demoshop:appointments-changed', handleRefresh);
    };
  }, [isAuthenticated, supabaseToken, triggerArrivalEffect, refreshUnreadCount, refreshNotifications]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (lastSeededUserId.current !== notificationUserId) {
      notificationIdsSeeded.current = false;
      knownNotificationIds.current.clear();
      announcedNotificationIds.current.clear();
      lastSeededUserId.current = notificationUserId;
    }
    if (!notificationIdsSeeded.current) {
      void refreshNotifications();
    }
  }, [isAuthenticated, notificationUserId, refreshNotifications]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && isAuthenticated) {
        void refreshNotifications(undefined, true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [isAuthenticated, refreshNotifications]);

  useEffect(() => {
    const handleRead = (event: Event) => {
      const notificationId = String((event as CustomEvent).detail?.id ?? '');
      if (!notificationId) return;
      setNotifications((current) => current.map((item) =>
        String(item.id) === notificationId ? { ...item, read: true } : item
      ));
      void refreshUnreadCount((current) => Math.max(0, (current ?? 0) - 1), false);
    };
    window.addEventListener('demoshop:notification-read', handleRead);
    return () => window.removeEventListener('demoshop:notification-read', handleRead);
  }, [refreshUnreadCount]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }
    const userId = notificationUserId;
    const sessionAnnounced = getSessionAnnouncedSet(userId);

    const channelName = `realtime-notifications-${userId}`;
    if (supabaseToken) supabase.realtime.setAuth(supabaseToken);

    const refreshNotificationData = async () => {
      await refreshUnreadCount();
      await refreshNotifications(undefined, true);
    };
    const handleQueueChange = (detail: unknown) => {
      triggerArrivalEffect();
      window.dispatchEvent(new CustomEvent('demoshop:reservations-changed', { detail }));
      void refreshNotificationData();
    };
    const handleAppointmentChange = (detail: unknown) => {
      triggerArrivalEffect();
      window.dispatchEvent(new CustomEvent('demoshop:appointments-changed', { detail }));
      void refreshNotificationData();
    };
    const handleShiftRequestChange = (detail: unknown) => {
      window.dispatchEvent(new CustomEvent('demoshop:shift-request-changed', { detail }));
      void refreshNotificationData();
    };

    const notificationsFallbackController = createRealtimeFallback({
      telemetryChannel: channelName,
      refresh: refreshNotificationData,
      fallbackIntervalMs: 60_000,
    });
    const notificationsChannel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as any;
          const notification: AppNotification = {
            id: Number(row.id), event: row.event, type: row.type, title: row.title,
            message: row.message, metadata: row.metadata ?? null, read: false,
            created_at: row.created_at, queue_entry_id: row.queue_entry_id ?? null,
            branch_id: row.branch_id ?? null,
          };
          knownNotificationIds.current.add(String(notification.id));
          setNotifications((current) => [notification, ...current.filter((item) => item.id !== notification.id)]);
          invalidateNotificationCache(notificationUserId);
          window.dispatchEvent(new CustomEvent('demoshop:notifications-changed', { detail: notification }));
          void refreshUnreadCount((current) => (current ?? 0) + 1, false);
          triggerArrivalEffect();
          window.dispatchEvent(new CustomEvent('demoshop:notification-received', { detail: notification }));
          const idStr = String(notification.id);
          if (
            !notification.read &&
            isNotificationRecent(notification.created_at) &&
            popupEvents.includes(notification.event) &&
            (!visibleEvents || visibleEvents.includes(notification.event)) &&
            !announcedNotificationIds.current.has(idStr) &&
            !sessionAnnounced.has(idStr)
          ) {
            announcedNotificationIds.current.add(idStr);
            sessionAnnounced.add(idStr);
            if (!isMuted) playNotificationSound(isAuthenticated);
            onNewNotification?.(notification);
          }
        }
      )
      .subscribe((status, error) => notificationsFallbackController.onStatus(status, error));

    const realtimeGroup = createHasuraFallbackGroup({
      onFallbackActivate: refreshNotificationData,
      onBothUnavailable: refreshNotificationData,
      degradedIntervalMs: 60_000,
    });

    realtimeGroup.subscribe(
      `subscription WatchNotificationQueue {
         queue_entries(limit: 1, order_by: { id: desc }) {
           id
           status
         }
       }`,
      {},
      (data) => handleQueueChange(data),
      () => {},
      {
        subscribeFallback: (onStatus) => {
          const channel = supabase
            .channel(`${channelName}-queue-supabase-fallback`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'queue_entries' }, (payload) => handleQueueChange(payload))
            .subscribe(onStatus);
          return () => { void supabase.removeChannel(channel); };
        },
      },
    );
    realtimeGroup.subscribe(
      `subscription WatchNotificationAppointments {
         appointments(limit: 1) {
           __typename
         }
       }`,
      {},
      (data) => handleAppointmentChange(data),
      () => {},
      {
        subscribeFallback: (onStatus) => {
          const fallbackChannel = supabase
            .channel(`${channelName}-appointments-supabase-fallback`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, (payload) => handleAppointmentChange(payload))
            .subscribe(onStatus);
          const broadcastChannel = supabase
            .channel('admin-appointments-live-sync')
            .on('broadcast', { event: 'appointment_changed' }, (payload) => handleAppointmentChange(payload))
            .subscribe();
          return () => {
            void supabase.removeChannel(fallbackChannel);
            void supabase.removeChannel(broadcastChannel);
          };
        },
      },
    );
    realtimeGroup.subscribe(
      `subscription WatchNotificationShiftRequests {
         barber_shift_requests(limit: 1) {
           __typename
         }
       }`,
      {},
      (data) => handleShiftRequestChange(data),
      () => {},
      {
        subscribeFallback: (onStatus) => {
          const channel = supabase
            .channel(`${channelName}-shift-requests-supabase-fallback`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'barber_shift_requests' }, (payload) => handleShiftRequestChange(payload))
            .subscribe(onStatus);
          return () => { void supabase.removeChannel(channel); };
        },
      },
    );

    return () => {
      realtimeGroup.cleanup();
      notificationsFallbackController.cleanup();
      void supabase.removeChannel(notificationsChannel).catch((error: unknown) => {
        console.warn('[NotificationBell Realtime] Failed to remove channel.', error);
      });
    };
  }, [isAuthenticated, notificationUserId, supabaseToken, refreshUnreadCount, refreshNotifications, triggerArrivalEffect, popupEventsKey, visibleEventsKey, onNewNotification, isMuted]);

  // Handle click outside and Escape key to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const visibleNotifications = visibleEvents
    ? notifications.filter((notification) => visibleEvents.includes(notification.event))
    : notifications;
  const unreadCount = visibleNotifications.filter((notification) => !notification.read).length;
  const knownUnreadCount = unreadCountData ?? unreadCount;
  const totalAlertCount = badgeCount !== undefined ? Math.max(badgeCount, knownUnreadCount) : knownUnreadCount;

  const filteredNotifications = visibleNotifications.filter((n) => {
    if (filter === 'unread') return !n.read;
    return true;
  });

  const handleMarkAllRead = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setNotifications((current) => current.map((item) => ({ ...item, read: true })));
    void refreshUnreadCount(0, false);
    try {
      await api.patch('/api/notifications/read-all');
    } catch (error) {
      console.warn('[Notifications] Failed to mark all notifications read:', error);
    }
  };

  const handleMarkSingleRead = async (e: React.MouseEvent, notificationId: number) => {
    e.stopPropagation();
    setNotifications((current) =>
      current.map((item) => (item.id === notificationId ? { ...item, read: true } : item))
    );
    void refreshUnreadCount((current) => Math.max(0, (current ?? 0) - 1), false);
    try {
      await api.patch(`/api/notifications/${notificationId}/read`);
    } catch (error) {
      console.warn('[Notifications] Failed to mark notification read:', error);
    }
  };

  const selectNotification = async (notification: AppNotification) => {
    setIsOpen(false);
    if (!notification.read) {
      setNotifications((current) =>
        current.map((item) => String(item.id) === String(notification.id) ? { ...item, read: true } : item)
      );
      void refreshUnreadCount((current) => Math.max(0, (current ?? 0) - 1), false);
      try {
        await api.patch(`/api/notifications/${notification.id}/read`);
      } catch (error) {
        console.warn('[Notifications] Failed to mark notification read:', error);
      }
    }
    onSelect?.(notification);
  };

  return (
    <div className="relative" ref={notificationRef}>
      <button
          onClick={() => { const next = !isOpen; setIsOpen(next); if (next) void refreshNotifications(); }}
        aria-label="Notifications"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className={`relative text-ivory-dim hover:text-gold transition-all duration-200 p-2 rounded-full cursor-pointer focus:outline-none focus:ring-1 focus:ring-gold/40 ${
          isOpen ? 'bg-white/10 text-gold' : 'hover:bg-white/5'
        }`}
      >
        <Bell className={`w-5 h-5 sm:w-6 sm:h-6 transition-transform ${isWiggling ? 'animate-bounce text-gold' : ''}`} />

        {totalAlertCount > 0 && (
          <span className="absolute -top-0.5 -right-1 flex h-4 min-w-[16px] px-1 items-center justify-center">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75" />
            <span className="relative inline-flex items-center justify-center rounded-full h-4 min-w-[16px] px-1 bg-rose-600 ring-2 ring-charcoal text-white text-[9px] font-black leading-none shadow-md">
              {totalAlertCount > 99 ? '99+' : totalAlertCount}
            </span>
          </span>
        )}
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="Notification Center"
          className="fixed sm:absolute left-2 right-2 sm:left-auto sm:right-0 top-16 sm:top-full mt-2 sm:mt-3 w-auto sm:w-96 bg-charcoal/95 backdrop-blur-xl border border-white/10 rounded-sm shadow-2xl animate-fade-in z-50 overflow-hidden transform-gpu will-change-transform"
        >
          {/* Luxury gold accent line */}
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-gold/50 to-transparent" />

          {/* Header */}
          <div className="p-3.5 border-b border-white/5 bg-white/[0.02] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-serif font-bold text-ivory tracking-wider uppercase">Notifications</h4>
              {unreadCount > 0 && (
                <span className="text-[9px] font-mono font-bold bg-gold/10 text-gold border border-gold/20 px-1.5 py-0.5 rounded-full">
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={toggleSound}
                title={isMuted ? 'Unmute alert audio' : 'Mute alert audio'}
                className="p-1 rounded text-ivory-dim hover:text-gold hover:bg-white/5 transition-colors cursor-pointer"
              >
                {isMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5 text-gold" />}
              </button>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="text-[10px] text-gold hover:text-white transition-colors cursor-pointer uppercase tracking-wider font-semibold px-2 py-0.5 rounded hover:bg-white/5"
                >
                  Mark all read
                </button>
              )}
            </div>
          </div>

          {/* Segmented Filter Bar */}
          <div className="px-3.5 py-2 bg-charcoal-light/60 border-b border-white/5 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1 bg-charcoal p-0.5 rounded border border-white/5">
              <button
                type="button"
                onClick={() => setFilter('all')}
                className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer ${
                  filter === 'all'
                    ? 'bg-gold/20 text-gold font-semibold shadow-xs'
                    : 'text-ivory-dim hover:text-ivory'
                }`}
              >
                All ({visibleNotifications.length})
              </button>
              <button
                type="button"
                onClick={() => setFilter('unread')}
                className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer ${
                  filter === 'unread'
                    ? 'bg-gold/20 text-gold font-semibold shadow-xs'
                    : 'text-ivory-dim hover:text-ivory'
                }`}
              >
                Unread ({unreadCount})
              </button>
            </div>
            <span className="text-[10px] text-ivory-dim/60 font-mono">
              {filter === 'unread' ? `${unreadCount} unread` : `${visibleNotifications.length} total`}
            </span>
          </div>

          {/* Notification List Body */}
          <div
            className="max-h-80 sm:max-h-96 overflow-y-auto custom-scrollbar divide-y divide-white/5"
            onScroll={(event) => {
              const element = event.currentTarget;
              if (element.scrollTop + element.clientHeight >= element.scrollHeight - 48) void loadOlderNotifications();
            }}
          >
            {filteredNotifications.length === 0 ? (
              <div className="py-10 px-6 text-center flex flex-col items-center justify-center gap-2">
                <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-gold/60">
                  <Sparkles className="w-5 h-5" />
                </div>
                <p className="text-xs font-semibold text-ivory">All caught up!</p>
                <p className="text-[11px] text-ivory-dim">
                  {filter === 'unread' ? 'No unread notifications at this time.' : 'No alerts recorded for your shift.'}
                </p>
              </div>
            ) : (
              <>
              {filteredNotifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`group w-full p-3.5 hover:bg-white/5 transition-colors relative flex gap-3 items-start ${
                    !notification.read ? 'bg-gold/[0.04]' : ''
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => selectNotification(notification)}
                    className="flex min-w-0 flex-1 gap-3 items-start text-left cursor-pointer"
                  >
                    {getNotificationBadge(notification.event, notification.type)}
                    <div className="flex-1 min-w-0 pr-1">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <p className={`text-xs truncate ${!notification.read ? 'text-ivory font-bold' : 'text-ivory-dim'}`}>
                          {notification.title}
                        </p>
                        <span className="text-[10px] font-mono text-ivory-dim/60 shrink-0">
                          {formatRelativeTime(notification.created_at)}
                        </span>
                      </div>
                      <p className="text-[11px] text-ivory-dim line-clamp-2 leading-relaxed">
                        {notification.message}
                      </p>
                    </div>
                  </button>

                  <div className="flex flex-col items-center justify-between self-stretch shrink-0 pt-0.5">
                    {!notification.read && (
                      <span className="w-2 h-2 rounded-full bg-gold shrink-0 shadow-xs shadow-gold/50" />
                    )}
                    {!notification.read && (
                      <button
                        type="button"
                        onClick={(e) => handleMarkSingleRead(e, notification.id)}
                        title="Mark as read"
                        aria-label="Mark notification as read"
                        className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity p-1 hover:bg-gold/20 text-ivory-dim hover:text-gold rounded cursor-pointer mt-auto"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {isLoadingMore && <div className="p-3 text-center text-[10px] text-ivory-dim">Loading older notifications…</div>}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;

