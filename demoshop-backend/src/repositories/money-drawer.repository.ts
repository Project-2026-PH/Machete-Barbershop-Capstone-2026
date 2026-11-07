import db from '../db';
import type {
  MoneyDrawerLogItem,
  MoneyDrawerStatusResponse,
} from '@demoshop/shared-types';

export class MoneyDrawerRepository {
  private readonly db = db;
  private tablesEnsured = false;

  /**
   * Ensures the money drawer tables and indexes exist.
   */
  async ensureTables(): Promise<void> {
    if (this.tablesEnsured) return;
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS public.money_drawer_configs (
          id SERIAL PRIMARY KEY,
          branch_id INT REFERENCES branches(branch_id) ON DELETE CASCADE,
          amount NUMERIC(10, 2) NOT NULL DEFAULT 10000.00,
          target_date DATE NOT NULL,
          adjusted_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT uq_money_drawer_branch_date UNIQUE (branch_id, target_date)
      );

      CREATE TABLE IF NOT EXISTS public.money_drawer_logs (
          id SERIAL PRIMARY KEY,
          transaction_id VARCHAR(50) NOT NULL UNIQUE,
          branch_id INT REFERENCES branches(branch_id) ON DELETE CASCADE,
          amount NUMERIC(10, 2) NOT NULL,
          effective_date DATE NOT NULL,
          entry_type VARCHAR(40) NOT NULL,
          notes TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          created_by UUID REFERENCES users(user_id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_money_drawer_configs_branch_date ON public.money_drawer_configs(branch_id, target_date);
      CREATE INDEX IF NOT EXISTS idx_money_drawer_logs_branch_date ON public.money_drawer_logs(branch_id, effective_date);
      CREATE INDEX IF NOT EXISTS idx_money_drawer_logs_created_at ON public.money_drawer_logs(created_at DESC);
    `);
    this.tablesEnsured = true;
  }

  /**
   * Helper to format current date and hour in Asia/Manila timezone.
   */
  getManilaTimeContext(dateObj = new Date()) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(dateObj);
    const year = parts.find((p) => p.type === 'year')?.value || '2026';
    const month = parts.find((p) => p.type === 'month')?.value || '10';
    const day = parts.find((p) => p.type === 'day')?.value || '23';
    const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
    const minute = parts.find((p) => p.type === 'minute')?.value || '00';

    const dateStr = `${year}-${month}-${day}`;
    const timeStr = `${String(hour).padStart(2, '0')}:${minute}`;

    return { dateStr, hour, minute, timeStr };
  }

  /**
   * Retrieves the configured or carried-over expected cash amount for a branch on a given date.
   */
  async getConfiguredAmount(branchId: number, targetDate: string): Promise<{
    amount: number;
    isCustomForDate: boolean;
    lastModifiedAt: string | null;
  }> {
    await this.ensureTables();

    // 1. Check if an exact configuration exists for this target date
    const exactRes = await this.db.query(
      `SELECT amount, updated_at
       FROM money_drawer_configs
       WHERE branch_id = $1 AND target_date = $2::date
       LIMIT 1`,
      [branchId, targetDate]
    );

    if (exactRes.rows.length > 0) {
      return {
        amount: parseFloat(exactRes.rows[0].amount),
        isCustomForDate: true,
        lastModifiedAt: exactRes.rows[0].updated_at,
      };
    }

    // 2. Fallback: Automatically carry over the most recently configured amount
    const fallbackRes = await this.db.query(
      `SELECT amount, updated_at
       FROM money_drawer_configs
       WHERE branch_id = $1 AND target_date <= $2::date
       ORDER BY target_date DESC, id DESC
       LIMIT 1`,
      [branchId, targetDate]
    );

    if (fallbackRes.rows.length > 0) {
      return {
        amount: parseFloat(fallbackRes.rows[0].amount),
        isCustomForDate: false,
        lastModifiedAt: fallbackRes.rows[0].updated_at,
      };
    }

    // 3. Fallback to branch default or 10,000.00
    const branchRes = await this.db.query(
      `SELECT COALESCE(daily_float, 10000.00) AS default_float FROM branches WHERE branch_id = $1 LIMIT 1`,
      [branchId]
    );
    const defaultFloat = branchRes.rows.length > 0 ? parseFloat(branchRes.rows[0].default_float) : 10000.0;

    return {
      amount: defaultFloat,
      isCustomForDate: false,
      lastModifiedAt: null,
    };
  }

  /**
   * Checks whether the drawer amount has already been manually modified today.
   */
  async hasManualAdjustmentToday(branchId: number, dateStr: string): Promise<boolean> {
    await this.ensureTables();

    const checkRes = await this.db.query(
      `SELECT 1 FROM money_drawer_logs
       WHERE branch_id = $1
         AND effective_date = $2::date
         AND entry_type = 'manual_adjustment'
       LIMIT 1`,
      [branchId, dateStr]
    );

    return checkRes.rows.length > 0;
  }

  /**
   * Retrieves the current money drawer status, schedule state, and change history.
   */
  async getDrawerStatus(branchId: number, requestedDate?: string): Promise<MoneyDrawerStatusResponse> {
    await this.ensureTables();

    const manila = this.getManilaTimeContext();
    const effectiveDate = requestedDate || manila.dateStr;

    const { amount, isCustomForDate, lastModifiedAt } = await this.getConfiguredAmount(branchId, effectiveDate);
    const isModifiedToday = await this.hasManualAdjustmentToday(branchId, effectiveDate);
    const canModifyToday = !isModifiedToday;

    // Schedule logic in Manila time:
    // 12:00 AM (midnight) Daily Reset: active expected cash is reset to 0 (hours 0..8)
    // 9:00 AM Daily Injection: active expected cash is injected with configured amount (hours 9..23)
    const isInjectionActive = manila.hour >= 9;
    const activeFloat = isInjectionActive ? amount : 0;

    // If injection is active (>= 9:00 AM) and no daily_injection log exists yet for today, record it
    if (isInjectionActive && effectiveDate === manila.dateStr) {
      await this.ensureDailyInjectionLogged(branchId, effectiveDate, amount);
    }

    // Fetch change history logs
    const historyRes = await this.db.query(
      `SELECT
         id,
         transaction_id,
         amount::numeric AS amount,
         effective_date::text AS date,
         TO_CHAR(created_at AT TIME ZONE 'Asia/Manila', 'HH12:MI AM') AS time,
         entry_type,
         notes,
         created_at::text
       FROM money_drawer_logs
       WHERE branch_id = $1
       ORDER BY effective_date DESC, created_at DESC, id DESC
       LIMIT 100`,
      [branchId]
    );

    const history: MoneyDrawerLogItem[] = historyRes.rows.map((row: any) => ({
      id: row.id,
      transaction_id: row.transaction_id,
      amount: parseFloat(row.amount),
      date: row.date,
      time: row.time,
      entry_type: row.entry_type,
      notes: row.notes,
      created_at: row.created_at,
    }));

    return {
      branch_id: branchId,
      configured_amount: amount,
      effective_date: effectiveDate,
      is_modified_today: isModifiedToday,
      can_modify_today: canModifyToday,
      last_modified_at: lastModifiedAt,
      fallback_amount: isCustomForDate ? amount : 10000.0,
      schedule_status: {
        is_active: isInjectionActive,
        active_float: activeFloat,
        current_time_manila: `${manila.timeStr} Manila`,
        next_scheduled_event: isInjectionActive ? '12:00 AM (Midnight) Daily Reset' : '9:00 AM Daily Injection',
        next_scheduled_time: isInjectionActive ? '12:00 AM' : '09:00 AM',
      },
      history,
    };
  }

  /**
   * Records a manual drawer amount adjustment.
   * Enforces the once-a-day modification rule per branch.
   */
  async recordAdjustment(
    branchId: number,
    amount: number,
    dateStr: string,
    userId?: string,
    notes?: string
  ): Promise<MoneyDrawerLogItem> {
    await this.ensureTables();

    // Check once-per-day restriction
    const alreadyAdjusted = await this.hasManualAdjustmentToday(branchId, dateStr);
    if (alreadyAdjusted) {
      throw new Error(
        `The expected cash drawer amount has already been adjusted for date ${dateStr}. Modifications are restricted to once per calendar day.`
      );
    }

    // Upsert into money_drawer_configs
    await this.db.query(
      `INSERT INTO money_drawer_configs (branch_id, amount, target_date, adjusted_by, updated_at)
       VALUES ($1, $2, $3::date, $4, NOW())
       ON CONFLICT (branch_id, target_date)
       DO UPDATE SET amount = EXCLUDED.amount, adjusted_by = EXCLUDED.adjusted_by, updated_at = NOW()`,
      [branchId, amount, dateStr, userId || null]
    );

    // Update branches daily_float as well for continuity
    await this.db.query(
      `UPDATE branches SET daily_float = $2 WHERE branch_id = $1`,
      [branchId, amount]
    );

    // Generate unique transaction ID: TXD-YYYYMMDD-XXXX
    const cleanDate = dateStr.replace(/-/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const transactionId = `TXD-${cleanDate}-${randomSuffix}`;

    const logRes = await this.db.query(
      `INSERT INTO money_drawer_logs (
         transaction_id, branch_id, amount, effective_date, entry_type, notes, created_by, created_at
       )
       VALUES ($1, $2, $3, $4::date, 'manual_adjustment', $5, $6, NOW())
       RETURNING
         id,
         transaction_id,
         amount::numeric AS amount,
         effective_date::text AS date,
         TO_CHAR(created_at AT TIME ZONE 'Asia/Manila', 'HH12:MI AM') AS time,
         entry_type,
         notes,
         created_at::text`,
      [
        transactionId,
        branchId,
        amount,
        dateStr,
        notes || 'Manual admin drawer expected cash adjustment',
        userId || null,
      ]
    );

    const row = logRes.rows[0];
    return {
      id: row.id,
      transaction_id: row.transaction_id,
      amount: parseFloat(row.amount),
      date: row.date,
      time: row.time,
      entry_type: row.entry_type,
      notes: row.notes,
      created_at: row.created_at,
    };
  }

  /**
   * Ensures that the 9:00 AM daily injection is logged for today in the history table.
   */
  async ensureDailyInjectionLogged(branchId: number, dateStr: string, amount: number): Promise<void> {
    const existing = await this.db.query(
      `SELECT 1 FROM money_drawer_logs
       WHERE branch_id = $1
         AND effective_date = $2::date
         AND entry_type = 'daily_injection'
       LIMIT 1`,
      [branchId, dateStr]
    );

    if (existing.rows.length === 0) {
      const cleanDate = dateStr.replace(/-/g, '');
      const transactionId = `INJ-${cleanDate}-0900`;

      await this.db.query(
        `INSERT INTO money_drawer_logs (
           transaction_id, branch_id, amount, effective_date, entry_type, notes, created_at
         )
         VALUES ($1, $2, $3, $4::date, 'daily_injection', 'Automated 9:00 AM daily injection to Cashier POS', NOW())
         ON CONFLICT (transaction_id) DO NOTHING`,
        [transactionId, branchId, amount, dateStr]
      );
    }
  }

  /**
   * Retrieves the active Expected Cash float for the Cashier POS based on the schedule.
   * If before 9:00 AM: returns 0 (cleared at 12:00 AM midnight).
   * If 9:00 AM or after: returns the configured (or carried-over) amount.
   */
  async getActiveDrawerFloat(branchId: number): Promise<{
    activeFloat: number;
    configuredAmount: number;
    isReset: boolean;
  }> {
    const manila = this.getManilaTimeContext();
    const { amount } = await this.getConfiguredAmount(branchId, manila.dateStr);

    const isInjectionActive = manila.hour >= 9;
    const activeFloat = isInjectionActive ? amount : 0;

    if (isInjectionActive) {
      await this.ensureDailyInjectionLogged(branchId, manila.dateStr, amount);
    }

    return {
      activeFloat,
      configuredAmount: amount,
      isReset: !isInjectionActive,
    };
  }
}

export const moneyDrawerRepository = new MoneyDrawerRepository();
