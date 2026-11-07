import crypto from 'crypto';
import { config } from '../../config/env';

const getOtpHmacSecret = (): string =>
  process.env.AUTH_OTP_HMAC_SECRET?.trim() || config.auth.jwtSecret;

/** Hashes short OTPs with a server-only key before they reach PostgreSQL. */
export const hashAuthOtp = (code: string | number): Buffer =>
  crypto.createHmac('sha256', getOtpHmacSecret()).update(String(code)).digest();

export const matchesAuthOtp = (code: string | number, expectedHash: Buffer): boolean => {
  const actualHash = hashAuthOtp(code);
  return actualHash.length === expectedHash.length && crypto.timingSafeEqual(actualHash, expectedHash);
};

/** Produces an opaque bearer token whose database representation is one-way. */
export const createResetToken = (): string => crypto.randomBytes(32).toString('base64url');

export const hashResetToken = (token: string): Buffer =>
  crypto.createHash('sha256').update(token).digest();

export const hashOAuthState = (state: string): Buffer =>
  crypto.createHash('sha256').update(state).digest();
