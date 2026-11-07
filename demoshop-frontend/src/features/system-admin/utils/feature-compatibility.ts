/**
 * Feature Compatibility & Role Access Specification
 * 
 * Defines the real technical compatibility boundaries for all 14 verified
 * system features across the 7 verified system roles.
 * 
 * Rules:
 * - 'locked': Core governance feature role that cannot be revoked (security/recovery requirement).
 * - 'unavailable': Incompatible role. Cannot be assigned without architectural changes. Tooltip explains why.
 * - 'compatible': Fully supported by existing routes, controllers, and database models. Can be toggled Allowed / Denied.
 */

export type RoleAccessState = 'LOCKED' | 'UNAVAILABLE' | 'ALLOWED' | 'DENIED';

export interface RoleCompatibilityInfo {
  isLocked?: boolean;
  lockReason?: string;
  isUnavailable?: boolean;
  unavailableReason?: string;
}

export const SYSTEM_ROLES = [
  'System Admin',
  'Owner',
  'Shop Admin',
  'Cashier',
  'Barber',
  'Inventory Manager',
  'Customer',
] as const;

export type SystemRole = (typeof SYSTEM_ROLES)[number];

export const FEATURE_ROLE_RULES: Record<string, Partial<Record<SystemRole, RoleCompatibilityInfo>>> = {
  // 1. Core Platform (Locked)
  auth: {
    'System Admin': { isLocked: true, lockReason: 'Superuser authentication is mandatory for system recovery.' },
    'Owner': { isLocked: true, lockReason: 'Executive proprietor access requires active authentication.' },
    'Shop Admin': { isLocked: true, lockReason: 'Branch management accounts require active authentication.' },
    'Cashier': { isLocked: true, lockReason: 'Front-desk staff accounts require active authentication.' },
    'Barber': { isLocked: true, lockReason: 'Stylist station staff accounts require active authentication.' },
    'Inventory Manager': { isLocked: true, lockReason: 'Warehouse stock accounts require active authentication.' },
    'Customer': { isLocked: true, lockReason: 'Client consumer accounts require active authentication.' },
  },

  sys_controls: {
    'System Admin': { isLocked: true, lockReason: 'System Controls is the emergency platform governance tool and must remain restricted to System Admin.' },
    'Owner': { isUnavailable: true, unavailableReason: 'System Controls control plane is reserved strictly for System Admin superusers.' },
    'Shop Admin': { isUnavailable: true, unavailableReason: 'Branch administrators do not manage platform-level feature flags.' },
    'Cashier': { isUnavailable: true, unavailableReason: 'Front-desk cashiers do not have system administration privileges.' },
    'Barber': { isUnavailable: true, unavailableReason: 'Station staff accounts do not manage platform infrastructure.' },
    'Inventory Manager': { isUnavailable: true, unavailableReason: 'Warehouse stock staff do not manage platform infrastructure.' },
    'Customer': { isUnavailable: true, unavailableReason: 'Customer accounts cannot access platform controls.' },
  },

  sys_admin: {
    'System Admin': { isLocked: true, lockReason: 'Platform management console is strictly reserved for System Admin superusers.' },
    'Owner': { isUnavailable: true, unavailableReason: 'Executive owners access the Shop Admin dashboard; System Admin console is reserved for platform engineering.' },
    'Shop Admin': { isUnavailable: true, unavailableReason: 'Shop Admins manage branch operations, not platform superuser accounts.' },
    'Cashier': { isUnavailable: true, unavailableReason: 'Cashier accounts cannot access superuser tools.' },
    'Barber': { isUnavailable: true, unavailableReason: 'Barber accounts cannot access superuser tools.' },
    'Inventory Manager': { isUnavailable: true, unavailableReason: 'Inventory Manager accounts cannot access superuser tools.' },
    'Customer': { isUnavailable: true, unavailableReason: 'Customer accounts cannot access superuser tools.' },
  },

  audit_logging: {
    'System Admin': { isLocked: true, lockReason: 'Security audit trail inspection is required for platform compliance.' },
    'Owner': { isLocked: true, lockReason: 'Business owners hold fiduciary oversight and cannot have audit trail access revoked.' },
    'Shop Admin': { isUnavailable: true, unavailableReason: 'Immutable security audit trails are restricted to platform engineering and ownership.' },
    'Cashier': { isUnavailable: true, unavailableReason: 'Cashiers cannot inspect security audit event logs.' },
    'Barber': { isUnavailable: true, unavailableReason: 'Barbers cannot inspect security audit event logs.' },
    'Inventory Manager': { isUnavailable: true, unavailableReason: 'Inventory Managers cannot inspect security audit logs.' },
    'Customer': { isUnavailable: true, unavailableReason: 'Security audit logs are confidential system data.' },
  },

  // 2. Customer Experience
  customer_booking: {},

  customer_queue: {
    'System Admin': { isUnavailable: true, unavailableReason: 'Virtual Queue Card is designed for customer smartphone ticket tracking. Staff monitor queues via POS or Barber Station.' },
    'Owner': { isUnavailable: true, unavailableReason: 'Virtual queue ticket tracking is designed for customer smartphones.' },
    'Shop Admin': { isUnavailable: true, unavailableReason: 'Shop Admins monitor queue operations via the shop dashboard.' },
    'Cashier': { isUnavailable: true, unavailableReason: 'Cashiers manage queue entries via the POS register interface.' },
    'Barber': { isUnavailable: true, unavailableReason: 'Barbers call and advance queues from the Barber Station workspace.' },
    'Inventory Manager': { isUnavailable: true, unavailableReason: 'Stock managers do not track queue tickets.' },
  },

  customer_history: {
    'System Admin': { isUnavailable: true, unavailableReason: 'Customer visit history is tied to customer account records. Staff view transactions via Shop Admin Reports or Cashier register.' },
    'Owner': { isUnavailable: true, unavailableReason: 'Customer visit history is tied to customer account records. Proprietors view sales via Reports.' },
    'Shop Admin': { isUnavailable: true, unavailableReason: 'Shop Admins inspect customer visit history via the Admin Customer Directory.' },
    'Cashier': { isUnavailable: true, unavailableReason: 'Cashiers view customer receipts and past visits via the POS lookup.' },
    'Barber': { isUnavailable: true, unavailableReason: 'Barbers inspect their chair customer history in the Barber workspace.' },
    'Inventory Manager': { isUnavailable: true, unavailableReason: 'Stock managers do not inspect customer visit logs.' },
  },

  public_shop: {},

  // 3. Point of Sale
  cashier_pos: {
    'Customer': { isUnavailable: true, unavailableReason: 'Point of Sale checkout requires front-desk register sessions, physical cash drawer tallies, and staff payment processing.' },
    'Barber': { isUnavailable: true, unavailableReason: 'Barber accounts do not have cash register sessions or drawer reconciliation permissions.' },
    'Inventory Manager': { isUnavailable: true, unavailableReason: 'Inventory Manager role is scoped to stockroom and does not handle front-desk checkout.' },
  },

  // 4. Barber Station
  barber_workspace: {
    'Customer': { isUnavailable: true, unavailableReason: 'Barber station requires stylist credentials, chair status controls, and cutting queue caller.' },
    'Cashier': { isUnavailable: true, unavailableReason: 'Front-desk cashier accounts do not operate cutting chair stations.' },
    'Inventory Manager': { isUnavailable: true, unavailableReason: 'Inventory Manager accounts cannot operate barber cutting stations.' },
  },

  // 5. Inventory
  inventory_management: {
    'Customer': { isUnavailable: true, unavailableReason: 'Inventory & stock control is strictly restricted to staff operations.' },
    'Barber': { isUnavailable: true, unavailableReason: 'Barbers do not handle stock replenishment, consumable audits, or supplier orders.' },
  },

  // 6. Shop Operations
  shop_admin_roster: {
    'Customer': { isUnavailable: true, unavailableReason: 'Staff rostering requires administrative staff management credentials.' },
    'Cashier': { isUnavailable: true, unavailableReason: 'Roster management and shift planning are reserved for branch managers.' },
    'Barber': { isUnavailable: true, unavailableReason: 'Barbers view assigned shifts on their personal calendar; full roster editing requires manager access.' },
    'Inventory Manager': { isUnavailable: true, unavailableReason: 'Staff scheduling is managed by branch operations.' },
  },

  shop_admin_reports: {
    'Customer': { isUnavailable: true, unavailableReason: 'Financial sales and barber commission summaries are confidential business reports.' },
    'Cashier': { isUnavailable: true, unavailableReason: 'Daily drawer counts are recorded in POS; aggregate commission reports are reserved for management.' },
    'Barber': { isUnavailable: true, unavailableReason: 'Barbers inspect personal earnings; aggregate shop financials require manager authorization.' },
    'Inventory Manager': { isUnavailable: true, unavailableReason: 'Financial sales reports are restricted to branch administrators and owners.' },
  },

  shop_admin_settings: {
    'Customer': { isUnavailable: true, unavailableReason: 'Branch operating hours, chairs setup, and shop policies require administrative authorization.' },
    'Cashier': { isUnavailable: true, unavailableReason: 'Shop configuration is reserved for branch managers and owners.' },
    'Barber': { isUnavailable: true, unavailableReason: 'Shop configuration is reserved for branch managers and owners.' },
    'Inventory Manager': { isUnavailable: true, unavailableReason: 'Shop configuration is reserved for branch managers and owners.' },
  },
};

/**
 * Computes the role access state for a given feature and role.
 */
export function getRoleAccessState(
  featureId: string,
  role: SystemRole,
  affectedRoles: string[]
): {
  state: RoleAccessState;
  reason?: string;
  isEditable: boolean;
} {
  const rule = FEATURE_ROLE_RULES[featureId]?.[role];

  if (rule?.isLocked) {
    return {
      state: 'LOCKED',
      reason: rule.lockReason || 'Core system component required for platform stability.',
      isEditable: false,
    };
  }

  if (rule?.isUnavailable) {
    return {
      state: 'UNAVAILABLE',
      reason: rule.unavailableReason || 'Feature implementation is not compatible with this role.',
      isEditable: false,
    };
  }

  const isAllowed = affectedRoles.includes(role);
  return {
    state: isAllowed ? 'ALLOWED' : 'DENIED',
    isEditable: true,
  };
}
