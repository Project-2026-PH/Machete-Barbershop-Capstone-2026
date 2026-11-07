import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { config } from '../../config/env';

export const GUEST_QR_TTL_MS = 24 * 60 * 60 * 1000;
export const GUEST_REFERENCE_MAX_LENGTH = 12;

export const normalizeGuestName = (name: string): string =>
  name.normalize('NFKC').trim().replace(/\s+/g, ' ').toUpperCase();

export const getBusinessDate = (date: Date, timeZone: string): string => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

export const getGuestNameDigest = (name: string, secret: string): string =>
  crypto.createHmac('sha256', secret).update(normalizeGuestName(name), 'utf8').digest('hex').toUpperCase().slice(0, 6);

export const formatGuestReference = (businessDate: string, nameDigest: string, dailySequence: number): string => {
  const datePart = businessDate.replace(/-/g, '').slice(2);
  const sequencePart = String(dailySequence).padStart(2, '0');
  const availableNameLength = GUEST_REFERENCE_MAX_LENGTH - datePart.length - sequencePart.length - 1;
  if (availableNameLength < 0) throw new Error('Guest daily sequence cannot fit the reference format.');
  const namePart = nameDigest.slice(0, availableNameLength);
  const reference = `${datePart}${namePart}-${sequencePart}`;
  if (reference.length > GUEST_REFERENCE_MAX_LENGTH) throw new Error('Generated guest reference exceeds its maximum length.');
  return reference;
};

export const createGuestQrToken = (): string => crypto.randomBytes(32).toString('base64url');

export const hashGuestQrToken = (token: string): string =>
  crypto.createHash('sha256').update(token, 'utf8').digest('hex');

export const createGuestQrCode = (token: string): Promise<string> =>
  QRCode.toDataURL(`${config.frontendOrigin}/guest-overview#token=${encodeURIComponent(`MCH-GUEST:${token}`)}`, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 256,
  });
