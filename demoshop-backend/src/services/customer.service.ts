import { customerRepository } from '../repositories/customer.repository';
import { userRepository } from '../repositories/user.repository';
import logger from '../utils/general/logger';
import { ensureUserId } from '../utils/customer/customer-validation.util';
import { calculateMembershipLevel } from '../utils/customer/customer-logic.util';
import { 
  formatCustomerProfile, 
  getSystemUserFallback 
} from '../utils/customer/customer-formatter.util';
import { AppError } from '../utils/error/AppError';
import { getAdminClient } from '../config/supabase';
import { validateImageBuffer } from '../utils/general/image-upload.util';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { deleteCachePattern } from '../redis';
import { queueService } from './queue.service';
import { auditService, logSecurityEvent } from './audit.service';
import { authThrottleRepository } from '../repositories/auth-throttle.repository';
import { sendChangeEmailVerification } from './email.service';
import type { Request } from 'express';

/**
 * Service for Customer business logic.
 * Follows the Coordinator Pattern: orchestrates specialized utilities, 
 * repositories, and formatting logic for customer profiles and membership.
 */
export class CustomerService {
  async keepScheduleAdjustment(userId: string, queueId: number): Promise<any> {
    ensureUserId(userId as any);
    const customerId = await customerRepository.findCustomerIdByUserId(userId);
    if (!customerId) throw new AppError('Customer profile not found.', 404);
    return queueService.keepScheduleAdjustment(customerId, queueId);
  }

  async rescheduleScheduleAdjustment(
    userId: string,
    queueId: number,
    preferredDate: string,
    preferredTime: string,
  ): Promise<any> {
    ensureUserId(userId as any);
    const customerId = await customerRepository.findCustomerIdByUserId(userId);
    if (!customerId) throw new AppError('Customer profile not found.', 404);
    return queueService.rescheduleScheduleAdjustment(customerId, queueId, preferredDate, preferredTime);
  }

  async rescheduleAppointment(
    userId: string,
    queueId: number,
    scheduledDate: string,
    scheduledTime: string,
    barberId?: number,
  ): Promise<any> {
    ensureUserId(userId as any);
    const customerId = await customerRepository.findCustomerIdByUserId(userId);
    if (!customerId) throw new AppError('Customer profile not found.', 404);
    return queueService.rescheduleAppointment(customerId, queueId, scheduledDate, scheduledTime, barberId);
  }

  /**
   * Generates a short-lived signed URL for a haircut photo from its storage path.
   */
  async resolveHaircutPhotoSignedUrl(rawPathOrUrl: string | null): Promise<string | null> {
    if (!rawPathOrUrl) return null;
    const storagePath = rawPathOrUrl.includes('/haircut-photos/')
      ? rawPathOrUrl.split('/haircut-photos/')[1]?.split('?')[0]
      : rawPathOrUrl;
    if (!storagePath) return null;
    try {
      const { data, error } = await getAdminClient()
        .storage
        .from('haircut-photos')
        .createSignedUrl(storagePath, 3600);
      if (error || !data?.signedUrl) {
        return rawPathOrUrl;
      }
      return data.signedUrl;
    } catch {
      return rawPathOrUrl;
    }
  }

  /**
   * Gets the customer's profile with membership level calculation.
   */
  async getProfile(userId: string, userEmail?: string) {
    ensureUserId(userId as any);

    logger.info(`[getProfile] Fetching profile for user ID: ${userId}`);
    const customer = await customerRepository.findProfileByUserId(userId);

    if (!customer) {
      logger.warn(`[getProfile] No customer record found for user ID: ${userId}. Returning fallback.`);
      return getSystemUserFallback(userEmail || 'unknown');
    }

    // Logic and Formatting moved to specialized utilities
    const membershipInfo = calculateMembershipLevel();
    const formattedProfile = formatCustomerProfile(customer, membershipInfo);

    // Check if user has an existing password set
    const userCredentials = await userRepository.findCredentialsById(userId);
    const hasPassword = Boolean(userCredentials?.password_hash);

    // Check if user account was created/authenticated via Google OAuth
    let isGoogleUser = false;
    try {
      const supabaseAdmin = getAdminClient();
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
      if (authUser?.user) {
        const provider = authUser.user.app_metadata?.provider;
        const providers = authUser.user.app_metadata?.providers || [];
        const identities = authUser.user.identities || [];
        if (
          provider === 'google' ||
          providers.includes('google') ||
          identities.some((i: any) => i.provider === 'google')
        ) {
          isGoogleUser = true;
        }
      }
    } catch (err) {
      logger.warn('[CustomerService] Failed to check OAuth provider status from Supabase', { userId });
    }

    const responsePayload = {
      ...formattedProfile,
      has_password: hasPassword,
      is_google: isGoogleUser,
    };

    logger.info(`[getProfile] Success - Returning profile data for user ${userId}`);
    return responsePayload;
  }

  /**
   * Updates customer profile information (names only; email requires OTP flow).
   */
  async updateProfile(userId: string, data: { firstName?: string; lastName?: string; email?: string }) {
    ensureUserId(userId as any);
    const current = await customerRepository.findProfileByUserId(userId);
    if (!current) {
      throw new AppError('Customer profile not found', 404);
    }

    const nextEmail = data.email?.trim().toLowerCase();
    if (nextEmail && nextEmail !== (current.email || '').toLowerCase()) {
      throw new AppError('Changing email requires OTP verification. Please use the email verification process.', 400);
    }

    const updated = await customerRepository.updateProfile(userId, {
      firstName: data.firstName,
      lastName: data.lastName,
    });

    return {
      message: 'Profile updated successfully.',
      profile: updated,
    };
  }

  /**
   * Generates and emails an 8-character OTP to the requested new email address.
   */
  async requestEmailChangeCode(userId: string, newEmail: string, req?: Request) {
    ensureUserId(userId as any);
    const current = await customerRepository.findProfileByUserId(userId);
    if (!current) {
      throw new AppError('Customer profile not found', 404);
    }

    const targetNewEmail = (newEmail || '').trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!targetNewEmail || !emailRegex.test(targetNewEmail)) {
      throw new AppError('Please enter a valid email address.', 400);
    }

    if (targetNewEmail === (current.email || '').toLowerCase()) {
      throw new AppError('The new email address is identical to your current email.', 400);
    }

    const existing = await userRepository.findByEmail(targetNewEmail);
    if (existing && String(existing.user_id) !== String(userId)) {
      throw new AppError('A user with this email address already exists.', 409);
    }

    // 60-second cooldown per user
    const cooldown = await authThrottleRepository.acquireCooldown({
      scope: 'email_change_cooldown',
      key: userId,
      durationSeconds: 60,
    });
    if (!cooldown) {
      throw new AppError('Please wait 60 seconds before requesting another code.', 429, true, { retryAfter: 60 });
    }

    // Generate secure 8-character alphanumeric code
    const rawCode = crypto.randomBytes(4).toString('hex');
    const codeHash = await bcrypt.hash(rawCode.toLowerCase(), 10);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Invalidate previous active unexpired email change OTPs
    await userRepository.invalidateActiveEmailChangeOtps(userId);

    // Save hashed OTP in database
    await userRepository.createEmailChangeOtp({
      userId,
      newEmail: targetNewEmail,
      codeHash,
      expiresAt,
    });

    const firstName = current.first_name || 'Valued Customer';

    // Send email to the NEW email address
    await sendChangeEmailVerification(targetNewEmail, firstName, rawCode);

    logSecurityEvent({
      userId,
      action: 'EMAIL_CHANGE_CODE_REQUESTED',
      resource: 'customer',
      details: { event: 'email_change_code_requested', targetEmail: targetNewEmail },
      req,
    });

    return { message: 'Verification code sent to your new email address.', cooldown: 60 };
  }

  /**
   * Verifies the confirmation code for the new email and updates auth + database records.
   */
  async verifyEmailChange(userId: string, newEmail: string, confirmationCode: string, req?: Request) {
    ensureUserId(userId as any);
    const current = await customerRepository.findProfileByUserId(userId);
    if (!current) {
      throw new AppError('Customer profile not found', 404);
    }

    const targetNewEmail = (newEmail || '').trim().toLowerCase();
    if (!targetNewEmail) {
      throw new AppError('New email is required.', 400);
    }

    const cleanCode = (confirmationCode || '').trim().toLowerCase();
    if (!cleanCode) {
      throw new AppError('Verification code is required.', 400);
    }

    // Re-check conflict in case another user registered targetNewEmail in the meantime
    const existing = await userRepository.findByEmail(targetNewEmail);
    if (existing && String(existing.user_id) !== String(userId)) {
      throw new AppError('A user with this email address already exists.', 409);
    }

    const otpRecord = await userRepository.findActiveEmailChangeOtp(userId, targetNewEmail);
    if (!otpRecord) {
      throw new AppError('Invalid or expired verification code.', 400);
    }

    if (otpRecord.attempts >= otpRecord.max_attempts) {
      await userRepository.markEmailChangeOtpUsed(otpRecord.id);
      throw new AppError('Too many failed attempts. Please request a new verification code.', 429);
    }

    const isCodeValid = await bcrypt.compare(cleanCode, otpRecord.code_hash);
    if (!isCodeValid) {
      await userRepository.incrementEmailChangeOtpAttempts(otpRecord.id);
      throw new AppError('Invalid verification code.', 400);
    }

    await userRepository.markEmailChangeOtpUsed(otpRecord.id);

    // Update in Supabase Auth
    try {
      const { error } = await getAdminClient().auth.admin.updateUserById(userId, {
        email: targetNewEmail,
        email_confirm: true,
      });
      if (error) {
        logger.error('[CustomerService] Supabase Auth email update failed', { userId, error });
        throw new AppError('Unable to update email address in auth provider.', 500);
      }
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      logger.error('[CustomerService] Error updating Supabase user:', err);
      throw new AppError('Unable to update email in authentication system.', 500);
    }

    // Update in PostgreSQL (both users and customers table)
    const updated = await customerRepository.updateProfile(userId, {
      email: targetNewEmail,
    });

    logSecurityEvent({
      userId,
      action: 'EMAIL_CHANGE_VERIFIED',
      resource: 'customer',
      details: { event: 'email_change_verified', newEmail: targetNewEmail },
      req,
    });

    return {
      message: 'Email address updated successfully.',
      profile: updated,
      email: targetNewEmail,
    };
  }

  /**
   * Updates customer notification and account preferences.
   */
  async updatePreferences(userId: string, preferences: { email_notifications_enabled?: boolean }) {
    ensureUserId(userId as any);

    const enabled = preferences?.email_notifications_enabled !== undefined
      ? Boolean(preferences.email_notifications_enabled)
      : true;

    await customerRepository.updateEmailNotificationsPreference(userId, enabled);

    logger.info(`[updatePreferences] Updated preferences for user ${userId}: email_notifications_enabled=${enabled}`);
    return {
      success: true,
      email_notifications_enabled: enabled,
    };
  }

  /**
   * Deletes and anonymizes a customer's account, session, and Supabase auth record.
   */
  async deleteAccount(userId: string, req?: Request): Promise<{ success: boolean; message: string }> {
    ensureUserId(userId as any);
    logger.info(`[deleteAccount] Deleting account for user ID: ${userId}`);

    await customerRepository.anonymizeAndDeleteAccount(userId);

    try {
      const adminClient = getAdminClient();
      await adminClient.auth.admin.signOut(userId, 'global');
      await adminClient.auth.admin.deleteUser(userId);
    } catch (authError) {
      logger.warn('[deleteAccount] Supabase auth deletion warning:', { userId, authError });
    }

    await auditService.logSecurityEvent({
      userId,
      action: 'CUSTOMER_ACCOUNT_DELETED',
      resource: 'customer',
      details: { deleted_user_id: userId },
      req,
    });

    return { success: true, message: 'Account successfully deleted.' };
  }



  /**
   * Gets the customer's next future reservation accepted by a cashier.
   */
  async getUpcomingAppointment(userId: string): Promise<any | null> {
    ensureUserId(userId as any);

    const customerId = await customerRepository.findCustomerIdByUserId(userId);
    if (!customerId) return null;

    return customerRepository.findUpcomingAppointment(customerId);
  }

  /**
   * Gets the customer's appointment history with validated customer mapping.
   */
  async getHistory(userId: string) {
    ensureUserId(userId as any);

    const customerId = await customerRepository.findCustomerIdByUserId(userId);
    if (!customerId) return [];

    const history = await customerRepository.findHistory(customerId);
    return Promise.all(
      history.map(async (item: any) => {
        const rawStatus = (item.status || '').toLowerCase();
        const isPaid = (item.payment_status || '').toLowerCase() === 'paid';
        let status = item.status || 'Completed';
        if (rawStatus === 'no_show' || rawStatus === 'no show') {
          status = 'NO_SHOW';
        } else if (rawStatus === 'expired' || rawStatus === 'cancelled') {
          status = 'Cancelled';
        } else if ((rawStatus === 'completed' || rawStatus === 'done') && !isPaid) {
          status = 'Serving';
        }

        const signedPhotoUrl = item.haircut_photo_url
          ? await this.resolveHaircutPhotoSignedUrl(item.haircut_photo_url)
          : null;

        return {
          id: item.id,
          date: item.date || 'N/A',
          service_name: item.service_name || item.service || 'Grooming Service',
          time: item.time || 'N/A',
          estimated_start_at: item.estimated_start_at || null,
          schedule_delay_minutes: Number(item.schedule_delay_minutes) || 0,
          barber_name: item.barber_name || 'Any Barber',
          ...(item.barber_image ? { barber_image: item.barber_image } : {}),
          ...(item.group_booking_id ? { group_booking_id: item.group_booking_id } : {}),
          ...(item.guest_name ? { guest_name: item.guest_name } : {}),
          price: item.price ?? 0,
          reservation_fee: item.reservation_fee ?? (item.source === 'guest' ? 0 : 50),
          status,
          payment_status: item.payment_status || 'unpaid',
          haircut_photo_url: signedPhotoUrl,
          ...(item.source === 'guest' ? {
            source: 'guest',
            guest_reference: item.guest_reference || null,
          } : {}),
          ...(item.cancel_reason ? {
            cancellation_reason: item.cancel_reason,
            cancellation_type: item.cancel_type || null,
          } : {}),
        };
      })
    );
  }

  /**
   * Gets complete breakdown details for a single reservation/history entry.
   */
  async getHistoryDetails(userId: string, historyId: number) {
    ensureUserId(userId as any);

    const customerId = await customerRepository.findCustomerIdByUserId(userId);
    if (!customerId) {
      throw new AppError('Customer profile not found.', 404);
    }

    const details = await customerRepository.findHistoryDetails(historyId, customerId);
    if (!details) {
      throw new AppError('Reservation history entry not found.', 404);
    }

    if (details.haircut_photo_url) {
      details.haircut_photo_url = await this.resolveHaircutPhotoSignedUrl(details.haircut_photo_url);
    }

    return details;
  }

  /**
   * Uploads a haircut photo to Supabase storage and stores photo URL on a completed & paid reservation card.
   */
  async uploadHaircutPhoto(
    userId: string,
    queueEntryId: number,
    fileBuffer: Buffer,
    mimeType: string
  ): Promise<{ haircut_photo_url: string }> {
    ensureUserId(userId as any);

    const customerId = await customerRepository.findCustomerIdByUserId(userId);
    if (!customerId) {
      throw new AppError('Customer profile not found.', 404);
    }

    const entry = await customerRepository.findCompletedPaidQueueEntry(queueEntryId, customerId);
    if (!entry) {
      throw new AppError('Reservation history entry not found for this customer.', 404);
    }

    if (String(entry.status).toLowerCase() !== 'completed' || String(entry.payment_status).toLowerCase() !== 'paid') {
      throw new AppError('Haircut photo can only be uploaded for completed reservations that are marked as paid.', 400);
    }

    const detected = validateImageBuffer(fileBuffer);
    const randomKey = crypto.randomBytes(8).toString('hex');
    const filePath = `customer_${customerId}/haircut_${entry.id}_${Date.now()}_${randomKey}.${detected.extension}`;

    const supabase = getAdminClient();
    const { error: uploadError } = await supabase.storage
      .from('haircut-photos')
      .upload(filePath, fileBuffer, {
        contentType: detected.mimeType,
        upsert: false,
      });

    if (uploadError) {
      logger.error('[uploadHaircutPhoto] Supabase storage upload failed:', uploadError);
      throw new AppError('Failed to upload haircut photo to storage.', 500);
    }

    await customerRepository.updateHaircutPhotoUrl(entry.id, filePath, customerId);

    const { data: signedData } = await supabase.storage
      .from('haircut-photos')
      .createSignedUrl(filePath, 3600);

    const photoUrl = signedData?.signedUrl || filePath;
    logger.info(`[uploadHaircutPhoto] Successfully saved haircut photo for entry ${entry.id} customer ${customerId}`);
    return { haircut_photo_url: photoUrl };
  }

  async deleteHaircutPhoto(userId: string, queueEntryId: number): Promise<{ success: boolean }> {
    ensureUserId(userId as any);
    const customerId = await customerRepository.findCustomerIdByUserId(userId);
    if (!customerId) {
      throw new AppError('Customer profile not found.', 404);
    }

    const entry = await customerRepository.findCompletedPaidQueueEntry(queueEntryId, customerId);
    if (!entry) {
      throw new AppError('Reservation history entry not found for this customer.', 404);
    }

    const previousPath = entry.haircut_photo_url;
    await customerRepository.updateHaircutPhotoUrl(entry.id, null, customerId);

    if (previousPath) {
      const storagePath = previousPath.includes('/haircut-photos/')
        ? previousPath.split('/haircut-photos/')[1]?.split('?')[0]
        : previousPath;
      if (storagePath) {
        try {
          const { error: delError } = await getAdminClient().storage
            .from('haircut-photos')
            .remove([storagePath]);
          if (delError) {
            await customerRepository.recordStorageCleanupJob(
              'haircut-photos',
              storagePath,
              'delete_haircut_photo_error',
              delError.message
            );
          }
        } catch (err: any) {
          await customerRepository.recordStorageCleanupJob(
            'haircut-photos',
            storagePath,
            'delete_haircut_photo_exception',
            err?.message
          );
        }
      }
    }

    logger.info(`[deleteHaircutPhoto] Successfully removed haircut photo for entry ${entry.id} customer ${customerId}`);
    return { success: true };
  }

  /** Returns the number of services that were both paid and completed. */
  async getCompletedPaidHaircutCount(userId: string): Promise<number> {
    ensureUserId(userId as any);
    const customerId = await customerRepository.findCustomerIdByUserId(userId);
    return customerId ? customerRepository.countCompletedPaidHaircuts(customerId) : 0;
  }

  /**
   * Gets the customer's transaction history.
   */
  async getTransactions(userId: string) {
    if (!userId) return [];

    const customerId = await customerRepository.findCustomerIdByUserId(userId);
    if (!customerId) return [];

    return customerRepository.findTransactions(customerId);
  }

  /**
   * Validates, uploads to Supabase Storage, and updates the user's profile picture.
   * Upload is done server-side using the admin (service_role) client to bypass RLS.
   */
  async uploadProfilePicture(
    userId: string,
    fileBuffer: Buffer,
    _mimeType: string,
  ) {
    ensureUserId(userId as any);

    const detected = validateImageBuffer(fileBuffer);
    const randomKey = crypto.randomBytes(8).toString('hex');
    const filePath = `${userId}/${Date.now()}_${randomKey}.${detected.extension}`;

    logger.info(`[uploadProfilePicture] Uploading to Supabase Storage for user ${userId}`);

    const adminClient = getAdminClient();
    const { error: uploadError } = await adminClient.storage
      .from('avatars')
      .upload(filePath, fileBuffer, {
        contentType: detected.mimeType,
        upsert: false,
      });

    if (uploadError) {
      logger.error(`[uploadProfilePicture] Supabase Storage upload failed: ${uploadError.message}`);
      throw new AppError('Failed to upload profile picture. Please try again.', 500);
    }

    const { data: { publicUrl } } = adminClient.storage
      .from('avatars')
      .getPublicUrl(filePath);

    await userRepository.updateProfilePicture(userId, publicUrl);
    try {
      await Promise.all([
        deleteCachePattern('barber:public:*'),
        deleteCachePattern('barber:staff:*'),
        deleteCachePattern('barber:availability:*'),
      ]);
    } catch (cacheErr: any) {
      logger.warn(`[uploadProfilePicture] Cache invalidation warning: ${cacheErr?.message}`);
    }

    logger.info(`[uploadProfilePicture] Profile picture updated for user ${userId}: ${publicUrl}`);
    return {
      message: 'Profile picture updated successfully',
      profilePicture: publicUrl,
    };
  }
}

export const customerService = new CustomerService();
export default customerService;


