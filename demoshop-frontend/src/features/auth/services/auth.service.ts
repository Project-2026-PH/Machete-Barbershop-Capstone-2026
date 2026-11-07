import { api } from '@/config/api';
import { User } from '@demoshop/shared-types';

type CurrentUserProfileResponse = {
  user: Partial<User> | null;
  supabaseToken: string | null;
};

let currentProfileRequest: Promise<CurrentUserProfileResponse> | null = null;

export const authService = {
  /**
   * Fetches the current authenticated user profile from the backend API.
   * This retrieves user information and any associated service tokens from the backend service layer.
   */
  fetchCurrentUserProfile: (): Promise<CurrentUserProfileResponse> => {
    if (currentProfileRequest) return currentProfileRequest;
    currentProfileRequest = (async () => {
      try {
      const response = await api.get('/api/auth/me');
      const user = response.data?.user;
      if (user && user.id) {
        user.user_id = user.id;
      }
      return {
        user: user || null,
        supabaseToken: response.data?.supabaseToken || null,
      };
      } catch (error: any) {
      // 401 Unauthorized is expected when visiting as an unauthenticated guest.
      // Do not log errors or treat unauthenticated state as a server outage.
      if (error?.response?.status === 401 || error?.status === 401) {
        return { user: null, supabaseToken: null };
      }

      // Preserve the original Axios error so callers can surface its status,
      // error code, and backend message without treating the session as absent.
      console.warn('[AuthService] Profile endpoint unavailable:', error?.message || error);
      throw error;
      } finally {
        currentProfileRequest = null;
      }
    })();
    return currentProfileRequest;
  },

  /** Clears the backend-managed HttpOnly session cookies. */
  logoutCookieSession: async (): Promise<void> => {
    try {
      await api.post('/api/auth/session/logout');
    } catch (error) {
      console.warn('[AuthService] Failed to clear backend session cookies:', error);
      throw error;
    }
  },
};
