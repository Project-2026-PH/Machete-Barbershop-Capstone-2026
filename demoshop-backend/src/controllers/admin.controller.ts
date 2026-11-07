import { Request, Response } from 'express';
import { BaseController } from './base.controller';
import { adminService } from '../services/admin.service';
import { AppError } from '../utils/error/AppError';
import { User } from '@demoshop/shared-types';
import { invoiceProfileService } from '../services/invoice-profile.service';

/**
 * Controller for Admin operations.
 * Extends BaseController for standardized error handling.
 */
export class AdminController extends BaseController {
  async getCustomerReviews(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const branchId = req.user?.role === 'System Admin' && req.query.branchId
        ? Number(req.query.branchId)
        : (req.user as any)?.branch_id || undefined;
      const data = await adminService.getCustomerReviews(branchId, Number(req.query.page) || 1, Number(req.query.limit) || 10);
      res.json(data);
    }, 'GetCustomerReviews');
  }

  async getBarberPerformanceReviews(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const branchId = req.user?.role === 'System Admin' && req.query.branchId
        ? Number(req.query.branchId)
        : (req.user as any)?.branch_id || undefined;
      const startDate = req.query.startDate ? String(req.query.startDate) : undefined;
      const endDate = req.query.endDate ? String(req.query.endDate) : undefined;
      const barberId = req.query.barberId ? Number(req.query.barberId) : undefined;
      const data = await adminService.getBarberPerformanceReviews(branchId, startDate, endDate, barberId);
      res.json(data);
    }, 'GetBarberPerformanceReviews');
  }

  async getDashboardStats(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const result = await adminService.getDashboardStats();
      res.json(result);
    }, 'GetDashboardStats');
  }

  async getBranchStats(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const branchId = req.query.branchId ? Number(req.query.branchId) : (req.user as any)?.branch_id || undefined;
      const month = req.query.month ? String(req.query.month) : undefined;
      const result = await adminService.getBranchStats(branchId, month);
      res.json(result);
    }, 'GetBranchStats');
  }

  async getShopSettings(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const branchId = req.query.branchId ? Number(req.query.branchId) : (req.user as any)?.branch_id || undefined;
      const result = await adminService.getShopSettings(branchId);
      res.json(result);
    }, 'GetShopSettings');
  }

  async updateShopSettings(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const result = await adminService.updateShopSettings(req.body, req);
      res.json(result);
    }, 'UpdateShopSettings');
  }

  async getInvoiceProfile(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const branchId = Number((req.user as any)?.branch_id || 1);
      res.json(await invoiceProfileService.get(branchId));
    }, 'GetInvoiceProfile');
  }

  async updateInvoiceProfile(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const actor = req.user as any;
      const branchId = Number(actor?.branch_id || 1);
      const updated = await invoiceProfileService.update(branchId, req.body, actor?.user_id || actor?.id || null);
      res.json(updated);
    }, 'UpdateInvoiceProfile');
  }

  async uploadShopMedia(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const file = req.file;
      const category = (req.body?.category as string) || 'shop';
      const result = await adminService.uploadShopMedia(file as Express.Multer.File, category);
      res.json(result);
    }, 'UploadShopMedia');
  }

  async getUsers(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const filter = (req.query.filter as string) || 'all';
      const roleFilter = (req.query.roleFilter as string) || undefined;
      const sortBy = (req.query.sortBy as string) || undefined;
      const statusFilter = (req.query.statusFilter as string) || undefined;
      const categoryFilter = (req.query.categoryFilter as string) || undefined;
      const search = (req.query.search as string) || undefined;
      const result = await adminService.getUsers(page, limit, filter, roleFilter, sortBy, statusFilter, categoryFilter, search);
      res.json(result);
    }, 'GetUsers');
  }

  async getAdmins(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const result = await adminService.getAdmins();
      res.json(result);
    }, 'GetAdmins');
  }

  async createAdmin(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const { email, password, role, username, profilePicture: bodyProfilePicture } = req.body;
      const profilePicture = req.file ? (req.file as any).path : (bodyProfilePicture || null);

      const result = await adminService.createAdmin({
        email, password, role, username, profilePicture,
      }, req);
      res.status(201).json(result);
    }, 'CreateAdmin');
  }

  async createStaff(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const { name, full_name, email, password, role, username, branch_id, branchId, specialty, profilePicture: bodyProfilePicture } = req.body;
      const staffName = (name || full_name || username || '').trim();
      const profilePicture = req.file ? (req.file as any).path : (bodyProfilePicture || null);
      const staffBranchId = branchId || branch_id || (req.user as any)?.branch_id || 1;

      const result = await adminService.createStaff({
        name: staffName,
        email,
        password,
        role,
        username: username || staffName,
        profilePicture,
        branchId: staffBranchId ? Number(staffBranchId) : undefined,
        specialty,
      }, req);
      res.status(201).json(result);
    }, 'CreateStaff');
  }

  async updateStaff(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const id = req.params.id as string;
      const { name, email, role, username, specialty, branchId, branch_id, profilePicture: bodyProfilePicture } = req.body;
      const profilePicture = req.file ? (req.file as any).path : bodyProfilePicture;

      const result = await adminService.updateStaff(id, {
        name: name || username,
        email,
        role,
        username,
        specialty,
        branchId: branchId || branch_id,
        profilePicture,
      }, req);
      res.json(result);
    }, 'UpdateStaff');
  }

  async updateCashierInventoryAccess(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const id = req.params.id as string;
      const { canAccess } = req.body;
      const actorId = (req.user as any)?.user_id || (req.user as any)?.id || null;
      const result = await adminService.setCashierInventoryAccess(id, Boolean(canAccess), actorId, req);
      res.json({ message: 'Cashier inventory access updated', user: result });
    }, 'UpdateCashierInventoryAccess');
  }

  async updateAdmin(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const id = req.params.id as string;
      const { email, role, username, profilePicture: bodyProfilePicture } = req.body;
      const profilePicture = req.file ? (req.file as any).path : bodyProfilePicture;

      const result = await adminService.updateAdmin(id, {
        email, role, username, profilePicture,
      }, req);
      res.json(result);
    }, 'UpdateAdmin');
  }

  async deleteAdmin(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const id = req.params.id as string;
      const currentUserId = (req.user as any)?.user_id || (req.user as any)?.id;
      const result = await adminService.suspendAdmin(id, currentUserId, req);
      res.json({ message: 'Admin suspended', user: result });
    }, 'SuspendAdmin');
  }

  async restoreAdmin(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const id = req.params.id as string;
      const result = await adminService.restoreAdmin(id, req);
      res.json({ message: 'Admin restored', user: result });
    }, 'RestoreAdmin');
  }

  async resetPassword(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const id = req.params.id as string;
      const { newPassword } = req.body;
      const result = await adminService.resetPassword(id, newPassword, req);
      res.json(result);
    }, 'ResetPassword');
  }

  async getSalesReport(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const result = await adminService.getSalesReport(req.query, req);
      res.json(result);
    }, 'GetSalesReport');
  }

  async getCommissionReport(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const result = await adminService.getCommissionReport(req.query, req);
      res.json(result);
    }, 'GetCommissionReport');
  }

  async uploadUserAvatar(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      if (!req.file) {
        throw new AppError('No image file provided.', 400);
      }
      const targetUserId = req.body?.userId || (req.query?.userId as string | undefined);
      const result = await adminService.uploadAvatar(
        req.file.buffer,
        req.file.mimetype,
        targetUserId
      );
      res.json(result);
    }, 'UploadUserAvatar');
  }
}

const controller = new AdminController();

export const getDashboardStats = controller.getDashboardStats.bind(controller);
export const getBranchStats = controller.getBranchStats.bind(controller);
export const getCustomerReviews = controller.getCustomerReviews.bind(controller);
export const getBarberPerformanceReviews = controller.getBarberPerformanceReviews.bind(controller);
export const getShopSettings = controller.getShopSettings.bind(controller);
export const updateShopSettings = controller.updateShopSettings.bind(controller);
export const getInvoiceProfile = controller.getInvoiceProfile.bind(controller);
export const updateInvoiceProfile = controller.updateInvoiceProfile.bind(controller);
export const getUsers = controller.getUsers.bind(controller);
export const getAdmins = controller.getAdmins.bind(controller);
export const createAdmin = controller.createAdmin.bind(controller);
export const createStaff = controller.createStaff.bind(controller);
export const updateStaff = controller.updateStaff.bind(controller);
export const updateCashierInventoryAccess = controller.updateCashierInventoryAccess.bind(controller);
export const updateAdmin = controller.updateAdmin.bind(controller);
export const deleteAdmin = controller.deleteAdmin.bind(controller);
export const restoreAdmin = controller.restoreAdmin.bind(controller);
export const resetPassword = controller.resetPassword.bind(controller);
export const getSalesReport = controller.getSalesReport.bind(controller);
export const getCommissionReport = controller.getCommissionReport.bind(controller);
export const uploadUserAvatar = controller.uploadUserAvatar.bind(controller);
export const uploadShopMedia = controller.uploadShopMedia.bind(controller);

export default controller;
