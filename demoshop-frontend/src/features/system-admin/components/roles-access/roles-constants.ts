import type { SystemFeature } from '@demoshop/shared-types';
import type { SystemRole } from '../../utils/feature-compatibility';

export type AccessFilterType = 'all' | 'available' | 'restricted' | 'unavailable' | 'system_managed';

export const ROLE_PURPOSES: Record<string, string> = {
  'System Admin': 'Full system access',
  'Owner': 'Business management',
  'Shop Admin': 'Branch administration',
  'Cashier': 'Point-of-sale operations',
  'Inventory Manager': 'Inventory & stock',
  'Barber': 'Barber operations',
  'Customer': 'Customer services',
};

export type EffectiveRoleAccessState = 'available' | 'restricted' | 'unavailable' | 'system_managed';

export const getEffectiveRoleAccessState = (
  feature: SystemFeature,
  role: SystemRole,
  isLocked: boolean
): EffectiveRoleAccessState => {
  if (isLocked) return 'system_managed';
  if (feature.status !== 'ENABLED') return 'unavailable';
  if (feature.affected_roles.includes(role)) return 'available';
  return 'restricted';
};
