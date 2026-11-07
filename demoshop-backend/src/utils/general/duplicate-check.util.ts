import { userRepository } from '../../repositories/user.repository';
import { logSecurityEvent } from '../../services/audit.service';
import { AppError } from '../error/AppError';
import { Request } from 'express';
import db from '../../db';

export const ensureUniqueUser = async (email: string, req: Request): Promise<void> => {
  const cleanEmail = email.trim().toLowerCase();

  // PostgreSQL's unique email constraint is authoritative. This lookup keeps
  // the existing generic application response and cleans up stale unverified
  // registration rows before the new transaction creates the replacement.
  const existingUser = await userRepository.findByEmail(cleanEmail);
  if (existingUser) {
    if (existingUser.is_verified) {
      logSecurityEvent({
        userId: null,
        action: 'REGISTER_FAILED',
        resource: 'auth',
        details: { reason: 'User already exists (database)' },
        req,
      });
      throw new AppError("User already exists.", 409);
    } else {
      // Unverified user registered again: clean up old unverified user & customer records
      const client = await db.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM public.customers WHERE user_id = $1', [existingUser.user_id]);
        await client.query('DELETE FROM public.users WHERE user_id = $1', [existingUser.user_id]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }
  }
};
