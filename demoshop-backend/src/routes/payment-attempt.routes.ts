import express from 'express';
import { requireSupabaseAuth } from '../middleware/auth.middleware';
import authorizeRoles from '../middleware/role.middleware';
import * as controller from '../controllers/payment-attempt.controller';
import { receiptEvidenceUpload } from '../controllers/payment-attempt.controller';

const router = express.Router();
router.use(requireSupabaseAuth);

router.get('/', authorizeRoles('Cashier', 'Admin', 'ShopAdmin', 'System Admin', 'Owner'), controller.list);
router.get('/:attemptId/receipt-url', authorizeRoles('Cashier', 'Admin', 'ShopAdmin', 'System Admin', 'Owner'), controller.receiptUrl);
router.post('/:attemptId/evidence', authorizeRoles('Cashier', 'Admin', 'ShopAdmin', 'System Admin', 'Owner'), receiptEvidenceUpload, controller.uploadEvidence);
router.post('/:attemptId/reconcile', authorizeRoles('Admin', 'ShopAdmin', 'System Admin', 'Owner'), controller.reconcile);

export default router;
