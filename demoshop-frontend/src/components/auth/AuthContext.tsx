import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { supabase } from '@/config/supabaseClient';
import { User, UserRole } from '@demoshop/shared-types';
import { authService } from '@/features/auth/services/auth.service';
import { telemetryManager } from '@/utils/adaptive-polling';
import { useToast } from '@/components/feedback/ToastContext';
import {
    createOfflineCashierAuthSnapshot,
    readOfflineCashierAuthSnapshot,
} from './offline-cashier-auth-cache';

export type AuthErrorState = {
    message: string;
    code?: string;
    status?: number;
};

export const AUTHENTICATION_RETRY_MESSAGE = 'Unable to process request right now. Please try again in a few moments.';

const getAuthError = (error: unknown): AuthErrorState => {
    const candidate = error as any;
    const responseData = candidate?.response?.data;
    const code = responseData?.error;
    const rawMessage = responseData?.message || responseData?.error || candidate?.message;
    return {
        message: code === 'RATE_LIMIT_UNAVAILABLE'
            ? AUTHENTICATION_RETRY_MESSAGE
            : typeof rawMessage === 'string' && rawMessage.trim()
                ? rawMessage
                : 'Authentication service is temporarily unavailable. Please try again.',
        code,
        status: candidate?.response?.status || candidate?.status,
    };
};

interface AuthContextType {
    user: Partial<User> | null;
    role: string | null;
    supabaseToken: string | null;
    authReady: boolean;
    setAuth: (userData: Partial<User> | null, token?: string | null) => void;
    clearAuth: () => void;
    logout: () => Promise<void>;
    refetchMe: () => Promise<void>;
    authError: AuthErrorState | null;
    isSystemAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

const AUTH_CACHE_KEY = 'demoshop_cached_user_profile';

const PROTECTED_ROUTE_PREFIXES = [
    '/admin',
    '/barber',
    '/cashier',
    '/dashboard',
    '/inventory-manager',
    '/system-admin',
];

const isProtectedPath = (pathname: string): boolean =>
    PROTECTED_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

const hasUsableCachedCashierProfile = (): boolean => {
    if (typeof window === 'undefined') return false;
    try {
        return Boolean(readOfflineCashierAuthSnapshot(
            window.localStorage.getItem(AUTH_CACHE_KEY),
            window.location.pathname,
        ));
    } catch {
        return false;
    }
};

const getInitialCachedProfile = (): { user: Partial<User> | null; role: string | null } => {
    try {
        if (typeof window === 'undefined') return { user: null, role: null };
        const offlineProfile = readOfflineCashierAuthSnapshot(
            window.localStorage.getItem(AUTH_CACHE_KEY),
            window.location.pathname,
        );
        if (offlineProfile) {
            const normalizedRole = (offlineProfile.role as any) === 'SystemAdmin'
                ? UserRole.SYSTEM_ADMIN
                : (offlineProfile.role as UserRole);
            return { user: { ...offlineProfile, role: normalizedRole }, role: normalizedRole };
        }

        const raw = window.sessionStorage.getItem(AUTH_CACHE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed.role === 'string') {
                const normalizedRole = (parsed.role as any) === 'SystemAdmin'
                    ? UserRole.SYSTEM_ADMIN
                    : (parsed.role as UserRole);
                return { user: { ...parsed, role: normalizedRole }, role: normalizedRole };
            }
        }
    } catch {
        // Fallback on storage errors
    }
    return { user: null, role: null };
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { addToast } = useToast();
    const cachedProfile = useMemo(() => getInitialCachedProfile(), []);
    const [user, setUser] = useState<Partial<User> | null>(cachedProfile.user);
    const [role, setRole] = useState<string | null>(cachedProfile.role);
    const [supabaseToken, setSupabaseToken] = useState<string | null>(null);
    const [authReady, setAuthReady] = useState<boolean>(cachedProfile.user !== null);
    const [authError, setAuthError] = useState<AuthErrorState | null>(null);

    const clearAuth = useCallback(() => {
        try {
            window.sessionStorage.removeItem(AUTH_CACHE_KEY);
            window.localStorage.removeItem(AUTH_CACHE_KEY);
        } catch {}
        setUser(null);
        setRole(null);
        setSupabaseToken(null);
    }, []);

    const applyProfile = useCallback((profile: Partial<User>, token: string | null, session: any) => {
        const normalizedRole = (profile.role as any) === 'SystemAdmin'
            ? UserRole.SYSTEM_ADMIN
            : ((profile.role as UserRole) || null);

        const updatedUser = { ...profile, role: normalizedRole || undefined };
        try {
            window.sessionStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(updatedUser));
            const offlineSnapshot = createOfflineCashierAuthSnapshot(updatedUser);
            if (offlineSnapshot) window.localStorage.setItem(AUTH_CACHE_KEY, offlineSnapshot);
            else window.localStorage.removeItem(AUTH_CACHE_KEY);
        } catch {}
        setUser(updatedUser);
        setRole(normalizedRole);
        setSupabaseToken(token || session?.access_token || null);
    }, []);

    const handleSessionChange = useCallback(async (event: string, session: any) => {
        // SIGNED_OUT is terminal. Do not call /me after logout, because the
        // missing session would otherwise start the refresh flow again.
        if (event === 'SIGNED_OUT') {
            // Supabase can emit SIGNED_OUT when its refresh fails. Keep a
            // recent cashier-only snapshot so that transient auth-provider
            // failures do not discard the offline workflow. Explicit logout
            // still removes the snapshot in logout().
            if (hasUsableCachedCashierProfile()) {
                setAuthReady(true);
                return;
            }
            clearAuth();
            setAuthReady(true);
            return;
        }

        // Public pages do not need to block their first paint on an API auth
        // probe. Cookie-only sessions are restored when the user enters a
        // protected route; protected routes still verify before rendering.
        // An SDK session is kept on this path because it can be used directly
        // by the existing auth bootstrap without weakening authorization.
        if (
            !cachedProfile.user &&
            !session?.user &&
            typeof window !== 'undefined' &&
            !isProtectedPath(window.location.pathname)
        ) {
            setAuthReady(true);
            return;
        }

        try {
            // The Google flow stores the session in HttpOnly API cookies, so the
            // Supabase browser SDK can legitimately report no session after a
            // full-page refresh. Always bootstrap from the API first.
            const { user: profile, supabaseToken: token } = await authService.fetchCurrentUserProfile();

            if (profile) {
                setAuthError(null);
                applyProfile(profile, token, session);
            } else if (session?.user) {
                // An SDK fallback is only safe when the SDK explicitly carries
                // a recognized role. Never invent Customer as a default.
                const fallbackRole = session.user.user_metadata?.role as string | undefined;
                if (fallbackRole) {
                    const normalizedRole = (fallbackRole === 'SystemAdmin' ? UserRole.SYSTEM_ADMIN : fallbackRole) as UserRole;
                    setUser({
                        user_id: session.user.id,
                        email: session.user.email || '',
                        role: normalizedRole,
                    });
                    setRole(normalizedRole);
                    setSupabaseToken(session.access_token || null);
                } else {
                    console.warn('[AuthContext] No API profile or explicit SDK role; clearing authentication state.');
                    if (!hasUsableCachedCashierProfile()) clearAuth();
                }
            } else {
                // A missing server profile does not invalidate this bounded,
                // branch-scoped offline identity. Refresh/logout handling
                // clears it when the cashier explicitly signs out.
                if (hasUsableCachedCashierProfile()) return;
                clearAuth();
            }
        } catch (err) {
            const authError = getAuthError(err);
            setAuthError(authError);
            if (window.location.pathname !== '/login') {
                addToast({ type: 'error', title: 'Authentication error', message: authError.message });
            }
            console.error('[AuthContext] Error in handleSessionChange:', err);
        } finally {
            setAuthReady(true);
        }
    }, [addToast, applyProfile, clearAuth]);

    useEffect(() => {
        // Listen for auth state changes (which immediately fires callback with current session)
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            void handleSessionChange(event, session);
        });

        return () => {
            subscription.unsubscribe();
        };
    }, [handleSessionChange]);

    useEffect(() => {
        if (!authReady || !supabaseToken) return;

        // Configure the shared Realtime client once whenever the authenticated
        // token changes. Individual listeners can then subscribe safely without
        // duplicating token setup or racing the auth bootstrap.
        void Promise.resolve(supabase.realtime.setAuth(supabaseToken)).catch((error: unknown) => {
            telemetryManager.logEvent('supabase_realtime_auth_error', {
                errorMessage: error instanceof Error ? error.message.slice(0, 300) : 'Realtime auth setup failed',
            });
            console.warn('[AuthContext] Supabase Realtime auth setup failed.', error);
        });
    }, [authReady, supabaseToken]);

    const setAuth = useCallback((userData: Partial<User> | null, token: string | null = null) => {
        if (userData) {
            applyProfile(userData, token, null);
            return;
        }
        setUser(null);
        setRole(null);
        setSupabaseToken(null);
    }, [applyProfile]);

    const logout = useCallback(async () => {
        let logoutFailed = false;
        try {
            // Clear the API cookie session before signing out the SDK session;
            // otherwise the initial auth callback can immediately restore it.
            await authService.logoutCookieSession();
            await supabase.auth.signOut();
        } catch (e) {
            logoutFailed = true;
            const authError = getAuthError(e);
            setAuthError(authError);
            addToast({ type: 'error', title: 'Logout error', message: authError.message });
            console.error('[AuthContext] Logout error:', e);
        } finally {
            clearAuth();
            // Keep the current React tree alive when cookie cleanup fails so
            // the exact error toast remains visible. Protected routes will
            // redirect after clearAuth; public routes remain safely signed out.
            if (!logoutFailed && window.location.pathname !== '/login') {
                window.location.replace('/login');
            }
        }
    }, [addToast, clearAuth]);

    const refetchMe = useCallback(async () => {
        try {
            // Fetch from the backend API directly — works for both Supabase OAuth users
            // and custom-JWT users. Do NOT gate on supabase.auth.getSession() here:
            // custom-JWT users have no Supabase session, so getSession() returns null
            // and the old code would call clearAuth(), logging them out.
            const { user: profile, supabaseToken: token } = await authService.fetchCurrentUserProfile();
            if (profile) {
                applyProfile(profile, token, null);
            }
        } catch (error) {
            const authError = getAuthError(error);
            setAuthError(authError);
            if (window.location.pathname !== '/login') {
                addToast({ type: 'error', title: 'Authentication error', message: authError.message });
            }

            // Preserve the current identity during transient failures. A 401
            // means the refresh interceptor could not restore the session.
            if (authError.status === 401 && !hasUsableCachedCashierProfile()) clearAuth();
            throw error;
        }
    }, [addToast, applyProfile, clearAuth]);

    return (
        <AuthContext.Provider value={{
            user,
            role,
            supabaseToken,
            authReady,
            setAuth,
            clearAuth,
            logout,
            refetchMe,
            authError,
            isSystemAdmin: role === 'System Admin'
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = (): AuthContextType => {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
    return ctx;
};
