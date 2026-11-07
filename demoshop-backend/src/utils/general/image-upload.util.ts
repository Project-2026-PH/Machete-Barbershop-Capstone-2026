import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import { AppError } from '../error/AppError';
import { MAX_AVATAR_BYTES } from '../../config/upload-limits';

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB limit
export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png'];
export const ALLOWED_UPLOAD_MIME_TYPES = ['image/jpeg', 'image/png'];

export interface ImageValidationResult {
  filename: string;
  mimeType: string;
}

/**
 * Reusable Multer memory upload middleware for single image uploads.
 */
export const createImageUploadMiddleware = (
  fieldName: string,
  maxSizeBytes: number = MAX_AVATAR_BYTES
) => {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxSizeBytes },
    fileFilter: (_req: any, file: any, cb: any) => {
      if (ALLOWED_UPLOAD_MIME_TYPES.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new AppError('Only JPEG and PNG images are allowed.', 400));
      }
    },
  }).single(fieldName);
};

/**
 * Reusable Multer memory upload middleware for multiple image uploads under the same field.
 */
export const createImageArrayUploadMiddleware = (
  fieldName: string,
  maxCount: number = 10,
  maxSizeBytes: number = MAX_AVATAR_BYTES
) => {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxSizeBytes },
    fileFilter: (_req: any, file: any, cb: any) => {
      if (ALLOWED_UPLOAD_MIME_TYPES.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new AppError('Only JPEG and PNG images are allowed.', 400));
      }
    },
  }).array(fieldName, maxCount);
};

/**
  Inspects magic bytes of a buffer to verify true image file format.
 */
export const detectImageFormatFromMagicBytes = (buffer: Buffer): { mimeType: string; extension: string } | null => {
  if (buffer.length < 4) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return { mimeType: 'image/jpeg', extension: 'jpg' };
  }

  // PNG: 89 50 4E 47 (\x89PNG)
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return { mimeType: 'image/png', extension: 'png' };
  }

  // GIF: GIF87a / GIF89a
  if (
    buffer.length >= 6 &&
    (buffer.toString('ascii', 0, 6) === 'GIF87a' || buffer.toString('ascii', 0, 6) === 'GIF89a')
  ) {
    return { mimeType: 'image/gif', extension: 'gif' };
  }

  // WEBP: Starts with RIFF at 0..4 and WEBP at 8..12
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { mimeType: 'image/webp', extension: 'webp' };
  }

  return null;
};

/**
 * Validates buffer size and magic bytes against allowed static image formats (JPEG, PNG).
 */
export const validateImageBuffer = (
  buffer: Buffer,
  maxSizeBytes: number = MAX_FILE_SIZE_BYTES
): { mimeType: string; extension: string } => {
  if (!buffer || buffer.length === 0) {
    throw new AppError('Uploaded image is empty.', 400);
  }

  if (buffer.length > maxSizeBytes) {
    throw new AppError(
      `File size exceeds maximum limit of ${(maxSizeBytes / (1024 * 1024)).toFixed(0)}MB (Received ${(buffer.length / (1024 * 1024)).toFixed(2)}MB).`,
      400
    );
  }

  const detectedFormat = detectImageFormatFromMagicBytes(buffer);
  if (!detectedFormat || !ALLOWED_MIME_TYPES.includes(detectedFormat.mimeType)) {
    throw new AppError('Invalid file type. Only JPEG and PNG images are allowed.', 400);
  }

  return detectedFormat;
};

/**
 * Validates image URL or base64 image input and returns path/URL for storage.
 */
export const validateAndSaveProfilePicture = async (
  userId: string | number,
  input: string
): Promise<ImageValidationResult> => {
  if (!input || typeof input !== 'string') {
    throw new AppError('Image payload is required.', 400);
  }

  // If input is already a Supabase Storage public URL or HTTP URL, validate and return
  if (input.startsWith('http://') || input.startsWith('https://') || input.startsWith('/uploads/')) {
    return {
      filename: input,
      mimeType: 'image'
    };
  }

  // Strip data URL header if present (e.g. data:image/png;base64,...)
  const base64Data = input.replace(/^data:image\/\w+;base64,/, '');


  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64Data, 'base64');
  } catch {
    throw new AppError('Invalid base64 image data.', 400);
  }

  // 1. Validate File Size
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    throw new AppError(`File size exceeds maximum limit of 5MB (Received ${(buffer.length / (1024 * 1024)).toFixed(2)}MB).`, 400);
  }

  if (buffer.length === 0) {
    throw new AppError('Uploaded image is empty.', 400);
  }

  // 2. Validate Magic Bytes / File Header
  const detectedFormat = detectImageFormatFromMagicBytes(buffer);
  if (!detectedFormat || !ALLOWED_MIME_TYPES.includes(detectedFormat.mimeType)) {
    throw new AppError('Invalid file type. Only JPEG and PNG images are allowed.', 400);
  }

  // 3. Generate Safe Sanitized Filename (Prevents Path Traversal)
  const safeUserId = String(userId).replace(/[^a-zA-Z0-9_-]/g, '_');
  const randomHash = crypto.randomBytes(8).toString('hex');
  const filename = `profile_${safeUserId}_${Date.now()}_${randomHash}.${detectedFormat.extension}`;

  // 4. Ensure Upload Directory Exists
  const uploadDir = path.join(__dirname, '../../../uploads/profiles');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  // 5. Write File
  const filePath = path.join(uploadDir, filename);
  await fs.promises.writeFile(filePath, buffer);

  return {
    filename,
    mimeType: detectedFormat.mimeType
  };
};
