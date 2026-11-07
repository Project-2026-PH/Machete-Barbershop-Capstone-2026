import { oauthTransactionRepository } from '../../repositories/oauth-transaction.repository';
import logger from '../general/logger';
import { hashOAuthState } from './auth-state.util';

/**
 * PKCE transaction TTL: 5 minutes, matching the oauth_state cookie.
 * The transaction is single-use — it is atomically read and deleted in
 * `consumePkceTransaction`.
 */
const PKCE_TTL_SECONDS = 5 * 60;

export interface PkceRecord {
  codeVerifier: string;
  redirectUri: string;
}

/**
 * Stores a PKCE verifier+redirectUri pair keyed by a hash of the OAuth state.
 * The state is used as the correlation key because it is already a
 * cryptographically random, per-request value shared between the
 * authorize and callback handlers.
 *
 * Returns false if PostgreSQL cannot persist the transaction so callers can
 * fail the OAuth flow before sending the browser to Google.
 */
export const storePkceTransaction = async (
  state: string,
  record: PkceRecord,
): Promise<boolean> => {
  const stateId = hashOAuthState(state).toString('hex').slice(0, 12);
  try {
    await oauthTransactionRepository.create({
      stateHash: hashOAuthState(state),
      codeVerifier: record.codeVerifier,
      redirectUri: record.redirectUri,
      expiresAt: new Date(Date.now() + PKCE_TTL_SECONDS * 1000),
    });
    return true;
  } catch (err: unknown) {
    logger.error('[PKCE] Failed to store transaction', { stateId, error: err });
    return false;
  }
};

/**
 * Atomically reads and deletes the PKCE record for the given state.
 * Returns null when the record is missing, expired, or PostgreSQL is unavailable —
 * callers must treat null as an authentication failure.
 */
export const consumePkceTransaction = async (
  state: string,
): Promise<PkceRecord | null> => {
  const stateId = hashOAuthState(state).toString('hex').slice(0, 12);
  try {
    const transaction = await oauthTransactionRepository.consume(hashOAuthState(state));
    if (!transaction) return null;
    return {
      codeVerifier: transaction.codeVerifier,
      redirectUri: transaction.redirectUri || '',
    };
  } catch (err: unknown) {
    logger.error('[PKCE] Failed to consume transaction', { stateId, error: err });
    return null;
  }
};
