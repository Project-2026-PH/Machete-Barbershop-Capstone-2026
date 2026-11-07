import React from 'react';
import {
    LayoutDashboard,
    Banknote,
    Users,
    TrendingUp,
    User,
    CalendarDays,
    type LucideIcon,
} from 'lucide-react';
import { MobileBottomNavigation, type MobileNavItem } from '@/components/common/MobileBottomNavigation';

interface BottomNavigationProps {
    activeTab: string;
    setActiveTab: (tab: string) => void;
    handleLogout?: () => void;
    pendingCount?: number;
    navItems?: Array<{
        tab?: string;
        id?: string;
        label: string;
        icon: LucideIcon;
        badge?: number;
        isCenter?: boolean;
    }>;
}

export const BottomNavigation: React.FC<BottomNavigationProps> = ({
    activeTab,
    setActiveTab,
    handleLogout,
    pendingCount = 0,
    navItems: propNavItems,
}) => {
    // 4 Surrounding + 1 Center Primary = 5-slot layout
    // Home | Queue | [POS] | Today's Sales | More
    const primaryItems: MobileNavItem[] = [
        {
            id: 'overview',
            label: 'Home',
            icon: LayoutDashboard,
            isActive: activeTab === 'overview',
        },
        {
            id: 'queue',
            label: 'Queue',
            icon: CalendarDays,
            badge: pendingCount,
            isActive: activeTab === 'queue',
        },
        {
            id: 'pos',
            label: 'POS',
            icon: Banknote,
            isCenter: true,
            ariaLabel: 'Point of Sale Terminal',
            isActive: activeTab === 'pos',
        },
        {
            id: 'sale-today',
            label: "Today's Sales",
            icon: TrendingUp,
            isActive: activeTab === 'sale-today',
        },
    ];

    // Secondary items under More
    const moreItems: MobileNavItem[] = [
        {
            id: 'customers-served',
            label: 'Customers Served',
            icon: Users,
            subLabel: 'Historical records of serviced clients',
            isActive: activeTab === 'customers-served',
        },
        {
            id: 'profile',
            label: 'Staff Profile',
            icon: User,
            subLabel: 'View profile credentials and active shift',
            isActive: activeTab === 'profile',
        },
    ];

    return (
        <MobileBottomNavigation
            items={primaryItems}
            moreItems={moreItems}
            activeId={activeTab}
            centerActionId="pos"
            onSelectTab={setActiveTab}
            onLogout={handleLogout}
            moreTitle="Cashier Console Options"
            ariaLabel="Cashier workspace navigation"
        />
    );
};

export default BottomNavigation;
