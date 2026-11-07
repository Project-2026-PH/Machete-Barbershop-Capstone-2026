import React, { Suspense, lazy, useState, useEffect, useCallback } from 'react';
import { useSearchParams, useLocation } from 'react-router';
import { AnimatePresence } from 'framer-motion';

import Sidebar from "@/features/admin/components/Sidebar";
import Header from "@/features/admin/components/Header";
import BottomNavigation from "@/features/admin/components/BottomNavigation";
import { AdminTabPanel } from "@/features/admin/components/AdminTabPanel";

import type { InventorySubTab } from "@/features/admin/tabs/InventoryTab";
import { LogoutModal } from '@/components/common/LogoutModal';
import { useAuth } from '@/components/auth/AuthContext';
import { api } from '@/config/api';
import { supabase } from '@/config/supabaseClient';
import { createHasuraFallbackGroup } from '@/utils/hasura-realtime-group';

const DashboardTab = lazy(() => import('@/features/admin/tabs/DashboardTab'));
const ManagementTab = lazy(() => import('@/features/admin/tabs/ManagementTab'));
const SettingsTab = lazy(() => import('@/features/admin/tabs/SettingsTab'));
const PurchaseOrdersTab = lazy(() => import('@/features/admin/tabs/PurchaseOrdersTab'));
const ReportsTab = lazy(() => import('@/features/admin/tabs/ReportsTab'));
const InventoryTab = lazy(() => import('@/features/admin/tabs/InventoryTab'));
const AppointmentsTab = lazy(() => import('@/features/admin/tabs/AppointmentsTab'));

export const AdminDashboard: React.FC = () => {
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();

    const reportsPathMatch = location.pathname.startsWith('/admin/reports')
        ? location.pathname.replace('/admin/reports', '').split('/').filter(Boolean)[0]
        : null;
    const appointmentsPathMatch = location.pathname.startsWith('/admin/appointments');

    const rawInitialTab = appointmentsPathMatch ? 'appointments' : (reportsPathMatch ? 'reports' : (searchParams.get('tab') || 'dashboard'));
    const initialTabParam = rawInitialTab === 'stock-requests' ? 'purchase-orders' : rawInitialTab;
    const isDirectSubTab = ['staff', 'shifts', 'services'].includes(initialTabParam);
    const isDirectReportSubTab = ['transactions', 'reports-transactions', 'sales', 'commissions', 'inventory', 'audit-logs'].includes(initialTabParam);
    const initialSubTabParam = reportsPathMatch || searchParams.get('subtab') || searchParams.get('report') || (
        initialTabParam === 'purchase-orders'
            ? 'purchase-order-approval'
            : initialTabParam === 'inventory'
                ? 'consumables'
                : initialTabParam === 'reports'
                    ? 'transactions'
                    : isDirectSubTab
                        ? initialTabParam
                        : isDirectReportSubTab
                            ? initialTabParam
                            : 'staff'
    );
    const isPurchaseOrderSubTab = ['purchase-order-approval', 'awaiting-approval', 'history'].includes(initialSubTabParam);

    const [activeTab, setActiveTab] = useState<string>(
        ['dashboard', 'management', 'inventory', 'settings', 'purchase-orders', 'reports', 'appointments'].includes(initialTabParam)
            ? initialTabParam
            : isDirectSubTab
                ? 'management'
                : isDirectReportSubTab || initialTabParam === 'transactions'
                    ? 'reports'
                    : 'dashboard'
    );
    const [activeSubTab, setActiveSubTab] = useState<string>(
        ['staff', 'shifts', 'services', 'consumables', 'retails', 'suppliers', 'forecast', 'transactions', 'reports-transactions', 'sales', 'commissions', 'inventory', 'audit-logs'].includes(initialSubTabParam) || isPurchaseOrderSubTab
            ? (initialSubTabParam === 'reports-transactions' ? 'transactions' : initialSubTabParam)
            : initialTabParam === 'purchase-orders'
                ? 'purchase-order-approval'
                : initialTabParam === 'reports'
                    ? 'transactions'
                    : 'staff'
    );
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [pendingShiftRequests, setPendingShiftRequests] = useState<number>(0);
    const [pendingPurchaseOrders, setPendingPurchaseOrders] = useState<number>(0);
    const [pendingAppointments, setPendingAppointments] = useState<number>(0);
    const [isLogoutModalOpen, setIsLogoutModalOpen] = useState<boolean>(false);
    const [isLoggingOut, setIsLoggingOut] = useState<boolean>(false);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const { logout } = useAuth();

    // Synchronize activeTab and activeSubTab with URL parameters and path
    useEffect(() => {
        if (location.pathname.startsWith('/admin/appointments')) {
            setActiveTab('appointments');
            setActiveSubTab('');
            return;
        }

        if (location.pathname.startsWith('/admin/reports')) {
            const seg = location.pathname.replace('/admin/reports', '').split('/').filter(Boolean)[0];
            setActiveTab('reports');
            if (seg && ['inventory', 'sales', 'commissions', 'audit-logs', 'transactions'].includes(seg)) {
                setActiveSubTab(seg);
            } else if (!searchParams.get('subtab')) {
                setActiveSubTab('transactions');
            }
            return;
        }

        const rawTab = searchParams.get('tab');
        const tabParam = rawTab === 'stock-requests' ? 'purchase-orders' : rawTab;
        const subtabParam = searchParams.get('subtab') || searchParams.get('report');

        if (tabParam) {
            if (['dashboard', 'management', 'inventory', 'settings', 'purchase-orders', 'reports', 'appointments'].includes(tabParam)) {
                setActiveTab(tabParam);
                if (tabParam === 'reports') {
                    const rSub = subtabParam || 'transactions';
                    if (['transactions', 'inventory', 'sales', 'commissions', 'audit-logs'].includes(rSub)) {
                        setActiveSubTab(rSub);
                    }
                }
            } else if (['staff', 'shifts', 'services'].includes(tabParam)) {
                setActiveTab('management');
                setActiveSubTab(tabParam);
            } else if (tabParam === 'transactions' || tabParam === 'reports-transactions') {
                setActiveTab('reports');
                setActiveSubTab('transactions');
            }
        }
        if (subtabParam && ['staff', 'shifts', 'services', 'consumables', 'retails', 'suppliers', 'forecast', 'purchase-order-approval', 'awaiting-approval', 'history', 'inventory', 'sales', 'commissions', 'audit-logs', 'transactions', 'reports-transactions'].includes(subtabParam)) {
            const normalizedSub = subtabParam === 'reports-transactions' ? 'transactions' : subtabParam;
            setActiveSubTab(normalizedSub);
        }
    }, [searchParams, location.pathname]);

    const handleSelectTab = (tab: string, subTab?: string, extraParams?: Record<string, string>) => {
        if (['staff', 'shifts', 'services'].includes(tab)) {
            setActiveTab('management');
            setActiveSubTab(tab);
            setSearchParams((prev) => {
                const next = new URLSearchParams(prev);
                next.set('tab', 'management');
                next.set('subtab', tab);
                if (extraParams) {
                    Object.entries(extraParams).forEach(([k, v]) => {
                        if (v) next.set(k, v);
                        else next.delete(k);
                    });
                }
                return next;
            });
            return;
        }

        if (tab === 'appointments') {
            setActiveTab('appointments');
            setActiveSubTab('');
            setSearchParams((prev) => {
                const next = new URLSearchParams(prev);
                next.set('tab', 'appointments');
                next.delete('subtab');
                next.delete('report');
                if (extraParams) {
                    Object.entries(extraParams).forEach(([k, v]) => {
                        if (v) next.set(k, v);
                        else next.delete(k);
                    });
                }
                return next;
            });
            return;
        }

        if (tab === 'management') {
            const nextSub = subTab || activeSubTab || 'staff';
            setActiveTab('management');
            setActiveSubTab(nextSub);
            setSearchParams((prev) => {
                const next = new URLSearchParams(prev);
                next.set('tab', 'management');
                next.set('subtab', nextSub);
                if (extraParams) {
                    Object.entries(extraParams).forEach(([k, v]) => {
                        if (v) next.set(k, v);
                        else next.delete(k);
                    });
                }
                return next;
            });
            return;
        }

        if (tab === 'inventory') {
            const nextSub = (subTab && ['consumables', 'retails', 'suppliers', 'forecast'].includes(subTab))
                ? subTab as InventorySubTab
                : 'consumables';
            setActiveTab('inventory');
            setActiveSubTab(nextSub);
            setSearchParams((prev) => {
                const next = new URLSearchParams(prev);
                next.set('tab', 'inventory');
                next.set('subtab', nextSub);
                if (extraParams) {
                    Object.entries(extraParams).forEach(([k, v]) => {
                        if (v) next.set(k, v);
                        else next.delete(k);
                    });
                }
                return next;
            });
            return;
        }

        if (tab === 'purchase-orders') {
            const nextSub = subTab || 'awaiting-approval';
            setActiveTab(tab);
            setActiveSubTab(nextSub);
            setSearchParams((prev) => {
                const next = new URLSearchParams(prev);
                next.set('tab', tab);
                next.set('subtab', nextSub);
                if (extraParams) {
                    Object.entries(extraParams).forEach(([k, v]) => {
                        if (v) next.set(k, v);
                        else next.delete(k);
                    });
                }
                return next;
            });
            return;
        }

        if (tab === 'transactions' || tab === 'reports-transactions') {
            setActiveTab('reports');
            setActiveSubTab('transactions');
            setSearchParams((prev) => {
                const next = new URLSearchParams(prev);
                next.set('tab', 'reports');
                next.set('subtab', 'transactions');
                return next;
            });
            return;
        }

        if (tab === 'reports') {
            const nextSub = subTab || activeSubTab || 'transactions';
            setActiveTab('reports');
            setActiveSubTab(nextSub);
            setSearchParams((prev) => {
                const next = new URLSearchParams(prev);
                next.set('tab', 'reports');
                next.set('subtab', nextSub);
                if (extraParams) {
                    Object.entries(extraParams).forEach(([k, v]) => {
                        if (v) next.set(k, v);
                        else next.delete(k);
                    });
                }
                return next;
            });
            return;
        }

        if (tab === 'reports') {
            const nextSub = (subTab && ['transactions', 'inventory', 'sales', 'commissions', 'appointments', 'audit-logs', 'account-security'].includes(subTab))
                ? subTab
                : (activeSubTab && ['transactions', 'inventory', 'sales', 'commissions', 'appointments', 'audit-logs', 'account-security'].includes(activeSubTab))
                    ? activeSubTab
                    : 'transactions';
            setActiveTab('reports');
            setActiveSubTab(nextSub);
            setSearchParams((prev) => {
                const next = new URLSearchParams(prev);
                next.set('tab', 'reports');
                next.set('subtab', nextSub);
                next.delete('report');
                return next;
            });
            return;
        }

        setActiveTab(tab);
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set('tab', tab);
            next.delete('subtab');
            next.delete('report');
            if (extraParams) {
                Object.entries(extraParams).forEach(([k, v]) => {
                    if (v) next.set(k, v);
                    else next.delete(k);
                });
            }
            return next;
        });
    };

    const fetchCounts = useCallback(async (affectedTables?: string[]) => {
        try {
            const refreshShifts = !affectedTables || affectedTables.includes('barber_shift_requests');
            const refreshPurchaseOrders = !affectedTables || affectedTables.includes('purchase_orders');
            const refreshAppointments = !affectedTables || affectedTables.some((table) => table === 'appointments' || table === 'queue_entries');
            const [shiftRes, purchaseOrderRes, apptRes] = await Promise.allSettled([
                refreshShifts ? api.get('/api/barber/shift-requests') : Promise.resolve(null),
                refreshPurchaseOrders ? api.get('/api/inventory/purchase-orders') : Promise.resolve(null),
                refreshAppointments ? api.get('/api/appointments', { params: { limit: 1 } }) : Promise.resolve(null),
            ]);

            if (shiftRes.status === 'fulfilled' && Array.isArray(shiftRes.value?.data)) {
                const count = shiftRes.value.data.filter(
                    (req: any) => String(req?.status).toLowerCase() === 'pending'
                ).length;
                setPendingShiftRequests(count);
            }

            if (purchaseOrderRes.status === 'fulfilled' && Array.isArray(purchaseOrderRes.value?.data)) {
                const count = purchaseOrderRes.value.data.filter(
                    (order: any) => String(order?.status).toLowerCase() === 'pending'
                ).length;
                setPendingPurchaseOrders(count);
            }

            if (apptRes.status === 'fulfilled' && apptRes.value?.data?.counts?.pending !== undefined) {
                setPendingAppointments(Number(apptRes.value.data.counts.pending) || 0);
            }
        } catch (error) {
            console.error('[AdminDashboard] Failed to fetch badge counts:', error);
        }
    }, []);

    useEffect(() => {
        void fetchCounts();
        let refreshTimer: number | null = null;
        const pendingTables = new Set<string>();
        let refreshAllCounts = false;
        const scheduleCountRefresh = (table?: string) => {
            if (table) pendingTables.add(table);
            else refreshAllCounts = true;
            if (refreshTimer !== null) window.clearTimeout(refreshTimer);
            refreshTimer = window.setTimeout(() => {
                refreshTimer = null;
                const tables = refreshAllCounts ? undefined : Array.from(pendingTables);
                refreshAllCounts = false;
                pendingTables.clear();
                void fetchCounts(tables);
            }, 250);
        };

        const handleRefresh = (e?: Event, table?: string) => {
            const customEvent = e as CustomEvent;
            if (customEvent?.detail?.pendingAppointments !== undefined) {
                setPendingAppointments(Number(customEvent.detail.pendingAppointments) || 0);
            }
            scheduleCountRefresh(table);
        };

        const handleShiftRefresh = (event?: Event) => handleRefresh(event, 'barber_shift_requests');
        const handlePurchaseOrderRefresh = (event?: Event) => handleRefresh(event, 'purchase_orders');
        const handleAppointmentRefresh = (event?: Event) => handleRefresh(event, 'appointments');

        window.addEventListener('demoshop:shift-request-changed', handleShiftRefresh);
        window.addEventListener('demoshop:notifications-changed', handleRefresh);
        window.addEventListener('demoshop:purchase-orders-changed', handlePurchaseOrderRefresh);
        window.addEventListener('demoshop:appointments-changed', handleAppointmentRefresh);

        const realtimeGroup = createHasuraFallbackGroup({
            degradedIntervalMs: 60_000,
        });

        for (const table of ['purchase_orders', 'barber_shift_requests', 'appointments', 'queue_entries'] as const) {
            realtimeGroup.subscribe(
                `subscription WatchAdmin_${table} {
                   ${table}(limit: 1) {
                     __typename
                   }
                 }`,
                {},
                () => scheduleCountRefresh(table),
                () => {},
                {
                    onFallbackActivate: () => scheduleCountRefresh(table),
                    onBothUnavailable: () => scheduleCountRefresh(table),
                    subscribeFallback: (onStatus) => {
                        const channel = supabase
                            .channel(`admin-dashboard-${table}-supabase-fallback`)
                            .on('postgres_changes', { event: '*', schema: 'public', table }, () => scheduleCountRefresh(table))
                            .subscribe(onStatus);
                        return () => { void supabase.removeChannel(channel); };
                    },
                },
            );
        }

        return () => {
            window.removeEventListener('demoshop:shift-request-changed', handleShiftRefresh);
            window.removeEventListener('demoshop:notifications-changed', handleRefresh);
            window.removeEventListener('demoshop:purchase-orders-changed', handlePurchaseOrderRefresh);
            window.removeEventListener('demoshop:appointments-changed', handleAppointmentRefresh);
            if (refreshTimer !== null) window.clearTimeout(refreshTimer);
            realtimeGroup.cleanup();
        };
    }, [fetchCounts]);

    const handleLogoutClick = () => {
        setIsLogoutModalOpen(true);
    };

    const handleConfirmLogout = async () => {
        setIsLoggingOut(true);
        try {
            await logout();
        } finally {
            setIsLoggingOut(false);
            setIsLogoutModalOpen(false);
        }
    };

    const renderContent = (): React.ReactNode => {
        return (
            <Suspense fallback={(
                <div className="flex min-h-48 items-center justify-center gap-3 text-sm text-ivory-dim" role="status" aria-live="polite">
                    <span aria-hidden="true" className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gold/30 border-t-gold" />
                    Loading section…
                </div>
            )}>
            <>
                {activeTab === 'dashboard' && <DashboardTab onNavigateTab={handleSelectTab} />}
                {activeTab === 'management' && (
                    <ManagementTab
                        activeSubTab={activeSubTab}
                        onSelectSubTab={(sub) => handleSelectTab('management', sub)}
                    />
                )}
                {activeTab === 'appointments' && <AppointmentsTab onNavigateTab={handleSelectTab} />}
                {activeTab === 'settings' && <SettingsTab />}
                {activeTab === 'purchase-orders' && (
                    <PurchaseOrdersTab
                        activeSubTab={activeSubTab}
                        onNavigateSubTab={(subTab) => handleSelectTab('purchase-orders', subTab)}
                        onNavigateTab={handleSelectTab}
                    />
                )}
                {activeTab === 'inventory' && <InventoryTab activeSubTab={activeSubTab} onSelectSubTab={(sub) => handleSelectTab('inventory', sub)} />}
                {activeTab === 'reports' && (
                    <ReportsTab
                        activeSubTab={activeSubTab}
                        onSelectSubTab={(sub: string) => handleSelectTab('reports', sub)}
                        activeMode={activeSubTab as any}
                    />
                )}
                {activeTab === 'transactions' && (
                    <ReportsTab
                        activeSubTab="transactions"
                        onSelectSubTab={(sub: string) => handleSelectTab('reports', sub)}
                        activeMode="transactions"
                    />
                )}
            </>
            </Suspense>
        );
    };

    return (
        <div className="h-dvh w-screen max-w-full overflow-hidden bg-charcoal flex flex-col lg:flex-row">
            {/* Desktop Sidebar */}
            <Sidebar
                activeTab={activeTab}
                activeSubTab={activeSubTab}
                setActiveTab={handleSelectTab}
                handleLogout={handleLogoutClick}
                pendingShiftRequests={pendingShiftRequests}
                pendingPurchaseOrders={pendingPurchaseOrders}
                pendingAppointments={pendingAppointments}
                onCollapsedChange={setIsSidebarCollapsed}
            />

            {/* Main View Area */}
            <main className={`flex-1 min-h-screen min-w-0 relative flex flex-col overflow-y-auto pb-28 lg:pb-16 transition-[margin-left] duration-200 ease-in-out custom-scrollbar ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'}`}>
                <Header
                    activeTab={activeTab}
                    activeSubTab={activeSubTab}
                    handleLogout={handleLogoutClick}
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    onNavigateTab={handleSelectTab}
                />

                <div className="relative z-0 flex-1 flex flex-col w-full max-w-[1600px] mx-auto p-3 pb-0 md:p-4">
                    <AnimatePresence mode="wait">
                        <AdminTabPanel
                            key={activeTab}
                            panelKey={activeTab}
                            className="w-full flex-1 flex flex-col"
                        >
                            {renderContent()}
                        </AdminTabPanel>
                    </AnimatePresence>
                </div>
            </main>

            {/* Mobile Navigation Bar */}
            <BottomNavigation
                activeTab={activeTab}
                activeSubTab={activeSubTab}
                setActiveTab={handleSelectTab}
                handleLogout={handleLogoutClick}
                pendingShiftRequests={pendingShiftRequests}
                pendingPurchaseOrders={pendingPurchaseOrders}
                pendingAppointments={pendingAppointments}
            />

            {/* Logout Modal */}
            <LogoutModal
                isOpen={isLogoutModalOpen}
                onClose={() => setIsLogoutModalOpen(false)}
                onConfirm={handleConfirmLogout}
                isLoading={isLoggingOut}
            />
        </div>
    );
};

export default AdminDashboard;
