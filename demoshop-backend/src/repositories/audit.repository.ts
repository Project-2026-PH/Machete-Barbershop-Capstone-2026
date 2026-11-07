import { PoolClient, QueryResult } from 'pg';
import db from '../db';

export const AUDIT_MODULE_CATEGORIES: Record<string, { resources: string[]; actionKeywords: string[] }> = {
  inventory: {
    resources: ['inventory', 'inventory_consumption', 'restock_requests', 'purchase_orders', 'purchase_order', 'consumables', 'suppliers', 'products'],
    actionKeywords: ['INVENTORY', 'RESTOCK', 'PURCHASE_ORDER', 'STOCK', 'CONSUMPTION', 'PO_'],
  },
  management: {
    resources: ['staff', 'shifts', 'services', 'branch', 'service', 'shift', 'barber'],
    actionKeywords: ['STAFF', 'SHIFT', 'SERVICE', 'BRANCH', 'BARBER', 'ROSTER'],
  },
  booking: {
    resources: ['booking', 'queue', 'appointments', 'customers', 'appointment', 'customer'],
    actionKeywords: ['BOOKING', 'QUEUE', 'APPOINTMENT', 'CUSTOMER', 'WALKIN'],
  },
  pos: {
    resources: ['payment_attempt', 'transaction', 'orders', 'invoices', 'payment', 'order', 'pos', 'billing', 'cashier'],
    actionKeywords: ['PAYMENT', 'TRANSACTION', 'ORDER', 'INVOICE', 'CHECKOUT', 'BILLING'],
  },
  auth: {
    resources: ['auth', 'users', 'security_override', 'user', 'session', 'role'],
    actionKeywords: ['AUTH', 'LOGIN', 'LOGOUT', 'USER', 'PASSWORD', 'SECURITY', 'PERMISSION', 'OVERRIDE'],
  },
};

function buildModuleCondition(moduleFilter: string, params: any[]): string | null {
  if (!moduleFilter || moduleFilter === 'all') return null;

  const normalized = moduleFilter.toLowerCase().trim();
  const category = AUDIT_MODULE_CATEGORIES[normalized];

  if (category) {
    params.push(category.resources);
    const resIdx = params.length;

    const keywordConditions = category.actionKeywords.map((kw) => {
      params.push(`%${kw}%`);
      return `a.action ILIKE $${params.length}`;
    });

    return `(LOWER(COALESCE(a.resource, '')) = ANY($${resIdx}::text[]) OR ${keywordConditions.join(' OR ')})`;
  }

  params.push(`%${normalized}%`);
  const paramIdx = params.length;
  return `(a.resource ILIKE $${paramIdx} OR a.action ILIKE $${paramIdx})`;
}

function buildKeywordSearchCondition(filter: string, params: any[]): string {
  params.push(`%${filter}%`);
  const searchParam = `$${params.length}`;

  // Trigram indexes need at least three consecutive characters to be selective.
  // Keep the simpler joined predicate for shorter searches.
  if (filter.length < 3) {
    return `(a.action ILIKE ${searchParam} OR a.resource ILIKE ${searchParam} OR u.email ILIKE ${searchParam} OR u.username ILIKE ${searchParam} OR b.name ILIKE ${searchParam} OR c.first_name ILIKE ${searchParam} OR c.last_name ILIKE ${searchParam} OR a.details::text ILIKE ${searchParam})`;
  }

  return `a.audit_id IN (
    SELECT matching_logs.audit_id
    FROM (
      SELECT text_logs.audit_id
      FROM audit_logs text_logs
      WHERE text_logs.action ILIKE ${searchParam}
         OR text_logs.resource ILIKE ${searchParam}
         OR text_logs.details::text ILIKE ${searchParam}
      UNION
      SELECT actor_logs.audit_id
      FROM audit_logs actor_logs
      WHERE actor_logs.user_id IN (
        SELECT u.user_id
        FROM users u
        WHERE u.email ILIKE ${searchParam} OR u.username ILIKE ${searchParam}
        UNION
        SELECT b.user_id
        FROM barbers b
        WHERE b.name ILIKE ${searchParam}
        UNION
        SELECT c.user_id
        FROM customers c
        WHERE c.first_name ILIKE ${searchParam} OR c.last_name ILIKE ${searchParam}
      )
    ) matching_logs
  )`;
}

/**
 * Repository for handling audit log database operations.
 */
export class AuditRepository {
  
  /**
   * Inserts a new audit log record.
   */
  async create(data: {
    userId: string | null;
    action: string;
    resource: string;
    details: string;
    ipAddress: string | null;
    userAgent: string | null;
  }, client?: PoolClient): Promise<void> {
    const values = [
      data.userId,
      data.action,
      data.resource,
      data.details,
      data.ipAddress,
      data.userAgent,
    ];
    const query = `INSERT INTO audit_logs (user_id, action, resource, details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)`;
    if (client) {
      await client.query(query, values);
    } else {
      await db.query(query, values);
    }
  }

  /**
   * Retrieves audit logs with pagination and optional keyword filtering.
   */
  async findAll({
    limit,
    offset,
    filter,
    roleFilter,
    statusFilter,
    sortBy,
    moduleFilter,
    startDate,
    endDate,
  }: {
    limit: number;
    offset: number;
    filter?: string;
    roleFilter?: string;
    statusFilter?: string;
    sortBy?: string;
    moduleFilter?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<any[]> {
    const params: any[] = [];
    const conditions: string[] = [];

    if (filter) {
      conditions.push(buildKeywordSearchCondition(filter, params));
    }

    if (roleFilter && roleFilter !== 'all') {
      params.push(roleFilter);
      conditions.push(`u.role = $${params.length}`);
    }

    if (statusFilter && statusFilter !== 'all') {
      if (statusFilter === 'SUCCESS') {
        conditions.push(`NOT (a.action ILIKE '%FAIL%' OR a.action ILIKE '%ERROR%' OR a.action ILIKE '%DENIED%')`);
      } else if (statusFilter === 'FAILURE') {
        conditions.push(`(a.action ILIKE '%FAIL%' OR a.action ILIKE '%ERROR%' OR a.action ILIKE '%DENIED%')`);
      }
    }

    if (moduleFilter) {
      const modCond = buildModuleCondition(moduleFilter, params);
      if (modCond) {
        conditions.push(modCond);
      }
    }

    if (startDate) {
      params.push(startDate);
      conditions.push(`(a.created_at AT TIME ZONE 'Asia/Manila')::date >= $${params.length}::date`);
    }

    if (endDate) {
      params.push(endDate);
      conditions.push(`(a.created_at AT TIME ZONE 'Asia/Manila')::date <= $${params.length}::date`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Sanitize and construct ORDER BY clause
    let orderBy = 'ORDER BY a.created_at DESC';
    if (sortBy) {
      const allowedSorts: Record<string, string> = {
        'timestamp_desc': 'a.created_at DESC',
        'timestamp_asc': 'a.created_at ASC',
        'email_asc': 'u.email ASC NULLS LAST',
        'email_desc': 'u.email DESC NULLS LAST',
        'action_asc': 'a.action ASC',
        'action_desc': 'a.action DESC',
      };
      if (allowedSorts[sortBy]) {
        orderBy = `ORDER BY ${allowedSorts[sortBy]}`;
      }
    }

    params.push(limit);
    const limitIndex = params.length;
    params.push(offset);
    const offsetIndex = params.length;

    const query = `
      SELECT a.*,
        COALESCE(
          NULLIF(TRIM(u.username), ''),
          NULLIF(TRIM(b.name), ''),
          NULLIF(TRIM(CONCAT(c.first_name, ' ', c.last_name)), ''),
          u.email
        ) as actor_name,
        u.email as actor_email,
        u.role as actor_role,
        CASE 
            WHEN a.action ILIKE '%FAIL%' OR a.action ILIKE '%ERROR%' OR a.action ILIKE '%DENIED%' THEN 'FAILURE'
            ELSE 'SUCCESS'
        END as status
      FROM audit_logs a
      LEFT JOIN users u ON a.user_id = u.user_id
      LEFT JOIN barbers b ON a.user_id = b.user_id
      LEFT JOIN customers c ON a.user_id = c.user_id
      ${whereClause}
      ${orderBy}
      LIMIT $${limitIndex} OFFSET $${offsetIndex}
    `;

    const result: QueryResult = await db.query(query, params);
    return result.rows;
  }

  /**
   * Counts total audit logs matching the filter.
   */
  async count(
    filter?: string,
    roleFilter?: string,
    statusFilter?: string,
    moduleFilter?: string,
    startDate?: string,
    endDate?: string,
  ): Promise<number> {
    const params: any[] = [];
    let joinClause = 'LEFT JOIN users u ON a.user_id = u.user_id LEFT JOIN barbers b ON a.user_id = b.user_id LEFT JOIN customers c ON a.user_id = c.user_id';
    const conditions: string[] = [];

    if (filter) {
      conditions.push(buildKeywordSearchCondition(filter, params));
    }

    if (roleFilter && roleFilter !== 'all') {
      params.push(roleFilter);
      conditions.push(`u.role = $${params.length}`);
    }

    if (statusFilter && statusFilter !== 'all') {
      if (statusFilter === 'SUCCESS') {
        conditions.push(`NOT (a.action ILIKE '%FAIL%' OR a.action ILIKE '%ERROR%' OR a.action ILIKE '%DENIED%')`);
      } else if (statusFilter === 'FAILURE') {
        conditions.push(`(a.action ILIKE '%FAIL%' OR a.action ILIKE '%ERROR%' OR a.action ILIKE '%DENIED%')`);
      }
    }

    if (moduleFilter) {
      const modCond = buildModuleCondition(moduleFilter, params);
      if (modCond) {
        conditions.push(modCond);
      }
    }

    if (startDate) {
      params.push(startDate);
      conditions.push(`(a.created_at AT TIME ZONE 'Asia/Manila')::date >= $${params.length}::date`);
    }

    if (endDate) {
      params.push(endDate);
      conditions.push(`(a.created_at AT TIME ZONE 'Asia/Manila')::date <= $${params.length}::date`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT COUNT(*) 
      FROM audit_logs a ${joinClause} ${whereClause}
    `;

    const result: QueryResult = await db.query(query, params);
    return parseInt(result.rows[0].count);
  }

  /**
   * Retrieves summary statistics for the audit logs (e.g., last 24 hours).
   */
  async getDashboardStats(range: string = '24h'): Promise<any>  {

    const validIntervals: Record<string, string> = {
      '24h': '24 hours',
      '7d': '7 days',
      '30d': '30 days',
    };

    const interval = validIntervals[range] || '24 hours';

    const query = `
      SELECT
        COUNT(*) as total_24h,
        COUNT(*) FILTER (WHERE action ILIKE '%FAIL%' OR action ILIKE '%ERROR%' OR action ILIKE '%DENIED%') as failed_24h,
        COUNT(*) FILTER (WHERE action IN ('LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT')) as auth_24h
      FROM audit_logs
      WHERE created_at >= NOW() - INTERVAL '${interval}'
    `;
    const result: QueryResult = await db.query(query);
    return result.rows[0];
  }
}

export const auditRepository = new AuditRepository();
