import React from 'react';
import {
    BarChart3,
    Calendar,
    ClipboardCheck,
    LayoutDashboard,
    Settings,
    Sliders,
    Package,
} from 'lucide-react';
import { MobileBottomNavigation, type MobileNavItem } from '@/components/common/MobileBottomNavigation';

interface BottomNavigationProps {
    activeTab: string;
    activeSubTab?: string;
    setActiveTab: (tab: string, subTab?: string) => void;
    handleLogout?: () => void;
    pendingShiftRequests?: number;
    pendingPurchaseOrders?: number;
    pendingAppointments?: number;
}

export const BottomNavigation: React.FC<BottomNavigationProps> = ({
    activeTab,
    activeSubTab = 'staff',
    setActiveTab,
    handleLogout,
    pendingShiftRequests = 0,
    pendingPurchaseOrders = 0,
    pendingAppointments = 0,
}) => {
    // Primary items: Stock | Orders | Home | Reports | More
    const primaryItems: MobileNavItem[] = [
        {
            id: 'inventory',
            label: 'Stock',
            icon: Package,
            ariaLabel: 'Stock and Inventory',
            isActive: activeTab === 'inventory',
            onClick: () => setActiveTab('inventory', activeSubTab === 'retails' || activeSubTab === 'suppliers' ? activeSubTab : 'consumables'),
        },
        {
            id: 'purchase-orders',
            label: 'Orders',
            icon: ClipboardCheck,
            badge: pendingPurchaseOrders,
            isActive: activeTab === 'purchase-orders',
            onClick: () => setActiveTab('purchase-orders', activeSubTab || 'awaiting-approval'),
        },
        {
            id: 'dashboard',
            label: 'Home',
            icon: LayoutDashboard,
            ariaLabel: 'Shop Admin Dashboard Home',
            isActive: activeTab === 'dashboard',
            onClick: () => setActiveTab('dashboard'),
        },
        {
            id: 'reports',
            label: 'Reports',
            icon: BarChart3,
            isActive: activeTab === 'reports',
            onClick: () => setActiveTab('reports', activeSubTab || 'transactions'),
        },
    ];

    const moreItems: MobileNavItem[] = [
        {
            id: 'appointments',
            label: 'Reservations',
            icon: Calendar,
            badge: pendingAppointments,
            subLabel: 'Reservation approvals & deposit review',
            isActive: activeTab === 'appointments',
            onClick: () => setActiveTab('appointments'),
        },
        {
            id: 'management',
            label: 'Manage',
            icon: Sliders,
            badge: pendingShiftRequests,
            subLabel: 'Staff Directory, Shifts & Services Menu',
            isActive: activeTab === 'management',
            onClick: () => setActiveTab('management', activeSubTab || 'staff'),
        },
        {
            id: 'settings',
            label: 'Configuration',
            icon: Settings,
            subLabel: 'General, Hours, Payments & Storefront',
            isActive: activeTab === 'settings',
            onClick: () => setActiveTab('settings'),
        },
    ];

    return (
        <MobileBottomNavigation
            items={primaryItems}
            moreItems={moreItems}
            activeId={activeTab}
            onLogout={handleLogout}
            moreTitle="Shop Admin Options"
            ariaLabel="Shop Admin workspace navigation"
        />
    );
};

export default BottomNavigation;
