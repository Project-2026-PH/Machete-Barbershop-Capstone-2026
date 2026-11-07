import { UserRole } from '@demoshop/shared-types';
import logger from '../../utils/general/logger';

export interface AuthoritativeUserContext {
  userId: string;
  role: UserRole | string;
  branchId?: number | null;
  customerId?: number | null;
  barberId?: number | null;
}

export interface QueueEntryAuthorizationTarget {
  id: number;
  branch_id?: number | null;
  customer_id?: number | null;
  barber_id?: number | null;
  [key: string]: any;
}

export type QueueMutation = 'cancel' | 'complete' | 'check-in' | 'no-show' | 'edit-order';

export class QueuePolicy {
  private static isGlobalRole(role: UserRole | string): boolean {
    return role === UserRole.SYSTEM_ADMIN || role === UserRole.OWNER || role === 'SystemAdmin';
  }

  private static isBranchStaffRole(role: UserRole | string): boolean {
    return role === UserRole.ADMIN || role === UserRole.SHOP_ADMIN || role === UserRole.CASHIER || role === 'Shop Admin';
  }

  private static hasMatchingBranch(userBranchId: number | null | undefined, targetBranchId: number | null | undefined): boolean {
    if (userBranchId === null || userBranchId === undefined || targetBranchId === null || targetBranchId === undefined) {
      return false;
    }

    const normalizedUserBranchId = Number(userBranchId);
    const normalizedTargetBranchId = Number(targetBranchId);
    if (!Number.isInteger(normalizedUserBranchId) || normalizedUserBranchId <= 0
      || !Number.isInteger(normalizedTargetBranchId) || normalizedTargetBranchId <= 0) {
      return false;
    }

    return normalizedUserBranchId === normalizedTargetBranchId;
  }

  /**
   * Authorizes reading a queue entry.
   * System Admin / Owner: allowed across all branches.
   * Admin / ShopAdmin / Cashier: strictly requires branch_id match.
   * Barber: strictly requires branch_id and barber_id match.
   * Customer: strictly requires customer_id match.
   */
  static authorizeRead(
    user: AuthoritativeUserContext,
    entry: QueueEntryAuthorizationTarget
  ): boolean {
    if (!user || !entry) return false;

    const role = user.role;

    if (this.isGlobalRole(role)) {
      return true;
    }

    if (this.isBranchStaffRole(role)) {
      return this.hasMatchingBranch(user.branchId, entry.branch_id);
    }

    if (role === UserRole.BARBER) {
      const isBarberMatch = user.barberId !== null
        && user.barberId !== undefined
        && entry.barber_id !== null
        && entry.barber_id !== undefined
        && Number(user.barberId) === Number(entry.barber_id);
      const isBranchMatch = this.hasMatchingBranch(user.branchId, entry.branch_id)
        || user.branchId === null
        || user.branchId === undefined
        || entry.branch_id === null
        || entry.branch_id === undefined;
      return isBarberMatch && isBranchMatch;
    }

    if (role === UserRole.CUSTOMER) {
      return user.customerId !== null
        && user.customerId !== undefined
        && entry.customer_id !== null
        && entry.customer_id !== undefined
        && Number(user.customerId) === Number(entry.customer_id);
    }

    return false;
  }

  /**
   * Authorizes access to a barber lane before a list or lane mutation is run.
   * Customer access is checked separately by the service against their active entry.
   */
  static authorizeBarberQueue(
    user: AuthoritativeUserContext,
    barberId: number,
    branchId: number | null | undefined,
  ): boolean {
    if (!user || !Number.isInteger(Number(barberId)) || Number(barberId) <= 0) return false;

    if (this.isGlobalRole(user.role)) {
      return true;
    }

    if (this.isBranchStaffRole(user.role)) {
      return this.hasMatchingBranch(user.branchId, branchId);
    }

    if (user.role === UserRole.BARBER) {
      const isBarberMatch = user.barberId !== null
        && user.barberId !== undefined
        && Number(user.barberId) === Number(barberId);
      const isBranchMatch = this.hasMatchingBranch(user.branchId, branchId)
        || user.branchId === null
        || user.branchId === undefined
        || branchId === null
        || branchId === undefined;
      return isBarberMatch && isBranchMatch;
    }

    return false;
  }

  /**
   * Authorizes a queue-entry mutation after the entry has been loaded.
   * Customers can cancel only their own entry. Staff are branch-scoped.
   * Barbers may mutate only their own lane for the explicitly supported actions.
   */
  static authorizeMutation(
    user: AuthoritativeUserContext,
    entry: QueueEntryAuthorizationTarget,
    mutation: QueueMutation,
  ): boolean {
    if (!user || !entry) return false;

    if (this.isGlobalRole(user.role)) {
      return true;
    }

    if (this.isBranchStaffRole(user.role)) {
      return this.hasMatchingBranch(user.branchId, entry.branch_id);
    }

    if (user.role === UserRole.BARBER) {
      return mutation !== 'cancel'
        && this.hasMatchingBranch(user.branchId, entry.branch_id)
        && user.barberId !== null
        && user.barberId !== undefined
        && entry.barber_id !== null
        && entry.barber_id !== undefined
        && Number(user.barberId) === Number(entry.barber_id);
    }

    if (user.role === UserRole.CUSTOMER && mutation === 'cancel') {
      return user.customerId !== null
        && user.customerId !== undefined
        && entry.customer_id !== null
        && entry.customer_id !== undefined
        && Number(user.customerId) === Number(entry.customer_id);
    }

    return false;
  }

  /**
   * Sanitizes a single queue entry for customer consumption.
   */
  static sanitizeForCustomer(entry: Record<string, any>): Record<string, any> {
    if (!entry) return entry;
    const {
      offline_idempotency_key,
      guest_profile_id,
      internal_notes,
      payment_attempt_id,
      cashier_session_id,
      ...safeEntry
    } = entry;
    return safeEntry;
  }

  /**
   * Returns only the fields required to calculate a customer's queue position.
   * Names, guest references, service details, and haircut photos are staff-only.
   */
  static sanitizeQueueListForCustomer(entries: Array<Record<string, any>>): Array<Record<string, any>> {
    const allowedFields = [
      'id',
      'position',
      'status',
      'duration_minutes',
      'timer_started_at',
      'service_started_at',
      'service_ends_at',
      'is_walk_in',
      'scheduled_start_at',
      'barber_status',
      'barber_break_started_at',
      'estimated_start_at',
      'schedule_delay_minutes',
    ];

    return entries.map((entry) => Object.fromEntries(
      allowedFields
        .filter((field) => Object.prototype.hasOwnProperty.call(entry, field))
        .map((field) => [field, entry[field]]),
    ));
  }
}
