import db from '../db';
import logger from '../utils/general/logger';
import type { IntegrityCheckResult, IntegrityIssueItem } from '@demoshop/shared-types';

export class DiagnosticsRepository {
  /**
   * 1. Account -> Role Integrity
   * Verifies that all active user accounts have assigned valid platform roles.
   */
  async checkAccountRoles(): Promise<IntegrityCheckResult> {
    const id = 'account_roles';
    const name = 'Account → Role Validity';
    const category = 'Identity & Accounts';
    const description = 'Verifies that all active user accounts have assigned valid platform roles.';

    try {
      const countRes = await db.query(`
        SELECT COUNT(*)::int as total,
               COUNT(*) FILTER (WHERE role IS NULL OR role NOT IN ('System Admin', 'Owner', 'Shop Admin', 'Cashier', 'Barber', 'Inventory Manager', 'Customer'))::int as issues
        FROM users
        WHERE deleted_at IS NULL;
      `);

      const total = Number(countRes.rows[0]?.total || 0);
      const issuesCount = Number(countRes.rows[0]?.issues || 0);

      const issues: IntegrityIssueItem[] = [];
      if (issuesCount > 0) {
        const issuesRes = await db.query(`
          SELECT user_id, username, email, role
          FROM users
          WHERE deleted_at IS NULL
            AND (role IS NULL OR role NOT IN ('System Admin', 'Owner', 'Shop Admin', 'Cashier', 'Barber', 'Inventory Manager', 'Customer'))
          LIMIT 20;
        `);

        for (const row of issuesRes.rows) {
          issues.push({
            recordRef: `usr_${String(row.user_id).slice(0, 8)}`,
            problem: row.role ? `Invalid role assignment '${row.role}'` : 'Missing / NULL role assignment',
            details: { username: row.username || 'N/A', role: row.role || null },
          });
        }
      }

      return {
        id,
        name,
        category,
        description,
        status: issuesCount === 0 ? 'PASSED' : 'ISSUES_FOUND',
        checkedCount: total,
        issueCount: issuesCount,
        issues,
      };
    } catch (err: any) {
      logger.error('[Diagnostics] Failed checkAccountRoles:', err);
      return {
        id,
        name,
        category,
        description,
        status: 'FAILED_TO_CHECK',
        checkedCount: 0,
        issueCount: 0,
        issues: [],
        errorMessage: err.message || 'Database query failed',
      };
    }
  }

  /**
   * 2. Barber Profile -> User Account
   * Verifies that all barber profiles link to active, valid user accounts with the Barber role.
   */
  async checkBarberUserAccounts(): Promise<IntegrityCheckResult> {
    const id = 'barber_accounts';
    const name = 'Barber Profile → User Account';
    const category = 'Staff & Accounts';
    const description = 'Verifies that all barber profiles link to active user accounts with the Barber role.';

    try {
      const countRes = await db.query(`
        SELECT COUNT(*)::int as total,
               COUNT(*) FILTER (WHERE b.user_id IS NULL OR u.user_id IS NULL OR u.deleted_at IS NOT NULL OR u.role != 'Barber')::int as issues
        FROM barbers b
        LEFT JOIN users u ON b.user_id = u.user_id;
      `);

      const total = Number(countRes.rows[0]?.total || 0);
      const issuesCount = Number(countRes.rows[0]?.issues || 0);

      const issues: IntegrityIssueItem[] = [];
      if (issuesCount > 0) {
        const issuesRes = await db.query(`
          SELECT b.barber_id, b.name, b.user_id, u.role as user_role, u.deleted_at
          FROM barbers b
          LEFT JOIN users u ON b.user_id = u.user_id
          WHERE b.user_id IS NULL OR u.user_id IS NULL OR u.deleted_at IS NOT NULL OR u.role != 'Barber'
          LIMIT 20;
        `);

        for (const row of issuesRes.rows) {
          let problem = 'Unlinked barber record (no user_id)';
          if (!row.user_id) {
            problem = 'Barber record has no linked user_id';
          } else if (!row.user_role) {
            problem = 'Linked user account does not exist or was purged';
          } else if (row.deleted_at) {
            problem = 'Linked user account is soft-deleted';
          } else if (row.user_role !== 'Barber') {
            problem = `Linked user account has mismatched role '${row.user_role}' (expected Barber)`;
          }

          issues.push({
            recordRef: `BARBER-${row.barber_id}`,
            problem,
            details: { name: row.name, userId: row.user_id ? `usr_${String(row.user_id).slice(0, 8)}` : null },
          });
        }
      }

      return {
        id,
        name,
        category,
        description,
        status: issuesCount === 0 ? 'PASSED' : 'ISSUES_FOUND',
        checkedCount: total,
        issueCount: issuesCount,
        issues,
      };
    } catch (err: any) {
      logger.error('[Diagnostics] Failed checkBarberUserAccounts:', err);
      return {
        id,
        name,
        category,
        description,
        status: 'FAILED_TO_CHECK',
        checkedCount: 0,
        issueCount: 0,
        issues: [],
        errorMessage: err.message || 'Database query failed',
      };
    }
  }

  /**
   * 3. Customer Profile -> User Account
   * Verifies that customer profiles with linked user accounts resolve to existing non-deleted users.
   */
  async checkCustomerUserAccounts(): Promise<IntegrityCheckResult> {
    const id = 'customer_accounts';
    const name = 'Customer Profile → User Account';
    const category = 'Identity & Accounts';
    const description = 'Verifies that customer profiles with linked user accounts resolve to existing non-deleted users.';

    try {
      const countRes = await db.query(`
        SELECT COUNT(*)::int as total,
               COUNT(*) FILTER (WHERE c.user_id IS NOT NULL AND (u.user_id IS NULL OR u.deleted_at IS NOT NULL))::int as issues
        FROM customers c
        LEFT JOIN users u ON c.user_id = u.user_id;
      `);

      const total = Number(countRes.rows[0]?.total || 0);
      const issuesCount = Number(countRes.rows[0]?.issues || 0);

      const issues: IntegrityIssueItem[] = [];
      if (issuesCount > 0) {
        const issuesRes = await db.query(`
          SELECT c.customer_id, c.first_name, c.last_name, c.user_id, u.deleted_at
          FROM customers c
          LEFT JOIN users u ON c.user_id = u.user_id
          WHERE c.user_id IS NOT NULL AND (u.user_id IS NULL OR u.deleted_at IS NOT NULL)
          LIMIT 20;
        `);

        for (const row of issuesRes.rows) {
          issues.push({
            recordRef: `CUST-${row.customer_id}`,
            problem: row.deleted_at ? 'Linked user account is soft-deleted' : 'Linked user account does not exist',
            details: { customerId: row.customer_id, userId: `usr_${String(row.user_id).slice(0, 8)}` },
          });
        }
      }

      return {
        id,
        name,
        category,
        description,
        status: issuesCount === 0 ? 'PASSED' : 'ISSUES_FOUND',
        checkedCount: total,
        issueCount: issuesCount,
        issues,
      };
    } catch (err: any) {
      logger.error('[Diagnostics] Failed checkCustomerUserAccounts:', err);
      return {
        id,
        name,
        category,
        description,
        status: 'FAILED_TO_CHECK',
        checkedCount: 0,
        issueCount: 0,
        issues: [],
        errorMessage: err.message || 'Database query failed',
      };
    }
  }

  /**
   * 4. Active Queue -> Assigned Barber
   * Verifies that active and waiting queue tickets reference active, existing barbers.
   */
  async checkQueueActiveBarbers(): Promise<IntegrityCheckResult> {
    const id = 'queue_barbers';
    const name = 'Active Queue → Assigned Barber';
    const category = 'Queue Operations';
    const description = 'Verifies that active and waiting queue tickets reference active, existing barbers.';

    try {
      const countRes = await db.query(`
        SELECT COUNT(*)::int as total,
               COUNT(*) FILTER (WHERE q.barber_id IS NOT NULL AND (b.barber_id IS NULL OR b.is_active = FALSE))::int as issues
        FROM queue_entries q
        LEFT JOIN barbers b ON q.barber_id = b.barber_id
        WHERE q.status IN ('waiting', 'serving', 'in_progress');
      `);

      const total = Number(countRes.rows[0]?.total || 0);
      const issuesCount = Number(countRes.rows[0]?.issues || 0);

      const issues: IntegrityIssueItem[] = [];
      if (issuesCount > 0) {
        const issuesRes = await db.query(`
          SELECT q.id as queue_id, q.customer_name, q.barber_id, q.status, b.is_active as barber_active
          FROM queue_entries q
          LEFT JOIN barbers b ON q.barber_id = b.barber_id
          WHERE q.status IN ('waiting', 'serving', 'in_progress')
            AND q.barber_id IS NOT NULL
            AND (b.barber_id IS NULL OR b.is_active = FALSE)
          LIMIT 20;
        `);

        for (const row of issuesRes.rows) {
          issues.push({
            recordRef: `Q-${row.queue_id}`,
            problem: !row.barber_active && row.barber_id
              ? `Assigned Barber #${row.barber_id} is marked inactive`
              : `Assigned Barber #${row.barber_id} does not exist in barbers table`,
            details: { queueId: row.queue_id, barberId: row.barber_id, queueStatus: row.status },
          });
        }
      }

      return {
        id,
        name,
        category,
        description,
        status: issuesCount === 0 ? 'PASSED' : 'ISSUES_FOUND',
        checkedCount: total,
        issueCount: issuesCount,
        issues,
      };
    } catch (err: any) {
      logger.error('[Diagnostics] Failed checkQueueActiveBarbers:', err);
      return {
        id,
        name,
        category,
        description,
        status: 'FAILED_TO_CHECK',
        checkedCount: 0,
        issueCount: 0,
        issues: [],
        errorMessage: err.message || 'Database query failed',
      };
    }
  }

  /**
   * 5. Scheduled Queue -> Customer Profile
   * Verifies that scheduled non-walk-in queue entries reference valid existing customer records.
   */
  async checkQueueNonWalkInCustomers(): Promise<IntegrityCheckResult> {
    const id = 'queue_customers';
    const name = 'Scheduled Queue → Customer Profile';
    const category = 'Queue Operations';
    const description = 'Verifies that scheduled non-walk-in queue entries reference valid existing customer records.';

    try {
      const countRes = await db.query(`
        SELECT COUNT(*)::int as total,
               COUNT(*) FILTER (WHERE q.is_walk_in = FALSE AND (q.customer_id IS NULL OR c.customer_id IS NULL))::int as issues
        FROM queue_entries q
        LEFT JOIN customers c ON q.customer_id = c.customer_id;
      `);

      const total = Number(countRes.rows[0]?.total || 0);
      const issuesCount = Number(countRes.rows[0]?.issues || 0);

      const issues: IntegrityIssueItem[] = [];
      if (issuesCount > 0) {
        const issuesRes = await db.query(`
          SELECT q.id as queue_id, q.customer_id, q.is_walk_in, q.status
          FROM queue_entries q
          LEFT JOIN customers c ON q.customer_id = c.customer_id
          WHERE q.is_walk_in = FALSE AND (q.customer_id IS NULL OR c.customer_id IS NULL)
          LIMIT 20;
        `);

        for (const row of issuesRes.rows) {
          issues.push({
            recordRef: `Q-${row.queue_id}`,
            problem: row.customer_id
              ? `Customer reference #${row.customer_id} does not exist in customers table`
              : 'Non-walk-in reservation has missing / NULL customer_id',
            details: { queueId: row.queue_id, customerId: row.customer_id || null, status: row.status },
          });
        }
      }

      return {
        id,
        name,
        category,
        description,
        status: issuesCount === 0 ? 'PASSED' : 'ISSUES_FOUND',
        checkedCount: total,
        issueCount: issuesCount,
        issues,
      };
    } catch (err: any) {
      logger.error('[Diagnostics] Failed checkQueueNonWalkInCustomers:', err);
      return {
        id,
        name,
        category,
        description,
        status: 'FAILED_TO_CHECK',
        checkedCount: 0,
        issueCount: 0,
        issues: [],
        errorMessage: err.message || 'Database query failed',
      };
    }
  }

  /**
   * 6. Completed Transaction -> Customer Reference
   * Verifies that customer transactions link to valid, existing customer profiles.
   */
  async checkTransactionCustomers(): Promise<IntegrityCheckResult> {
    const id = 'transaction_customers';
    const name = 'Transaction → Customer Reference';
    const category = 'Transactions';
    const description = 'Verifies that customer transactions link to valid, existing customer profiles.';

    try {
      const countRes = await db.query(`
        SELECT COUNT(*)::int as total,
               COUNT(*) FILTER (WHERE t.customer_id IS NOT NULL AND c.customer_id IS NULL)::int as issues
        FROM transactions t
        LEFT JOIN customers c ON t.customer_id = c.customer_id;
      `);

      const total = Number(countRes.rows[0]?.total || 0);
      const issuesCount = Number(countRes.rows[0]?.issues || 0);

      const issues: IntegrityIssueItem[] = [];
      if (issuesCount > 0) {
        const issuesRes = await db.query(`
          SELECT t.transaction_id, t.customer_id, t.total_amount, t.created_at
          FROM transactions t
          LEFT JOIN customers c ON t.customer_id = c.customer_id
          WHERE t.customer_id IS NOT NULL AND c.customer_id IS NULL
          LIMIT 20;
        `);

        for (const row of issuesRes.rows) {
          issues.push({
            recordRef: `TXN-${row.transaction_id}`,
            problem: `Customer reference #${row.customer_id} does not exist in customers table`,
            details: { transactionId: row.transaction_id, customerId: row.customer_id, amount: row.total_amount },
          });
        }
      }

      return {
        id,
        name,
        category,
        description,
        status: issuesCount === 0 ? 'PASSED' : 'ISSUES_FOUND',
        checkedCount: total,
        issueCount: issuesCount,
        issues,
      };
    } catch (err: any) {
      logger.error('[Diagnostics] Failed checkTransactionCustomers:', err);
      return {
        id,
        name,
        category,
        description,
        status: 'FAILED_TO_CHECK',
        checkedCount: 0,
        issueCount: 0,
        issues: [],
        errorMessage: err.message || 'Database query failed',
      };
    }
  }

  /**
   * 7. Inventory Stock -> Product Catalog
   * Verifies that all inventory stock balances map to registered catalog products.
   */
  async checkInventoryStockProducts(): Promise<IntegrityCheckResult> {
    const id = 'inventory_products';
    const name = 'Inventory Stock → Product Catalog';
    const category = 'Inventory';
    const description = 'Verifies that all inventory stock balances map to registered catalog products.';

    try {
      const countRes = await db.query(`
        SELECT COUNT(*)::int as total,
               COUNT(*) FILTER (WHERE p.inventory_product_id IS NULL)::int as issues
        FROM inventory_stock s
        LEFT JOIN inventory_products p ON s.inventory_product_id = p.inventory_product_id;
      `);

      const total = Number(countRes.rows[0]?.total || 0);
      const issuesCount = Number(countRes.rows[0]?.issues || 0);

      const issues: IntegrityIssueItem[] = [];
      if (issuesCount > 0) {
        const issuesRes = await db.query(`
          SELECT s.inventory_stock_id, s.inventory_product_id, s.branch_id, s.current_quantity
          FROM inventory_stock s
          LEFT JOIN inventory_products p ON s.inventory_product_id = p.inventory_product_id
          WHERE p.inventory_product_id IS NULL
          LIMIT 20;
        `);

        for (const row of issuesRes.rows) {
          issues.push({
            recordRef: `STOCK-${row.inventory_stock_id}`,
            problem: `Referenced product #${row.inventory_product_id} not found in inventory_products catalog`,
            details: { stockId: row.inventory_stock_id, productId: row.inventory_product_id, branchId: row.branch_id },
          });
        }
      }

      return {
        id,
        name,
        category,
        description,
        status: issuesCount === 0 ? 'PASSED' : 'ISSUES_FOUND',
        checkedCount: total,
        issueCount: issuesCount,
        issues,
      };
    } catch (err: any) {
      logger.error('[Diagnostics] Failed checkInventoryStockProducts:', err);
      return {
        id,
        name,
        category,
        description,
        status: 'FAILED_TO_CHECK',
        checkedCount: 0,
        issueCount: 0,
        issues: [],
        errorMessage: err.message || 'Database query failed',
      };
    }
  }

  // ── Diagnostic Demo & Testing Data Methods ─────────────────────

  /**
   * Resolves or safely inserts the designated internal diagnostic customer.
   * Never creates a login user; purely satisfies relational FK/NOT NULL constraints.
   */
  async findOrCreateDiagnosticCustomer(): Promise<{ customer_id: number; first_name: string; last_name: string }> {
    const existing = await db.query(
      `SELECT customer_id, first_name, last_name 
       FROM customers 
       WHERE email = 'portfolio@example.invalid'`
    );
    if (existing.rows.length > 0) {
      return existing.rows[0];
    }

    const inserted = await db.query(
      `INSERT INTO customers (first_name, last_name, email, phone_number)
       VALUES ('Test', 'Customer', 'portfolio@example.invalid', '09XX XXX XXXX')
       ON CONFLICT (email) DO UPDATE 
       SET first_name = 'Test', last_name = 'Customer'
       RETURNING customer_id, first_name, last_name`
    );
    return inserted.rows[0];
  }

  /**
   * Retrieves compact counts of records positively identified as diagnostic test data.
   */
  async getTestDataCounts(): Promise<{ reservationsCount: number; walkInsCount: number; reviewsCount: number; total: number }> {
    const resRes = await db.query(
      `SELECT COUNT(*)::int AS count 
       FROM queue_entries 
       WHERE (is_test = TRUE OR offline_idempotency_key LIKE 'diag_test_res_%') 
         AND is_walk_in = FALSE`
    );
    const walkRes = await db.query(
      `SELECT COUNT(*)::int AS count 
       FROM queue_entries 
       WHERE (is_test = TRUE OR offline_idempotency_key LIKE 'diag_test_walkin_%') 
         AND is_walk_in = TRUE`
    );
    const revRes = await db.query(
      `SELECT COUNT(*)::int AS count 
       FROM ratings 
       WHERE is_test = TRUE`
    );

    const reservationsCount = resRes.rows[0]?.count || 0;
    const walkInsCount = walkRes.rows[0]?.count || 0;
    const reviewsCount = revRes.rows[0]?.count || 0;
    return {
      reservationsCount,
      walkInsCount,
      reviewsCount,
      total: reservationsCount + walkInsCount + reviewsCount,
    };
  }

  /**
   * Retrieves summary details of test data for pre-cleanup review.
   */
  async getTestDataReview() {
    const counts = await this.getTestDataCounts();

    const reservationsQuery = await db.query(
      `SELECT qe.id, 
              COALESCE(CONCAT(c.first_name, ' ', c.last_name), qe.customer_name, 'Test Customer') AS "customerName",
              COALESCE(b.name, 'Unassigned') AS "barberName",
              COALESCE(qe.preferred_date::text, '—') AS date,
              COALESCE(qe.preferred_time, '—') AS time,
              qe.status
       FROM queue_entries qe
       LEFT JOIN customers c ON qe.customer_id = c.customer_id
       LEFT JOIN barbers b ON qe.barber_id = b.barber_id
       WHERE (qe.is_test = TRUE OR qe.offline_idempotency_key LIKE 'diag_test_res_%') 
         AND qe.is_walk_in = FALSE
       ORDER BY qe.id DESC
       LIMIT 50`
    );

    const walkInsQuery = await db.query(
      `SELECT qe.id, 
              qe.customer_name AS "customerName",
              COALESCE(b.name, 'Unassigned') AS "barberName",
              qe.position,
              qe.status
       FROM queue_entries qe
       LEFT JOIN barbers b ON qe.barber_id = b.barber_id
       WHERE (qe.is_test = TRUE OR qe.offline_idempotency_key LIKE 'diag_test_walkin_%') 
         AND qe.is_walk_in = TRUE
       ORDER BY qe.id DESC
       LIMIT 50`
    );

    const reviewsQuery = await db.query(
      `SELECT r.rating_id AS id, 
              COALESCE(b.name, 'Barber') AS "barberName",
              r.stars,
              COALESCE(r.comment, '') AS comment,
              to_char(r.created_at, 'Mon DD, YYYY') AS date
       FROM ratings r
       LEFT JOIN barbers b ON r.barber_id = b.barber_id
       WHERE r.is_test = TRUE
       ORDER BY r.rating_id DESC
       LIMIT 50`
    );

    return {
      counts,
      reservations: reservationsQuery.rows,
      walkIns: walkInsQuery.rows,
      reviews: reviewsQuery.rows,
    };
  }

  /**
   * Returns distinct barber IDs affected by active test queue entries.
   */
  async findBarbersWithTestQueueEntries(): Promise<number[]> {
    const result = await db.query(
      `SELECT DISTINCT barber_id 
       FROM queue_entries 
       WHERE (is_test = TRUE OR offline_idempotency_key LIKE 'diag_test_%') 
         AND barber_id IS NOT NULL`
    );
    return result.rows.map(r => r.barber_id);
  }

  /**
   * Returns distinct barber IDs affected by test reviews.
   */
  async findBarbersWithTestReviews(): Promise<number[]> {
    const result = await db.query(
      `SELECT DISTINCT barber_id 
       FROM ratings 
       WHERE is_test = TRUE AND barber_id IS NOT NULL`
    );
    return result.rows.map(r => r.barber_id);
  }

  /**
   * Purges test reservations.
   */
  async purgeTestReservations(): Promise<number> {
    const result = await db.query(
      `DELETE FROM queue_entries 
       WHERE (is_test = TRUE OR offline_idempotency_key LIKE 'diag_test_res_%') 
         AND is_walk_in = FALSE 
       RETURNING id`
    );
    return result.rowCount || 0;
  }

  /**
   * Purges test walk-ins and their linked guest profiles.
   */
  async purgeTestWalkIns(): Promise<number> {
    const deleteEntries = await db.query(
      `DELETE FROM queue_entries 
       WHERE (is_test = TRUE OR offline_idempotency_key LIKE 'diag_test_walkin_%') 
         AND is_walk_in = TRUE 
       RETURNING id, guest_profile_id`
    );

    // Clean up corresponding guest profiles
    await db.query(
      `DELETE FROM guest_profiles 
       WHERE idempotency_key LIKE 'diag_test_walkin_%'`
    );

    return deleteEntries.rowCount || 0;
  }

  /**
   * Purges test ratings.
   */
  async purgeTestReviews(): Promise<number> {
    const result = await db.query(
      `DELETE FROM ratings 
       WHERE is_test = TRUE 
       RETURNING rating_id`
    );
    return result.rowCount || 0;
  }

  /**
   * Fetches the current live queue for a barber to display in the Skip tool.
   */
  async getLiveBarberQueueForSkip(barberId: number) {
    const result = await db.query(
      `SELECT qe.id, 
              qe.position, 
              COALESCE(CONCAT(c.first_name, ' ', c.last_name), qe.customer_name, 'Guest Customer') AS "customerName",
              COALESCE(s.title, 'Haircut / Grooming') AS "serviceTitle",
              qe.status,
              qe.is_test AS "isTest",
              COALESCE(qe.preferred_date::text, '') AS "preferredDate",
              COALESCE(qe.preferred_time, '') AS "preferredTime"
       FROM queue_entries qe
       LEFT JOIN customers c ON qe.customer_id = c.customer_id
       LEFT JOIN services s ON qe.service_id = s.service_id
       WHERE qe.barber_id = $1 
         AND qe.status IN ('waiting', 'serving', 'accepted', 'late')
       ORDER BY 
         CASE 
           WHEN qe.status = 'serving' THEN 1 
           WHEN qe.status = 'waiting' THEN 2 
           ELSE 3 
         END, 
         qe.position ASC, 
         qe.id ASC`,
      [barberId]
    );
    return result.rows;
  }
}

export const diagnosticsRepository = new DiagnosticsRepository();
