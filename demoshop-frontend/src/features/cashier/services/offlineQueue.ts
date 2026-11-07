import { api } from '@/config/api';
import { resolveOfflineDaemonUrl } from './offline-daemon-config';
import { invalidateCashierRequests } from './shared-request-cache';

const DEFAULT_LOCAL_DAEMON_URL = resolveOfflineDaemonUrl(
    import.meta.env.DEV,
    import.meta.env.VITE_OFFLINE_DAEMON_URL,
);
const FALLBACK_STORAGE_KEY = 'demoshop_offline_queue';

export interface OfflinePayload {
    [key: string]: any;
    _offlineDestination?: string;
}

export interface PendingOrder {
    id: number;
    payload: OfflinePayload;
    status: 'pending' | 'synced';
}

export interface OfflineHttpResponse {
    ok: boolean;
    json<T = any>(): Promise<T>;
}

export interface OfflineDaemonTransport {
    request(url: string, init?: {
        method?: string;
        headers?: Record<string, string>;
        body?: string;
    }): Promise<OfflineHttpResponse>;
}

export interface OfflineCloudTransport {
    post<T = any>(url: string, payload: unknown): Promise<{ data: T }>;
}

export interface OfflineQueueStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

export interface OfflineQueueEnvironment {
    isOnline(): boolean;
    isDocumentHidden(): boolean;
    addEventListener(type: 'online' | 'visibilitychange', listener: () => void): void;
    removeEventListener(type: 'online' | 'visibilitychange', listener: () => void): void;
}

export interface OfflineQueueScheduler {
    setTimeout(callback: () => void, delay: number): ReturnType<typeof setTimeout>;
    clearTimeout(handle: ReturnType<typeof setTimeout>): void;
}

export interface OfflineQueueDependencies {
    daemonUrl?: string;
    daemonTransport?: OfflineDaemonTransport;
    cloudTransport?: OfflineCloudTransport;
    storage?: OfflineQueueStorage;
    environment?: OfflineQueueEnvironment;
    now?: () => number;
    random?: () => number;
}

const memoryStorage = new Map<string, string>();
const fallbackStorage: OfflineQueueStorage = {
    getItem: (key) => memoryStorage.get(key) ?? null,
    setItem: (key, value) => { memoryStorage.set(key, value); },
};

const defaultStorage: OfflineQueueStorage = typeof localStorage !== 'undefined'
    ? localStorage
    : fallbackStorage;

const defaultDaemonTransport: OfflineDaemonTransport = {
    request: async (url, init) => {
        const headers: Record<string, string> = {
            ...(init?.headers as Record<string, string> || {}),
        };
        try {
            const { supabase } = await import('@/config/supabaseClient');
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.access_token && !headers['Authorization']) {
                headers['Authorization'] = `Bearer ${session.access_token}`;
            }
        } catch {
            // Ignore if Supabase client is uninitialized or offline
        }
        return fetch(url, {
            ...init,
            credentials: 'include',
            headers,
        });
    },
};

const defaultEnvironment: OfflineQueueEnvironment = {
    isOnline: () => typeof navigator === 'undefined' || navigator.onLine,
    isDocumentHidden: () => typeof document !== 'undefined' && document.hidden,
    addEventListener: (type, listener) => {
        if (typeof window !== 'undefined') window.addEventListener(type, listener);
    },
    removeEventListener: (type, listener) => {
        if (typeof window !== 'undefined') window.removeEventListener(type, listener);
    },
};

const defaultScheduler: OfflineQueueScheduler = {
    setTimeout: (callback, delay) => setTimeout(callback, delay),
    clearTimeout: (handle) => clearTimeout(handle),
};

const parsePendingOrders = (storage: OfflineQueueStorage): PendingOrder[] => {
    try {
        const parsed = JSON.parse(storage.getItem(FALLBACK_STORAGE_KEY) || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

export interface OfflineQueue {
    save(payload: OfflinePayload): Promise<number | null>;
    getPending(): Promise<PendingOrder[]>;
    sync(): Promise<boolean>;
}

export function createOfflineQueue(dependencies: OfflineQueueDependencies = {}): OfflineQueue {
    const daemonUrl = dependencies.daemonUrl ?? DEFAULT_LOCAL_DAEMON_URL;
    const daemonTransport = dependencies.daemonTransport ?? defaultDaemonTransport;
    const cloudTransport: OfflineCloudTransport = dependencies.cloudTransport ?? {
        post: (url, payload) => api.post(url, payload),
    };
    const storage = dependencies.storage ?? defaultStorage;
    const environment = dependencies.environment ?? defaultEnvironment;
    const now = dependencies.now ?? Date.now;
    const random = dependencies.random ?? Math.random;

    const queue: OfflineQueue = {
        save: async (payload) => {
            if (!daemonUrl) {
                const fallbackQueue = parsePendingOrders(storage);
                fallbackQueue.push({ id: now() + Math.floor(random() * 1000), payload, status: 'pending' });
                storage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(fallbackQueue));
                return null;
            }
            try {
                const response = await daemonTransport.request(`${daemonUrl}/api/local-queue`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                if (!response.ok) throw new Error('Daemon responded with error');
                const data = await response.json<{ localId?: number }>();
                return data.localId ?? null;
            } catch (error) {
                console.error('[OfflineQueue] Failed to save to local daemon:', error);
                const fallbackQueue = parsePendingOrders(storage);
                fallbackQueue.push({ id: now() + Math.floor(random() * 1000), payload, status: 'pending' });
                storage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(fallbackQueue));
                return null;
            }
        },

        getPending: async () => {
            if (!daemonUrl) return parsePendingOrders(storage);
            try {
                const response = await daemonTransport.request(`${daemonUrl}/api/local-queue`);
                const data = await response.json<{ pending?: PendingOrder[] }>();
                return Array.isArray(data.pending) ? data.pending : [];
            } catch (error) {
                console.warn('[OfflineQueue] Daemon unreachable, checking fallback localStorage');
                return parsePendingOrders(storage);
            }
        },

        sync: async () => {
            try {
                if (!environment.isOnline()) return false;

                const pendingOrders = await queue.getPending();
                const walkInOrders = pendingOrders.filter((order) =>
                    order.payload?._offlineDestination === '/api/cashier/walk-in'
                );
                if (walkInOrders.length === 0) return true;

                console.log('[OfflineQueue] Initiating sync for', walkInOrders.length, 'walk-in orders');
                let syncedCloudData = false;
                for (let start = 0; start < walkInOrders.length; start += 100) {
                    const batch = walkInOrders.slice(start, start + 100);
                    try {
                        const cloudResponse = await cloudTransport.post<{ syncedIds?: number[] }>('/api/orders/sync', batch);
                        const syncedIds = cloudResponse.data.syncedIds ?? [];

                        if (syncedIds.length > 0) {
                            syncedCloudData = true;
                            if (daemonUrl) try {
                                await daemonTransport.request(`${daemonUrl}/api/local-queue/mark-synced`, {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ ids: syncedIds }),
                                });
                            } catch {
                                console.warn('[OfflineQueue] Failed to mark local synced (Daemon down)');
                            }

                            const fallbackQueue = parsePendingOrders(storage);
                            storage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(
                                fallbackQueue.filter((order) => !syncedIds.includes(order.id))
                            ));
                        }
                    } catch (error: any) {
                        const invalidBarberOrders = error?.response?.status === 400
                            && /valid barber ID/i.test(String(error?.response?.data?.error || ''))
                            ? batch.filter((order) => !Number.isSafeInteger(order.payload?.barberId) || order.payload.barberId < 1)
                            : [];
                        if (invalidBarberOrders.length === 0) throw error;

                        await Promise.all(invalidBarberOrders.map(async (order) => {
                            if (daemonUrl) try {
                                const response = await daemonTransport.request(`${daemonUrl}/api/local-queue/${order.id}`, { method: 'DELETE' });
                                if (!response.ok) throw new Error('Daemon rejected invalid-order discard request');
                            } catch {
                                console.warn('[OfflineQueue] Failed to discard invalid daemon order; removing its fallback copy only.');
                            }
                        }));
                        const invalidIds = new Set(invalidBarberOrders.map((order) => order.id));
                        const fallbackQueue = parsePendingOrders(storage);
                        storage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(
                            fallbackQueue.filter((order) => !invalidIds.has(order.id))
                        ));
                        console.warn(`[OfflineQueue] Discarded ${invalidIds.size} invalid walk-in record(s) without a barber assignment.`);
                    }
                }
                if (syncedCloudData) invalidateCashierRequests();
                return true;
            } catch (error: any) {
                console.error('[OfflineQueue] Sync failed:', error);
                return false;
            }
        },
    };

    return queue;
}

export const offlineQueue = createOfflineQueue();

const DEFAULT_INTERVAL = 15000;
const MAX_INTERVAL = 120000;
type TimeoutHandle = ReturnType<typeof setTimeout>;

export function startOfflineQueuePolling(
    queue: OfflineQueue = offlineQueue,
    environment: OfflineQueueEnvironment = defaultEnvironment,
    scheduler: OfflineQueueScheduler = defaultScheduler,
): () => void {
    // The browser must not run a daemon poller when no daemon is configured.
    // Production deployments use the cloud API and should not wake every 15s.
    if (!DEFAULT_LOCAL_DAEMON_URL) return () => {};

    let currentInterval = DEFAULT_INTERVAL;
    let pollTimeoutId: TimeoutHandle | null = null;
    let stopped = false;

    const schedule = () => {
        if (!stopped) pollTimeoutId = scheduler.setTimeout(runSmartPoll, currentInterval);
    };

    const runSmartPoll = async () => {
        if (pollTimeoutId) {
            scheduler.clearTimeout(pollTimeoutId);
            pollTimeoutId = null;
        }
        if (stopped) return;
        if (!environment.isOnline() || environment.isDocumentHidden()) {
            schedule();
            return;
        }

        const success = await queue.sync();
        if (success) {
            currentInterval = DEFAULT_INTERVAL;
        } else {
            currentInterval = Math.min(currentInterval * 1.5, MAX_INTERVAL);
            console.warn(`[OfflineQueue] Smart polling backed off to ${currentInterval}ms`);
        }
        schedule();
    };

    const wakeWhenVisible = () => {
        if (!environment.isDocumentHidden()) void runSmartPoll();
    };
    const wakeWhenOnline = () => {
        currentInterval = DEFAULT_INTERVAL;
        void runSmartPoll();
    };

    environment.addEventListener('visibilitychange', wakeWhenVisible);
    environment.addEventListener('online', wakeWhenOnline);
    void runSmartPoll();

    return () => {
        stopped = true;
        if (pollTimeoutId) scheduler.clearTimeout(pollTimeoutId);
        environment.removeEventListener('visibilitychange', wakeWhenVisible);
        environment.removeEventListener('online', wakeWhenOnline);
    };
}
