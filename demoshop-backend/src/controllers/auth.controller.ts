import { Request, Response } from 'express';
import { BaseController } from './base.controller';
import { authService } from '../services/auth.service';
import logger from "../utils/general/logger";
import { User } from '@demoshop/shared-types';
import { authSessionFacade } from '../facades/auth-session.facade';
import { AppError } from '../utils/error/AppError';
/**
 * Controller for handling authentication requests.
 * Extends BaseController for standardized error handling via Template Method.
 */
export class AuthController extends BaseController {

  /**
   * Registers a new user.
   */
  async register(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const result = await authService.register(req.body, req);
      res.status(201).json(result);
    }, 'Register');
  }

  /**
   * Authenticates a user and sets a session cookie.
   */
  async login(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const result = await authService.login(req.body, req);
      authSessionFacade.applySessionAndRespond(res, result);
    }, 'Login');
  }

  /**
   * Logs out the user and clears the cookie.
   */
  async logout(req: Request, res: Response): Promise<void> {
    try {
      const token = req.cookies?.token;
      if (token) {
        await authService.logout(token);
      }
    } catch (error: any) {
      logger.error(`[Auth Controller] Logout error: ${error.message}`);
    }

    authSessionFacade.clearSession(res);

    res.json({ message: "Logged out successfully" });
  }

  /**
   * Verifies the email with the provided code.
   */
  async verifyEmail(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const result = await authService.verifyEmail(req.body, req);

      authSessionFacade.applySessionAndRespond(res, result);
    }, 'VerifyEmail');
  }

  /**
   * Resends the verification email.
   */
  async resendVerification(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const result = await authService.resendVerification(req.body.email);
      res.json(result);
    }, 'ResendVerification');
  }

  /**
   * Rotates session and refreshes tokens.
   */
  async refresh(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const oldToken = req.cookies?.token;
      if (typeof oldToken !== 'string') {
        throw new AppError('No session token provided.', 401);
      }

      const result = await authService.refreshSession(oldToken, req);

      authSessionFacade.applySessionAndRespond(res, result);
    }, 'Refresh');
  }

  /**
   * Returns current authenticated user data.
   */
  async getMe(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const result = await authService.getMe((req.user as Partial<User>) || null);
      res.json(result);
    }, 'GetMe');
  }

  /**
   * Stage 1: Request password reset OTP.
   */
  async forgotPasswordRequest(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const result = await authService.forgotPasswordRequest(req.body.email, req);
      res.json(result);
    }, 'ForgotPasswordRequest');
  }

  /**
   * Stage 2: Verify password reset OTP.
   */
  async forgotPasswordVerify(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const result = await authService.forgotPasswordVerify(req.body.email, req.body.code, req);
      res.json(result);
    }, 'ForgotPasswordVerify');
  }

  /**
   * Stage 3: Reset password.
   */
  async forgotPasswordReset(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const result = await authService.forgotPasswordReset(
        req.body.email,
        req.body.password,
        req.body.resetToken,
        req,
      );
      res.json(result);
    }, 'ForgotPasswordReset');
  }

  /**
   * Authenticated password change: Request 8-character OTP code sent to registered email.
   */
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

  /**
   * Authenticated password change: Validate OTP code + current password and set new password.
   */
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

  /**
   * Upload profile picture for authenticated user.
   */
  async uploadProfilePicture(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const userId = (req.user as any)?.user_id || (req.user as any)?.id;
      if (!userId) {
        throw new AppError('Unauthorized: User profile not found.', 401);
      }
      if (!req.file) {
        throw new AppError('No image file provided.', 400);
      }

      const { customerService } = await import('../services/customer.service');
      const result = await customerService.uploadProfilePicture(
        userId,
        req.file.buffer,
        req.file.mimetype,
      );
      res.json(result);
    }, 'UploadProfilePicture');
  }

  /**
   * Update self profile details (name/username).
   */
  async updateProfile(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const userId = (req.user as any)?.user_id || (req.user as any)?.id;
      if (!userId) {
        throw new AppError('Unauthorized: User profile not found.', 401);
      }
      const result = await authService.updateProfile(userId, req.body);
      res.json(result);
    }, 'UpdateProfile');
  }
}

const controller = new AuthController();

export const register = controller.register.bind(controller);
export const login = controller.login.bind(controller);
export const logout = controller.logout.bind(controller);
export const verifyEmail = controller.verifyEmail.bind(controller);
export const resendVerification = controller.resendVerification.bind(controller);
export const refresh = controller.refresh.bind(controller);
export const getMe = controller.getMe.bind(controller);
export const forgotPasswordRequest = controller.forgotPasswordRequest.bind(controller);
export const forgotPasswordVerify = controller.forgotPasswordVerify.bind(controller);
export const forgotPasswordReset = controller.forgotPasswordReset.bind(controller);
export const changePasswordRequestCode = controller.changePasswordRequestCode.bind(controller);
export const changePassword = controller.changePassword.bind(controller);
export const uploadProfilePicture = controller.uploadProfilePicture.bind(controller);
export const updateProfile = controller.updateProfile.bind(controller);

export default controller;

