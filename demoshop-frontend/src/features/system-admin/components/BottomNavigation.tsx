import React from 'react';
import {
    LayoutDashboard,
    Users,
    Sliders,
    Activity,
    Shield,
    Wrench,
    CreditCard,
    Package,
    Database,
} from 'lucide-react';
import { MobileBottomNavigation, type MobileNavItem } from '@/components/common/MobileBottomNavigation';
import { useFeatures } from '@/context/FeatureContext';

interface BottomNavigationProps {
    activeTab: string;
    setActiveTab: (tab: string) => void;
    handleLogout: () => void;
}

export const BottomNavigation: React.FC<BottomNavigationProps> = ({
    activeTab,
    setActiveTab,
    handleLogout,
}) => {
    const { hasAccess } = useFeatures();
    const canAccessPos = hasAccess('cashier_pos');
    const canAccessQueue = hasAccess('customer_queue');
    const canAccessInventory = hasAccess('inventory_management');

    // Layout: Accounts | Controls | [OVERVIEW] | Health | More
    const primaryItems: MobileNavItem[] = [
        {
            id: 'accounts',
            label: 'Accounts',
            icon: Users,
            isActive: activeTab === 'accounts',
        },
        {
            id: 'features',
            label: 'Controls',
            icon: Sliders,
            isActive: activeTab === 'features',
        },
        {
            id: 'overview',
            label: 'Overview',
            icon: LayoutDashboard,
            isCenter: true,
            ariaLabel: 'System Overview Dashboard',
            isActive: activeTab === 'overview',
        },
        {
            id: 'health',
            label: 'Health',
            icon: Activity,
            isActive: activeTab === 'health',
        },
    ];

    // Secondary destinations for System Admin overflow (RBAC filtered)
    const moreItems: MobileNavItem[] = [
        {
            id: 'audit',
            label: 'Audit Logs',
            icon: Shield,
            subLabel: 'Security, changes & admin activities',
            isActive: activeTab === 'audit',
        },
        {
            id: 'diagnostics',
            label: 'Diagnostics',
            icon: Wrench,
            subLabel: 'Connectivity, performance & tools',
            isActive: activeTab === 'diagnostics',
        },
        {
            id: 'database-traffic',
            label: 'Database & Traffic',
            icon: Database,
            subLabel: 'Query, pool & email activity',
            isActive: activeTab === 'database-traffic',
        },
    ];

    // Authorized operational shortcuts
    if (canAccessPos) {
        moreItems.push({
            id: 'operations-pos',
            label: 'Point of Sale',
            icon: CreditCard,
            subLabel: 'Front-desk cashier console',
            isActive: activeTab === 'operations-pos',
        });
    }
    if (canAccessQueue) {
        moreItems.push({
            id: 'operations-queue',
            label: 'Walk-in Queue',
            icon: Users,
            subLabel: 'Customer queue & waitlist',
            isActive: activeTab === 'operations-queue',
        });
    }
    if (canAccessInventory) {
        moreItems.push({
            id: 'operations-inventory',
            label: 'Inventory',
            icon: Package,
            subLabel: 'Stock & supplier management',
            isActive: activeTab === 'operations-inventory',
        });
    }

    return (
        <MobileBottomNavigation
            items={primaryItems}
            moreItems={moreItems}
            activeId={activeTab}
            centerActionId="overview"
            onSelectTab={setActiveTab}
            onLogout={handleLogout}
            moreTitle="System Admin Options"
            ariaLabel="System Admin navigation"
        />
    );
};

export default BottomNavigation;
