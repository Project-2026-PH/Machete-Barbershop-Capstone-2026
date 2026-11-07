import express from 'express';
import { requireSupabaseAuth } from '../middleware/auth.middleware';
import { listNotifications, countNotifications, markNotificationRead, markAllNotificationsRead } from '../controllers/notifications.controller';

const router = express.Router();

router.use(requireSupabaseAuth);
router.get('/count', countNotifications);
router.get('/', listNotifications);
router.patch('/read-all', markAllNotificationsRead);
router.patch('/:id/read', markNotificationRead);

export default router;
