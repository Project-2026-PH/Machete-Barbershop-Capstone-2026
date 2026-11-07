import { Request, Response } from 'express';
import { BaseController } from './base.controller';
import { customerService } from '../services/customer.service';
import { authService } from '../services/auth.service';
import { AppError } from '../utils/error/AppError';
import { createImageUploadMiddleware } from '../utils/general/image-upload.util';

// Store uploaded file in memory — service streams it directly to Supabase Storage
export const avatarUpload = createImageUploadMiddleware('avatar');
export const haircutPhotoUpload = createImageUploadMiddleware('haircut_photo');

/**
 * Controller for Customer operations.
 * Extends BaseController for standardized error handling.
 */
export class CustomerController extends BaseController {
  async getProfile(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const userId = (req.user as any)?.user_id || (req.user as any)?.id;
      const userEmail = (req.user as any)?.email;
      const result = await customerService.getProfile(userId, userEmail);
      res.json(result);
    }, 'GetProfile');
  }

  async getUpcomingAppointment(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const userId = (req.user as any)?.user_id || (req.user as any)?.id;
      const result = await customerService.getUpcomingAppointment(userId);
      res.json(result);
    }, 'GetUpcomingAppointment');
  }

  async getHistory(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const userId = (req.user as any)?.user_id || (req.user as any)?.id;
      const result = await customerService.getHistory(userId);
      res.json(result);
    }, 'GetHistory');
  }

  async getHistoryDetails(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const userId = (req.user as any)?.user_id || (req.user as any)?.id;
      const historyId = Number(req.params.id);
      if (!historyId || isNaN(historyId)) {
        throw new AppError('Invalid reservation history ID.', 400);
      }
      const result = await customerService.getHistoryDetails(userId, historyId);
      res.json(result);
    }, 'GetHistoryDetails');
  }

  async keepScheduleAdjustment(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const userId = (req.user as any)?.user_id || (req.user as any)?.id;
      const queueId = Number(req.params.id);
      if (!queueId || Number.isNaN(queueId)) {
        throw new AppError('Invalid reservation ID.', 400);
      }
      const result = await customerService.keepScheduleAdjustment(userId, queueId);
      res.json({ success: true, reservation: result });
    }, 'KeepScheduleAdjustment');
  }

  async rescheduleScheduleAdjustment(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const userId = (req.user as any)?.user_id || (req.user as any)?.id;
      const queueId = Number(req.params.id);
      const preferredDate = String(req.body?.preferredDate || '').trim();
      const preferredTime = String(req.body?.preferredTime || '').trim();
      if (!queueId || Number.isNaN(queueId)) {
        throw new AppError('Invalid reservation ID.', 400);
      }
      const result = await customerService.rescheduleScheduleAdjustment(
        userId,
        queueId,
        preferredDate,
        preferredTime,
      );
      res.json({ success: true, reservation: result });
    }, 'RescheduleScheduleAdjustment');
  }

  async rescheduleAppointment(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const userId = (req.user as any)?.user_id || (req.user as any)?.id;
      const queueId = Number(req.params.id);
      const scheduledDate = String(req.body?.new_scheduled_date || req.body?.scheduledDate || '').trim();
      const scheduledTime = String(req.body?.new_scheduled_time || req.body?.scheduledTime || '').trim();
      const barberId = req.body?.barber_id == null ? undefined : Number(req.body.barber_id);
      if (!queueId || Number.isNaN(queueId)) throw new AppError('Invalid appointment ID.', 400);
      if (barberId !== undefined && (!Number.isInteger(barberId) || barberId <= 0)) throw new AppError('barber_id must be a positive integer.', 400);
      const result = await customerService.rescheduleAppointment(userId, queueId, scheduledDate, scheduledTime, barberId);
      res.json({ success: true, appointment: result, reservation: result });
    }, 'RescheduleAppointment');
  }

  async getCompletedPaidHaircutCount(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const userId = (req.user as any)?.user_id || (req.user as any)?.id;
      const totalHaircuts = await customerService.getCompletedPaidHaircutCount(userId);
      res.json({ totalHaircuts });
    }, 'GetCompletedPaidHaircutCount');
  }

  async getTransactions(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const userId = (req.user as any)?.user_id || (req.user as any)?.id;
      const result = await customerService.getTransactions(userId);
      res.json(result);
    }, 'GetTransactions');
  }

  async uploadProfilePicture(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const userId = (req.user as any)?.user_id || (req.user as any)?.id;

      if (!req.file) {
        throw new AppError('No image file provided.', 400);
      }

      const result = await customerService.uploadProfilePicture(
        userId,
        req.file.buffer,
        req.file.mimetype,
      );
      res.json(result);
    }, 'UploadProfilePicture');
  }

  async uploadHaircutPhoto(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const userId = (req.user as any)?.user_id || (req.user as any)?.id;
      const queueId = Number(req.params.id);

      if (!queueId || isNaN(queueId)) {
        throw new AppError('Invalid reservation history ID.', 400);
      }

      if (!req.file) {
        throw new AppError('No haircut photo file provided.', 400);
      }

      const result = await customerService.uploadHaircutPhoto(
        userId,
        queueId,
        req.file.buffer,
        req.file.mimetype,
      );
      res.json(result);
    }, 'UploadHaircutPhoto');
  }

  async deleteHaircutPhoto(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const userId = (req.user as any)?.user_id || (req.user as any)?.id;
      const queueId = Number(req.params.id);

      if (!queueId || isNaN(queueId)) {
        throw new AppError('Invalid reservation history ID.', 400);
      }

      const result = await customerService.deleteHaircutPhoto(userId, queueId);
      res.json(result);
    }, 'DeleteHaircutPhoto');
  }

  async changePasswordRequestCode(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const userId = (req.user as any)?.user_id || (req.user as any)?.id;
      const email = (req.user as any)?.email;
      if (!userId || !email) {
        throw new AppError('Unauthorized: User profile not found.', 401);
      }
      const result = await authService.requestPasswordChangeCode(userId, email, req.body?.currentPassword, req);
      res.json(result);
    }, 'ChangePasswordRequestCode');
  }


  async changePassword(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const userId = (req.user as any)?.user_id || (req.user as any)?.id;
      const email = (req.user as any)?.email;
      if (!userId || !email) {
        throw new AppError('Unauthorized: User profile not found.', 401);
      }
      const result = await authService.changePassword(userId, email, req.body, req);
      res.json(result);
    }, 'ChangePassword');
  }

  async changeEmailRequestCode(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const userId = (req.user as any)?.user_id || (req.user as any)?.id;
      if (!userId) {
        throw new AppError('Unauthorized: User profile not found.', 401);
      }
      const { newEmail } = req.body || {};
      const result = await customerService.requestEmailChangeCode(userId, newEmail, req);
      res.json(result);
    }, 'ChangeEmailRequestCode');
  }

  async changeEmailVerify(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const userId = (req.user as any)?.user_id || (req.user as any)?.id;
      if (!userId) {
        throw new AppError('Unauthorized: User profile not found.', 401);
      }
      const { newEmail, confirmationCode, code } = req.body || {};
      const result = await customerService.verifyEmailChange(userId, newEmail, confirmationCode || code, req);
      res.json(result);
    }, 'ChangeEmailVerify');
  }

  async updatePreferences(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const userId = (req.user as any)?.user_id || (req.user as any)?.id;
      if (!userId) {
        throw new AppError('Unauthorized: User profile not found.', 401);
      }
      const { email_notifications_enabled } = req.body || {};
      const result = await customerService.updatePreferences(userId, { email_notifications_enabled });
      res.json(result);
    }, 'UpdatePreferences');
  }

  async updateProfile(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const userId = (req.user as any)?.user_id || (req.user as any)?.id;
      if (!userId) {
        throw new AppError('Unauthorized: User profile not found.', 401);
      }
      const result = await customerService.updateProfile(userId, req.body);
      res.json(result);
    }, 'UpdateProfile');
  }

  async deleteAccount(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const userId = (req.user as any)?.user_id || (req.user as any)?.id;
      if (!userId) {
        throw new AppError('Unauthorized: User profile not found.', 401);
      }
      const result = await customerService.deleteAccount(userId, req);
      res.json(result);
    }, 'DeleteAccount');
  }
}

const controller = new CustomerController();

export const getProfile = controller.getProfile.bind(controller);
export const getUpcomingAppointment = controller.getUpcomingAppointment.bind(controller);
export const getHistory = controller.getHistory.bind(controller);
export const getHistoryDetails = controller.getHistoryDetails.bind(controller);
export const keepScheduleAdjustment = controller.keepScheduleAdjustment.bind(controller);
export const rescheduleScheduleAdjustment = controller.rescheduleScheduleAdjustment.bind(controller);
export const rescheduleAppointment = controller.rescheduleAppointment.bind(controller);
export const getCompletedPaidHaircutCount = controller.getCompletedPaidHaircutCount.bind(controller);
export const getTransactions = controller.getTransactions.bind(controller);
export const uploadProfilePicture = controller.uploadProfilePicture.bind(controller);
export const uploadHaircutPhoto = controller.uploadHaircutPhoto.bind(controller);
export const deleteHaircutPhoto = controller.deleteHaircutPhoto.bind(controller);
export const changePasswordRequestCode = controller.changePasswordRequestCode.bind(controller);
export const changePassword = controller.changePassword.bind(controller);
export const changeEmailRequestCode = controller.changeEmailRequestCode.bind(controller);
export const changeEmailVerify = controller.changeEmailVerify.bind(controller);
export const updatePreferences = controller.updatePreferences.bind(controller);
export const updateProfile = controller.updateProfile.bind(controller);
export const deleteAccount = controller.deleteAccount.bind(controller);

export default controller;


