import {
  appointmentRepository,
  AppointmentRepository,
  AppointmentFilters,
} from '../repositories/appointment.repository';
import {
  notificationRepository,
  NotificationRepository,
} from '../repositories/notification.repository';
import { auditService, AuditService } from './audit.service';
import { realtimeBroadcastService } from './realtime-broadcast.service';
import { queueService, QueueService } from './queue.service';
import { AppError } from '../utils/error/AppError';
import logger from '../utils/general/logger';
import type {
  AppointmentRecord,
  CancelAppointmentPayload,
  CustomerBookingStats,
  AppointmentListResponse,
} from '@demoshop/shared-types';

const CANCELLABLE_STATUSES = new Set(['PENDING', 'CONFIRMED', 'SCHEDULED']);

export class AppointmentService {
  constructor(
    private repo: AppointmentRepository = appointmentRepository,
    private audit: AuditService = auditService,
    private queue: QueueService = queueService,
    private notificationRepo: NotificationRepository = notificationRepository
  ) {}

  async getAppointments(filters: AppointmentFilters): Promise<AppointmentListResponse> {
    const page = Math.max(1, Number(filters.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(filters.limit) || 50));

    const [listResult, counts] = await Promise.all([
      this.repo.listAppointments({ ...filters, page, limit }),
      this.repo.getCounts(filters),
    ]);

    // Attach customer reliability stats for unique customers in batch
    const customerIds = Array.from(
      new Set(
        listResult.appointments
          .map((a) => a.customer_id)
          .filter((id): id is string => Boolean(id))
      )
    );

    const statsMap = new Map<string, CustomerBookingStats>();
    if (customerIds.length > 0) {
      await Promise.all(
        customerIds.map(async (customerId) => {
          try {
            const stats = await this.repo.getCustomerBookingStats(customerId);
            if (stats) statsMap.set(customerId, stats);
          } catch (err) {
            logger.warn('[AppointmentService] Failed to load customer stats:', { customerId, error: err });
          }
        })
      );
    }

    const enrichedAppointments = listResult.appointments.map((appt) => ({
      ...appt,
      reliability: appt.customer_id ? statsMap.get(appt.customer_id) || null : null,
    }));

    return {
      appointments: enrichedAppointments,
      counts,
      pagination: {
        page,
        limit,
        total: listResult.total,
      },
    };
  }

  async getAppointmentById(id: string): Promise<AppointmentRecord> {
    const appointment = await this.repo.findById(id);
    if (!appointment) {
      throw new AppError('Appointment not found', 404);
    }

    if (appointment.customer_id) {
      const reliability = await this.repo.getCustomerBookingStats(appointment.customer_id);
      appointment.reliability = reliability;
    }

    return appointment;
  }

  async cancelAppointment(
    appointmentId: string,
    payload: CancelAppointmentPayload,
    cancelledByUserId: string | null,
    req?: any
  ): Promise<AppointmentRecord> {
    // 1. Validate appointment exists and is in a cancellable state
    const existing = await this.repo.findById(appointmentId);
    if (!existing) {
      throw new AppError(`Appointment with ID '${appointmentId}' not found`, 404);
    }

    const currentStatus = (existing.status || '').toUpperCase();
    if (!CANCELLABLE_STATUSES.has(currentStatus)) {
      throw new AppError(
        `Cannot cancel appointment in '${currentStatus}' status. Only PENDING, CONFIRMED, or SCHEDULED appointments may be cancelled.`,
        400
      );
    }

    const cancelledAt = new Date().toISOString();

    // 2. Update appointment
    const updated = await this.repo.updateAppointmentCancel(appointmentId, {
      status: payload.status,
      cancellation_reason: payload.cancellation_reason,
      cancelled_at: cancelledAt,
      cancelled_by: cancelledByUserId,
      other_notes: payload.other_notes,
    });

    // 3. Release barber slot availability immediately by syncing linked queue entry
    if (existing.queue_entry_id) {
      const qStatus = payload.status === 'NO_SHOW' ? 'no_show' : 'cancelled';
      await this.repo.syncQueueEntryCancel(
        existing.queue_entry_id,
        qStatus,
        payload.cancellation_reason
      );
    }

    // 4. Emit audit log entry
    try {
      await this.audit.logSecurityEvent({
        userId: cancelledByUserId,
        action: payload.status === 'NO_SHOW' ? 'APPOINTMENT_NO_SHOW' : 'APPOINTMENT_CANCELLED',
        resource: `appointments/${appointmentId}`,
        details: {
          appointmentId,
          status: payload.status,
          previousStatus: existing.status,
          cancellation_reason: payload.cancellation_reason,
          other_notes: payload.other_notes,
          customer_name: existing.customer_name,
          barber_name: existing.barber_name,
          scheduled_date: existing.scheduled_date,
          scheduled_time: existing.scheduled_time,
        },
        req,
      });
    } catch (auditErr) {
      logger.error('[AppointmentService] Audit log emission failed:', { error: auditErr, appointmentId });
    }

    // 5. Broadcast change over Realtime channel for live UI sync
    realtimeBroadcastService.dispatchAppointmentChangeSafely({
      action: payload.status === 'NO_SHOW' ? 'NO_SHOW' : 'CANCELLED',
      appointmentId,
      queueEntryId: existing.queue_entry_id,
      status: payload.status,
      customerId: existing.customer_id,
      barberId: existing.barber_id,
      branchId: existing.branch_id,
      metadata: {
        cancelled_by: cancelledByUserId,
        reason: payload.cancellation_reason,
      },
    });

    // 6. Notify staff (cashier, front desk, admin, owner) if appointment is cancelled
    if (payload.status === 'CANCELLED') {
      try {
        const appointmentLabel = existing.scheduled_date && existing.scheduled_time
          ? `${existing.scheduled_date} ${existing.scheduled_time} booking`
          : 'booking';

        await this.notificationRepo.insertCustomerCancellationBatch({
          customerId: existing.customer_id ? Number(existing.customer_id) : null,
          barberId: existing.barber_id ? Number(existing.barber_id) : null,
          customerName: existing.customer_name || 'Customer',
          appointmentLabel,
          reason: payload.cancellation_reason || 'No reason provided',
          branchId: existing.branch_id ? Number(existing.branch_id) : null,
          queueEntryId: existing.queue_entry_id ? Number(existing.queue_entry_id) : 0,
          timestamp: Date.now(),
        });
      } catch (notifErr) {
        logger.error('[AppointmentService] Failed to notify staff of appointment cancellation:', notifErr);
      }
    }

    // Attach customer stats
    if (updated.customer_id) {
      updated.reliability = await this.repo.getCustomerBookingStats(updated.customer_id);
    }

    return updated;
  }

  async getCustomerBookingStats(customerId: string): Promise<CustomerBookingStats> {
    const stats = await this.repo.getCustomerBookingStats(customerId);
    if (!stats) {
      return {
        total_bookings: 0,
        completed_bookings: 0,
        cancelled_bookings: 0,
        no_show_bookings: 0,
        cancellation_rate: 0,
        reliability_score: 100,
        risk_level: 'normal',
      };
    }
    return stats;
  }

  async confirmAppointment(
    appointmentId: string,
    options?: { adminName?: string; branchId?: number; actorId?: string | null; req?: any }
  ): Promise<any> {
    const existing = await this.repo.findById(appointmentId);
    if (!existing) {
      throw new AppError(`Appointment with ID '${appointmentId}' not found`, 404);
    }
    if (!existing.queue_entry_id) {
      throw new AppError('No associated queue entry found for this appointment', 400);
    }

    const result = await this.queue.acceptReservation(
      existing.queue_entry_id,
      existing.branch_id || options?.branchId,
      { cashierName: options?.adminName }
    );

    if (existing.group_booking_id) {
      await this.repo.updateAppointmentGroupStatus(String(existing.group_booking_id), 'SCHEDULED');
    } else {
      await this.repo.updateAppointmentStatus(appointmentId, 'SCHEDULED');
    }

    realtimeBroadcastService.dispatchAppointmentChangeSafely({
      action: 'STATUS_CHANGED',
      appointmentId,
      queueEntryId: existing.queue_entry_id,
      status: 'SCHEDULED',
      customerId: existing.customer_id,
      barberId: existing.barber_id,
      branchId: existing.branch_id,
    });


    try {
      await this.audit.logSecurityEvent({
        userId: options?.actorId || null,
        action: 'RESERVATION_CONFIRMED',
        resource: 'appointments/' + appointmentId,
        details: {
          appointment_id: appointmentId,
          status: 'SCHEDULED',
          previous_status: existing.status,
          customer_name: existing.customer_name,
          barber_name: existing.barber_name,
          scheduled_date: existing.scheduled_date,
          scheduled_time: existing.scheduled_time,
          admin_name: options?.adminName,
          branch_id: existing.branch_id || options?.branchId,
        },
        req: options?.req,
      });
    } catch (auditErr) {
      logger.error('[AppointmentService] Audit log emission failed for confirm:', { error: auditErr, appointmentId });
    }

    return result;
  }

  async declineAppointment(
    appointmentId: string,
    reason?: string,
    options?: { adminName?: string; branchId?: number; actorId?: string | null; req?: any }
  ): Promise<any> {
    const existing = await this.repo.findById(appointmentId);
    if (!existing) {
      throw new AppError(`Appointment with ID '${appointmentId}' not found`, 404);
    }
    if (!existing.queue_entry_id) {
      throw new AppError('No associated queue entry found for this appointment', 400);
    }

    const finalReason = reason || 'Declined by Administrator';
    const result = await this.queue.declineReservation(
      existing.queue_entry_id,
      existing.branch_id || options?.branchId,
      finalReason,
      'cancellation',
      { cashierName: options?.adminName }
    );

    if (existing.group_booking_id) {
      await this.repo.updateAppointmentGroupStatus(String(existing.group_booking_id), 'CANCELLED', {
        cancellation_reason: finalReason,
      });
    } else {
      await this.repo.updateAppointmentStatus(appointmentId, 'CANCELLED', {
        cancellation_reason: finalReason,
      });
    }

    realtimeBroadcastService.dispatchAppointmentChangeSafely({
      action: 'CANCELLED',
      appointmentId,
      queueEntryId: existing.queue_entry_id,
      status: 'CANCELLED',
      customerId: existing.customer_id,
      barberId: existing.barber_id,
      branchId: existing.branch_id,
      metadata: { reason: finalReason },
    });

    return result;
  }
}

export const appointmentService = new AppointmentService();
