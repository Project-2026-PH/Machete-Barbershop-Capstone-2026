import React, { useState, Suspense, lazy } from 'react';
import { useAuth } from '@/components/auth/AuthContext';
import { LogoutModal } from '@/components/common/LogoutModal';

import { BarberSidebar } from './components/BarberSidebar';
import { BottomNavigation } from './components/BottomNavigation';
import NotificationBell, { type AppNotification } from '@/components/common/NotificationBell';
import { NotificationDetailModal } from '@/components/common/NotificationDetailModal';
import { BarberProfileModal } from './components/modals/BarberProfileModal';
import { ModuleSwitcher } from '@/components/navigation/ModuleSwitcher';

const HistoryTab = lazy(() => import('./tabs/HistoryTab').then(m => ({ default: m.HistoryTab })));
const ProfileTab = lazy(() => import('./tabs/ProfileTab').then(m => ({ default: m.ProfileTab })));
const StatusTab = lazy(() => import('./tabs/StatusTab').then(m => ({ default: m.StatusTab })));
const QueueTab = lazy(() => import('./tabs/QueueTab').then(m => ({ default: m.QueueTab })));

const BARBER_VISIBLE_EVENTS = [
    'barber_reservation_assigned',
    'reservation_cancelled',
    'reservation_confirmed',
    'barber_feedback_received',
    'user_role_updated',
] as const;

const BARBER_POPUP_EVENTS = [
    'barber_reservation_assigned',
    'reservation_cancelled',
    'reservation_confirmed',
    'barber_feedback_received',
    'user_role_updated',
] as const;

const VALID_TABS = ['queue', 'history', 'profile', 'status'] as const;
type BarberTab = typeof VALID_TABS[number];

export const BarberDashboard = () => {
    const [activeTab, setActiveTabState] = useState<BarberTab>(() => {
        // 1. Try reading from URL query param ?tab=...
        const urlParams = new URLSearchParams(window.location.search);
        const tabParam = urlParams.get('tab') as BarberTab;
        if (tabParam && VALID_TABS.includes(tabParam)) {
            return tabParam;
        }
        // 2. Try reading from localStorage
        const savedTab = localStorage.getItem('demoshop_barber_active_tab') as BarberTab;
        if (savedTab && VALID_TABS.includes(savedTab)) {
            return savedTab;
        }
        // 3. Fallback default
        return 'queue';
    });

    const setActiveTab = (tab: string) => {
        if (!VALID_TABS.includes(tab as BarberTab)) return;
        const validTab = tab as BarberTab;
        setActiveTabState(validTab);
        localStorage.setItem('demoshop_barber_active_tab', validTab);
        const url = new URL(window.location.href);
        url.searchParams.set('tab', validTab);
        window.history.replaceState({}, '', url.toString());
    };

    const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
    const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
    const [selectedNotification, setSelectedNotification] = useState<AppNotification | null>(null);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

    const { user: currentUser, role: userRole, logout } = useAuth();

    const handleLogout = () => {
        setIsLogoutModalOpen(true);
    };

    const confirmLogout = async () => {
        await logout();
    };

    const renderContent = () => {
        return (
            <Suspense fallback={<div className="py-12 flex justify-center text-ivory-dim text-sm animate-pulse">Loading section...</div>}>
                {activeTab === 'queue' && <QueueTab />}
                {activeTab === 'history' && <HistoryTab />}
                {activeTab === 'profile' && <ProfileTab onOpenAccount={() => setIsProfileModalOpen(true)} />}
                {activeTab === 'status' && <StatusTab />}
            </Suspense>
        );
    };

    const getTabName = () => {
        switch (activeTab) {
            case 'queue': return 'Queue Dashboard';
            case 'history': return 'Customer History Logs';
            case 'profile': return 'Performance Profile';
            case 'status': return 'Shift Schedule';
            default: return 'Barber';
        }
    };

    return (
        <div className="min-h-screen bg-charcoal flex">
            {/* Desktop Sidebar */}
            <BarberSidebar 
                activeTab={activeTab} 
                setActiveTab={setActiveTab} 
                handleLogout={handleLogout}
                onOpenProfile={() => setIsProfileModalOpen(true)}
                onCollapsedChange={setIsSidebarCollapsed}
            />

            {/* Main Content Area */}
            <main className={`flex-1 relative transition-[margin-left] duration-200 ease-in-out ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'}`}>

                {/* Top Header */}
                <header className="min-h-16 sm:min-h-20 py-3 sm:py-0 bg-charcoal/95 backdrop-blur-md border-b border-white/5 sticky top-0 z-10 px-3 sm:px-6 md:px-8 flex justify-between items-center gap-3">
                    <h2 className="text-base sm:text-lg md:text-xl font-serif font-bold text-ivory truncate min-w-0 flex-1">{getTabName()}</h2>

                    <div className="flex items-center gap-2 sm:gap-4 md:gap-6 shrink-0">
                        <NotificationBell
                            visibleEvents={BARBER_VISIBLE_EVENTS}
                            popupEvents={BARBER_POPUP_EVENTS}
                            onSelect={setSelectedNotification}
                            onNewNotification={setSelectedNotification}
                        />

                        <div className="flex items-center gap-2 md:gap-3 pl-2 sm:pl-4 md:pl-6 border-l border-white/10">
                            <ModuleSwitcher
                                currentModuleId="barber"
                                onOpenProfile={() => setIsProfileModalOpen(true)}
                                profileLabel="Edit Profile"
                            />
                        </div>
                    </div>
                </header>

                {/* Sub Tab Content Area */}
                <div className="p-3.5 sm:p-6 md:p-8 relative pb-28 lg:pb-8 min-w-0">
                    {renderContent()}
                </div>
            </main>

            {/* Bottom Navigation (Mobile Only) */}
            <BottomNavigation 
                activeTab={activeTab} 
                setActiveTab={setActiveTab} 
                handleLogout={handleLogout} 
                onOpenProfile={() => setIsProfileModalOpen(true)}
            />

            {/* Logout Modal */}
            <LogoutModal
                isOpen={isLogoutModalOpen}
                onClose={() => setIsLogoutModalOpen(false)}
                onConfirm={confirmLogout}
            />

            {/* Notification Detail Modal */}
            <NotificationDetailModal
                isOpen={!!selectedNotification}
                notification={selectedNotification}
                onClose={() => setSelectedNotification(null)}
            />

            {/* Barber Profile Edit Modal (Single Source of Truth) */}
            <BarberProfileModal
                isOpen={isProfileModalOpen}
                onClose={() => setIsProfileModalOpen(false)}
            />
        </div>
    );
};
export default BarberDashboard;
