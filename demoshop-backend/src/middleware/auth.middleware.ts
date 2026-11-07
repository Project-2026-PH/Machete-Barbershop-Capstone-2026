import { Request, Response, NextFunction } from 'express';
import { decodeProtectedHeader, jwtVerify, importJWK } from 'jose';
import db from '../db/index';
import axios from 'axios';
import { userRepository } from '../repositories/user.repository';
import logger from '../utils/general/logger';
import { config } from '../config/env';
import { UserRole } from '@demoshop/shared-types';

let jwksCache: any = null;
let cacheTimestamp = 0;
let jwksInFlightPromise: Promise<any> | null = null;

/**
 * Resets the in-process JWKS cache.
 * Exported for test isolation only — never call this in production code.
 * @internal
 */
export const _resetJwksCache = (): void => {
  jwksCache = null;
  cacheTimestamp = 0;
  jwksInFlightPromise = null;
};

const fetchRemoteJwks = async (jwksUrl: string): Promise<any> => {
  if (jwksInFlightPromise) return jwksInFlightPromise;

  jwksInFlightPromise = (async () => {
    try {
      logger.info('[Supabase Auth Middleware] Fetching JWKS from: ' + jwksUrl);
      const response = await axios.get(jwksUrl, { timeout: 8000 });
      jwksCache = response.data;
      cacheTimestamp = Date.now();
      return jwksCache;
    } finally {
      jwksInFlightPromise = null;
    }
  })();

  return jwksInFlightPromise;
};

const getJwk = async (jwksUrl: string, kid: string, alg: string) => {
  const now = Date.now();
  // Cache keys for 1 hour to avoid calling the endpoint on every request
  if (!jwksCache || now - cacheTimestamp > 3600000) {
    await fetchRemoteJwks(jwksUrl);
  }

  let jwk = jwksCache?.keys?.find((k: any) => k.kid === kid);
  if (!jwk) {
    // If key not found in cache, force refetch once
    logger.info('[Supabase Auth Middleware] Key not found in cache, refetching JWKS...');
    await fetchRemoteJwks(jwksUrl);
    jwk = jwksCache?.keys?.find((k: any) => k.kid === kid);
  }
  return jwk;
};

/**
 * Custom authentication middleware to verify Supabase JWT.
 * Extracts the access token from the Authorization header or cookies,
 * decodes and verifies it using JWKS (for asymmetric algs) or HS256 secret fallback,
 * fetches the corresponding public profile, and sets req.user.
 */
export const requireSupabaseAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    let token = '';

    // Extract from Authorization Header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
    // Fall back to cookie extractor (if stored in cookies)
    else if (req.cookies && req.cookies['sb-access-token']) {
      token = req.cookies['sb-access-token'];
    }
    else if (req.cookies && req.cookies['token']) {
      token = req.cookies['token'];
    }

    if (!token) {
      res.status(401).json({ error: 'Unauthorized: No token provided.' });
      return;
    }

    // Decode token header to check algorithm
    const header = decodeProtectedHeader(token);
    const alg = header.alg;

    let payload: any;

    if (alg === 'HS256') {
      // 3. Verify standard Supabase JWT or custom session JWT (Symmetric HS256)
      const jwtSecret = config.auth.supabaseJwtSecret || config.auth.jwtSecret;

      if (!jwtSecret) {
        res.status(500).json({ error: 'Server configuration error: Missing JWT secret.' });
        return;
      }

      try {
        const secretBuffer = new TextEncoder().encode(jwtSecret);
        const verifyResult = await jwtVerify(token, secretBuffer);
        payload = verifyResult.payload;
      } catch (firstErr) {
        if (config.auth.jwtSecret && config.auth.jwtSecret !== jwtSecret) {
          const fallbackBuffer = new TextEncoder().encode(config.auth.jwtSecret);
          const fallbackResult = await jwtVerify(token, fallbackBuffer);
          payload = fallbackResult.payload;
        } else {
          throw firstErr;
        }
      }
    } else {
      // Asymmetric validation via JWKS (e.g. ES256, RS256)
      const supabaseUrl = config.supabase.url.trim();
      const jwksUrl = `${supabaseUrl.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`;
      const kid = header.kid;
      if (!kid) {
        res.status(401).json({ error: 'Unauthorized: Invalid token header.' });
        return;
      }
      const jwk = await getJwk(jwksUrl, kid, alg || 'RS256');
      if (!jwk) {
        res.status(401).json({ error: 'Unauthorized: Matching key not found.' });
        return;
      }
      const publicKey = await importJWK(jwk, alg);
      const verifyResult = await jwtVerify(token, publicKey);
      payload = verifyResult.payload;
    }

    const userId = (payload.sub || payload.id) as string;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized: Invalid token payload.' });
      return;
    }

    // 4. Fetch the synced public profile from database. A provider/database
    // outage does not make a cryptographically valid token invalid; report it
    // as transient so clients do not erase their authenticated workstation.
    let dbUser;
    try {
      dbUser = await userRepository.findById(userId);
    } catch (profileError) {
      logger.error('[Supabase Auth Middleware] User profile store unavailable', { error: profileError });
      res.status(503).json({
        error: 'Authentication service is temporarily unavailable.',
        isNetworkError: true,
      });
      return;
    }

    if (!dbUser) {
      // Profile not found in public.users yet (might be due to lag in database trigger).
      // Never use user_metadata.role here: Auth metadata is caller-controlled and
      // must not become an authorization source during trigger lag or failure.
      req.user = {
        user_id: userId,
        email: (payload.email as string) || '',
        role: UserRole.CUSTOMER,
      };
    } else {
      req.user = dbUser;
    }

    next();
  } catch (err: unknown) {
    logger.error('[Supabase Auth Middleware] JWT verification failed', { error: err });
    res.status(401).json({ error: 'Unauthorized: Invalid token.' });
  }
};

export default requireSupabaseAuth;
