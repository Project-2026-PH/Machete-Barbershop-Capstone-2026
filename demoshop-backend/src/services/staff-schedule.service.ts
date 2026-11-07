import { AppError } from '../utils/error/AppError';
import { logSecurityEvent } from './audit.service';
import logger from '../utils/general/logger';
import { barberRepository } from '../repositories/barber.repository';
import { getManilaNow } from '../utils/queue/availability.util';
import { isBarberOnBreak } from '../utils/queue/sect.util';
import {
    deleteCachePattern,
    getCache,
    setCache,
} from '../redis';
import {
    staffScheduleRepository,
    type PublicBarberScheduleAssignmentRow,
    type StaffScheduleRole,
    type StaffShiftAssignmentRow,
    type UpsertAssignmentInput,
} from '../repositories/staff-schedule.repository';

export type AssignmentPayload = {
    userId: string;
    role: StaffScheduleRole;
    shiftDate: string;
    startTime?: string | null;
    endTime?: string | null;
    isOff: boolean;
    isOnlineBookingEnabled?: boolean;
};

const pad = (value: number) => String(value).padStart(2, '0');

export const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

export const toIsoDate = (year: number, month: number, day: number) =>
    `${year}-${pad(month)}-${pad(day)}`;

export const weekdayUtc = (isoDate: string) => {
    const [year, month, day] = isoDate.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
};

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const validateDateRange = (fromDate: string, toDate: string): void => {
    if (!ISO_DATE_PATTERN.test(fromDate) || !ISO_DATE_PATTERN.test(toDate)) {
        throw new AppError('Dates must use YYYY-MM-DD format.', 400);
    }
    const from = new Date(`${fromDate}T12:00:00Z`);
    const to = new Date(`${toDate}T12:00:00Z`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || fromDate !== from.toISOString().slice(0, 10) || toDate !== to.toISOString().slice(0, 10)) {
        throw new AppError('Dates must be valid calendar dates.', 400);
    }
    const diffDays = Math.round((to.getTime() - from.getTime()) / 86_400_000);
    if (diffDays < 0) throw new AppError('endDate cannot be before startDate.', 400);
    if (diffDays > 30) throw new AppError('Date range cannot exceed 31 days.', 400);
};

const monthDateRange = (year: number, month: number): [string, string] => [
    toIsoDate(year, month, 1),
    toIsoDate(year, month, daysInMonth(year, month)),
];

const normalizeTime = (value?: string | null) => {
    if (!value) return null;
    const trimmed = value.trim();
    if (!TIME_PATTERN.test(trimmed)) {
        throw new AppError('Shift times must use HH:MM (24-hour).', 400);
    }
    return trimmed;
};

const mapAssignment = (row: StaffShiftAssignmentRow) => ({
    id: row.staff_shift_assignment_id,
    userId: row.user_id,
    staffName: row.staff_name,
    role: row.role,
    shiftDate: row.shift_date,
    startTime: row.start_time,
    endTime: row.end_time,
    isOff: Boolean(row.is_off),
    isOnlineBookingEnabled: Boolean(row.is_online_booking_enabled),
    source: row.source,
    year: row.year,
    month: row.month,
    profile_picture: row.profile_picture || null,
});

const isMonthComplete = (
    staffIds: string[],
    assignments: StaffShiftAssignmentRow[],
    year: number,
    month: number,
) => {
    if (staffIds.length === 0) return false;
    const expected = staffIds.length * daysInMonth(year, month);
    const unique = new Set(assignments.map((row) => `${row.user_id}|${row.shift_date}`));
    return unique.size >= expected;
};

type ScheduleTemplateAssignmentRow = Pick<
    StaffShiftAssignmentRow,
    'user_id' | 'shift_date' | 'start_time' | 'end_time' | 'is_off'
>;

const weekdayTemplate = (assignments: ScheduleTemplateAssignmentRow[], userId: string, staffIndex: number = 0) => {
    const buckets = new Map<number, Map<string, { count: number; startTime: string | null; endTime: string | null; isOff: boolean }>>();
    assignments.filter((row) => row.user_id === userId).forEach((row) => {
        const day = weekdayUtc(row.shift_date);
        const key = `${row.is_off ? 'off' : 'on'}|${row.start_time || ''}|${row.end_time || ''}`;
        if (!buckets.has(day)) buckets.set(day, new Map());
        const current = buckets.get(day)!;
        const existing = current.get(key);
        if (existing) {
            existing.count += 1;
        } else {
            current.set(key, {
                count: 1,
                startTime: row.start_time,
                endTime: row.end_time,
                isOff: Boolean(row.is_off),
            });
        }
    });

    const defaultOffDay = Math.abs(staffIndex) % 7;
    const template: Record<number, { startTime: string | null; endTime: string | null; isOff: boolean }> = {};
    for (let day = 0; day <= 6; day += 1) {
        const options = [...(buckets.get(day)?.values() || [])].sort((left, right) => right.count - left.count);
        template[day] = options[0] || { startTime: '09:00', endTime: '21:00', isOff: day === defaultOffDay };
    }
    return template;
};

type PublicBarberSchedule = {
    barberId: number;
    barberName: string;
    offDutyDates: string[];
    onlineBookingDates: string[];
    recurringRestDays: number[];
    dateDetails: Record<string, { isOff: boolean; isOnDuty?: boolean; isOnlineBookingEnabled?: boolean; reason: string }>;
};

const buildPublicBarberSchedule = (
    barber: any,
    assignments: PublicBarberScheduleAssignmentRow[],
    monthAssignments: PublicBarberScheduleAssignmentRow[],
    approvedLeaves: any[],
    start: string,
    end: string,
    todayIso: string,
): PublicBarberSchedule => {
    const startDateObj = new Date(`${start}T12:00:00Z`);
    const endDateObj = new Date(`${end}T12:00:00Z`);
    const barberId = Number(barber.barber_id);
    const barberIndex = barberId % 7;
    const fallbackTemplate: Record<number, { startTime: string | null; endTime: string | null; isOff: boolean }> = {};
    for (let day = 0; day <= 6; day++) {
        fallbackTemplate[day] = { startTime: '09:00', endTime: '21:00', isOff: day === barberIndex };
    }

    const template = barber.user_id
        ? weekdayTemplate(monthAssignments, barber.user_id, barberIndex)
        : fallbackTemplate;
    const approvedLeaveDates = new Set(approvedLeaves.map((leave: any) => leave.shift_date));
    const assignmentMap = new Map(assignments.map((assignment) => [assignment.shift_date, assignment]));
    const recurringRestDays = Object.keys(template)
        .map(Number)
        .filter((day) => template[day]?.isOff);
    const rawStatus = String(barber.status || '').toLowerCase().trim();
    const isTodayOffDuty = ['leave', 'on leave', 'absent', 'suspended'].includes(rawStatus);
    const offDutyDates: string[] = [];
    const onlineBookingDates: string[] = [];
    const dateDetails: PublicBarberSchedule['dateDetails'] = {};

    for (let current = new Date(startDateObj); current <= endDateObj; current.setUTCDate(current.getUTCDate() + 1)) {
        const iso = current.toISOString().slice(0, 10);
        const dayOfWeek = weekdayUtc(iso);
        let isOff = false;
        let isOnDuty = true;
        let isOnlineBookingEnabled = false;
        let reason = '';

        if (iso === todayIso && isTodayOffDuty) {
            isOff = true;
            isOnDuty = false;
            reason = 'Off Duty Today';
        } else if (approvedLeaveDates.has(iso)) {
            isOff = true;
            isOnDuty = false;
            reason = 'Approved Leave';
        } else if (assignmentMap.has(iso)) {
            const assignment = assignmentMap.get(iso)!;
            if (assignment.is_off) {
                isOff = true;
                isOnDuty = false;
                reason = 'Scheduled Day Off';
            } else if (!assignment.start_time || !assignment.end_time) {
                isOff = true;
                isOnDuty = false;
                reason = 'No Shift Hours';
            } else if (!assignment.is_online_booking_enabled) {
                isOff = true;
                isOnDuty = true;
                reason = 'Online Booking Disabled';
            } else {
                isOnlineBookingEnabled = true;
                reason = 'Available';
            }
        } else if (template[dayOfWeek]?.isOff) {
            isOff = true;
            isOnDuty = false;
            reason = 'Recurring Rest Day';
        } else {
            isOff = true;
            isOnDuty = false;
            reason = 'Online Booking Disabled';
        }

        if (isOff) offDutyDates.push(iso);
        else onlineBookingDates.push(iso);
        dateDetails[iso] = { isOff, isOnDuty, isOnlineBookingEnabled, reason };
    }

    return { barberId, barberName: barber.name, offDutyDates, onlineBookingDates, recurringRestDays, dateDetails };
};

export class StaffScheduleService {
    async getMonthRoster(year: number, month: number, branchId?: number) {
        if (!Number.isInteger(year) || year < 2020 || year > 2100) {
            throw new AppError('A valid year is required.', 400);
        }
        if (!Number.isInteger(month) || month < 1 || month > 12) {
            throw new AppError('Month must be between 1 and 12.', 400);
        }

        const cacheKey = `schedule:roster:${branchId ?? 'all'}:${year}-${month}`;
        const cached = await getCache<any>(cacheKey);
        if (cached) return cached;
        const [staff, assignments] = await Promise.all([
            staffScheduleRepository.listSchedulableStaff(branchId),
            (() => {
                const [fromDate, toDate] = monthDateRange(year, month);
                validateDateRange(fromDate, toDate);
                return staffScheduleRepository.listAssignmentsInRange(fromDate, toDate, undefined, branchId);
            })(),
        ]);

        const result = {
            year,
            month,
            daysInMonth: daysInMonth(year, month),
            staff: staff.map((row) => ({
                userId: row.user_id,
                name: row.name,
                role: row.role,
                profile_picture: row.profile_picture || null,
            })),
            assignments: assignments.map(mapAssignment),
            isComplete: isMonthComplete(staff.map((row) => row.user_id), assignments, year, month),
        };
        await setCache(cacheKey, result, 60);
        return result;
    }

    async saveMonthRoster(
        year: number,
        month: number,
        assignments: AssignmentPayload[],
        actorId?: string | null,
        req?: any,
        branchId?: number,
    ) {
        if (!Array.isArray(assignments) || assignments.length === 0) {
            throw new AppError('At least one shift assignment is required.', 400);
        }

        const staff = await staffScheduleRepository.listSchedulableStaff(branchId);
        const staffById = new Map(staff.map((row) => [row.user_id, row]));

        // Validate max 3 barbers with online booking enabled per date
        const onlineBookingCountByDate = new Map<string, number>();
        assignments.forEach((assignment) => {
            if (!assignment.isOff && assignment.isOnlineBookingEnabled && assignment.role === 'Barber') {
                const count = (onlineBookingCountByDate.get(assignment.shiftDate) || 0) + 1;
                if (count > 3) {
                    throw new AppError(`Maximum of 3 barbers can accept online bookings for ${assignment.shiftDate}.`, 400);
                }
                onlineBookingCountByDate.set(assignment.shiftDate, count);
            }
        });

        const rows: UpsertAssignmentInput[] = assignments.map((assignment) => {
            const member = staffById.get(assignment.userId);
            if (!member) {
                throw new AppError('One or more staff members are not eligible for scheduling.', 400);
            }
            if (!/^\d{4}-\d{2}-\d{2}$/.test(assignment.shiftDate)) {
                throw new AppError('Each assignment needs a YYYY-MM-DD shift date.', 400);
            }
            const [assignYear, assignMonth] = assignment.shiftDate.split('-').map(Number);
            if (assignYear !== year || assignMonth !== month) {
                throw new AppError('All assignments must belong to the selected month.', 400);
            }
            const isOff = Boolean(assignment.isOff);
            const startTime = isOff ? null : normalizeTime(assignment.startTime);
            const endTime = isOff ? null : normalizeTime(assignment.endTime);
            if (!isOff && (!startTime || !endTime)) {
                throw new AppError('On-duty shifts require a start and end time.', 400);
            }
            return {
                userId: assignment.userId,
                role: member.role,
                shiftDate: assignment.shiftDate,
                startTime,
                endTime,
                isOff,
                isOnlineBookingEnabled: Boolean(assignment.isOnlineBookingEnabled && !isOff && member.role === 'Barber'),
                source: 'owner',
                year,
                month,
            };
        });

        await staffScheduleRepository.upsertAssignments(rows);
        await deleteCachePattern('schedule:*');

        const roster = await this.getMonthRoster(year, month, branchId);
        let autoFilledMonths: number[] = [];
        if (roster.isComplete) {
            autoFilledMonths = await this.autoFillRemainingMonths(year, month, branchId);
        }

        logSecurityEvent({
            userId: actorId || null,
            action: 'STAFF_SHIFT_ROSTER_SAVED',
            resource: 'shift_management',
            details: { year, month, assignment_count: rows.length, auto_filled_months: autoFilledMonths },
            req,
        });

        return { ...roster, autoFilledMonths };
    }

    async autoFillRemainingMonths(year: number, sourceMonth: number, branchId?: number) {
        const source = await this.getMonthRoster(year, sourceMonth, branchId);
        if (!source.isComplete) return [];

        const filled: number[] = [];
        for (let month = sourceMonth + 1; month <= 12; month += 1) {
            const existing = await staffScheduleRepository.listAssignments(year, month, branchId);
            const locked = new Set(
                existing
                    .filter((row) => row.source === 'owner' || row.source === 'request')
                    .map((row) => `${row.user_id}|${row.shift_date}`),
            );

            const rows: UpsertAssignmentInput[] = [];
            const lastDay = daysInMonth(year, month);
            source.staff.forEach((member: { userId: string; role: StaffScheduleRole }, memberIndex: number) => {
                const template = weekdayTemplate(
                    source.assignments.map((assignment: any) => ({
                        staff_shift_assignment_id: assignment.id,
                        user_id: assignment.userId,
                        staff_name: assignment.staffName,
                        role: assignment.role,
                        shift_date: assignment.shiftDate,
                        start_time: assignment.startTime,
                        end_time: assignment.endTime,
                        is_off: assignment.isOff,
                        source: assignment.source,
                        year: assignment.year,
                        month: assignment.month,
                    })),
                    member.userId,
                    memberIndex,
                );
                for (let day = 1; day <= lastDay; day += 1) {
                    const shiftDate = toIsoDate(year, month, day);
                    if (locked.has(`${member.userId}|${shiftDate}`)) continue;
                    const slot = template[weekdayUtc(shiftDate)];
                    rows.push({
                        userId: member.userId,
                        role: member.role,
                        shiftDate,
                        startTime: slot.isOff ? null : slot.startTime,
                        endTime: slot.isOff ? null : slot.endTime,
                        isOff: slot.isOff,
                        isOnlineBookingEnabled: false,
                        source: 'auto_fill',
                        year,
                        month,
                    });
                }
            });

            if (rows.length > 0) {
                await staffScheduleRepository.upsertAssignments(rows);
        await deleteCachePattern('schedule:*');
                filled.push(month);
            }
        }

        return filled;
    }

    async applyApprovedRequest(reviewed: {
        user_id?: string | null;
        request_type?: string;
        shift_date?: string;
        target_barber_name?: string | null;
        target_date?: string | null;
    }) {
        if (!reviewed.user_id || !reviewed.shift_date) return;

        try {
                const staff = await staffScheduleRepository.listSchedulableStaff();
            const requesterStaff = staff.find((row) => row.user_id === reviewed.user_id);
            if (!requesterStaff) return;

            const [year, month] = reviewed.shift_date.split('-').map(Number);
            const existing = await staffScheduleRepository.getAssignment(reviewed.user_id, reviewed.shift_date);

            if (reviewed.request_type === 'time_off') {
                await staffScheduleRepository.upsertAssignments([{
                    userId: reviewed.user_id,
                    role: requesterStaff.role,
                    shiftDate: reviewed.shift_date,
                    startTime: null,
                    endTime: null,
                    isOff: true,
                    source: 'request',
                    year,
                    month,
                }]);
                await deleteCachePattern('schedule:*');
                return;
            }

            if (reviewed.request_type === 'swap') {
                const partner = reviewed.target_barber_name
                    ? await staffScheduleRepository.findUserByName(reviewed.target_barber_name)
                    : null;
                const partnerDate = reviewed.target_date || reviewed.shift_date;
                const requesterSlot = existing || {
                    start_time: '09:00',
                    end_time: '21:00',
                    is_off: false,
                    role: requesterStaff.role,
                };
                const partnerSlot = partner
                    ? await staffScheduleRepository.getAssignment(partner.user_id, partnerDate)
                    : null;

                const rows: UpsertAssignmentInput[] = [{
                    userId: reviewed.user_id,
                    role: requesterStaff.role,
                    shiftDate: reviewed.shift_date,
                    startTime: partnerSlot?.is_off ? null : (partnerSlot?.start_time || requesterSlot.start_time),
                    endTime: partnerSlot?.is_off ? null : (partnerSlot?.end_time || requesterSlot.end_time),
                    isOff: partnerSlot ? Boolean(partnerSlot.is_off) : Boolean(requesterSlot.is_off),
                    source: 'request',
                    year,
                    month,
                }];

                if (partner) {
                    const [partnerYear, partnerMonth] = partnerDate.split('-').map(Number);
                    rows.push({
                        userId: partner.user_id,
                        role: partner.role,
                        shiftDate: partnerDate,
                        startTime: requesterSlot.is_off ? null : requesterSlot.start_time,
                        endTime: requesterSlot.is_off ? null : requesterSlot.end_time,
                        isOff: Boolean(requesterSlot.is_off),
                        source: 'request',
                        year: partnerYear,
                        month: partnerMonth,
                    });
                }

                await staffScheduleRepository.upsertAssignments(rows);
        await deleteCachePattern('schedule:*');
            }
        } catch (err: any) {
            logger.warn(`[StaffScheduleService] Could not apply approved request to roster: ${err?.message}`);
        }
    }

    async getMySchedule(userId: string, fromDate?: string, toDate?: string) {
        const today = new Date();
        const start = fromDate || toIsoDate(today.getUTCFullYear(), today.getUTCMonth() + 1, today.getUTCDate());
        const end = toDate || (() => { const d = new Date(`${start}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 6); return d.toISOString().slice(0, 10); })();
        validateDateRange(start, end);
        const cacheKey = `schedule:my:${userId}:${start}:${end}`;
        const cached = await getCache<any[]>(cacheKey);
        if (cached) return cached;
        const assignments = await staffScheduleRepository.listAssignmentsInRange(start, end, userId);
        const result = assignments.map(mapAssignment);
        await setCache(cacheKey, result, 60);
        return result;
    }

    /**
     * Builds today's availability for all branch barbers with bulk schedule
     * reads. This is intentionally narrower than the public booking schedule:
     * cashier needs current duty and walk-in state, not a separate schedule
     * query for every barber.
     */
    async getCashierBarberAvailability(
        barbers: Array<{ barber_id: number; user_id?: string | null; status?: string | null }>,
        branchId: number,
        targetDate = getManilaNow().todayISO,
        options: { publicBookingSemantics?: boolean } = {},
    ): Promise<Map<number, {
        isOffToday: boolean;
        isOnDutyToday: boolean;
        isOnlineBookingEnabledToday: boolean;
        isAvailableForWalkins: boolean;
        walkinStatus: string;
        scheduleReason: string | null;
    }>> {
        const [year, month] = targetDate.split('-').map(Number);
        const [monthStart, monthEnd] = monthDateRange(year, month);
        const [assignments, monthAssignments, approvedLeaves] = await Promise.all([
            staffScheduleRepository.listAssignmentsInRange(targetDate, targetDate, undefined, branchId),
            staffScheduleRepository.listAssignmentsInRange(monthStart, monthEnd, undefined, branchId),
            barberRepository.listApprovedLeavesInRangeForBranch(
                branchId,
                targetDate,
                targetDate,
                barbers.map((barber) => Number(barber.barber_id)),
            ),
        ]);

        const assignmentsByUser = new Map<string, StaffShiftAssignmentRow>();
        assignments.forEach((assignment) => assignmentsByUser.set(assignment.user_id, assignment));
        const leavesByBarber = new Set(approvedLeaves.map((leave: any) => Number(leave.barber_id)));

        return new Map(barbers.map((barber, index) => {
            const barberId = Number(barber.barber_id);
            const userId = barber.user_id || undefined;
            const assignment = userId ? assignmentsByUser.get(userId) : undefined;
            const template = userId
                ? weekdayTemplate(monthAssignments, userId, index)
                : weekdayTemplate([], String(barberId), barberId);
            const rawStatus = String(barber.status || '').toLowerCase().trim();
            // `Off Duty`/`Offline` can be derived from the current shift and
            // must not override an active assignment. Explicit absence,
            // approved leave, and suspension remain administrative blockers.
            const isTodayOffDuty = [
                'leave', 'on leave', 'absent', 'suspended',
            ].includes(rawStatus);

            let isOnDutyToday = true;
            let isOnlineBookingEnabledToday = false;
            let scheduleReason: string | null = null;

            if (isTodayOffDuty) {
                isOnDutyToday = false;
                scheduleReason = 'Off Duty Today';
            } else if (leavesByBarber.has(barberId)) {
                isOnDutyToday = false;
                scheduleReason = 'Approved Leave';
            } else if (assignment) {
                if (assignment.is_off) {
                    isOnDutyToday = false;
                    scheduleReason = 'Scheduled Day Off';
                } else if (!assignment.start_time || !assignment.end_time) {
                    isOnDutyToday = false;
                    scheduleReason = 'No Shift Hours';
                } else {
                    isOnlineBookingEnabledToday = Boolean(assignment.is_online_booking_enabled);
                    if (!isOnlineBookingEnabledToday) scheduleReason = 'Online Booking Disabled';
                }
            } else if (template[weekdayUtc(targetDate)]?.isOff) {
                isOnDutyToday = false;
                scheduleReason = 'Recurring Rest Day';
            } else if (options.publicBookingSemantics) {
                isOnDutyToday = false;
                scheduleReason = 'Online Booking Disabled';
            } else {
                scheduleReason = 'Online Booking Disabled';
            }

            const isOffToday = !isOnDutyToday;
            const isAvailableForWalkins = isOnDutyToday && !isBarberOnBreak(barber.status);
            const walkinStatus = isAvailableForWalkins
                ? 'Available for Walk-ins'
                : (scheduleReason || (isBarberOnBreak(barber.status) ? 'On Break' : barber.status) || 'Off Duty');

            return [barberId, {
                isOffToday,
                isOnDutyToday,
                isOnlineBookingEnabledToday,
                isAvailableForWalkins,
                walkinStatus,
                scheduleReason,
            }];
        }));
    }

    async getPublicBarberSchedules(branchId: number, fromDate: string, toDate: string): Promise<Record<string, PublicBarberSchedule>> {
        if (!Number.isInteger(branchId) || branchId <= 0) {
            throw new AppError('A valid branch is required.', 400);
        }
        validateDateRange(fromDate, toDate);

        const barbers = await barberRepository.findActiveBarbersForPublicSchedule(branchId);
        if (barbers.length === 0) return {};

        const [year, month] = fromDate.split('-').map(Number);
        const [monthStart, monthEnd] = monthDateRange(year, month);
        const barberIds = barbers.map((barber: any) => Number(barber.barber_id));
        const barberUserIds = barbers.flatMap((barber: any) =>
            typeof barber.user_id === 'string' ? [barber.user_id] : [],
        );
        const [assignments, monthAssignments, approvedLeaves] = await Promise.all([
            staffScheduleRepository.listPublicBarberAssignmentsInRange(fromDate, toDate, barberUserIds, branchId),
            staffScheduleRepository.listPublicBarberAssignmentsInRange(monthStart, monthEnd, barberUserIds, branchId),
            barberRepository.listApprovedLeavesInRangeForBranch(branchId, fromDate, toDate, barberIds),
        ]);
        const todayIso = getManilaNow().todayISO;
        const schedules: Record<string, PublicBarberSchedule> = {};

        for (const barber of barbers) {
            const barberId = Number(barber.barber_id);
            schedules[String(barberId)] = buildPublicBarberSchedule(
                barber,
                assignments.filter((assignment) => assignment.user_id === barber.user_id),
                monthAssignments,
                approvedLeaves.filter((leave: any) => Number(leave.barber_id) === barberId),
                fromDate,
                toDate,
                todayIso,
            );
        }

        return schedules;
    }

    /**
     * Public method to retrieve a barber's scheduled off-duty dates, approved leaves, and recurring rest days.
     */
    async getBarberSchedulePublic(barberId: number, fromDate?: string, toDate?: string): Promise<{
        barberId: number;
        barberName: string;
        offDutyDates: string[];
        onlineBookingDates: string[];
        recurringRestDays: number[];
        dateDetails: Record<string, { isOff: boolean; isOnDuty?: boolean; isOnlineBookingEnabled?: boolean; reason: string }>;
    }> {
        const barber = await barberRepository.findBarberById(barberId);
        if (!barber) {
            throw new AppError('Barber not found.', 404);
        }

        const todayIso = getManilaNow().todayISO;
        const start = fromDate || todayIso;
        const startParts = start.split('-').map(Number);
        const defaultEnd = (() => {
            const d = new Date(Date.UTC(startParts[0], startParts[1] - 1, startParts[2]));
            d.setUTCDate(d.getUTCDate() + 14);
            return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
        })();
        const end = toDate || defaultEnd;

        validateDateRange(start, end);
        const startDateObj = new Date(`${start}T12:00:00Z`);
        const endDateObj = new Date(`${end}T12:00:00Z`);
        if (endDateObj < startDateObj) {
            throw new AppError('endDate cannot be before startDate.', 400);
        }
        const diffDays = Math.round((endDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24));

        // Versioned so stale results from the previous status-first logic do
        // not keep marking scheduled barbers as off duty after deployment.
        const cacheKey = `schedule:public:v3:${barberId}:${start}:${end}`;
        const cached = await getCache<{
            barberId: number;
            barberName: string;
            offDutyDates: string[];
            onlineBookingDates: string[];
            recurringRestDays: number[];
            dateDetails: Record<string, { isOff: boolean; isOnDuty?: boolean; isOnlineBookingEnabled?: boolean; reason: string }>;
        }>(cacheKey);
        if (cached) return cached;

        const userId = barber.user_id;
        const [assignments, monthAssignments, approvedLeaves] = await Promise.all([
            userId
                ? staffScheduleRepository.listAssignmentsInRange(start, end, userId)
                : Promise.resolve([] as StaffShiftAssignmentRow[]),
            userId
                ? (() => {
                    const [year, month] = start.split('-').map(Number);
                    const [monthStart, monthEnd] = monthDateRange(year, month);
                    return staffScheduleRepository.listAssignmentsInRange(monthStart, monthEnd);
                })()
                : Promise.resolve([] as StaffShiftAssignmentRow[]),
            barberRepository.listApprovedLeavesInRange(barberId, start, end),
        ]);

        const barberIndex = barberId % 7;
        const defaultOffDay = barberIndex;
        const fallbackTemplate: Record<number, { startTime: string | null; endTime: string | null; isOff: boolean }> = {};
        for (let d = 0; d <= 6; d++) {
            fallbackTemplate[d] = { startTime: '09:00', endTime: '21:00', isOff: d === defaultOffDay };
        }

        const template = userId
            ? weekdayTemplate(monthAssignments, userId, barberIndex)
            : fallbackTemplate;

        const approvedLeaveDates = new Set(approvedLeaves.map((l: any) => l.shift_date));

        const assignmentMap = new Map<string, StaffShiftAssignmentRow>();
        assignments.forEach(a => assignmentMap.set(a.shift_date, a));

        const recurringRestDays: number[] = [];
        for (let day = 0; day <= 6; day++) {
            if (template[day]?.isOff) {
                recurringRestDays.push(day);
            }
        }

        const rawStatus = String(barber.status || '').toLowerCase().trim();
        const isTodayOffDuty = [
            // Live `Off Duty`/`Offline` values can be derived from the current
            // shift context. The date-specific schedule below is authoritative
            // for booking; only explicit absence/leave/suspension blocks today.
            'leave', 'on leave', 'absent', 'suspended'
        ].includes(rawStatus);

        const offDutyDates: string[] = [];
        const onlineBookingDates: string[] = [];
        const dateDetails: Record<string, { isOff: boolean; isOnDuty: boolean; isOnlineBookingEnabled: boolean; reason: string }> = {};

        let cur = new Date(`${start}T12:00:00Z`);

        while (cur <= endDateObj) {
            const iso = cur.toISOString().split('T')[0];
            const dayOfWeek = weekdayUtc(iso);
            let isOff = false;
            let isOnDuty = true;
            let isOnlineBookingEnabled = false;
            let reason = '';

            if (iso === todayIso && isTodayOffDuty) {
                isOff = true;
                isOnDuty = false;
                isOnlineBookingEnabled = false;
                reason = 'Off Duty Today';
            } else if (approvedLeaveDates.has(iso)) {
                isOff = true;
                isOnDuty = false;
                isOnlineBookingEnabled = false;
                reason = 'Approved Leave';
            } else if (assignmentMap.has(iso)) {
                const assignment = assignmentMap.get(iso)!;
                if (assignment.is_off) {
                    isOff = true;
                    isOnDuty = false;
                    isOnlineBookingEnabled = false;
                    reason = 'Scheduled Day Off';
                } else if (!assignment.start_time || !assignment.end_time) {
                    isOff = true;
                    isOnDuty = false;
                    isOnlineBookingEnabled = false;
                    reason = 'No Shift Hours';
                } else if (!assignment.is_online_booking_enabled) {
                    isOff = true;
                    isOnDuty = true;
                    isOnlineBookingEnabled = false;
                    reason = 'Online Booking Disabled';
                } else {
                    isOff = false;
                    isOnDuty = true;
                    isOnlineBookingEnabled = true;
                    reason = 'Available';
                }
            } else if (template[dayOfWeek]?.isOff) {
                isOff = true;
                isOnDuty = false;
                isOnlineBookingEnabled = false;
                reason = 'Recurring Rest Day';
            } else {
                isOff = true;
                isOnDuty = false;
                isOnlineBookingEnabled = false;
                reason = 'Online Booking Disabled';
            }

            if (isOff) {
                offDutyDates.push(iso);
            } else {
                onlineBookingDates.push(iso);
            }

            dateDetails[iso] = {
                isOff,
                isOnDuty,
                isOnlineBookingEnabled,
                reason,
            };

            cur.setDate(cur.getDate() + 1);
        }

        const result = {
            barberId,
            barberName: barber.name,
            offDutyDates,
            onlineBookingDates,
            recurringRestDays,
            dateDetails,
        };
        await setCache(cacheKey, result, 60);
        return result;
    }
}

export const staffScheduleService = new StaffScheduleService();
