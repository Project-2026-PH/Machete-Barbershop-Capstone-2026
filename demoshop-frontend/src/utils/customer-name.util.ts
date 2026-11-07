/**
 * Customer Name Input Sanitization and Validation Utility
 *
 * Enforces strict alphabetic character rules:
 * - Disallows all numbers (0-9).
 * - Disallows all special characters (!@#$%^&*()_+-=[]{}|;':",./<>?~` etc.).
 * - Allows only Unicode alphabetic letters (including Philippine/accented characters like ñ/Ñ) and spaces.
 * - Prevents leading spaces and compresses consecutive spaces.
 */

/**
 * Strips out any numbers and special characters from the customer name input.
 * Only alphabetic letters and spaces are retained.
 */
export function sanitizeCustomerName(input: string): string {
  if (!input) return '';
  return input
    .replace(/[^\p{L}\s]/gu, '') // Keep only letters and whitespace
    .replace(/^\s+/, '') // Remove leading spaces
    .replace(/\s{2,}/g, ' '); // Compress consecutive spaces
}

/**
 * Checks if a keyboard key is an invalid character for customer name.
 * Can be used in onKeyDown to immediately block invalid key presses.
 */
export function isInvalidCustomerNameKey(key: string, isCtrlOrMeta = false): boolean {
  // Allow navigation/editing keys (Backspace, Tab, Enter, Arrows, Delete, etc.)
  if (key.length > 1) return false;
  // Allow shortcut commands (Ctrl+C, Ctrl+V, Ctrl+A, Cmd+V, etc.)
  if (isCtrlOrMeta) return false;
  // Reject anything that is not a letter or space
  return !/^[\p{L}\s]$/u.test(key);
}

/**
 * Validates that the customer name contains only valid letters and spaces,
 * and meets the minimum length requirement (at least 2 letters).
 */
export function isValidCustomerName(input: string): boolean {
  const sanitized = sanitizeCustomerName(input).trim();
  if (sanitized.length < 2) return false;
  return /^[\p{L}]+(?:\s+[\p{L}]+)*$/u.test(sanitized);
}

/** Formats each part of a customer name with a capitalized first letter. */
export function normalizeCustomerNameCase(input: string): string {
  return input.trim().replace(/\s+/gu, ' ').replace(/[\p{L}\p{M}]+/gu, (part) => {
    const lower = part.toLocaleLowerCase();
    return lower.charAt(0).toLocaleUpperCase() + lower.slice(1);
  });
}

/** Flags likely keyboard mashes for confirmation without rejecting the name. */
export function isLikelyUnusualCustomerName(input: string): boolean {
  const normalized = normalizeCustomerNameCase(input);
  const words = normalized.match(/[\p{L}\p{M}]+/gu) || [];
  const commonShortNames = new Set([
    'al', 'am', 'an', 'ari', 'ana', 'ann', 'ash', 'ava', 'ada', 'bo', 'de', 'di', 'do',
    'ed', 'eve', 'eva', 'ian', 'ivy', 'jay', 'jen', 'jo', 'jon', 'kai', 'ken', 'kim',
    'lee', 'leo', 'lia', 'li', 'lou', 'lu', 'may', 'mia', 'mo', 'ng', 'nia', 'noe',
    'rae', 'raj', 'ray', 'sam', 'sue', 'tim', 'tom', 'ty', 'yu',
  ]);
  if (!isValidCustomerName(normalized) || words.length === 0) return true;
  return words.some((word) => {
    const lower = word.toLocaleLowerCase();
    const vowelCount = (lower.match(/[aeiou]/gu) || []).length;
    const vowelRatio = vowelCount / lower.length;
    return (lower.length <= 3 && !commonShortNames.has(lower))
      || /(.)\1{3,}/iu.test(lower)
      || lower.length >= 24
      || /[^aeiou]{4,}/iu.test(lower)
      || (lower.length >= 5 && vowelRatio <= 0.2);
  });
}
