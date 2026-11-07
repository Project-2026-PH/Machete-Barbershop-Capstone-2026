export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
export const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const MIME_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export const getSafeAvatarExtension = (mimeType: string): string => {
  return MIME_TO_EXTENSION[mimeType] || 'jpg';
};

export const generateSafeAvatarPath = (userId: string, mimeType: string): string => {
  const ext = getSafeAvatarExtension(mimeType);
  const randomKey = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Math.random().toString(36).substring(2, 15)}_${Date.now()}`;
  return `${userId}/${randomKey}.${ext}`;
};

export const validateAvatarFile = (file: File): string | null => {
  if (!file) {
    return 'Avatar file is required.';
  }
  if (!ALLOWED_AVATAR_TYPES.includes(file.type as (typeof ALLOWED_AVATAR_TYPES)[number])) {
    return 'Only JPEG, PNG, and WEBP images are allowed.';
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return `Avatar must be 5 MB or smaller (selected file is ${(file.size / (1024 * 1024)).toFixed(2)} MB).`;
  }
  return null;
};
