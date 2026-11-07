import db from '../db';
import { queueRepository } from '../repositories/queue.repository';
import { barberRepository } from '../repositories/barber.repository';
import { queueService } from './queue.service';
import { notificationService } from './notification.service';
import { auditService } from './audit.service';
import { AppError } from '../utils/error/AppError';
import { timeToMinutes } from '../utils/queue/availability.util';
import logger from '../utils/general/logger';
import { staffScheduleService } from './staff-schedule.service';

import {
  EmergencyCancelRequest,
  EmergencyCancelResult,
  AffectedBookingNotice,
  RebookSlotOption,
} from '@demoshop/shared-types';

export class EmergencyCancellationService {
  async getCashierReassignmentOptions(queueId: number, branchId: number): Promise<any[]> {
    const entry = await queueRepository.findBarberAndPosition(queueId);
    if (!entry || Number(entry.branch_id) !== branchId) {
      throw new AppError('Queue entry not found for this branch.', 404);
    }
    if (!['pending', 'accepted', 'waiting', 'serving', 'late'].includes(String(entry.status))) {
      throw new AppError('Only active queue entries can be reassigned.', 409);
    }
    return queueRepository.findBarberReassignmentOptions(branchId, Number(entry.barber_id));
  }

  async reassignForCashier(
    queueId: number,
    replacementBarberId: number,
    branchId: number,
    actingUserId: string,
    reason: string,
  ): Promise<any> {
    if (!reason.trim()) throw new AppError('A reassignment reason is required.', 400);
    const entry = await queueRepository.findBarberAndPosition(queueId);
    if (!entry || Number(entry.branch_id) !== branchId) {
      throw new AppError('Queue entry not found for this branch.', 404);
    }

    let reassigned: any;
    try {
      reassigned = await queueRepository.reassignQueueEntry(
        queueId,
        replacementBarberId,
        actingUserId,
        reason.trim(),
      );
    } catch (error: any) {
      throw new AppError(error?.message || 'Unable to reassign this queue entry.', 409);
    }

    await notificationService.notifyReservationReassigned(reassigned);
    await auditService.logSecurityEvent({
      userId: actingUserId,
      action: 'cashier_barber_reassignment',
      resource: `queue_entry:${queueId}`,
      details: {
        queueEntryId: queueId,
        originalBarberId: entry.barber_id,
        replacementBarberId,
        reservationFeeDisposition: reassigned.reservation_fee_disposition || null,
        reason: reason.trim(),
      },
    });

    return reassigned;
  }

  /**
   * Triggers an emergency cancellation flow initiated by Cashier/Admin.
   * Batch-flags affected bookings, recalculates SECT wait times for remaining active bookings,
   * and generates pre-approved priority rebooking slot options for affected customers.
   */
  async triggerEmergencyCancellation(
    req: EmergencyCancelRequest
  ): Promise<EmergencyCancelResult> {
    const { branchId, cancellationType, barberId, startTime, endTime, reason } = req;

    if (!reason || reason.trim().length === 0) {
      throw new AppError('A valid reason is required for emergency cancellation.', 400);
    }

    if (cancellationType === 'barber_unavailability' && !barberId) {
      throw new AppError('Barber ID is required for barber unavailability cancellation.', 400);
    }

    // If barber unavailability, mark the barber status in database so they are not assigned/selected
    if (cancellationType === 'barber_unavailability' && barberId) {
      try {
        await db.query(`UPDATE barbers SET status = 'break' WHERE barber_id = $1`, [barberId]);
      } catch (statusErr) {
        logger.warn(`[EmergencyCancellation] Failed to update barber ${barberId} status:`, statusErr);
      }
    }

    const affectedBookings = await queueRepository.withTransaction(async (client) => {
      const entries = await queueRepository.findActiveEntriesForEmergency(
        client,
        branchId,
        cancellationType,
        barberId,
        startTime,
        endTime
      );

      const affectedIds = entries.map((e) => e.id);
      if (affectedIds.length > 0) {
        await queueRepository.batchEmergencyCancel(
          client,
          affectedIds,
          cancellationType,
          reason
        );
      }

      return entries;
    });

    // Notify each affected customer so their notification payload includes barber_id
    for (const booking of affectedBookings) {
      try {
        await notificationService.notifyReservationDeclined(booking, reason);
      } catch (err) {
        logger.error(`[EmergencyCancellation] Failed to send notification to booking ${booking.id}:`, err);
      }
    }

    const affectedBookingIds = affectedBookings.map((b) => b.id);
    const affectedBarberIds = Array.from(
      new Set(affectedBookings.map((b) => b.barber_id).filter(Boolean))
    );

    // Recalculate positions & wait times using SECT for affected barbers
    const recalculatedSchedules: Array<{ barberId: number; updatedQueueCount: number }> = [];
    for (const bId of affectedBarberIds) {
      await queueRepository.recalculatePositions(bId);
      const activeEntries = await queueRepository.findActiveByBarber(bId);
      recalculatedSchedules.push({ barberId: bId, updatedQueueCount: activeEntries.length });
    }

    logger.info('[EmergencyCancellation] Emergency cancellation executed', {
      branchId,
      cancellationType,
      barberId: barberId || null,
      cancelledCount: affectedBookingIds.length,
      affectedBookingIds,
    });

    return {
      cancelledCount: affectedBookingIds.length,
      affectedBookingIds,
      recalculatedSchedules,
    };
  }

  /**
   * Retrieves active pending emergency cancellation notice for a logged-in customer.
   */
  async getPendingEmergencyNotice(
    customerId: number
  ): Promise<AffectedBookingNotice | null> {
    const entry = await queueRepository.findPendingEmergencyNoticeByCustomer(customerId);
    if (!entry) return null;

    // Generate pre-approved replacement slots prioritizing original time preference & available barbers
    const availableRebookSlots = await this.generatePreApprovedRebookSlots(
      entry.branch_id,
      entry.service_ids || (entry.service_id ? [entry.service_id] : []),
      entry.preferred_date ? String(entry.preferred_date) : undefined,
      entry.preferred_time || undefined,
      entry.barber_id || undefined
    );
    const serviceIds = Array.isArray(entry.service_ids) && entry.service_ids.length > 0
      ? entry.service_ids.map(Number).filter((id: number) => Number.isInteger(id) && id > 0)
      : entry.service_id ? [Number(entry.service_id)] : [];

    return {
      queueId: entry.id,
      branchId: entry.branch_id,
      serviceIds,
      originalBarberId: entry.barber_id,
      originalBarberName: entry.barber_name || 'Assigned Barber',
      originalDate: entry.preferred_date ? String(entry.preferred_date) : null,
      originalTime: entry.preferred_time || null,
      cancellationType: entry.emergency_cancellation_type || 'shop_closure',
      cancellationReason: entry.emergency_cancellation_reason || 'Shop Emergency',
      cancelledAt: entry.emergency_cancelled_at || entry.created_at,
      availableRebookSlots,
    };
  }

  /**
   * Rebooks an emergency-cancelled booking into a pre-approved slot with priority status.
   */
  async rebookSlot(
    customerId: number,
    queueId: number,
    slot: RebookSlotOption
  ): Promise<any> {
    const existing = await queueRepository.findById(queueId);
    if (!existing || existing.customer_id !== customerId) {
      throw new AppError('Emergency cancellation record not found for this customer.', 404);
    }
    if (existing.rebooking_status === 'rebooked') {
      throw new AppError('This emergency cancellation notice has already been processed.', 409);
    }
    if (existing.status !== 'cancelled' && existing.rebooking_status !== 'pending_action') {
      throw new AppError('This reservation is not eligible for rebooking.', 400);
    }

    const originalBarberId = Number(existing.barber_id || 0);
    const replacementBarberId = Number(slot?.barberId || 0);
    if (!replacementBarberId || replacementBarberId === originalBarberId) {
      throw new AppError('Choose an active barber other than the cancelled barber.', 409);
    }

    // Never trust a client-supplied slot to select the cancelled barber. The
    // same rule is enforced when slots are generated, but it must also be
    // enforced at the write boundary for stale tabs and tampered requests.
    const activeBarbers = await barberRepository.findActiveBarbersByBranch(String(existing.branch_id));
    const replacementBarber = activeBarbers.find((barber: any) => {
      const barberId = Number(barber?.barber_id ?? barber?.id ?? 0);
      const status = String(barber?.status || '').toLowerCase().trim();
      return barberId === replacementBarberId
        && barberId !== originalBarberId
        && barber?.is_active !== false
        && status !== 'suspended'
        && status !== 'offline'
        && status !== 'leave';
    });
    if (!replacementBarber) {
      throw new AppError('The selected replacement barber is no longer available.', 409);
    }

    // Verify replacement barber is eligible for online bookings on slot.date
    if (slot.date) {
      try {
        const schedule = await staffScheduleService.getBarberSchedulePublic(
          replacementBarberId,
          slot.date,
          slot.date
        );
        const detail = schedule.dateDetails?.[slot.date];
        if (detail?.isOnlineBookingEnabled === false || detail?.reason === 'Online Booking Disabled' || detail?.isOff === true) {
          throw new AppError('The selected barber is assigned for walk-ins only on this date. Please choose an online-eligible barber.', 400);
        }
      } catch (err: any) {
        if (err instanceof AppError) throw err;
        logger.warn(`[EmergencyCancellation] Could not verify schedule for barber ${replacementBarberId} on ${slot.date}: ${err?.message}`);
      }
    }

    const serviceIds = Array.isArray(existing.service_ids) && existing.service_ids.length > 0
      ? existing.service_ids
      : existing.service_id ? [existing.service_id] : [1];

    // Join new queue slot directly as accepted (pre-approved priority booking)
    const newEntry = await queueService.joinQueue({
      customerId,
      barberId: replacementBarberId,
      branchId: existing.branch_id,
      serviceIds,
      preferredDate: slot.date,
      preferredTime: slot.time,
      initialStatus: 'accepted',
      bypassPaymentProof: true,
    });

    // Carry the original paid reservation fee to the replacement appointment.
    // The original cancelled row remains as the audit/history record, while the
    // new active row is already paid and must not ask the customer for QR proof.
    await queueRepository.transferReservationDeposit(queueId, newEntry.id, replacementBarberId);

    // Update old entry status
    await queueRepository.updateEmergencyRebookingStatus(queueId, 'rebooked', newEntry.id);

    // Notify cashier & customer of confirmed priority rebooking
    try {
      await Promise.all([
        notificationService.notifyCashierEmergencyRebookAccepted(newEntry, replacementBarber.name || slot.barberName),
        notificationService.notifyReservationConfirmed(newEntry),
      ]);
    } catch (err) {
      logger.warn('[EmergencyCancellation] Failed sending rebooking confirmation notifications:', err);
    }

    logger.info('[EmergencyCancellation] Customer rebooked successfully with auto-approval', {
      originalQueueId: queueId,
      newQueueId: newEntry.id,
      customerId,
      slot: { ...slot, barberId: replacementBarberId, barberName: replacementBarber.name || slot.barberName },
    });

    return newEntry;
  }

  /**
   * Declines emergency rebooking options and confirms cancellation.
   */
  async declineRebooking(
    customerId: number,
    queueId: number
  ): Promise<{ success: boolean; message: string }> {
    const existing = await queueRepository.findById(queueId);
    if (!existing || existing.customer_id !== customerId) {
      throw new AppError('Emergency cancellation record not found.', 404);
    }
    if (existing.rebooking_status !== 'pending_action') {
      throw new AppError('This emergency cancellation notice has already been processed.', 409);
    }

    await queueRepository.updateEmergencyRebookingStatus(queueId, 'declined');

    // Notify cashiers that customer declined the automated rebooking
    try {
      await notificationService.notifyCashierEmergencyRebookRejected(existing);
    } catch (err) {
      logger.warn('[EmergencyCancellation] Failed sending decline notification to cashier:', err);
    }

    logger.info('[EmergencyCancellation] Customer declined emergency rebooking', {
      queueId,
      customerId,
    });

    return {
      success: true,
      message: 'Your cancellation has been confirmed and acknowledged.',
    };
  }

  /**
   * Internal helper to calculate pre-approved available rebooking slots.
   * - Honors the customer's intended target date & time (e.g. 10:00 AM on original date).
   * - Offers the exact matching time (or nearest adjacent slot: 10:15 AM, 10:30 AM) on available barbers.
   * - No artificial 2-hour advance barrier on emergency re-allocations (only filters slots already in past).
   * - Strictly enforces shop working hours (9:00 AM - 8:30 PM) and excludes unavailable/cancelled barbers.
   */
  private async generatePreApprovedRebookSlots(
    branchId: number,
    serviceIds: number[],
    originalDate?: string,
    originalTime?: string,
    cancelledBarberId?: number
  ): Promise<RebookSlotOption[]> {
    const SHOP_OPEN_MINUTES = 9 * 60; // 9:00 AM (540)
    const SHOP_CLOSE_MINUTES = 20 * 60 + 30; // 8:30 PM (1230)

    const allBarbers = await barberRepository.findActiveBarbersByBranch(String(branchId));
    const excludedBarberId = Number(cancelledBarberId || 0);
    const eligibleBarbers = allBarbers.filter(b => {
      const candidateBarberId = Number(b?.barber_id ?? b?.id ?? 0);
      if (!candidateBarberId || candidateBarberId === excludedBarberId) return false;
      const st = (b.status || '').toLowerCase().trim();
      if (st && st !== 'available' && st !== 'active') return false;
      return true;
    });

    if (eligibleBarbers.length === 0) {
      return [];
    }

    const origMinutes = originalTime ? timeToMinutes(originalTime) : SHOP_OPEN_MINUTES;

    const now = new Date();
    // Get current Manila time in minutes
    const manilaParts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    }).formatToParts(now);

    const getPart = (type: string) => Number(manilaParts.find(p => p.type === type)?.value || 0);
    const manilaHour = getPart('hour') === 24 ? 0 : getPart('hour');
    const manilaMinute = getPart('minute');
    const manilaNowMinutes = manilaHour * 60 + manilaMinute;

    const getManilaDateString = (offsetDays: number = 0): string => {
      const d = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
      if (offsetDays > 0) {
        d.setDate(d.getDate() + offsetDays);
      }
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    };

    const targetDateStr = originalDate
      ? (typeof originalDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(originalDate)
          ? originalDate.slice(0, 10)
          : new Date(originalDate).toISOString().slice(0, 10))
      : getManilaDateString(0);

    const datesSet = new Set<string>();
    datesSet.add(targetDateStr);
    datesSet.add(getManilaDateString(0));
    datesSet.add(getManilaDateString(1));
    datesSet.add(getManilaDateString(2));
    const candidateDates = Array.from(datesSet);

    const collectedSlots: Array<RebookSlotOption & { score: number }> = [];

    for (const dateStr of candidateDates) {
      const isToday = dateStr === getManilaDateString(0);

      for (const barber of eligibleBarbers) {
        try {
          const availability = await queueService.getAvailability(
            barber.barber_id,
            branchId,
            dateStr,
            serviceIds
          );
          const availableSlots = availability.availableSlots || [];

          for (const slot of availableSlots) {
            const slotMinutes = timeToMinutes(slot.hour);
            // Must strictly be within shop working hours (9:00 AM - 8:30 PM)
            if (slotMinutes < SHOP_OPEN_MINUTES || slotMinutes > SHOP_CLOSE_MINUTES) {
              continue;
            }

            // Only filter out slots that have already passed in real-time
            if (isToday && slotMinutes <= manilaNowMinutes + 5) {
              continue;
            }

            const [timeStr, modifier] = slot.hour.split(' ');
            let [hours, minutes] = timeStr.split(':').map(Number);
            if (modifier === 'PM' && hours < 12) hours += 12;
            if (modifier === 'AM' && hours === 12) hours = 0;

            const [yr, mo, dy] = dateStr.split('-').map(Number);
            const slotDate = new Date(Date.UTC(yr, mo - 1, dy, hours - 8, minutes || 0, 0));

            // Proximity scoring to original intended appointment time
            const diffMinutes = Math.abs(slotMinutes - origMinutes);
            let score = 2000 - diffMinutes * 2;

            // Highest priority: Customer's original appointment date
            if (dateStr === targetDateStr) {
              score += 1000;
            } else {
              score -= 200;
            }

            // Exact match bonus
            if (slotMinutes === origMinutes) {
              score += 200;
            }

            collectedSlots.push({
              barberId: barber.barber_id,
              barberName: barber.name,
              date: dateStr,
              time: slot.hour,
              scheduledStartAt: slotDate.toISOString(),
              arrivalDeadlineAt: new Date(slotDate.getTime() - 10 * 60 * 1000).toISOString(),
              score,
            });
          }
        } catch (err) {
          // Skip if availability check fails
        }
      }
    }

    collectedSlots.sort((a, b) => b.score - a.score);

    const finalSlots: RebookSlotOption[] = [];
    const seen = new Set<string>();

    for (const s of collectedSlots) {
      const key = `${s.date}-${s.time}-${s.barberId}`;
      if (!seen.has(key)) {
        seen.add(key);
        const { score: _score, ...slotData } = s;
        finalSlots.push(slotData);
        if (finalSlots.length >= 4) break;
      }
    }

    return finalSlots;
  }

}

export const emergencyCancellationService = new EmergencyCancellationService();

