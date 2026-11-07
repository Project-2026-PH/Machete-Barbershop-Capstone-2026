import React from 'react';
import { History, TrendingUp, CalendarClock, Scissors, User } from 'lucide-react';
import { MobileBottomNavigation, type MobileNavItem } from '@/components/common/MobileBottomNavigation';

interface BottomNavigationProps {
    activeTab: string;
    setActiveTab: (tab: string) => void;
    handleLogout?: () => void;
    onOpenProfile?: () => void;
}

export const BottomNavigation: React.FC<BottomNavigationProps> = ({
    activeTab,
    setActiveTab,
    handleLogout,
    onOpenProfile,
}) => {
    // Layout: History | Performance | [QUEUE] | Schedule | More
    const primaryItems: MobileNavItem[] = [
        {
            id: 'history',
            label: 'History',
            icon: History,
            isActive: activeTab === 'history',
            onClick: () => setActiveTab('history'),
        },
        {
            id: 'profile',
            label: 'Portfolio',
            icon: TrendingUp,
            isActive: activeTab === 'profile',
            onClick: () => setActiveTab('profile'),
        },
        {
            id: 'queue',
            label: 'Queue',
            icon: Scissors,
            isCenter: true,
            ariaLabel: 'Barber Queue Management',
            isActive: activeTab === 'queue',
            onClick: () => setActiveTab('queue'),
        },
        {
            id: 'status',
            label: 'Schedule',
            icon: CalendarClock,
            isActive: activeTab === 'status',
            onClick: () => setActiveTab('status'),
        },
    ];

    // Secondary items under More (Profile, Switch Module for Superadmin, and Log Out)
    const moreItems: MobileNavItem[] = [
        {
            id: 'account-profile',
            label: 'Barber Profile',
            icon: User,
            subLabel: 'Barber profile picture, credentials & account settings',
            isActive: activeTab === 'account-profile',
            onClick: () => (onOpenProfile ? onOpenProfile() : setActiveTab('account-profile')),
        },
    ];

    return (
        <MobileBottomNavigation
            items={primaryItems}
            moreItems={moreItems}
            activeId={activeTab}
            centerActionId="queue"
            onSelectTab={setActiveTab}
            onLogout={handleLogout}
            moreTitle="Barber Options"
            ariaLabel="Barber workspace navigation"
        />
    );
};

export default BottomNavigation;
