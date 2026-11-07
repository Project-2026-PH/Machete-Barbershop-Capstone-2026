import React, { useCallback, useEffect, Suspense, lazy } from 'react';
import { useNavigate, useParams } from 'react-router';
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import BottomNavigation from "./components/BottomNavigation";
const OverviewTab = lazy(() => import("./tabs/OverviewTab"));
const POSTab = lazy(() => import("./tabs/POSTab"));
const ReservationsTab = lazy(() => import("./tabs/ReservationsTab"));
const TodaysSalesTab = lazy(() => import("./tabs/TodaysSalesTab"));
const CustomersServedTab = lazy(() => import("./tabs/CustomersServedTab"));
const ProfileTab = lazy(() => import("./tabs/ProfileTab"));
const CashierOfflineWorklistModal = lazy(() => import("./components/CashierOfflineWorklistModal").then((module) => ({
    default: module.CashierOfflineWorklistModal,
})));

import { useAuth } from '@/components/auth/AuthContext';
import { useFeatures } from '@/context/FeatureContext';
import { useToast } from '@/components/feedback/ToastContext';
import { LogoutModal } from '@/components/common/LogoutModal';
import { LayoutDashboard, Banknote, CalendarDays } from 'lucide-react';
import { startOfflineQueuePolling } from './services/offlineQueue';
import {
    getCashierConnectivityStatus,
    startCashierConnectivityMonitor,
    subscribeToCashierConnectivity,
    type CashierConnectivityStatus,
} from './services/cashier-connectivity';
import { QueueDataProvider } from './context/QueueDataContext';
import { usePrinterStation } from './hooks/usePrinterStation';
const PRINTER_STATION_QUERY = 'printerStation';


type ActiveTab =
    | 'overview'
    | 'pos'
    | 'queue'
    | 'sale-today'
    | 'customers-served'
    | 'profile';

const KNOWN_ROUTES: { path: string; tab: ActiveTab }[] = [
    { path: 'pos', tab: 'pos' },
    { path: 'queue', tab: 'queue' },
    { path: 'sale/today', tab: 'sale-today' },
    { path: 'customers-served', tab: 'customers-served' },
    { path: 'profile', tab: 'profile' },
];

const resolveActiveTab = (rawPath: string | undefined): { tab: ActiveTab; matched: boolean } => {
    const normalized = (rawPath || '').replace(/^\/+|\/+$/g, '');
    if (!normalized) return { tab: 'overview', matched: true };

    const match = KNOWN_ROUTES.find((entry) => normalized === entry.path);
    if (match) return { tab: match.tab, matched: true };

    // Fallback: first segment shortcuts (e.g. `pos/anything`) still resolve to the top-level tab.
    const first = normalized.split('/')[0];
    const shortcut = KNOWN_ROUTES.find((entry) => entry.path === first);
    if (shortcut) return { tab: shortcut.tab, matched: true };

    return { tab: 'overview', matched: false };
};

const TAB_ROUTES: Record<ActiveTab, string> = {
    overview: '/cashier',
    pos: '/cashier/pos',
    queue: '/cashier/queue',
    'sale-today': '/cashier/sale/today',
    'customers-served': '/cashier/customers-served',
    profile: '/cashier/profile',
};

const KEYBOARD_SHORTCUTS: Record<string, string> = {
    '1': '/cashier',
    '2': '/cashier/pos',
    '3': '/cashier/queue',
    '4': '/cashier/sale/today',
    '5': '/cashier/customers-served',
};

const CODE_SHORTCUTS: Record<string, string> = {
    Digit1: '/cashier',
    Digit2: '/cashier/pos',
    Digit3: '/cashier/queue',
    Digit4: '/cashier/sale/today',
    Digit5: '/cashier/customers-served',
    Numpad1: '/cashier',
    Numpad2: '/cashier/pos',
    Numpad3: '/cashier/queue',
    Numpad4: '/cashier/sale/today',
    Numpad5: '/cashier/customers-served',
};

const isEditableElement = (el: EventTarget | null): boolean => {
    if (!el || !(el instanceof HTMLElement)) return false;
    const tagName = el.tagName;
    return (
        tagName === 'INPUT' ||
        tagName === 'TEXTAREA' ||
        tagName === 'SELECT' ||
        el.isContentEditable ||
        el.getAttribute('contenteditable') === 'true'
    );
};

const isModalDialogOpen = (): boolean => {
    if (typeof document === 'undefined') return false;
    return (
        document.body.style.overflow === 'hidden' ||
        Boolean(document.querySelector('[role="dialog"], [aria-modal="true"], dialog[open], .fixed.inset-0:not(.pointer-events-none)'))
    );
};

const CashierDashboardContent: React.FC = () => {
    const navigate = useNavigate();
    const { '*': cashierPath } = useParams();
    const { tab: activeTab, matched } = resolveActiveTab(cashierPath);
    const { logout, user } = useAuth();
    const { hasAccess } = useFeatures();
    const { addToast } = useToast();
    const [isLogoutModalOpen, setIsLogoutModalOpen] = React.useState(false);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(false);
    const [connectivityStatus, setConnectivityStatus] = React.useState<CashierConnectivityStatus>(getCashierConnectivityStatus);
    const [offlineStorageAvailable, setOfflineStorageAvailable] = React.useState<boolean | null>(null);
    const [pendingOfflineCount, setPendingOfflineCount] = React.useState(0);
    const [offlineConflictCount, setOfflineConflictCount] = React.useState(0);
    const [offlineAuthRefreshFailed, setOfflineAuthRefreshFailed] = React.useState(false);
    const [isOfflineWorklistOpen, setIsOfflineWorklistOpen] = React.useState(false);
    const [waitingServiceWorker, setWaitingServiceWorker] = React.useState<ServiceWorkerRegistration | null>(null);

    const canAccessPos = hasAccess('cashier_pos');
    const cashierBranchId = Number(user?.branch_id);
    const cashierId = String(user?.user_id ?? '');
    const printerStationEnabled = typeof window !== 'undefined'
        && new URLSearchParams(window.location.search).get(PRINTER_STATION_QUERY) === '1';
    usePrinterStation(printerStationEnabled);

    // Dynamic Navigation items derived from authoritative feature access
    const navItems = React.useMemo(() => {
        const items: Array<{ tab: string; icon: any; label: string; shortcut: string; badge?: number }> = [
            { tab: 'overview', icon: LayoutDashboard, label: 'Dashboard', shortcut: 'Alt+1' },
        ];
        if (canAccessPos) {
            items.push({ tab: 'pos', icon: Banknote, label: 'Cashier', shortcut: 'Alt+2' });
        }
        items.push({ tab: 'queue', icon: CalendarDays, label: 'Reservations', shortcut: 'Alt+3' });
        return items;
    }, [canAccessPos]);

    // Active module revocation watcher: redirect if permission is removed during active session
    useEffect(() => {
        if (activeTab === 'pos' && !canAccessPos) {
            addToast({
                type: 'warning',
                title: 'Access Revoked',
                message: 'Access to Point of Sale was revoked by system administrators.',
            });
            navigate('/cashier', { replace: true });
        }
    }, [activeTab, canAccessPos, navigate, addToast]);

    useEffect(() => {
        if (!matched) {
            navigate('/cashier', { replace: true });
        }
    }, [navigate, matched]);

    useEffect(() => {
        const stopPolling = startOfflineQueuePolling();
        return stopPolling;
    }, []);

    useEffect(() => {
        const branchId = Number(user?.branch_id);
        const cashierId = String(user?.user_id ?? '');
        if (!Number.isInteger(branchId) || branchId < 1 || !cashierId) return;
        let cancelled = false;
        let stopSync: () => void = () => {};
        void import('./services/cashier-offline-sync').then(({ startCashierOfflineSync }) => {
            if (cancelled) return;
            stopSync = startCashierOfflineSync(branchId, cashierId);
        }).catch((error) => {
            console.warn('[CashierDashboard] Offline sync worker could not be loaded:', error);
        });
        return () => {
            cancelled = true;
            stopSync();
        };
    }, [user?.branch_id, user?.user_id]);

    useEffect(() => {
        const unsubscribe = subscribeToCashierConnectivity(setConnectivityStatus);
        const stopMonitor = startCashierConnectivityMonitor();
        return () => {
            unsubscribe();
            stopMonitor();
        };
    }, []);

    useEffect(() => {
        let active = true;
        void import('./services/cashier-offline.repository')
            .then((repository) => repository.initializeCashierOfflineStorage())
            .then((storage) => {
                if (active) setOfflineStorageAvailable(storage.available);
            })
            .catch(() => {
                if (active) setOfflineStorageAvailable(false);
            });
        return () => { active = false; };
    }, []);

    const refreshOfflineWorkCount = useCallback(async () => {
        if (!Number.isInteger(cashierBranchId) || cashierBranchId < 1 || !cashierId) {
            setPendingOfflineCount(0);
            setOfflineConflictCount(0);
            return;
        }
        try {
            const repository = await import('./services/cashier-offline.repository');
            const operations = await repository.listCashierOutboxJournal(cashierBranchId, cashierId);
            const unresolved = operations.filter((operation) => operation.status !== 'synced');
            setPendingOfflineCount(new Set(unresolved.map((operation) => operation.localTransactionId)).size);
            setOfflineConflictCount(new Set(unresolved
                .filter((operation) => operation.status === 'conflict' || operation.status === 'permanent_failure')
                .map((operation) => operation.localTransactionId)).size);
        } catch {
            setPendingOfflineCount(0);
            setOfflineConflictCount(0);
        }
    }, [cashierBranchId, cashierId]);

    useEffect(() => {
        void refreshOfflineWorkCount();
        const refresh = () => { void refreshOfflineWorkCount(); };
        window.addEventListener('cashier-offline-outbox-changed', refresh);
        window.addEventListener('cashier-offline-record-synced', refresh);
        window.addEventListener('cashier-offline-record-retryable', refresh);
        window.addEventListener('cashier-offline-record-conflict', refresh);
        window.addEventListener('focus', refresh);
        document.addEventListener('visibilitychange', refresh);
        let channel: BroadcastChannel | null = null;
        try {
            if (typeof BroadcastChannel !== 'undefined') channel = new BroadcastChannel('demoshop-cashier-offline-outbox');
        } catch {}
        channel?.addEventListener('message', refresh);
        return () => {
            window.removeEventListener('cashier-offline-outbox-changed', refresh);
            window.removeEventListener('cashier-offline-record-synced', refresh);
            window.removeEventListener('cashier-offline-record-retryable', refresh);
            window.removeEventListener('cashier-offline-record-conflict', refresh);
            window.removeEventListener('focus', refresh);
            document.removeEventListener('visibilitychange', refresh);
            channel?.close();
        };
    }, [refreshOfflineWorkCount]);

    useEffect(() => {
        if ('serviceWorker' in navigator) {
            void navigator.serviceWorker.getRegistration().then((registration) => {
                if (registration?.waiting && navigator.serviceWorker.controller) setWaitingServiceWorker(registration);
            }).catch(() => undefined);
        }
        const handleUpdateReady = (event: Event) => {
            const registration = (event as CustomEvent<{ registration?: ServiceWorkerRegistration }>).detail?.registration;
            if (registration?.waiting) setWaitingServiceWorker(registration);
        };
        window.addEventListener('cashier-service-worker-update-available', handleUpdateReady);
        return () => window.removeEventListener('cashier-service-worker-update-available', handleUpdateReady);
    }, []);

    useEffect(() => {
        const handleRefreshFailure = () => setOfflineAuthRefreshFailed(true);
        window.addEventListener('cashier-offline-auth-refresh-failed', handleRefreshFailure);
        return () => window.removeEventListener('cashier-offline-auth-refresh-failed', handleRefreshFailure);
    }, []);

    useEffect(() => {
        if (pendingOfflineCount === 0) setOfflineAuthRefreshFailed(false);
    }, [pendingOfflineCount]);

    useEffect(() => {
        if (pendingOfflineCount === 0) return;
        const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', warnBeforeLeaving);
        return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
    }, [pendingOfflineCount]);

    const setActiveTab = useCallback((tab: string) => {
        const target = TAB_ROUTES[tab as ActiveTab] || (tab === 'overview' ? '/cashier' : `/cashier/${tab}`);
        navigate(target);
    }, [navigate]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (!event.altKey || event.ctrlKey || event.metaKey) {
                return;
            }

            const targetRoute = KEYBOARD_SHORTCUTS[event.key] || CODE_SHORTCUTS[event.code];
            if (!targetRoute) {
                return;
            }

            // Safety guards: Suppress when typing inside input, textarea, select, search, or contenteditable
            if (isEditableElement(event.target) || isEditableElement(document.activeElement)) {
                return;
            }

            // Safety guards: Suppress when modal dialogs are open
            if (isModalDialogOpen()) {
                return;
            }

            event.preventDefault();
            navigate(targetRoute);
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [navigate]);

    const handleLogout = () => {
        setIsLogoutModalOpen(true);
        void refreshOfflineWorkCount();
    };

    const confirmLogout = async () => {
        if (offlineStorageAvailable !== false && Number.isInteger(cashierBranchId) && cashierBranchId > 0 && cashierId) {
            try {
                const repository = await import('./services/cashier-offline.repository');
                const operations = await repository.listCashierOutboxJournal(cashierBranchId, cashierId);
                const unresolved = operations.filter((operation) => operation.status !== 'synced');
                const transactionCount = new Set(unresolved.map((operation) => operation.localTransactionId)).size;
                if (transactionCount > 0 && pendingOfflineCount === 0) {
                    setPendingOfflineCount(transactionCount);
                    setOfflineConflictCount(new Set(unresolved
                        .filter((operation) => operation.status === 'conflict' || operation.status === 'permanent_failure')
                        .map((operation) => operation.localTransactionId)).size);
                    return;
                }
            } catch {
                addToast({
                    type: 'error',
                    title: 'Offline work could not be checked',
                    message: 'Please keep this cashier session open and try signing out again.',
                });
                return;
            }
        }
        await logout();
    };

    const applyWaitingServiceWorker = () => {
        const worker = waitingServiceWorker?.waiting;
        if (!worker || !('serviceWorker' in navigator)) return;
        navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
        worker.postMessage({ type: 'SKIP_WAITING' });
    };

    // The sidebar/bottom-nav only expose the primary tabs; the sale-today
    // and customers-served pages roll up under the overview highlight.
    const primaryTab: 'overview' | 'pos' | 'queue' =
        activeTab === 'pos' || activeTab === 'queue' ? activeTab : 'overview';

    return (
        <div className="min-h-screen bg-charcoal flex">
            {/* Desktop Sidebar */}
            <Sidebar
                activeTab={primaryTab}
                setActiveTab={setActiveTab}
                handleLogout={handleLogout}
                pendingCount={pendingOfflineCount}
                navItems={navItems}
                onCollapsedChange={setIsSidebarCollapsed}
            />

            {/* Main View Area */}
            <main className={`flex-1 relative pb-24 lg:pb-0 max-w-full overflow-x-hidden transition-[margin-left] duration-200 ease-in-out ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'}`}>
                <Header
                    activeTab={activeTab}
                    pendingCount={pendingOfflineCount}
                    handleLogout={handleLogout}
                    connectivityStatus={connectivityStatus}
                    offlineStorageAvailable={offlineStorageAvailable}
                />

                {offlineAuthRefreshFailed && pendingOfflineCount > 0 && (
                    <div role="alert" className="border-b border-red-300/20 bg-red-300/[0.08] px-4 py-3 text-xs text-red-100 md:px-8">
                        The cashier session could not be refreshed. Your local work is still saved on this device; reconnect and sign in again before retrying sync.
                    </div>
                )}

                {pendingOfflineCount > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-300/20 bg-amber-300/[0.08] px-4 py-3 text-xs text-amber-100 md:px-8">
                        <span>
                            {pendingOfflineCount} unsynced cashier {pendingOfflineCount === 1 ? 'transaction' : 'transactions'}
                            {offlineConflictCount > 0 ? ` · ${offlineConflictCount} need conflict review` : ''}
                        </span>
                        <button
                            type="button"
                            onClick={() => setIsOfflineWorklistOpen(true)}
                            className="rounded border border-amber-200/30 px-3 py-1.5 font-semibold hover:bg-amber-200/10"
                        >
                            Review offline work
                        </button>
                    </div>
                )}

                {waitingServiceWorker && (
                    <div role="status" className="flex flex-wrap items-center justify-between gap-3 border-b border-sky-300/20 bg-sky-300/[0.08] px-4 py-3 text-xs text-sky-100 md:px-8">
                        <span>A cashier app update is ready. Reload when your current work is safe.</span>
                        <div className="flex gap-2">
                            <button type="button" onClick={applyWaitingServiceWorker} className="rounded bg-sky-200 px-3 py-1.5 font-semibold text-charcoal hover:bg-sky-100">
                                Reload to update
                            </button>
                            <button type="button" onClick={() => setWaitingServiceWorker(null)} className="rounded border border-sky-200/30 px-3 py-1.5 font-semibold hover:bg-sky-200/10">
                                Later
                            </button>
                        </div>
                    </div>
                )}

                <div className="p-4 md:p-8 relative z-0">
                    <Suspense fallback={<div className="py-12 flex justify-center text-ivory-dim text-sm animate-pulse">Loading section...</div>}>
                        {activeTab === 'overview' && <OverviewTab />}
                        {activeTab === 'pos' && <POSTab />}
                        {activeTab === 'queue' && <ReservationsTab />}
                        {activeTab === 'sale-today' && <TodaysSalesTab />}
                        {activeTab === 'customers-served' && <CustomersServedTab />}
                        {activeTab === 'profile' && <ProfileTab />}
                    </Suspense>
                </div>
            </main>

            {/* Mobile Navigation Bar */}
            <BottomNavigation 
                activeTab={activeTab} 
                setActiveTab={setActiveTab} 
                handleLogout={handleLogout}
                pendingCount={pendingOfflineCount}
                navItems={navItems}
            />

            <LogoutModal
                isOpen={isLogoutModalOpen}
                onClose={() => setIsLogoutModalOpen(false)}
                onConfirm={confirmLogout}
                message={pendingOfflineCount > 0
                    ? `There are ${pendingOfflineCount} unsynced cashier ${pendingOfflineCount === 1 ? 'transaction' : 'transactions'} on this device${offlineConflictCount > 0 ? `, including ${offlineConflictCount} needing conflict review` : ''}. They remain scoped to this branch and account. Continue logging out only if you can return with this same account to sync or review them.`
                    : undefined}
            />
            {isOfflineWorklistOpen && (
                <Suspense fallback={null}>
                    <CashierOfflineWorklistModal
                        isOpen={isOfflineWorklistOpen}
                        onClose={() => setIsOfflineWorklistOpen(false)}
                        branchId={cashierBranchId}
                        cashierId={cashierId}
                    />
                </Suspense>
            )}
        </div>
    );
};

export const CashierDashboard: React.FC = () => {
    return (
        <QueueDataProvider>
            <CashierDashboardContent />
        </QueueDataProvider>
    );
};

export default CashierDashboard;
