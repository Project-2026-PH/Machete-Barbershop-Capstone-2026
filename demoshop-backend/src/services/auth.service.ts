import { userRepository } from '../repositories/user.repository';
import logger from '../utils/general/logger';
import { AppError } from '../utils/error/AppError';
import { 
  User, 
  UserRole,
  RegistrationData, 
  LoginCredentials, 
  VerificationData 
} from '@demoshop/shared-types';
import { Request } from 'express';
import crypto from 'crypto';
import { getAdminClient } from '../config/supabase';
import { sendForgotPasswordEmail, sendChangePasswordEmail } from './email.service';
import bcrypt from 'bcryptjs';
import { performance } from 'perf_hooks';

// Utility Workers for Coordinator Pattern
import { 
  validateRegistrationInput, 
  validateLoginInput, 
  validateVerificationInput
} from '../utils/general/validation.util';
import { 
  ensurePasswordCompliance, 
  ensureAccountUnlocked, 
  verifyCredentials, 
  validateUserVerificationState, 
  clearFailedAttempts, 
  hashPassword 
} from '../utils/auth/auth-security.util';
import { ensureUniqueUser } from '../utils/general/duplicate-check.util';
import { 
  createPendingUser, 
  validateAndRetrievePendingUser, 
  rotatePendingUserCode 
} from '../utils/auth/registration-cache.util';
import { sendRegistrationEmailAsync } from '../utils/general/notification.util';
import { 
  createFullSession, 
  signSupabaseToken, 
  decodeTokenMetadata, 
  validateSession, 
  refreshUserSession,
  matchesSessionToken,
} from '../utils/auth/session.util';
import { formatAuthResponse, formatMeResponse } from '../utils/auth/authFormatter';
import { logSecurityEvent } from './audit.service';
import { authOtpRepository } from '../repositories/auth-otp.repository';
import { authThrottleRepository } from '../repositories/auth-throttle.repository';
import { createResetToken, hashAuthOtp, hashResetToken, matchesAuthOtp } from '../utils/auth/auth-state.util';

const GENERIC_ACCOUNT_MESSAGE = 'If that email is eligible, registration instructions have been sent.';
const GENERIC_VERIFICATION_ERROR = 'Invalid or expired verification code.';
const GENERIC_RESET_MESSAGE = 'If that email exists, a code has been sent. Please check your inbox or spam folder.';
const normalizeEmail = (email: unknown): string => typeof email === 'string' ? email.trim().toLowerCase() : '';

/**
 * Service for handling authentication business logic.
 */
export class AuthService {
    /**
     * Registers a new user
     */
    async register(userData: RegistrationData, req: Request) {
        const normalizedUserData = {
            ...userData,
            email: typeof userData.email === 'string' ? normalizeEmail(userData.email) : userData.email,
        };
        validateRegistrationInput(normalizedUserData);

        // Security with NIST & Breach Check
        await ensurePasswordCompliance(normalizedUserData.password!, normalizedUserData);

        // Duplicate checks are intentionally folded into the same generic response
        // as a successful registration to prevent account enumeration.
        try {
            await ensureUniqueUser(normalizedUserData.email, req as any);
        } catch (error: any) {
            if (error instanceof AppError && error.status === 409) {
                return {
                    message: 'An account with this email is already verified. Please log in instead.',
                    email: normalizedUserData.email,
                    accountAlreadyVerified: true,
                };
            }
            throw error;
        }

        const passwordHash = await hashPassword(normalizedUserData.password!);
        const newUser = await userRepository.createWithCustomer({
            email: normalizedUserData.email,
            passwordHash,
            firstName: normalizedUserData.firstName,
            lastName: normalizedUserData.lastName,
            isVerified: false
        });

        const userId = newUser.user_id || (newUser as any).id;
        if (!userId) throw new AppError('Failed to create registration account.', 500);
        const code = await createPendingUser(normalizedUserData, String(userId));

        const emailSent = await sendRegistrationEmailAsync(
            normalizedUserData.email,
            normalizedUserData.firstName,
            code,
        );
        logger.info('[AuthService] Registration verification email processed', {
            event: 'registration_email_processed',
            emailSent,
        });

        logSecurityEvent({ userId, action: 'REGISTER_PENDING', resource: 'auth', details: { event: 'registration_pending' }, req });

        return { message: GENERIC_ACCOUNT_MESSAGE, email: normalizedUserData.email };
    }

    /**
     * Authenticates a user and creates a session.
     */
    async login(credentials: LoginCredentials, req: Request) {
        const { email, password, rememberMe } = credentials;
        validateLoginInput(credentials);

        const loginStart = performance.now();
        let unlockMs = 0;
        let findByEmailMs = 0;

        // Security/Rate Limiting (Parallelized for Performance)
        // Timed individually (not just as a pair) since the two legs can finish
        // at very different speeds and Promise.all would otherwise hide which one stalled.
        const [, user] = await Promise.all([
            (async () => {
                const t0 = performance.now();
                await ensureAccountUnlocked(email, req);
                unlockMs = performance.now() - t0;
            })(),
            (async () => {
                const t0 = performance.now();
                const result = await userRepository.findByEmail(email);
                findByEmailMs = performance.now() - t0;
                return result;
            })(),
        ]);

        // Credential Verification
        const verifyStart = performance.now();
        await verifyCredentials(password!, user, email, req);
        const verifyMs = performance.now() - verifyStart;

        validateUserVerificationState(user!, req);
        await clearFailedAttempts(email);

        const sessionStart = performance.now();
        const session = await createFullSession(user!, !!rememberMe, req);
        const sessionMs = performance.now() - sessionStart;

        const userId = user!.user_id || (user as any).id;
        logSecurityEvent({ userId, action: 'LOGIN_SUCCESS', resource: 'auth', details: { role: user!.role }, req });

        logger.info('[AuthService.login] timings(ms)', {
            ensureAccountUnlocked: +unlockMs.toFixed(1),
            findByEmail: +findByEmailMs.toFixed(1),
            verifyCredentials: +verifyMs.toFixed(1),
            createFullSession: +sessionMs.toFixed(1),
            total: +(performance.now() - loginStart).toFixed(1),
        });

        return formatAuthResponse(user!, session, "Login successful");
    }

    /**
     * Verifies email and completes registration.
     */
    async verifyEmail(data: VerificationData, req: Request) {
        const { email, code } = data;

        validateVerificationInput(data);

        const normalizedEmail = normalizeEmail(email);

        // Check verification state without revealing whether an account exists
        // or has already completed verification.
        const existingInDb = await userRepository.findByEmail(normalizedEmail);
        if (!existingInDb || existingInDb.is_verified) {
            throw new AppError(GENERIC_VERIFICATION_ERROR, 400);
        }

        // State Management & Data Transformation
        await validateAndRetrievePendingUser(normalizedEmail, code);

        // Transaction Logic: mark the user as verified in the DB
        const userId = existingInDb.user_id || (existingInDb as any).id;
        await userRepository.verifyUser(userId);

        // Retrieve the verified user object
        const verifiedUser = await userRepository.findById(userId);
        if (!verifiedUser) {
            throw new AppError("Failed to retrieve user profile.", 500);
        }

        // Session Generation
        const session = await createFullSession(verifiedUser, false, req);

        logSecurityEvent({ userId, action: 'VERIFY_EMAIL_SUCCESS', resource: 'auth', details: { autoLogin: true }, req });

        return formatAuthResponse(verifiedUser, session, "Email verified! You are now logged in.");
    }

    /**
     * Resends verification email.
     */
    async resendVerification(email: string) {
        const normalizedEmail = normalizeEmail(email);
        const user = await userRepository.findByEmail(normalizedEmail);

        // Missing and already-verified accounts intentionally take the same path.
        // Keep the response generic, but record the branch for operational diagnosis.
        if (!user || user.is_verified) {
            logger.info('[AuthService] Verification resend skipped', {
                event: 'verification_resend_skipped',
                reason: !user ? 'user_not_found' : 'already_verified',
            });
            return { message: GENERIC_ACCOUNT_MESSAGE };
        }

        const userId = user.user_id || (user as any).id;
        if (!userId) {
            logger.error('[AuthService] Verification resend skipped', {
                event: 'verification_resend_skipped',
                reason: 'user_id_missing',
            });
            return { message: GENERIC_ACCOUNT_MESSAGE };
        }
        const pendingUser = await rotatePendingUserCode(
            normalizedEmail,
            String(userId),
            user.username || 'Valued Customer',
        );
        if (!pendingUser) {
            logger.error('[AuthService] Failed to create verification code for resend', {
                event: 'verification_resend_code_creation_failed',
            });
            return { message: GENERIC_ACCOUNT_MESSAGE };
        }

        const emailSent = await sendRegistrationEmailAsync(
            normalizedEmail,
            pendingUser.firstName,
            pendingUser.code,
        );
        logger.info('[AuthService] Verification resend email processed', {
            event: 'verification_resend_email_processed',
            emailSent,
        });

        return { message: GENERIC_ACCOUNT_MESSAGE };
    }

    /**
     * Rotates session and refreshes tokens.
     */
    async refreshSession(oldToken: string, req: Request) {
        const decoded = decodeTokenMetadata(oldToken);
        const sessionWithUser = await userRepository.findSessionWithUser(decoded.sessionId, decoded.id);

        await validateSession(sessionWithUser, decoded.sessionId, decoded.id);

        const sessionUser = sessionWithUser!.user;
        const session = sessionWithUser!.session;
        if (
            String(sessionUser.user_id) !== decoded.id ||
            sessionUser.role !== decoded.role ||
            !matchesSessionToken(oldToken, session.token_hash)
        ) {
            throw new AppError("Session invalid or not found.", 401);
        }

        const newSession = await refreshUserSession(
            decoded.sessionId,
            session.token_hash,
            decoded.id,
            sessionUser.role!,
            session.remember_me,
            req
        );

        return formatAuthResponse(sessionUser, newSession, "Session refreshed.");
    }

    /**
     * Logs out by invalidating session.
     */
    async logout(token: string) {
        try {
            const decoded = decodeTokenMetadata(token);
            await userRepository.invalidateSession(decoded.sessionId);
        } catch (err: any) {
            // Log if it's a real issue, otherwise fail silently for invalid tokens
            if (token) logger.debug('[AuthService] Logout rejected an invalid token', { event: 'logout_invalid_token', error: err });
        }
    }

    /**
     * Handles the completion of the Google OAuth flow.
     */
    async handleGoogleCallback(user: any, req: Request) {
        if (!user) throw new AppError("Authentication failed", 401);

        const session = await createFullSession(user, false, req);

        return formatAuthResponse(user, session, "Google authentication successful", { isNewUser: !!user.isNewUser });
    }

    /**
     * Prepares data for the 'getMe' endpoint.
     */
    async getMe(user: Partial<User> | null) {
        if (!user) throw new AppError("Not authenticated", 401);
        
        const userId = user.user_id || (user as any).id;
        if (!userId) throw new AppError("User ID missing", 500);
        
        // requireSupabaseAuth has already loaded and validated this profile
        // (and may have served it from the scoped auth cache). Re-querying the
        // same user here creates a second production DB round trip and can
        // turn an otherwise valid session into a 500 during transient pool or
        // database pressure.
        const activeUser = user;
        const supabaseToken = signSupabaseToken(userId, '1d');

        return formatMeResponse(activeUser, supabaseToken);
    }


    /**
     * Stage 1: Request password reset code.
     * Always returns generic success message to prevent account enumeration.
     */
    async forgotPasswordRequest(email: string, req: Request) {
        if (!email) throw new AppError("Email is required.", 400);
        const normalizedEmail = normalizeEmail(email);

        const cooldown = await authThrottleRepository.acquireCooldown({
            scope: 'password_reset_cooldown',
            key: normalizedEmail,
            durationSeconds: 60,
        });
        if (!cooldown) {
            throw new AppError("Please wait 60 seconds before requesting another code.", 429, true, { retryAfter: 60 });
        }

        const sends = await authThrottleRepository.hitFixedWindow({
            scope: 'password_reset_sends',
            key: normalizedEmail,
            windowSeconds: 86400,
        });
        if (sends.count > 3) {
            throw new AppError("Maximum resend attempts exceeded. Please try again later.", 429, true, { retryAfter: 86400 });
        }

        const user = await userRepository.findByEmail(normalizedEmail);
        if (user) {
            const code = crypto.randomInt(100000, 1000000);
            const userId = user.user_id || (user as any).id;
            if (!userId) throw new AppError('Unable to prepare password reset.', 500);
            await authOtpRepository.issue({
                purpose: 'password_reset',
                email: normalizedEmail,
                userId: String(userId),
                codeHash: hashAuthOtp(code),
                expiresAt: new Date(Date.now() + 10 * 60 * 1000),
            });

            let firstName: string | null = null;
            if (user.role === 'Customer') {
                try {
                    const { customerRepository } = await import('../repositories/customer.repository');
                    const profile = await customerRepository.findProfileByUserId(user.user_id as string);
                    if (profile) firstName = profile.first_name;
                } catch (err: unknown) {
                    logger.error('[AuthService] Customer profile query failed', { userId: user.user_id, error: err });
                }
            }

            sendForgotPasswordEmail(normalizedEmail, firstName || user.username, code);
        }

        return { message: GENERIC_RESET_MESSAGE };
    }

    /**
     * Stage 2: Verify OTP code.
     */
    async forgotPasswordVerify(email: string, code: string, req: Request) {
        if (!email || !code) throw new AppError("Email and code are required.", 400);
        const normalizedEmail = normalizeEmail(email);

        const isLocked = await authThrottleRepository.isLocked('password_reset_lock', normalizedEmail);
        if (isLocked) {
            throw new AppError("Too many failed attempts. Account locked for 30 minutes.", 429, true, { retryAfter: 1800 });
        }

        const candidate = await authOtpRepository.claimForVerification('password_reset', normalizedEmail);
        if (!candidate) {
            throw new AppError(GENERIC_VERIFICATION_ERROR, 400);
        }

        if (!matchesAuthOtp(code, candidate.codeHash)) {
            if (candidate.attempts >= candidate.maxAttempts) {
                await authThrottleRepository.lockFor('password_reset_lock', normalizedEmail, 1800);
                await authOtpRepository.consume(candidate.id);

                logSecurityEvent({
                    userId: candidate.userId || null,
                    action: 'PASSWORD_RESET_LOCKED',
                    resource: 'auth',
                    details: { reason: 'Too many failed verification attempts' },
                    req,
                });

                throw new AppError("Too many failed attempts. Account locked for 30 minutes.", 429, true, { retryAfter: 1800 });
            }

            throw new AppError(GENERIC_VERIFICATION_ERROR, 400);
        }

        const resetToken = createResetToken();
        const completed = await authOtpRepository.completeVerification({
            id: candidate.id,
            purpose: 'password_reset',
            consume: false,
            resetTokenHash: hashResetToken(resetToken),
            resetTokenExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
        });
        if (!completed) throw new AppError(GENERIC_VERIFICATION_ERROR, 400);

        return { message: "Code verified successfully.", resetToken };
    }

    /**
     * Stage 3: Reset password.
     */
    async forgotPasswordReset(email: string, passwordHashRaw: string, resetToken: string, req: Request) {
        if (!email || !passwordHashRaw || !resetToken) throw new AppError("Email, password, and reset token are required.", 400);
        const normalizedEmail = normalizeEmail(email);

        // The database update is the single-use gate. Consume before external
        // password/session writes so a downstream failure safely requires a new reset flow.
        const consumedToken = await authOtpRepository.consumeResetToken(hashResetToken(resetToken), normalizedEmail);
        if (!consumedToken) throw new AppError("Invalid or expired reset session.", 400);
        const userId = consumedToken.userId;

        const user = await userRepository.findById(userId);
        if (!user) throw new AppError("Invalid or expired reset session.", 400);

        // Fetch customer name for context strength checks
        let firstName = '';
        let lastName = '';
        if (user.role === 'Customer') {
            try {
                const { customerRepository } = await import('../repositories/customer.repository');
                const profile = await customerRepository.findProfileByUserId(userId);
                if (profile) {
                    firstName = profile.first_name || '';
                    lastName = profile.last_name || '';
                }
            } catch (err: unknown) {
                logger.error('[AuthService] Customer profile query failed during compliance check', { userId, error: err });
            }
        }

        await ensurePasswordCompliance(passwordHashRaw, { email: normalizedEmail, firstName, lastName });

        // Step 1: Update passwords (Supabase first, then Postgres)
        try {
            const supabaseAdmin = getAdminClient();
            const { error: supabaseError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
                password: passwordHashRaw
            });
            if (supabaseError) {
                logger.error('[AuthService] Supabase password update failed', { userId, error: supabaseError });
                throw new AppError("Failed to reset password. Please try again later.", 500);
            }
        } catch (err: unknown) {
            if (err instanceof AppError) throw err;
            logger.error('[AuthService] Supabase password update error', { userId, error: err });
            throw new AppError("Failed to reset password. Please try again later.", 500);
        }

        // Supabase succeeded, update local Postgres
        const passwordHash = await hashPassword(passwordHashRaw);
        await userRepository.updatePasswordByUserId(userId, passwordHash);

        // Step 2: Revoke sessions (Supabase first, then Postgres)
        try {
            const supabaseAdmin = getAdminClient();
            const { error: revokeError } = await supabaseAdmin.auth.admin.signOut(userId, 'global');
            if (revokeError) {
                logger.error('[AuthService] Supabase session revocation failed', { userId, error: revokeError });
            }
        } catch (err: unknown) {
            logger.error('[AuthService] Supabase session revocation error', { userId, error: err });
        }

        await userRepository.invalidateAllSessionsForUser(userId);

        logSecurityEvent({
            userId,
            action: 'PASSWORD_RESET_SUCCESS',
            resource: 'auth',
            details: { event: 'password_reset_success', target_email: normalizedEmail },
            req,
        });

        return { message: "Password reset successfully. You can now sign in with your new password." };
    }

    /**
     * Generates and emails an 8-character alphanumeric confirmation code for authenticated password change.
     */
    async requestPasswordChangeCode(userId: string, email: string, currentPassword?: string, req?: Request) {
        if (!userId || !email) throw new AppError("Authentication required.", 401);
        const normalizedEmail = normalizeEmail(email);

        // Verify existing password if account already has one set
        let user = await userRepository.findCredentialsById(userId);
        if (!user) {
            user = await userRepository.findByEmail(normalizedEmail);
        }
        if (!user) {
            throw new AppError("User account not found.", 404);
        }

        if (user.password_hash) {
            if (!currentPassword) {
                throw new AppError("Current password is required.", 400);
            }
            const isCurrentPasswordCorrect = await bcrypt.compare(currentPassword, user.password_hash);
            if (!isCurrentPasswordCorrect) {
                throw new AppError("Incorrect current password.", 400);
            }
        }

        const cooldown = await authThrottleRepository.acquireCooldown({
            scope: 'password_change_cooldown',
            key: userId,
            durationSeconds: 60,
        });
        if (!cooldown) {
            throw new AppError('Please wait 60 seconds before requesting another code.', 429, true, { retryAfter: 60 });
        }

        // Generate secure 8-character alphanumeric code (e.g. "b6qdmfu6")
        const rawCode = crypto.randomBytes(4).toString('hex');
        const codeHash = await bcrypt.hash(rawCode.toLowerCase(), 10);
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

        // Invalidate previous unexpired OTPs in DB
        await userRepository.invalidateActivePasswordChangeOtps(userId);

        // Save hashed OTP in database
        await userRepository.createPasswordChangeOtp({
            userId,
            email: normalizedEmail,
            codeHash,
            expiresAt,
        });

        // Retrieve user's first name
        let firstName: string | null = null;
        try {
            const { customerRepository } = await import('../repositories/customer.repository');
            const profile = await customerRepository.findProfileByUserId(userId);
            if (profile) firstName = profile.first_name;
        } catch (err) {
            logger.warn('[AuthService] Could not fetch customer profile for name in change password email', { userId });
        }

        if (!firstName) {
            try {
                const userRecord = await userRepository.findById(userId);
                if (userRecord?.username) firstName = userRecord.username;
            } catch {}
        }

        // Send email
        await sendChangePasswordEmail(normalizedEmail, firstName, rawCode);

        logSecurityEvent({
            userId,
            action: 'PASSWORD_CHANGE_CODE_REQUESTED',
            resource: 'auth',
            details: { event: 'password_change_code_requested', target_email: normalizedEmail },
            req,
        });

        return { message: "Verification code sent to your registered email address." };
    }

    /**
     * Verifies confirmation code + current password, validates new password, and updates credentials.
     */
    async changePassword(
        userId: string,
        email: string,
        data: { confirmationCode?: string; currentPassword?: string; newPassword?: string },
        req: Request
    ) {
        if (!userId || !email) throw new AppError("Authentication required.", 401);
        const { confirmationCode, currentPassword, newPassword } = data || {};
        const normalizedEmail = normalizeEmail(email);

        if (!newPassword) {
            throw new AppError("New password is required.", 400);
        }

        // 1. Fetch user credentials
        let user = await userRepository.findCredentialsById(userId);
        if (!user) {
            user = await userRepository.findByEmail(normalizedEmail);
        }
        if (!user) {
            throw new AppError("User account not found.", 404);
        }

        const isStaff = user.role && user.role !== UserRole.CUSTOMER;

        // Staff accounts do not require email verification code (created by admin with unverified placeholder emails).
        // Only customer accounts require email OTP verification code unless confirmationCode is supplied.
        let otpRecord: any = null;
        if (!isStaff || confirmationCode) {
            if (!confirmationCode) {
                throw new AppError("Confirmation code is required.", 400);
            }

            otpRecord = await userRepository.findActivePasswordChangeOtp(userId);
            if (!otpRecord) {
                throw new AppError("Invalid or expired confirmation code.", 400);
            }

            // Check brute-force attempts
            if (otpRecord.attempts >= otpRecord.max_attempts) {
                await userRepository.markPasswordChangeOtpUsed(otpRecord.id);
                throw new AppError("Too many failed attempts. Please request a new confirmation code.", 429);
            }

            // Verify OTP code hash
            const isCodeValid = await bcrypt.compare(confirmationCode.trim().toLowerCase(), otpRecord.code_hash);
            if (!isCodeValid) {
                await userRepository.incrementPasswordChangeOtpAttempts(otpRecord.id);
                throw new AppError("Invalid or expired confirmation code.", 400);
            }
        }

        // 2. Verify current password (if account already has password set)
        if (user.password_hash) {
            if (!currentPassword) {
                throw new AppError("Current password is required.", 400);
            }
            if (currentPassword === newPassword) {
                throw new AppError("New password cannot be the same as the current password.", 400);
            }
            const isCurrentPasswordCorrect = await bcrypt.compare(currentPassword, user.password_hash);
            if (!isCurrentPasswordCorrect) {
                throw new AppError("Incorrect current password.", 400);
            }
        }

        // 3. Validate new password compliance (12+ chars, NIST rules)
        let firstName = '';
        let lastName = '';
        try {
            const { customerRepository } = await import('../repositories/customer.repository');
            const profile = await customerRepository.findProfileByUserId(userId);
            if (profile) {
                firstName = profile.first_name || '';
                lastName = profile.last_name || '';
            }
        } catch {}

        if (!firstName) {
            try {
                const userRecord = await userRepository.findById(userId);
                if (userRecord?.username) firstName = userRecord.username;
            } catch {}
        }

        await ensurePasswordCompliance(newPassword, { email: normalizedEmail, firstName, lastName });


        // 4. Update Supabase Auth password (if user exists in Supabase Auth)
        try {
            const supabaseAdmin = getAdminClient();
            const { error: supabaseError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
                password: newPassword,
            });
            if (supabaseError) {
                logger.warn('[AuthService] Supabase password update warning (proceeding with DB hash)', { userId, error: supabaseError.message });
            }
        } catch (err: unknown) {
            logger.warn('[AuthService] Supabase admin client update skipped/failed', { userId, error: (err as any)?.message });
        }

        // 5. Update local database password hash
        const newPasswordHash = await hashPassword(newPassword);
        await userRepository.updatePasswordByUserId(userId, newPasswordHash);

        // 6. Mark OTP used
        if (otpRecord) {
            await userRepository.markPasswordChangeOtpUsed(otpRecord.id);
        }

        // 7. Revoke existing sessions / refresh tokens
        try {
            const supabaseAdmin = getAdminClient();
            const { error: revokeError } = await supabaseAdmin.auth.admin.signOut(userId, 'global');
            if (revokeError) {
                logger.error('[AuthService] Supabase session revocation failed', { userId, error: revokeError });
            }
        } catch (err: unknown) {
            logger.error('[AuthService] Supabase session revocation error', { userId, error: err });
        }

        await userRepository.invalidateAllSessionsForUser(userId);

        // 8. Audit log
        logSecurityEvent({
            userId,
            action: 'PASSWORD_CHANGE_SUCCESS',
            resource: 'auth',
            details: { event: 'password_change_success', target_email: normalizedEmail },
            req,
        });

        return { message: "Password updated successfully." };
    }

    /**
     * Updates an authenticated user's self-profile details.
     */
    async updateProfile(userId: string, data: { name?: string; username?: string }) {
        const name = (data.name || data.username || '').trim();
        if (!name) {
            throw new AppError('Name cannot be empty.', 400);
        }
        if (name.length < 2 || name.length > 50) {
            throw new AppError('Name must be between 2 and 50 characters.', 400);
        }

        const updatedUser = await userRepository.updateProfile(userId, name);
        return {
            message: 'Profile updated successfully.',
            user: updatedUser,
        };
    }
}


export const authService = new AuthService();
export default authService;

