import db from '../db';
import logger from '../utils/general/logger';
import {
  buildDefaultLegal,
  isUntouchedLegacyPlaceholder,
  getManilaFormattedDate,
} from '../utils/admin/legal-documents.util';
import type {
  SalesReportResponse,
  SalesReportSummary,
  SalesReportDailyPoint,
  SalesReportTransaction,
  BarberCommissionResponse,
  BarberCommissionSummary,
  BarberCommissionItem,
  BarberPerformanceReviewsResponse,
  BarberPerformanceMetric,
  BarberReviewLogItem,
  BarberCompletedServiceLogItem,
  BarberPerformanceReviewSummary,
} from '@demoshop/shared-types';

/**
 * Repository for Admin-related database operations.
 */
export class AdminRepository {
  async getCustomerReviews(branchId?: number, page = 1, limit = 10) {
    const safeLimit = Math.max(1, Math.min(25, Math.floor(Number(limit)) || 10));
    const safePage = Number.isFinite(Number(page)) ? Math.max(1, Math.floor(Number(page)) || 1) : 1;
    const scope = '($1::int IS NULL OR qe.branch_id = $1)';
    const [count, result] = await Promise.all([
      db.query(`SELECT COUNT(*)::int AS total FROM ratings r
        LEFT JOIN queue_entries qe ON qe.id = r.queue_id WHERE ${scope}`, [branchId || null]),
      db.query(`SELECT r.rating_id AS id,
        COALESCE(NULLIF(TRIM(CONCAT(c.first_name, ' ', c.last_name)), ''), 'Guest Customer') AS customer_name,
        COALESCE(b.name, 'Barber') AS barber_name,
        r.stars, r.comment, TO_CHAR(r.created_at, 'YYYY-MM-DD') AS date
        FROM ratings r
        LEFT JOIN queue_entries qe ON qe.id = r.queue_id
        LEFT JOIN customers c ON c.customer_id = r.customer_id
        LEFT JOIN barbers b ON b.barber_id = r.barber_id
        WHERE ${scope}
        ORDER BY r.created_at DESC, r.rating_id DESC
        LIMIT $2 OFFSET $3`, [branchId || null, safeLimit, (safePage - 1) * safeLimit]),
    ]);
    return { reviews: result.rows, total: Number(count.rows[0]?.total || 0), page: safePage, limit: safeLimit };
  }

  /**
   * Retrieves barber performance and service metrics across configurable operational periods.
   */
  async getBarberPerformanceReviews(
    branchId?: number,
    startDate?: string,
    endDate?: string,
    barberId?: number
  ): Promise<BarberPerformanceReviewsResponse> {
    const branchParam = branchId || null;
    const startParam = startDate || null;
    const endParam = endDate || null;
    const barberParam = barberId || null;

    const [barbersRes, reviewsRes, completedRes] = await Promise.all([
      db.query(`
        SELECT
          b.barber_id,
          COALESCE(b.name, u.username, 'Barber') AS barber_name,
          u.profile_picture,
          u.email,
          COALESCE(b.is_active, TRUE) AS is_active,
          COALESCE(srv.completed_services_count, 0)::int AS completed_services_count,
          COALESCE(srv.total_revenue, 0)::numeric AS total_revenue,
          COALESCE(r_agg.avg_rating, 5.0)::numeric AS avg_rating,
          COALESCE(r_agg.total_reviews, 0)::int AS total_reviews,
          COALESCE(r_agg.star5, 0)::int AS star5,
          COALESCE(r_agg.star4, 0)::int AS star4,
          COALESCE(r_agg.star3, 0)::int AS star3,
          COALESCE(r_agg.star2, 0)::int AS star2,
          COALESCE(r_agg.star1, 0)::int AS star1
        FROM barbers b
        JOIN users u ON u.user_id = b.user_id
        LEFT JOIN (
          SELECT
            qe.barber_id,
            COUNT(*)::int AS completed_services_count,
            COALESCE(SUM(COALESCE(t.total_amount, s.price, 250)), 0)::numeric AS total_revenue
          FROM queue_entries qe
          LEFT JOIN services s ON s.service_id = qe.service_id
          LEFT JOIN transactions t ON t.queue_entry_id = qe.id
          WHERE qe.status::text = 'completed'
            AND ($1::int IS NULL OR qe.branch_id = $1)
            AND ($2::date IS NULL OR (qe.created_at AT TIME ZONE 'Asia/Manila')::date >= $2::date)
            AND ($3::date IS NULL OR (qe.created_at AT TIME ZONE 'Asia/Manila')::date <= $3::date)
          GROUP BY qe.barber_id
        ) srv ON srv.barber_id = b.barber_id
        LEFT JOIN (
          SELECT
            r.barber_id,
            ROUND(AVG(r.stars)::numeric, 1) AS avg_rating,
            COUNT(*)::int AS total_reviews,
            COUNT(CASE WHEN r.stars = 5 THEN 1 END)::int AS star5,
            COUNT(CASE WHEN r.stars = 4 THEN 1 END)::int AS star4,
            COUNT(CASE WHEN r.stars = 3 THEN 1 END)::int AS star3,
            COUNT(CASE WHEN r.stars = 2 THEN 1 END)::int AS star2,
            COUNT(CASE WHEN r.stars = 1 THEN 1 END)::int AS star1
          FROM ratings r
          LEFT JOIN queue_entries qe ON qe.id = r.queue_id
          WHERE ($1::int IS NULL OR qe.branch_id = $1 OR qe.branch_id IS NULL)
            AND ($2::date IS NULL OR (r.created_at AT TIME ZONE 'Asia/Manila')::date >= $2::date)
            AND ($3::date IS NULL OR (r.created_at AT TIME ZONE 'Asia/Manila')::date <= $3::date)
            AND (COALESCE(r.is_test, FALSE) = FALSE OR COALESCE(r.is_public_test, TRUE) = TRUE)
          GROUP BY r.barber_id
        ) r_agg ON r_agg.barber_id = b.barber_id
        WHERE u.deleted_at IS NULL
          AND ($1::int IS NULL OR u.branch_id = $1)
          AND ($4::int IS NULL OR b.barber_id = $4)
        ORDER BY completed_services_count DESC, avg_rating DESC, b.barber_id ASC
      `, [branchParam, startParam, endParam, barberParam]),

      db.query(`
        SELECT 
          r.rating_id AS id,
          r.barber_id,
          COALESCE(b.name, 'Barber') AS barber_name,
          COALESCE(NULLIF(TRIM(CONCAT(c.first_name, ' ', c.last_name)), ''), qe.customer_name, 'Guest Customer') AS customer_name,
          r.stars,
          r.comment,
          TO_CHAR(r.created_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD') AS date,
          TO_CHAR(r.created_at AT TIME ZONE 'Asia/Manila', 'HH12:MI AM') AS time,
          COALESCE(s.title, 'Haircut Service') AS service_name,
          qe.id AS queue_id
        FROM ratings r
        LEFT JOIN queue_entries qe ON qe.id = r.queue_id
        LEFT JOIN customers c ON c.customer_id = r.customer_id
        LEFT JOIN barbers b ON b.barber_id = r.barber_id
        LEFT JOIN services s ON s.service_id = COALESCE(r.service_id, qe.service_id)
        WHERE ($1::int IS NULL OR qe.branch_id = $1 OR qe.branch_id IS NULL)
          AND ($4::int IS NULL OR r.barber_id = $4)
          AND ($2::date IS NULL OR (r.created_at AT TIME ZONE 'Asia/Manila')::date >= $2::date)
          AND ($3::date IS NULL OR (r.created_at AT TIME ZONE 'Asia/Manila')::date <= $3::date)
          AND (COALESCE(r.is_test, FALSE) = FALSE OR COALESCE(r.is_public_test, TRUE) = TRUE)
        ORDER BY r.created_at DESC, r.rating_id DESC
        LIMIT 200
      `, [branchParam, startParam, endParam, barberParam]),

      db.query(`
        SELECT 
          qe.id,
          qe.barber_id,
          COALESCE(b.name, 'Barber') AS barber_name,
          COALESCE(NULLIF(TRIM(CONCAT(c.first_name, ' ', c.last_name)), ''), qe.customer_name, 'Guest Customer') AS customer_name,
          COALESCE(s.title, 'Classic Cut') AS service_name,
          COALESCE(t.total_amount, s.price, 0)::numeric AS price,
          qe.status,
          TO_CHAR(qe.created_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD') AS date,
          COALESCE(
            qe.preferred_time,
            TO_CHAR(qe.scheduled_start_at AT TIME ZONE 'Asia/Manila', 'HH12:MI AM'),
            TO_CHAR(qe.created_at AT TIME ZONE 'Asia/Manila', 'HH12:MI AM')
          ) AS time,
          r.stars,
          r.comment
        FROM queue_entries qe
        LEFT JOIN customers c ON c.customer_id = qe.customer_id
        LEFT JOIN barbers b ON b.barber_id = qe.barber_id
        LEFT JOIN services s ON s.service_id = qe.service_id
        LEFT JOIN transactions t ON t.queue_entry_id = qe.id
        LEFT JOIN ratings r ON r.queue_id = qe.id
        WHERE qe.status::text = 'completed'
          AND ($1::int IS NULL OR qe.branch_id = $1)
          AND ($4::int IS NULL OR qe.barber_id = $4)
          AND ($2::date IS NULL OR (qe.created_at AT TIME ZONE 'Asia/Manila')::date >= $2::date)
          AND ($3::date IS NULL OR (qe.created_at AT TIME ZONE 'Asia/Manila')::date <= $3::date)
        ORDER BY qe.created_at DESC
        LIMIT 200
      `, [branchParam, startParam, endParam, barberParam]),
    ]);

    const barbers: BarberPerformanceMetric[] = barbersRes.rows.map((row: any) => ({
      barber_id: Number(row.barber_id),
      barber_name: row.barber_name || 'Barber',
      profile_picture: row.profile_picture || null,
      email: row.email || undefined,
      is_active: Boolean(row.is_active),
      completed_services_count: Number(row.completed_services_count) || 0,
      total_revenue: Number(row.total_revenue) || 0,
      avg_rating: Number(row.avg_rating) || 5.0,
      total_reviews: Number(row.total_reviews) || 0,
      star5: Number(row.star5) || 0,
      star4: Number(row.star4) || 0,
      star3: Number(row.star3) || 0,
      star2: Number(row.star2) || 0,
      star1: Number(row.star1) || 0,
    }));

    const reviews: BarberReviewLogItem[] = reviewsRes.rows.map((row: any) => ({
      id: Number(row.id),
      barber_id: Number(row.barber_id),
      barber_name: row.barber_name || 'Barber',
      customer_name: row.customer_name || 'Guest Customer',
      stars: Number(row.stars) || 5,
      comment: row.comment || null,
      date: row.date,
      time: row.time,
      service_name: row.service_name || 'Haircut Service',
      queue_id: row.queue_id ? Number(row.queue_id) : null,
    }));

    const completed_services: BarberCompletedServiceLogItem[] = completedRes.rows.map((row: any) => ({
      id: Number(row.id),
      barber_id: Number(row.barber_id),
      barber_name: row.barber_name || 'Barber',
      customer_name: row.customer_name || 'Guest Customer',
      service_name: row.service_name || 'Classic Cut',
      price: Number(row.price) || 0,
      status: row.status,
      date: row.date,
      time: row.time,
      stars: row.stars ? Number(row.stars) : null,
      comment: row.comment || null,
    }));

    const totalReviewsCount = reviews.length;
    const avgRatingVal = totalReviewsCount > 0
      ? Math.round((reviews.reduce((acc, r) => acc + r.stars, 0) / totalReviewsCount) * 10) / 10
      : (barbers.length > 0 ? barbers[0].avg_rating : 5.0);
    const totalCompletedServicesCount = barbers.reduce((acc, b) => acc + b.completed_services_count, 0);

    const topBarber = barbers.length > 0 ? barbers[0] : null;

    const summary: BarberPerformanceReviewSummary = {
      overall_avg_rating: avgRatingVal,
      total_reviews: totalReviewsCount,
      total_completed_services: totalCompletedServicesCount,
      top_rated_barber: topBarber ? {
        barber_id: topBarber.barber_id,
        barber_name: topBarber.barber_name,
        avg_rating: topBarber.avg_rating,
        completed_services_count: topBarber.completed_services_count,
      } : null,
    };

    return {
      summary,
      barbers,
      reviews,
      completed_services,
    };
  }
  /**
   * Gets user stats (total, active, suspended, verified, unverified, role breakdown).
   */
  async getUserStats(): Promise<{
    total: number;
    active: number;
    suspended: number;
    verified: number;
    unverified: number;
    recent_7d: number;
    attention_required: number;
    customers: number;
    barbers: number;
    cashiers: number;
    inventory_managers: number;
    shop_admins: number;
    owners: number;
    system_admins: number;
    active_system_admins_count: number;
    role_counts: Record<string, number>;
  }> {
    const result = await db.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN deleted_at IS NULL THEN 1 END) as active,
        COUNT(CASE WHEN deleted_at IS NOT NULL THEN 1 END) as suspended,
        COUNT(CASE WHEN is_verified AND deleted_at IS NULL THEN 1 END) as verified,
        COUNT(CASE WHEN (NOT is_verified) AND deleted_at IS NULL THEN 1 END) as unverified,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 END) as recent_7d,
        COUNT(CASE WHEN ((NOT is_verified) AND deleted_at IS NULL) OR (deleted_at IS NOT NULL) THEN 1 END) as attention_required,
        COUNT(CASE WHEN LOWER(role::text) = 'customer' AND deleted_at IS NULL THEN 1 END) as customers,
        COUNT(CASE WHEN LOWER(role::text) = 'barber' AND deleted_at IS NULL THEN 1 END) as barbers,
        COUNT(CASE WHEN LOWER(role::text) = 'cashier' AND deleted_at IS NULL THEN 1 END) as cashiers,
        COUNT(CASE WHEN LOWER(role::text) IN ('inventory manager', 'inventorymanager') AND deleted_at IS NULL THEN 1 END) as inventory_managers,
        COUNT(CASE WHEN LOWER(role::text) IN ('shop admin', 'shopadmin', 'admin') AND deleted_at IS NULL THEN 1 END) as shop_admins,
        COUNT(CASE WHEN LOWER(role::text) = 'owner' AND deleted_at IS NULL THEN 1 END) as owners,
        COUNT(CASE WHEN LOWER(role::text) IN ('system admin', 'systemadmin') AND deleted_at IS NULL THEN 1 END) as system_admins,
        COUNT(CASE WHEN LOWER(role::text) IN ('system admin', 'systemadmin', 'owner') AND deleted_at IS NULL THEN 1 END) as active_system_admins_count
      FROM users
    `);
    const row = result.rows[0] || {};
    const systemAdmins = parseInt(row.system_admins) || 0;
    const owners = parseInt(row.owners) || 0;
    const shopAdmins = parseInt(row.shop_admins) || 0;
    const cashiers = parseInt(row.cashiers) || 0;
    const inventoryManagers = parseInt(row.inventory_managers) || 0;
    const barbers = parseInt(row.barbers) || 0;
    const customers = parseInt(row.customers) || 0;

    return {
      total: parseInt(row.total) || 0,
      active: parseInt(row.active) || 0,
      suspended: parseInt(row.suspended) || 0,
      verified: parseInt(row.verified) || 0,
      unverified: parseInt(row.unverified) || 0,
      recent_7d: parseInt(row.recent_7d) || 0,
      attention_required: parseInt(row.attention_required) || 0,
      customers,
      barbers,
      cashiers,
      inventory_managers: inventoryManagers,
      shop_admins: shopAdmins,
      owners,
      system_admins: systemAdmins,
      active_system_admins_count: parseInt(row.active_system_admins_count) || (systemAdmins + owners),
      role_counts: {
        'System Admin': systemAdmins,
        'Owner': owners,
        'Shop Admin': shopAdmins,
        'Cashier': cashiers,
        'Inventory Manager': inventoryManagers,
        'Barber': barbers,
        'Customer': customers,
      },
    };
  }

  /**
   * Returns count of active System Admins / Owners.
   */
  async countActiveSystemAdmins(): Promise<number> {
    const result = await db.query(`
      SELECT COUNT(*) as count 
      FROM users 
      WHERE deleted_at IS NULL 
        AND LOWER(role::text) IN ('system admin', 'systemadmin', 'owner')
    `);
    return parseInt(result.rows[0]?.count) || 0;
  }

  /**
   * Gets traffic data for the last 7 days.
   */
  async getTrafficData(): Promise<{ date: string; count: number }[]> {
    try {
      const result = await db.query(`
        SELECT 
          DATE_TRUNC('day', bucket_time) as date,
          SUM(request_count) as count
        FROM system_metrics
        WHERE bucket_time >= NOW() - INTERVAL '7 days'
        GROUP BY date
        ORDER BY date ASC
      `);
      return (result.rows || []).map((row: any) => {
        const dateObj = new Date(row.date);
        return {
          date: !isNaN(dateObj.getTime()) ? dateObj.toISOString().split('T')[0] : 'N/A',
          count: parseInt(row.count) || 0,
        };
      });
    } catch (err: any) {
      logger.error('[AdminRepository] Traffic query failed:', err);
      return [];
    }
  }

  /**
   * Returns total count of users matching filters.
   */
  async countUsers(options: {
    filter?: string;
    roleFilter?: string;
    statusFilter?: string;
    categoryFilter?: string;
    search?: string;
  } | string, legacyRoleFilter?: string): Promise<number> {
    const opts = typeof options === 'string'
      ? { filter: options, roleFilter: legacyRoleFilter }
      : options;

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (opts.statusFilter === 'active') {
      conditions.push('deleted_at IS NULL');
    } else if (opts.statusFilter === 'suspended') {
      conditions.push('deleted_at IS NOT NULL');
    }

    if (opts.filter === 'verified') {
      conditions.push('is_verified = TRUE');
    } else if (opts.filter === 'unverified') {
      conditions.push('is_verified = FALSE');
    } else if (opts.filter === 'attention_required') {
      conditions.push('(((NOT is_verified) AND deleted_at IS NULL) OR (deleted_at IS NOT NULL))');
    }

    if (opts.categoryFilter === 'customers') {
      conditions.push("LOWER(role::text) = 'customer'");
    } else if (opts.categoryFilter === 'staff') {
      conditions.push("LOWER(role::text) IN ('barber', 'cashier', 'inventory manager', 'inventorymanager')");
    } else if (opts.categoryFilter === 'admins') {
      conditions.push("LOWER(role::text) IN ('system admin', 'systemadmin', 'owner', 'shop admin', 'shopadmin', 'admin')");
    }

    if (opts.roleFilter && opts.roleFilter !== 'all') {
      conditions.push(`role = $${paramIndex++}`);
      params.push(opts.roleFilter);
    }

    if (opts.search && opts.search.trim()) {
      const searchParam = `%${opts.search.trim()}%`;
      conditions.push(`(username ILIKE $${paramIndex} OR email ILIKE $${paramIndex} OR user_id::text ILIKE $${paramIndex})`);
      params.push(searchParam);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await db.query(`SELECT COUNT(*) FROM users ${whereClause}`, params);
    return parseInt(result.rows[0].count);
  }

  /**
   * Returns paginated users matching filters.
   */
  async findUsersPaginated(
    options: {
      filter?: string;
      limit: number;
      offset: number;
      roleFilter?: string;
      sortBy?: string;
      statusFilter?: string;
      categoryFilter?: string;
      search?: string;
    } | string,
    legacyLimit?: number,
    legacyOffset?: number,
    legacyRoleFilter?: string,
    legacySortBy?: string
  ): Promise<any[]> {
    const opts = typeof options === 'string'
      ? {
        filter: options,
        limit: legacyLimit || 10,
        offset: legacyOffset || 0,
        roleFilter: legacyRoleFilter,
        sortBy: legacySortBy,
      }
      : options;

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (opts.statusFilter === 'active') {
      conditions.push('u.deleted_at IS NULL');
    } else if (opts.statusFilter === 'suspended') {
      conditions.push('u.deleted_at IS NOT NULL');
    }

    if (opts.filter === 'verified') {
      conditions.push('u.is_verified = TRUE');
    } else if (opts.filter === 'unverified') {
      conditions.push('u.is_verified = FALSE');
    } else if (opts.filter === 'attention_required') {
      conditions.push('(((NOT u.is_verified) AND u.deleted_at IS NULL) OR (u.deleted_at IS NOT NULL))');
    }

    if (opts.categoryFilter === 'customers') {
      conditions.push("LOWER(u.role::text) = 'customer'");
    } else if (opts.categoryFilter === 'staff') {
      conditions.push("LOWER(u.role::text) IN ('barber', 'cashier', 'inventory manager', 'inventorymanager')");
    } else if (opts.categoryFilter === 'admins') {
      conditions.push("LOWER(u.role::text) IN ('system admin', 'systemadmin', 'owner', 'shop admin', 'shopadmin', 'admin')");
    }

    if (opts.roleFilter && opts.roleFilter !== 'all') {
      conditions.push(`u.role = $${paramIndex++}`);
      params.push(opts.roleFilter);
    }

    if (opts.search && opts.search.trim()) {
      const searchParam = `%${opts.search.trim()}%`;
      conditions.push(`(u.username ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex} OR u.user_id::text ILIKE $${paramIndex})`);
      params.push(searchParam);
      paramIndex++;
    }

    // Sanitize and construct ORDER BY clause
    let orderBy = 'ORDER BY u.created_at DESC';
    if (opts.sortBy) {
      const allowedSorts: Record<string, string> = {
        'username_asc': 'u.username ASC',
        'username_desc': 'u.username DESC',
        'email_asc': 'u.email ASC',
        'email_desc': 'u.email DESC',
        'created_at_asc': 'u.created_at ASC',
        'created_at_desc': 'u.created_at DESC',
      };
      if (allowedSorts[opts.sortBy]) {
        orderBy = `ORDER BY ${allowedSorts[opts.sortBy]}`;
      }
    }

    params.push(opts.limit);
    const limitIndex = paramIndex++;
    params.push(opts.offset);
    const offsetIndex = paramIndex++;

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await db.query(
      `SELECT u.user_id, u.username, u.role, u.is_verified, u.created_at, u.email, u.deleted_at,
              (u.deleted_at IS NOT NULL) as is_suspended, u.profile_picture, u.branch_id,
              u.google_id, u.account_source, u.created_by,
              creator.username as creator_username, creator.email as creator_email, creator.role as creator_role
       FROM users u
       LEFT JOIN LATERAL (
         SELECT a.user_id as creator_id
         FROM audit_logs a
         WHERE a.action IN ('ADMIN_CREATE', 'STAFF_CREATE')
           AND (a.details->>'email' = u.email OR a.details->>'updated_user_id' = u.user_id::text)
         ORDER BY a.created_at ASC
         LIMIT 1
       ) al ON TRUE
       LEFT JOIN users creator ON creator.user_id = COALESCE(u.created_by, al.creator_id)
       ${whereClause}
       ${orderBy}
       LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
      params
    );
    return result.rows;
  }

  /**
   * Returns all admin and owner users.
   */
  async findAdmins(): Promise<any[]> {
    const result = await db.query(`
      SELECT 
        user_id, email, username, profile_picture, role, created_at, deleted_at,
        (deleted_at IS NOT NULL) as is_suspended
      FROM users
      WHERE role IN ('System Admin', 'Owner')
      ORDER BY created_at DESC
    `);
    return result.rows;
  }

  /**
   * Returns active Owner/Admin recipients for operational inventory emails.
   * Branch-less owners remain eligible because this application has one branch
   * and global administrative accounts may oversee branch operations.
   */
  async findActiveInventoryEmailRecipients(branchId?: number | null): Promise<Array<{
    user_id: string;
    email: string;
    username: string | null;
    role: string;
  }>> {
    const result = await db.query(
      `SELECT user_id, email, username, role
       FROM users
       WHERE deleted_at IS NULL
         AND NULLIF(TRIM(email), '') IS NOT NULL
         AND LOWER(TRIM(role::text)) IN ('owner', 'admin', 'shopadmin', 'system admin')
         AND ($1::int IS NULL OR branch_id IS NULL OR branch_id = $1)
       ORDER BY created_at ASC`,
      [branchId ?? null],
    );
    return result.rows;
  }

  /**
   * Returns active Owner/Admin recipients for stock-request notifications.
   * System Admin is intentionally excluded from this operational workflow.
   */
  async findActivePurchaseOrderRecipients(branchId?: number | null): Promise<Array<{
    user_id: string;
    email: string;
    username: string | null;
    role: string;
  }>> {
    const result = await db.query(
      `SELECT user_id, email, username, role
       FROM users
       WHERE deleted_at IS NULL
         AND NULLIF(TRIM(email), '') IS NOT NULL
         AND LOWER(TRIM(role::text)) IN ('owner', 'admin', 'shopadmin')
         AND ($1::int IS NULL OR branch_id IS NULL OR branch_id = $1)
       ORDER BY created_at ASC`,
      [branchId ?? null],
    );
    return result.rows;
  }

  /**
   * Checks if a user already exists by email. Email matching is case-insensitive
   * because Supabase Auth normalizes email identifiers.
   */
  async findUserByEmail(email: string): Promise<{ user_id: string } | null> {
    const result = await db.query(
      'SELECT user_id FROM users WHERE LOWER(email) = LOWER($1)',
      [email],
    );
    return result.rows[0] || null;
  }

  /**
   * Finds a public profile by its Supabase Auth UUID.
   */
  async findUserById(userId: string): Promise<{ user_id: string; email: string; role: string; username?: string | null; profile_picture?: string | null } | null> {
    const result = await db.query(
      'SELECT user_id, email, role, username, profile_picture FROM users WHERE user_id = $1',
      [userId],
    );
    return result.rows[0] || null;
  }

  /**
   * Updates a Cashier's optional inventory management access flag.
   */
  async updateCashierInventoryAccess(userId: string, canAccess: boolean): Promise<{ user_id: string; role: string; can_access_inventory: boolean; email: string; username: string } | null> {
    const result = await db.query(
      `UPDATE public.users 
       SET can_access_inventory = $1, updated_at = NOW()
       WHERE user_id = $2
       RETURNING user_id, role, can_access_inventory, email, username`,
      [Boolean(canAccess), userId]
    );
    return result.rows[0] || null;
  }

  /**
   * Promotes the trigger-created public Customer profile for a newly created
   * Supabase Auth user. The Auth UUID is the only trusted identity key here;
   * the requested staff role is applied inside this protected transaction.
   */
  async promoteAuthUser(data: {
    userId: string;
    email: string;
    passwordHash: string;
    role: string;
    username: string | null;
    profilePicture: string | null;
    createdBy?: string | null;
    accountSource?: string | null;
  }): Promise<any> {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      const profile = await client.query(
        `SELECT user_id, email
         FROM users
         WHERE user_id = $1
         FOR UPDATE`,
        [data.userId],
      );
      if (profile.rowCount !== 1) {
        throw new Error('Supabase Auth user has no public profile. Apply the Auth trigger migration first.');
      }
      if (String(profile.rows[0].email || '').trim().toLowerCase() !== data.email) {
        throw new Error('Supabase Auth and public profile emails do not match.');
      }

      const result = await client.query(
        `UPDATE users
         SET email = $2,
             password_hash = $3,
             role = $4,
             username = $5,
             profile_picture = $6,
             is_verified = TRUE,
             deleted_at = NULL,
             created_by = COALESCE($7, created_by),
             account_source = COALESCE($8, account_source, 'system_admin')
         WHERE user_id = $1
         RETURNING user_id, email, username, profile_picture, role, created_at, created_by, account_source`,
        [
          data.userId,
          data.email,
          data.passwordHash,
          data.role,
          data.username,
          data.profilePicture,
          data.createdBy || null,
          data.accountSource || 'system_admin',
        ],
      );
      if (result.rowCount !== 1) {
        throw new Error('The Auth profile could not be promoted.');
      }

      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Promotes and synchronizes a newly created Supabase Auth user as a Staff member (Barber or Cashier).
   * Ensures the profile exists, sets role, updates name, branch, and provisions barbers row if role is Barber.
   */
  async promoteAuthStaff(data: {
    userId: string;
    email: string;
    passwordHash: string;
    role: string;
    name: string;
    username?: string | null;
    profilePicture?: string | null;
    branchId?: number | null;
    createdBy?: string | null;
    accountSource?: string | null;
  }): Promise<any> {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      const profile = await client.query(
        `SELECT user_id, email
         FROM users
         WHERE user_id = $1
         FOR UPDATE`,
        [data.userId],
      );

      let userResult;
      if (profile.rowCount === 0) {
        // Trigger might not have fired yet, insert directly
        userResult = await client.query(
          `INSERT INTO users (user_id, email, password_hash, role, username, profile_picture, branch_id, is_verified, created_at, created_by, account_source)
           VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, NOW(), $8, $9)
           ON CONFLICT (user_id) DO UPDATE SET
             email = EXCLUDED.email,
             password_hash = EXCLUDED.password_hash,
             role = EXCLUDED.role,
             username = EXCLUDED.username,
             profile_picture = COALESCE(EXCLUDED.profile_picture, users.profile_picture),
             branch_id = COALESCE(EXCLUDED.branch_id, users.branch_id),
             is_verified = TRUE,
             deleted_at = NULL,
             created_by = COALESCE(EXCLUDED.created_by, users.created_by),
             account_source = COALESCE(EXCLUDED.account_source, users.account_source)
           RETURNING user_id, email, username, profile_picture, role, branch_id, created_at, created_by, account_source`,
          [
            data.userId,
            data.email,
            data.passwordHash,
            data.role,
            data.username || data.name,
            data.profilePicture || null,
            data.branchId || 1,
            data.createdBy || null,
            data.accountSource || 'admin',
          ],
        );
      } else {
        userResult = await client.query(
          `UPDATE users
           SET email = $2,
               password_hash = $3,
               role = $4,
               username = $5,
               profile_picture = $6,
               branch_id = COALESCE($7, branch_id),
               is_verified = TRUE,
               deleted_at = NULL,
               created_by = COALESCE($8, created_by),
               account_source = COALESCE($9, account_source, 'admin')
           WHERE user_id = $1
           RETURNING user_id, email, username, profile_picture, role, branch_id, created_at, created_by, account_source`,
          [
            data.userId,
            data.email,
            data.passwordHash,
            data.role,
            data.username || data.name,
            data.profilePicture || null,
            data.branchId || null,
            data.createdBy || null,
            data.accountSource || 'admin',
          ],
        );
      }

      if (userResult.rowCount !== 1) {
        throw new Error('The staff user profile could not be updated.');
      }

      // Clean up default customer record created by public triggers
      await client.query('DELETE FROM customers WHERE user_id = $1', [data.userId]);

      let barberRecord: any = null;
      if (data.role === 'Barber') {
        const barberRes = await client.query(
          `INSERT INTO barbers (user_id, name, is_active, status)
           VALUES ($1, $2, TRUE, 'available')
           ON CONFLICT (user_id) DO UPDATE SET
             name = EXCLUDED.name,
             is_active = TRUE,
             status = 'available'
           RETURNING barber_id, user_id, name, is_active, status`,
          [data.userId, data.name],
        );
        barberRecord = barberRes.rows[0];
      }

      await client.query('COMMIT');
      return {
        ...userResult.rows[0],
        name: data.name,
        barber_id: barberRecord?.barber_id || null,
        status: 'Available',
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Removes the public rows created for a failed Auth-first provisioning
   * attempt. This is only called for a newly created Auth UUID.
   */
  async deleteProvisionedAuthProfile(userId: string): Promise<void> {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM user_sessions WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM audit_logs WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM customers WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM barbers WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM users WHERE user_id = $1', [userId]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Updates an admin user with dynamic fields.
   */
  async updateAdminUser(
    id: string,
    data: { email?: string; role?: string; username?: string | null; profilePicture?: string }
  ): Promise<any | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let index = 1;

    if (data.email) { fields.push(`email = $${index++}`); values.push(data.email); }
    if (data.role) { fields.push(`role = $${index++}`); values.push(data.role); }
    if (data.username !== undefined) { fields.push(`username = $${index++}`); values.push(data.username || null); }
    if (data.profilePicture !== undefined) { fields.push(`profile_picture = $${index++}`); values.push(data.profilePicture); }

    if (fields.length === 0) return null;

    values.push(id);
    const result = await db.query(
      `UPDATE users 
       SET ${fields.join(', ')}
       WHERE user_id = $${index}
       RETURNING user_id, email, username, profile_picture, role`,
      values
    );
    return result.rows[0] || null;
  }

  /**
   * Updates a staff member profile, syncing user record and barbers table if applicable.
   */
  async updateStaffMember(
    id: string,
    data: {
      name?: string;
      email?: string;
      role?: string;
      username?: string | null;
      profilePicture?: string;
      specialty?: string;
      branchId?: number;
    }
  ): Promise<any | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let index = 1;

    const displayName = data.name || data.username;
    if (data.email) { fields.push(`email = $${index++}`); values.push(data.email); }
    if (data.role) { fields.push(`role = $${index++}`); values.push(data.role); }
    if (displayName !== undefined) { fields.push(`username = $${index++}`); values.push(displayName); }
    if (data.profilePicture !== undefined) { fields.push(`profile_picture = $${index++}`); values.push(data.profilePicture); }
    if (data.branchId !== undefined) { fields.push(`branch_id = $${index++}`); values.push(data.branchId); }

    if (fields.length > 0) {
      values.push(id);
      await db.query(
        `UPDATE users 
         SET ${fields.join(', ')}
         WHERE user_id = $${index}`,
        values
      );
    }

    // Sync barbers table if name or role changes
    if (displayName) {
      await db.query(
        `UPDATE barbers SET name = $1 WHERE user_id = $2`,
        [displayName, id]
      );
    }

    if (data.role === 'Barber') {
      await db.query(
        `INSERT INTO barbers (user_id, name, is_active, status)
         VALUES ($1, $2, TRUE, 'available')
         ON CONFLICT (user_id) DO UPDATE SET
           name = COALESCE(EXCLUDED.name, barbers.name),
           is_active = TRUE`,
        [id, displayName || 'Barber']
      );
    }

    const updated = await db.query(
      `SELECT u.user_id, u.email, u.username, u.role, u.branch_id, b.barber_id, COALESCE(b.name, u.username, u.email) as name
       FROM users u
       LEFT JOIN barbers b ON b.user_id = u.user_id
       WHERE u.user_id = $1`,
      [id]
    );

    return updated.rows[0] || null;
  }

  /**
   * Soft-deletes (suspends) a user by setting deleted_at.
   */
  async suspendUser(id: string): Promise<any | null> {
    const result = await db.query(
      `UPDATE users SET deleted_at = NOW() WHERE user_id = $1 RETURNING user_id, deleted_at`,
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Restores a suspended user by clearing deleted_at.
   */
  async restoreUser(id: string): Promise<any | null> {
    const result = await db.query(
      `UPDATE users SET deleted_at = NULL WHERE user_id = $1 RETURNING user_id, deleted_at`,
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Updates a user's password hash.
   */
  async updatePassword(id: string, passwordHash: string): Promise<any | null> {
    const result = await db.query(
      `UPDATE users SET password_hash = $1 WHERE user_id = $2 RETURNING user_id`,
      [passwordHash, id]
    );
    return result.rows[0] || null;
  }

  /**
   * Retrieves live branch statistics and today's schedule for the Admin Dashboard.
   */
  async getBranchStats(branchId?: number, targetMonth?: string): Promise<any> {
    const param = branchId || null;
    const sanitizedMonth = targetMonth
      ? (targetMonth.length === 7 ? `${targetMonth}-01` : targetMonth)
      : null;

    const [
      branchRes,
      revenueRes,
      queueRes,
      customersRes,
      avgServiceRes,
      scheduleRes,
      chartRes,
      topServicesRes,
      ratingsRes,
      onlineBookingsRes,
      customersServedRes,
      staffRes,
      chart30dRes,
      chart12mRes,
      monthlyServedRes,
      topBarbersRes,
      recentReviewsRes,
    ] = await Promise.all([
      param ? db.query('SELECT branch_id, name FROM branches WHERE branch_id = $1', [param]) : Promise.resolve({ rows: [] }),
      db.query(`
        SELECT 
          COALESCE(SUM(CASE WHEN DATE(created_at AT TIME ZONE 'Asia/Manila') = (NOW() AT TIME ZONE 'Asia/Manila')::date THEN total_amount ELSE 0 END), 0)::numeric AS today_revenue,
          COALESCE(SUM(CASE WHEN DATE(created_at AT TIME ZONE 'Asia/Manila') = (NOW() AT TIME ZONE 'Asia/Manila')::date - INTERVAL '1 day' THEN total_amount ELSE 0 END), 0)::numeric AS yesterday_revenue,
          COALESCE(SUM(CASE WHEN DATE_TRUNC('month', created_at AT TIME ZONE 'Asia/Manila') = DATE_TRUNC('month', NOW() AT TIME ZONE 'Asia/Manila') THEN total_amount ELSE 0 END), 0)::numeric AS this_month_revenue,
          COALESCE(SUM(CASE WHEN DATE_TRUNC('month', created_at AT TIME ZONE 'Asia/Manila') = DATE_TRUNC('month', (NOW() AT TIME ZONE 'Asia/Manila') - INTERVAL '1 month') THEN total_amount ELSE 0 END), 0)::numeric AS last_month_revenue,
          COALESCE(SUM(total_amount), 0)::numeric AS total_all_time_revenue
        FROM transactions
        WHERE ($1::int IS NULL OR branch_id = $1)
      `, [param]),
      db.query(`
        SELECT 
          COUNT(CASE WHEN (DATE(created_at) = CURRENT_DATE OR preferred_date = CURRENT_DATE) THEN 1 END)::int AS today_appointments,
          COUNT(CASE WHEN (DATE(created_at) = CURRENT_DATE - INTERVAL '1 day' OR preferred_date = CURRENT_DATE - INTERVAL '1 day') THEN 1 END)::int AS yesterday_appointments
        FROM queue_entries
        WHERE ($1::int IS NULL OR branch_id = $1)
      `, [param]),
      db.query(`
        SELECT 
          COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 END)::int AS this_week_customers,
          COUNT(CASE WHEN created_at >= NOW() - INTERVAL '14 days' AND created_at < NOW() - INTERVAL '7 days' THEN 1 END)::int AS last_week_customers
        FROM customers
      `),
      db.query(`
        SELECT COALESCE(ROUND(AVG(total_amount)::numeric, 0), 0)::numeric AS avg_service_amount
        FROM transactions
        WHERE ($1::int IS NULL OR branch_id = $1)
      `, [param]),
      db.query(`
        SELECT 
          qe.id,
          COALESCE(
            NULLIF(TRIM(CONCAT(COALESCE(c.first_name, ''), ' ', COALESCE(c.last_name, ''))), ''),
            qe.customer_name,
            'Guest Customer'
          ) AS client,
          COALESCE(s.title, 'Classic Cut') AS service,
          COALESCE(b.name, 'Unassigned') AS barber,
          COALESCE(
            qe.preferred_time,
            TO_CHAR(qe.scheduled_start_at, 'HH12:MI AM'),
            TO_CHAR(qe.created_at, 'HH12:MI AM')
          ) AS time,
          qe.status,
          COALESCE(s.price, 0)::numeric AS price,
          qe.created_at
        FROM queue_entries qe
        LEFT JOIN customers c ON c.customer_id = qe.customer_id
        LEFT JOIN barbers b ON b.barber_id = qe.barber_id
        LEFT JOIN services s ON s.service_id = qe.service_id
        WHERE ($1::int IS NULL OR qe.branch_id = $1)
          AND (
            DATE(qe.created_at) = CURRENT_DATE
            OR qe.preferred_date = CURRENT_DATE
            OR qe.status::text IN ('pending', 'waiting', 'serving', 'accepted')
          )
        ORDER BY 
          CASE 
            WHEN qe.status::text = 'serving' THEN 1
            WHEN qe.status::text IN ('pending', 'waiting', 'accepted') THEN 2
            WHEN qe.status::text = 'completed' THEN 3
            ELSE 4
          END,
          qe.created_at DESC
        LIMIT 20
      `, [param]),
      db.query(`
        WITH days AS (
          SELECT generate_series(
            (NOW() AT TIME ZONE 'Asia/Manila')::date - INTERVAL '6 days',
            (NOW() AT TIME ZONE 'Asia/Manila')::date,
            '1 day'::interval
          )::date AS day_date
        )
        SELECT 
          d.day_date::text AS date,
          TO_CHAR(d.day_date, 'Dy') as day,
          COALESCE(SUM(t.total_amount), 0)::numeric AS revenue
        FROM days d
        LEFT JOIN transactions t ON (t.created_at AT TIME ZONE 'Asia/Manila')::date = d.day_date 
          AND ($1::int IS NULL OR t.branch_id = $1)
        GROUP BY d.day_date
        ORDER BY d.day_date ASC
      `, [param]),
      db.query(`
        SELECT 
          s.title AS name,
          COUNT(qe.id)::int AS count
        FROM services s
        JOIN queue_entries qe ON qe.service_id = s.service_id
        WHERE ($1::int IS NULL OR qe.branch_id = $1)
        GROUP BY s.service_id, s.title
        ORDER BY count DESC
        LIMIT 4
      `, [param]),
      db.query(`
        SELECT 
          COALESCE(ROUND(AVG(stars)::numeric, 1), 5.0)::numeric as average_rating,
          COUNT(*)::int as total_reviews,
          COUNT(CASE WHEN stars = 5 THEN 1 END)::int as star5,
          COUNT(CASE WHEN stars = 4 THEN 1 END)::int as star4,
          COUNT(CASE WHEN stars = 3 THEN 1 END)::int as star3,
          COUNT(CASE WHEN stars = 2 THEN 1 END)::int as star2,
          COUNT(CASE WHEN stars = 1 THEN 1 END)::int as star1
        FROM ratings r
        LEFT JOIN queue_entries qe ON qe.id = r.queue_id
        WHERE ($1::int IS NULL OR qe.branch_id = $1)
      `, [param]),
      db.query(`
        SELECT
          COUNT(CASE WHEN qe.is_walk_in = FALSE AND DATE_TRUNC('month', qe.created_at AT TIME ZONE 'Asia/Manila') = DATE_TRUNC('month', NOW() AT TIME ZONE 'Asia/Manila') THEN 1 END)::int AS this_month_online,
          COUNT(CASE WHEN qe.is_walk_in = FALSE AND DATE_TRUNC('month', qe.created_at AT TIME ZONE 'Asia/Manila') = DATE_TRUNC('month', (NOW() AT TIME ZONE 'Asia/Manila') - INTERVAL '1 month') THEN 1 END)::int AS last_month_online,
          COUNT(CASE WHEN qe.is_walk_in = FALSE THEN 1 END)::int AS total_online
        FROM queue_entries qe
        WHERE ($1::int IS NULL OR qe.branch_id = $1)
      `, [param]),
      db.query(`
        SELECT
          COUNT(CASE WHEN (qe.is_walk_in = TRUE OR qe.is_walk_in IS NULL) AND DATE_TRUNC('month', qe.created_at AT TIME ZONE 'Asia/Manila') = DATE_TRUNC('month', NOW() AT TIME ZONE 'Asia/Manila') THEN 1 END)::int AS this_month_walk_in,
          COUNT(CASE WHEN (qe.is_walk_in = TRUE OR qe.is_walk_in IS NULL) AND DATE_TRUNC('month', qe.created_at AT TIME ZONE 'Asia/Manila') = DATE_TRUNC('month', (NOW() AT TIME ZONE 'Asia/Manila') - INTERVAL '1 month') THEN 1 END)::int AS last_month_walk_in,
          COUNT(CASE WHEN (qe.is_walk_in = TRUE OR qe.is_walk_in IS NULL) THEN 1 END)::int AS total_walk_in,
          COUNT(CASE WHEN qe.status::text = 'completed' AND DATE_TRUNC('month', qe.created_at AT TIME ZONE 'Asia/Manila') = DATE_TRUNC('month', NOW() AT TIME ZONE 'Asia/Manila') THEN 1 END)::int AS this_month_completed,
          COUNT(CASE WHEN qe.status::text = 'completed' AND DATE_TRUNC('month', qe.created_at AT TIME ZONE 'Asia/Manila') = DATE_TRUNC('month', (NOW() AT TIME ZONE 'Asia/Manila') - INTERVAL '1 month') THEN 1 END)::int AS last_month_completed,
          COUNT(CASE WHEN qe.status::text = 'completed' THEN 1 END)::int AS total_completed
        FROM queue_entries qe
        WHERE ($1::int IS NULL OR qe.branch_id = $1)
      `, [param]),
      db.query(`
        SELECT
          COUNT(DISTINCT u.user_id)::int AS total_staff,
          COUNT(DISTINCT CASE WHEN b.is_active = TRUE AND COALESCE(b.status::text, 'available') IN ('available', 'serving') THEN u.user_id END)::int AS active_staff
        FROM users u
        LEFT JOIN barbers b ON b.user_id = u.user_id
        WHERE u.role::text IN ('Barber', 'Cashier')
          AND u.deleted_at IS NULL
          AND ($1::int IS NULL OR u.branch_id = $1)
      `, [param]),
      db.query(`
        WITH days AS (
          SELECT generate_series(
            (NOW() AT TIME ZONE 'Asia/Manila')::date - INTERVAL '29 days',
            (NOW() AT TIME ZONE 'Asia/Manila')::date,
            '1 day'::interval
          )::date AS day_date
        )
        SELECT 
          d.day_date::text AS date,
          TO_CHAR(d.day_date, 'Mon DD') as day,
          COALESCE(SUM(t.total_amount), 0)::numeric AS revenue
        FROM days d
        LEFT JOIN transactions t ON (t.created_at AT TIME ZONE 'Asia/Manila')::date = d.day_date 
          AND ($1::int IS NULL OR t.branch_id = $1)
        GROUP BY d.day_date
        ORDER BY d.day_date ASC
      `, [param]),
      db.query(`
        WITH months AS (
          SELECT generate_series(
            DATE_TRUNC('month', (NOW() AT TIME ZONE 'Asia/Manila')::date) - INTERVAL '11 months',
            DATE_TRUNC('month', (NOW() AT TIME ZONE 'Asia/Manila')::date),
            '1 month'::interval
          )::date AS month_date
        )
        SELECT
          m.month_date::text AS date,
          TO_CHAR(m.month_date, 'Mon YY') AS day,
          COALESCE(SUM(t.total_amount), 0)::numeric AS revenue
        FROM months m
        LEFT JOIN transactions t ON DATE_TRUNC('month', t.created_at AT TIME ZONE 'Asia/Manila') = m.month_date
          AND ($1::int IS NULL OR t.branch_id = $1)
        GROUP BY m.month_date
        ORDER BY m.month_date ASC
      `, [param]),
      db.query(`
        WITH target AS (
          SELECT COALESCE($2::date, (NOW() AT TIME ZONE 'Asia/Manila')::date) AS ref_date
        ),
        days AS (
          SELECT generate_series(
            DATE_TRUNC('month', (SELECT ref_date FROM target))::date,
            CASE 
              WHEN DATE_TRUNC('month', (SELECT ref_date FROM target)) = DATE_TRUNC('month', NOW() AT TIME ZONE 'Asia/Manila')
                THEN (NOW() AT TIME ZONE 'Asia/Manila')::date
              ELSE (DATE_TRUNC('month', (SELECT ref_date FROM target)) + INTERVAL '1 month - 1 day')::date
            END,
            '1 day'::interval
          )::date AS day_date
        )
        SELECT
          d.day_date::text AS date,
          TO_CHAR(d.day_date, 'FMDD') AS day,
          TO_CHAR(d.day_date, 'Dy') AS weekday,
          COUNT(CASE WHEN qe.status::text = 'completed' THEN 1 END)::int AS count,
          COUNT(CASE WHEN qe.status::text = 'completed' AND (qe.is_walk_in = TRUE OR qe.is_walk_in IS NULL) THEN 1 END)::int AS walk_in_count,
          COUNT(CASE WHEN qe.status::text = 'completed' AND qe.is_walk_in = FALSE THEN 1 END)::int AS online_count
        FROM days d
        LEFT JOIN queue_entries qe ON (qe.created_at AT TIME ZONE 'Asia/Manila')::date = d.day_date
          AND ($1::int IS NULL OR qe.branch_id = $1)
        GROUP BY d.day_date
        ORDER BY d.day_date ASC
      `, [param, sanitizedMonth]),
      db.query(`
        SELECT
          b.barber_id,
          COALESCE(b.name, u.username, 'Barber') AS barber_name,
          u.profile_picture,
          COALESCE(qe_agg.completed_services_count, 0)::int AS completed_services_count,
          COALESCE(qe_agg.total_revenue, 0)::numeric AS total_revenue,
          COALESCE(r_agg.rating, 5.0)::numeric AS rating,
          COALESCE(r_agg.review_count, 0)::int AS review_count
        FROM barbers b
        JOIN users u ON u.user_id = b.user_id
        LEFT JOIN (
          SELECT
            qe.barber_id,
            COUNT(CASE WHEN qe.status::text = 'completed' THEN 1 END)::int AS completed_services_count,
            COALESCE(SUM(
              CASE
                WHEN qe.status::text = 'completed' THEN COALESCE(t.total_amount, s.price, 250)
                ELSE 0
              END
            ), 0)::numeric AS total_revenue
          FROM queue_entries qe
          LEFT JOIN services s ON s.service_id = qe.service_id
          LEFT JOIN transactions t ON t.queue_entry_id = qe.id
          WHERE ($1::int IS NULL OR qe.branch_id = $1)
          GROUP BY qe.barber_id
        ) qe_agg ON qe_agg.barber_id = b.barber_id
        LEFT JOIN (
          SELECT
            r.barber_id,
            COALESCE(ROUND(AVG(r.stars)::numeric, 1), 5.0)::numeric AS rating,
            COUNT(*)::int AS review_count
          FROM ratings r
          GROUP BY r.barber_id
        ) r_agg ON r_agg.barber_id = b.barber_id
        WHERE COALESCE(b.is_active, TRUE) = TRUE
          AND u.deleted_at IS NULL
          AND ($1::int IS NULL OR u.branch_id = $1)
        ORDER BY completed_services_count DESC, total_revenue DESC, b.barber_id ASC
        LIMIT 10
      `, [param]),
      db.query(`
        SELECT r.rating_id AS id,
          COALESCE(NULLIF(TRIM(CONCAT(c.first_name, ' ', c.last_name)), ''), 'Guest Customer') AS customer_name,
          COALESCE(b.name, 'Barber') AS barber_name,
          r.stars, r.comment, TO_CHAR(r.created_at, 'YYYY-MM-DD') AS date
        FROM ratings r
        LEFT JOIN queue_entries qe ON qe.id = r.queue_id
        LEFT JOIN customers c ON c.customer_id = r.customer_id
        LEFT JOIN barbers b ON b.barber_id = r.barber_id
        WHERE ($1::int IS NULL OR qe.branch_id = $1)
        ORDER BY r.created_at DESC, r.rating_id DESC
        LIMIT 3
      `, [param]),
    ]);

    const branchName = branchRes.rows[0]?.name || 'SampleBranch Branch';
    const revRow = revenueRes.rows[0] || { today_revenue: 0, yesterday_revenue: 0, this_month_revenue: 0, last_month_revenue: 0, total_all_time_revenue: 0 };
    const queueRow = queueRes.rows[0] || { today_appointments: 0, yesterday_appointments: 0 };
    const custRow = customersRes.rows[0] || { this_week_customers: 0, last_week_customers: 0 };
    const avgServiceRow = avgServiceRes.rows[0] || { avg_service_amount: 0 };
    const onlineRow = onlineBookingsRes.rows[0] || { this_month_online: 0, last_month_online: 0, total_online: 0 };
    const custServedRow = customersServedRes.rows[0] || { this_month_completed: 0, last_month_completed: 0, total_completed: 0 };
    const staffRow = staffRes.rows[0] || { total_staff: 0, active_staff: 0 };
    const ratingRow = ratingsRes.rows[0] || {
      average_rating: 5.0,
      total_reviews: 0,
      star5: 0,
      star4: 0,
      star3: 0,
      star2: 0,
      star1: 0,
    };

    // Calculate all-time revenue & month-over-month growth for Total Revenue card
    const allTimeRev = Number(revRow.total_all_time_revenue) || 0;
    const thisMonthRev = Number(revRow.this_month_revenue) || 0;
    const lastMonthRev = Number(revRow.last_month_revenue) || 0;
    let revChange = '+0%';
    if (lastMonthRev === 0 && thisMonthRev > 0) revChange = '+100%';
    else if (lastMonthRev > 0) {
      const diff = Math.round(((thisMonthRev - lastMonthRev) / lastMonthRev) * 100);
      revChange = `${diff >= 0 ? '+' : ''}${diff}%`;
    }

    const todayApts = Number(queueRow.today_appointments) || 0;
    const yestApts = Number(queueRow.yesterday_appointments) || 0;
    let aptsChange = '+0%';
    if (yestApts === 0 && todayApts > 0) aptsChange = '+100%';
    else if (yestApts > 0) {
      const diff = Math.round(((todayApts - yestApts) / yestApts) * 100);
      aptsChange = `${diff >= 0 ? '+' : ''}${diff}%`;
    }

    const thisWeekCust = Number(custRow.this_week_customers) || 0;
    const lastWeekCust = Number(custRow.last_week_customers) || 0;
    let custChange = '+0%';
    if (lastWeekCust === 0 && thisWeekCust > 0) custChange = '+100%';
    else if (lastWeekCust > 0) {
      const diff = Math.round(((thisWeekCust - lastWeekCust) / lastWeekCust) * 100);
      custChange = `${diff >= 0 ? '+' : ''}${diff}%`;
    }

    const totalOnline = Number(onlineRow.total_online) || 0;
    const thisMonthOnline = Number(onlineRow.this_month_online) || 0;
    const lastMonthOnline = Number(onlineRow.last_month_online) || 0;
    let onlineChange = '+0%';
    if (lastMonthOnline === 0 && thisMonthOnline > 0) onlineChange = '+100%';
    else if (lastMonthOnline > 0) {
      const diff = Math.round(((thisMonthOnline - lastMonthOnline) / lastMonthOnline) * 100);
      onlineChange = `${diff >= 0 ? '+' : ''}${diff}%`;
    }

    const totalWalkIn = Number(custServedRow.total_walk_in ?? custServedRow.total_completed) || 0;
    const thisMonthWalkIn = Number(custServedRow.this_month_walk_in ?? custServedRow.this_month_completed) || 0;
    const lastMonthWalkIn = Number(custServedRow.last_month_walk_in ?? custServedRow.last_month_completed) || 0;
    let walkInChange = '+0%';
    if (lastMonthWalkIn === 0 && thisMonthWalkIn > 0) walkInChange = '+100%';
    else if (lastMonthWalkIn > 0) {
      const diff = Math.round(((thisMonthWalkIn - lastMonthWalkIn) / lastMonthWalkIn) * 100);
      walkInChange = `${diff >= 0 ? '+' : ''}${diff}%`;
    }

    const totalStaffCount = Number(staffRow.total_staff) || 0;
    const activeStaffCount = Number(staffRow.active_staff) || 0;
    const staffChange = `${activeStaffCount} active`;

    const avgServiceVal = Number(avgServiceRow.avg_service_amount) || 0;

    // Format schedule items
    const scheduleItems = scheduleRes.rows.map((row: any) => {
      let statusFormatted: 'Confirmed' | 'Completed' | 'Pending' | 'Cancelled' | 'Serving' | 'Waiting' | 'No Show' = 'Pending';
      const rawStatus = (row.status || '').toLowerCase();
      if (rawStatus === 'completed') statusFormatted = 'Completed';
      else if (rawStatus === 'serving') statusFormatted = 'Serving';
      else if (rawStatus === 'accepted' || rawStatus === 'confirmed') statusFormatted = 'Confirmed';
      else if (rawStatus === 'cancelled' || rawStatus === 'expired') statusFormatted = 'Cancelled';
      else if (rawStatus === 'no_show') statusFormatted = 'No Show';
      else if (rawStatus === 'waiting') statusFormatted = 'Waiting';
      else statusFormatted = 'Pending';

      return {
        id: row.id,
        client: row.client,
        service: row.service,
        barber: row.barber,
        time: row.time || '10:00 AM',
        status: statusFormatted,
        price: `₱${Number(row.price || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`,
      };
    });

    // Format 7-day revenue chart
    const chartRows = chartRes.rows || [];
    const maxRevDay = Math.max(...chartRows.map((r: any) => Number(r.revenue) || 0), 1);
    const totalPeriodRevenue = chartRows.reduce((acc: number, r: any) => acc + (Number(r.revenue) || 0), 0);
    const chartPoints = chartRows.map((r: any) => {
      const rev = Number(r.revenue) || 0;
      const heightPercent = maxRevDay > 0 ? Math.max(Math.round((rev / maxRevDay) * 100), rev > 0 ? 10 : 0) : 0;
      return {
        date: r.date,
        day: r.day,
        revenue: rev,
        height_percent: heightPercent,
      };
    });

    // Format 30-day revenue chart
    const chart30Rows = chart30dRes.rows || [];
    const maxRev30 = Math.max(...chart30Rows.map((r: any) => Number(r.revenue) || 0), 1);
    const total30d = chart30Rows.reduce((acc: number, r: any) => acc + (Number(r.revenue) || 0), 0);
    const points30d = chart30Rows.map((r: any) => {
      const rev = Number(r.revenue) || 0;
      return {
        date: r.date,
        day: r.day,
        revenue: rev,
        height_percent: maxRev30 > 0 ? Math.max(Math.round((rev / maxRev30) * 100), rev > 0 ? 8 : 0) : 0,
      };
    });

    // Format 12-month revenue chart
    const chart12mRows = chart12mRes.rows || [];
    const maxRev12m = Math.max(...chart12mRows.map((r: any) => Number(r.revenue) || 0), 1);
    const total12m = chart12mRows.reduce((acc: number, r: any) => acc + (Number(r.revenue) || 0), 0);
    const points12m = chart12mRows.map((r: any) => {
      const rev = Number(r.revenue) || 0;
      return {
        date: r.date,
        day: r.day,
        revenue: rev,
        height_percent: maxRev12m > 0 ? Math.max(Math.round((rev / maxRev12m) * 100), rev > 0 ? 8 : 0) : 0,
      };
    });

    // Top services calculation
    const maxServiceBookings = Math.max(...topServicesRes.rows.map((r: any) => Number(r.count) || 0), 1);
    const topServices = topServicesRes.rows.map((r: any) => ({
      name: r.name,
      count: Number(r.count) || 0,
      percent: Math.round(((Number(r.count) || 0) / maxServiceBookings) * 100),
    }));

    // Customer satisfaction
    const star5 = Number(ratingRow.star5) || 0;
    const star4 = Number(ratingRow.star4) || 0;
    const star3 = Number(ratingRow.star3) || 0;
    const star2 = Number(ratingRow.star2) || 0;
    const star1 = Number(ratingRow.star1) || 0;
    const totalReviews = Number(ratingRow.total_reviews) || 0;
    const positiveReviews = star5 + star4;
    const positivePercentage = totalReviews > 0 ? Math.round((positiveReviews / totalReviews) * 100) : 100;

    // Monthly customers served & available months list
    const monthRows = monthlyServedRes.rows || [];
    const totalMonthServed = monthRows.reduce((sum: number, r: any) => sum + (Number(r.count) || 0), 0);
    const dayCount = Math.max(monthRows.length, 1);
    const dailyAverage = Math.round((totalMonthServed / dayCount) * 10) / 10;
    let peakDay = { date: '', day: '', count: 0 };
    monthRows.forEach((r: any) => {
      const c = Number(r.count) || 0;
      if (c >= peakDay.count) {
        peakDay = { date: r.date, day: r.day, count: c };
      }
    });

    const now = new Date();
    const availableMonths: Array<{ key: string; label: string }> = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
      const label = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(d);
      availableMonths.push({ key, label });
    }

    let selectedRef = now;
    if (sanitizedMonth) {
      const parts = sanitizedMonth.split('-');
      if (parts.length >= 2) {
        selectedRef = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, 1);
      }
    }
    const selectedMonthName = new Intl.DateTimeFormat('en-US', {
      month: 'long',
      year: 'numeric',
    }).format(selectedRef);
    const selectedMonthKey = `${selectedRef.getFullYear()}-${String(selectedRef.getMonth() + 1).padStart(2, '0')}-01`;

    const monthlyCustomersServed = {
      month_key: selectedMonthKey,
      month_name: selectedMonthName,
      available_months: availableMonths,
      total_month_served: totalMonthServed,
      daily_average: dailyAverage,
      peak_day: peakDay,
      days: monthRows.map((r: any) => ({
        date: r.date,
        day: r.day,
        weekday: r.weekday,
        count: Number(r.count) || 0,
        walk_in_count: Number(r.walk_in_count) || 0,
        online_count: Number(r.online_count) || 0,
      })),
    };

    // Top performing barbers
    const barberRows = topBarbersRes.rows || [];
    const topPerformingBarbers = barberRows.map((b: any, idx: number) => ({
      barber_id: Number(b.barber_id),
      barber_name: b.barber_name || 'Barber',
      completed_services_count: Number(b.completed_services_count) || 0,
      total_revenue: Number(b.total_revenue) || 0,
      rating: Number(b.rating) || 5.0,
      review_count: Number(b.review_count) || 0,
      rank: idx + 1,
      avatar: b.profile_picture || null,
      specialty: 'Master Barber',
    }));

    return {
      branch_id: param || undefined,
      branch_name: branchName,
      stats: {
        total_revenue: {
          title: 'Total Revenue',
          value: `₱${allTimeRev.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`,
          raw_value: allTimeRev,
          change: revChange,
          trend: revChange.startsWith('+') ? 'up' : revChange.startsWith('-') ? 'down' : 'neutral',
        },
        online_bookings: {
          title: 'Total Online Bookings',
          value: totalOnline.toString(),
          raw_value: totalOnline,
          change: onlineChange,
          trend: onlineChange.startsWith('+') ? 'up' : onlineChange.startsWith('-') ? 'down' : 'neutral',
        },
        customers_served: {
          title: 'Total Walk-In Customers',
          value: totalWalkIn.toString(),
          raw_value: totalWalkIn,
          change: walkInChange,
          trend: walkInChange.startsWith('+') ? 'up' : walkInChange.startsWith('-') ? 'down' : 'neutral',
        },
        walk_in_customers: {
          title: 'Total Walk-In Customers',
          value: totalWalkIn.toString(),
          raw_value: totalWalkIn,
          change: walkInChange,
          trend: walkInChange.startsWith('+') ? 'up' : walkInChange.startsWith('-') ? 'down' : 'neutral',
        },
        total_staff: {
          title: 'Total Staffs',
          value: totalStaffCount.toString(),
          raw_value: totalStaffCount,
          change: staffChange,
          trend: 'neutral',
        },
        appointments: {
          title: 'Appointments',
          value: todayApts.toString(),
          raw_value: todayApts,
          change: aptsChange,
          trend: aptsChange.startsWith('+') ? 'up' : aptsChange.startsWith('-') ? 'down' : 'neutral',
        },
        new_customers: {
          title: 'New Customers',
          value: thisWeekCust.toString(),
          raw_value: thisWeekCust,
          change: custChange,
          trend: custChange.startsWith('+') ? 'up' : custChange.startsWith('-') ? 'down' : 'neutral',
        },
        avg_service: {
          title: 'Avg. Service',
          value: `₱${avgServiceVal.toLocaleString('en-US')}`,
          raw_value: avgServiceVal,
          change: '+2%',
          trend: 'up',
        },
      },
      today_schedule: scheduleItems,
      revenue_chart: {
        total_period_revenue: totalPeriodRevenue,
        growth_percentage: '+12.5%',
        points: chartPoints,
        periods: {
          '7d': { total_revenue: totalPeriodRevenue, growth_percentage: revChange, points: chartPoints },
          '30d': { total_revenue: total30d, growth_percentage: '+8.4%', points: points30d },
          '12m': { total_revenue: total12m, growth_percentage: '+15.2%', points: points12m },
        },
      },
      top_services: topServices,
      customer_satisfaction: {
        recent_reviews: recentReviewsRes.rows,
        average_rating: Number(ratingRow.average_rating) || 5.0,
        total_reviews: totalReviews,
        positive_percentage: positivePercentage,
        stars_breakdown: {
          star5,
          star4,
          star3,
          star2,
          star1,
        },
      },
      monthly_customers_served: monthlyCustomersServed,
      top_performing_barbers: topPerformingBarbers,
    };
  }

  /**
   * Retrieves shop and branch settings.
   */
  async getShopSettings(branchId?: number): Promise<any> {
    const targetBranchId = branchId || 1;
    // Keep settings consumers usable with lightweight transaction/client mocks
    // that intentionally expose only pool access. Production db clients always
    // provide query, while the empty result path below supplies safe defaults.
    const result = typeof db.query === 'function'
      ? await db.query(
        `SELECT branch_id, name, address, contact_email, settings FROM branches WHERE branch_id = $1`,
        [targetBranchId]
      )
      : { rows: [] };

    const inventoryRetailResult = typeof db.query === 'function'
      ? await db.query(`
        SELECT p.inventory_product_id AS id,
               p.name,
               p.retail_price AS "retailPrice",
               p.cost_price AS "costPrice",
               COALESCE(p.retail_category, 'HAIR') AS category,
               COALESCE(p.tags, '{}') AS tags,
               p.show_in_shop AS "showInShop",
               p.image_url AS "imageUrl",
               COALESCE(SUM(s.current_quantity), 0) AS stock_quantity
        FROM public.inventory_products p
        LEFT JOIN public.inventory_stock s ON s.inventory_product_id = p.inventory_product_id AND (s.is_active IS NULL OR s.is_active = TRUE)
        WHERE p.ownership_type = 'shared_retail'
          AND p.is_active = TRUE
        GROUP BY p.inventory_product_id, p.name, p.retail_price, p.cost_price, p.retail_category, p.tags, p.show_in_shop, p.image_url
        ORDER BY p.name ASC
      `).catch(() => ({ rows: [] }))
      : { rows: [] };

    const defaultHours = [
      { day: 'Monday', openTime: '09:00', closeTime: '21:00', isOpen: true },
      { day: 'Tuesday', openTime: '09:00', closeTime: '21:00', isOpen: true },
      { day: 'Wednesday', openTime: '09:00', closeTime: '21:00', isOpen: true },
      { day: 'Thursday', openTime: '09:00', closeTime: '21:00', isOpen: true },
      { day: 'Friday', openTime: '09:00', closeTime: '21:00', isOpen: true },
      { day: 'Saturday', openTime: '09:00', closeTime: '21:00', isOpen: true },
      { day: 'Sunday', openTime: '09:00', closeTime: '21:00', isOpen: false },
    ];

    const defaultWebsite = {
      heroHeadline: 'PRECISION & TRADITION',
      heroSubtext: 'Experience the art of classic grooming in a modern industrial setting. Where every cut is a masterpiece.',
      heroImageUrl: '/hero-image.jpg',
      heroCtaPrimary: 'Book Appointment',
      heroCtaSecondary: 'View Services',
      termsLastUpdated: 'Feb 2026',
      privacyLastUpdated: 'Feb 2026',
    };

    const defaultPaymentMethods = [
      {
        id: 'cash',
        key: 'cash',
        type: 'cash',
        name: 'Cash Payment',
        description: 'Physical currency and cash drawer change calculation.',
        enabled: true,
        isPrimary: true,
        instructions: 'Settle payment in cash at the counter with the cashier.',
      },
      {
        id: 'gcash',
        key: 'gcash',
        type: 'gcash',
        name: 'Gcash',
        description: 'Merchant QR code scan and reference number verification.',
        enabled: true,
        isPrimary: false,
        instructions: 'Scan the merchant QR code and enter the 13-digit GCash reference number.',
        qrImageUrl: null,
        merchantName: "DEMOSHOP'S BARBERSHOP",
      },
      {
        id: 'maya',
        key: 'maya',
        type: 'maya',
        name: 'Maya/ Paymaya',
        description: 'Auxiliary digital wallet payment channel for instant transfers.',
        enabled: false,
        isPrimary: false,
        instructions: 'Scan the Maya QR code and provide the transaction reference number.',
        qrImageUrl: null,
        merchantName: "DEMOSHOP'S BARBERSHOP",
      },
      {
        id: 'qrph',
        key: 'qrph',
        type: 'qrph',
        name: 'QR Ph Universal',
        description: 'National standard QR interoperable with all PH bank and e-wallet apps.',
        enabled: true,
        isPrimary: false,
        instructions: 'Scan using any QR Ph compliant mobile banking app or e-wallet.',
        qrImageUrl: null,
      },
      {
        id: 'card',
        key: 'card',
        type: 'card',
        name: 'Debit & Credit Cards',
        description: 'POS card terminal tender for Visa, Mastercard, and BancNet.',
        enabled: false,
        isPrimary: false,
        instructions: 'Present physical debit/credit card to the cashier terminal.',
      },
      {
        id: 'maribank',
        key: 'maribank',
        type: 'bank',
        name: 'MariBank',
        description: 'Digital bank transfer via MariBank / SeaBank.',
        enabled: false,
        isPrimary: false,
        instructions: 'Transfer to the MariBank account number and provide transaction reference.',
        qrImageUrl: null,
        merchantName: "DEMOSHOP'S BARBERSHOP",
      },
      {
        id: 'gotyme',
        key: 'gotyme',
        type: 'bank',
        name: 'GoTyme',
        description: 'Digital bank transfer via GoTyme app.',
        enabled: false,
        isPrimary: false,
        instructions: 'Transfer to the GoTyme account number and provide transaction reference.',
        qrImageUrl: null,
        merchantName: "DEMOSHOP'S BARBERSHOP",
      },
    ];

    const CANONICAL_METHOD_NAMES: Record<string, string> = {
      gcash: 'Gcash',
      maya: 'Maya/ Paymaya',
      maribank: 'MariBank',
      gotyme: 'GoTyme',
    };

    const normalizePaymentMethods = (methods: any[]) => {
      if (!Array.isArray(methods)) return defaultPaymentMethods;
      const existing = methods.map((pm: any) => {
        const stableId = pm.id || pm.key || (pm.type ? pm.type.toLowerCase() : 'custom');
        const canonicalName = CANONICAL_METHOD_NAMES[stableId];
        return {
          ...pm,
          id: stableId,
          key: stableId,
          name: canonicalName || pm.name,
          enabled: (stableId === 'cash' || pm.type === 'cash' || pm.isPrimary) ? true : Boolean(pm.enabled),
          isPrimary: (stableId === 'cash' || pm.type === 'cash') ? true : Boolean(pm.isPrimary),
        };
      });

      // Merge any missing default providers (e.g. maribank, gotyme)
      for (const def of defaultPaymentMethods) {
        if (!existing.some(m => m.id === def.id || m.key === def.key || (m.name && m.name.toLowerCase().includes(def.id)))) {
          existing.push(def);
        }
      }

      return existing;
    };

    const defaultGallery = [
      { id: '1', src: '/main_floor.jpg', imageUrl: '/main_floor.jpg', alt: 'The Main Floor', caption: 'The Main Floor', category: 'Interior', displayOrder: 1 },
      { id: '2', src: '/details.jpg', imageUrl: '/details.jpg', alt: 'Tools of Trade', caption: 'Tools of Trade', category: 'Details', displayOrder: 2 },
      { id: '3', src: '/classic_shave.jpg', imageUrl: '/classic_shave.jpg', alt: 'Classic Shave', caption: 'Classic Shave', category: 'Service', displayOrder: 3 },
      { id: '4', src: '/demoshop_interior2.jpg', imageUrl: '/demoshop_interior2.jpg', alt: 'Waiting Area', caption: 'Waiting Area', category: 'Interior', displayOrder: 4 },
      { id: '5', src: '/demoshop_team.jpg', imageUrl: '/demoshop_team.jpg', alt: 'Master Barber', caption: 'Master Barber', category: 'Team', displayOrder: 5 },
      { id: '6', src: '/master_at_work.jpg', imageUrl: '/master_at_work.jpg', alt: 'Precision', caption: 'Precision', category: 'Service', displayOrder: 6 },
    ];

    const normalizeGallery = (items: any[]) => {
      if (!Array.isArray(items)) return defaultGallery;
      return items.map((item: any, idx: number) => ({
        id: String(item.id || idx + 1),
        src: item.imageUrl || item.src || '',
        imageUrl: item.imageUrl || item.src || '',
        alt: item.caption || item.alt || '',
        caption: item.caption || item.alt || '',
        category: item.category || 'haircut',
        displayOrder: typeof item.displayOrder === 'number' ? item.displayOrder : idx + 1,
      }));
    };

    const defaultShopProducts = [
      {
        id: '1',
        name: 'Matte Pomade',
        category: 'HAIR',
        retailPrice: 150,
        imageUrl: '/pomade.jpg',
        description: 'High hold, low shine styling pomade for clean precision pompadours and textured finishes.',
        displayOrder: 1,
        stockStatus: 'IN STOCK',
        tags: ['MATTE', 'HIGH HOLD'],
        ctaText: 'Explore Product',
        ctaLink: '/shop',
      },
      {
        id: '2',
        name: 'Texture Powder',
        category: 'HAIR',
        retailPrice: 150,
        imageUrl: '/powder.jpg',
        description: 'Weightless volumizing powder with a natural matte finish, engineered for modern messy crops.',
        displayOrder: 2,
        stockStatus: 'IN STOCK',
        tags: ['VOLUMIZING', 'WEIGHTLESS'],
        ctaText: 'Explore Product',
        ctaLink: '/shop',
      },
      {
        id: '3',
        name: 'Beard Oil',
        category: 'BEARD',
        retailPrice: 150,
        imageUrl: '/beard-oil.jpg',
        description: 'Nourishing organic beard oil formulated with argan and cedarwood to soften facial hair and protect the skin beneath.',
        displayOrder: 3,
        stockStatus: 'IN STOCK',
        tags: ['ORGANIC', 'CEDARWOOD', 'ARGAN'],
        ctaText: 'Explore Product',
        ctaLink: '/shop',
      },
      {
        id: '4',
        name: 'Hair Gel',
        category: 'STYLING',
        retailPrice: 150,
        imageUrl: '/hair-gel.jpg',
        description: 'High hold, clean sheen styling gel engineered for slicked backs, side parts, and razor-sharp separation without flaking.',
        displayOrder: 4,
        stockStatus: 'IN STOCK',
        tags: ['HIGH HOLD', 'CLEAN FINISH', 'FLAKE-FREE'],
        ctaText: 'Explore Product',
        ctaLink: '/shop',
      },
    ];

    const normalizeShopProducts = (items: any[]) => {
      const customList = Array.isArray(items) ? items : [];
      const dbProducts = inventoryRetailResult?.rows || [];

      if (dbProducts.length > 0) {
        return dbProducts.map((dbProd: any, idx: number) => {
          const customMatch = customList.find(
            (c: any) => String(c.id) === String(dbProd.id) || (c.name && c.name.trim().toLowerCase() === dbProd.name.trim().toLowerCase())
          );
          const stockQty = Number(dbProd.stock_quantity) || 0;
          const stockStatus = stockQty <= 0 ? 'OUT OF STOCK' : (stockQty <= 5 ? 'LOW STOCK' : 'IN STOCK');

          return {
            id: String(dbProd.id),
            name: String(dbProd.name).trim(),
            category: String(customMatch?.category || dbProd.category || 'HAIR').trim().toUpperCase(),
            retailPrice: dbProd.retailPrice != null ? Number(dbProd.retailPrice) : (customMatch?.retailPrice != null ? Number(customMatch.retailPrice) : 0),
            description: typeof customMatch?.description === 'string' ? customMatch.description.trim() : '',
            imageUrl: dbProd.imageUrl || customMatch?.imageUrl || null,
            displayOrder: typeof customMatch?.displayOrder === 'number' ? customMatch.displayOrder : idx + 1,
            stockStatus: customMatch?.stockStatus && ['IN STOCK', 'LOW STOCK', 'OUT OF STOCK'].includes(customMatch.stockStatus)
              ? customMatch.stockStatus
              : stockStatus,
            tags: Array.isArray(dbProd.tags) && dbProd.tags.length > 0
              ? dbProd.tags.map(String)
              : (Array.isArray(customMatch?.tags) ? customMatch.tags.map(String) : []),
            showInShop: dbProd.showInShop !== false,
            ctaText: customMatch?.ctaText || 'Explore Product',
            ctaLink: customMatch?.ctaLink || '/shop',
          };
        }).sort((a: any, b: any) => (a.displayOrder || 0) - (b.displayOrder || 0));
      }

      const normalized = (customList.length > 0 ? customList : defaultShopProducts).map((item: any, idx: number) => ({
        id: String(item.id || idx + 1),
        name: String(item.name || 'Product').trim(),
        category: String(item.category || 'HAIR').trim().toUpperCase(),
        retailPrice: typeof item.retailPrice === 'number' ? item.retailPrice : (Number(item.retailPrice) || 0),
        description: typeof item.description === 'string' ? item.description.trim() : '',
        imageUrl: item.imageUrl || null,
        displayOrder: typeof item.displayOrder === 'number' ? item.displayOrder : idx + 1,
        stockStatus: ['IN STOCK', 'LOW STOCK', 'OUT OF STOCK'].includes(item.stockStatus)
          ? item.stockStatus
          : 'IN STOCK',
        tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
        showInShop: item.showInShop !== false,
        ctaText: item.ctaText || 'Explore Product',
        ctaLink: item.ctaLink || '/shop',
      }));

      for (const def of defaultShopProducts) {
        if (!normalized.some((p: any) => p.name.toLowerCase() === def.name.toLowerCase())) {
          normalized.push({ ...def, showInShop: true, displayOrder: normalized.length + 1 });
        }
      }

      return normalized.sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
    };

    const defaultFaqs = [
      {
        id: '1',
        question: 'Do you accept walk-ins?',
        answer: 'We prioritize appointments to ensure every client receives our full attention. Walk-ins are accepted based on availability, but we highly recommend booking in advance to secure your preferred time.',
        isEnabled: true,
        displayOrder: 1,
      },
      {
        id: '2',
        question: 'What is your cancellation policy?',
        answer: 'We request at least 24 hours notice for cancellations. Late cancellations or no-shows may be subject to a fee of 50% of the service value to compensate our barbers for their time.',
        isEnabled: true,
        displayOrder: 2,
      },
      {
        id: '3',
        question: 'Do you offer services for children?',
        answer: "Yes, we offer the 'Young Gentleman's Cut' for children under 12. We treat them with the same level of precision and care as our adult clients, ensuring a comfortable experience.",
        isEnabled: true,
        displayOrder: 3,
      },
      {
        id: '4',
        question: 'How early should I arrive?',
        answer: 'Please arrive 10 minutes before your scheduled time. This allows you to enjoy a complimentary beverage, relax in our lounge, and ensure your service starts promptly.',
        isEnabled: true,
        displayOrder: 4,
      },
      {
        id: '5',
        question: 'Do you sell gift cards?',
        answer: 'Absolutely. Physical gift cards are available at all our branches, and digital gift cards can be purchased through our booking portal.',
        isEnabled: true,
        displayOrder: 5,
      },
    ];

    const defaultAbout = {
      heading: 'MORE THAN JUST A CUT',
      subheading: 'Our Story',
      storyParagraph1: "Founded in 2024, DemoShop's Barbers was born from a desire to restore the dignity of the classic barbershop experience. We believe that grooming is not a chore, but a ritual—a moment of pause in a chaotic world.",
      storyParagraph2: 'Our philosophy is simple: Precision & Tradition. We combine old-school techniques—hot towels, straight razors, and scissor-over-comb—with a modern eye for detail and style.',
      storyParagraph3: "Every barber at DemoShop's is a master of their craft, hand-picked not just for their skill, but for their passion. When you sit in our chair, you're not just a customer; you're a patron of the arts.",
      yearsExperience: '5+',
      happyClients: '5k+',
      quote: '"Quality is never an accident."',
      imageUrl: '/barbers_at_work.jpg',
    };

    const defaultFooter = {
      brandDescription: 'Where tradition meets precision. Experience the art of grooming in an atmosphere of industrial elegance.',
      phone: '(02) 8555-0123',
      hoursDisplay: 'Monday - Saturday: 09:00 AM - 08:00 PM | Sunday: Closed',
      facebookUrl: 'https://www.facebook.com/profile.php?id=61581132495911',
      tiktokUrl: 'https://www.tiktok.com/@demoshopsr18.samplebranch',
      copyrightText: "DemoShop's Barbers. All rights reserved.",
    };

    const defaultLegal = buildDefaultLegal();

    if (result.rows.length === 0) {
      return {
        branchId: targetBranchId,
        shopName: "DemoShop's Barbers",
        contactEmail: 'portfolio@example.invalid',
        physicalAddress: 'Ground floor, SampleBranch, Brgy. Kaypian, SJDM, Bulacan',
        businessHours: defaultHours,
        paymentMethods: defaultPaymentMethods,
        website: defaultWebsite,
        gallery: defaultGallery,
        galleryImages: defaultGallery,
        shopProducts: defaultShopProducts,
        faqs: defaultFaqs,
        about: defaultAbout,
        footer: defaultFooter,
        legal: defaultLegal,
        legalDocs: defaultLegal,
        bypassTimeRestrictions: false,
        bypassReceiptOcr: false,
      };
    }

    const row = result.rows[0];
    const customSettings = row.settings || {};

    const customLegal = customSettings.legal || customSettings.legalDocs || {};
    const branchDefaultLegal = buildDefaultLegal(row.name, row.contact_email, row.address);
    const resolveDoc = (key: 'termsOfService' | 'privacyPolicy') => {
      const defaultDoc = branchDefaultLegal[key];
      const customDoc = customLegal[key] || {};
      const candidateContent = (customDoc.contentMarkdown !== undefined && customDoc.contentMarkdown !== null && customDoc.contentMarkdown !== '')
        ? customDoc.contentMarkdown
        : ((customDoc.content !== undefined && customDoc.content !== null && customDoc.content !== '')
          ? customDoc.content
          : defaultDoc.content);

      const rawContent = isUntouchedLegacyPlaceholder(key, candidateContent)
        ? defaultDoc.content
        : candidateContent;

      return {
        ...defaultDoc,
        ...customDoc,
        content: rawContent,
        contentMarkdown: rawContent,
        status: customDoc.status || (customDoc.enabled === false ? 'draft' : defaultDoc.status),
        enabled: customDoc.enabled ?? (customDoc.status !== 'draft'),
        lastUpdated: customDoc.lastUpdated || defaultDoc.lastUpdated,
        lastUpdatedAt: customDoc.lastUpdatedAt || defaultDoc.lastUpdatedAt,
      };
    };

    const resolvedLegal = {
      termsOfService: resolveDoc('termsOfService'),
      privacyPolicy: resolveDoc('privacyPolicy'),
    };

    const normalizedPaymentMethods = normalizePaymentMethods(customSettings.paymentMethods || defaultPaymentMethods);
    const normalizedGallery = normalizeGallery(customSettings.gallery || customSettings.galleryImages || defaultGallery);

    return {
      branchId: row.branch_id,
      shopName: row.name || "DemoShop's Barbers",
      contactEmail: row.contact_email || 'portfolio@example.invalid',
      businessHours: (Array.isArray(customSettings.businessHours) && customSettings.businessHours.length > 0)
        ? customSettings.businessHours.map((h: any) => ({
            ...h,
            closeTime: h.closeTime === '20:00' ? '21:00' : (h.closeTime || '21:00'),
          }))
        : defaultHours,
      paymentMethods: normalizedPaymentMethods,
      website: { ...defaultWebsite, ...(customSettings.website || {}) },
      gallery: normalizedGallery,
      galleryImages: normalizedGallery,
      shopProducts: normalizeShopProducts(customSettings.shopProducts || defaultShopProducts),
      faqs: customSettings.faqs || defaultFaqs,
      about: { ...defaultAbout, ...(customSettings.about || {}) },
      footer: { ...defaultFooter, ...(customSettings.footer || {}) },
      legal: resolvedLegal,
      legalDocs: resolvedLegal,
      bypassTimeRestrictions: Boolean(customSettings.bypassTimeRestrictions ?? false),
      bypassReceiptOcr: Boolean(customSettings.bypassReceiptOcr ?? false),
    };
  }

  /**
   * Updates and persists shop and branch settings.
   */
  async updateShopSettings(branchId: number | undefined, data: any): Promise<any> {
    const targetBranchId = branchId || 1;

    const current = await this.getShopSettings(targetBranchId);
    const updatedShopName = data.shopName !== undefined ? data.shopName : current.shopName;
    const updatedContactEmail = data.contactEmail !== undefined ? data.contactEmail : current.contactEmail;
    const updatedPhysicalAddress = data.physicalAddress !== undefined ? data.physicalAddress : current.physicalAddress;
    const updatedBusinessHours = data.businessHours !== undefined ? data.businessHours : current.businessHours;

    // Enforce that cash payment cannot be disabled (isPrimary) and normalize keys
    let updatedPaymentMethods = data.paymentMethods !== undefined ? data.paymentMethods : current.paymentMethods;
    if (Array.isArray(updatedPaymentMethods)) {
      updatedPaymentMethods = updatedPaymentMethods.map((pm: any) => {
        const stableId = pm.id || pm.key || (pm.type ? pm.type.toLowerCase() : 'custom');
        const isCash = stableId === 'cash' || pm.type === 'cash' || pm.isPrimary;
        return {
          ...pm,
          id: stableId,
          key: stableId,
          enabled: isCash ? true : Boolean(pm.enabled),
          isPrimary: isCash ? true : Boolean(pm.isPrimary),
        };
      });
    }

    const updatedWebsite = data.website !== undefined
      ? {
          ...current.website,
          ...data.website,
          sectionVisibility: data.website.sectionVisibility !== undefined
            ? { ...current.website?.sectionVisibility, ...data.website.sectionVisibility }
            : current.website?.sectionVisibility,
          lastUpdated: getManilaFormattedDate(),
          updatedBy: data.website.updatedBy || current.website?.updatedBy,
        }
      : current.website;

    const incomingGallery = data.gallery !== undefined ? data.gallery : data.galleryImages;
    const updatedGallery = incomingGallery !== undefined
      ? (Array.isArray(incomingGallery)
        ? incomingGallery.map((item: any, idx: number) => ({
          id: String(item.id || idx + 1),
          src: item.imageUrl || item.src || '',
          imageUrl: item.imageUrl || item.src || '',
          alt: item.caption || item.alt || '',
          caption: item.caption || item.alt || '',
          category: item.category || 'haircut',
          displayOrder: typeof item.displayOrder === 'number' ? item.displayOrder : idx + 1,
        }))
        : current.gallery)
      : current.gallery;

    const updatedShopProducts = data.shopProducts !== undefined
      ? (Array.isArray(data.shopProducts)
        ? data.shopProducts.map((item: any, idx: number) => ({
          id: String(item.id || idx + 1),
          name: String(item.name || 'Product').trim(),
          category: String(item.category || 'HAIR').trim().toUpperCase(),
          retailPrice: typeof item.retailPrice === 'number' ? item.retailPrice : (Number(item.retailPrice) || 0),
          description: typeof item.description === 'string' ? item.description.trim() : '',
          imageUrl: item.imageUrl || null,
          displayOrder: typeof item.displayOrder === 'number' ? item.displayOrder : idx + 1,
          stockStatus: ['IN STOCK', 'LOW STOCK', 'OUT OF STOCK'].includes(item.stockStatus)
            ? item.stockStatus
            : 'IN STOCK',
          tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
          showInShop: item.showInShop !== undefined ? Boolean(item.showInShop) : true,
          ctaText: item.ctaText || 'Explore Product',
          ctaLink: item.ctaLink || '/shop',
        })).sort((a: any, b: any) => (a.displayOrder || 0) - (b.displayOrder || 0))
        : current.shopProducts)
      : current.shopProducts;

    if (Array.isArray(data.shopProducts) && typeof db.query === 'function') {
      const visibilityByProduct = new Map<number, boolean>();
      for (const sp of data.shopProducts) {
        const prodId = Number(sp.id);
        if (Number.isInteger(prodId) && prodId > 0 && sp.showInShop !== undefined) {
          visibilityByProduct.set(prodId, Boolean(sp.showInShop));
        }
      }
      if (visibilityByProduct.size > 0) {
        const visibilityUpdates = [...visibilityByProduct.entries()];
        await db.query(
          `UPDATE public.inventory_products AS p
           SET show_in_shop = updates.show_in_shop
           FROM UNNEST($1::bigint[], $2::boolean[]) AS updates(inventory_product_id, show_in_shop)
           WHERE p.inventory_product_id = updates.inventory_product_id`,
          [visibilityUpdates.map(([productId]) => productId), visibilityUpdates.map(([, visible]) => visible)],
        ).catch(() => {});
      }
    }

    const updatedFaqs = data.faqs !== undefined ? data.faqs : current.faqs;
    const updatedAbout = data.about !== undefined
      ? { ...current.about, ...data.about }
      : current.about;
    const updatedFooter = data.footer !== undefined
      ? { ...current.footer, ...data.footer }
      : current.footer;

    const incomingLegal = data.legal !== undefined ? data.legal : data.legalDocs;
    const updatedLegal = incomingLegal !== undefined
      ? {
        termsOfService: {
          ...current.legal?.termsOfService,
          ...incomingLegal.termsOfService,
          content: incomingLegal.termsOfService?.contentMarkdown || incomingLegal.termsOfService?.content || current.legal?.termsOfService?.content,
          contentMarkdown: incomingLegal.termsOfService?.contentMarkdown || incomingLegal.termsOfService?.content || current.legal?.termsOfService?.contentMarkdown,
          lastUpdated: incomingLegal.termsOfService?.lastUpdated || current.legal?.termsOfService?.lastUpdated || getManilaFormattedDate(),
          lastUpdatedAt: incomingLegal.termsOfService?.lastUpdatedAt || new Date().toISOString(),
          status: incomingLegal.termsOfService?.status || (incomingLegal.termsOfService?.enabled === false ? 'draft' : 'active'),
          enabled: incomingLegal.termsOfService?.enabled ?? (incomingLegal.termsOfService?.status !== 'draft'),
        },
        privacyPolicy: {
          ...current.legal?.privacyPolicy,
          ...incomingLegal.privacyPolicy,
          content: incomingLegal.privacyPolicy?.contentMarkdown || incomingLegal.privacyPolicy?.content || current.legal?.privacyPolicy?.content,
          contentMarkdown: incomingLegal.privacyPolicy?.contentMarkdown || incomingLegal.privacyPolicy?.content || current.legal?.privacyPolicy?.contentMarkdown,
          lastUpdated: incomingLegal.privacyPolicy?.lastUpdated || current.legal?.privacyPolicy?.lastUpdated || getManilaFormattedDate(),
          lastUpdatedAt: incomingLegal.privacyPolicy?.lastUpdatedAt || new Date().toISOString(),
          status: incomingLegal.privacyPolicy?.status || (incomingLegal.privacyPolicy?.enabled === false ? 'draft' : 'active'),
          enabled: incomingLegal.privacyPolicy?.enabled ?? (incomingLegal.privacyPolicy?.status !== 'draft'),
        },
      }
      : current.legal;

    const updatedBypassTimeRestrictions = data.bypassTimeRestrictions !== undefined
      ? Boolean(data.bypassTimeRestrictions)
      : current.bypassTimeRestrictions;

    const updatedBypassReceiptOcr = data.bypassReceiptOcr !== undefined
      ? Boolean(data.bypassReceiptOcr)
      : current.bypassReceiptOcr;

    const newCustomSettings = {
      businessHours: updatedBusinessHours,
      paymentMethods: updatedPaymentMethods,
      website: updatedWebsite,
      gallery: updatedGallery,
      galleryImages: updatedGallery,
      shopProducts: updatedShopProducts,
      faqs: updatedFaqs,
      about: updatedAbout,
      footer: updatedFooter,
      legal: updatedLegal,
      legalDocs: updatedLegal,
      bypassTimeRestrictions: updatedBypassTimeRestrictions,
      bypassReceiptOcr: updatedBypassReceiptOcr,
    };

    await db.query(
      `UPDATE branches 
       SET name = $1, contact_email = $2, address = $3, settings = $4 
       WHERE branch_id = $5`,
      [
        updatedShopName,
        updatedContactEmail,
        updatedPhysicalAddress,
        JSON.stringify(newCustomSettings),
        targetBranchId,
      ]
    );

    return {
      branchId: targetBranchId,
      shopName: updatedShopName,
      contactEmail: updatedContactEmail,
      physicalAddress: updatedPhysicalAddress,
      businessHours: updatedBusinessHours,
      paymentMethods: updatedPaymentMethods,
      website: updatedWebsite,
      gallery: updatedGallery,
      galleryImages: updatedGallery,
      shopProducts: updatedShopProducts,
      faqs: updatedFaqs,
      about: updatedAbout,
      footer: updatedFooter,
      legal: updatedLegal,
      legalDocs: updatedLegal,
      bypassTimeRestrictions: updatedBypassTimeRestrictions,
      bypassReceiptOcr: updatedBypassReceiptOcr,
    };
  }

  /**
   * Retrieves sales and revenue channel breakdown (Cash vs Digital) over a date range.
   */
  async getSalesReport(options: {
    startDate: string;
    endDate: string;
    branchId?: number | null;
  }): Promise<SalesReportResponse> {
    const { startDate, endDate, branchId } = options;

    const [transactionsRes, timelineRes] = await Promise.all([
      db.query(
        `SELECT
            t.transaction_id,
            COALESCE(t.created_at, NOW()) AS created_at,
            (t.created_at AT TIME ZONE 'Asia/Manila')::date::text AS date,
            TO_CHAR(t.created_at AT TIME ZONE 'Asia/Manila', 'Mon DD, YYYY') AS formatted_date,
            TO_CHAR(t.created_at AT TIME ZONE 'Asia/Manila', 'HH12:MI AM') AS formatted_time,
            COALESCE(t.total_amount, 0)::numeric AS amount,
            COALESCE(t.payment_method, 'Cash') AS payment_method,
            COALESCE(b.name, 'Unassigned') AS barber_name,
            COALESCE(
              NULLIF(TRIM(CONCAT(COALESCE(c.first_name, ''), ' ', COALESCE(c.last_name, ''))), ''),
              gp.normalized_name,
              qe.customer_name,
              'Walk-in Customer'
            ) AS customer_name,
            COALESCE(s.title, 'Barbershop Service') AS service_name
         FROM transactions t
         LEFT JOIN queue_entries qe ON qe.id = t.queue_entry_id
         LEFT JOIN barbers b ON b.barber_id = COALESCE(t.barber_id, qe.barber_id)
         LEFT JOIN customers c ON c.customer_id = COALESCE(t.customer_id, qe.customer_id)
         LEFT JOIN guest_profiles gp ON gp.guest_profile_id = qe.guest_profile_id
         LEFT JOIN services s ON s.service_id = qe.service_id
         WHERE (t.created_at AT TIME ZONE 'Asia/Manila')::date >= $1::date
           AND (t.created_at AT TIME ZONE 'Asia/Manila')::date <= $2::date
           AND ($3::int IS NULL OR t.branch_id = $3)
         ORDER BY t.created_at DESC`,
        [startDate, endDate, branchId ?? null]
      ),
      db.query(
        `WITH days AS (
           SELECT generate_series(
             $1::date,
             $2::date,
             '1 day'::interval
           )::date AS day_date
         )
         SELECT
           d.day_date::text AS date,
           TO_CHAR(d.day_date, 'Mon DD') AS formatted_date,
           TO_CHAR(d.day_date, 'Dy') AS day,
           COALESCE(SUM(t.total_amount), 0)::numeric AS total_revenue,
           COALESCE(SUM(CASE WHEN LOWER(COALESCE(t.payment_method, 'cash')) = 'cash' THEN t.total_amount ELSE 0 END), 0)::numeric AS cash_revenue,
           COALESCE(SUM(CASE WHEN LOWER(COALESCE(t.payment_method, 'cash')) != 'cash' THEN t.total_amount ELSE 0 END), 0)::numeric AS digital_revenue,
           COUNT(t.transaction_id)::int AS transaction_count
         FROM days d
         LEFT JOIN transactions t ON (t.created_at AT TIME ZONE 'Asia/Manila')::date = d.day_date
           AND ($3::int IS NULL OR t.branch_id = $3)
         GROUP BY d.day_date
         ORDER BY d.day_date ASC`,
        [startDate, endDate, branchId ?? null]
      ),
    ]);

    const txRows = transactionsRes.rows || [];
    const timeline: SalesReportDailyPoint[] = (timelineRes.rows || []).map((row: any) => ({
      date: row.date,
      formattedDate: row.formatted_date,
      day: row.day,
      totalRevenue: Number(Number(row.total_revenue || 0).toFixed(2)),
      cashRevenue: Number(Number(row.cash_revenue || 0).toFixed(2)),
      digitalRevenue: Number(Number(row.digital_revenue || 0).toFixed(2)),
      transactionCount: Number(row.transaction_count || 0),
    }));

    const transactions: SalesReportTransaction[] = txRows.map((row: any) => ({
      transactionId: row.transaction_id,
      date: row.date,
      formattedDate: row.formatted_date,
      formattedTime: row.formatted_time,
      customerName: row.customer_name,
      barberName: row.barber_name,
      serviceName: row.service_name,
      paymentMethod: row.payment_method,
      amount: Number(Number(row.amount || 0).toFixed(2)),
    }));

    let totalGrossRevenue = 0;
    let cashRevenue = 0;
    let cashCount = 0;
    let digitalRevenue = 0;
    let digitalCount = 0;

    for (const tx of transactions) {
      totalGrossRevenue += tx.amount;
      if (tx.paymentMethod.toLowerCase() === 'cash') {
        cashRevenue += tx.amount;
        cashCount += 1;
      } else {
        digitalRevenue += tx.amount;
        digitalCount += 1;
      }
    }

    const totalTransactionsCount = transactions.length;
    const averageTicketValue = totalTransactionsCount > 0 ? Number((totalGrossRevenue / totalTransactionsCount).toFixed(2)) : 0;
    const cashPercentage = totalGrossRevenue > 0 ? Number(((cashRevenue / totalGrossRevenue) * 100).toFixed(1)) : 0;
    const digitalPercentage = totalGrossRevenue > 0 ? Number(((digitalRevenue / totalGrossRevenue) * 100).toFixed(1)) : 0;

    const summary: SalesReportSummary = {
      startDate,
      endDate,
      totalGrossRevenue: Number(totalGrossRevenue.toFixed(2)),
      totalTransactionsCount,
      averageTicketValue,
      cashRevenue: Number(cashRevenue.toFixed(2)),
      cashTransactionsCount: cashCount,
      cashPercentage,
      digitalRevenue: Number(digitalRevenue.toFixed(2)),
      digitalTransactionsCount: digitalCount,
      digitalPercentage,
    };

    return { summary, timeline, transactions };
  }

  /**
   * Retrieves barber performance and commission calculations over a date range.
   */
  async getCommissionReport(options: {
    startDate: string;
    endDate: string;
    branchId?: number | null;
    barberId?: number | null;
  }): Promise<BarberCommissionResponse> {
    const { startDate, endDate, branchId, barberId } = options;

    const res = await db.query(
      `SELECT
          b.barber_id,
          b.name AS barber_name,
          u.profile_picture,
          COALESCE(u.role::text, 'Barber') AS role,
          COUNT(qe.id)::int AS completed_services_count,
          COALESCE(SUM(
            CASE
              WHEN qe.id IS NULL THEN 0
              ELSE COALESCE(t.total_amount, s.price, 250)
            END
          ), 0)::numeric AS total_gross_sales
       FROM barbers b
        JOIN users u ON u.user_id = b.user_id AND u.deleted_at IS NULL
       LEFT JOIN queue_entries qe ON qe.barber_id = b.barber_id
         AND qe.status::text = 'completed'
         AND (qe.payment_status::text = 'paid' OR EXISTS (SELECT 1 FROM transactions tr WHERE tr.queue_entry_id = qe.id))
         AND (qe.created_at AT TIME ZONE 'Asia/Manila')::date >= $1::date
         AND (qe.created_at AT TIME ZONE 'Asia/Manila')::date <= $2::date
       LEFT JOIN services s ON s.service_id = qe.service_id
       LEFT JOIN LATERAL (
         SELECT SUM(tr.total_amount)::numeric AS total_amount
         FROM transactions tr
         WHERE tr.queue_entry_id = qe.id
       ) t ON TRUE
       WHERE COALESCE(b.is_active, TRUE) = TRUE
         AND ($3::int IS NULL OR u.branch_id = $3 OR qe.branch_id = $3)
         AND ($4::int IS NULL OR b.barber_id = $4)
       GROUP BY b.barber_id, b.name, u.profile_picture, u.role
       ORDER BY total_gross_sales DESC, completed_services_count DESC, b.name ASC`,
      [startDate, endDate, branchId ?? null, barberId ?? null]
    );

    const rawRows = res.rows || [];
    let totalServicesCompleted = 0;
    let totalGrossSales = 0;
    let totalCommissionPayout = 0;
    let totalShopNetRevenue = 0;

    const barbers: BarberCommissionItem[] = rawRows.map((row: any) => {
      const gross = Number(Number(row.total_gross_sales || 0).toFixed(2));
      const servicesCount = Number(row.completed_services_count || 0);
      const isHigherTier = gross >= 3000;
      const commissionRate = isHigherTier ? 0.50 : 0.40;
      const commissionRateLabel = isHigherTier ? '50% Tier (Bonus)' : '40% Standard Base';
      const netCommissionPayout = Number((gross * commissionRate).toFixed(2));
      const shopNetRevenue = Number((gross - netCommissionPayout).toFixed(2));
      const averageTicketValue = servicesCount > 0 ? Number((gross / servicesCount).toFixed(2)) : 0;

      totalServicesCompleted += servicesCount;
      totalGrossSales += gross;
      totalCommissionPayout += netCommissionPayout;
      totalShopNetRevenue += shopNetRevenue;

      return {
        barberId: Number(row.barber_id),
        barberName: row.barber_name,
        avatarUrl: row.profile_picture || null,
        role: row.role,
        completedServicesCount: servicesCount,
        totalGrossSales: gross,
        commissionRate,
        commissionRateLabel,
        isHigherTier,
        netCommissionPayout,
        shopNetRevenue,
        averageTicketValue,
      };
    });

    const summary: BarberCommissionSummary = {
      startDate,
      endDate,
      totalBarbers: barbers.length,
      totalServicesCompleted,
      totalGrossSales: Number(totalGrossSales.toFixed(2)),
      totalCommissionPayout: Number(totalCommissionPayout.toFixed(2)),
      totalShopNetRevenue: Number(totalShopNetRevenue.toFixed(2)),
    };

    return { summary, barbers };
  }
}

export const adminRepository = new AdminRepository();
