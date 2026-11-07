import { Request, Response } from 'express';
import { BaseController } from './base.controller';
import { AppError } from '../utils/error/AppError';
import { guestService } from '../services/guest.service';
import { issueGuestSession } from '../utils/auth/guest-session.util';
import { clearGuestSessionCookie, setGuestSessionCookie } from '../utils/auth/session-cookies.util';

class GuestController extends BaseController {
  private noStore(res: Response): void {
    res.set('Cache-Control', 'no-store');
  }

  async redeemSession(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      this.noStore(res);
      const token = req.body?.token;
      if (typeof token !== 'string' || token.length > 128) {
        throw new AppError('Guest QR code is invalid or expired.', 404);
      }
      const result = await guestService.redeemQrToken(token);
      const { guestProfileId, branchId, ...publicResult } = result;
      const session = await issueGuestSession(guestProfileId, branchId);
      setGuestSessionCookie(req, res, session);
      res.json(publicResult);
    }, 'RedeemGuestSession');
  }

  async getSession(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      this.noStore(res);
      const session = req.guestSession!;
      res.json(await guestService.getSession(session.branchId, session.guestProfileId));
    }, 'GetGuestSession');
  }

  async linkSession(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      this.noStore(res);
      const session = req.guestSession!;
      const user = req.user;
      const userId = user?.user_id || (user as any)?.id;
      const result = await guestService.linkSessionToCustomer(
        session.branchId,
        session.guestProfileId,
        String(userId || ''),
        user?.role,
        user?.is_verified,
      );
      clearGuestSessionCookie(req, res);
      res.json(result);
    }, 'LinkGuestSession');
  }

  logout(req: Request, res: Response): void {
    this.noStore(res);
    clearGuestSessionCookie(req, res);
    res.status(204).end();
  }
}

const controller = new GuestController();
export const redeemSession = controller.redeemSession.bind(controller);
export const getSession = controller.getSession.bind(controller);
export const linkSession = controller.linkSession.bind(controller);
export const logout = controller.logout.bind(controller);