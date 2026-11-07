import { api } from '@/config/api';
import { cachedRequest, invalidateRequests } from '@/utils/request-cache';

export interface NotificationRecord {
  id: number;
  event: string;
  type: 'success' | 'info' | 'warning' | 'error';
  title: string;
  message: string;
  metadata?: Record<string, unknown> | null;
  read: boolean;
  created_at: string;
  queue_entry_id?: number | null;
  branch_id?: number | null;
}

export const getNotificationCacheKey = (userId: string): string => `notifications:${userId}`;
export const getNotificationCountCacheKey = (userId: string): string => `notifications:count:${userId}`;

export type NotificationPage = { items: NotificationRecord[]; nextCursor: number | null };

export const fetchNotifications = (userId: string, cursor?: number): Promise<NotificationPage> =>
  cachedRequest(`${getNotificationCacheKey(userId)}:${cursor ?? 'first'}`, async () => {
    try {
      const response = await api.get('/api/notifications', { params: { limit: 20, ...(cursor ? { cursor } : {}) } });
      return response.data?.items ? response.data : { items: [], nextCursor: null };
    } catch (err) {
      console.error('[notification-cache] Error fetching notifications:', err);
      return { items: [], nextCursor: null };
    }
  }, 1_000);

export const fetchUnreadNotificationCount = async (): Promise<number> => {
  const response = await api.get('/api/notifications/count');
  return Number(response.data?.count || 0);
};

export const invalidateNotificationCache = (userId: string): void => {
  invalidateRequests(getNotificationCacheKey(userId));
  invalidateRequests(getNotificationCountCacheKey(userId));
};
