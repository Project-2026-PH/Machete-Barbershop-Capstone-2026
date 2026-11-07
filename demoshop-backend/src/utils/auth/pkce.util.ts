import crypto from 'crypto';

/**
 * Generates a cryptographically random PKCE code verifier.
 *
 * The verifier is 96 random bytes encoded as base64url, giving 128
 * characters of entropy — well within the RFC 7636 requirement of
 * 43–128 URL-safe characters.
 */
export const generateCodeVerifier = (): string => {
  return crypto.randomBytes(96).toString('base64url');
};

/**
 * Derives the S256 code challenge from a verifier.
 *
 * challenge = BASE64URL(SHA256(ASCII(verifier)))
 */
export const deriveCodeChallenge = (verifier: string): string => {
  return crypto.createHash('sha256').update(verifier, 'ascii').digest('base64url');
};
