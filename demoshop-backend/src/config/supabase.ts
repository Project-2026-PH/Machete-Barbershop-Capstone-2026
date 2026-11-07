import { createServerClient } from '@supabase/ssr';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Request, Response } from 'express';
import logger from '../utils/general/logger';
import { config } from './env';

/**
 * Creates a per-request Supabase SSR client that reads/writes cookies
 * using standard Supabase cookie naming (`sb-<project-ref>-auth-token`).
 *
 * Use this for:
 * - auth.signInWithPassword() (if migrating to Supabase Auth)
 * - auth.exchangeCodeForSession() in the OAuth exchange route
 * - auth.signOut()
 * - auth.refreshSession()
 *
 * The `set` and `remove` handlers write HttpOnly cookies, so the JWT
 * never touches JavaScript on the frontend.
 */
export const getServerClient = (req: Request, res: Response) => {
  return createServerClient(
    config.supabase.url,
    config.supabase.anonKey,
    {
      cookies: {
        get: (name: string) => req.cookies?.[name],

        set: (name: string, value: string, options: any) => {
          if (res.headersSent) {
            logger.warn(`[Supabase SSR] Cannot set cookie "${name}" - headers already sent.`);
            return;
          }
          res.cookie(name, value, {
            ...options,
            httpOnly: true,
            secure: config.runtime.isProduction || config.runtime.forceSecureCookie,
            sameSite: config.runtime.isProduction ? 'none' : 'lax',
          });
        },

        // Required by @supabase/ssr for signOut() to clear cookies correctly
        remove: (name: string, options: any) => {
          if (res.headersSent) {
            logger.warn(`[Supabase SSR] Cannot clear cookie "${name}" - headers already sent.`);
            return;
          }
          res.clearCookie(name, {
            ...options,
            httpOnly: true,
            secure: config.runtime.isProduction || config.runtime.forceSecureCookie,
            sameSite: config.runtime.isProduction ? 'none' : 'lax',
          });
        },
      },
    }
  );
};

/**
 * Returns a stateless anonymous Supabase client suitable for one-shot
 * operations such as exchanging an OAuth ID token. It never persists
 * a session or writes cookies to the response.
 */
export const getAnonClient = (): SupabaseClient => {
  return createClient(config.supabase.url, config.supabase.anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
};

// Singleton admin client — instantiated once and reused
let _adminClient: SupabaseClient | null = null;

/**
 * Returns a Supabase admin client using the SERVICE_ROLE_KEY.
 *
 * Permitted uses ONLY for narrowly scoped server-side operations:
 * - Provisioning, updating, and deleting Auth users from protected admin workflows
 * - Looking up users by ID or email for server-side synchronization
 * - Revoking sessions for password, email, or suspension changes
 * - Bypassing RLS for internal/system operations
 *
 * Raw passwords may be sent only to Supabase Auth over this server-side client;
 * never log or persist them in plaintext.
 */
export const getAdminClient = (): SupabaseClient => {
  if (!_adminClient) {
    _adminClient = createClient(
      config.supabase.url,
      config.supabase.serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,  // Server-side — no need to auto-refresh
          persistSession: false,    // Never persist the service role session
        },
      }
    );
  }

  return _adminClient;
};