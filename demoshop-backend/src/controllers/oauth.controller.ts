import crypto from 'crypto';
import { Request, Response } from 'express';
import { config } from '../config/env';
import logger from '../utils/general/logger';
import { getProtocolAndHost } from '../utils/general/auth-helpers.util';
import {
  clearSessionCookies,
  clearTransientCookie,
  setSessionCookies,
  setTransientCookie,
} from '../utils/auth/session-cookies.util';
import { generateCodeVerifier, deriveCodeChallenge } from '../utils/auth/pkce.util';
import { hashOAuthState } from '../utils/auth/auth-state.util';
import { storePkceTransaction, consumePkceTransaction } from '../utils/auth/pkce-store.util';
import {
  GoogleOAuthError,
  GoogleOAuthErrorCode,
  googleOAuthService,
} from '../services/google-oauth.service';
import {
  userMigrationService,
  GoogleSessionUser,
} from '../services/user-migration.service';
import { getAnonClient } from '../config/supabase';

const OAUTH_STATE_COOKIE = 'oauth_state';
const LOGIN_PATH = '/login';

/**
 * Correlates authorize and callback logs without exposing the OAuth state value.
 */
const stateFingerprint = (state: string): string | undefined =>
  state ? hashOAuthState(state).toString('hex').slice(0, 12) : undefined;

const requestContext = (req: Request): { requestHost: string; requestProtocol: string } => {
  const { protocol, host } = getProtocolAndHost(req);
  return { requestHost: host, requestProtocol: protocol };
};

const redirectHost = (redirectUri: string): string => {
  try {
    return new URL(redirectUri).host;
  } catch {
    return 'invalid';
  }
};

/**
 * Maps internal error codes to short public identifiers surfaced via
 * `?error=…`. Kept intentionally opaque so the frontend can display a
 * friendly message without leaking server internals.
 */
const publicErrorFor = (code: GoogleOAuthErrorCode | 'csrf_failed' | 'no_code_provided' | 'profile_sync_failed' | 'authentication_failed'): string => {
  const map: Record<string, string> = {
    server_config: 'server_config',
    exchange_failed: 'authentication_failed',
    no_id_token: 'no_id_token_returned',
    supabase_signin_failed: 'authentication_failed',
    no_session: 'no_session_created',
    csrf_failed: 'csrf_failed',
    no_code_provided: 'no_code_provided',
    profile_sync_failed: 'profile_sync_failed',
    authentication_failed: 'authentication_failed',
  };
  return map[code] || 'authentication_failed';
};

const buildFrontendUrl = (path: string, query?: Record<string, string>): string => {
  const base = `${config.frontendOrigin}${path}`;
  if (!query) return base;
  const params = new URLSearchParams(query);
  return `${base}?${params.toString()}`;
};

const redirectWithError = (
  res: Response,
  code: GoogleOAuthErrorCode | 'csrf_failed' | 'no_code_provided' | 'profile_sync_failed' | 'authentication_failed',
): void => {
  res.redirect(buildFrontendUrl(LOGIN_PATH, { error: publicErrorFor(code) }));
};

/**
 * Resolves the Google redirect URI. Prefers the explicit
 * `GOOGLE_REDIRECT_URI` env; otherwise derives from the request
 * respecting the reverse-proxy `x-forwarded-proto` header.
 *
 * In hosted deployments `GOOGLE_REDIRECT_URI` must point at the frontend
 * origin's `/api/auth/google/callback` (e.g.
 * `https://portfolio.example.invalid/api/auth/google/callback`),
 * not the backend's Vercel hostname. The frontend's same-origin API proxy
 * (see demoshop-frontend/vercel.ts) forwards that path to this backend, so
 * Google redirects the browser to the frontend, the browser never visits
 * the backend hostname directly, and the session cookies this handler
 * writes land on the frontend origin instead of being cross-site.
 */
const resolveRedirectUri = (req: Request): string => {
  const explicit = process.env.GOOGLE_REDIRECT_URI;
  if (explicit) return explicit;
  const { protocol, host } = getProtocolAndHost(req);
  return `${protocol}://${host}/api/auth/google/callback`;
};

/**
 * Best-effort revocation of an unusable Supabase session so orphaned
 * refresh tokens do not remain provisioned when we abort the flow.
 */
const revokeIssuedSession = async (accessToken: string, correlationId: string): Promise<void> => {
  try {
    const supabase = getAnonClient();
    await supabase.auth.admin.signOut(accessToken);
  } catch {
    logger.warn('[OAuth] Failed to revoke abandoned session', { correlationId });
  }
};

/**
 * Handler for `GET /api/auth/google/url`.
 *
 * Generates a PKCE verifier, derives the S256 challenge, stores both
 * the verifier and redirect URI in PostgreSQL keyed by the CSRF state, and
 * redirects to Google with the challenge included. The frontend origin
 * is fixed by server configuration, never trusted from the request.
 */
export const googleAuthorize = async (req: Request, res: Response): Promise<void> => {
  const correlationId = crypto.randomUUID();
  const state = crypto.randomBytes(16).toString('hex');
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = deriveCodeChallenge(codeVerifier);
  const redirectUri = resolveRedirectUri(req);
  const stateId = stateFingerprint(state);
  const startedAt = Date.now();

  logger.info('[OAuth] Authorize start', {
    correlationId,
    stateId,
    ...requestContext(req),
    redirectHost: redirectHost(redirectUri),
  });

  // Store the PKCE verifier server-side so the callback can retrieve it.
  // This replaces browser-visible verifier storage and makes the transaction single-use.
  const stored = await storePkceTransaction(state, { codeVerifier, redirectUri });
  if (!stored) {
    logger.warn('[OAuth] PKCE transaction could not be persisted', {
      correlationId,
      stateId,
      failureReason: 'pkce_transaction_store_failed',
      persistenceDurationMs: Date.now() - startedAt,
      redirectHost: redirectHost(redirectUri),
    });
    redirectWithError(res, 'csrf_failed');
    return;
  }

  logger.info('[OAuth] PKCE transaction persisted', {
    correlationId,
    stateId,
    persistenceDurationMs: Date.now() - startedAt,
  });

  // Set the state in an HttpOnly cookie for CSRF validation at callback.
  setTransientCookie(req, res, OAUTH_STATE_COOKIE, state);

  try {
    const url = googleOAuthService.buildAuthorizationUrl({
      redirectUri,
      state,
      codeChallenge,
    });
    res.redirect(url);
  } catch (err) {
    if (err instanceof GoogleOAuthError && err.code === 'server_config') {
      logger.error('[OAuth] Google client id not configured', { correlationId });
      res.status(500).json({ error: 'Google Client ID is not configured on the server.' });
      return;
    }
    logger.error('[OAuth] Authorize failed', { correlationId, code: (err as any)?.code });
    redirectWithError(res, 'authentication_failed');
  }
};

/**
 * Handler for `GET /api/auth/google/callback`.
 *
 * Validates CSRF state, retrieves and consumes the PKCE verifier from PostgreSQL,
 * exchanges the code for a Google ID token (with verifier), signs the user in
 * with Supabase, synchronises the public profile, writes HttpOnly session
 * cookies, and redirects to the frontend `/login?success=1` — never with
 * tokens in the URL.
 */
export const googleCallback = async (req: Request, res: Response): Promise<void> => {
  const correlationId = crypto.randomUUID();

  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const cookieState = req.cookies?.[OAUTH_STATE_COOKIE];
  const stateId = stateFingerprint(state);
  const browserStateId = stateFingerprint(typeof cookieState === 'string' ? cookieState : '');

  logger.info('[OAuth] Callback received', {
    correlationId,
    stateId,
    browserStateId,
    stateParamPresent: Boolean(state),
    browserStatePresent: Boolean(cookieState),
    authorizationCodePresent: Boolean(code),
    ...requestContext(req),
  });

  clearTransientCookie(req, res, OAUTH_STATE_COOKIE);

  // CSRF state validation (validates cookie if present, and verifies state presence)
  if (!state || !cookieState || state !== cookieState) {
    const failureReason = !state
      ? 'missing_state_parameter'
      : !cookieState
        ? 'missing_state_cookie'
        : 'state_cookie_mismatch';
    logger.warn('[OAuth] CSRF state validation failed', {
      correlationId,
      stateId,
      browserStateId,
      failureReason,
      stateParamPresent: Boolean(state),
      browserStatePresent: Boolean(cookieState),
      ...requestContext(req),
    });
    redirectWithError(res, 'csrf_failed');
    return;
  }

  if (!code) {
    logger.warn('[OAuth] Missing authorization code', { correlationId });
    redirectWithError(res, 'no_code_provided');
    return;
  }

  // Consume the PKCE transaction (single-use, verifier is deleted after read)
  const pkce = await consumePkceTransaction(state);
  if (!pkce) {
    logger.warn('[OAuth] PKCE transaction unavailable', {
      correlationId,
      stateId,
      failureReason: 'pkce_transaction_missing_expired_or_unavailable',
      ...requestContext(req),
    });
    redirectWithError(res, 'csrf_failed');
    return;
  }

  let session: Awaited<ReturnType<typeof googleOAuthService.signInWithIdToken>>;
  try {
    const idToken = await googleOAuthService.exchangeCodeForIdToken({
      code,
      redirectUri: pkce.redirectUri,
      codeVerifier: pkce.codeVerifier,
    });
    session = await googleOAuthService.signInWithIdToken(idToken);
  } catch (err) {
    const errorCode = err instanceof GoogleOAuthError ? err.code : 'authentication_failed';
    logger.warn('[OAuth] Provider exchange failed', { correlationId, code: errorCode });
    redirectWithError(res, errorCode as any);
    return;
  }

  if (session.user) {
    const sessionUser: GoogleSessionUser = {
      id: session.user.id,
      email: session.user.email,
      user_metadata: session.user.user_metadata,
    };

    try {
      const status = await userMigrationService.syncGoogleUser(sessionUser, correlationId);
      logger.info('[OAuth] Profile sync complete', { correlationId, status });
    } catch (err: any) {
      logger.error('[OAuth] Profile sync failed', { correlationId, code: err?.code });
      await revokeIssuedSession(session.accessToken, correlationId);
      redirectWithError(res, 'profile_sync_failed');
      return;
    }
  }

  setSessionCookies(req, res, {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
  });

  logger.info('[OAuth] Session established', { correlationId });
  res.redirect(buildFrontendUrl(LOGIN_PATH, { success: '1' }));
};

/**
 * Handler for `POST /api/auth/session/refresh`.
 *
 * Exchanges the HttpOnly `sb-refresh-token` cookie for a fresh session
 * pair without exposing token material to JavaScript.
 */
export const sessionRefresh = async (req: Request, res: Response): Promise<void> => {
  const correlationId = crypto.randomUUID();
  const refreshToken = req.cookies?.['sb-refresh-token'];

  if (!refreshToken) {
    res.status(401).json({ error: 'Refresh cookie missing.' });
    return;
  }

  try {
    const supabase = getAnonClient();
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });

    if (error || !data.session?.access_token || !data.session.refresh_token) {
      const status = Number((error as any)?.status);
      const definitiveRejection = status === 400 || status === 401;
      logger.warn('[OAuth] Refresh rejected', { correlationId, status: Number.isFinite(status) ? status : undefined });
      if (definitiveRejection) {
        clearSessionCookies(req, res);
        res.status(401).json({ error: 'Session could not be refreshed.' });
      } else {
        res.status(503).json({ error: 'Session refresh is temporarily unavailable.' });
      }
      return;
    }

    setSessionCookies(req, res, {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    });
    res.status(204).end();
  } catch (err) {
    logger.error('[OAuth] Refresh failed unexpectedly', { correlationId });
    res.status(503).json({ error: 'Session refresh is temporarily unavailable.' });
  }
};

/**
 * Handler for `POST /api/auth/session/logout`.
 *
 * Clears both HttpOnly session cookies. Idempotent — always returns 204.
 */
export const sessionLogout = (req: Request, res: Response): void => {
  clearSessionCookies(req, res);
  res.status(204).end();
};
