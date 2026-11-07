import express from 'express';
import { requireSupabaseAuth } from '../middleware/auth.middleware';
import * as adminController from '../controllers/admin.controller';
import * as barberController from '../controllers/barber.controller';
import * as inventoryController from '../controllers/inventory.controller';
import * as staffScheduleController from '../controllers/staff-schedule.controller';
import { searchController } from '../controllers/search.controller';
import { getTransactionReceiptUrl, getTransactions } from '../controllers/transaction.controller';
import { moneyDrawerController } from '../controllers/money-drawer.controller';
import authorizeRoles from '../middleware/role.middleware';
import { createAbuseRateLimit } from '../middleware/abuse-rate-limit.middleware';
import { requireFeature } from '../middleware/feature-gate.middleware';
import { createImageUploadMiddleware } from '../utils/general/image-upload.util';

const router = express.Router();
const avatarUpload = createImageUploadMiddleware('avatar');

// Protect all routes with JWT
router.use(requireSupabaseAuth);

// Write rate limiter for state-changing admin operations (max 30 requests per 15 minutes)
const adminWriteLimiter = createAbuseRateLimit({
  name: 'admin-write',
  windowSeconds: 15 * 60,
  limits: { ip: 30, device: 30 },
  includeDevice: true,
});

// Global Omnibar search endpoint accessible to Shop Admin, Admin, Owner, and System Admin
router.get('/search', authorizeRoles('System Admin', 'Admin', 'ShopAdmin', 'Owner', 'Cashier'), searchController.search);

// Staff directory endpoint accessible to Shop Admin, Admin, Owner, and Cashier
router.get('/staff', authorizeRoles('System Admin', 'Admin', 'ShopAdmin', 'Owner', 'Cashier'), barberController.getAllStaff);

const staffScheduleRoles = authorizeRoles('System Admin', 'Admin', 'ShopAdmin', 'Owner');
router.get('/staff-schedules', staffScheduleRoles, requireFeature('shop_admin_roster'), staffScheduleController.getMonthRoster);
router.put('/staff-schedules', staffScheduleRoles, adminWriteLimiter, requireFeature('shop_admin_roster'), staffScheduleController.saveMonthRoster);

// Live branch statistics endpoint for admin dashboard
router.get('/branch-stats', authorizeRoles('System Admin', 'Admin', 'ShopAdmin', 'Owner', 'Cashier'), adminController.getBranchStats);
router.get('/customer-reviews', authorizeRoles('System Admin', 'Admin', 'ShopAdmin', 'Owner'), adminController.getCustomerReviews);
router.get('/barber-performance-reviews', authorizeRoles('System Admin', 'Admin', 'ShopAdmin', 'Owner'), adminController.getBarberPerformanceReviews);

// Money Drawer Expected Cash Handler & Change Logs
router.get('/money-drawer', authorizeRoles('System Admin', 'Admin', 'ShopAdmin', 'Owner', 'Cashier'), (req, res) => moneyDrawerController.getStatus(req, res));
router.post('/money-drawer/adjust', authorizeRoles('System Admin', 'Admin', 'ShopAdmin', 'Owner'), adminWriteLimiter, (req, res) => moneyDrawerController.adjustAmount(req, res));

// Financial, Sales Breakdown, Barber Commission, and Transaction History Reports
router.get('/reports/sales', authorizeRoles('System Admin', 'Admin', 'ShopAdmin', 'Owner'), requireFeature('shop_admin_reports'), adminController.getSalesReport);
router.get('/reports/commissions', authorizeRoles('System Admin', 'Admin', 'ShopAdmin', 'Owner'), requireFeature('shop_admin_reports'), adminController.getCommissionReport);
router.get('/transactions', authorizeRoles('System Admin', 'Admin', 'ShopAdmin', 'Owner', 'Cashier'), requireFeature('shop_admin_reports'), getTransactions);
router.get('/transactions/:id/receipt-url', authorizeRoles('System Admin', 'Admin', 'ShopAdmin', 'Owner', 'Cashier'), requireFeature('shop_admin_reports'), getTransactionReceiptUrl);
router.get('/reports/transactions', authorizeRoles('System Admin', 'Admin', 'ShopAdmin', 'Owner', 'Cashier'), requireFeature('shop_admin_reports'), getTransactions);

// Shop and branch settings endpoints
router.get('/settings', authorizeRoles('System Admin', 'Admin', 'ShopAdmin', 'Owner'), requireFeature('shop_admin_settings'), adminController.getShopSettings);
router.put('/settings', authorizeRoles('System Admin', 'Admin', 'ShopAdmin', 'Owner'), adminWriteLimiter, requireFeature('shop_admin_settings'), adminController.updateShopSettings);
router.patch('/settings', authorizeRoles('System Admin', 'Admin', 'ShopAdmin', 'Owner'), adminWriteLimiter, requireFeature('shop_admin_settings'), adminController.updateShopSettings);
router.post('/settings/upload-media', authorizeRoles('System Admin', 'Admin', 'ShopAdmin', 'Owner'), adminWriteLimiter, requireFeature('shop_admin_settings'), createImageUploadMiddleware('image'), adminController.uploadShopMedia);
// Invoice-profile administration is restricted; seller details are exposed only by authenticated staff endpoints, never public shop settings.
router.get('/invoice-profile', authorizeRoles('System Admin', 'Admin', 'ShopAdmin', 'Owner'), requireFeature('shop_admin_settings'), adminController.getInvoiceProfile);
router.put('/invoice-profile', authorizeRoles('System Admin', 'Admin', 'ShopAdmin', 'Owner'), adminWriteLimiter, requireFeature('shop_admin_settings'), adminController.updateInvoiceProfile);

// Bulk delete inventory items endpoint
router.delete('/inventory/bulk-delete', authorizeRoles('System Admin', 'Admin', 'ShopAdmin', 'Owner'), adminWriteLimiter, inventoryController.bulkDeleteInventoryItems);
router.post('/inventory/bulk-delete', authorizeRoles('System Admin', 'Admin', 'ShopAdmin', 'Owner'), adminWriteLimiter, inventoryController.bulkDeleteInventoryItems);

// Stock replenishment endpoints
router.patch('/inventory/:id/replenish', authorizeRoles('System Admin', 'Admin', 'ShopAdmin', 'Owner'), adminWriteLimiter, inventoryController.replenishStock);
router.post('/inventory/:id/replenish', authorizeRoles('System Admin', 'Admin', 'ShopAdmin', 'Owner'), adminWriteLimiter, inventoryController.replenishStock);
router.post('/inventory/replenish', authorizeRoles('System Admin', 'Admin', 'ShopAdmin', 'Owner'), adminWriteLimiter, inventoryController.replenishStock);

// Read-only dashboard endpoints accessible to System Admin, Admin, and Owner
router.get('/dashboard-stats', authorizeRoles('System Admin', 'Admin', 'Owner'), adminController.getDashboardStats);
router.get('/users', authorizeRoles('System Admin', 'Admin', 'Owner'), adminController.getUsers);
router.get('/admins', authorizeRoles('System Admin', 'Admin', 'Owner'), adminController.getAdmins);

// State-changing routes strictly restricted to System Admin, Admin, ShopAdmin, and Owner with rate limits applied
router.post('/staff', authorizeRoles('System Admin', 'Admin', 'ShopAdmin', 'Owner'), adminWriteLimiter, adminController.createStaff);
router.put('/staff/:id', authorizeRoles('System Admin', 'Admin', 'ShopAdmin', 'Owner'), adminWriteLimiter, adminController.updateStaff);
router.put('/staff/:id/inventory-access', authorizeRoles('System Admin', 'Admin', 'ShopAdmin', 'Owner'), adminWriteLimiter, adminController.updateCashierInventoryAccess);
router.put('/staff/:id/suspend', authorizeRoles('System Admin', 'Admin', 'ShopAdmin', 'Owner'), adminWriteLimiter, adminController.deleteAdmin);
router.put('/staff/:id/restore', authorizeRoles('System Admin', 'Admin', 'ShopAdmin', 'Owner'), adminWriteLimiter, adminController.restoreAdmin);
router.post('/staff/:id/reset-password', authorizeRoles('System Admin', 'Admin', 'ShopAdmin', 'Owner'), adminWriteLimiter, adminController.resetPassword);

router.post('/admins', authorizeRoles('System Admin', 'Owner'), adminWriteLimiter, adminController.createAdmin);
router.put('/admins/:id', authorizeRoles('System Admin', 'Owner'), adminWriteLimiter, adminController.updateAdmin);
router.put('/admins/:id/suspend', authorizeRoles('System Admin', 'Owner'), adminWriteLimiter, adminController.deleteAdmin);
router.put('/admins/:id/restore', authorizeRoles('System Admin', 'Owner'), adminWriteLimiter, adminController.restoreAdmin);
router.post('/admins/:id/reset-password', authorizeRoles('System Admin', 'Owner'), adminWriteLimiter, adminController.resetPassword);

// General User management routes for System Admin
router.post('/users/avatar', authorizeRoles('System Admin', 'Owner'), adminWriteLimiter, avatarUpload, adminController.uploadUserAvatar);
router.post('/users/:id/avatar', authorizeRoles('System Admin', 'Owner'), adminWriteLimiter, avatarUpload, adminController.uploadUserAvatar);
router.put('/users/:id', authorizeRoles('System Admin', 'Owner'), adminWriteLimiter, adminController.updateAdmin);
router.put('/users/:id/suspend', authorizeRoles('System Admin', 'Owner'), adminWriteLimiter, adminController.deleteAdmin);
router.put('/users/:id/restore', authorizeRoles('System Admin', 'Owner'), adminWriteLimiter, adminController.restoreAdmin);
router.post('/users/:id/reset-password', authorizeRoles('System Admin', 'Owner'), adminWriteLimiter, adminController.resetPassword);

export default router;

