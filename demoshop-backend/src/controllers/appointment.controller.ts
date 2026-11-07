import { Request, Response } from 'express';
import { BaseController } from './base.controller';
import { appointmentService } from '../services/appointment.service';
import { validateCancelAppointmentPayload } from '../validators/appointment.validator';

export class AppointmentController extends BaseController {
  async getAppointments(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const {
        status,
        search,
        barberId,
        startDate,
        endDate,
        page,
        limit,
      } = req.query;

      const result = await appointmentService.getAppointments({
        status: status as string | undefined,
        search: search as string | undefined,
        barberId: barberId ? Number(barberId) : undefined,
        startDate: startDate as string | undefined,
        endDate: endDate as string | undefined,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        scope: req.query.scope === 'active' || req.query.scope === 'history' ? req.query.scope : undefined,
        view: req.query.view === 'today' || req.query.view === 'overdue' ? req.query.view : undefined,
        origin: req.query.origin === 'in_app' ? 'in_app' : undefined,
        sort: req.query.sort === 'oldest' ? 'oldest' : 'newest',
        branchId: req.user?.role === 'System Admin' ? undefined : (req.user as any)?.branch_id || undefined,
      });

      res.status(200).json(result);
    }, 'GetAppointments');
  }

  async getAppointmentById(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const id = String(req.params.id || '');
      const appointment = await appointmentService.getAppointmentById(id);
      res.status(200).json(appointment);
    }, 'GetAppointmentById');
  }

  async cancelAppointment(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const rawId = req.params.id || req.body.appointmentId;
      const appointmentId = String(Array.isArray(rawId) ? rawId[0] : rawId || '');
      const validatedPayload = validateCancelAppointmentPayload({
        ...req.body,
        appointmentId,
      });

      const user = (req as any).user;
      const cancelledByUserId = user?.user_id || user?.id || null;

      const updated = await appointmentService.cancelAppointment(
        appointmentId,
        validatedPayload,
        cancelledByUserId,
        req
      );

      res.status(200).json({
        success: true,
        message: `Appointment successfully marked as ${validatedPayload.status}`,
        appointment: updated,
      });
    }, 'CancelAppointment');
  }

  async getCustomerBookingStats(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const rawCustomerId = req.params.customerId || req.params.id;
      const customerId = String(Array.isArray(rawCustomerId) ? rawCustomerId[0] : rawCustomerId || '');
      const stats = await appointmentService.getCustomerBookingStats(customerId);
      res.status(200).json(stats);
    }, 'GetCustomerBookingStats');
  }

  async confirmAppointment(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const id = String(req.params.id || '');
      const user = (req as any).user;
      const adminName = user?.username || user?.email || 'Admin';
      const branchId = user?.branch_id;
      const actorId = user?.user_id || user?.id || null;
      const result = await appointmentService.confirmAppointment(id, { adminName, branchId, actorId, req });
      res.status(200).json({ success: true, result });
    }, 'ConfirmAppointment');
  }

  async declineAppointment(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const id = String(req.params.id || '');
      const reason = req.body?.reason;
      const user = (req as any).user;
      const adminName = user?.username || user?.email || 'Admin';
      const branchId = user?.branch_id;
      const actorId = user?.user_id || user?.id || null;
      const result = await appointmentService.declineAppointment(id, reason, { adminName, branchId, actorId, req });
      res.status(200).json({ success: true, result });
    }, 'DeclineAppointment');
  }
}

const controller = new AppointmentController();

export const getAppointments = controller.getAppointments.bind(controller);
export const getAppointmentById = controller.getAppointmentById.bind(controller);
export const cancelAppointment = controller.cancelAppointment.bind(controller);
export const confirmAppointment = controller.confirmAppointment.bind(controller);
export const declineAppointment = controller.declineAppointment.bind(controller);
export const getCustomerBookingStats = controller.getCustomerBookingStats.bind(controller);

export default controller;
