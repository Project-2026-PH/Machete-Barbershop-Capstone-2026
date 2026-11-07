import express, { Request, Response, NextFunction } from 'express';
import * as inventoryManagerController from '../controllers/inventory-manager.controller';

const router = express.Router();

const requireCronSecret = (req: Request, res: Response, next: NextFunction): void => {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    res.status(503).json({ error: 'Cron endpoint is not configured.' });
    return;
  }
  if (req.get('authorization') !== `Bearer ${cronSecret}`) {
    res.status(401).json({ error: 'Unauthorized.' });
    return;
  }
  next();
};

router.get('/inventory-stock-count-reminders', requireCronSecret, inventoryManagerController.runStockCountDueReminders);

export default router;
