import { api } from '@/config/api';

export type StaffScheduleRole = 'Barber' | 'Cashier';

export type StaffScheduleAssignment = {
    id?: number;
    userId: string;
    staffName?: string;
    role: StaffScheduleRole;
    shiftDate: string;
    startTime: string | null;
    endTime: string | null;
    isOff: boolean;
    isOnlineBookingEnabled?: boolean;
    source?: string;
    profile_picture?: string | null;
};

export type StaffScheduleMember = {
    userId: string;
    name: string;
    role: StaffScheduleRole;
    profile_picture?: string | null;
};

export type MonthRoster = {
    year: number;
    month: number;
    daysInMonth: number;
    staff: StaffScheduleMember[];
    assignments: StaffScheduleAssignment[];
    isComplete: boolean;
    autoFilledMonths?: number[];
};

export const staffScheduleService = {
    async getMonthRoster(year: number, month: number): Promise<MonthRoster> {
        const response = await api.get<MonthRoster>('/api/admin/staff-schedules', {
            params: { year, month },
        });
        return response.data;
    },

    async saveMonthRoster(year: number, month: number, assignments: StaffScheduleAssignment[]): Promise<MonthRoster> {
        const response = await api.put<MonthRoster>('/api/admin/staff-schedules', {
            year,
            month,
            assignments,
        });
        return response.data;
    },
};
