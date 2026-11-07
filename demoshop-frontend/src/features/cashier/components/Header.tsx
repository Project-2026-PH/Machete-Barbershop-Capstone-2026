import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ShieldAlert, LayoutDashboard, Users, Scissors, Shield, User, Wifi, WifiOff, LoaderCircle } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthContext';
import NotificationBell, { type AppNotification } from '@/components/common/NotificationBell';
import { NotificationDetailModal } from '@/components/common/NotificationDetailModal';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/feedback/ToastContext';
import { Modal } from '@/components/feedback/Modal';
import { EmergencyCancelModal } from './EmergencyCancelModal';
import { api } from '@/config/api';
import { ModuleSwitcher } from '@/components/navigation/ModuleSwitcher';
import type { CashierConnectivityStatus } from '../services/cashier-connectivity';

interface HeaderProps {
    activeTab?: string;
    pendingCount?: number;
    handleLogout?: () => void;
    connectivityStatus?: CashierConnectivityStatus;
    offlineStorageAvailable?: boolean | null;
}


const CASHIER_VISIBLE_NOTIFICATION_EVENTS = [
    'cashier_reservation_pending',
    'reservation_cancelled',
    'reservation_confirmed',
] as const;
const CASHIER_POPUP_NOTIFICATION_EVENTS = [
    'cashier_reservation_pending',
] as const;

const HEADER_TITLES: Record<string, string> = {
    overview: 'Dashboard',
    pos: 'Cashier',
    queue: 'Reservations',
    'sale-today': "Today's Sales",
    'customers-served': 'Customers Served',
    profile: 'Staff Profile',
};

const Header: React.FC<HeaderProps> = ({
    activeTab,
    pendingCount = 0,
    handleLogout,
    connectivityStatus,
    offlineStorageAvailable,
}) => {
    const { user, isSystemAdmin } = useAuth() as any;
    const navigate = useNavigate();
    const { addToast } = useToast();
    const [selectedNotification, setSelectedNotification] = useState<AppNotification | null>(null);

    const [isEmergencyModalOpen, setIsEmergencyModalOpen] = useState(false);
    const [barbersList, setBarbersList] = useState<any[]>([]);

    useEffect(() => {
        const fetchBarbers = async () => {
            try {
                const res = await api.get('/api/queue/public/barbers');
                if (res.data) setBarbersList(res.data);
            } catch (err) {
                // non-critical
            }
        };
        fetchBarbers();
    }, []);




    const handleNewNotification = useCallback(async (notification: AppNotification) => {
        if (notification.event === 'cashier_reservation_pending') {
            const queueEntryId = Number(notification.queue_entry_id);
            if (!Number.isInteger(queueEntryId) || queueEntryId <= 0) return;

            try {
                const response = await api.get(`/api/queue/${queueEntryId}`);
                if (String(response.data?.status).toLowerCase() !== 'pending') return;
            } catch {
                // Do not show a popup when the reservation cannot be verified.
                return;
            }
        }

        setSelectedNotification(notification);
        void api.patch(`/api/notifications/${notification.id}/read`).then(() => {
            window.dispatchEvent(new CustomEvent('demoshop:notification-read', { detail: { id: notification.id } }));
        }).catch(() => undefined);
    }, []);

    return (
        <>
            <header className="h-20 bg-charcoal/95 backdrop-blur-md border-b border-white/5 sticky top-0 z-10 px-4 md:px-8 flex justify-between items-center">
                <h2 className="text-xl font-serif font-bold text-ivory">{HEADER_TITLES[activeTab || 'overview'] || 'Cashier'}</h2>
                <div className="flex items-center gap-3 md:gap-6">

                    {connectivityStatus && (() => {
                        const isOffline = connectivityStatus === 'offline';
                        const isChecking = connectivityStatus === 'checking';
                        const detail = isOffline
                            ? offlineStorageAvailable === false
                                ? 'Offline. Checkout is unavailable because saved data cannot be opened.'
                                : offlineStorageAvailable === null
                                    ? 'Offline. Checking whether saved services are available.'
                                    : 'Offline. You can add walk-ins with services saved on this device.'
                            : isChecking ? 'Checking the connection.' : 'Connected to the internet.';
                        const Icon = isOffline ? WifiOff : isChecking ? LoaderCircle : Wifi;
                        return (
                            <div
                                role="status"
                                aria-live="polite"
                                aria-label={detail}
                                title={detail}
                                className={`inline-flex h-8 items-center gap-2 rounded-full border px-3 text-xs font-semibold ${
                                    isOffline
                                        ? 'border-amber-300/25 bg-amber-300/[0.08] text-amber-200'
                                        : isChecking
                                            ? 'border-white/10 bg-white/[0.04] text-ivory-dim'
                                            : 'border-emerald-300/20 bg-emerald-300/[0.07] text-emerald-200'
                                }`}
                            >
                                <Icon className={`h-3.5 w-3.5 ${isChecking ? 'animate-spin' : ''}`} aria-hidden="true" />
                                <span>{isOffline ? 'Offline' : isChecking ? 'Checking' : 'Online'}</span>
                                {isOffline && offlineStorageAvailable === false && (
                                    <span className="hidden border-l border-amber-200/20 pl-2 text-[10px] font-medium sm:inline">Checkout unavailable</span>
                                )}
                                {isOffline && offlineStorageAvailable === null && (
                                    <span className="hidden border-l border-amber-200/20 pl-2 text-[10px] font-medium sm:inline">Checking saved services</span>
                                )}
                            </div>
                        );
                    })()}

                    {/* Emergency Disruption Trigger Button (temporarily disabled) */}
                    {/*
                    <button
                        type="button"
                        onClick={() => setIsEmergencyModalOpen(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-950/60 hover:bg-red-900/80 border border-red-800/60 text-red-300 text-xs font-bold uppercase tracking-wider rounded-md transition-all shadow-sm"
                        title="Trigger Emergency Disruption"
                    >
                        <ShieldAlert className="w-4 h-4 text-red-400" />
                        <span className="hidden sm:inline">Emergency Trigger</span>
                    </button>
                    */}

                    <NotificationBell
                        visibleEvents={CASHIER_VISIBLE_NOTIFICATION_EVENTS}
                        popupEvents={CASHIER_POPUP_NOTIFICATION_EVENTS}
                        onSelect={setSelectedNotification}
                        onNewNotification={handleNewNotification}
                    />

                    <div className="pl-3 md:pl-6 border-l border-white/10">
                        <ModuleSwitcher
                            currentModuleId="cashier"
                            profilePath="/cashier/profile"
                            profileLabel="Staff Profile"
                            onLogout={handleLogout}
                        />
                    </div>
                </div>
            </header>

            <NotificationDetailModal
                isOpen={!!selectedNotification}
                notification={selectedNotification}
                onClose={() => setSelectedNotification(null)}
                onAction={(action) => {
                    if (action === 'review_queue') {
                        navigate('/cashier/queue?view=reservations');
                        window.dispatchEvent(new CustomEvent('demoshop:queue-view', { detail: 'reservations' }));
                    }
                }}
            />


            {isEmergencyModalOpen && (
                <EmergencyCancelModal
                    barbers={barbersList}
                    branchId={user?.branch_id || 1}
                    onClose={() => setIsEmergencyModalOpen(false)}
                    onSuccess={(result) => {
                        setIsEmergencyModalOpen(false);
                        addToast({
                            type: 'success',
                            title: 'Emergency Cancellation Triggered',
                            message: `Processed emergency disruption: ${result.cancelledCount} booking(s) affected.`,
                        });
                    }}
                />
            )}

        </>
    );
};

export default Header;

