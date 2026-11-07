import { Request, Response } from 'express';
import { BaseController } from './base.controller';
import { AppError } from '../utils/error/AppError';
import { staffScheduleService } from '../services/staff-schedule.service';

export class StaffScheduleController extends BaseController {
    async getMonthRoster(req: Request, res: Response): Promise<void> {
        await this.handleRequest(res, async () => {
            const now = new Date();
            const year = req.query.year ? Number(req.query.year) : now.getUTCFullYear();
            const month = req.query.month ? Number(req.query.month) : now.getUTCMonth() + 1;
            const branchId = req.query.branchId ? Number(req.query.branchId) : (req.user as any)?.branch_id || undefined;
            const result = await staffScheduleService.getMonthRoster(year, month, branchId);
            res.json(result);
        }, 'GetStaffShiftRoster');
    }

    async saveMonthRoster(req: Request, res: Response): Promise<void> {
        await this.handleRequest(res, async () => {
            const year = Number(req.body?.year);
            const month = Number(req.body?.month);
            const assignments = Array.isArray(req.body?.assignments) ? req.body.assignments : [];
            const actorId = (req.user as any)?.user_id || (req.user as any)?.id;
            const branchId = req.body?.branchId ? Number(req.body.branchId) : (req.user as any)?.branch_id || undefined;
            const result = await staffScheduleService.saveMonthRoster(year, month, assignments, actorId, req, branchId);
            res.json(result);
        }, 'SaveStaffShiftRoster');
    }

    async getMySchedule(req: Request, res: Response): Promise<void> {
        await this.handleRequest(res, async () => {
            const userId = (req.user as any)?.user_id || (req.user as any)?.id;
            if (!userId) {
                throw new AppError('Unauthorized: User ID missing from session token.', 401);
            }
            const from = typeof req.query.from === 'string' ? req.query.from : undefined;
            const to = typeof req.query.to === 'string' ? req.query.to : undefined;
            const result = await staffScheduleService.getMySchedule(userId, from, to);
            res.json(result);
        }, 'GetMyStaffSchedule');
    }
}

const controller = new StaffScheduleController();

export const getMonthRoster = controller.getMonthRoster.bind(controller);
export const saveMonthRoster = controller.saveMonthRoster.bind(controller);
export const getMySchedule = controller.getMySchedule.bind(controller);

export default controller;
