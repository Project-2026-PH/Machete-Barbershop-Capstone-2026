import type { SystemFeature } from '@demoshop/shared-types';

export type ProductArea = 'Customer' | 'Operations' | 'Staff' | 'System';

export interface FeatureAreaConfig {
  id: ProductArea;
  title: string;
  description: string;
}

export const FEATURE_AREAS: FeatureAreaConfig[] = [
  {
    id: 'Customer',
    title: 'Customer',
    description: 'Public booking, queue tracking, and customer portal tools.',
  },
  {
    id: 'Operations',
    title: 'Operations',
    description: 'Front-desk point of sale, staff rosters, and shop settings.',
  },
  {
    id: 'Staff',
    title: 'Staff',
    description: 'Barber station queue callers and warehouse inventory controls.',
  },
  {
    id: 'System',
    title: 'System',
    description: 'Platform authentication, audit trails, and control plane.',
  },
];

export const getFeatureProductArea = (feature: SystemFeature): ProductArea => {
  const id = feature.id.toLowerCase();
  if (id.startsWith('customer_') || id === 'public_shop') return 'Customer';
  if (id.startsWith('cashier_') || id.startsWith('shop_admin_')) return 'Operations';
  if (id.startsWith('barber_') || id === 'inventory_management') return 'Staff';
  if (id === 'auth' || id === 'sys_controls' || id === 'sys_admin' || id === 'audit_logging') return 'System';

  const cat = (feature.category || '').toLowerCase();
  if (cat.includes('customer')) return 'Customer';
  if (cat.includes('pos') || cat.includes('point of sale') || cat.includes('shop operations')) return 'Operations';
  if (cat.includes('barber') || cat.includes('inventory')) return 'Staff';
  if (cat.includes('core') || cat.includes('admin') || cat.includes('platform')) return 'System';

  return 'System';
};

export const FEATURE_ROUTES_MAP: Record<string, string[]> = {
  customer_booking: ['/book', '/customer'],
  customer_queue: ['/queue', '/customer'],
  customer_history: ['/history', '/customer'],
  public_shop: ['/shop'],
  cashier_pos: ['/cashier'],
  barber_workspace: ['/barber'],
  inventory_management: ['/inventory-manager', '/admin?tab=inventory'],
  shop_admin_roster: ['/admin?tab=staff'],
  shop_admin_reports: ['/admin?tab=reports'],
  shop_admin_settings: ['/admin?tab=settings'],
  auth: ['/login', '/register', '/api/auth'],
  sys_controls: ['/system-admin?tab=features'],
  sys_admin: ['/system-admin'],
  audit_logging: ['/system-admin?tab=audit'],
};

export const getFeatureRoutes = (featureId: string): string[] => {
  return FEATURE_ROUTES_MAP[featureId] || [`/${featureId.replace(/_/g, '-')}`];
};

export const getRoleDisplayName = (role: string): string => {
  if (role === 'System Admin') return 'Superadmin';
  return role;
};

export const formatAffectedRoles = (roles: string[]): string => {
  if (!roles || roles.length === 0) return 'No Roles Assigned';
  if (roles.length >= 7) return 'All Roles';
  if (roles.length === 1) return getRoleDisplayName(roles[0]);
  if (roles.length === 2) return `${getRoleDisplayName(roles[0])} · ${getRoleDisplayName(roles[1])}`;
  if (roles.length === 3) return `${getRoleDisplayName(roles[0])} · ${getRoleDisplayName(roles[1])} · ${getRoleDisplayName(roles[2])}`;
  return `${getRoleDisplayName(roles[0])} · ${getRoleDisplayName(roles[1])} + ${roles.length - 2} more`;
};
