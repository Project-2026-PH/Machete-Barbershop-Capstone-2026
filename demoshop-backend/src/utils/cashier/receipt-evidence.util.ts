import crypto from 'node:crypto';
import { AppError } from '../error/AppError';

export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
export const MIN_RECEIPT_DIMENSION = 120;
export const MAX_RECEIPT_DIMENSION = 12000;

export interface ReceiptEvidence {
  sha256: string;
  width: number;
  height: number;
  contentType: 'image/jpeg' | 'image/png';
}

const readUInt32 = (buffer: Buffer, offset: number) => buffer.readUInt32BE(offset);

const parsePng = (buffer: Buffer): [number, number] | null => {
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return null;
  return [readUInt32(buffer, 16), readUInt32(buffer, 20)];
};

const parseJpeg = (buffer: Buffer): [number, number] | null => {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    const marker = buffer[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (offset + 2 > buffer.length) return null;
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) return null;
    const isFrame = marker >= 0xc0 && marker <= 0xc3 || marker >= 0xc5 && marker <= 0xc7 || marker >= 0xc9 && marker <= 0xcb || marker >= 0xcd && marker <= 0xcf;
    if (isFrame && segmentLength >= 7) return [buffer.readUInt16BE(offset + 5), buffer.readUInt16BE(offset + 3)];
    offset += segmentLength;
  }
  return null;
};

export const validateReceiptEvidence = (file: Express.Multer.File): ReceiptEvidence => {
  if (!file || !Buffer.isBuffer(file.buffer)) throw new AppError('A receipt image is required.', 400);
  if (file.size > MAX_RECEIPT_BYTES) throw new AppError('Receipt image must be 10 MB or smaller.', 413);

  const pngDimensions = parsePng(file.buffer);
  const jpegDimensions = parseJpeg(file.buffer);
  const dimensions = pngDimensions || jpegDimensions;
  const contentType = pngDimensions ? 'image/png' : jpegDimensions ? 'image/jpeg' : null;
  if (!contentType || !dimensions) throw new AppError('Receipt must be a readable JPEG or PNG image.', 400);
  const [width, height] = dimensions;
  if (![width, height].every(value => Number.isInteger(value) && value >= MIN_RECEIPT_DIMENSION && value <= MAX_RECEIPT_DIMENSION)) {
    throw new AppError('Receipt image dimensions are outside the supported range.', 400);
  }

  return { sha256: crypto.createHash('sha256').update(file.buffer).digest('hex'), width, height, contentType };
};

export const isValidGcashReference = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Z0-9][A-Z0-9-]{5,49}$/i.test(value.trim());
