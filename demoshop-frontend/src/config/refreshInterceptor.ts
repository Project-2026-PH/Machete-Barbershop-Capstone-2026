import type { InternalAxiosRequestConfig } from 'axios';
import { api } from './api';
import { readOfflineCashierAuthSnapshot } from '../components/auth/offline-cashier-auth-cache';

let isRefreshing = false;
let failedQueue: Array<{ resolve: () => void; reject: (reason?: unknown) => void }> = [];

type CustomInternalAxiosRequestConfig = InternalAxiosRequestConfig & {
    _retry?: boolean;
};

const processQueue = (error: unknown = null) => {
    failedQueue.forEach((prom) => {
        if (error) {
            prom.reject(error);
        } else {
            prom.resolve();
        }
    });
    failedQueue = [];
};

const hasUnresolvedCashierWork = async (): Promise<boolean> => {
    if (typeof window === 'undefined') return false;
    const profile = readOfflineCashierAuthSnapshot(
        window.localStorage.getItem('demoshop_cached_user_profile'),
        window.location.pathname,
    );
    if (!profile) return false;
    try {
        const repository = await import('@/features/cashier/services/cashier-offline.repository');
        const operations = await repository.listCashierOutboxJournal(Number(profile.branch_id), String(profile.user_id));
        const hasWork = operations.some((operation) => operation.status !== 'synced');
        if (hasWork) window.dispatchEvent(new CustomEvent('cashier-offline-auth-refresh-failed'));
        return hasWork;
    } catch {
        return false;
    }
};

const hasCachedCashierIdentity = (): boolean => {
    if (typeof window === 'undefined') return false;
    try {
        return Boolean(readOfflineCashierAuthSnapshot(
            window.localStorage.getItem('demoshop_cached_user_profile'),
            window.location.pathname,
        ));
    } catch {
        return false;
    }
};

/**
 * Attach the 401 refresh interceptor to the shared api instance.
 * Returns cleanup so React Strict Mode/HMR cannot accumulate handlers.
 */
export const setupRefreshInterceptor = (logout: () => void): (() => void) => {
    const interceptorId = api.interceptors.response.use(
        // Pass successful responses straight through
        (response: any) => response,

        async (error: any) => {
            const originalRequest = error.config as CustomInternalAxiosRequestConfig;

            // Only handle 401s, and only once per request (prevent infinite loops)
            if (error.response?.status !== 401 || originalRequest?._retry) {
                return Promise.reject(error);
            }

            // `/auth/me` is an authentication probe made on every public page.
            // A failed refresh for this probe means "not signed in" and must not
            // hard-navigate anonymous visitors to `/login`. We still attempt the
            // refresh first so an expired but valid session can recover.
            const url = originalRequest?.url ?? '';
            const isAuthProbe = url.includes('/auth/me');

            // Never attempt refresh on auth entry, refresh, or logout endpoints themselves.
            if (
                url.includes('/auth/session/refresh') ||
                url.includes('/auth/refresh') ||
                url.includes('/auth/session/logout') ||
                url.includes('/auth/login') ||
                url.includes('/auth/register') ||
                url.includes('/auth/verify-email') ||
                url.includes('/auth/forgot-password')
            ) {
                return Promise.reject(error);
            }

            // If a refresh is already in flight, queue this request to retry after it completes
            if (isRefreshing) {
                return new Promise<void>((resolve, reject) => {
                    failedQueue.push({ resolve: () => resolve(), reject });
                })
                    .then(() => api(originalRequest))
                    .catch((err) => Promise.reject(err));
            }

            // Mark this request so it won't be intercepted again after the retry
            originalRequest._retry = true;
            isRefreshing = true;

            try {
                // Google/Supabase sessions use the provider refresh cookie.
                // Password sessions use the custom `token` cookie, so fall
                // back to its rotation endpoint only when no provider refresh
                // cookie exists.
                try {
                    await api.post('/api/auth/session/refresh');
                } catch (providerRefreshError) {
                    const status = (providerRefreshError as any)?.response?.status;
                    const message = (providerRefreshError as any)?.response?.data?.error;
                    if (status !== 401 || message !== 'Refresh cookie missing.') throw providerRefreshError;
                    await api.post('/api/auth/refresh');
                }

                // Unblock any requests that were queued while we were refreshing
                processQueue(null);

                // Retry the original failed request — the new cookie is now set
                return api(originalRequest);
            } catch (refreshError) {
                // Only a definitive 401 from the refresh endpoint means the
                // session is invalid. Network failures and provider errors must
                // not erase the locally cached cashier session.
                const refreshStatus = (refreshError as any)?.response?.status;
                const definitiveSessionFailure = refreshStatus === 401;
                // Anonymous /me probes should not redirect guests, but a
                // cached cashier identity on a protected route is an actual
                // session that must be cleared after a definitive 401.
                const shouldLogout = definitiveSessionFailure && (
                    !isAuthProbe || failedQueue.length > 0 || hasCachedCashierIdentity()
                );
                processQueue(refreshError);
                const preserveCachedCashierSession = shouldLogout && hasCachedCashierIdentity();
                const preserveCashierSession = preserveCachedCashierSession
                    || (shouldLogout && await hasUnresolvedCashierWork());
                if (preserveCachedCashierSession) {
                    window.dispatchEvent(new CustomEvent('cashier-offline-auth-refresh-failed'));
                }
                if (shouldLogout && !preserveCashierSession) {
                    logout(); // clears AuthContext state and redirects to /login
                }
                return Promise.reject(refreshError);
            } finally {
                isRefreshing = false;
            }
        }
    );

    return () => api.interceptors.response.eject(interceptorId);
};
