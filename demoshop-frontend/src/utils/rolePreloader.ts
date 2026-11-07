export const LAST_ROLE_STORAGE_KEY = 'demoshop:last_role';

/**
 * Preload only the specified role's dashboard chunk.
 * Prevents 3G network saturation by strictly loading 1 bundle on-demand instead of all 5 simultaneously.
 */
export function preloadRoleDashboard(role?: string | null): void {
  if (!role) return;

  switch (role) {
    case 'Cashier':
      import('@/features/cashier/CashierDashboard').catch(() => {});
      break;
    case 'Inventory Manager':
      import('@/features/inventory-manager/InventoryManagerDashboard').catch(() => {});
      break;
    case 'Barber':
      import('@/features/barber/BarberDashboard').catch(() => {});
      break;
    case 'Admin':
    case 'ShopAdmin':
    case 'Owner':
      import('@/layouts/AdminLayout').catch(() => {});
      import('@/features/admin/AdminDashboard').catch(() => {});
      break;
    case 'System Admin':
    case 'SystemAdmin':
      import('@/layouts/AdminLayout').catch(() => {});
      import('@/features/system-admin/Dashboard').catch(() => {});
      break;
    case 'Customer':
      import('@/features/customer/Dashboard').catch(() => {});
      break;
    default:
      break;
  }
}

/**
 * Preloads the remembered device role during idle time on login page.
 */
export function preloadRememberedRoleDashboard(): void {
  try {
    const rememberedRole = localStorage.getItem(LAST_ROLE_STORAGE_KEY);
    if (rememberedRole) {
      preloadRoleDashboard(rememberedRole);
    }
  } catch {
    // Ignore storage read errors in restricted contexts
  }
}
