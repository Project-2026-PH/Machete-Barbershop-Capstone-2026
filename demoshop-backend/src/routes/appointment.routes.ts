import express from 'express';
import { requireSupabaseAuth } from '../middleware/auth.middleware';
import authorizeRoles from '../middleware/role.middleware';
import * as appointmentController from '../controllers/appointment.controller';

const router = express.Router();

// Require authenticated user
router.use(requireSupabaseAuth);

// List appointments with status filter bar, search, date range, pagination
router.get('/', appointmentController.getAppointments);

// Customer lifetime reliability metrics
router.get('/customer/:customerId/stats', appointmentController.getCustomerBookingStats);

// Single appointment detail
router.get('/:id', appointmentController.getAppointmentById);

// Shared Cashier & Admin approval and decline of pending online reservations
router.post(
  '/:id/confirm',
  authorizeRoles('Cashier', 'Admin', 'ShopAdmin', 'System Admin', 'Owner'),
  appointmentController.confirmAppointment
);
router.post(
  '/:id/decline',
  authorizeRoles('Cashier', 'Admin', 'ShopAdmin', 'System Admin', 'Owner'),
  appointmentController.declineAppointment
);

// Cancel/resolve appointment endpoint: shared Cashier & Admin authorization
router.post(
  '/:id/cancel',
  authorizeRoles('Cashier', 'Admin', 'ShopAdmin', 'System Admin', 'Owner'),
  appointmentController.cancelAppointment
);

export default router;
