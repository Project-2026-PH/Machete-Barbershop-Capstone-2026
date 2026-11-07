import { sendVerificationEmail } from '../../services/email.service';
import logger from './logger';

/**
 * Sends a registration email while preserving the caller's ability to observe
 * the delivery result. The email address and OTP are intentionally excluded
 * from logs.
 */
export const sendRegistrationEmailAsync = async (
  email: string,
  firstName: string,
  code: number | string,
): Promise<boolean> => {
  try {
    const deliveredCode = await sendVerificationEmail(email, firstName, code);
    const sent = deliveredCode !== null;
    if (!sent) {
      logger.error('[AuthService/NotificationWorker] Email delivery returned unsuccessful', {
        event: 'registration_email_delivery_failed',
      });
    }
    return sent;
  } catch (err: unknown) {
    logger.error('[AuthService/NotificationWorker] Email delivery failed', {
      event: 'registration_email_delivery_failed',
      error: err,
    });
    return false;
  }
};
