import db from '../db';
import {
  DatabaseGateway,
  normalizeAuthEmail,
  requireNonEmpty,
  requirePositiveSeconds,
} from './auth-repository.types';

export type AuthOtpPurpose = 'registration' | 'password_reset';

export interface IssueAuthOtpInput {
  purpose: AuthOtpPurpose;
  email: string;
  userId?: string | null;
  codeHash: Buffer;
  expiresAt: Date;
  maxAttempts?: number;
}

export interface ClaimedAuthOtp {
  id: string;
  userId: string | null;
  codeHash: Buffer;
  attempts: number;
  maxAttempts: number;
  expiresAt: Date;
}

export interface CompleteOtpVerificationInput {
  id: string;
  purpose: AuthOtpPurpose;
  consume: boolean;
  resetTokenHash?: Buffer;
  resetTokenExpiresAt?: Date;
}

export interface ConsumedResetToken {
  id: string;
  userId: string;
}

export interface AuthOtpRepositoryPort {
  issue(input: IssueAuthOtpInput): Promise<string>;
  claimForVerification(purpose: AuthOtpPurpose, email: string): Promise<ClaimedAuthOtp | null>;
  completeVerification(input: CompleteOtpVerificationInput): Promise<boolean>;
  consume(id: string): Promise<boolean>;
  consumeResetToken(resetTokenHash: Buffer, email: string): Promise<ConsumedResetToken | null>;
  deleteExpired(): Promise<number>;
}

type AuthOtpRow = {
  id: string;
  user_id: string | null;
  code_hash: Buffer;
  attempts: number | string;
  max_attempts: number | string;
  expires_at: Date;
};

type ResetTokenRow = {
  id: string;
  user_id: string;
};

const normalizePurpose = (purpose: AuthOtpPurpose): AuthOtpPurpose => {
  if (purpose !== 'registration' && purpose !== 'password_reset') {
    throw new Error('Unsupported auth OTP purpose.');
  }
  return purpose;
};

const normalizeMaxAttempts = (maxAttempts: number): number => {
  if (!Number.isInteger(maxAttempts) || maxAttempts <= 0) {
    throw new Error('maxAttempts must be a positive integer.');
  }
  return maxAttempts;
};

const normalizeHash = (hash: Buffer, name: string): Buffer => {
  if (!Buffer.isBuffer(hash) || hash.length === 0) throw new Error(`${name} must not be empty.`);
  return hash;
};

/** PostgreSQL implementation of registration and password-reset OTP state. */
export class AuthOtpRepository implements AuthOtpRepositoryPort {
  constructor(private readonly database: DatabaseGateway = db) {}

  async issue(input: IssueAuthOtpInput): Promise<string> {
    const purpose = normalizePurpose(input.purpose);
    const email = normalizeAuthEmail(input.email);
    requireNonEmpty(email, 'email');
    const codeHash = normalizeHash(input.codeHash, 'codeHash');
    const maxAttempts = normalizeMaxAttempts(input.maxAttempts ?? 5);
    const client = await this.database.connect();

    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE public.auth_otps
         SET consumed_at = NOW()
         WHERE purpose = $1
           AND email = $2
           AND consumed_at IS NULL`,
        [purpose, email],
      );

      const result = await client.query<{ id: string }>(
        `INSERT INTO public.auth_otps
          (purpose, email, user_id, code_hash, max_attempts, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [purpose, email, input.userId ?? null, codeHash, maxAttempts, input.expiresAt],
      );
      const id = result.rows[0]?.id;
      if (!id) throw new Error('Auth OTP creation returned no id.');
      await client.query('COMMIT');
      return id;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Preserve the original database error.
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async claimForVerification(purposeInput: AuthOtpPurpose, emailInput: string): Promise<ClaimedAuthOtp | null> {
    const purpose = normalizePurpose(purposeInput);
    const email = normalizeAuthEmail(emailInput);
    requireNonEmpty(email, 'email');
    const result = await this.database.query<AuthOtpRow>(
      `UPDATE public.auth_otps
       SET attempts = attempts + 1
       WHERE purpose = $1
         AND email = $2
         AND consumed_at IS NULL
         AND verified_at IS NULL
         AND expires_at > NOW()
         AND attempts < max_attempts
       RETURNING id, user_id, code_hash, attempts, max_attempts, expires_at`,
      [purpose, email],
    );

    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      codeHash: row.code_hash,
      attempts: Number(row.attempts),
      maxAttempts: Number(row.max_attempts),
      expiresAt: row.expires_at,
    };
  }

  async completeVerification(input: CompleteOtpVerificationInput): Promise<boolean> {
    const id = requireNonEmpty(input.id, 'id');
    const purpose = normalizePurpose(input.purpose);
    const hasResetHash = input.resetTokenHash !== undefined;
    if (hasResetHash) {
      normalizeHash(input.resetTokenHash as Buffer, 'resetTokenHash');
      if (!input.resetTokenExpiresAt) throw new Error('resetTokenExpiresAt is required with resetTokenHash.');
      if (purpose !== 'password_reset' || input.consume) {
        throw new Error('Only password-reset OTPs can issue an unconsumed reset token.');
      }
    } else if (input.resetTokenExpiresAt) {
      throw new Error('resetTokenHash is required with resetTokenExpiresAt.');
    } else if (purpose === 'password_reset') {
      throw new Error('Password-reset OTP verification requires a reset token.');
    } else if (!input.consume) {
      throw new Error('Registration OTP verification must consume the OTP.');
    }

    const result = await this.database.query(
      `UPDATE public.auth_otps
       SET verified_at = NOW(),
           reset_token_hash = $3,
           reset_token_expires_at = $4,
           consumed_at = CASE WHEN $5::BOOLEAN THEN NOW() ELSE consumed_at END
       WHERE id = $1
         AND purpose = $2
         AND consumed_at IS NULL
         AND verified_at IS NULL
         AND expires_at > NOW()
       RETURNING id`,
      [id, purpose, input.resetTokenHash ?? null, input.resetTokenExpiresAt ?? null, input.consume],
    );
    return (result.rowCount ?? result.rows.length) > 0;
  }

  async consume(idInput: string): Promise<boolean> {
    const id = requireNonEmpty(idInput, 'id');
    const result = await this.database.query(
      `UPDATE public.auth_otps
       SET consumed_at = NOW()
       WHERE id = $1
         AND consumed_at IS NULL
       RETURNING id`,
      [id],
    );
    return (result.rowCount ?? result.rows.length) > 0;
  }

  async consumeResetToken(resetTokenHash: Buffer, emailInput: string): Promise<ConsumedResetToken | null> {
    normalizeHash(resetTokenHash, 'resetTokenHash');
    const email = normalizeAuthEmail(emailInput);
    requireNonEmpty(email, 'email');
    const result = await this.database.query<ResetTokenRow>(
      `UPDATE public.auth_otps
       SET consumed_at = NOW()
       WHERE reset_token_hash = $1
         AND email = $2
         AND verified_at IS NOT NULL
         AND consumed_at IS NULL
         AND reset_token_expires_at > NOW()
       RETURNING id, user_id`,
      [resetTokenHash, email],
    );
    const row = result.rows[0];
    return row?.user_id ? { id: row.id, userId: row.user_id } : null;
  }

  async deleteExpired(): Promise<number> {
    // Use the same lifecycle rules as the database cleanup function. The
    // LIMIT keeps an opportunistic invocation bounded under large backlogs.
    const batchSize = requirePositiveSeconds(500, 'batchSize');
    const result = await this.database.query(
      `WITH expired AS (
         SELECT ctid
         FROM public.auth_otps
         WHERE consumed_at IS NOT NULL
            OR (verified_at IS NULL AND expires_at <= NOW())
            OR (reset_token_expires_at IS NOT NULL AND reset_token_expires_at <= NOW())
         LIMIT $1
       )
       DELETE FROM public.auth_otps otp
       USING expired
       WHERE otp.ctid = expired.ctid`,
      [batchSize],
    );
    return result.rowCount ?? 0;
  }
}

export const authOtpRepository = new AuthOtpRepository();
export default authOtpRepository;
