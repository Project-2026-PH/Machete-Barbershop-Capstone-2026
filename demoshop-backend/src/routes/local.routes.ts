import express, { Request, Response } from 'express';
import { LocalQueueDB } from '../db/sqlite';
import logger from '../utils/general/logger';
import { validateLocalQueuePayload, validateSyncedIds } from '../utils/request-validation.util';
import { requireLocalQueueAccess } from '../middleware/local-access.middleware';
import { requireSupabaseAuth } from '../middleware/auth.middleware';
import authorizeRoles from '../middleware/role.middleware';

const router = express.Router();
let sqliteDB: LocalQueueDB | undefined;

// Local SQLite queue is restricted to loopback/localhost and authenticated Cashier/Admin roles
router.use(requireLocalQueueAccess);
router.use(requireSupabaseAuth);
router.use(authorizeRoles('Cashier', 'Admin', 'System Admin', 'Owner'));

const getSqliteDB = (): LocalQueueDB => {
  sqliteDB ??= new LocalQueueDB();
  return sqliteDB;
};

// POST /api/local-queue (Store a failed order payload locally)
router.post('/', (req: Request, res: Response) => {
  try {
    const payload = req.body;
    validateLocalQueuePayload(payload);
    const result = getSqliteDB().insertOrder(payload);
    res.status(201).json({ success: true, localId: result.id, message: 'Saved to local SQLite queue' });
  } catch (error: any) {
    logger.error('[Local SQLite] Post error:', error);
    const status = Number.isInteger(error?.status) ? error.status : 500;
    res.status(status).json({ error: status === 500 ? 'Failed to save locally' : error.message });
  }
});

// GET /api/local-queue (Retrieve pending orders for the sync loop & UI rendering)
router.get('/', (req: Request, res: Response) => {
  try {
    const pending = getSqliteDB().getPendingOrders();
    res.status(200).json({ success: true, pending });
  } catch (error: any) {
    logger.error('[Local SQLite] Get error:', error);
    res.status(500).json({ error: 'Failed to retrieve local queue' });
  }
});

// PUT /api/local-queue/mark-synced (Mark orders as synced after successful cloud push)
router.put('/mark-synced', (req: Request, res: Response) => {
  try {
    const { ids } = req.body;
    validateSyncedIds(ids);
    const updatedCount = getSqliteDB().markAsSynced(ids);
    res.status(200).json({ success: true, updatedCount });
  } catch (error: any) {
    logger.error('[Local SQLite] Mark synced error:', error);
    const status = Number.isInteger(error?.status) ? error.status : 500;
    res.status(status).json({ error: status === 500 ? 'Failed to mark as synced' : error.message });
  }
});

// DELETE /api/local-queue/:id (Discard a permanently invalid pending order)
router.delete('/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    res.status(400).json({ error: 'A valid local queue ID is required.' });
    return;
  }

  try {
    const discarded = getSqliteDB().discardPendingOrder(id);
    res.status(discarded ? 200 : 404).json({ success: discarded });
  } catch (error: any) {
    logger.error('[Local SQLite] Discard error:', error);
    res.status(500).json({ error: 'Failed to discard local queue order' });
  }
});

export default router;
