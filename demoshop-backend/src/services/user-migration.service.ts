import db from '../db/index';
import logger from '../utils/general/logger';
import { parseNameString } from '../utils/general/auth-helpers.util';

/**
 * Minimal shape of a Supabase Auth user handed off by the OAuth flow.
 * Kept intentionally narrow so callers cannot accidentally pass extra
 * PII into the service.
 */
export interface GoogleSessionUser {
  id: string;
  email: string | null | undefined;
  user_metadata?: Record<string, any> | null;
}

/**
 * Result codes returned by the sync operation. Callers use these for
 * metrics and non-PII structured logs.
 */
export type UserSyncStatus = 'noop' | 'created' | 'migrated';

const PG_UNIQUE_VIOLATION = '23505';

const truncate = (value: string, max: number): string =>
  value.length > max ? value.substring(0, max) : value;

/**
 * Reconciles the `public.users` schema with a Supabase-authenticated
 * Google user.
 *
 * Responsibilities:
 *   • no-op when the profile already exists
 *   • create a fresh profile if none is present under this email
 *   • migrate an orphaned legacy row (email match, different user_id)
 *     to the new Supabase UUID inside a single transaction
 *
 * The service accepts a narrow DTO and never logs email or user_id
 * values. Only the correlation id supplied by the caller is logged.
 */
export class UserMigrationService {
  /**
   * Ensures a `public.users` row exists for the given Supabase user.
   * All multi-table writes execute in one transaction.
   */
  async syncGoogleUser(
    sessionUser: GoogleSessionUser,
    correlationId: string,
  ): Promise<UserSyncStatus> {
    const userId = sessionUser.id;
    const email = sessionUser.email || '';
    const metadata = sessionUser.user_metadata || {};
    const profilePicture = metadata.avatar_url || metadata.picture || null;

    try {
      const existing = await db.query(
        'SELECT user_id FROM users WHERE user_id = $1',
        [userId],
      );
      if (existing?.rows?.length) {
        return 'noop';
      }

      const legacy = await db.query(
        'SELECT user_id, role FROM users WHERE email = $1',
        [email],
      );
      const legacyUserId = legacy?.rows?.[0]?.user_id;
      const legacyRole = legacy?.rows?.[0]?.role || 'Customer';

      if (legacyUserId && legacyUserId !== userId) {
        await this.migrateLegacyUser({
          legacyUserId,
          newUserId: userId,
          email,
          role: legacyRole,
          profilePicture,
          metadata,
        });
        logger.info('[UserMigration] Migrated legacy account', { correlationId });
        return 'migrated';
      }

      await this.createNewUser({
        userId,
        email,
        profilePicture,
        metadata,
      });
      logger.info('[UserMigration] Created public profile', { correlationId });
      return 'created';
    } catch (err: any) {
      if (err?.code === PG_UNIQUE_VIOLATION) {
        logger.info('[UserMigration] Concurrent sync detected', { correlationId });
        return 'noop';
      }
      logger.error('[UserMigration] Sync failed', {
        correlationId,
        code: err?.code,
      });
      throw err;
    }
  }

  /**
   * Fresh Google-user provisioning. New OAuth users are always Customers;
   * caller-controlled Auth metadata is never a role-provisioning source.
   */
  private async createNewUser(params: {
    userId: string;
    email: string;
    profilePicture: string | null;
    metadata: Record<string, any>;
  }): Promise<void> {
    const { userId, email, profilePicture, metadata } = params;

    await db.query(
      `INSERT INTO users (user_id, email, role, profile_picture, is_verified)
       VALUES ($1, $2, 'Customer', $3, TRUE)
       ON CONFLICT (user_id) DO UPDATE SET
         email = EXCLUDED.email,
         profile_picture = COALESCE(users.profile_picture, EXCLUDED.profile_picture)`,
      [userId, email, profilePicture],
    );

    const fullName = metadata.full_name || metadata.name || '';
    const { firstName, lastName } = parseNameString(fullName);

    await db.query(
      `INSERT INTO customers (user_id, first_name, last_name, email)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email`,
      [userId, truncate(firstName, 50), truncate(lastName, 50), email],
    );
  }

  /**
   * Migrates a legacy user whose email matches but whose user_id does
   * not, moving all dependent records to the new Supabase UUID. The
   * entire operation is wrapped in a single transaction and rolls back
   * on any failure so no cross-table inconsistency can survive.
   */
  private async migrateLegacyUser(params: {
    legacyUserId: string | number;
    newUserId: string;
    email: string;
    role: string;
    profilePicture: string | null;
    metadata: Record<string, any>;
  }): Promise<void> {
    const {
      legacyUserId,
      newUserId,
      email,
      role,
      profilePicture,
      metadata,
    } = params;

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      // Free the UNIQUE(email) constraint before inserting the new row.
      const parkedEmail = `${email}_migrated_${legacyUserId}`;
      await client.query(
        'UPDATE users SET email = $1 WHERE user_id = $2',
        [parkedEmail, legacyUserId],
      );

      await client.query(
        `INSERT INTO users (user_id, email, role, profile_picture, is_verified, created_at)
         VALUES ($1, $2, $3, $4, TRUE, NOW())`,
        [newUserId, email, role, profilePicture],
      );

      const customerUpdate = await client.query(
        'UPDATE customers SET user_id = $1 WHERE user_id = $2',
        [newUserId, legacyUserId],
      );
      await client.query(
        'UPDATE barbers SET user_id = $1 WHERE user_id = $2',
        [newUserId, legacyUserId],
      );
      await client.query(
        'UPDATE audit_logs SET user_id = $1 WHERE user_id = $2',
        [newUserId, legacyUserId],
      );
      await client.query(
        'UPDATE user_sessions SET user_id = $1 WHERE user_id = $2',
        [newUserId, legacyUserId],
      );

      if (role === 'Customer' && !customerUpdate.rowCount) {
        const fullName = metadata.full_name || metadata.name || '';
        const { firstName, lastName } = parseNameString(fullName);

        await client.query(
          `INSERT INTO customers (user_id, first_name, last_name, email)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email`,
          [newUserId, truncate(firstName, 50), truncate(lastName, 50), email],
        );
      }

      await client.query(
        'DELETE FROM users WHERE user_id = $1',
        [legacyUserId],
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

export const userMigrationService = new UserMigrationService();
export default userMigrationService;
