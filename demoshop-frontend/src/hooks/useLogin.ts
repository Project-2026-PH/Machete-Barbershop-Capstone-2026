import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { AUTHENTICATION_RETRY_MESSAGE, useAuth } from '@/components/auth/AuthContext';
import { supabase } from '@/config/supabaseClient';
import { api } from '@/config/api';
import { authService } from '@/features/auth/services/auth.service';
import { preloadRoleDashboard, LAST_ROLE_STORAGE_KEY } from '@/utils/rolePreloader';

export const useLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [lastLoginMethod, setLastLoginMethod] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const { user, role, authReady, refetchMe, setAuth, clearAuth } = useAuth();

  useEffect(() => {
    const state = location.state as { email?: string; message?: string } | null;
    if (state?.email) setEmail(state.email);
    if (state?.message) setSuccess(state.message);
  }, [location.state]);

  const getLoginErrorMessage = (err: any) => {
    const responseData = err?.response?.data;
    if (responseData?.error === 'RATE_LIMIT_UNAVAILABLE') {
      return AUTHENTICATION_RETRY_MESSAGE;
    }
    return responseData?.message || responseData?.error || err?.message || 'Invalid email or password.';
  };

  const navigateByRole = (userRole: string, state = {}) => {
    switch (userRole) {
      case 'System Admin':
      case 'SystemAdmin':
        navigate('/system-admin/dashboard', { replace: true, state });
        break;
      case 'Admin':
      case 'Owner':
      case 'ShopAdmin':
        navigate('/admin', { replace: true, state });
        break;
      case 'Cashier':
        navigate('/cashier', { replace: true, state });
        break;
      case 'Inventory Manager':
        navigate('/inventory-manager', { replace: true, state });
        break;
      case 'Barber':
        navigate('/barber', { replace: true, state });
        break;
      case 'Customer':
      default:
        navigate('/dashboard', { replace: true, state });
    }
  };

  const navigateAfterAuth = (userRole: string, state = {}) => {
    preloadRoleDashboard(userRole);
    try {
      localStorage.setItem(LAST_ROLE_STORAGE_KEY, userRole);
    } catch {
      // Ignore storage write errors in restricted contexts
    }
    if (localStorage.getItem('demoshop:guest-link-pending') === '1') {
      navigate('/guest-overview', { replace: true, state });
      return;
    }

    // Warm the cashier-critical payload before the dashboard mounts. This is
    // deliberately fire-and-forget: authentication and navigation must not
    // depend on queue, reservation, or barber-availability latency.
    if (userRole === 'Cashier') {
      const branchId = Number(user?.branch_id);
      if (Number.isInteger(branchId) && branchId > 0) {
        void import('@/features/cashier/services/cashier-queue.service')
          .then(({ prefetchCashierQueue }) => prefetchCashierQueue(branchId))
          .catch((error: unknown) => {
            console.debug('[Login] Cashier queue prefetch unavailable:', error);
          });
      }
    }

    navigateByRole(userRole, state);
  };

  // Restore remembered email, parse OAuth hash tokens, & check for URL OAuth errors
  useEffect(() => {
    const rememberedEmail = localStorage.getItem('rememberedEmail');
    if (rememberedEmail) {
      setEmail(rememberedEmail);
      setRememberMe(true);
    }

    const method = localStorage.getItem('lastLoginMethod');
    if (method) {
      setLastLoginMethod(method);
    }

    // OAuth completion is now signalled by ?success=1 with tokens stored in
    // HttpOnly cookies by the backend. Fetch the profile via cookie auth and
    // populate the AuthContext without ever touching token material in JS.
    const search = window.location.search;
    const searchParams = new URLSearchParams(search);

    if (searchParams.get('success') === '1') {
      setLoading(true);
      authService.fetchCurrentUserProfile()
        .then(({ user: profile, supabaseToken }) => {
          if (profile) {
            setAuth(profile, supabaseToken);
            window.history.replaceState(null, '', window.location.pathname);
          } else {
            setError('Failed to complete sign-in. Please try again.');
          }
        })
        .catch(err => {
          console.error('[Login] Error bootstrapping cookie session:', err);
          setError(err.response?.data?.message || err.response?.data?.error || err.message || 'Failed to complete OAuth sign-in.');
        })
        .finally(() => setLoading(false));
    }

    const errorMsg = searchParams.get('error');
    if (errorMsg) {
      const oauthErrorMessages: Record<string, string> = {
        csrf_failed: 'Google sign-in could not be verified. Please start again.',
        no_code_provided: 'Google did not complete sign-in. Please try again.',
        no_id_token_returned: 'Google sign-in could not be completed. Please try again.',
        no_session_created: 'Your Google session could not be created. Please try again.',
        profile_sync_failed: 'Failed to sync your user profile. Please try again.',
        server_config: 'Google sign-in is temporarily unavailable. Please try again later.',
        authentication_failed: 'Google sign-in failed. Please try again.',
      };
      setError(oauthErrorMessages[errorMsg] || 'Google sign-in failed. Please try again.');
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [setAuth]);

  // Reactively watch for AuthContext session state changes (handles Google OAuth redirects)
  useEffect(() => {
    if (authReady && user) {
      console.log('[Login] User is authenticated! (Google OAuth or stored session)');
      navigateAfterAuth(role || 'Customer', { fromOAuthRedirect: true });
    }
  }, [user, role, authReady]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail) {
        setError('Email is required.');
        setLoading(false);
        return;
      }

      let loginSuccess = false;

      // Try Supabase Auth direct sign in
      try {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });
        if (!signInError && data?.user) {
          loginSuccess = true;
        }
      } catch (sbErr) {
        // Fallback to backend API
      }

      // If Supabase direct sign-in didn't succeed, authenticate via backend API
      if (!loginSuccess) {
        try {
          await api.post('/api/auth/login', {
            email: normalizedEmail,
            password,
            rememberMe,
          });
          loginSuccess = true;
        } catch (apiErr: any) {
          setError(getLoginErrorMessage(apiErr));
          setLoading(false);
          return;
        }
      }

      if (loginSuccess) {
        localStorage.setItem('lastLoginMethod', 'password');
        if (rememberMe) {
          localStorage.setItem('rememberedEmail', normalizedEmail);
        } else {
          localStorage.removeItem('rememberedEmail');
        }

        // Trigger AuthContext update and fetch profile safely via centralized API layer
        try {
          await refetchMe();
        } catch (refetchError: any) {
          console.error('[Login] Error loading authenticated profile:', refetchError);
          setError(getLoginErrorMessage(refetchError));
          setLoading(false);
          return;
        }
      }
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.message || 'An unexpected error occurred during login. Please try again.');
      setLoading(false);
    }
  };


  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      // Clear the app-managed HttpOnly session and any SDK session before
      // switching identities. Google still has its own browser session; the
      // OAuth URL requests an account chooser for that part of the flow.
      await authService.logoutCookieSession();
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
      if (signOutError) throw signOutError;
      clearAuth();

      localStorage.setItem('lastLoginMethod', 'google');
      // Keep OAuth same-origin so state and session cookies belong to the
      // host that receives Google's callback.
      window.location.href = '/api/auth/google/url';
    } catch (err: any) {
      console.error('[Login] Failed to clear the previous session before Google sign-in:', err);
      setError(err?.response?.data?.message || err?.message || 'Could not end the previous session. Please try again.');
      setLoading(false);
    }
  };

  return {
    email,
    setEmail,
    password,
    setPassword,
    error,
    setError,
    success,
    setSuccess,
    loading,
    showPassword,
    setShowPassword,
    rememberMe,
    setRememberMe,
    lastLoginMethod,
    authReady,
    user,
    handleSubmit,
    handleGoogleLogin,
  };
};
