import { postgresAuthRateLimit } from './auth-rate-limit.middleware';

/**
 * PostgreSQL per-IP/device throttle for OAuth browser endpoints.
 * Authentication state is kept in the same PostgreSQL failure domain as the
 * PKCE transaction, so Redis availability does not gate browser login.
 */
export const oauthRateLimit = postgresAuthRateLimit('oauth-browser', 5 * 60, { ip: 30, device: 30 });
