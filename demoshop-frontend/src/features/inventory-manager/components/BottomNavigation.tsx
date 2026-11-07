import React from 'react';
import {
    Package,
    ClipboardCheck,
    SprayCan,
    ClipboardList,
    Clock,
    FileText,
    Wine,
    FileImage,
} from 'lucide-react';
import { MobileBottomNavigation, type MobileNavItem } from '@/components/common/MobileBottomNavigation';

interface BottomNavigationProps {
    activeTab: 'stock' | 'lifecycle' | 'purchase-orders' | 'forecast' | 'profile';
    activeSubTab?: string;
    onNavigate: (path: string) => void;
    handleLogout: () => void;
}

export const BottomNavigation: React.FC<BottomNavigationProps> = ({
    activeTab,
    activeSubTab = 'overview',
    onNavigate,
    handleLogout,
}) => {
    // Layout: Count | Handouts | [STOCK] | Orders | More
    const primaryItems: MobileNavItem[] = [
        {
            id: 'stock-count',
            label: 'Count',
            icon: ClipboardCheck,
            isActive: activeTab === 'stock' && activeSubTab === 'stock-count',
            onClick: () => onNavigate('/inventory-manager/stock-count'),
        },
        {
            id: 'lifecycle',
            label: 'Handouts',
            icon: SprayCan,
            isActive: activeTab === 'lifecycle' && (activeSubTab === 'tracker' || !activeSubTab),
            onClick: () => onNavigate('/inventory-manager/lifecycle'),
        },
        {
            id: 'stock',
            label: 'Stock',
            icon: Package,
            isCenter: true,
            ariaLabel: 'Main Stock Inventory Workspace',
            isActive: activeTab === 'stock' && (activeSubTab === 'overview' || !activeSubTab),
            onClick: () => onNavigate('/inventory-manager'),
        },
        {
            id: 'purchase-orders',
            label: 'Orders',
            icon: ClipboardList,
            isActive: activeTab === 'purchase-orders' && (activeSubTab === 'po-create' || !activeSubTab),
            onClick: () => onNavigate('/inventory-manager/purchase-orders'),
        },
    ];

    // Secondary destinations for Inventory Manager
    const moreItems: MobileNavItem[] = [
        {
            id: 'daily-report',
            label: 'Daily Report',
            icon: FileText,
            subLabel: 'Daily inventory snapshot and variance',
            isActive: activeTab === 'stock' && activeSubTab === 'daily-report',
            onClick: () => onNavigate('/inventory-manager/daily-report'),
        },
        {
            id: 'expirable',
            label: 'Expirable Stock',
            icon: Clock,
            subLabel: 'Batch monitoring and expired unit disposal',
            isActive: activeTab === 'stock' && activeSubTab === 'expirable',
            onClick: () => onNavigate('/inventory-manager/expirable'),
        },
        {
            id: 'consumption',
            label: 'Consumption',
            icon: Wine,
            subLabel: 'Track empty bottle returns and customers served',
            isActive: activeTab === 'lifecycle' && activeSubTab === 'consumption',
            onClick: () => onNavigate('/inventory-manager/lifecycle/consumption'),
        },
        {
            id: 'po-status',
            label: 'Order Status',
            icon: ClipboardCheck,
            subLabel: 'Review active and delivered purchase orders',
            isActive: activeTab === 'purchase-orders' && activeSubTab === 'po-status',
            onClick: () => onNavigate('/inventory-manager/purchase-orders/status'),
        },
        {
            id: 'po-receipts',
            label: 'Receipt Evidence',
            icon: FileImage,
            subLabel: 'Upload proof of delivery and payment receipts',
            isActive: activeTab === 'purchase-orders' && activeSubTab === 'po-receipts',
            onClick: () => onNavigate('/inventory-manager/purchase-orders/receipts'),
        },
    ];

    return (
        <MobileBottomNavigation
            items={primaryItems}
            moreItems={moreItems}
            centerActionId="stock"
            onLogout={handleLogout}
            moreTitle="Inventory Manager Options"
            ariaLabel="Inventory Manager workspace navigation"
        />
    );
};

export default BottomNavigation;
