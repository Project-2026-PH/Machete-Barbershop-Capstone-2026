import { PoolClient, QueryResult } from 'pg';
import db from '../db';
import { User, UserRole } from '@demoshop/shared-types';
import logger from '../utils/general/logger';

let userSchemaReady = false;
let userSchemaSetup: Promise<void> | null = null;

export const ensureUserSchema = async (): Promise<void> => {
  if (userSchemaReady || process.env.NODE_ENV === 'test') return;
  if (!userSchemaSetup) {
    userSchemaSetup = (async () => {
      try {
        await db.query(`
          ALTER TABLE public.users
            ADD COLUMN IF NOT EXISTS can_access_inventory BOOLEAN NOT NULL DEFAULT FALSE;
        `);
        userSchemaReady = true;
      } catch (err) {
        logger.warn('[UserRepository] ensureUserSchema migration skipped or failed:', err);
      } finally {
        userSchemaSetup = null;
      }
    })();
  }
  await userSchemaSetup;
};

/**
 * Repository for User and Session related database operations.
 */
export class UserRepository {
  /**
   * Finds a user by their email address using the get_user_by_email function.
   */
  async findByEmail(email: string): Promise<Partial<User> | null> {
    const cleanEmail = email.trim().toLowerCase();
    try {
      const result: QueryResult = await db.query(
        `SELECT user_id, role, email, username, profile_picture, password_hash, is_verified 
         FROM public.users 
         WHERE LOWER(email) = $1 AND deleted_at IS NULL`,
        [cleanEmail]
      );
      if (result?.rows?.[0]) return result.rows[0];
    } catch {
      // fallback
    }

    const fallbackResult: QueryResult = await db.query(
      'SELECT user_id, role, email, username, profile_picture, password_hash, is_verified FROM public.get_user_by_email($1)',
      [cleanEmail]
    );
    return fallbackResult?.rows?.[0] || null;
  }

  /**
   * Finds a user profile by their ID.
   */
  async findById(userId: string | number): Promise<Partial<User> | null> {
    await ensureUserSchema().catch(() => {});
    const baseSelect = `
      FROM public.users u
      LEFT JOIN public.barbers b ON b.user_id = u.user_id
      LEFT JOIN public.customers c ON c.user_id = u.user_id
      WHERE u.user_id = $1 AND u.deleted_at IS NULL`;
    const barberProjection = `
      COALESCE(
        b.barber_id,
        (
          SELECT b2.barber_id
          FROM public.barbers b2
          WHERE LOWER(b2.name) = LOWER(u.username)
             OR LOWER(u.email) LIKE LOWER(CONCAT('%', b2.name, '%'))
          ORDER BY b2.barber_id ASC
          LIMIT 1
        ),
        CASE
          WHEN u.role = 'Barber' THEN (
            SELECT b3.barber_id
            FROM public.barbers b3
            WHERE b3.is_active = TRUE
            ORDER BY b3.barber_id ASC
            LIMIT 1
          )
          ELSE NULL
        END
      ) AS barber_id`;

    try {
      const result: QueryResult = await db.query(
        `SELECT u.user_id, u.email, u.role, u.branch_id, u.username, u.profile_picture,
                u.is_verified, COALESCE(u.can_access_inventory, FALSE) AS can_access_inventory,
                u.email_notifications_enabled, c.first_name, c.last_name, ${barberProjection}
         ${baseSelect}`,
        [userId],
      );
      return result?.rows?.[0] || null;
    } catch (error: any) {
      // Allow authenticated sessions to survive a deployment where the
      // optional columns migration has not run yet.
      if (error?.code !== '42703') throw error;
      const result: QueryResult = await db.query(
        `SELECT u.user_id, u.email, u.role, u.branch_id, u.username, u.profile_picture,
                u.is_verified, FALSE AS can_access_inventory, TRUE AS email_notifications_enabled, c.first_name, c.last_name, ${barberProjection}
         ${baseSelect}`,
        [userId],
      );
      return result?.rows?.[0] || null;
    }
  }

  /**
   * Updates a user's email notifications preference.
   */
  async updateEmailNotificationsPreference(userId: string | number, enabled: boolean): Promise<boolean> {
    const result = await db.query(
      'UPDATE public.users SET email_notifications_enabled = $1 WHERE user_id = $2 RETURNING user_id',
      [Boolean(enabled), userId]
    );
    return (result?.rowCount ?? 0) > 0;
  }

  /**
   * Finds a user with credentials (including password_hash) for authentication/verification.
   */
  async findCredentialsById(userId: string | number): Promise<Partial<User> | null> {
    const result: QueryResult = await db.query(
      `SELECT u.user_id, u.email, u.role, u.password_hash, u.is_verified
       FROM public.users u
       WHERE u.user_id = $1 AND u.deleted_at IS NULL`,
      [userId]
    );
    return result?.rows?.[0] || null;
  }



  /**
   * Creates a new user and a corresponding customer record in a transaction.
   */
  async createWithCustomer({
    email,
    passwordHash,
    firstName,
    lastName,
    isVerified = true,
  }: {
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    isVerified?: boolean;
  }): Promise<Partial<User>> {
    const client: PoolClient = await db.pool.connect();
    try {
      await client.query('BEGIN');

      const newUser = await client.query(
        `INSERT INTO users (email, password_hash, role, is_verified) 
         VALUES ($1, $2, 'Customer', $3) RETURNING user_id, role, email`,
        [email, passwordHash, isVerified]
      );
      const userId = newUser.rows[0].user_id;

      await client.query(
        "INSERT INTO customers (user_id, first_name, last_name, email) VALUES ($1, $2, $3, $4)",
        [userId, firstName, lastName, email]
      );

      await client.query('COMMIT');
      return newUser.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Sets a user's is_verified status to true.
   */
  async verifyUser(userId: string): Promise<void> {
    await db.query(
      'UPDATE users SET is_verified = TRUE WHERE user_id = $1',
      [userId]
    );
  }

  /**
   * Creates a new user session in the database.
   */
  async createSession({
    sessionId,
    userId,
    tokenHash,
    expirationDate,
    deviceInfo,
    ipAddress,
    rememberMe,
  }: {
    sessionId: string;
    userId: string;
    tokenHash: string;
    expirationDate: Date;
    deviceInfo: string;
    ipAddress: string;
    rememberMe: boolean;
  }): Promise<void> {
    await db.query(
      `INSERT INTO user_sessions (session_id, user_id, token_hash, expires_at, device_info, ip_address, remember_me) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [sessionId, userId, tokenHash, expirationDate, deviceInfo, ipAddress, !!rememberMe]
    );
  }

  /**
   * Finds a session by ID and user ID, joining with user info.
   */
  async findSessionWithUser(
    sessionId: string,
    userId: string
  ): Promise<{
    session: { is_valid: boolean; expires_at: string; remember_me: boolean; token_hash: string };
    user: Partial<User>;
  } | null> {
    const result: QueryResult = await db.query(
      `SELECT 
          us.is_valid, us.expires_at, us.remember_me, us.token_hash,
          u.user_id, u.role, u.email, u.username, u.profile_picture, u.deleted_at
       FROM user_sessions us
       INNER JOIN users u ON us.user_id = u.user_id
       WHERE us.session_id = $1 AND us.user_id = $2 AND u.deleted_at IS NULL`,
      [sessionId, userId]
    );

    const row = result.rows[0];
    if (!row) return null;

    return {
      session: {
        is_valid: row.is_valid,
        expires_at: row.expires_at,
        remember_me: row.remember_me,
        token_hash: row.token_hash,
      },
      user: {
        user_id: row.user_id,
        role: row.role as UserRole,
        email: row.email,
        username: row.username,
        profile_picture: row.profile_picture,
        deleted_at: row.deleted_at,
      },
    };
  }

  /**
   * Invalidates a session by setting is_valid to false.
   */
  async invalidateSession(sessionId: string): Promise<void> {
    await db.query('UPDATE user_sessions SET is_valid = FALSE WHERE session_id = $1', [sessionId]);
  }

  /**
   * Updates the last_active timestamp for a session.
   */
  async updateSessionActivity(sessionId: string): Promise<void> {
    try {
      await db.query("UPDATE user_sessions SET last_active = NOW() WHERE session_id = $1", [sessionId]);
    } catch (error) {
      logger.error(`[UserRepository] Failed to update session activity for ${sessionId}:`, error);
    }
  }

  /**
   * Finds a session joining with user info, supporting both numeric IDs and UUIDs (Supabase/Google).
   */
  async findSessionWithUserPolymorphic(
    userId: string | number,
    sessionId: string,
    email?: string
  ): Promise<(Partial<User> & { is_valid: boolean }) | null> {
    const userIdStr = String(userId);
    const isUuid = userIdStr.includes('-');

    let query: string;
    let params: any[];

    if (isUuid) {
      // Supabase/OAuth Flow: Link by Google ID or Email
      query = `
        SELECT u.*, u.user_id AS id, us.is_valid 
        FROM users u
        INNER JOIN user_sessions us ON u.user_id = us.user_id
        WHERE (u.google_id = $1 OR u.email = $2) AND us.session_id = $3
      `;
      params = [userIdStr, email || '', sessionId];
    } else {
      // Local/Legacy Flow: Numeric user_id
      query = `
        SELECT u.*, u.user_id AS id, us.is_valid 
        FROM users u
        INNER JOIN user_sessions us ON u.user_id = us.user_id
        WHERE u.user_id = $1 AND us.session_id = $2
      `;
      params = [userId, sessionId];
    }

    const result = await db.query(query, params);
    return result.rows[0] || null;
  }

  /**
   * Updates a user's profile picture filename/url.
   */
  async updateProfilePicture(userId: string | number, profilePicture: string): Promise<Partial<User> | null> {
    const result = await db.query(
      'UPDATE public.users SET profile_picture = $1 WHERE user_id = $2 RETURNING user_id, email, profile_picture',
      [profilePicture, userId]
    );
    return result?.rows?.[0] || null;
  }

  /**
   * Finds a user by their Google ID.
   */

  async findByGoogleId(googleId: string): Promise<(Partial<User> & { id: number | string }) | null> {
    const result = await db.query("SELECT *, user_id AS id FROM users WHERE google_id = $1", [googleId]);
    return result.rows[0] || null;
  }

  /**
   * Updates a user's google_id for account linking.
   */
  async updateGoogleId(email: string, googleId: string): Promise<(Partial<User> & { id: number | string }) | null> {
    const result = await db.query(
      "UPDATE users SET google_id = $1 WHERE email = $2 RETURNING *, user_id AS id",
      [googleId, email]
    );
    return result.rows[0] || null;
  }

  /**
   * Creates a new Google-linked user and customer profile in a transaction.
   */
  async createGoogleUser({
    email,
    googleId,
    firstName,
    lastName,
  }: {
    email: string;
    googleId: string;
    firstName: string;
    lastName: string;
  }): Promise<Partial<User> & { id: number | string }> {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      const newUserRes = await client.query(
        "INSERT INTO users (email, google_id, role, is_verified) VALUES ($1, $2, 'Customer', TRUE) RETURNING user_id AS id, email, role",
        [email, googleId]
      );
      const newUserId = newUserRes.rows[0].id;

      await client.query(
        "INSERT INTO customers (user_id, first_name, last_name, email) VALUES ($1, $2, $3, $4)",
        [newUserId, firstName, lastName, email]
      );

      await client.query('COMMIT');
      return newUserRes.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Rotates a session by invalidating the old one and creating a new one in a transaction.
   */
  async rotateSession(
    oldSessionId: string,
    {
      oldTokenHash,
      sessionId,
      userId,
      tokenHash,
      expirationDate,
      deviceInfo,
      ipAddress,
      rememberMe,
    }: {
      oldTokenHash: string;
      sessionId: string;
      userId: string;
      tokenHash: string;
      expirationDate: Date;
      deviceInfo: string;
      ipAddress: string;
      rememberMe: boolean;
    }
  ): Promise<boolean> {
    const client: PoolClient = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const invalidated = await client.query(
        `UPDATE user_sessions us
         SET is_valid = FALSE
         FROM users u
         WHERE us.session_id = $1
           AND us.user_id = $2
           AND us.token_hash = $3
           AND us.is_valid = TRUE
           AND us.expires_at > NOW()
           AND u.user_id = us.user_id
           AND u.deleted_at IS NULL
         RETURNING us.session_id`,
        [oldSessionId, userId, oldTokenHash]
      );

      // The conditional update is the single-use gate. A concurrent refresh
      // waits for the first transaction, then observes the old row as invalid.
      if (!invalidated.rowCount) {
        await client.query('ROLLBACK');
        return false;
      }

      await client.query(
        `INSERT INTO user_sessions (session_id, user_id, token_hash, expires_at, device_info, ip_address, remember_me) 
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [sessionId, userId, tokenHash, expirationDate, deviceInfo, ipAddress, !!rememberMe]
      );
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Updates a user's password hash in the database.
   */
    async updatePasswordByUserId(userId: string, passwordHash: string): Promise<void> {
    if (!userId || !passwordHash) {
      throw new Error('User ID and password hash are required');
    }

    const result = await db.query(
      'UPDATE users SET password_hash = $1 WHERE user_id = $2', 
      [passwordHash, userId]
    );

    if (result.rowCount === 0) {
      throw new Error(`User not found with id: ${userId}`);
    }

    logger.info(`Password updated for user ${userId}`);
  }

  /**
   * Invalidates all sessions of a user.
   */
  async invalidateAllSessionsForUser(userId: string): Promise<number> {  // return count
    if (!userId) throw new Error('User ID is required');

    const result = await db.query(
      'UPDATE user_sessions SET is_valid = FALSE WHERE user_id = $1', 
      [userId]
    );
    const rowCount = result.rowCount ?? 0

    logger.info(`Invalidated ${rowCount} sessions for user ${userId}`);
    return rowCount;
  }

  /**
   * Invalidates active unexpired password change OTPs for a user.
   */
  async invalidateActivePasswordChangeOtps(userId: string): Promise<void> {
    await db.query(
      `UPDATE public.password_change_otps 
       SET is_used = TRUE 
       WHERE user_id = $1 AND is_used = FALSE`,
      [userId]
    );
  }

  /**
   * Creates a new password change OTP entry.
   */
  async createPasswordChangeOtp(data: {
    userId: string;
    email: string;
    codeHash: string;
    expiresAt: Date;
  }): Promise<void> {
    await db.query(
      `INSERT INTO public.password_change_otps (user_id, email, code_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [data.userId, data.email, data.codeHash, data.expiresAt]
    );
  }

  /**
   * Finds the latest active, unexpired password change OTP for a user.
   */
  async findActivePasswordChangeOtp(userId: string): Promise<PasswordChangeOtp | null> {
    const result = await db.query(
      `SELECT * FROM public.password_change_otps 
       WHERE user_id = $1 AND is_used = FALSE AND expires_at > NOW() 
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    return result.rows[0] || null;
  }

  /**
   * Marks a password change OTP as used by its ID.
   */
  async markPasswordChangeOtpUsed(otpId: string): Promise<void> {
    await db.query(`UPDATE public.password_change_otps SET is_used = TRUE WHERE id = $1`, [otpId]);
  }

  /**
   * Increments failed attempt count for a password change OTP.
   */
  async incrementPasswordChangeOtpAttempts(otpId: string): Promise<void> {
    await db.query(
      `UPDATE public.password_change_otps SET attempts = attempts + 1 WHERE id = $1`,
      [otpId]
    );
  }

  /**
   * Invalidates active unexpired email change OTPs for a user.
   */
  async invalidateActiveEmailChangeOtps(userId: string): Promise<void> {
    await db.query(
      `UPDATE public.email_change_otps 
       SET is_used = TRUE 
       WHERE user_id = $1 AND is_used = FALSE`,
      [userId]
    );
  }

  /**
   * Creates a new email change OTP entry.
   */
  async createEmailChangeOtp(data: {
    userId: string;
    newEmail: string;
    codeHash: string;
    expiresAt: Date;
  }): Promise<void> {
    await db.query(
      `INSERT INTO public.email_change_otps (user_id, new_email, code_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [data.userId, data.newEmail, data.codeHash, data.expiresAt]
    );
  }

  /**
   * Finds the latest active, unexpired email change OTP for a user and target new email.
   */
  async findActiveEmailChangeOtp(userId: string, newEmail: string): Promise<EmailChangeOtp | null> {
    const result = await db.query(
      `SELECT * FROM public.email_change_otps 
       WHERE user_id = $1 AND LOWER(new_email) = LOWER($2) AND is_used = FALSE AND expires_at > NOW() 
       ORDER BY created_at DESC LIMIT 1`,
      [userId, newEmail]
    );
    return result.rows[0] || null;
  }

  /**
   * Marks an email change OTP as used by its ID.
   */
  async markEmailChangeOtpUsed(otpId: string): Promise<void> {
    await db.query(`UPDATE public.email_change_otps SET is_used = TRUE WHERE id = $1`, [otpId]);
  }

  /**
   * Increments failed attempt count for an email change OTP.
   */
  async incrementEmailChangeOtpAttempts(otpId: string): Promise<void> {
    await db.query(
      `UPDATE public.email_change_otps SET attempts = attempts + 1 WHERE id = $1`,
      [otpId]
    );
  }

  /**
   * Updates a user's display name / username across public.users and public.barbers.
   */
  async updateProfile(userId: string | number, name: string): Promise<Partial<User>> {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const userRes = await client.query(
        `UPDATE public.users
         SET username = $1
         WHERE user_id = $2
         RETURNING user_id, email, role, branch_id, username, profile_picture, is_verified`,
        [name, userId]
      );
      if (userRes.rowCount === 0) {
        throw new Error('User not found.');
      }
      const role = userRes.rows[0].role;
      if (role === 'Barber') {
        await client.query(
          `INSERT INTO public.barbers (user_id, name, is_active, status)
           VALUES ($1, $2, TRUE, 'available')
           ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name`,
          [userId, name]
        );
      }
      await client.query('COMMIT');
      return userRes.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

export interface PasswordChangeOtp {
  id: string;
  user_id: string;
  email: string;
  code_hash: string;
  attempts: number;
  max_attempts: number;
  is_used: boolean;
  expires_at: Date | string;
  created_at: Date | string;
}

export interface EmailChangeOtp {
  id: string;
  user_id: string;
  new_email: string;
  code_hash: string;
  attempts: number;
  max_attempts: number;
  is_used: boolean;
  expires_at: Date | string;
  created_at: Date | string;
}

export const userRepository = new UserRepository();
