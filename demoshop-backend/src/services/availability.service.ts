import { queueRepository } from '../repositories/queue.repository';
import { barberRepository } from '../repositories/barber.repository';
import { staffScheduleService } from './staff-schedule.service';
import {
  timeToMinutes,
  formatBusyPeriods,
  formatQueueToAppointments,
} from '../utils/queue/availability.util';
import { reservationTimeToEpoch } from '../utils/queue/reservation-time.util';
import { AppError } from '../utils/error/AppError';

const SHOP_CLOSE_MINUTES = 21 * 60; // 9:00 PM

export interface ContiguousBlockCheckParams {
  client?: any;
  barberId: number;
  branchId: number;
  date: string;
  startTime: string;
  totalDurationMinutes: number;
  excludedQueueId?: number;
}

export interface ParallelCapacityCheckParams {
  branchId: number;
  date: string;
  startTime: string;
  groupSize: number;
  durationMinutes?: number;
}

export class AvailabilityService {
  /**
   * Computes the total duration for multiple guests assigned to a barber.
   */
  computeGroupDuration(guests: Array<{ durationMinutes?: number; duration_minutes?: number }>): number {
    return guests.reduce((sum, g) => sum + (Number(g.durationMinutes ?? g.duration_minutes) || 30), 0);
  }

  /**
   * Verifies that a specific barber has a contiguous, uninterrupted open window
   * from startTime to startTime + totalDurationMinutes on the specified date.
   */
  async verifyContiguousBarberBlock(params: ContiguousBlockCheckParams): Promise<{
    isAvailable: boolean;
    conflictReason?: string;
  }> {
    const { client, barberId, branchId, date, startTime, totalDurationMinutes, excludedQueueId = 0 } = params;

    const startMinutes = timeToMinutes(startTime);
    const endMinutes = startMinutes + totalDurationMinutes;

    if (endMinutes > SHOP_CLOSE_MINUTES) {
      return {
        isAvailable: false,
        conflictReason: 'The requested group service duration extends past the shop closing time (9:00 PM).',
      };
    }

    const scheduledStartEpoch = reservationTimeToEpoch(date, startTime);
    const scheduledStartAt = scheduledStartEpoch !== null ? new Date(scheduledStartEpoch).toISOString() : null;

    if (!scheduledStartAt) {
      return {
        isAvailable: false,
        conflictReason: 'Invalid start time or date for appointment.',
      };
    }

    if (client) {
      const conflicts = await queueRepository.findBarberIntervalConflictsForUpdate(
        client,
        barberId,
        branchId,
        scheduledStartAt,
        totalDurationMinutes,
        excludedQueueId,
      );

      if (conflicts && conflicts.length > 0) {
        return {
          isAvailable: false,
          conflictReason: 'The shared barber does not have enough continuous open time to service consecutive guests in the group.',
        };
      }
    } else {
      // Out-of-transaction read verification
      const [queueEntries, acceptedReservations] = await Promise.all([
        queueRepository.findActiveByBarber(barberId, branchId, date),
        queueRepository.findAcceptedReservationsForAvailability(barberId, branchId, date),
      ]);

      const allAppointments = formatQueueToAppointments([...queueEntries, ...acceptedReservations]);
      const hasConflict = allAppointments.some((appt) => {
        const apptStart = timeToMinutes(appt.startTime);
        const apptEnd = apptStart + (appt.durationMinutes || 30);
        return startMinutes < apptEnd && apptStart < endMinutes;
      });

      if (hasConflict) {
        return {
          isAvailable: false,
          conflictReason: 'The shared barber does not have enough continuous open time to service consecutive guests in the group.',
        };
      }
    }

    return { isAvailable: true };
  }

  /**
   * For parallel ("Any Available Barber") group bookings:
   * Verifies that at least N distinct active online barbers are unbooked and free at startTime.
   */
  async verifyParallelBarberCapacity(params: ParallelCapacityCheckParams): Promise<{
    isAvailable: boolean;
    availableBarberIds: number[];
    totalAvailable: number;
    requiredCount: number;
  }> {
    const { branchId, date, startTime, groupSize, durationMinutes = 30 } = params;
    const startMinutes = timeToMinutes(startTime);
    const endMinutes = startMinutes + durationMinutes;

    const branchBarbers = await barberRepository.findActiveBarbersByBranch(String(branchId));
    const scheduleByBarber = await staffScheduleService.getCashierBarberAvailability(
      branchBarbers,
      branchId,
      date,
      { publicBookingSemantics: true },
    );

    const eligibleBarbers = branchBarbers.filter((barber: any) => {
      const sched = scheduleByBarber.get(Number(barber.barber_id));
      const isOnDuty = sched ? sched.isOnDutyToday : (barber.isOnDutyToday ?? !barber.is_off_today);
      const isOnlineBookingEnabled = sched
        ? sched.isOnlineBookingEnabledToday
        : (barber.isOnlineBookingEnabledToday ?? barber.is_online_booking_enabled ?? true);
      return Boolean(isOnDuty && isOnlineBookingEnabled);
    });

    const availableBarberIds: number[] = [];

    await Promise.all(
      eligibleBarbers.map(async (barber: any) => {
        const barberId = Number(barber.barber_id);
        const [queueEntries, acceptedReservations] = await Promise.all([
          queueRepository.findActiveByBarber(barberId, branchId, date),
          queueRepository.findAcceptedReservationsForAvailability(barberId, branchId, date),
        ]);

        const appointments = formatQueueToAppointments([...queueEntries, ...acceptedReservations]);
        const hasConflict = appointments.some((appt) => {
          const apptStart = timeToMinutes(appt.startTime);
          const apptEnd = apptStart + (appt.durationMinutes || 30);
          return startMinutes < apptEnd && apptStart < endMinutes;
        });

        if (!hasConflict) {
          availableBarberIds.push(barberId);
        }
      }),
    );

    const totalAvailable = availableBarberIds.length;
    const isAvailable = totalAvailable >= groupSize;

    return {
      isAvailable,
      availableBarberIds,
      totalAvailable,
      requiredCount: groupSize,
    };
  }

  /**
   * Detects whether a specific barber is occupied at a given slot by a sequential
   * group booking or existing appointment, and identifies available peer barbers.
   */
  async getBarberOccupiedWindow(params: {
    barberId: number;
    branchId: number;
    date: string;
    time: string;
    durationMinutes?: number;
  }): Promise<{
    isOccupied: boolean;
    occupiedUntil?: string;
    peerAvailableBarbers: Array<{ id: number; name: string }>;
  }> {
    const { barberId, branchId, date, time, durationMinutes = 30 } = params;
    const slotStart = timeToMinutes(time);
    const slotEnd = slotStart + durationMinutes;

    const [queueEntries, acceptedReservations] = await Promise.all([
      queueRepository.findActiveByBarber(barberId, branchId, date),
      queueRepository.findAcceptedReservationsForAvailability(barberId, branchId, date),
    ]);

    const appointments = formatQueueToAppointments([...queueEntries, ...acceptedReservations]);
    const busyPeriods = formatBusyPeriods(appointments);

    const blockingPeriod = busyPeriods.find((bp) => {
      const bpStart = timeToMinutes(bp.startTime);
      const bpEnd = timeToMinutes(bp.endTime);
      return slotStart < bpEnd && bpStart < slotEnd;
    });

    const isOccupied = Boolean(blockingPeriod);
    const peerAvailableBarbers: Array<{ id: number; name: string }> = [];

    if (isOccupied) {
      const capacityCheck = await this.verifyParallelBarberCapacity({
        branchId,
        date,
        startTime: time,
        groupSize: 1,
        durationMinutes,
      });

      const peerIds = capacityCheck.availableBarberIds.filter((id) => id !== barberId);
      const branchBarbers = await barberRepository.findActiveBarbersByBranch(String(branchId));

      for (const peerId of peerIds) {
        const found = branchBarbers.find((b: any) => Number(b.barber_id) === peerId);
        if (found) {
          peerAvailableBarbers.push({ id: peerId, name: found.name });
        }
      }
    }

    return {
      isOccupied,
      occupiedUntil: blockingPeriod?.endTime,
      peerAvailableBarbers,
    };
  }
}

export const availabilityService = new AvailabilityService();
