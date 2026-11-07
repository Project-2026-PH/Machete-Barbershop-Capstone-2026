import express from 'express';
import { requireSupabaseAuth } from '../middleware/auth.middleware';
import authorizeRoles from '../middleware/role.middleware';
import { createAbuseRateLimit } from '../middleware/abuse-rate-limit.middleware';
import * as barberController from '../controllers/barber.controller';
import * as staffScheduleController from '../controllers/staff-schedule.controller';
import { requireFeature } from '../middleware/feature-gate.middleware';

const router = express.Router();

const publicPortfolioRateLimit = createAbuseRateLimit({
  name: 'barber-portfolio-public',
  windowSeconds: 60,
  limits: { ip: 60, device: 30 },
  failOpen: true,
});

// Public portfolio route for booking and public preview (read-only)
router.get('/:barberId/portfolio/public', publicPortfolioRateLimit, barberController.getPublicPortfolio);

// All subsequent barber routes require authentication
router.use(requireSupabaseAuth);

// Barber-managed portfolio routes (authorized barbers and staff managers only)
const barberPortfolioRoles = authorizeRoles('Barber', 'Admin', 'ShopAdmin', 'System Admin', 'Owner');
router.get('/portfolio', barberPortfolioRoles, barberController.getPortfolio);
router.patch('/portfolio/bio', barberPortfolioRoles, barberController.updateBio);
router.put('/portfolio/specialties', barberPortfolioRoles, barberController.updateSpecialties);
router.post('/portfolio/work', barberPortfolioRoles, barberController.barberPortfolioUpload, barberController.addPortfolioWork);
router.patch('/portfolio/work/:id', barberPortfolioRoles, barberController.updatePortfolioWork);
router.delete('/portfolio/work/:id', barberPortfolioRoles, barberController.deletePortfolioWork);

// Staff management & Administrative status routes (Cashier, Admin, ShopAdmin, System Admin, Owner)
const staffManagementRoles = authorizeRoles('Cashier', 'Admin', 'ShopAdmin', 'System Admin', 'Owner');

router.get('/staff', staffManagementRoles, barberController.getAllStaff);
router.patch('/:barberId/admin-status', staffManagementRoles, barberController.updateAdministrativeStatus);
router.put('/:barberId/admin-status', staffManagementRoles, barberController.updateAdministrativeStatus);

router.get('/customer-history', barberController.getCustomerHistory);
router.get('/performance', barberController.getPerformance);
router.get('/earnings', barberController.getEarnings);
router.post('/upload-photo', barberController.barberPhotoUpload, barberController.uploadHaircutPhoto);
router.get('/my-schedule', staffScheduleController.getMySchedule);
router.get('/availability', barberController.getAvailability);
router.patch('/availability', requireFeature('barber_workspace'), barberController.updateAvailability);
router.post('/shift-request', requireFeature('barber_workspace'), barberController.submitShiftRequest);
router.get('/shift-request/active', barberController.getActiveShiftRequest);
router.post('/shift-request/:id/acknowledge', barberController.acknowledgeShiftRequest);
router.get('/shift-requests', staffManagementRoles, barberController.getAllShiftRequests);
router.patch('/shift-requests/:id/review', staffManagementRoles, barberController.reviewShiftRequest);
router.delete('/shift-requests', staffManagementRoles, barberController.clearAllShiftRequests);

export default router;
