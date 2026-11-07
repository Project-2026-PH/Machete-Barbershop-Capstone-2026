import { SignJWT, jwtVerify } from 'jose';
import crypto from 'crypto';
import { config } from '../../config/env';
import { SERVICE_TOKEN_TTL_SECONDS, ApiScope } from '../../services/client-credentials.service';

/**
 * Audience and issuer claims that every machine token must carry.
 * Validated by `verifyServiceToken` before any scope check.
 */
export const SERVICE_TOKEN_ISSUER = 'demoshop-api';
export const SERVICE_TOKEN_AUDIENCE = 'demoshop-api';

export interface ServiceTokenPayload {
  /** Principal type — always "service" to distinguish from user tokens. */
  principal_type: 'service';
  /** The registered client identifier. */
  client_id: string;
  /** Scopes granted for this token. */ 
  scope: string;
  /** Unique token ID for future revocation support. */
  jti: string;
  /** Standard claims populated by jwtVerify. */
  iss: string;
  aud: string | string[];
  sub: string;
  iat: number;
  exp: number;
}

/**
 * Issues a signed HS256 machine access token.
 *
 * We reuse the existing `JWT_SECRET` so no additional key management is
 * required for this initial implementation. A future revision should use
 * a dedicated asymmetric key pair with a JWKS endpoint.
 */
export const issueServiceToken = async (
  clientId: string,
  grantedScopes: ApiScope[],
): Promise<string> => {
  const secret = new TextEncoder().encode(config.auth.jwtSecret);
  const jti = crypto.randomUUID();

  return new SignJWT({
    principal_type: 'service',
    client_id: clientId,
    scope: grantedScopes.join(' '),
    jti,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(SERVICE_TOKEN_ISSUER)
    .setAudience(SERVICE_TOKEN_AUDIENCE)
    .setSubject(clientId)
    .setIssuedAt()
    .setExpirationTime(`${SERVICE_TOKEN_TTL_SECONDS}s`)
    .sign(secret);
};

/**
 * Verifies a machine access token, returning the decoded payload.
 * Throws if the token is invalid, expired, or lacks the service principal marker.
 */
export const verifyServiceToken = async (
  token: string,
): Promise<ServiceTokenPayload> => {
  const secret = new TextEncoder().encode(config.auth.jwtSecret);

  const { payload } = await jwtVerify(token, secret, {
    issuer: SERVICE_TOKEN_ISSUER,
    audience: SERVICE_TOKEN_AUDIENCE,
  });

  if ((payload as any).principal_type !== 'service') {
    throw new Error('Not a service token');
  }

  return payload as unknown as ServiceTokenPayload;
};
