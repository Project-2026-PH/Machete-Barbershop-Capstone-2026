import crypto from 'crypto';
import { Request, Response } from 'express';
import logger from '../utils/general/logger';
import {
  clientCredentialsService,
  VALID_SCOPES,
  SERVICE_TOKEN_TTL_SECONDS,
  ApiScope,
  ClientCredentialsInputError,
} from '../services/client-credentials.service';
import { issueServiceToken } from '../utils/auth/service-token.util';

/**
 * Parses `client_id` and `client_secret` from either:
 *   • `Authorization: Basic base64(id:secret)` header
 *   • `client_id` / `client_secret` fields in the request body
 *
 * Header takes precedence when both are present.
 */
const extractCredentials = (req: Request): { clientId: string; clientSecret: string } | null => {
  const authHeader = req.headers.authorization || '';

  if (authHeader.startsWith('Basic ')) {
    const encoded = authHeader.slice(6);
    let decoded: string;
    try {
      decoded = Buffer.from(encoded, 'base64').toString('utf8');
    } catch {
      return null;
    }
    const colon = decoded.indexOf(':');
    if (colon < 1) return null;
    return {
      clientId: decoded.slice(0, colon),
      clientSecret: decoded.slice(colon + 1),
    };
  }

  const { client_id, client_secret } = req.body ?? {};
  if (typeof client_id === 'string' && typeof client_secret === 'string') {
    return { clientId: client_id, clientSecret: client_secret };
  }

  return null;
};

/**
 * `POST /api/oauth/token`
 *
 * OAuth 2.0 Client Credentials grant endpoint.
 *
 * Accepts:
 *   - `grant_type=client_credentials` (required)
 *   - `scope` (space-separated, optional — defaults to client's allowed scopes)
 *   - Client credentials via HTTP Basic or body params
 *
 * Returns on success (200):
 *   ```json
 *   {
 *     "access_token": "eyJ...",
 *     "token_type": "Bearer",
 *     "expires_in": 900,
 *     "scope": "bookings:read"
 *   }
 *   ```
 *
 * No refresh token is issued. The client must re-authenticate when the
 * access token expires.
 */
export const clientCredentialsToken = async (req: Request, res: Response): Promise<void> => {
  const correlationId = crypto.randomUUID();

  // 1. Validate grant type
  const grantType = req.body?.grant_type;
  if (grantType !== 'client_credentials') {
    res.status(400).json({
      error: 'unsupported_grant_type',
      error_description: 'Only grant_type=client_credentials is supported.',
    });
    return;
  }

  // 2. Extract credentials (never log them)
  const credentials = extractCredentials(req);
  if (!credentials) {
    res.status(401).json({
      error: 'invalid_client',
      error_description: 'Client credentials are required.',
    });
    return;
  }

  // 3. Authenticate the client (constant-time comparison happens inside)
  const client = await clientCredentialsService.authenticateClient(
    credentials.clientId,
    credentials.clientSecret,
  );

  if (!client) {
    logger.warn('[ClientCredentials] Authentication failed', { correlationId });
    res.status(401).json({
      error: 'invalid_client',
      error_description: 'Client authentication failed.',
    });
    return;
  }

  // 4. Resolve requested scopes
  const requestedScopeStr: string = req.body?.scope ?? '';
  const requestedScopes: string[] = requestedScopeStr
    ? requestedScopeStr.split(/\s+/).filter(Boolean)
    : [];

  // Default to the client's full allowed-scope set when none are requested
  const targetScopes: string[] = requestedScopes.length > 0 ? requestedScopes : client.allowedScopes;

  // Validate: all requested scopes must be known valid scopes
  const unknownScopes = targetScopes.filter(
    (s) => !(VALID_SCOPES as readonly string[]).includes(s),
  );
  if (unknownScopes.length > 0) {
    res.status(400).json({
      error: 'invalid_scope',
      error_description: `Unknown scope(s): ${unknownScopes.join(', ')}`,
    });
    return;
  }

  // Validate: client may not elevate beyond its registered scopes
  const unauthorizedScopes = targetScopes.filter((s) => !client.allowedScopes.includes(s));
  if (unauthorizedScopes.length > 0) {
    logger.warn('[ClientCredentials] Scope escalation attempt', {
      correlationId,
      clientId: client.clientId,
    });
    res.status(403).json({
      error: 'insufficient_scope',
      error_description: `Client is not authorized for scope(s): ${unauthorizedScopes.join(', ')}`,
    });
    return;
  }

  // 5. Issue the access token
  const accessToken = await issueServiceToken(client.clientId, targetScopes as ApiScope[]);

  logger.info('[ClientCredentials] Token issued', {
    correlationId,
    clientId: client.clientId,
  });

  res.status(200).json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: SERVICE_TOKEN_TTL_SECONDS,
    scope: targetScopes.join(' '),
  });
};

/**
 * `POST /api/oauth/clients`   (System Admin only)
 *
 * Registers a new machine client. The plaintext secret is returned
 * exactly once in the response and is not stored or recoverable.
 */
export const registerMachineClient = async (req: Request, res: Response): Promise<void> => {
  const correlationId = crypto.randomUUID();
  const { name, allowedScopes, expiresAt } = req.body ?? {};
  const actorId = req.user?.user_id || null;

  try {
    const { client, plaintextSecret } = await clientCredentialsService.registerClient({
      name,
      allowedScopes,
      expiresAt,
      actorId,
      req,
    });

    // Never log or include the secret anywhere except this one-time response.
    logger.info('[ClientCredentials] Client created via admin API', {
      correlationId,
      clientId: client.clientId,
    });

    res.status(201).json({
      message: 'Client registered. Store the secret securely — it will not be shown again.',
      clientId: client.clientId,
      clientSecret: plaintextSecret,
      allowedScopes: client.allowedScopes,
      expiresAt: client.expiresAt,
    });
  } catch (err) {
    if (err instanceof ClientCredentialsInputError) {
      res.status(400).json({ error: err.message });
      return;
    }

    logger.error('[ClientCredentials] Client registration failed', { correlationId });
    res.status(500).json({ error: 'Unable to register client.' });
  }
};

/**
 * `DELETE /api/oauth/clients/:clientId`   (System Admin only)
 *
 * Revokes a machine client permanently.
 */
export const revokeMachineClient = async (req: Request, res: Response): Promise<void> => {
  const rawId = req.params.clientId;
  const clientId = Array.isArray(rawId) ? rawId[0] : rawId;
  const actorId = req.user?.user_id || null;

  try {
    const success = await clientCredentialsService.revokeClient(clientId, { actorId, req });
    if (!success) {
      res.status(404).json({ error: 'Client not found.' });
      return;
    }
    res.status(204).end();
  } catch {
    logger.error('[ClientCredentials] Client revocation failed', { clientId });
    res.status(500).json({ error: 'Unable to revoke client.' });
  }
};
