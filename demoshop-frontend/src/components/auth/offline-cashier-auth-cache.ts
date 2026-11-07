export interface OfflineCashierAuthProfile {
  user_id: string;
  branch_id: number;
  role: string;
  name?: string;
}

interface OfflineCashierAuthProfileInput {
  user_id?: string | number;
  branch_id?: string | number | null;
  role?: string | null;
  name?: string | null;
}

const CACHE_VERSION = 1;
export const OFFLINE_CASHIER_AUTH_TTL_MS = 12 * 60 * 60 * 1000;
const ALLOWED_CASHIER_ROLES = new Set(['Cashier', 'Admin', 'ShopAdmin', 'System Admin', 'Owner']);

export const createOfflineCashierAuthSnapshot = (
  profile: OfflineCashierAuthProfileInput,
  now = Date.now(),
): string | null => {
  const userId = profile.user_id;
  const branchId = Number(profile.branch_id);
  const role = String(profile.role || '');
  if (!userId || !Number.isSafeInteger(branchId) || branchId < 1 || !ALLOWED_CASHIER_ROLES.has(role)) return null;

  return JSON.stringify({
    version: CACHE_VERSION,
    cachedAt: now,
    profile: {
      user_id: String(userId),
      branch_id: branchId,
      role,
      ...(typeof profile.name === 'string' ? { name: profile.name } : {}),
    },
  });
};

export const readOfflineCashierAuthSnapshot = (
  raw: string | null,
  pathname: string,
  now = Date.now(),
): OfflineCashierAuthProfile | null => {
  if (!raw || !(pathname === '/cashier' || pathname.startsWith('/cashier/'))) return null;
  try {
    const parsed = JSON.parse(raw) as {
      version?: number;
      cachedAt?: number;
      profile?: Partial<OfflineCashierAuthProfile>;
    };
    const profile = parsed.profile;
    const age = now - Number(parsed.cachedAt);
    const branchId = Number(profile?.branch_id);
    const role = String(profile?.role || '');
    if (parsed.version !== CACHE_VERSION
      || !Number.isFinite(age)
      || age < 0
      || age > OFFLINE_CASHIER_AUTH_TTL_MS
      || !profile?.user_id
      || !Number.isSafeInteger(branchId)
      || branchId < 1
      || !ALLOWED_CASHIER_ROLES.has(role)) return null;
    return {
      user_id: String(profile.user_id),
      branch_id: branchId,
      role,
      ...(typeof profile.name === 'string' ? { name: profile.name } : {}),
    };
  } catch {
    return null;
  }
};
