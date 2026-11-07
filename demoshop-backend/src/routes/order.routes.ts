import express, { Request, Response } from 'express';
import { requireSupabaseAuth } from '../middleware/auth.middleware';
import * as cashierController from '../controllers/cashier.controller';
import * as adminController from '../controllers/admin.controller';
import { cashierService } from '../services/cashier.service';
import authorizeRoles from '../middleware/role.middleware';
import logger from '../utils/general/logger';
import { validateOrderSyncPayload } from '../utils/request-validation.util';

const router = express.Router();

// All order routes require Cashier (or higher) access
router.use(requireSupabaseAuth);
router.use(authorizeRoles('Cashier', 'Admin', 'System Admin', 'Owner'));

// Order Lifecycle
router.put('/:id/finish', cashierController.finishOrder);

// Financial Reports (Sales Breakdown & Barber Commission)
router.get('/reports/sales', adminController.getSalesReport);
router.get('/reports/commissions', adminController.getCommissionReport);

// POST /api/orders/sync (Handles bulk insert of offline SQLite queue orders)
router.post('/sync', async (req: Request, res: Response) => {
  try {
    validateOrderSyncPayload(req.body);

    const branchId = (req.user as any)?.branch_id;
    if (!Number.isInteger(branchId) || branchId < 1) {
      res.status(400).json({ error: 'User does not belong to a branch.' });
      return;
    }

    const result = await cashierService.syncOfflineOrders(req.body, branchId);
    res.status(200).json(result);
  } catch (error: any) {
    logger.error(`[Sync] Bulk insert failed: ${error.message}`);
    const status = Number.isInteger(error.status) ? error.status : 500;
    res.status(status).json({ error: status === 500 ? 'Sync failed' : error.message });
  }
});

export default router;
