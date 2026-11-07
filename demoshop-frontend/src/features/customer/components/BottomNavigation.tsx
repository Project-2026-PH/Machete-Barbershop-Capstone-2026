import React from 'react';
import { Calendar, Scissors, History, Settings, Users, LogOut } from 'lucide-react';
import { MobileBottomNavigation, type MobileNavItem } from '@/components/common/MobileBottomNavigation';

interface BottomNavigationProps {
    activeTab: string;
    setActiveTab: (tab: string) => void;
    activeQueue: any;
    onLogout: () => void;
}

export const BottomNavigation: React.FC<BottomNavigationProps> = ({
    activeTab,
    setActiveTab,
    activeQueue,
    onLogout,
}) => {
    // Helper to determine if settings is active (includes payments)
    const isSettingsActive = ['settings', 'payments'].includes(activeTab);

    // Canonical 5 Customer destinations
    const navItems: MobileNavItem[] = [
        {
            id: 'overview',
            label: 'Overview',
            icon: Calendar,
            isActive: activeTab === 'overview',
            onClick: () => setActiveTab('overview'),
        },
        {
            id: 'history',
            label: 'History',
            icon: History,
            isActive: activeTab === 'history',
            onClick: () => setActiveTab('history'),
        },
        // Dynamically swap center button based on active reservation
        activeQueue
            ? {
                id: 'queue',
                label: 'Queue',
                icon: Users,
                isCenter: true,
                badgeDot: true,
                ariaLabel: 'Active Waitlist Queue',
                isActive: activeTab === 'queue',
                onClick: () => setActiveTab('queue'),
            }
            : {
                id: 'book',
                label: 'Book',
                icon: Scissors,
                isCenter: true,
                ariaLabel: 'Book Appointment or Queue',
                isActive: activeTab === 'book',
                onClick: () => setActiveTab('book'),
            },
        {
            id: 'settings',
            label: 'Settings',
            icon: Settings,
            isActive: isSettingsActive,
            onClick: () => setActiveTab('settings'),
        },
        {
            id: 'logout',
            label: 'Logout',
            icon: LogOut,
            isDestructive: true,
            onClick: onLogout,
        },
    ];

    return (
        <MobileBottomNavigation
            items={navItems}
            activeId={activeTab}
            activeQueueBadge={Boolean(activeQueue)}
            centerActionId={activeQueue ? 'queue' : 'book'}
            onSelectTab={setActiveTab}
            onLogout={onLogout}
            ariaLabel="Customer dashboard navigation"
        />
    );
};

export default BottomNavigation;
