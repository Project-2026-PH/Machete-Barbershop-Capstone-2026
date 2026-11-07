import { NextFunction, Request, Response } from 'express';
import { GUEST_SESSION_COOKIE, clearGuestSessionCookie } from '../utils/auth/session-cookies.util';
import { verifyGuestSession } from '../utils/auth/guest-session.util';

const invalidGuestSession = (req: Request, res: Response): void => {
  clearGuestSessionCookie(req, res);
  res.status(401).json({ error: 'Guest session is invalid or expired.' });
};

export const requireGuestSession = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const token = req.cookies?.[GUEST_SESSION_COOKIE];
  if (typeof token !== 'string' || token.length > 4096) {
    invalidGuestSession(req, res);
    return;
  }

  try {
    const payload = await verifyGuestSession(token);
    const guestProfileId = Number(payload.guest_profile_id);
    if (!Number.isSafeInteger(guestProfileId) || guestProfileId < 1) {
      invalidGuestSession(req, res);
      return;
    }
    req.guestSession = { guestProfileId, branchId: payload.branch_id };
    next();
  } catch {
    invalidGuestSession(req, res);
  }
};