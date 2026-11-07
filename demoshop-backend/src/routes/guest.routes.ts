import express from 'express';
import { requireSupabaseAuth } from '../middleware/auth.middleware';
import { requireGuestSession } from '../middleware/guest-session.middleware';
import { createAbuseRateLimit } from '../middleware/abuse-rate-limit.middleware';
import * as guestController from '../controllers/guest.controller';

const router = express.Router();

const guestSessionRateLimit = createAbuseRateLimit({
  name: 'guest-session',
  windowSeconds: 5 * 60,
  limits: { ip: 20, device: 20 },
});

router.post('/session/redeem', guestSessionRateLimit, guestController.redeemSession);
router.get('/session', requireGuestSession, guestController.getSession);
router.post('/session/logout', guestController.logout);
router.post(
  '/session/link',
  guestSessionRateLimit,
  requireGuestSession,
  requireSupabaseAuth,
  guestController.linkSession,
);

export default router;