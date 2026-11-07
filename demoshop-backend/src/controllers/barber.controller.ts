import { Request, Response } from 'express';
import { BaseController } from './base.controller';
import { barberService } from '../services/barber.service';
import { AppError } from '../utils/error/AppError';
import { createImageUploadMiddleware } from '../utils/general/image-upload.util';

export const barberPhotoUpload = createImageUploadMiddleware('haircut_photo');
export const barberPortfolioUpload = createImageUploadMiddleware('photo');

export class BarberController extends BaseController {
    async getCustomerHistory(req: Request, res: Response): Promise<void> {
        await this.handleRequest(res, async () => {
            const query = (req.query.search as string) || '';
            const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
            const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 6;
            const userId = (req.user as any)?.user_id || (req.user as any)?.id;
            const results = await barberService.searchCustomerHistory(query, userId, page, limit);
            res.json(results);
        }, 'GetCustomerHistory');
    }

    async getPerformance(req: Request, res: Response): Promise<void> {
        await this.handleRequest(res, async () => {
            const userId = (req.user as any)?.user_id || (req.user as any)?.id;
            if (!userId) {
                throw new AppError('Unauthorized: User ID missing from session token.', 401);
            }
            const metrics = await barberService.getPerformance(userId);
            res.json(metrics);
        }, 'GetPerformance');
    }

    async getEarnings(req: Request, res: Response): Promise<void> {
        await this.handleRequest(res, async () => {
            const userId = (req.user as any)?.user_id || (req.user as any)?.id;
            if (!userId) {
                throw new AppError('Unauthorized: User ID missing from session token.', 401);
            }
            const period = (req.query.period as 'today' | 'week' | 'month') || 'today';
            const earnings = await barberService.getEarnings(userId, period);
            res.json(earnings);
        }, 'GetEarnings');
    }

    async uploadHaircutPhoto(req: Request, res: Response): Promise<void> {
        await this.handleRequest(res, async () => {
            const userId = (req.user as any)?.user_id || (req.user as any)?.id;
            if (!userId) {
                throw new AppError('Unauthorized: User ID missing from session token.', 401);
            }
            if (!req.file) {
                throw new AppError('No image file uploaded.', 400);
            }
            const queueEntryId = req.body.queueId ? Number(req.body.queueId) : undefined;
            const result = await barberService.uploadHaircutPhoto(
                userId,
                req.file.buffer,
                req.file.mimetype,
                queueEntryId
            );
            res.json(result);
        }, 'UploadHaircutPhoto');
    }

    async getAvailability(req: Request, res: Response): Promise<void> {
        await this.handleRequest(res, async () => {
            const userId = (req.user as any)?.user_id || (req.user as any)?.id;
            if (!userId) {
                throw new AppError('Unauthorized: User ID missing from session token.', 401);
            }
            const barberIdParam = req.query.barberId ? Number(req.query.barberId) : undefined;
            const data = await barberService.getAvailability(userId, barberIdParam);
            res.json(data);
        }, 'GetAvailability');
    }

    async updateAvailability(req: Request, res: Response): Promise<void> {
        await this.handleRequest(res, async () => {
            const userId = (req.user as any)?.user_id || (req.user as any)?.id;
            if (!userId) {
                throw new AppError('Unauthorized: User ID missing from session token.', 401);
            }
            const { status, barberId } = req.body;
            if (!status) {
                throw new AppError('Status field is required.', 400);
            }
            const barberIdNum = barberId ? Number(barberId) : undefined;
            const result = await barberService.updateAvailability(userId, status, barberIdNum);
            res.json(result);
        }, 'UpdateAvailability');
    }

    async updateAdministrativeStatus(req: Request, res: Response): Promise<void> {
        await this.handleRequest(res, async () => {
            const barberId = parseInt(req.params.barberId as string, 10);
            if (isNaN(barberId) || barberId <= 0) {
                throw new AppError('Invalid barber ID.', 400);
            }
            const { status, reason } = req.body;
            if (!status) {
                throw new AppError('Status field is required.', 400);
            }
            const actorId = (req.user as any)?.user_id || (req.user as any)?.id;
            const actorRole = (req.user as any)?.role;
            const branchId = (req.user as any)?.branch_id;

            const result = await barberService.updateAdministrativeStatus({
                barberId,
                status,
                actorId,
                actorRole,
                reason,
                branchId,
            }, req);
            res.json(result);
        }, 'UpdateAdministrativeStatus');
    }

    async getAllStaff(req: Request, res: Response): Promise<void> {
        await this.handleRequest(res, async () => {
            const branchId = req.query.branchId ? Number(req.query.branchId) : undefined;
            const staff = await barberService.getAllStaff(branchId);
            res.json(staff);
        }, 'GetAllStaff');
    }

    async submitShiftRequest(req: Request, res: Response): Promise<void> {
        await this.handleRequest(res, async () => {
            const userId = (req.user as any)?.user_id || (req.user as any)?.id;
            if (!userId) {
                throw new AppError('Unauthorized: User ID missing from session token.', 401);
            }
            const { requestType, shiftDate, targetBarberName, targetDate, reason } = req.body;
            if (!requestType || !shiftDate || !reason) {
                throw new AppError('Request type, shift date, and reason are required.', 400);
            }
            const result = await barberService.submitShiftRequest(userId, {
                requestType,
                shiftDate,
                targetBarberName,
                targetDate,
                reason,
            }, req);
            res.status(201).json(result);
        }, 'SubmitShiftRequest');
    }

    async getActiveShiftRequest(req: Request, res: Response): Promise<void> {
        await this.handleRequest(res, async () => {
            const userId = (req.user as any)?.user_id || (req.user as any)?.id;
            if (!userId) {
                throw new AppError('Unauthorized: User ID missing from session token.', 401);
            }
            const result = await barberService.getActiveShiftRequest(userId);
            res.json(result);
        }, 'GetActiveShiftRequest');
    }

    async acknowledgeShiftRequest(req: Request, res: Response): Promise<void> {
        await this.handleRequest(res, async () => {
            const userId = (req.user as any)?.user_id || (req.user as any)?.id;
            if (!userId) {
                throw new AppError('Unauthorized: User ID missing from session token.', 401);
            }
            const requestId = parseInt(req.params.id as string, 10);
            const result = await barberService.acknowledgeShiftRequest(userId, requestId);
            res.json({ success: result });
        }, 'AcknowledgeShiftRequest');
    }

    async getAllShiftRequests(req: Request, res: Response): Promise<void> {
        await this.handleRequest(res, async () => {
            const branchId = req.query.branchId ? Number(req.query.branchId) : undefined;
            const list = await barberService.listAllShiftRequests(branchId);
            res.json(list);
        }, 'GetAllShiftRequests');
    }

    async reviewShiftRequest(req: Request, res: Response): Promise<void> {
        await this.handleRequest(res, async () => {
            const requestId = parseInt(req.params.id as string, 10);
            const { action, adminNotes } = req.body;
            if (!['approve', 'decline'].includes(action)) {
                throw new AppError('Action must be "approve" or "decline".', 400);
            }
            const actorId = (req.user as any)?.user_id || (req.user as any)?.id;
            const result = await barberService.reviewShiftRequest(requestId, action, adminNotes, actorId, req);
            res.json(result);
        }, 'ReviewShiftRequest');
    }

    async clearAllShiftRequests(req: Request, res: Response): Promise<void> {
        await this.handleRequest(res, async () => {
            const actorId = (req.user as any)?.user_id || (req.user as any)?.id;
            const result = await barberService.clearAllShiftRequests(actorId, req);
            res.json({ success: true, deleted: result.deleted });
        }, 'ClearAllShiftRequests');
    }

    async getPortfolio(req: Request, res: Response): Promise<void> {
        await this.handleRequest(res, async () => {
            const userId = (req.user as any)?.user_id || (req.user as any)?.id;
            if (!userId) {
                throw new AppError('Unauthorized: User ID missing from session token.', 401);
            }
            const portfolio = await barberService.getBarberPortfolio(userId);
            res.json(portfolio);
        }, 'GetPortfolio');
    }

    async getPublicPortfolio(req: Request, res: Response): Promise<void> {
        await this.handleRequest(res, async () => {
            const barberId = parseInt(req.params.barberId as string, 10);
            const portfolio = await barberService.getPublicBarberPortfolio(barberId);
            res.json(portfolio);
        }, 'GetPublicPortfolio');
    }

    async updateBio(req: Request, res: Response): Promise<void> {
        await this.handleRequest(res, async () => {
            const userId = (req.user as any)?.user_id || (req.user as any)?.id;
            if (!userId) {
                throw new AppError('Unauthorized: User ID missing from session token.', 401);
            }
            const { bio } = req.body;
            const result = await barberService.updateBarberBio(userId, bio);
            res.json(result);
        }, 'UpdateBio');
    }

    async updateSpecialties(req: Request, res: Response): Promise<void> {
        await this.handleRequest(res, async () => {
            const userId = (req.user as any)?.user_id || (req.user as any)?.id;
            if (!userId) {
                throw new AppError('Unauthorized: User ID missing from session token.', 401);
            }
            const { serviceIds } = req.body;
            const specialties = await barberService.setBarberSpecialties(userId, serviceIds);
            res.json(specialties);
        }, 'UpdateSpecialties');
    }

    async addPortfolioWork(req: Request, res: Response): Promise<void> {
        await this.handleRequest(res, async () => {
            const userId = (req.user as any)?.user_id || (req.user as any)?.id;
            if (!userId) {
                throw new AppError('Unauthorized: User ID missing from session token.', 401);
            }
            if (!req.file) {
                throw new AppError('Photo is required.', 400);
            }
            const serviceId = req.body.serviceId ? parseInt(req.body.serviceId as string, 10) : undefined;
            const caption = req.body.caption as string | undefined;

            const item = await barberService.addPortfolioWork(
                userId,
                req.file.buffer,
                req.file.mimetype,
                serviceId,
                caption
            );
            res.status(201).json(item);
        }, 'AddPortfolioWork');
    }

    async updatePortfolioWork(req: Request, res: Response): Promise<void> {
        await this.handleRequest(res, async () => {
            const userId = (req.user as any)?.user_id || (req.user as any)?.id;
            if (!userId) {
                throw new AppError('Unauthorized: User ID missing from session token.', 401);
            }
            const itemId = parseInt(req.params.id as string, 10);
            const serviceId = req.body.serviceId !== undefined ? (req.body.serviceId ? parseInt(req.body.serviceId, 10) : null) : undefined;
            const caption = req.body.caption !== undefined ? req.body.caption : undefined;

            const item = await barberService.updatePortfolioWork(userId, itemId, serviceId, caption);
            res.json(item);
        }, 'UpdatePortfolioWork');
    }

    async deletePortfolioWork(req: Request, res: Response): Promise<void> {
        await this.handleRequest(res, async () => {
            const userId = (req.user as any)?.user_id || (req.user as any)?.id;
            if (!userId) {
                throw new AppError('Unauthorized: User ID missing from session token.', 401);
            }
            const itemId = parseInt(req.params.id as string, 10);
            const result = await barberService.deletePortfolioWork(userId, itemId);
            res.json(result);
        }, 'DeletePortfolioWork');
    }
}

const controller = new BarberController();

export const getCustomerHistory = controller.getCustomerHistory.bind(controller);
export const getPerformance = controller.getPerformance.bind(controller);
export const getEarnings = controller.getEarnings.bind(controller);
export const uploadHaircutPhoto = controller.uploadHaircutPhoto.bind(controller);
export const getAvailability = controller.getAvailability.bind(controller);
export const updateAvailability = controller.updateAvailability.bind(controller);
export const updateAdministrativeStatus = controller.updateAdministrativeStatus.bind(controller);
export const getAllStaff = controller.getAllStaff.bind(controller);
export const submitShiftRequest = controller.submitShiftRequest.bind(controller);
export const getActiveShiftRequest = controller.getActiveShiftRequest.bind(controller);
export const acknowledgeShiftRequest = controller.acknowledgeShiftRequest.bind(controller);
export const getAllShiftRequests = controller.getAllShiftRequests.bind(controller);
export const reviewShiftRequest = controller.reviewShiftRequest.bind(controller);
export const clearAllShiftRequests = controller.clearAllShiftRequests.bind(controller);
export const getPortfolio = controller.getPortfolio.bind(controller);
export const getPublicPortfolio = controller.getPublicPortfolio.bind(controller);
export const updateBio = controller.updateBio.bind(controller);
export const updateSpecialties = controller.updateSpecialties.bind(controller);
export const addPortfolioWork = controller.addPortfolioWork.bind(controller);
export const updatePortfolioWork = controller.updatePortfolioWork.bind(controller);
export const deletePortfolioWork = controller.deletePortfolioWork.bind(controller);

export default controller;
