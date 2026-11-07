import db from '../db';

export type StaffScheduleRole = 'Barber' | 'Cashier';
export type StaffScheduleSource = 'owner' | 'auto_fill' | 'request';

export type StaffShiftAssignmentRow = {
    staff_shift_assignment_id: number;
    user_id: string;
    staff_name: string;
    role: StaffScheduleRole;
    shift_date: string;
    start_time: string | null;
    end_time: string | null;
    is_off: boolean;
    is_online_booking_enabled?: boolean;
    source: StaffScheduleSource;
    year: number;
    month: number;
    profile_picture?: string | null;
};

export type PublicBarberScheduleAssignmentRow = Pick<
    StaffShiftAssignmentRow,
    'user_id' | 'shift_date' | 'start_time' | 'end_time' | 'is_off'
> & {
    is_online_booking_enabled: boolean;
};

export type ScheduleStaffRow = {
    user_id: string;
    name: string;
    role: StaffScheduleRole;
    profile_picture?: string | null;
};

export type UpsertAssignmentInput = {
    userId: string;
    role: StaffScheduleRole;
    shiftDate: string;
    startTime: string | null;
    endTime: string | null;
    isOff: boolean;
    isOnlineBookingEnabled?: boolean;
    source: StaffScheduleSource;
    year: number;
    month: number;
};

const TIME_SQL = `to_char(a.start_time, 'HH24:MI')`;
const END_TIME_SQL = `to_char(a.end_time, 'HH24:MI')`;

export class StaffScheduleRepository {
    async listSchedulableStaff(branchId?: number): Promise<ScheduleStaffRow[]> {
        const params: any[] = [];
        const branchClause = branchId
            ? (() => {
                params.push(branchId);
                return `AND (u.branch_id = $${params.length} OR u.branch_id IS NULL)`;
            })()
            : '';

        const result = await db.query(
            `SELECT
                u.user_id,
                COALESCE(b.name, u.username, u.email, 'Staff Member') AS name,
                u.role::text AS role,
                u.profile_picture
             FROM users u
             LEFT JOIN barbers b ON b.user_id = u.user_id
             WHERE u.role::text IN ('Barber', 'Cashier')
               AND u.deleted_at IS NULL
               ${branchClause}
             ORDER BY
               CASE WHEN u.role::text = 'Barber' THEN 1 ELSE 2 END,
               name ASC`,
            params,
        );
        return result.rows;
    }

    async listAssignments(year: number, month: number, branchId?: number): Promise<StaffShiftAssignmentRow[]> {
        const params: any[] = [year, month];
        const branchClause = branchId
            ? (() => {
                params.push(branchId);
                return `AND (u.branch_id = $${params.length} OR u.branch_id IS NULL)`;
            })()
            : '';

        const result = await db.query(
            `SELECT
                a.staff_shift_assignment_id,
                a.user_id,
                COALESCE(b.name, u.username, u.email, 'Staff Member') AS staff_name,
                a.role,
                to_char(a.shift_date, 'YYYY-MM-DD') AS shift_date,
                ${TIME_SQL} AS start_time,
                ${END_TIME_SQL} AS end_time,
                a.is_off,
                COALESCE(a.is_online_booking_enabled, FALSE) AS is_online_booking_enabled,
                a.source,
                a.year,
                a.month,
                u.profile_picture
             FROM staff_shift_assignments a
             JOIN users u ON u.user_id = a.user_id
             LEFT JOIN barbers b ON b.user_id = a.user_id
             WHERE a.year = $1 AND a.month = $2
               ${branchClause}
             ORDER BY a.shift_date ASC, staff_name ASC`,
            params,
        );
        return result.rows;
    }

    async listAssignmentsInRange(fromDate: string, toDate: string, userId?: string, branchId?: number): Promise<StaffShiftAssignmentRow[]> {
        const params: any[] = [fromDate, toDate, userId ?? null];
        const branchClause = branchId == null ? '' : (() => {
            params.push(branchId);
            return `AND (u.branch_id = $${params.length} OR u.branch_id IS NULL)`;
        })();
        const result = await db.query(
            `SELECT
                a.staff_shift_assignment_id,
                a.user_id,
                COALESCE(b.name, u.username, u.email, 'Staff Member') AS staff_name,
                a.role,
                to_char(a.shift_date, 'YYYY-MM-DD') AS shift_date,
                ${TIME_SQL} AS start_time,
                ${END_TIME_SQL} AS end_time,
                a.is_off,
                COALESCE(a.is_online_booking_enabled, FALSE) AS is_online_booking_enabled,
                a.source,
                a.year,
                a.month,
                u.profile_picture
             FROM staff_shift_assignments a
             JOIN users u ON u.user_id = a.user_id
             LEFT JOIN barbers b ON b.user_id = a.user_id
             WHERE a.shift_date >= $1::date
               AND a.shift_date <= $2::date
                AND ($3::uuid IS NULL OR a.user_id = $3::uuid)
                ${branchClause}
             ORDER BY a.shift_date ASC, staff_name ASC`,
             params,
        );
        return result.rows;
    }

    async listPublicBarberAssignmentsInRange(
        fromDate: string,
        toDate: string,
        userIds: string[],
        branchId: number,
    ): Promise<PublicBarberScheduleAssignmentRow[]> {
        if (userIds.length === 0) return [];

        const result = await db.query(
            `SELECT
                a.user_id,
                to_char(a.shift_date, 'YYYY-MM-DD') AS shift_date,
                ${TIME_SQL} AS start_time,
                ${END_TIME_SQL} AS end_time,
                a.is_off,
                COALESCE(a.is_online_booking_enabled, FALSE) AS is_online_booking_enabled
             FROM staff_shift_assignments a
             JOIN users u ON u.user_id = a.user_id
             WHERE a.shift_date >= $1::date
               AND a.shift_date <= $2::date
               AND a.user_id = ANY($3::uuid[])
               AND (u.branch_id = $4 OR u.branch_id IS NULL)
             ORDER BY a.shift_date ASC, a.user_id ASC`,
            [fromDate, toDate, userIds, branchId],
        );
        return result.rows;
    }

    async getAssignment(userId: string, shiftDate: string): Promise<StaffShiftAssignmentRow | null> {
        const result = await db.query(
            `SELECT
                a.staff_shift_assignment_id,
                a.user_id,
                COALESCE(b.name, u.username, u.email, 'Staff Member') AS staff_name,
                a.role,
                to_char(a.shift_date, 'YYYY-MM-DD') AS shift_date,
                ${TIME_SQL} AS start_time,
                ${END_TIME_SQL} AS end_time,
                a.is_off,
                COALESCE(a.is_online_booking_enabled, FALSE) AS is_online_booking_enabled,
                a.source,
                a.year,
                a.month,
                u.profile_picture
             FROM staff_shift_assignments a
             JOIN users u ON u.user_id = a.user_id
             LEFT JOIN barbers b ON b.user_id = a.user_id
             WHERE a.user_id = $1 AND a.shift_date = $2::date`,
            [userId, shiftDate],
        );
        return result.rows[0] || null;
    }

    async findUserByName(name: string): Promise<{ user_id: string; role: StaffScheduleRole; name: string } | null> {
        const result = await db.query(
            `SELECT
                u.user_id,
                u.role::text AS role,
                COALESCE(b.name, u.username, u.email, 'Staff Member') AS name
             FROM users u
             LEFT JOIN barbers b ON b.user_id = u.user_id
             WHERE u.deleted_at IS NULL
               AND u.role::text IN ('Barber', 'Cashier')
               AND (
                 LOWER(COALESCE(b.name, '')) = LOWER($1)
                 OR LOWER(u.username) = LOWER($1)
                 OR LOWER(COALESCE(u.email, '')) = LOWER($1)
               )
             LIMIT 1`,
            [name.trim()],
        );
        return result.rows[0] || null;
    }

    async upsertAssignments(rows: UpsertAssignmentInput[]): Promise<void> {
        if (rows.length === 0) return;

        const values: any[] = [];
        const tuples = rows.map((row, index) => {
            const offset = index * 10;
            values.push(
                row.userId,
                row.role,
                row.shiftDate,
                row.isOff ? null : row.startTime,
                row.isOff ? null : row.endTime,
                row.isOff,
                Boolean(row.isOnlineBookingEnabled && !row.isOff),
                row.source,
                row.year,
                row.month,
            );
            return `($${offset + 1}::uuid, $${offset + 2}, $${offset + 3}::date, $${offset + 4}::time, $${offset + 5}::time, $${offset + 6}::boolean, $${offset + 7}::boolean, $${offset + 8}, $${offset + 9}::int, $${offset + 10}::int)`;
        });

        await db.query(
            `INSERT INTO staff_shift_assignments
                (user_id, role, shift_date, start_time, end_time, is_off, is_online_booking_enabled, source, year, month)
             VALUES ${tuples.join(', ')}
             ON CONFLICT (user_id, shift_date) DO UPDATE SET
                role = EXCLUDED.role,
                start_time = EXCLUDED.start_time,
                end_time = EXCLUDED.end_time,
                is_off = EXCLUDED.is_off,
                is_online_booking_enabled = EXCLUDED.is_online_booking_enabled,
                source = EXCLUDED.source,
                year = EXCLUDED.year,
                month = EXCLUDED.month,
                updated_at = NOW()`,
            values,
        );
    }
}

export const staffScheduleRepository = new StaffScheduleRepository();
