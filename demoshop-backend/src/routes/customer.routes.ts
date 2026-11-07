import express from 'express';
import { requireSupabaseAuth } from '../middleware/auth.middleware';
import * as customerController from '../controllers/customer.controller';
import { avatarUpload, haircutPhotoUpload } from '../controllers/customer.controller';
import { getCustomerBookingStats } from '../controllers/appointment.controller';

const router = express.Router();

// Ensure all routes are protected
router.use(requireSupabaseAuth);

router.get('/profile', customerController.getProfile);
router.put('/profile', customerController.updateProfile);
router.patch('/profile', customerController.updateProfile);
router.get('/upcoming', customerController.getUpcomingAppointment);
router.get('/history', customerController.getHistory);
router.get('/history/:id/details', customerController.getHistoryDetails);
router.get('/reservations/:id/details', customerController.getHistoryDetails);
router.post('/reservations/:id/keep-adjustment', customerController.keepScheduleAdjustment);
router.post('/reservations/:id/reschedule-next-day', customerController.rescheduleScheduleAdjustment);
router.post('/appointments/:id/reschedule', customerController.rescheduleAppointment);
router.get('/summary', customerController.getCompletedPaidHaircutCount);
router.get('/transactions', customerController.getTransactions);
router.post('/profile-picture', avatarUpload, customerController.uploadProfilePicture);
router.post('/history/:id/haircut-photo', haircutPhotoUpload, customerController.uploadHaircutPhoto);
router.delete('/history/:id/haircut-photo', customerController.deleteHaircutPhoto);
router.post('/change-password/request-code', customerController.changePasswordRequestCode);
router.post('/change-password', customerController.changePassword);
router.post('/change-email/request-code', customerController.changeEmailRequestCode);
router.post('/change-email/verify', customerController.changeEmailVerify);
router.put('/preferences', customerController.updatePreferences);
router.patch('/preferences', customerController.updatePreferences);
router.delete('/account', customerController.deleteAccount);
router.get('/:id/booking-stats', getCustomerBookingStats);

export default router;


