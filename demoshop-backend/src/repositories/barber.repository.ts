import db from '../db';
import type { PoolClient } from 'pg';
import logger from '../utils/general/logger';
import { getManilaNow, timeToMinutes } from '../utils/queue/availability.util';

const UI_TO_DB_STATUS_MAP: Record<string, string> = {
    'Available': 'available',
    'Serving': 'serving',
    'Busy': 'busy',
    'On Break': 'on_break',
    'Break': 'on_break',
    'Absent': 'absent',
    'Leave': 'absent',
    'Suspended': 'suspended',
    'Offline': 'offline',
    'On Duty': 'available',
    'Off Duty': 'offline',
    'available': 'available',
    'serving': 'serving',
    'busy': 'busy',
    'on_break': 'on_break',
    'break': 'on_break',
    'absent': 'absent',
    'leave': 'absent',
    'suspended': 'suspended',
    'offline': 'offline',
    'on_duty': 'available',
    'off_duty': 'offline',
};

const DB_TO_UI_STATUS_MAP: Record<string, string> = {
    'available': 'On Duty',
    'serving': 'Serving',
    'busy': 'Serving',
    'on_break': 'On Break',
    'break': 'On Break',
    'offline': 'Offline',
    'absent': 'Absent',
    'leave': 'Absent',
    'suspended': 'Suspended',
    'Available': 'On Duty',
    'Serving': 'Serving',
    'On Break': 'On Break',
    'Absent': 'Absent',
    'Suspended': 'Suspended',
    'Offline': 'Offline',
    'On Duty': 'On Duty',
    'on_duty': 'On Duty',
    'Off Duty': 'Off Duty',
    'off_duty': 'Off Duty',
};

const normalizeStatusRow = (row: any) => {
    if (!row) return row;
    const rawStatus = (row.status || '').toString().trim().toLowerCase().replace(/\s+/g, '_');
    
    // Explicit administrative & break statuses take precedence
    if (row.is_suspended || rawStatus === 'suspended') {
        row.status = 'Suspended';
    } else if (rawStatus === 'on_break' || rawStatus === 'break') {
        row.status = 'On Break';
    } else if (rawStatus === 'absent' || rawStatus === 'leave') {
        row.status = 'Absent';
    } else if (rawStatus === 'offline') {
        row.status = 'Offline';
    } else if (rawStatus === 'day_off' || rawStatus === 'off_duty' || rawStatus === 'offduty') {
        row.status = 'Off Duty';
    } else if (row.shift_is_off === true) {
        row.status = 'Off Duty';
    } else if (row.shift_start_time && row.shift_end_time) {
        const startMinutes = timeToMinutes(row.shift_start_time);
        const endMinutes = timeToMinutes(row.shift_end_time);
        const { currentMinutes } = getManilaNow();

        const isWithinShift = endMinutes >= startMinutes
            ? (currentMinutes >= startMinutes && currentMinutes <= endMinutes)
            : (currentMinutes >= startMinutes || currentMinutes <= endMinutes);

        row.status = isWithinShift ? 'On Duty' : 'Off Duty';
    } else if (!row.shift_start_time && !row.shift_end_time && rawStatus === 'available') {
        row.status = 'Off Duty';
    } else if (rawStatus === 'on_duty' || rawStatus === 'onduty' || rawStatus === 'available') {
        row.status = 'On Duty';
    } else if (rawStatus === 'serving' || rawStatus === 'busy') {
        row.status = 'Serving';
    } else {
        // Outside assigned shift hours or no scheduled shift today -> Off Duty
        row.status = 'Off Duty';
    }

    if (row.rating !== undefined) {
        row.rating = row.rating != null ? parseFloat(row.rating) : null;
    }
    if (row.review_count !== undefined) {
        row.review_count = parseInt(row.review_count || '0', 10);
    }
    if (row.specialties !== undefined) {
        row.specialties = Array.isArray(row.specialties) ? row.specialties : [];
    }
    if (row.total_services_completed !== undefined) {
        row.total_services_completed = parseInt(row.total_services_completed || '0', 10);
    }

    return row;
};

// In-memory fallback cache for shift requests if table is not yet created
const inMemoryShiftRequests: any[] = [];
let nextShiftRequestId = 1001;

export class BarberRepository {
    async findActiveBarbersForPublicSchedule(branchId: number): Promise<any[]> {
        const result = await db.query(
            `SELECT b.barber_id, b.name, COALESCE(b.status::text, 'available') AS status, b.user_id
             FROM barbers b
             JOIN users u ON u.user_id = b.user_id
             WHERE b.is_active = TRUE
               AND u.role::text = 'Barber'
               AND u.deleted_at IS NULL
               AND (u.branch_id = $1 OR u.branch_id IS NULL)
             ORDER BY b.barber_id ASC`,
            [branchId],
        );
        return result.rows;
    }

    /**
     * Returns active barbers assigned to a branch through their linked user,
     * ordered by current active queue load (Shortest Queue first).
     */
    async findActiveBarbersByBranch(branchId?: string): Promise<any[]> {
        const params: string[] = [];
        const conditions = [
            'b.is_active = TRUE',
            "u.role = 'Barber'",
            'u.deleted_at IS NULL',
        ];
        if (branchId) {
            params.push(branchId);
            conditions.push(`(u.branch_id = $${params.length} OR u.branch_id IS NULL)`);
        }

        // One row per completed service per queue entry. Multi-service bookings list
        // every service in queue_entry_services; test bookings are excluded.
        const completedServiceRows = `
            SELECT qe.id AS entry_id, qe.barber_id, COALESCE(qes.service_id, qe.service_id) AS service_id
            FROM queue_entries qe
            LEFT JOIN queue_entry_services qes ON qes.queue_entry_id = qe.id
            WHERE qe.status::text = 'completed'
              AND COALESCE(qe.is_test, FALSE) = FALSE
              AND COALESCE(qes.service_id, qe.service_id) IS NOT NULL`;
        const result = await db.query(
            `SELECT b.barber_id, b.name, COALESCE(b.status::text, 'available') AS status, b.break_started_at, b.is_active, b.user_id,
                    u.profile_picture,
                    b.bio,
                    COALESCE(q.active_count, 0) AS queue_count,
                    COALESCE(s.serving_count, 0) AS serving_count,
                    rt.avg_rating AS rating,
                    COALESCE(rt.review_count, 0) AS review_count,
                    COALESCE(cc.completed_count, 0) AS completed_services_count,
                    sig.signature_service,
                    COALESCE(svc.service_counts, '{}'::json) AS service_completed_counts,
                    COALESCE(sp.specialties, '[]'::json) AS specialties
             FROM barbers b
             JOIN users u ON b.user_id = u.user_id
             LEFT JOIN (
                 SELECT barber_id, COUNT(*)::int AS active_count
                 FROM queue_entries
                 WHERE status IN ('pending', 'accepted', 'waiting', 'serving')
                 GROUP BY barber_id
             ) q ON q.barber_id = b.barber_id
             LEFT JOIN (
                 SELECT barber_id, COUNT(*)::int AS serving_count
                 FROM queue_entries
                 WHERE status = 'serving'
                 GROUP BY barber_id
             ) s ON s.barber_id = b.barber_id
             LEFT JOIN (
                 SELECT barber_id,
                        ROUND(AVG(stars)::numeric, 1) AS avg_rating,
                        COUNT(*)::int AS review_count
                 FROM ratings
                 WHERE (COALESCE(is_test, FALSE) = FALSE OR COALESCE(is_public_test, TRUE) = TRUE)
                 GROUP BY barber_id
             ) rt ON rt.barber_id = b.barber_id
             LEFT JOIN (
                 SELECT barber_id, COUNT(DISTINCT entry_id)::int AS completed_count
                 FROM (${completedServiceRows}) cs
                 GROUP BY barber_id
             ) cc ON cc.barber_id = b.barber_id
             LEFT JOIN (
                 SELECT DISTINCT ON (ranked.barber_id) ranked.barber_id, ranked.title AS signature_service
                 FROM (
                     SELECT cs.barber_id, s.title, COUNT(*) AS cnt
                     FROM (${completedServiceRows}) cs
                     JOIN services s ON s.service_id = cs.service_id
                     GROUP BY cs.barber_id, s.title
                 ) ranked
                 ORDER BY ranked.barber_id, ranked.cnt DESC, ranked.title ASC
             ) sig ON sig.barber_id = b.barber_id
             LEFT JOIN (
                 SELECT barber_id, json_object_agg(service_id::text, cnt) AS service_counts
                 FROM (
                     SELECT cs.barber_id, cs.service_id, COUNT(*)::int AS cnt
                     FROM (${completedServiceRows}) cs
                     GROUP BY cs.barber_id, cs.service_id
                 ) per_service
                 GROUP BY barber_id
             ) svc ON svc.barber_id = b.barber_id
             LEFT JOIN (
                 SELECT bs.barber_id,
                        json_agg(s.title ORDER BY s.title ASC) AS specialties
                 FROM barber_specialties bs
                 JOIN services s ON s.service_id = bs.service_id
                 GROUP BY bs.barber_id
             ) sp ON sp.barber_id = b.barber_id
             WHERE ${conditions.join(' AND ')}
             ORDER BY queue_count ASC, b.barber_id ASC`,
            params
        );
        return result.rows.map(normalizeStatusRow);
    }

    /**
     * Finds barber record by barber_id.
     */
    async findBarberById(barberId: number): Promise<any | null> {
        const result = await db.query(
            `SELECT b.barber_id, b.name, COALESCE(b.status::text, 'available') AS status, b.break_started_at, b.is_active, b.user_id,
                    u.profile_picture
             FROM barbers b
             LEFT JOIN users u ON b.user_id = u.user_id
             WHERE b.barber_id = $1`,
            [barberId]
        );
        return normalizeStatusRow(result.rows[0]) || null;
    }


    /**
     * Finds barber record by linked user_id with username & active barber fallbacks.
     */
    async findBarberByUserId(userId: string): Promise<any | null> {
        // 1. Direct match on barbers.user_id
        const directRes = await db.query(
            `SELECT b.barber_id, b.name, COALESCE(b.status::text, 'available') AS status, b.break_started_at, b.is_active, b.user_id,
                    u.profile_picture
             FROM barbers b
             LEFT JOIN users u ON b.user_id = u.user_id
             WHERE b.user_id = $1`,
            [userId]
        );
        if (directRes.rows.length > 0) {
            return normalizeStatusRow(directRes.rows[0]);
        }

        // 2. Match by user's username or email in users table
        const userMatchRes = await db.query(
            `SELECT b.barber_id, b.name, COALESCE(b.status::text, 'available') AS status, b.break_started_at, b.is_active, b.user_id,
                    u.profile_picture
             FROM barbers b
             JOIN users u ON LOWER(u.username) = LOWER(b.name) 
                          OR LOWER(u.email) LIKE LOWER(CONCAT('%', b.name, '%'))
             WHERE u.user_id = $1`,
            [userId]
        );
        if (userMatchRes.rows.length > 0) {
            return normalizeStatusRow(userMatchRes.rows[0]);
        }

        // 3. Fallback: return the first active barber (for System Admin role switcher / testing)
        const fallbackRes = await db.query(
            `SELECT b.barber_id, b.name, COALESCE(b.status::text, 'available') AS status, b.is_active, b.user_id,
                    u.profile_picture
             FROM barbers b
             LEFT JOIN users u ON b.user_id = u.user_id
             WHERE b.is_active = TRUE
             ORDER BY b.barber_id ASC
             LIMIT 1`
        );
        return normalizeStatusRow(fallbackRes.rows[0]) || null;
    }

    /**
     * Searches customer history by customer name, mobile number, or guest reference code,
     * strictly scoped to customers served by the specified barber_id with pagination support.
     * Executes in a single SQL round-trip with PostgreSQL-level LIMIT / OFFSET and LATERAL visit aggregation.
     */
    async searchCustomerHistory(
        query: string,
        barberId?: number | null,
        page: number = 1,
        limit: number = 6
    ): Promise<{ data: any[]; total: number; page: number; limit: number; totalPages: number }> {
        const cleanQuery = query ? query.trim() : '';
        const searchPattern = `%${cleanQuery}%`;
        const validLimit = Math.max(1, limit);
        const validPage = Math.max(1, page);
        const offset = (validPage - 1) * validLimit;
        const targetBarberId = barberId ? Number(barberId) : null;

        // If no barber ID is resolved, strictly return empty history (no global fallback)
        if (!targetBarberId || targetBarberId <= 0) {
            return { data: [], total: 0, page: validPage, limit: validLimit, totalPages: 1 };
        }

        try {
            const res = await db.query(
                `WITH matched_customers AS (
                    -- Registered customers served by or queued with this barber
                    SELECT
                        c.customer_id,
                        NULL::bigint AS guest_profile_id,
                        CONCAT(c.first_name, ' ', c.last_name) AS name,
                        COALESCE(c.phone_number, 'N/A') AS mobile,
                        COALESCE(gp.guest_reference, CONCAT('CUST-', c.customer_id)) AS guest_ref,
                        c.email,
                        MAX(qe.created_at) AS last_created
                    FROM customers c
                    JOIN queue_entries qe ON qe.customer_id = c.customer_id
                    LEFT JOIN guest_profiles gp ON gp.linked_customer_id = c.customer_id
                    WHERE qe.barber_id = $1
                      AND (
                        $2 = '' OR (
                          c.first_name ILIKE $3
                          OR c.last_name ILIKE $3
                          OR CONCAT(c.first_name, ' ', c.last_name) ILIKE $3
                          OR c.phone_number ILIKE $3
                          OR gp.guest_reference ILIKE $3
                          OR qe.customer_name ILIKE $3
                        )
                      )
                    GROUP BY c.customer_id, c.first_name, c.last_name, c.phone_number, gp.guest_reference, c.email

                    UNION ALL

                    -- Guest walk-in profiles served by or queued with this barber
                    SELECT
                        NULL::int AS customer_id,
                        gp.guest_profile_id,
                        COALESCE(gp.normalized_name, MAX(qe.customer_name), 'Guest Customer') AS name,
                        'N/A'::text AS mobile,
                        COALESCE(gp.guest_reference, CONCAT('GUEST-', gp.guest_profile_id)) AS guest_ref,
                        NULL::text AS email,
                        MAX(qe.created_at) AS last_created
                    FROM guest_profiles gp
                    JOIN queue_entries qe ON qe.guest_profile_id = gp.guest_profile_id
                    WHERE qe.barber_id = $1
                      AND (
                        $2 = '' OR (
                          gp.normalized_name ILIKE $3
                          OR gp.guest_reference ILIKE $3
                          OR qe.customer_name ILIKE $3
                        )
                      )
                    GROUP BY gp.guest_profile_id, gp.normalized_name, gp.guest_reference
                ),
                paged_customers AS (
                    SELECT
                        mc.*,
                        COUNT(*) OVER()::int AS full_count
                    FROM matched_customers mc
                    ORDER BY mc.last_created DESC
                    LIMIT $4 OFFSET $5
                )
                SELECT
                    pc.customer_id,
                    pc.guest_profile_id,
                    pc.name,
                    pc.mobile,
                    pc.guest_ref,
                    pc.email,
                    pc.last_created,
                    pc.full_count,
                    COALESCE(v.visits, '[]'::jsonb) AS visits
                FROM paged_customers pc
                LEFT JOIN LATERAL (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'visit_id', qe.id,
                            'date', to_char(COALESCE(qe.preferred_date, qe.created_at) AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD'),
                            'time', to_char(COALESCE(qe.created_at) AT TIME ZONE 'Asia/Manila', 'HH12:MI AM'),
                            'created_at', qe.created_at,
                            'barber_name', COALESCE(b.name, 'DemoShop Barber'),
                            'service_name', COALESCE(s.title, 'Haircut & Styling'),
                            'status', qe.status,
                            'completed_photo', qe.haircut_photo_url,
                            'ref_photo', NULL,
                            'base', COALESCE(qe.base_style, 'Fade'),
                            'length', COALESCE(qe.haircut_length, 'Mid'),
                            'accent', COALESCE(qe.accent_style, 'Textured Crop'),
                            'specs_notes', COALESCE(qe.specs_notes, ''),
                            'add_on_preferences', '[]'::jsonb
                        )
                        ORDER BY qe.created_at DESC
                    ) AS visits
                    FROM (
                        SELECT qe.*
                        FROM queue_entries qe
                        WHERE (
                            (pc.customer_id IS NOT NULL AND qe.customer_id = pc.customer_id)
                            OR
                            (pc.guest_profile_id IS NOT NULL AND qe.guest_profile_id = pc.guest_profile_id)
                        )
                        AND qe.barber_id = $1
                        ORDER BY qe.created_at DESC
                        LIMIT 10
                    ) qe
                    LEFT JOIN barbers b ON qe.barber_id = b.barber_id
                    LEFT JOIN services s ON qe.service_id = s.service_id
                ) v ON TRUE
                ORDER BY pc.last_created DESC`,
                [targetBarberId, cleanQuery, searchPattern, validLimit, offset]
            );

            const total = res.rows.length > 0 ? (Number(res.rows[0].full_count) || 0) : 0;
            const totalPages = Math.ceil(total / validLimit) || 1;

            const formattedData = res.rows.map((row: any) => {
                const rawVisits = Array.isArray(row.visits) ? row.visits : [];
                const visits = rawVisits.map((v: any) => ({
                    ...v,
                    specsNotes: v.specs_notes || '',
                    styleTag: {
                        base: v.base || 'Fade',
                        length: v.length || 'Mid',
                        accent: v.accent || 'Textured Crop'
                    },
                    addOnPreferences: Array.isArray(v.add_on_preferences) ? v.add_on_preferences : []
                }));

                const firstVisit = visits[0];
                const guestRef = row.guest_ref || (row.customer_id ? `CUST-${row.customer_id}` : `GUEST-${row.guest_profile_id || 'REF'}`);

                return {
                    customer_id: row.customer_id,
                    guest_profile_id: row.guest_profile_id,
                    name: row.name,
                    mobile: row.mobile,
                    guest_ref: row.guest_ref,
                    guestRef,
                    email: row.email,
                    last_created: row.last_created,
                    visits,
                    service_name: firstVisit ? firstVisit.service_name : null,
                    serviceName: firstVisit ? firstVisit.service_name : null,
                    lastVisit: firstVisit ? firstVisit.date : 'No previous visits',
                    styleTag: firstVisit ? firstVisit.styleTag : null,
                    specsNotes: firstVisit ? firstVisit.specsNotes : '',
                    addOnPreferences: firstVisit ? firstVisit.addOnPreferences : [],
                    refPhoto: firstVisit && firstVisit.refPhoto ? firstVisit.refPhoto : null,
                    completedPhoto: firstVisit && firstVisit.completedPhoto ? firstVisit.completedPhoto : null
                };
            });

            return {
                data: formattedData,
                total,
                page: validPage,
                limit: validLimit,
                totalPages
            };
        } catch (err: any) {
            logger.error('[BarberRepository] Error in unified searchCustomerHistory query:', err);
            return {
                data: [],
                total: 0,
                page: validPage,
                limit: validLimit,
                totalPages: 1
            };
        }
    }

    /**
     * Retrieves visit records for a specific customer or guest profile served by a barber.
     */
    async getCustomerVisits(customerId?: number | null, guestProfileId?: number | null, barberId?: number | null): Promise<any[]> {
        const params: any[] = [];
        const whereConditions: string[] = [];

        if (customerId) {
            params.push(customerId);
            whereConditions.push(`qe.customer_id = $${params.length}`);
        } else if (guestProfileId) {
            params.push(guestProfileId);
            whereConditions.push(`qe.guest_profile_id = $${params.length}`);
        } else {
            return [];
        }

        if (barberId) {
            params.push(barberId);
            whereConditions.push(`qe.barber_id = $${params.length}`);
        }

        let res: any;
        try {
            res = await db.query(
                `SELECT
                    qe.id AS visit_id,
                    to_char(COALESCE(qe.preferred_date, qe.created_at) AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD') AS date,
                    to_char(COALESCE(qe.created_at) AT TIME ZONE 'Asia/Manila', 'HH12:MI AM') AS time,
                    qe.created_at,
                    COALESCE(b.name, 'DemoShop Barber') AS barber_name,
                    COALESCE(s.title, 'Haircut & Styling') AS service_name,
                    qe.status,
                    qe.haircut_photo_url AS completed_photo,
                    NULL AS ref_photo,
                    COALESCE(qe.base_style, 'Fade') AS base,
                    COALESCE(qe.haircut_length, 'Mid') AS length,
                    COALESCE(qe.accent_style, 'Textured Crop') AS accent,
                    COALESCE(qe.specs_notes, '') AS specs_notes,
                    ARRAY[]::text[] AS add_on_preferences
                 FROM queue_entries qe
                 LEFT JOIN barbers b ON qe.barber_id = b.barber_id
                 LEFT JOIN services s ON qe.service_id = s.service_id
                 WHERE ${whereConditions.join(' AND ')}
                 ORDER BY qe.created_at DESC
                 LIMIT 10`,
                params
            );
        } catch (err: any) {
            logger.warn(`[BarberRepository] Fallback for getCustomerVisits query: ${err?.message}`);
            res = await db.query(
                `SELECT
                    qe.id AS visit_id,
                    to_char(COALESCE(qe.preferred_date, qe.created_at) AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD') AS date,
                    to_char(COALESCE(qe.created_at) AT TIME ZONE 'Asia/Manila', 'HH12:MI AM') AS time,
                    qe.created_at,
                    COALESCE(b.name, 'DemoShop Barber') AS barber_name,
                    COALESCE(s.title, 'Haircut & Styling') AS service_name,
                    qe.status,
                    qe.haircut_photo_url AS completed_photo,
                    NULL AS ref_photo,
                    'Fade' AS base,
                    'Mid' AS length,
                    'Textured Crop' AS accent,
                    '' AS specs_notes,
                    ARRAY[]::text[] AS add_on_preferences
                 FROM queue_entries qe
                 LEFT JOIN barbers b ON qe.barber_id = b.barber_id
                 LEFT JOIN services s ON qe.service_id = s.service_id
                 WHERE ${whereConditions.join(' AND ')}
                 ORDER BY qe.created_at DESC
                 LIMIT 10`,
                params
            );
        }

        const entries = res.rows.map((r: any) => ({
            ...r,
            specsNotes: r.specs_notes || '',
            styleTag: { base: r.base || 'Fade', length: r.length || 'Mid', accent: r.accent || 'Textured Crop' }
        }));

        return entries;
    }

    /**
     * Retrieves itemized earnings breakdown and commission tier data for a barber.
     */
    async getBarberEarnings(barberId: number, period: 'today' | 'week' | 'month' = 'today'): Promise<any> {
        let dateCondition = `qe.created_at >= (DATE_TRUNC('day', NOW() AT TIME ZONE 'Asia/Manila') AT TIME ZONE 'Asia/Manila') AND qe.created_at < ((DATE_TRUNC('day', NOW() AT TIME ZONE 'Asia/Manila') + INTERVAL '1 day') AT TIME ZONE 'Asia/Manila')`;
        if (period === 'week') {
            dateCondition = `qe.created_at >= (DATE_TRUNC('week', NOW() AT TIME ZONE 'Asia/Manila') AT TIME ZONE 'Asia/Manila')`;
        } else if (period === 'month') {
            dateCondition = `qe.created_at >= (DATE_TRUNC('month', NOW() AT TIME ZONE 'Asia/Manila') AT TIME ZONE 'Asia/Manila')`;
        }

        const res = await db.query(
            `SELECT
                qe.id AS queue_entry_id,
                COALESCE(t.transaction_id, qe.id) AS receipt_id,
                to_char(COALESCE(qe.created_at, t.created_at), 'YYYY-MM-DD HH12:MI AM') AS service_time,
                to_char(COALESCE(qe.created_at, t.created_at), 'HH12:MI AM') AS formatted_time,
                to_char(COALESCE(qe.created_at, t.created_at), 'Mon DD, YYYY') AS formatted_date,
                COALESCE(CONCAT(c.first_name, ' ', c.last_name), gp.normalized_name, qe.customer_name, 'Walk-in Customer') AS customer_name,
                COALESCE(gp.guest_reference, CONCAT('CUST-', c.customer_id), CONCAT('GUEST-', qe.id)) AS guest_ref,
                COALESCE(s.title, 'Signature Haircut') AS service_name,
                COALESCE(t.total_amount, s.price, 0)::numeric(10,2) AS ticket_amount,
                COALESCE(t.payment_method, 'Cash') AS payment_method
             FROM queue_entries qe
             LEFT JOIN customers c ON qe.customer_id = c.customer_id
             LEFT JOIN guest_profiles gp ON qe.guest_profile_id = gp.guest_profile_id
             LEFT JOIN services s ON qe.service_id = s.service_id
             LEFT JOIN transactions t ON t.queue_entry_id = qe.id
             WHERE qe.barber_id = $1
               AND qe.status::text = 'completed'
               AND (qe.payment_status = 'paid' OR t.transaction_id IS NOT NULL)
               AND ${dateCondition}
             ORDER BY qe.created_at DESC`,
            [barberId]
        );

        const rawRows = res.rows || [];
        const totalGrossSales = rawRows.reduce((sum: number, row: any) => sum + parseFloat(row.ticket_amount || '0'), 0);
        const isHigherTier = totalGrossSales >= 3000;
        const commissionRate = isHigherTier ? 0.50 : 0.40;

        const receipts = rawRows.map((row: any) => {
            const ticket = parseFloat(row.ticket_amount || '0');
            const payoutCut = Number((ticket * commissionRate).toFixed(2));
            return {
                queueEntryId: Number(row.queue_entry_id),
                receiptId: String(row.receipt_id),
                serviceTime: row.service_time,
                formattedTime: row.formatted_time,
                formattedDate: row.formatted_date,
                customerName: row.customer_name,
                guestRef: row.guest_ref,
                serviceName: row.service_name,
                ticketAmount: ticket,
                paymentMethod: row.payment_method,
                commissionRate: commissionRate,
                commissionRateLabel: isHigherTier ? '50% Tier' : '40% Base',
                barberCut: payoutCut,
            };
        });

        const netCommissionPayout = receipts.reduce((sum: number, r: any) => sum + r.barberCut, 0);

        return {
            period,
            totalServices: receipts.length,
            totalGrossSales: Number(totalGrossSales.toFixed(2)),
            commissionRate,
            tierLabel: isHigherTier ? '50% High-Volume Bonus' : '40% Standard Rate',
            quotaThreshold: 3000,
            isQuotaReached: isHigherTier,
            remainingToNextTier: Math.max(0, Number((3000 - totalGrossSales).toFixed(2))),
            netCommissionPayout: Number(netCommissionPayout.toFixed(2)),
            receipts
        };
    }

    /**
     * Calculates performance profile stats for a barber.
     */
    async getBarberPerformance(barberId: number): Promise<any> {
        const countRes = await db.query(
            `SELECT COUNT(*) AS served_count
             FROM queue_entries
             WHERE barber_id = $1
               AND status::text = 'completed'
               AND payment_status = 'paid'
               AND created_at >= (DATE_TRUNC('day', NOW() AT TIME ZONE 'Asia/Manila') AT TIME ZONE 'Asia/Manila')
               AND created_at < ((DATE_TRUNC('day', NOW() AT TIME ZONE 'Asia/Manila') + INTERVAL '1 day') AT TIME ZONE 'Asia/Manila')`,
            [barberId]
        );
        const servedCount = parseInt(countRes.rows[0]?.served_count || '0', 10);

        const ratingRes = await db.query(
            `SELECT ROUND(AVG(stars)::numeric, 2) AS avg_rating,
                    COUNT(*) AS total_reviews
             FROM ratings
             WHERE barber_id = $1 AND (COALESCE(is_test, FALSE) = FALSE OR COALESCE(is_public_test, TRUE) = TRUE)`,
            [barberId]
        );
        const totalReviews = parseInt(ratingRes.rows[0]?.total_reviews || '0', 10);
        const averageRating = totalReviews > 0 && ratingRes.rows[0]?.avg_rating != null
            ? parseFloat(ratingRes.rows[0].avg_rating)
            : null;

        const salesRes = await db.query(
            `SELECT COALESCE(SUM(COALESCE(t.total_amount, s.price, 0)), 0) AS total_sales
             FROM queue_entries qe
             LEFT JOIN services s ON qe.service_id = s.service_id
             LEFT JOIN transactions t ON t.queue_entry_id = qe.id
             WHERE qe.barber_id = $1
               AND qe.status::text = 'completed'
               AND qe.payment_status = 'paid'
               AND qe.created_at >= (DATE_TRUNC('day', NOW() AT TIME ZONE 'Asia/Manila') AT TIME ZONE 'Asia/Manila')
               AND qe.created_at < ((DATE_TRUNC('day', NOW() AT TIME ZONE 'Asia/Manila') + INTERVAL '1 day') AT TIME ZONE 'Asia/Manila')`,
            [barberId]
        );
        const totalSales = parseFloat(salesRes.rows[0]?.total_sales || '0');

        const reviewsRes = await db.query(
            `SELECT
                r.rating_id::text AS id,
                COALESCE(CONCAT(c.first_name, ' ', c.last_name), 'Guest Customer') AS "customerName",
                r.stars AS rating,
                r.comment AS comment,
                to_char(r.created_at, 'Mon DD, YYYY') AS date
             FROM ratings r
             LEFT JOIN customers c ON r.customer_id = c.customer_id
             WHERE r.barber_id = $1 AND (COALESCE(r.is_test, FALSE) = FALSE OR COALESCE(r.is_public_test, TRUE) = TRUE)
             ORDER BY r.created_at DESC
             LIMIT 20`,
            [barberId]
        );

        return {
            servedCount,
            targetCount: 12,
            rating: averageRating,
            totalReviews,
            totalSales,
            reviews: reviewsRes.rows
        };
    }

    /**
     * Updates barber status in database, syncing active state for administrative suspensions/absences.
     */
    async updateBarberStatus(barberId: number, status: string, isActive?: boolean, client?: PoolClient): Promise<any> {
        const rawStatus = (status || '').toString().trim().toLowerCase().replace(/\s+/g, '_');
        const dbStatus = UI_TO_DB_STATUS_MAP[status] || rawStatus;
        const activeFlag = isActive !== undefined ? isActive : !['absent', 'leave', 'suspended', 'offline'].includes(rawStatus);
        const query = (sql: string, params: unknown[]) => client ? client.query(sql, params) : db.query(sql, params);

        if (client) await client.query('SAVEPOINT barber_status_cast');
        try {
            const result = await query(
                `WITH barber_state AS (
                   SELECT barber_id, status::text AS old_status, break_started_at
                   FROM barbers
                   WHERE barber_id = $2
                   FOR UPDATE
                 ), extended_service AS (
                   UPDATE queue_entries qe
                   SET service_ends_at = COALESCE(
                         qe.service_ends_at,
                         COALESCE(qe.service_started_at, qe.timer_started_at, NOW())
                           + (COALESCE(qe.duration_minutes, 30) * INTERVAL '1 minute')
                       ) + GREATEST(
                         NOW() - GREATEST(
                           barber_state.break_started_at,
                           COALESCE(qe.service_started_at, qe.timer_started_at, barber_state.break_started_at)
                         ),
                         INTERVAL '0 seconds'
                       )
                   FROM barber_state
                   WHERE qe.barber_id = barber_state.barber_id
                     AND qe.status::text = 'serving'
                     AND barber_state.break_started_at IS NOT NULL
                     AND LOWER(REPLACE(barber_state.old_status, '-', '_')) IN ('on_break', 'break')
                     AND LOWER(REPLACE($1, '-', '_')) NOT IN ('on_break', 'break')
                   RETURNING qe.id
                 ), delayed_reservations AS (
                   UPDATE queue_entries qe
                   SET estimated_start_at = COALESCE(qe.estimated_start_at, qe.scheduled_start_at)
                         + GREATEST(NOW() - barber_state.break_started_at, INTERVAL '0 seconds'),
                       schedule_delay_minutes = CASE
                         WHEN qe.scheduled_start_at IS NOT NULL THEN COALESCE(qe.schedule_delay_minutes, 0)
                           + CEIL(EXTRACT(EPOCH FROM GREATEST(NOW() - barber_state.break_started_at, INTERVAL '0 seconds')) / 60)::int
                         ELSE COALESCE(qe.schedule_delay_minutes, 0)
                       END
                   FROM barber_state
                   WHERE qe.barber_id = barber_state.barber_id
                     AND qe.status::text IN ('pending', 'accepted', 'late', 'waiting')
                     AND (qe.scheduled_start_at IS NOT NULL OR qe.estimated_start_at IS NOT NULL)
                     AND barber_state.break_started_at IS NOT NULL
                     AND LOWER(REPLACE(barber_state.old_status, '-', '_')) IN ('on_break', 'break')
                     AND LOWER(REPLACE($1, '-', '_')) NOT IN ('on_break', 'break')
                   RETURNING qe.id
                 )
                 UPDATE barbers b
                 SET status = $1::barber_status_type,
                     is_active = COALESCE($3, b.is_active),
                     break_started_at = CASE
                       WHEN LOWER(REPLACE($1, '-', '_')) IN ('on_break', 'break')
                         THEN COALESCE(b.break_started_at, NOW())
                       ELSE NULL
                     END
                 WHERE b.barber_id = $2
                 RETURNING b.barber_id, b.name, b.status::text, b.is_active, b.user_id, b.break_started_at`,
                [dbStatus, barberId, activeFlag]
            );
            if (client) await client.query('RELEASE SAVEPOINT barber_status_cast');
            return normalizeStatusRow(result.rows[0]) || null;
        } catch (err: any) {
            if (client) await client.query('ROLLBACK TO SAVEPOINT barber_status_cast');
            logger.warn(`[BarberRepository] Failed to update status with $1::barber_status_type: ${err?.message}`);
            const result = await query(
                `WITH barber_state AS (
                   SELECT barber_id, status::text AS old_status, break_started_at
                   FROM barbers
                   WHERE barber_id = $2
                   FOR UPDATE
                 ), extended_service AS (
                   UPDATE queue_entries qe
                   SET service_ends_at = COALESCE(
                         qe.service_ends_at,
                         COALESCE(qe.service_started_at, qe.timer_started_at, NOW())
                           + (COALESCE(qe.duration_minutes, 30) * INTERVAL '1 minute')
                       ) + GREATEST(
                         NOW() - GREATEST(
                           barber_state.break_started_at,
                           COALESCE(qe.service_started_at, qe.timer_started_at, barber_state.break_started_at)
                         ),
                         INTERVAL '0 seconds'
                       )
                   FROM barber_state
                   WHERE qe.barber_id = barber_state.barber_id
                     AND qe.status::text = 'serving'
                     AND barber_state.break_started_at IS NOT NULL
                     AND LOWER(REPLACE(barber_state.old_status, '-', '_')) IN ('on_break', 'break')
                     AND LOWER(REPLACE($1, '-', '_')) NOT IN ('on_break', 'break')
                   RETURNING qe.id
                 ), delayed_reservations AS (
                   UPDATE queue_entries qe
                   SET estimated_start_at = COALESCE(qe.estimated_start_at, qe.scheduled_start_at)
                         + GREATEST(NOW() - barber_state.break_started_at, INTERVAL '0 seconds'),
                       schedule_delay_minutes = CASE
                         WHEN qe.scheduled_start_at IS NOT NULL THEN COALESCE(qe.schedule_delay_minutes, 0)
                           + CEIL(EXTRACT(EPOCH FROM GREATEST(NOW() - barber_state.break_started_at, INTERVAL '0 seconds')) / 60)::int
                         ELSE COALESCE(qe.schedule_delay_minutes, 0)
                       END
                   FROM barber_state
                   WHERE qe.barber_id = barber_state.barber_id
                     AND qe.status::text IN ('pending', 'accepted', 'late', 'waiting')
                     AND (qe.scheduled_start_at IS NOT NULL OR qe.estimated_start_at IS NOT NULL)
                     AND barber_state.break_started_at IS NOT NULL
                     AND LOWER(REPLACE(barber_state.old_status, '-', '_')) IN ('on_break', 'break')
                     AND LOWER(REPLACE($1, '-', '_')) NOT IN ('on_break', 'break')
                   RETURNING qe.id
                 )
                 UPDATE barbers b
                 SET status = $1::barber_status_type,
                     is_active = COALESCE($3, b.is_active),
                     break_started_at = CASE
                       WHEN LOWER(REPLACE($1, '-', '_')) IN ('on_break', 'break')
                         THEN COALESCE(b.break_started_at, NOW())
                       ELSE NULL
                     END
                 WHERE b.barber_id = $2
                 RETURNING b.barber_id, b.name, b.status::text, b.is_active, b.user_id, b.break_started_at`,
                [dbStatus, barberId, activeFlag]
            );
            if (client) await client.query('RELEASE SAVEPOINT barber_status_cast');
            return normalizeStatusRow(result.rows[0]) || null;
        }
    }

    /**
     * Returns staff directory (Barbers and Cashiers) with current operational/administrative status.
     */
    async findAllStaff(branchId?: number, includeSuspended: boolean = false): Promise<any[]> {
        const params: any[] = [];
        const conditions: string[] = [
            "u.role::text IN ('Barber', 'Cashier', 'Inventory Manager')",
        ];

        if (!includeSuspended) {
            conditions.push('u.deleted_at IS NULL');
        }

        if (branchId) {
            params.push(branchId);
            conditions.push(`(u.branch_id = $${params.length} OR u.branch_id IS NULL)`);
        }

        const query = `
            SELECT 
                u.user_id,
                COALESCE(b.barber_id, 0) AS id,
                COALESCE(b.barber_id, 0) AS barber_id,
                u.username,
                COALESCE(b.name, u.username, u.email, 'Staff Member') AS name,
                u.role,
                u.email,
                u.profile_picture,
                COALESCE(u.can_access_inventory, FALSE) AS can_access_inventory,
                (u.deleted_at IS NOT NULL) AS is_suspended,
                COALESCE(b.is_active, TRUE) AS is_active,
                COALESCE(b.status::text, 'available') AS status,
                COALESCE(br.name, 'SampleBranch Branch') AS branch,
                COALESCE(q.active_count, 0) AS appointments,
                COALESCE(s.serving_count, 0) AS serving_count,
                COALESCE(cs.completed_count, 0) AS total_services_completed,
                to_char(ssa.start_time, 'HH24:MI') AS shift_start_time,
                to_char(ssa.end_time, 'HH24:MI') AS shift_end_time,
                ssa.is_off AS shift_is_off,
                r.avg_rating AS rating,
                'Classic Cuts' AS specialty
            FROM users u
            LEFT JOIN barbers b ON b.user_id = u.user_id
            LEFT JOIN branches br ON br.branch_id = u.branch_id
            LEFT JOIN staff_shift_assignments ssa ON ssa.user_id = u.user_id 
                AND ssa.shift_date = (NOW() AT TIME ZONE 'Asia/Manila')::date
            LEFT JOIN (
                SELECT barber_id, COUNT(*)::int AS active_count
                FROM queue_entries
                WHERE status IN ('pending', 'accepted', 'waiting', 'serving')
                GROUP BY barber_id
            ) q ON q.barber_id = b.barber_id
            LEFT JOIN (
                SELECT barber_id, COUNT(*)::int AS serving_count
                FROM queue_entries
                WHERE status = 'serving'
                GROUP BY barber_id
            ) s ON s.barber_id = b.barber_id
            LEFT JOIN (
                SELECT barber_id, COUNT(*)::int AS completed_count
                FROM queue_entries
                WHERE status::text = 'completed'
                GROUP BY barber_id
            ) cs ON cs.barber_id = b.barber_id
            LEFT JOIN (
                SELECT barber_id, ROUND(AVG(stars)::numeric, 1) AS avg_rating
                FROM ratings
                WHERE (COALESCE(is_test, FALSE) = FALSE OR COALESCE(is_public_test, TRUE) = TRUE)
                GROUP BY barber_id
            ) r ON r.barber_id = b.barber_id
            WHERE ${conditions.join(' AND ')}
            ORDER BY 
              CASE 
                WHEN u.role::text = 'Barber' THEN 1
                WHEN u.role::text = 'Cashier' THEN 2
                ELSE 3
              END,
              name ASC
        `;

        try {
            const result = await db.query(query, params);
            return result.rows.map(normalizeStatusRow);
        } catch (err: any) {
            logger.error('[BarberRepository] Failed to fetch staff:', err);
            return [];
        }
    }

    /**
     * Finds barber_id by user_id.
     */
    async findBarberIdByUserId(userId: string): Promise<number | null> {
        const result = await db.query(
            'SELECT barber_id FROM barbers WHERE user_id = $1',
            [userId]
        );
        if (result?.rows?.[0]?.barber_id) {
            return Number(result.rows[0].barber_id);
        }
        const fallback = await this.findBarberByUserId(userId);
        return fallback?.barber_id ? Number(fallback.barber_id) : null;
    }

    /**
     * Creates a new shift swap or time off request for a barber.
     */
    async createShiftRequest(data: {
        barberId: number;
        userId: string;
        requestType: 'swap' | 'time_off';
        shiftDate: string;
        targetBarberName?: string;
        targetDate?: string;
        reason: string;
    }): Promise<any> {
        try {
            const res = await db.query(
                `INSERT INTO barber_shift_requests (
                    barber_id, user_id, request_type, shift_date, target_barber_name, target_date, reason, status
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
                 RETURNING id, barber_id, user_id, request_type, to_char(shift_date, 'YYYY-MM-DD') AS shift_date, target_barber_name, to_char(target_date, 'YYYY-MM-DD') AS target_date, reason, status, cooldown_until, admin_notes, created_at`,
                [
                    data.barberId,
                    data.userId,
                    data.requestType,
                    data.shiftDate,
                    data.targetBarberName || null,
                    data.targetDate || null,
                    data.reason
                ]
            );
            return res.rows[0];
        } catch (err: any) {
            logger.warn(`[BarberRepository] Fallback to in-memory store for createShiftRequest: ${err?.message}`);
            // In-memory fallback
            const record = {
                id: nextShiftRequestId++,
                barber_id: data.barberId,
                user_id: data.userId,
                request_type: data.requestType,
                shift_date: data.shiftDate,
                target_barber_name: data.targetBarberName || null,
                target_date: data.targetDate || null,
                reason: data.reason,
                status: 'pending',
                cooldown_until: null,
                admin_notes: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            inMemoryShiftRequests.push(record);
            return record;
        }
    }

    /**
     * Gets the current active / pending shift request for a barber.
     */
    async getActiveShiftRequest(barberId?: number | null, userId?: string): Promise<any | null> {
        try {
            const res = await db.query(
                `SELECT 
                    id, barber_id, user_id, request_type, 
                    to_char(shift_date, 'YYYY-MM-DD') AS shift_date, 
                    target_barber_name, 
                    to_char(target_date, 'YYYY-MM-DD') AS target_date, 
                    reason, status, cooldown_until, admin_notes, created_at, updated_at
                 FROM barber_shift_requests
                 WHERE (($1::int IS NOT NULL AND barber_id = $1::int) OR ($2::text IS NOT NULL AND user_id::text = $2::text))
                   AND (
                     status = 'pending'
                     OR (status = 'approved' AND (cooldown_until IS NULL OR cooldown_until > NOW()))
                     OR (status = 'declined' AND updated_at > NOW() - INTERVAL '24 hours')
                   )
                 ORDER BY created_at DESC
                 LIMIT 1`,
                [barberId ?? null, userId ?? null]
            );
            if (res.rows && res.rows.length > 0) return res.rows[0];
        } catch (err: any) {
            logger.warn(`[BarberRepository] Fallback to in-memory store for getActiveShiftRequest: ${err?.message}`);
        }
        // Check in-memory store
        const inMem = inMemoryShiftRequests
            .filter(r => ((barberId && r.barber_id === barberId) || (userId && r.user_id === userId)) && (r.status === 'pending' || r.status === 'approved' || r.status === 'declined'))
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        return inMem[0] || null;
    }

    /**
     * Acknowledges a declined shift request so the barber can submit again.
     */
    async acknowledgeShiftRequest(barberId: number, requestId: number): Promise<boolean> {
        try {
            await db.query(
                `UPDATE barber_shift_requests
                 SET updated_at = NOW() - INTERVAL '48 hours'
                 WHERE id = $1 AND barber_id = $2`,
                [requestId, barberId]
            );
        } catch (err: any) {
            // Ignored, proceed to clear in-memory record
        }
        const found = inMemoryShiftRequests.find(r => r.id === requestId && r.barber_id === barberId);
        if (found) {
            found.status = 'acknowledged';
        }
        return true;
    }

    /**
     * Retrieves approved time-off requests for every barber in a branch in one
     * query. Cashier bootstrap uses this to avoid one leave query per barber.
     */
    async listApprovedLeavesInRangeForBranch(
        branchId: number,
        fromDate: string,
        toDate: string,
        barberIds: number[] = [],
    ): Promise<any[]> {
        try {
            const res = await db.query(
                `SELECT r.id, r.barber_id, r.user_id, r.request_type,
                        to_char(r.shift_date, 'YYYY-MM-DD') AS shift_date,
                        r.reason, r.status
                 FROM barber_shift_requests r
                 JOIN barbers b ON b.barber_id = r.barber_id
                 JOIN users u ON u.user_id = b.user_id
                WHERE u.branch_id = $1
                   AND r.request_type = 'time_off'
                   AND r.status = 'approved'
                   AND r.shift_date >= $2::date
                   AND r.shift_date <= $3::date
                   AND ($4::int[] IS NULL OR r.barber_id = ANY($4::int[]))`,
                [branchId, fromDate, toDate, barberIds.length > 0 ? barberIds : null],
            );
            return res.rows || [];
        } catch (err: any) {
            logger.warn(`[BarberRepository] Fallback to in-memory store for listApprovedLeavesInRangeForBranch: ${err?.message}`);
            const activeBarberIds = new Set(barberIds);
            return inMemoryShiftRequests.filter((request) =>
                activeBarberIds.has(Number(request.barber_id)) &&
                request.request_type === 'time_off' &&
                request.status === 'approved' &&
                request.shift_date >= fromDate &&
                request.shift_date <= toDate
            );
        }
    }

    /**
     * Retrieves approved time-off / leave requests for a barber in a date range.
     */
    async listApprovedLeavesInRange(barberId: number, fromDate: string, toDate: string): Promise<any[]> {
        try {
            const res = await db.query(
                `SELECT id, barber_id, user_id, request_type, to_char(shift_date, 'YYYY-MM-DD') AS shift_date, reason, status
                 FROM barber_shift_requests
                 WHERE barber_id = $1
                   AND request_type = 'time_off'
                   AND status = 'approved'
                   AND shift_date >= $2::date
                   AND shift_date <= $3::date`,
                [barberId, fromDate, toDate]
            );
            return res.rows || [];
        } catch (err: any) {
            logger.warn(`[BarberRepository] Fallback to in-memory store for listApprovedLeavesInRange: ${err?.message}`);
            return inMemoryShiftRequests.filter(r =>
                r.barber_id === barberId &&
                r.request_type === 'time_off' &&
                r.status === 'approved' &&
                r.shift_date >= fromDate &&
                r.shift_date <= toDate
            );
        }
    }

    /**
     * Retrieves all shift requests for branch or shop admin overview.
     */
    async getAllShiftRequests(branchId?: number): Promise<any[]> {
        try {
            const res = await db.query(
                `SELECT 
                    r.id, r.barber_id, r.user_id, r.request_type, 
                    to_char(r.shift_date, 'YYYY-MM-DD') AS shift_date, 
                    r.target_barber_name, 
                    to_char(r.target_date, 'YYYY-MM-DD') AS target_date, 
                    r.reason, r.status, r.cooldown_until, r.admin_notes, r.created_at, r.updated_at,
                    COALESCE(b.name, u.username, 'Barber') AS barber_name
                 FROM barber_shift_requests r
                 LEFT JOIN barbers b ON b.barber_id = r.barber_id
                 LEFT JOIN users u ON u.user_id = COALESCE(r.user_id, b.user_id)
                 WHERE ($1::int IS NULL OR u.branch_id = $1::int)
                 ORDER BY 
                   CASE WHEN r.status = 'pending' THEN 1 ELSE 2 END,
                   r.created_at DESC`,
                [branchId ?? null]
            );
            if (res.rows) {
                const dbIds = new Set(res.rows.map((r: any) => r.id));
                const extra = inMemoryShiftRequests.filter(r => !dbIds.has(r.id));
                return [...res.rows, ...extra];
            }
        } catch (err: any) {
            logger.warn(`[BarberRepository] Error in getAllShiftRequests: ${err?.message}`);
        }
        return inMemoryShiftRequests.map(r => ({
            ...r,
            barber_name: r.barber_name || 'Barber'
        }));
    }

    /**
     * Reviews (approves or declines) a shift request.
     */
    async reviewShiftRequest(requestId: number, action: 'approve' | 'decline', adminNotes?: string): Promise<any> {
        const status = action === 'approve' ? 'approved' : 'declined';
        try {
            const res = await db.query(
                `UPDATE barber_shift_requests
                 SET status = $1::text,
                     admin_notes = $2::text,
                     cooldown_until = CASE WHEN $1::text = 'approved' THEN (shift_date + INTERVAL '1 day')::timestamptz ELSE NULL END,
                     updated_at = NOW()
                 WHERE id = $3::int
                 RETURNING id, barber_id, user_id, request_type, to_char(shift_date, 'YYYY-MM-DD') AS shift_date, target_barber_name, to_char(target_date, 'YYYY-MM-DD') AS target_date, reason, status, cooldown_until, admin_notes, created_at, updated_at`,
                [status, adminNotes || null, requestId]
            );
            if (res.rows && res.rows.length > 0) {
                return res.rows[0];
            }
        } catch (err: any) {
            logger.warn(`[BarberRepository] Fallback to in-memory store for reviewShiftRequest: ${err?.message}`);
        }

        const found = inMemoryShiftRequests.find(r => r.id === requestId);
        if (found) {
            found.status = status;
            found.admin_notes = adminNotes || null;
            found.updated_at = new Date().toISOString();
            if (status === 'approved') {
                const target = new Date(found.shift_date);
                target.setDate(target.getDate() + 1);
                found.cooldown_until = target.toISOString();
            }
            return found;
        }
        return null;
    }

    /**
     * Clears all shift requests from database and in-memory store.
     */
    async clearAllShiftRequests(): Promise<{ deleted: number }> {
        inMemoryShiftRequests.length = 0;
        try {
            const res = await db.query('DELETE FROM barber_shift_requests RETURNING id');
            return { deleted: res.rowCount || 0 };
        } catch (err: any) {
            logger.warn(`[BarberRepository] Fallback for clearAllShiftRequests: ${err?.message}`);
            return { deleted: 0 };
        }
    }

    /**
     * Retrieves comprehensive barber portfolio data including bio, verified operational stats,
     * specialties, previous work items, and customer feedback.
     */
    async getBarberPortfolio(barberId: number): Promise<any | null> {
        const barberRes = await db.query(
            `SELECT b.barber_id, b.name, b.bio, b.is_active, b.status::text AS status,
                    u.profile_picture
             FROM barbers b
             LEFT JOIN users u ON b.user_id = u.user_id
             WHERE b.barber_id = $1`,
            [barberId]
        );

        if (!barberRes.rows.length) {
            return null;
        }

        const barber = barberRes.rows[0];

        // System-generated / verified operational statistics (never barber-editable)
        const statsRes = await db.query(
            `SELECT 
                (SELECT COUNT(*)::int FROM queue_entries WHERE barber_id = $1 AND status::text = 'completed') AS completed_services_count,
                (SELECT ROUND(AVG(stars)::numeric, 1) FROM ratings WHERE barber_id = $1 AND (COALESCE(is_test, FALSE) = FALSE OR COALESCE(is_public_test, TRUE) = TRUE)) AS avg_rating,
                (SELECT COUNT(*)::int FROM ratings WHERE barber_id = $1 AND (COALESCE(is_test, FALSE) = FALSE OR COALESCE(is_public_test, TRUE) = TRUE)) AS total_reviews`,
            [barberId]
        );
        const stats = statsRes.rows[0] || {};

        // Specialties from existing DemoShop services catalog
        const specialtiesRes = await db.query(
            `SELECT s.service_id, s.title, s.category, s.price, s.duration_minutes
             FROM barber_specialties bs
             JOIN services s ON s.service_id = bs.service_id
             WHERE bs.barber_id = $1
             ORDER BY s.title ASC`,
            [barberId]
        );

        // Barber-managed portfolio items (previous work)
        const portfolioRes = await db.query(
            `SELECT pi.id, pi.barber_id, pi.service_id, pi.image_url, pi.storage_path, pi.caption, pi.created_at,
                    s.title AS service_title
             FROM barber_portfolio_items pi
             LEFT JOIN services s ON s.service_id = pi.service_id
             WHERE pi.barber_id = $1
             ORDER BY pi.created_at DESC`,
            [barberId]
        );

        // System-generated verified customer reviews/feedback
        const feedbackRes = await db.query(
            `SELECT
                r.rating_id::text AS id,
                CASE
                    WHEN c.first_name IS NOT NULL AND c.last_name IS NOT NULL AND LENGTH(TRIM(c.last_name)) > 0
                        THEN CONCAT(TRIM(c.first_name), ' ', SUBSTRING(TRIM(c.last_name) FROM 1 FOR 1), '.')
                    WHEN c.first_name IS NOT NULL AND LENGTH(TRIM(c.first_name)) > 0
                        THEN TRIM(c.first_name)
                    ELSE 'Guest Customer'
                END AS "customerName",
                r.stars AS rating,
                r.comment AS comment,
                to_char(r.created_at, 'Mon DD, YYYY') AS date
             FROM ratings r
             LEFT JOIN customers c ON r.customer_id = c.customer_id
             WHERE r.barber_id = $1 AND (COALESCE(r.is_test, FALSE) = FALSE OR COALESCE(r.is_public_test, TRUE) = TRUE)
             ORDER BY r.created_at DESC
             LIMIT 20`,
            [barberId]
        );

        return {
            barberId: barber.barber_id,
            name: barber.name,
            bio: barber.bio || '',
            profilePicture: barber.profile_picture || null,
            status: barber.status,
            isActive: barber.is_active,
            // Verified system-generated stats
            rating: stats.avg_rating != null ? parseFloat(stats.avg_rating) : null,
            totalReviews: parseInt(stats.total_reviews || '0', 10),
            completedServicesCount: parseInt(stats.completed_services_count || '0', 10),
            // Barber-managed specialties & portfolio items
            specialties: specialtiesRes.rows.map((row: any) => ({
                serviceId: row.service_id,
                title: row.title,
                category: row.category,
                price: parseFloat(row.price || '0'),
                durationMinutes: row.duration_minutes,
            })),
            portfolioItems: portfolioRes.rows.map((row: any) => ({
                id: row.id,
                barberId: row.barber_id,
                serviceId: row.service_id,
                serviceTitle: row.service_title || null,
                imageUrl: row.image_url,
                storagePath: row.storage_path,
                caption: row.caption || '',
                createdAt: row.created_at,
            })),
            // Read-only customer feedback
            feedback: feedbackRes.rows,
        };
    }

    /**
     * Updates the barber's professional bio.
     */
    async updateBarberBio(barberId: number, bio: string | null): Promise<string | null> {
        const res = await db.query(
            `UPDATE barbers
             SET bio = $1
             WHERE barber_id = $2
             RETURNING bio`,
            [bio, barberId]
        );
        return res.rows[0]?.bio || null;
    }

    /**
     * Synchronizes a barber's specialties with existing DemoShop services.
     */
    async setBarberSpecialties(barberId: number, serviceIds: number[]): Promise<any[]> {
        const client = await db.connect();
        try {
            await client.query('BEGIN');
            await client.query('DELETE FROM barber_specialties WHERE barber_id = $1', [barberId]);

            if (serviceIds.length > 0) {
                const uniqueIds = Array.from(new Set(serviceIds));
                const values = uniqueIds.map((_, idx) => `($1, $${idx + 2})`).join(', ');
                await client.query(
                    `INSERT INTO barber_specialties (barber_id, service_id)
                     VALUES ${values}
                     ON CONFLICT (barber_id, service_id) DO NOTHING`,
                    [barberId, ...uniqueIds]
                );
            }
            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }

        const res = await db.query(
            `SELECT s.service_id, s.title, s.category, s.price, s.duration_minutes
             FROM barber_specialties bs
             JOIN services s ON s.service_id = bs.service_id
             WHERE bs.barber_id = $1
             ORDER BY s.title ASC`,
            [barberId]
        );

        return res.rows.map((row: any) => ({
            serviceId: row.service_id,
            title: row.title,
            category: row.category,
            price: parseFloat(row.price || '0'),
            durationMinutes: row.duration_minutes,
        }));
    }

    /**
     * Inserts a new barber-uploaded portfolio work item.
     */
    async addPortfolioItem(
        barberId: number,
        data: { serviceId?: number | null; imageUrl: string; storagePath: string; caption?: string | null }
    ): Promise<any> {
        const res = await db.query(
            `INSERT INTO barber_portfolio_items (barber_id, service_id, image_url, storage_path, caption)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, barber_id, service_id, image_url, storage_path, caption, created_at`,
            [barberId, data.serviceId || null, data.imageUrl, data.storagePath, data.caption || null]
        );
        const item = res.rows[0];

        let serviceTitle = null;
        if (item.service_id) {
            const sRes = await db.query('SELECT title FROM services WHERE service_id = $1', [item.service_id]);
            serviceTitle = sRes.rows[0]?.title || null;
        }

        return {
            id: item.id,
            barberId: item.barber_id,
            serviceId: item.service_id,
            serviceTitle,
            imageUrl: item.image_url,
            storagePath: item.storage_path,
            caption: item.caption || '',
            createdAt: item.created_at,
        };
    }

    /**
     * Updates metadata (service association, caption) of a portfolio work item, strictly scoped to owner.
     */
    async updatePortfolioItem(
        barberId: number,
        itemId: number,
        data: { serviceId?: number | null; caption?: string | null }
    ): Promise<any | null> {
        const res = await db.query(
            `UPDATE barber_portfolio_items
             SET service_id = $1,
                 caption = $2
             WHERE id = $3 AND barber_id = $4
             RETURNING id, barber_id, service_id, image_url, storage_path, caption, created_at`,
            [data.serviceId || null, data.caption || null, itemId, barberId]
        );
        if (!res.rows.length) return null;

        const item = res.rows[0];
        let serviceTitle = null;
        if (item.service_id) {
            const sRes = await db.query('SELECT title FROM services WHERE service_id = $1', [item.service_id]);
            serviceTitle = sRes.rows[0]?.title || null;
        }

        return {
            id: item.id,
            barberId: item.barber_id,
            serviceId: item.service_id,
            serviceTitle,
            imageUrl: item.image_url,
            storagePath: item.storage_path,
            caption: item.caption || '',
            createdAt: item.created_at,
        };
    }

    /**
     * Deletes a portfolio work item, strictly scoped to the owner barber.
     * Returns deleted record with storage_path for Supabase Storage cleanup.
     */
    async deletePortfolioItem(barberId: number, itemId: number): Promise<{ id: number; storagePath: string } | null> {
        const res = await db.query(
            `DELETE FROM barber_portfolio_items
             WHERE id = $1 AND barber_id = $2
             RETURNING id, storage_path`,
            [itemId, barberId]
        );
        if (!res.rows.length) return null;
        return {
            id: res.rows[0].id,
            storagePath: res.rows[0].storage_path,
        };
    }
}
export const barberRepository = new BarberRepository();

