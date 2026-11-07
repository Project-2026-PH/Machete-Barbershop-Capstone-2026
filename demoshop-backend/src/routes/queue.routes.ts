import express from 'express';
import { requireSupabaseAuth } from '../middleware/auth.middleware';
import authorizeRoles from '../middleware/role.middleware';
import { createAbuseRateLimit } from '../middleware/abuse-rate-limit.middleware';
import * as queueController from '../controllers/queue.controller';
import { emergencyCancellationController } from '../controllers/emergency-cancellation.controller';
import { requireFeature } from '../middleware/feature-gate.middleware';


const publicQueryRateLimit = createAbuseRateLimit({
  name: 'queue-public-query',
  windowSeconds: 60,
  limits: { ip: 60, device: 30 },
  includeDevice: true,
  failOpen: true,
});

const router = express.Router();

// Publicly accessible routes (Booking Preview)
router.get('/availability/batch', publicQueryRateLimit, queueController.getBatchAvailability);
router.get('/availability', publicQueryRateLimit, queueController.getAvailability);
router.get('/public/branches', publicQueryRateLimit, queueController.getPublicBranches);
router.get('/public/barbers', publicQueryRateLimit, queueController.getPublicBarbers);
router.get('/shifts/today', publicQueryRateLimit, queueController.getPublicBarbers);
router.get('/public/barber-schedules', publicQueryRateLimit, queueController.getPublicBarberSchedules);
router.get('/public/barber-schedule', publicQueryRateLimit, queueController.getPublicBarberSchedule);

// All other queue routes require JWT authentication
router.use(requireSupabaseAuth);

router.get('/check-reference', authorizeRoles('Customer', 'Cashier', 'Admin', 'ShopAdmin', 'System Admin', 'Owner'), queueController.checkReference);
router.post('/join', requireFeature('customer_booking'), authorizeRoles('Customer'), queueController.joinQueue);
router.post('/group-join', requireFeature('customer_booking'), authorizeRoles('Customer'), queueController.joinGroupQueue);
router.get('/my-position', authorizeRoles('Customer'), queueController.getMyPosition);
router.get(
  '/barber/:barberId',
  authorizeRoles('Customer', 'Cashier', 'Admin', 'ShopAdmin', 'System Admin', 'Owner', 'Barber'),
  queueController.getBarberQueue,
);
router.post(
  '/cancel/:queueId',
  authorizeRoles('Customer', 'Cashier', 'Admin', 'ShopAdmin', 'System Admin', 'Owner'),
  queueController.cancelQueue,
);
router.patch(
  '/cancel/:queueId',
  authorizeRoles('Customer', 'Cashier', 'Admin', 'ShopAdmin', 'System Admin', 'Owner'),
  queueController.cancelQueue,
);
router.post(
  '/advance/:barberId',
  authorizeRoles('Cashier', 'Admin', 'ShopAdmin', 'System Admin', 'Owner', 'Barber'),
  queueController.advanceQueue,
);
router.patch(
  '/advance/:barberId',
  authorizeRoles('Cashier', 'Admin', 'ShopAdmin', 'System Admin', 'Owner', 'Barber'),
  queueController.advanceQueue,
);
router.post('/:queueId/complete', authorizeRoles('Cashier', 'Admin', 'ShopAdmin', 'System Admin', 'Owner', 'Barber'), queueController.complete);
router.post('/:queueId/offline-service-start', authorizeRoles('Cashier', 'Admin', 'ShopAdmin', 'System Admin', 'Owner'), queueController.startOfflineService);
router.post('/:queueId/offline-service-complete', authorizeRoles('Cashier', 'Admin', 'ShopAdmin', 'System Admin', 'Owner'), queueController.completeOfflineService);
router.post('/:queueId/offline-edit', authorizeRoles('Cashier', 'Admin', 'ShopAdmin', 'System Admin', 'Owner'), queueController.editOfflineWalkIn);
router.post('/:queueId/offline-cancel', authorizeRoles('Cashier', 'Admin', 'ShopAdmin', 'System Admin', 'Owner'), queueController.cancelOfflineWalkIn);
router.post('/:queueId/order-impact-preview', authorizeRoles('Cashier', 'Admin', 'ShopAdmin', 'System Admin', 'Owner'), queueController.previewOrderImpact);
router.patch('/:queueId/order', authorizeRoles('Cashier', 'Admin', 'ShopAdmin', 'System Admin', 'Owner'), queueController.updateOrder);
router.patch('/:queueId/identity', authorizeRoles('Cashier', 'Admin', 'ShopAdmin', 'System Admin', 'Owner'), queueController.updateQueueIdentity);
router.patch('/:queueId/reservation-barber', authorizeRoles('Cashier', 'Admin', 'ShopAdmin', 'System Admin', 'Owner'), queueController.updateReservationBarber);
router.get('/:queueId/payment-quote', authorizeRoles('Cashier', 'Admin', 'ShopAdmin', 'System Admin', 'Owner'), queueController.getPaymentQuote);
router.get('/:queueId/receipt', authorizeRoles('Cashier', 'Admin', 'ShopAdmin', 'System Admin', 'Owner'), queueController.getReceipt);
router.post('/:queueId/receipt/print-history', authorizeRoles('Cashier', 'Admin', 'ShopAdmin', 'System Admin', 'Owner'), queueController.recordOfflineReceiptPrintHistory);
router.post('/:queueId/receipt/email/retry', authorizeRoles('Cashier', 'Admin', 'ShopAdmin', 'System Admin', 'Owner'), queueController.retryReceiptEmail);
router.get('/:queueId/payment-receipt-url', authorizeRoles('Cashier', 'Admin', 'ShopAdmin', 'System Admin', 'Owner'), queueController.getPaymentReceiptUrl);
router.post('/:queueId/pay', authorizeRoles('Cashier', 'Admin', 'ShopAdmin', 'System Admin', 'Owner'), queueController.receiptUpload, queueController.markPaid);
router.post('/:queueId/check-in', authorizeRoles('Cashier', 'Admin', 'ShopAdmin', 'System Admin', 'Owner', 'Barber'), queueController.checkIn);
router.post('/group/:groupBookingId/check-in', authorizeRoles('Cashier', 'Admin', 'ShopAdmin', 'System Admin', 'Owner', 'Barber'), queueController.checkInGroup);
router.post('/:queueId/no-show', authorizeRoles('Cashier', 'Admin', 'ShopAdmin', 'System Admin', 'Owner', 'Barber'), queueController.noShow);
// Emergency Cancellation & One-Click Re-booking
router.post(
  '/emergency-cancel',
  authorizeRoles('Cashier', 'Admin', 'ShopAdmin', 'System Admin', 'Owner'),
  (req, res) => emergencyCancellationController.triggerEmergencyCancel(req, res)
);
router.get(
  '/emergency-notice',
  authorizeRoles('Customer', 'Cashier', 'Admin', 'ShopAdmin', 'System Admin', 'Owner'),
  (req, res) => emergencyCancellationController.getPendingNotice(req, res)
);
router.post(
  '/emergency-rebook',
  authorizeRoles('Customer', 'Cashier', 'Admin', 'ShopAdmin', 'System Admin', 'Owner'),
  (req, res) => emergencyCancellationController.rebook(req, res)
);
router.post(
  '/emergency-decline',
  authorizeRoles('Customer', 'Cashier', 'Admin', 'ShopAdmin', 'System Admin', 'Owner'),
  (req, res) => emergencyCancellationController.declineFallback(req, res)
);
router.get(
  '/:queueId/reassignment-options',
  authorizeRoles('Cashier'),
  (req, res) => emergencyCancellationController.getReassignmentOptions(req, res)
);
router.post(
  '/:queueId/reassign',
  authorizeRoles('Cashier'),
  (req, res) => emergencyCancellationController.reassignForCashier(req, res)
);

router.get(
  '/:queueId',
  authorizeRoles('Customer', 'Cashier', 'Admin', 'ShopAdmin', 'System Admin', 'Owner', 'Barber'),
  queueController.getQueueEntry,
);

export default router;


