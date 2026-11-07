import axios from 'axios';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { getAnonClient } from '../config/supabase';

/**
 * Fixed Google OAuth endpoints. Keeping them centralised avoids the
 * risk of typos in the flow and makes them trivial to mock in tests.
 */
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_SCOPES = 'openid email profile';

/** Hard timeout (ms) for the server-to-Google exchange. */
const GOOGLE_TIMEOUT_MS = 8000;

/**
 * Errors emitted by the OAuth service. Callers map these to the
 * public `?error=…` query values without exposing internal details.
 */
export type GoogleOAuthErrorCode =
  | 'server_config'
  | 'exchange_failed'
  | 'no_id_token'
  | 'supabase_signin_failed'
  | 'no_session';

export class GoogleOAuthError extends Error {
  public readonly code: GoogleOAuthErrorCode;

  constructor(code: GoogleOAuthErrorCode, message?: string) {
    super(message || code);
    this.code = code;
  }
}

interface GoogleTokenResponse {
  id_token?: string;
  access_token?: string;
  token_type?: string;
  expires_in?: number;
}

const isGoogleTokenResponse = (value: unknown): value is GoogleTokenResponse => {
  return typeof value === 'object' && value !== null;
};

/**
 * Encapsulates all interactions with Google OAuth 2.0 and the Supabase
 * identity endpoint. Handlers should never call Google or the Supabase
 * anon client directly.
 */
export class GoogleOAuthService {
  /**
   * Environment variables are resolved lazily on each call so runtime
   * secret rotation (and per-test env fixtures) take effect without a
   * process restart.
   */
  private getClientId(): string | undefined {
    return process.env.GOOGLE_CLIENT_ID;
  }

  private getClientSecret(): string | undefined {
    return process.env.GOOGLE_CLIENT_SECRET;
  }

  /**
   * Builds the Google Authorization URL for the code grant with PKCE (S256).
   * Fails fast when the client id has not been provisioned.
   *
   * The caller must supply a `codeChallenge` derived from the verifier via
   * `deriveCodeChallenge()` (pkce.util.ts). The raw verifier must be stored
   * server-side (pkce-store.util.ts) so it can be retrieved during the callback.
   */
  buildAuthorizationUrl(params: {
    redirectUri: string;
    state: string;
    codeChallenge: string;
  }): string {
    const clientId = this.getClientId();
    if (!clientId) {
      throw new GoogleOAuthError('server_config', 'Google Client ID is not configured on the server.');
    }

    const query = new URLSearchParams({
      client_id: clientId,
      redirect_uri: params.redirectUri,
      response_type: 'code',
      scope: GOOGLE_SCOPES,
      prompt: 'select_account',
      state: params.state,
      code_challenge: params.codeChallenge,
      code_challenge_method: 'S256',
    });

    return `${GOOGLE_AUTH_URL}?${query.toString()}`;
  }

  /**
   * Exchanges an authorization code for a Google ID token. Enforces a
   * hard axios timeout and validates the response shape before returning.
   *
   * `codeVerifier` is the raw PKCE verifier that was stored during the
   * authorize step. It must be sent to Google to complete the PKCE handshake.
   */
  async exchangeCodeForIdToken(params: {
    code: string;
    redirectUri: string;
    codeVerifier: string;
  }): Promise<string> {
    const clientId = this.getClientId();
    const clientSecret = this.getClientSecret();

    if (!clientId || !clientSecret) {
      throw new GoogleOAuthError('server_config', 'Google credentials are not configured on the server.');
    }

    let response;
    try {
      response = await axios.post(
        GOOGLE_TOKEN_URL,
        {
          code: params.code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: params.redirectUri,
          grant_type: 'authorization_code',
          code_verifier: params.codeVerifier,
        },
        {
          timeout: GOOGLE_TIMEOUT_MS,
          responseType: 'json',
          validateStatus: (status) => status >= 200 && status < 300,
        },
      );
    } catch {
      // Deliberately avoid propagating axios/network error details:
      // they may echo the client secret in verbose error payloads.
      throw new GoogleOAuthError('exchange_failed');
    }

    if (!isGoogleTokenResponse(response.data)) {
      throw new GoogleOAuthError('exchange_failed');
    }

    const idToken = response.data.id_token;
    if (!idToken || typeof idToken !== 'string') {
      throw new GoogleOAuthError('no_id_token');
    }

    return idToken;
  }

  /**
   * Trades a Google ID token for a Supabase session. Uses the stateless
   * anon client so no cookies are written as a side effect.
   */
  async signInWithIdToken(idToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
    user: SupabaseUser | null;
  }> {
    const supabase = getAnonClient();
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });

    if (error) {
      throw new GoogleOAuthError('supabase_signin_failed');
    }

    const accessToken = data.session?.access_token;
    const refreshToken = data.session?.refresh_token;
    if (!accessToken || !refreshToken) {
      throw new GoogleOAuthError('no_session');
    }

    return {
      accessToken,
      refreshToken,
      user: data.user ?? null,
    };
  }
}

export const googleOAuthService = new GoogleOAuthService();
export default googleOAuthService;
