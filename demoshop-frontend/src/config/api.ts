import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import { supabase } from '@/config/supabaseClient';

// Same-origin by default: leave VITE_API_URL unset in hosted deployments so
// every request (e.g. `/api/auth/me`) resolves against the frontend's own
// origin. Vercel's project-level rewrite (see demoshop-frontend/vercel.ts)
// proxies `/api/*` and `/uploads/*` to that environment's backend, so the
// browser only ever sees the frontend hostname and its HttpOnly session
// cookies (`sb-access-token` / `sb-refresh-token`) stay first-party instead
// of being treated as cross-site by Brave Shields or private-browsing
// third-party-cookie blocking. VITE_API_URL is retained only for local
// development against a backend on a different port than the Vite proxy.
const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
const isLocalBrowser = typeof window !== 'undefined' && localHosts.has(window.location.hostname);
const API_BASE_URL = isLocalBrowser ? (import.meta.env.VITE_API_URL || '') : '';

// Create Axios instance
export const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // Keep this for cookies/CORS
});

// Lock to serialize concurrent getSession/token-refresh calls
let activeSessionPromise: Promise<any> | null = null;

const getSharedSession = async () => {
    if (activeSessionPromise) {
        return activeSessionPromise;
    }
    activeSessionPromise = supabase.auth.getSession();
    try {
        const result = await activeSessionPromise;
        return result;
    } finally {
        activeSessionPromise = null;
    }
};

// Request interceptor to inject Supabase JWT
api.interceptors.request.use(
    async (config: InternalAxiosRequestConfig) => {
        if (config.baseURL && config.baseURL.match(/api\/?$/) && config.url?.startsWith('/api')) {
            config.baseURL = config.baseURL.replace(/api\/?$/, '');
        }

        try {
            const { data: { session } } = await getSharedSession();
            if (session && session.access_token) {
                config.headers.Authorization = `Bearer ${session.access_token}`;
            }
        } catch (authError: any) {
            console.warn('[API Interceptor] Failed to retrieve session from Supabase:', authError?.message || authError);
        }
        return config;
    },
    (error: any) => Promise.reject(error)
);

interface CustomAxiosErrorData {
  isNetworkError?: boolean;
  message?: string;
  error?: string;
  [key: string]: any;
}

// Response Interceptor: Handle 401s and Offline Network Errors
api.interceptors.response.use(
  (response: AxiosResponse) => {
    const isHtml = typeof response.data === 'string' && (
      response.data.trim().startsWith('<!DOCTYPE') || 
      response.data.trim().startsWith('<html')
    );

    if (isHtml && response.config.url?.includes('/api')) {
      const error = new Error('HTML fallback received instead of API response') as any;
      error.response = response;
      error.config = response.config;
      return Promise.reject(error);
    }

    // Clean up legacy transient cache keys from earlier versions
    if (typeof localStorage !== 'undefined') {
      try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (key && key.startsWith('demoshop_cache_') && !key.startsWith('demoshop_cache_/api/services')) {
            localStorage.removeItem(key);
          }
        }
      } catch {
        // Ignore localStorage access errors
      }
    }

    // Only cache stable reference/catalog endpoints for offline availability (e.g. service menu).
    // Do NOT cache transient per-order payment quotes or live queue positions.
    if (response.config.method === 'get') {
      const url = response.config.url;
      if (url && url.startsWith('/api/services')) {
        localStorage.setItem(`demoshop_cache_${url}`, JSON.stringify(response.data));
      }
    }
    return response;
  },
  async (error: AxiosError<CustomAxiosErrorData>) => {
    // Leave 401 handling to refreshInterceptor. It must be able to refresh
    // the HttpOnly cookie before the auth provider redirects to /login.
    if (error.response?.status === 401) {
      return Promise.reject(error);
    }
    // Identify Network Failure 
    let isNetworkError = (!error.response && (error as any).isAxiosError);
    
    if (error.response) {
       const status = error.response.status;
       const errData = error.response.data;
       const errString = JSON.stringify(errData || {}).toLowerCase();
       
       if (status >= 500 || (status === 503 && errData?.isNetworkError)) {
           isNetworkError = true;
       } else if (status >= 400 && status <= 599) { 
           // If the backend threw a raw database timeout/disconnect string
           if (errString.includes('enotfound') || 
               errString.includes('econnreset') || 
               errString.includes('connection terminated') || 
               errString.includes('socket hang up') || 
               errString.includes('timeout')) {
               isNetworkError = true;
           }
       }
    }

    if (isNetworkError) {
      const config = error.config!;
      void import('@/features/cashier/services/cashier-connectivity').then(({ markCashierApiFailure }) => {
        markCashierApiFailure();
      });
      
      // Dynamic import to avoid circular dependency loops at boot
      if ((config as InternalAxiosRequestConfig & { _cashierOfflineManaged?: boolean })._cashierOfflineManaged) {
        return Promise.reject(error);
      }
      const { offlineQueue } = await import('@/features/cashier/services/offlineQueue');

      // Only offline-queue the typed cashier walk-in command. Replaying every
      // failed write as a walk-in corrupts unrelated requests and tenancy data.
      if (config.method === 'post' && config.url === '/api/cashier/walk-in') {
        console.warn('[Network Error] Saving cashier walk-in to the offline queue.');
        try {
          const payload = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
          await offlineQueue.save({
            ...payload,
            _offlineDestination: '/api/cashier/walk-in',
          });

          return Promise.resolve({ data: { success: true, offline: true, message: 'Saved to local queue' } });
        } catch (e) {
          console.error('[Network Error] Failed to save to offline queue', e);
          return Promise.reject(error);
        }
      }

      // If it's a retrieval (GET) of cacheable reference data, pull from localStorage cache
      if (config.method === 'get' && config.url && config.url.startsWith('/api/services')) {
        const cachedData = localStorage.getItem(`demoshop_cache_${config.url}`);
        if (cachedData) {
          console.warn(`[Network Error] Serving ${config.url} from offline cache`);
          return Promise.resolve({ data: JSON.parse(cachedData) });
        }
      }
    }

    return Promise.reject(error);
  }
);
