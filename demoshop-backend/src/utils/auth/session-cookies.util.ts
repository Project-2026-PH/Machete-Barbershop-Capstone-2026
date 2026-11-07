import { CookieOptions, Request, Response } from 'express';
import { config } from '../../config/env';

/**
 * Access token cookie lifetime (seconds). Kept short so a compromised
 * access token has minimal utility; the refresh token drives longevity.
 */
const ACCESS_TOKEN_MAX_AGE_SEC = 60 * 60; // 1 hour

/**
 * Refresh token cookie lifetime (seconds). Bounded to force periodic
 * reauthentication independent of provider settings.
 */
const REFRESH_TOKEN_MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30 days

/**
 * Names of the HttpOnly cookies that carry a Supabase session. The
 * access-token cookie name is the one already read by the existing
 * `requireSupabaseAuth` middleware.
 */
export const SESSION_COOKIE = Object.freeze({
  access: 'sb-access-token',
  refresh: 'sb-refresh-token',
});

export const GUEST_SESSION_COOKIE = 'demoshop-guest-session';

/**
 * Detects requests originating from a local HTTP loopback so cookies
 * can be issued without `Secure` on plain-HTTP development, while
 * production always enforces `Secure`. No `NODE_ENV` weakening.
 */
const isLocalPlaintextRequest = (req: Request): boolean => {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const forwarded = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  const protocol = req.secure || forwarded === 'https' ? 'https' : 'http';

  if (protocol === 'https') return false;

  const host = (req.get('host') || '').toLowerCase().split(':')[0];
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
};

/**
 * Builds cookie options that:
 *   • are always `HttpOnly`
 *   • are `Secure` in every environment except plain-HTTP localhost
 *   • use `SameSite=None` when Secure (cross-site prod), else `SameSite=Lax`
 *
 * `config.runtime.forceSecureCookie` promotes a local request back to
 * secure mode for staging/tunneling scenarios.
 */
const buildBaseOptions = (req: Request): CookieOptions => {
  const secure = config.runtime.forceSecureCookie || !isLocalPlaintextRequest(req);
  return {
    httpOnly: true,
    secure,
    sameSite: secure ? 'none' : 'lax',
    path: '/',
  };
};

/**
 * Issues the session cookies. Both cookies are HttpOnly so no token
 * value is exposed to JavaScript, URL fragments, referrers, or logs.
 */
export const setSessionCookies = (
  req: Request,
  res: Response,
  tokens: { accessToken: string; refreshToken: string },
): void => {
  const base = buildBaseOptions(req);

  res.cookie(SESSION_COOKIE.access, tokens.accessToken, {
    ...base,
    maxAge: ACCESS_TOKEN_MAX_AGE_SEC * 1000,
  });

  res.cookie(SESSION_COOKIE.refresh, tokens.refreshToken, {
    ...base,
    maxAge: REFRESH_TOKEN_MAX_AGE_SEC * 1000,
  });
};

/**
 * Issues short-lived transient cookies used during the OAuth handshake
 * (state and any correlation values). Same security posture as session
 * cookies but with a five-minute lifetime.
 */
export const setTransientCookie = (
  req: Request,
  res: Response,
  name: string,
  value: string,
): void => {
  res.cookie(name, value, {
    ...buildBaseOptions(req),
    // OAuth returns through a top-level GET navigation from Google. Lax sends
    // the state cookie on that callback while avoiding third-party-cookie
    // blocking caused by SameSite=None in privacy-focused browsers.
    sameSite: 'lax',
    maxAge: 5 * 60 * 1000,
  });
};

/**
 * Clears the session cookies, matching the options used when writing
 * them so browsers reliably remove both values.
 */
export const clearSessionCookies = (req: Request, res: Response): void => {
  const base = buildBaseOptions(req);
  res.clearCookie(SESSION_COOKIE.access, base);
  res.clearCookie(SESSION_COOKIE.refresh, base);
  res.clearCookie('token', base);
  res.clearCookie(GUEST_SESSION_COOKIE, base);
};

/**
 * Clears a transient OAuth cookie using consistent options.
 */
export const clearTransientCookie = (
  req: Request,
  res: Response,
  name: string,
): void => {
  res.clearCookie(name, {
    ...buildBaseOptions(req),
    sameSite: 'lax',
  });
};

export const setGuestSessionCookie = (req: Request, res: Response, token: string): void => {
  res.cookie(GUEST_SESSION_COOKIE, token, {
    ...buildBaseOptions(req),
    // 24 hours * 60 minutes * 60 secs * 1000 ms in a sec = 86,400,000 milliseconds (exactly 24 hours).
    maxAge: 24 * 60 * 60 * 1000,
  });
};

export const clearGuestSessionCookie = (req: Request, res: Response): void => {
  res.clearCookie(GUEST_SESSION_COOKIE, buildBaseOptions(req));
};
