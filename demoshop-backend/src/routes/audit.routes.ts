import express from 'express';
import { requireSupabaseAuth } from '../middleware/auth.middleware';
import * as auditController from '../controllers/audit.controller';
import authorizeRoles from '../middleware/role.middleware';

const router = express.Router();

// Protect all routes with JWT + Admin/ShopAdmin/Owner Authorization
router.use(requireSupabaseAuth);
router.use(authorizeRoles('System Admin', 'Admin', 'ShopAdmin', 'Owner'));

router.get('/', auditController.getLogs);
router.get('/stats', auditController.getStats);

export default router;
