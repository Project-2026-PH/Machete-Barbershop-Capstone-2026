import { AppError } from '../error/AppError';

export const normalizeRole = (role: unknown): string => {
  if (typeof role !== 'string') return '';
  const trimmed = role.trim();
  const lower = trimmed.toLowerCase();
  if (lower === 'shop admin' || lower === 'shopadmin' || lower === 'shop_admin') {
    return 'Owner';
  }
  return trimmed;
};

export const ASSIGNABLE_ROLES = new Set([
  'System Admin',
  'Owner',
  'Cashier',
  'Barber',
  'Customer',
  'Inventory Manager',
]);

const validateAssignableRole = (role: unknown): void => {
  const normalized = typeof role === 'string' ? normalizeRole(role) : role;
  if (typeof normalized !== 'string' || !ASSIGNABLE_ROLES.has(normalized)) {
    throw new AppError('Invalid user role.', 400);
  }
};

/**
 * Validates the input for creating a new admin/staff user.
 */
export const validateAdminCreation = (data: {
  email: string;
  password?: string;
  role: string;
}): void => {
  if (data.role !== undefined) {
    data.role = normalizeRole(data.role);
  }
  const { email, password, role } = data;

  if (!email || !password || !role) {
    throw new AppError('Email, password, and role are required.', 400);
  }

  validateAssignableRole(role);

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new AppError('Invalid email format.', 400);
  }

  if (password.length < 12) {
    throw new AppError('Password must be at least 12 characters.', 400);
  }
};

/**
 * Validates the input for updating an admin/staff user.
 */
export const validateAdminUpdate = (data: any): void => {
  if (data.role !== undefined) {
    data.role = normalizeRole(data.role);
    validateAssignableRole(data.role);
  }
  const { email, role, username, profilePicture } = data;
  
  if (!email && role === undefined && username === undefined && profilePicture === undefined) {
    throw new AppError('No fields provided to update.', 400);
  }

  if (email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new AppError('Invalid email format.', 400);
    }
  }
};

/**
 * Validates the input for resetting an admin's password.
 */
export const validateAdminPasswordReset = (password: string): void => {
  if (!password || password.length < 8) {
    throw new AppError('Password must be at least 8 characters.', 400);
  }
};
