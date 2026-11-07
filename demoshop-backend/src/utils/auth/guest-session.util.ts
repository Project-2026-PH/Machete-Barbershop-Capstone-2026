import { jwtVerify, SignJWT } from 'jose';
import crypto from 'crypto';
import { config } from '../../config/env';

export const GUEST_SESSION_ISSUER = 'demoshop-api';
export const GUEST_SESSION_AUDIENCE = 'demoshop-guest-session';

export interface GuestSessionPayload {
  typ: 'guest';
  guest_profile_id: string;
  branch_id: number;
  iss: string;
  aud: string;
  sub: string;
  jti: string;
  iat: number;
  exp: number;
}

export const issueGuestSession = async (guestProfileId: number, branchId: number): Promise<string> => {
  const secret = new TextEncoder().encode(config.auth.jwtSecret);
  return new SignJWT({
    typ: 'guest',
    guest_profile_id: String(guestProfileId),
    branch_id: branchId,
    jti: crypto.randomUUID(),
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(GUEST_SESSION_ISSUER)
    .setAudience(GUEST_SESSION_AUDIENCE)
    .setSubject(`guest:${guestProfileId}`)
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(secret);
};

export const verifyGuestSession = async (token: string): Promise<GuestSessionPayload> => {
  const secret = new TextEncoder().encode(config.auth.jwtSecret);
  const { payload } = await jwtVerify(token, secret, {
    issuer: GUEST_SESSION_ISSUER,
    audience: GUEST_SESSION_AUDIENCE,
  });
  if (payload.typ !== 'guest' || typeof payload.guest_profile_id !== 'string' || typeof payload.branch_id !== 'number') {
    throw new Error('Invalid guest session');
  }
  return payload as unknown as GuestSessionPayload;
};