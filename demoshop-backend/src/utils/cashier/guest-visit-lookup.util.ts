import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { config } from '../../config/env';

const key = () => createHash('sha256').update(`demoshop-guest-visit-lookup:${config.auth.jwtSecret}`).digest();

export const createGuestVisitLookupCode = (): string => randomBytes(12).toString('hex').toUpperCase();
export const hashGuestVisitLookupCode = (code: string): string => createHash('sha256').update(code).digest('hex');

// Receipt print jobs need to render the code again, so retain only authenticated
// ciphertext in receipt_data and keep the verification digest separately.
export const encryptGuestVisitLookupCode = (code: string): string => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(part => part.toString('base64url')).join('.');
};

export const decryptGuestVisitLookupCode = (value: string | null | undefined): string | null => {
  if (!value) return null;
  try {
    const [ivValue, tagValue, encryptedValue] = value.split('.');
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivValue, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(encryptedValue, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
};
