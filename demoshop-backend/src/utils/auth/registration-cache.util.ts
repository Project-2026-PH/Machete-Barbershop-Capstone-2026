import crypto from 'crypto';
import { AppError } from '../error/AppError';
import { RegistrationData } from '@demoshop/shared-types';
import { authOtpRepository } from '../../repositories/auth-otp.repository';
import { hashAuthOtp, matchesAuthOtp } from './auth-state.util';

export interface PendingUser {
  email: string;
  firstName: string;
  lastName: string;
  code: number | string;
  userId: string;
}

export const createPendingUser = async (userData: RegistrationData, userId: string): Promise<number> => {
  const { email, firstName, lastName } = userData;
  const code = crypto.randomInt(100000, 1000000);
  await authOtpRepository.issue({
    purpose: 'registration',
    email,
    userId,
    codeHash: hashAuthOtp(code),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
  });

  return code;
};

export const validateAndRetrievePendingUser = async (email: string, code: string | number): Promise<PendingUser> => {
  const candidate = await authOtpRepository.claimForVerification('registration', email);
  if (!candidate) {
    throw new AppError(
      "Verification session expired or user not found. Please register again.",
      404
    );
  }

  if (!matchesAuthOtp(code, candidate.codeHash)) {
    if (candidate.attempts >= candidate.maxAttempts) {
      await authOtpRepository.consume(candidate.id);
    }
    throw new AppError("Invalid verification code.", 400);
  }

  const completed = await authOtpRepository.completeVerification({
    id: candidate.id,
    purpose: 'registration',
    consume: true,
  });
  if (!completed) throw new AppError("Invalid or expired verification code.", 400);

  return {
    email,
    firstName: '',
    lastName: '',
    code,
    userId: candidate.userId || '',
  };
};

export const clearPendingUser = async (email: string): Promise<void> => {
  // Kept as a compatibility export for callers outside the auth service. A
  // successful verification already consumes the PostgreSQL OTP atomically.
  void email;
};

export const rotatePendingUserCode = async (
  email: string,
  userId: string,
  firstName = 'Valued Customer',
): Promise<{ firstName: string; code: number } | null> => {
  const code = crypto.randomInt(100000, 1000000);
  try {
    await authOtpRepository.issue({
      purpose: 'registration',
      email,
      userId,
      codeHash: hashAuthOtp(code),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });
  } catch {
    return null;
  }
  return { firstName: firstName || 'Valued Customer', code };
};
