import { Request, Response } from 'express';
import { notificationService } from '../services/notification.service';
import { AppError } from '../utils/error/AppError';

const getUserId = (req: Request): string => {
  const userId = (req.user as any)?.user_id || (req.user as any)?.id;
  if (!userId) throw new AppError('Authenticated user was not found.', 401);
  return String(userId);
};

export const listNotifications = async (req: Request, res: Response): Promise<void> => {
  // TEMP-EGRESS-DEBUG: remove after notification egress diagnosis is complete.
  console.info('[TEMP-EGRESS-DEBUG] notifications list', {
    timestamp: new Date().toISOString(),
    userId: (req.user as any)?.user_id || (req.user as any)?.id || null,
    referer: req.get('referer') || null,
    userAgent: String(req.get('user-agent') || '').slice(0, 160),
  });
  const parsedLimit = Number.parseInt(String(req.query.limit || '20'), 10);
  const limit = Number.isInteger(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 20) : 20;
  const cursor = typeof req.query.cursor === 'string' && /^\d+$/.test(req.query.cursor)
    ? Number(req.query.cursor)
    : undefined;
  const page = await notificationService.listForUser(getUserId(req), limit, cursor);
  res.json(page);
};

export const countNotifications = async (req: Request, res: Response): Promise<void> => {
  res.json({ count: await notificationService.countUnreadForUser(getUserId(req)) });
};

export const markNotificationRead = async (req: Request, res: Response): Promise<void> => {
  const notificationId = Number.parseInt(String(req.params.id), 10);
  if (!Number.isInteger(notificationId) || notificationId <= 0) {
    throw new AppError('Invalid notification ID.', 400);
  }

  const updated = await notificationService.markRead(getUserId(req), notificationId);
  if (!updated) throw new AppError('Notification not found.', 404);
  res.json({ success: true });
};

export const markAllNotificationsRead = async (req: Request, res: Response): Promise<void> => {
  const updatedCount = await notificationService.markAllRead(getUserId(req));
  res.json({ success: true, updatedCount });
};
