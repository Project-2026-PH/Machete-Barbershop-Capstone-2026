import { useMemo } from 'react';
import { Shield, LayoutDashboard, Store, Package, Scissors, Users, type LucideIcon } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthContext';

export interface SystemModule {
    id: 'system-admin' | 'admin' | 'cashier' | 'inventory-manager' | 'barber' | 'customer';
    label: string;
    path: string;
    icon: LucideIcon;
    description: string;
}

/**
 * useAvailableModules - Centralized Single Source of Truth for cross-module access.
 * 
 * Computes available modules strictly from the authenticated account's real identity,
 * role, and effective platform permissions. The user's currently viewed workspace
 * never influences their authorized module list.
 */
export const useAvailableModules = () => {
    const { user, role, isSystemAdmin } = useAuth();

    const isSuperAdmin = useMemo(() => {
        if (!user) return false;
        const normalizedRole = role || user.role;
        return Boolean(
            isSystemAdmin ||
            normalizedRole === 'System Admin' ||
            normalizedRole === 'SystemAdmin'
        );
    }, [user, role, isSystemAdmin]);

    const availableModules = useMemo((): SystemModule[] => {
        if (!user) return [];

        if (isSuperAdmin) {
            return [
                {
                    id: 'system-admin',
                    label: 'System Admin',
                    path: '/system-admin/dashboard',
                    icon: Shield,
                    description: 'Superadmin platform controls, diagnostics & audit logs',
                },
                {
                    id: 'admin',
                    label: 'Shop Admin',
                    path: '/admin',
                    icon: LayoutDashboard,
                    description: 'Storefront operations, staff directory, reports & settings',
                },
                {
                    id: 'cashier',
                    label: 'Cashier',
                    path: '/cashier',
                    icon: Store,
                    description: 'Front-desk point of sale, queue ticketing & daily sales',
                },
                {
                    id: 'inventory-manager',
                    label: 'Inventory Manager',
                    path: '/inventory-manager',
                    icon: Package,
                    description: 'Consumables, purchase order approvals & retail stock',
                },
                {
                    id: 'barber',
                    label: 'Barber',
                    path: '/barber',
                    icon: Scissors,
                    description: 'Chair station queue, client haircut history & shift schedule',
                },
                {
                    id: 'customer',
                    label: 'Customer',
                    path: '/dashboard',
                    icon: Users,
                    description: 'Client appointments, reservation queue & haircut history',
                },
            ];
        }

        const normalizedRole = role || user.role;
        if (normalizedRole === 'Cashier' && user?.can_access_inventory) {
            return [
                {
                    id: 'cashier',
                    label: 'Cashier',
                    path: '/cashier',
                    icon: Store,
                    description: 'Front-desk point of sale, queue ticketing & daily sales',
                },
                {
                    id: 'inventory-manager',
                    label: 'Inventory Manager',
                    path: '/inventory-manager',
                    icon: Package,
                    description: 'Consumables, purchase order approvals & retail stock',
                },
            ];
        }

        return [];
    }, [user, role, isSuperAdmin]);

    return {
        availableModules,
        hasMultipleModules: availableModules.length > 1,
        isSuperAdmin,
    };
};
