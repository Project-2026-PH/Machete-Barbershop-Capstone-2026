import express from 'express';
import { requireSupabaseAuth } from '../middleware/auth.middleware';
import * as cashierController from '../controllers/cashier.controller';
import authorizeRoles from '../middleware/role.middleware';
import { createAbuseRateLimit } from '../middleware/abuse-rate-limit.middleware';
import { requireFeature } from '../middleware/feature-gate.middleware';
import { receiptEvidenceUpload } from '../controllers/payment-attempt.controller';

const router = express.Router();

const guestQrRateLimit = createAbuseRateLimit({
  name: 'cashier-guest-qr',
  windowSeconds: 60,
  limits: { ip: 30, session: 60 },
  includeSession: true,
  failOpen: true,
});

// All cashier routes require Cashier (or higher) access
router.use(requireSupabaseAuth);
router.use(authorizeRoles('Cashier', 'Admin', 'ShopAdmin', 'System Admin', 'Owner'));

// Dashboard Widgets
router.get('/dashboard/snapshot', cashierController.getDashboardSnapshot);
router.get('/dashboard/daily-summary', cashierController.getDailySummary);
router.get('/dashboard/weekly-performance', cashierController.getWeeklyPerformance);
router.get('/dashboard/barber-breakdown', cashierController.getBarberBreakdown);
router.get('/dashboard/transactions', cashierController.getRecentTransactions);
router.get('/sales/today', cashierController.getTodaySales);
router.put('/sales/:id/reservation-fee-gcash-reference', cashierController.addReservationFeeGcashReference);
router.get('/sales/:id/reservation-fee-receipt-url', cashierController.getReservationFeeGcashReceiptUrl);
router.post('/sales/:id/reservation-fee-receipt', receiptEvidenceUpload, cashierController.addReservationFeeGcashReceipt);
router.get('/customers-served', cashierController.getCustomersServed);
router.get('/guest/:reference', cashierController.getGuestByReference);
router.post('/guest/qr/redeem', guestQrRateLimit, cashierController.redeemGuestQr);
router.post('/guest/:id/qr/regenerate', guestQrRateLimit, cashierController.regenerateGuestQr);

// Walk-in Management
router.post('/walk-in', requireFeature('cashier_pos'), cashierController.createWalkIn);
router.post('/retail-sale', requireFeature('cashier_pos'), cashierController.createRetailSale);

// USB/QZ Tray printer station queue
router.post('/print-jobs/claim', cashierController.claimPrintJob);
router.post('/print-jobs/:id/complete', cashierController.completePrintJob);
router.post('/print-jobs/:id/fail', cashierController.failPrintJob);
router.post('/print-jobs/:id/retry', cashierController.retryPrintJob);

// Reservation Management
router.get('/reservations', cashierController.getPendingReservations);
router.get('/reservations/pending-count', cashierController.getPendingReservationsCount);
router.post('/reservations/manual', requireFeature('cashier_pos'), cashierController.createManualReservation);
router.post(
  '/reservations/:id/accept',
  authorizeRoles('Admin', 'ShopAdmin', 'System Admin', 'Owner'),
  cashierController.acceptReservation,
);
router.post(
  '/reservations/:id/decline',
  authorizeRoles('Cashier', 'Admin', 'ShopAdmin', 'System Admin', 'Owner'),
  cashierController.declineReservation,
);
router.post('/reservations/:id/fee', cashierController.recordReservationFee);

// Barber Management
router.put('/barbers/:id/status', cashierController.updateBarberStatus);

// Live Queue Snapshot
router.get('/queue/snapshot', cashierController.getQueueSnapshot);
// Cashier-only read access supports offline printing with the seller details used by cloud receipts.
router.get('/offline-receipt-profile', cashierController.getOfflineReceiptProfile);

export default router;
