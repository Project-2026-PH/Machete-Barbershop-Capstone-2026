import express from 'express';
import { createAbuseRateLimit } from '../middleware/abuse-rate-limit.middleware';
import { requireSupabaseAuth } from '../middleware/auth.middleware';
import authorizeRoles from '../middleware/role.middleware';
import {
  clientCredentialsToken,
  registerMachineClient,
  revokeMachineClient,
} from '../controllers/client-credentials.controller';

/**
 * Dedicated rate limiter for the token endpoint.
 * Tighter than the OAuth browser-flow limiter.
 */
const tokenRateLimit = createAbuseRateLimit({
  name: 'oauth-token',
  windowSeconds: 5 * 60,
  limits: { ip: 20, device: 20 },
  includeDevice: true,
});

const router = express.Router();

/**
 * POST /api/oauth/token
 *
 * Client Credentials grant. No authentication required on the route
 * itself — client identity is verified inside the handler via the
 * Authorization header or body params.
 */
router.post('/token', tokenRateLimit, clientCredentialsToken);

/**
 * POST /api/oauth/clients
 *
 * Register a new machine client. Restricted to authenticated System Admin users.
 */
router.post('/clients', requireSupabaseAuth, authorizeRoles('System Admin'), registerMachineClient);

/**
 * DELETE /api/oauth/clients/:clientId
 *
 * Revoke a machine client. Restricted to authenticated System Admin users.
 */
router.delete('/clients/:clientId', requireSupabaseAuth, authorizeRoles('System Admin'), revokeMachineClient);

export default router;
