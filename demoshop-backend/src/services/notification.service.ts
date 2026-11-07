import logger from '../utils/general/logger';
import { notificationRepository, NotificationRecordInput } from '../repositories/notification.repository';

export type NotificationEvent =
  | 'reservation_pending'
  | 'reservation_confirmed'
  | 'reservation_cancelled'
  | 'reservation_declined'
  | 'cashier_reservation_pending'
  | 'barber_feedback_received'
  | 'inventory_purchase_order_pending'
  | 'inventory_purchase_order_approved'
  | 'inventory_purchase_order_rejected'
  | 'inventory_stock_count_due'
  | 'inventory_stock_count_pending'
  | 'inventory_stock_approaching_expiry'
  | 'inventory_consumable_critical_low'
  | 'schedule_delay'
  | 'schedule_adjusted';

interface QueueNotificationContext {
  id: number;
  customer_id?: number | null;
  customer_name?: string | null;
  branch_id?: number | null;
  barber_id?: number | null;
  preferred_date?: string | null;
  preferred_time?: string | null;
  cancel_reason?: string | null;
  cancel_type?: string | null;
  reference_number?: string | null;
}

export type NotificationInput = NotificationRecordInput;

export interface ScheduleDelayNotificationInput {
  customerUserId: string | null;
  customerName: string;
  queueEntryId: number;
  branchId?: number | null;
  barberId?: number | null;
  barberName: string;
  scheduledStartAt: string;
  estimatedStartAt: string;
  delayMinutes: number;
  serviceIds?: number[];
  adjustmentStatus?: 'pending' | 'kept' | 'rescheduled';
}

const formatReservation = (entry: QueueNotificationContext): string => {
  if (entry.preferred_date && entry.preferred_time) {
    return ` for ${entry.preferred_date} at ${entry.preferred_time}`;
  }
  return '';
};

const formatCancellationReason = (reason?: string): string => {
  const normalized = (reason || '').trim().toLowerCase();
  if (normalized.includes('emergency') || normalized.includes('early')) return 'Barber on emergency break';
  if (normalized.includes('break')) return 'Barber on break';
  return reason?.trim() || 'The front desk was unable to keep this appointment';
};

export class NotificationService {
  private async createSafely(input: NotificationInput): Promise<void> {
    try {
      logger.info(
        `[NotificationService.create] INSERTING NOTIFICATION | Recipient: ${input.recipientUserId} | Event: ${input.event} | Title: ${input.title} | Dedupe: ${input.dedupeKey}`
      );
      await notificationRepository.insertNotification(input);
    } catch (error: any) {
      // Notification delivery must not turn a successful queue transition into a failed request.
      logger.error(
        `[NotificationService] Failed to create ${input.event} for recipient ${input.recipientUserId}` +
        ` (queueEntryId: ${input.queueEntryId ?? 'none'}, dedupeKey: ${input.dedupeKey}): ${error?.message}`
      );
    }
  }

  async notifyReservationPending(entry: QueueNotificationContext): Promise<void> {
    try {
      const reservationStr = formatReservation(entry);
      await notificationRepository.insertReservationPendingBatch({
        customerId: entry.customer_id,
        reservationStr,
        branchId: entry.branch_id,
        queueEntryId: entry.id,
        fallbackCustomerName: entry.customer_name?.trim() || 'Customer',
        timestamp: Date.now(),
        referenceNumber: entry.reference_number || null,
      });
    } catch (error: any) {
      logger.error(`[NotificationService] Failed to prepare pending reservation notifications: ${error?.message}`);
    }
  }

  async notifyReservationConfirmed(entry: QueueNotificationContext): Promise<void> {
    try {
      if (!entry.customer_id) return;
      const reservationStr = formatReservation(entry);
      await notificationRepository.insertReservationConfirmed({
        customerId: entry.customer_id,
        reservationStr,
        branchId: entry.branch_id,
        queueEntryId: entry.id,
        timestamp: Date.now(),
      });
    } catch (error: any) {
      logger.error(`[NotificationService] Failed to prepare confirmation notification: ${error?.message}`);
    }
  }

  async notifyReservationReassigned(entry: QueueNotificationContext & {
    replacement_barber_name?: string | null;
  }): Promise<void> {
    try {
      if (!entry.customer_id || !entry.replacement_barber_name) return;
      await notificationRepository.insertReservationReassigned({
        customerId: entry.customer_id,
        customerName: entry.customer_name?.trim() || 'Customer',
        replacementBarberName: entry.replacement_barber_name,
        branchId: entry.branch_id,
        queueEntryId: entry.id,
      });
    } catch (error: any) {
      logger.error(`[NotificationService] Failed to notify reservation reassignment: ${error?.message}`);
    }
  }

  async notifyScheduleDelay(input: ScheduleDelayNotificationInput): Promise<void> {
    if (!input.customerUserId || input.delayMinutes <= 0) return;

    const message = `Your appointment with ${input.barberName} is estimated to start about ${input.delayMinutes} minutes later than scheduled due to an extended previous service. Your original appointment time remains ${input.scheduledStartAt}; the current estimated start is ${input.estimatedStartAt}.`;

    await this.createSafely({
      recipientUserId: input.customerUserId,
      event: 'schedule_adjusted',
      type: 'warning',
      title: 'Appointment Schedule Adjusted',
      message: `${message} Choose “Keep appointment” to stay with this barber, or “Reschedule next day” to select another available time with the same barber.`,
      branchId: input.branchId,
      queueEntryId: input.queueEntryId,
      dedupeKey: `schedule_delay:${input.queueEntryId}:${input.estimatedStartAt}`,
      metadata: {
        reservation_id: input.queueEntryId,
        scheduled_start_at: input.scheduledStartAt,
        estimated_start_at: input.estimatedStartAt,
        delay_minutes: input.delayMinutes,
        barber_id: input.barberId,
        service_ids: input.serviceIds || [],
        adjustment_status: input.adjustmentStatus || 'pending',
      },
    });
  }

  async notifyCashierOfCustomerCancellation(entry: QueueNotificationContext): Promise<void> {
    try {
      const reason = entry.cancel_reason?.trim() || 'No reason provided';
      const appointmentLabel = entry.preferred_time?.trim()
        ? `${entry.preferred_time.trim()} booking`
        : 'booking';

      await notificationRepository.insertCustomerCancellationBatch({
        customerId: entry.customer_id,
        barberId: entry.barber_id,
        customerName: entry.customer_name?.trim() || 'Customer',
        appointmentLabel,
        reason,
        branchId: entry.branch_id,
        queueEntryId: entry.id,
        timestamp: Date.now(),
      });
    } catch (error: any) {
      logger.error(`[NotificationService] Failed to prepare customer cancellation notification: ${error?.message}`);
    }
  }

  async notifyReservationDeclined(entry: QueueNotificationContext, reason?: string): Promise<void> {
    try {
      if (!entry.customer_id) return;
      const cancellationReason = formatCancellationReason(reason);
      const appointmentLabel = entry.preferred_time ? `${entry.preferred_time} booking` : 'appointment';

      await notificationRepository.insertReservationDeclined({
        customerId: entry.customer_id,
        barberId: entry.barber_id,
        appointmentLabel,
        cancellationReason,
        branchId: entry.branch_id,
        queueEntryId: entry.id,
        timestamp: Date.now(),
      });
    } catch (error: any) {
      logger.error(`[NotificationService] Failed to prepare decline notification: ${error?.message}`);
    }
  }

  async notifyCashierEmergencyRebookAccepted(
    entry: QueueNotificationContext,
    barberNameOverride?: string
  ): Promise<void> {
    try {
      const appointmentTimeInfo = entry.preferred_time
        ? ` for ${entry.preferred_time}${entry.preferred_date ? ` (${entry.preferred_date})` : ''}`
        : '';

      await notificationRepository.insertEmergencyRebookAcceptedBatch({
        customerId: entry.customer_id,
        barberId: entry.barber_id,
        customerName: entry.customer_name?.trim() || 'Customer',
        appointmentTimeInfo,
        barberNameOverride: barberNameOverride || null,
        branchId: entry.branch_id,
        queueEntryId: entry.id,
        timestamp: Date.now(),
      });
    } catch (error: any) {
      logger.error(
        `[NotificationService] Failed to prepare emergency rebook accepted notification: ${error?.message}`
      );
    }
  }

  async notifyCashierEmergencyRebookRejected(
    entry: QueueNotificationContext
  ): Promise<void> {
    try {
      await notificationRepository.insertEmergencyRebookRejectedBatch({
        customerId: entry.customer_id,
        customerName: entry.customer_name?.trim() || 'Customer',
        branchId: entry.branch_id,
        queueEntryId: entry.id,
        timestamp: Date.now(),
      });
    } catch (error: any) {
      logger.error(
        `[NotificationService] Failed to prepare emergency rebook rejected notification: ${error?.message}`
      );
    }
  }

  async notifyBarberFeedbackReceived(input: {
    queueEntryId: number;
    barberId?: number | null;
    stars: number;
    comment?: string | null;
  }): Promise<void> {
    try {
      if (!input.barberId) {
        logger.warn(`[NotificationService] Cannot notify barber for queue entry ${input.queueEntryId}: missing barberId`);
        return;
      }

      const barberUserId = await notificationRepository.findBarberUserId(input.barberId);
      if (!barberUserId) {
        logger.warn(
          `[NotificationService] Cannot notify barber ${input.barberId} for queue entry ${input.queueEntryId}: no user_id associated`
        );
        return;
      }

      const cleanComment = input.comment?.trim();
      const starsFormatted = `${input.stars} ${input.stars === 1 ? 'star' : 'stars'}`;
      const message = cleanComment
        ? `Customer left a ${starsFormatted} rating with testimonial: "${cleanComment}"`
        : `Customer left a ${starsFormatted} rating.`;

      await this.createSafely({
        recipientUserId: barberUserId,
        event: 'barber_feedback_received',
        type: 'info',
        title: 'New Customer Feedback',
        message,
        queueEntryId: input.queueEntryId,
        dedupeKey: `barber_feedback:${input.queueEntryId}`,
      });
    } catch (error: any) {
      logger.error(`[NotificationService] Failed to notify barber feedback: ${error?.message}`);
    }
  }

  async notifyShopAdminShiftRequest(params: {
    barberName: string;
    requestType: 'swap' | 'time_off';
    shiftDate: string;
    targetBarberName?: string;
    reason: string;
    branchId?: number | null;
    requestId: number;
  }): Promise<void> {
    try {
      const typeLabel = params.requestType === 'swap' ? 'Shift Swap' : 'Time Off / Leave';
      const title = `Shift Request: ${params.barberName} (${typeLabel})`;
      const targetDetail = params.requestType === 'swap' && params.targetBarberName
        ? ` with ${params.targetBarberName}`
        : '';
      const message = `Barber ${params.barberName} submitted a ${typeLabel} request for ${params.shiftDate}${targetDetail}. Reason: "${params.reason}"`;

      await notificationRepository.insertShiftRequestNotificationBatch({
        title,
        message,
        branchId: params.branchId,
        requestId: params.requestId,
      });
    } catch (error: any) {
      logger.error(`[NotificationService] Failed to dispatch shift request notification: ${error?.message}`);
    }
  }

  async notifyBarberShiftDecision(params: {
    barberUserId: string;
    barberName: string;
    requestType: 'swap' | 'time_off';
    shiftDate: string;
    action: 'approved' | 'declined';
    adminNotes?: string;
    requestId: number;
  }): Promise<void> {
    try {
      const isApproved = params.action === 'approved';
      const typeLabel = params.requestType === 'swap' ? 'Shift Swap' : 'Time Off';
      const title = `Shift Request ${isApproved ? 'Approved' : 'Declined'}`;
      const notePart = params.adminNotes ? ` Note from Admin: "${params.adminNotes}"` : '';
      const message = `Your ${typeLabel} request for ${params.shiftDate} has been ${params.action} by shop administration.${notePart}`;

      await this.createSafely({
        recipientUserId: params.barberUserId,
        event: `barber_shift_${params.action}`,
        type: isApproved ? 'success' : 'warning',
        title,
        message,
        dedupeKey: `barber_shift_${params.action}:${params.requestId}:${Date.now()}`,
        metadata: { requestId: params.requestId },
      });
    } catch (error: any) {
      logger.error(`[NotificationService] Failed to notify barber shift decision: ${error?.message}`);
    }
  }

  async listForUser(userId: string, limit: number, cursor?: number): Promise<{ items: any[]; nextCursor: number | null }> {
    try {
      return await notificationRepository.listForUser(userId, limit, cursor);
    } catch (error: any) {
      logger.error(`[NotificationService] Failed to list notifications for user ${userId}: ${error?.message}`);
      return { items: [], nextCursor: null };
    }
  }

  async countUnreadForUser(userId: string): Promise<number> {
    try {
      return await notificationRepository.countUnreadForUser(userId);
    } catch (error: any) {
      logger.error(`[NotificationService] Failed to count notifications for user ${userId}: ${error?.message}`);
      return 0;
    }
  }

  async markRead(userId: string, notificationId: number): Promise<boolean> {
    try {
      return await notificationRepository.markRead(userId, notificationId);
    } catch (error: any) {
      logger.error(`[NotificationService] Failed to mark notification ${notificationId} as read: ${error?.message}`);
      return false;
    }
  }

  async markAllRead(userId: string): Promise<number> {
    try {
      return await notificationRepository.markAllRead(userId);
    } catch (error: any) {
      logger.error(`[NotificationService] Failed to mark all notifications as read for user ${userId}: ${error?.message}`);
      return 0;
    }
  }
}

export const notificationService = new NotificationService();
export default notificationService;
