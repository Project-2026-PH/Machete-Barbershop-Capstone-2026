import crypto from 'crypto';
import axios from 'axios';
import logger from '../general/logger';

/**
 * Checks if a password has been exposed in a data breach using HaveIBeenPwned API (k-anonymity).
 */
async function checkHIBP(password: string): Promise<boolean> {
  try {
    const sha1 = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefix = sha1.substring(0, 5);
    const suffix = sha1.substring(5);

    const response = await axios.get(`https://api.pwnedpasswords.com/range/${prefix}`);
    const breaches = response.data.split('\n');

    // Check if our suffix exists in the response
    // Format: SUFFIX:COUNT
    return breaches.some((line: string) => {
      const [hashSuffix] = line.split(':');
      return hashSuffix.trim() === suffix;
    });
  } catch (error: unknown) {
    logger.error('HIBP API check failed', { error });
    // Fail open: If API is down, assume password is safe to avoid blocking users unnecessarily.
    return false;
  }
}

/**
 * Validates a password against NIST guidelines.
 */
export const validatePassword = async (
  password: string,
  userContext: { firstName?: string; lastName?: string; email?: string }
): Promise<{ isValid: boolean; error: string | null }> => {
  // Length Check (12 - 128 characters)
  if (!password || password.length < 12) {
    return { isValid: false, error: "Password must be at least 12 characters long." };
  }
  if (password.length > 128) {
    return { isValid: false, error: "Password must be less than 128 characters." };
  }

  // Context Check
  const lowerPassword = password.toLowerCase();

  // Extract potential context words
  const contextWords: string[] = [];
  if (userContext.firstName && userContext.firstName.length >= 3) contextWords.push(userContext.firstName.toLowerCase());
  if (userContext.lastName && userContext.lastName.length >= 3) contextWords.push(userContext.lastName.toLowerCase());
  if (userContext.email) {
    const localPart = userContext.email.split('@')[0];
    if (localPart && localPart.length >= 4) contextWords.push(localPart.toLowerCase());
  }

  contextWords.push('password');

  for (const word of contextWords) {
    if (lowerPassword.includes(word)) {
      return {
        isValid: false,
        error: "Password contains personal information or common terms (e.g. name, email, app name).",
      };
    }
  }

  // Breached Password Check (Async)
  const isBreached = await checkHIBP(password);
  if (isBreached) {
    return {
      isValid: false,
      error: "This password has been exposed in a data breach. Please choose a different one.",
    };
  }

  return { isValid: true, error: null };
};
