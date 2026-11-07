import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router';
import {
    Search, Users, Store, Scissors, Shield,
    Package, Sparkles, Loader2, X, ArrowRight,
    Calendar, Receipt, ClipboardList, Sliders,
    FileText, LayoutGrid
} from 'lucide-react';
import { useAuth } from '@/components/auth/AuthContext';
import { NotificationBell, type AppNotification } from '@/components/common/NotificationBell';
import { NotificationDetailModal } from '@/components/common/NotificationDetailModal';
import { useGlobalSearch } from '@/features/admin/hooks/useGlobalSearch';
import { api } from '@/config/api';
import { ModuleSwitcher } from '@/components/navigation/ModuleSwitcher';
import { CustomerReliabilityBadge } from '@/features/admin/components/Management/CustomerReliabilityBadge';
import { AccountSettingsModal } from './AccountSettingsModal';
import type { GlobalSearchResult } from '@demoshop/shared-types';

const highlightMatch = (text: string, query: string) => {
    if (!query || !query.trim()) return text;
    const q = query.trim();
    const regex = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) =>
        regex.test(part) ? (
            <mark key={i} className="bg-gold/30 text-gold font-bold px-0.5 rounded-xs">
                {part}
            </mark>
        ) : (
            part
        )
    );
};

interface HeaderProps {
    activeTab: string;
    activeSubTab?: string;
    handleLogout?: () => void;
    searchQuery?: string;
    onSearchChange?: (query: string) => void;
    onNavigateTab?: (tab: string, subTab?: string, extraParams?: Record<string, string>) => void;
}

const TAB_TITLES: Record<string, string> = {
    dashboard: 'Dashboard',
    management: 'Management',
    inventory: 'Inventory',
    appointments: 'Reservations',
    settings: 'Configuration',
    'purchase-orders': 'Stock Requests',
    reports: 'Reports & Audits',
    transactions: 'Transaction History',
};

const MANAGEMENT_SUB_TITLES: Record<string, string> = {
    staff: 'Staff Directory',
    shifts: 'Staff Shifts',
    services: 'Services',
    'roles-access': 'Roles & Access',
    reviews: 'Barbershop Reviews',
    drawer: 'Money Drawer',
    inventory: 'Inventory',
};

const INVENTORY_SUB_TITLES: Record<string, string> = {
    consumables: 'Consumables',
    retails: 'Retails',
    suppliers: 'Suppliers',
};

const REPORTS_SUB_TITLES: Record<string, string> = {
    transactions: 'Transactions',
    'reports-transactions': 'Transactions',
    inventory: 'Inventory Report',
    sales: 'Sales',
    commissions: 'Commissions',
    appointments: 'Reservations',
    'audit-logs': 'Audit Logs',
    'account-security': 'Audit Logs',
};

const ADMIN_VISIBLE_NOTIFICATION_EVENTS = [
    'barber_shift_request',
    'inventory_purchase_order_pending',
    'inventory_purchase_order_approved',
    'inventory_purchase_order_rejected',
    'inventory_stock_count_pending',
    'reservation_cancelled',
    'reservation_pending',
    'cashier_reservation_pending',
    'reservation_confirmed',
] as const;
const ADMIN_POPUP_NOTIFICATION_EVENTS = [
    'barber_shift_request',
    'inventory_purchase_order_pending',
    'inventory_stock_count_pending',
    'reservation_cancelled',
    'reservation_pending',
    'cashier_reservation_pending',
] as const;

export const Header: React.FC<HeaderProps> = ({
    activeTab,
    activeSubTab,
    handleLogout,
    searchQuery: externalSearchQuery,
    onSearchChange,
    onNavigateTab,
}) => {
    const { user, isSystemAdmin } = useAuth();
    const navigate = useNavigate();
    const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
    const [selectedNotification, setSelectedNotification] = useState<AppNotification | null>(null);
    const [selectedIndex, setSelectedIndex] = useState<number>(-1);
    const [isAccountSettingsOpen, setIsAccountSettingsOpen] = useState(false);

    const handleNotificationSelect = (notification: AppNotification) => {
        setSelectedNotification(notification);
        if (!notification.read) {
            api.patch(`/api/notifications/${notification.id}/read`).catch(() => {});
            window.dispatchEvent(new CustomEvent('demoshop:notification-read', { detail: { id: notification.id } }));
        }
    };

    const searchContainerRef = useRef<HTMLDivElement>(null);
    const mobileSearchContainerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const {
        query,
        setQuery,
        results,
        isLoading,
        isOpen,
        setIsOpen,
        clearSearch,
    } = useGlobalSearch({ debounceMs: 300, minChars: 2 });

    // Global keyboard shortcut (Ctrl+K or /)
    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                inputRef.current?.focus();
                if (query.trim().length >= 2) setIsOpen(true);
            } else if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
                e.preventDefault();
                inputRef.current?.focus();
                if (query.trim().length >= 2) setIsOpen(true);
            }
        };
        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, [query, setIsOpen]);

    // Synchronize query changes with parent if needed
    const handleQueryChange = (val: string) => {
        setQuery(val);
        setSelectedIndex(-1);
        if (val.trim().length >= 2) {
            setIsOpen(true);
        } else {
            setIsOpen(false);
        }
        onSearchChange?.(val);
    };

    const handleSelectResult = useCallback((item: GlobalSearchResult) => {
        setIsOpen(false);
        clearSearch();
        setIsMobileSearchOpen(false);
        onSearchChange?.('');
        inputRef.current?.blur();
        navigate(item.targetUrl);
    }, [clearSearch, navigate, onSearchChange, setIsOpen]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!isOpen) {
            if (e.key === 'ArrowDown' && results.length > 0) {
                setIsOpen(true);
                setSelectedIndex(0);
                e.preventDefault();
            }
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (selectedIndex >= 0 && selectedIndex < results.length) {
                handleSelectResult(results[selectedIndex]);
            }
        } else if (e.key === 'Escape') {
            setIsOpen(false);
            setSelectedIndex(-1);
        }
    };

    // Close search popover on outside clicks
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (
                searchContainerRef.current &&
                !searchContainerRef.current.contains(target) &&
                (!mobileSearchContainerRef.current || !mobileSearchContainerRef.current.contains(target))
            ) {
                setIsOpen(false);
                setSelectedIndex(-1);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [setIsOpen]);

    const renderResultIcon = (type: GlobalSearchResult['type']) => {
        switch (type) {
            case 'staff':
                return <Scissors className="w-4 h-4 text-sky-400 shrink-0" />;
            case 'inventory':
                return <Package className="w-4 h-4 text-amber-400 shrink-0" />;
            case 'service':
                return <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />;
            case 'appointment':
                return <Calendar className="w-4 h-4 text-purple-400 shrink-0" />;
            case 'transaction':
                return <Receipt className="w-4 h-4 text-emerald-400 shrink-0" />;
            case 'stock_request':
                return <ClipboardList className="w-4 h-4 text-amber-400 shrink-0" />;
            case 'account':
                return <Users className="w-4 h-4 text-sky-400 shrink-0" />;
            case 'feature':
                return <Sliders className="w-4 h-4 text-blue-400 shrink-0" />;
            case 'audit_log':
                return <FileText className="w-4 h-4 text-amber-400 shrink-0" />;
            case 'tool':
                return <LayoutGrid className="w-4 h-4 text-gold shrink-0" />;
            default:
                return <Search className="w-4 h-4 text-gold shrink-0" />;
        }
    };

    const renderResultBadge = (type: GlobalSearchResult['type']) => {
        switch (type) {
            case 'staff':
                return (
                    <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 shrink-0">
                        Staff
                    </span>
                );
            case 'inventory':
                return (
                    <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 shrink-0">
                        Inventory
                    </span>
                );
            case 'service':
                return (
                    <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shrink-0">
                        Service
                    </span>
                );
            case 'appointment':
                return (
                    <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded bg-purple-500/15 text-purple-300 border border-purple-500/30 shrink-0">
                        Booking
                    </span>
                );
            case 'transaction':
                return (
                    <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shrink-0">
                        Receipt
                    </span>
                );
            case 'stock_request':
                return (
                    <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 shrink-0">
                        PO
                    </span>
                );
            case 'account':
                return (
                    <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 shrink-0">
                        Account
                    </span>
                );
            case 'feature':
                return (
                    <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded bg-blue-500/15 text-blue-300 border border-blue-500/30 shrink-0">
                        Feature
                    </span>
                );
            case 'audit_log':
                return (
                    <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 shrink-0">
                        Audit
                    </span>
                );
            case 'tool':
                return (
                    <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded bg-gold/15 text-gold border border-gold/30 shrink-0">
                        Tool
                    </span>
                );
            default:
                return null;
        }
    };

    return (
        <>
            <header data-print-hide className="sticky top-0 h-16 md:h-20 shrink-0 bg-charcoal/95 backdrop-blur-md border-b border-white/5 z-20 px-3 sm:px-4 md:px-8 flex justify-between items-center gap-2 print:hidden">
                <h2 className="min-w-0 flex-1 text-sm sm:text-lg md:text-xl font-serif font-bold text-ivory truncate">
                    <span className="sm:hidden">
                        {activeTab === 'management' && activeSubTab && MANAGEMENT_SUB_TITLES[activeSubTab]
                            ? MANAGEMENT_SUB_TITLES[activeSubTab]
                            : activeTab === 'inventory' && activeSubTab && INVENTORY_SUB_TITLES[activeSubTab]
                                ? INVENTORY_SUB_TITLES[activeSubTab]
                            : activeTab === 'reports' && activeSubTab && REPORTS_SUB_TITLES[activeSubTab]
                                ? (REPORTS_SUB_TITLES[activeSubTab] === 'Transaction History' ? 'Transactions' : REPORTS_SUB_TITLES[activeSubTab])
                            : activeTab === 'transactions'
                                ? 'Transactions'
                            : (TAB_TITLES[activeTab] || activeTab)}
                    </span>
                    <span className="hidden sm:inline">
                        {activeTab === 'management' && activeSubTab && MANAGEMENT_SUB_TITLES[activeSubTab]
                            ? `${MANAGEMENT_SUB_TITLES[activeSubTab]} Overview`
                            : activeTab === 'inventory' && activeSubTab && INVENTORY_SUB_TITLES[activeSubTab]
                                ? `${INVENTORY_SUB_TITLES[activeSubTab]} Overview`
                            : activeTab === 'reports' && activeSubTab && REPORTS_SUB_TITLES[activeSubTab]
                                ? `${REPORTS_SUB_TITLES[activeSubTab]} Overview`
                            : `${TAB_TITLES[activeTab] || activeTab} Overview`}
                    </span>
                </h2>

                <div className="flex shrink-0 items-center gap-1.5 sm:gap-3 md:gap-6">
                    {/* Desktop Omnibar Search Input & Dropdown */}
                    <div className="relative hidden md:block" ref={searchContainerRef}>
                        <div className="relative flex items-center">
                            <input
                                ref={inputRef}
                                type="search"
                                role="combobox"
                                aria-label="Global search across staff, inventory, appointments, receipts, and services"
                                aria-expanded={isOpen}
                                aria-autocomplete="list"
                                value={query}
                                onChange={(e) => handleQueryChange(e.target.value)}
                                onFocus={() => {
                                    if (query.trim().length >= 2) setIsOpen(true);
                                }}
                                onKeyDown={handleKeyDown}
                                placeholder="Search appointments, staff, receipts, stock…"
                                className="min-h-[44px] bg-white/5 border border-white/10 rounded-full py-2 pl-10 pr-10 text-sm text-ivory focus:border-gold focus:bg-white/[0.08] outline-none w-72 lg:w-84 transition-all shadow-inner"
                            />
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ivory-dim w-4 h-4 pointer-events-none" />
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
                                {isLoading ? (
                                    <Loader2 className="text-gold w-4 h-4 animate-spin pointer-events-auto" />
                                ) : query ? (
                                    <button
                                        type="button"
                                        onClick={() => handleQueryChange('')}
                                        aria-label="Clear search"
                                        className="flex h-7 w-7 items-center justify-center text-ivory-dim hover:text-ivory transition-colors cursor-pointer pointer-events-auto"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                ) : null}
                            </div>
                        </div>

                        {/* Dropdown Popover */}
                        {isOpen && query.trim().length >= 2 && (
                            <div className="absolute left-0 top-full mt-2 w-80 lg:w-96 bg-charcoal-light/98 backdrop-blur-md border border-white/10 rounded-lg shadow-2xl z-50 overflow-hidden animate-fade-in divide-y divide-white/5">
                                <div className="px-3 py-2 bg-white/[0.02] flex items-center justify-between text-[11px] text-ivory-dim">
                                    <span className="font-bold uppercase tracking-wider text-gold/80">Search Results</span>
                                    <span>{isLoading ? 'Searching…' : `${results.length} found`}</span>
                                </div>

                                {isLoading && results.length === 0 ? (
                                    <div className="p-4 text-center text-xs text-ivory-dim flex items-center justify-center gap-2">
                                        <Loader2 className="w-4 h-4 animate-spin text-gold" />
                                        <span>Searching across platform resources…</span>
                                    </div>
                                ) : results.length === 0 ? (
                                    <div className="p-4 text-center text-xs text-ivory-dim space-y-1">
                                        <p>No results found for "<span className="text-ivory font-medium">{query}</span>".</p>
                                        <p className="text-[11px] text-ivory-dim/60">Try searching appointments, staff members, services, receipts, or stock requests.</p>
                                    </div>
                                ) : (
                                    <ul className="max-h-80 overflow-y-auto py-1 divide-y divide-white/5 custom-scrollbar" role="listbox">
                                        {results.map((item, index) => {
                                            const isSelected = selectedIndex === index;
                                            return (
                                                <li
                                                    key={item.id}
                                                    role="option"
                                                    aria-selected={isSelected}
                                                    onClick={() => handleSelectResult(item)}
                                                    onMouseEnter={() => setSelectedIndex(index)}
                                                    className={`px-3.5 py-2.5 flex items-center justify-between gap-3 cursor-pointer transition-colors group ${
                                                        isSelected ? 'bg-gold/15 text-gold' : 'hover:bg-white/5 text-ivory'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                                        <div className="p-1.5 rounded-sm bg-white/5 border border-white/5 group-hover:border-gold/30 transition-colors">
                                                            {renderResultIcon(item.type)}
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                                <p className={`text-xs font-semibold truncate ${isSelected ? 'text-gold' : 'text-ivory group-hover:text-gold'}`}>
                                                                    {highlightMatch(item.title, query)}
                                                                </p>
                                                                {item.metadata?.reliability ? (
                                                                    <CustomerReliabilityBadge stats={item.metadata.reliability as any} compact />
                                                                ) : null}
                                                            </div>
                                                            {item.subtitle && (
                                                                <p className="text-[10px] text-ivory-dim truncate mt-0.5">
                                                                    {highlightMatch(item.subtitle, query)}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2 shrink-0">
                                                        {renderResultBadge(item.type)}
                                                        <ArrowRight className={`w-3.5 h-3.5 transition-transform ${isSelected ? 'text-gold translate-x-0.5' : 'text-ivory-dim group-hover:text-gold'}`} />
                                                    </div>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Mobile Search Toggle Button */}
                    <div className="md:hidden" ref={mobileSearchContainerRef}>
                        <button
                            type="button"
                            aria-label="Toggle mobile search"
                            onClick={() => setIsMobileSearchOpen((prev) => !prev)}
                            className="min-h-[44px] min-w-[44px] rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-ivory hover:text-gold transition-colors cursor-pointer"
                        >
                            <Search className="w-4 h-4" />
                        </button>
                    </div>

                    <NotificationBell
                        visibleEvents={ADMIN_VISIBLE_NOTIFICATION_EVENTS}
                        popupEvents={ADMIN_POPUP_NOTIFICATION_EVENTS}
                        onSelect={handleNotificationSelect}
                        onNewNotification={setSelectedNotification}
                    />

                    <div className="pl-2 sm:pl-3 md:pl-6 border-l border-white/10">
                        <ModuleSwitcher
                            currentModuleId="admin"
                            forceProfileMenu={true}
                            onOpenProfile={() => setIsAccountSettingsOpen(true)}
                            profileLabel="Account Settings"
                            onLogout={handleLogout}
                        />
                    </div>
                </div>
            </header>

            {/* Mobile Expandable Search Bar */}
            {isMobileSearchOpen && (
                <div className="md:hidden bg-charcoal border-b border-white/10 px-4 py-3 sticky top-16 z-20 animate-fade-in" ref={mobileSearchContainerRef}>
                    <div className="relative flex items-center">
                        <input
                            type="search"
                            autoFocus
                            aria-label="Mobile search"
                            value={query}
                            onChange={(e) => handleQueryChange(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Search staff, inventory, services…"
                            className="min-h-[44px] w-full bg-white/5 border border-white/10 rounded-full py-2 pl-10 pr-9 text-sm text-ivory focus:border-gold outline-none"
                        />
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ivory-dim w-4 h-4 pointer-events-none" />
                        {isLoading ? (
                            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 text-gold w-4 h-4 animate-spin" />
                        ) : query ? (
                            <button
                                type="button"
                                onClick={() => handleQueryChange('')}
                                className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center text-ivory-dim hover:text-ivory"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        ) : null}
                    </div>

                    {query.trim().length >= 2 && (
                        <div className="mt-2 bg-charcoal-light border border-white/10 rounded-lg shadow-2xl overflow-hidden divide-y divide-white/5">
                            {isLoading && results.length === 0 ? (
                                <div className="p-3 text-center text-xs text-ivory-dim flex items-center justify-center gap-2">
                                    <Loader2 className="w-4 h-4 animate-spin text-gold" />
                                    <span>Searching…</span>
                                </div>
                            ) : results.length === 0 ? (
                                <div className="p-3 text-center text-xs text-ivory-dim">
                                    No results found for "{query}".
                                </div>
                            ) : (
                                <ul className="max-h-60 overflow-y-auto py-1 divide-y divide-white/5">
                                    {results.map((item) => (
                                        <li
                                            key={item.id}
                                            onClick={() => handleSelectResult(item)}
                                            className="min-h-[44px] px-3 py-2 flex items-center justify-between gap-2 cursor-pointer hover:bg-white/5"
                                        >
                                            <div className="flex items-center gap-2 min-w-0">
                                                {renderResultIcon(item.type)}
                                                <div className="min-w-0">
                                                    <p className="text-xs font-semibold text-ivory truncate">{item.title}</p>
                                                    {item.subtitle && <p className="text-[10px] text-ivory-dim truncate">{item.subtitle}</p>}
                                                </div>
                                            </div>
                                            {renderResultBadge(item.type)}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                </div>
            )}

            <NotificationDetailModal
                isOpen={!!selectedNotification}
                notification={selectedNotification}
                onClose={() => setSelectedNotification(null)}
                onAction={(action) => {
                    if (action === 'view_purchase_orders') {
                        onNavigateTab?.('purchase-orders', 'awaiting-approval');
                    } else if (action === 'review_inventory_stock_counts') {
                        onNavigateTab?.('reports', 'inventory', { inventorySection: 'submissions' });
                    } else if (action === 'review_queue') {
                        onNavigateTab?.('appointments');
                    } else if (action === 'view_shift_requests') {
                        onNavigateTab?.('management', 'shifts');
                    }
                }}
            />

            <AccountSettingsModal
                isOpen={isAccountSettingsOpen}
                onClose={() => setIsAccountSettingsOpen(false)}
            />
        </>
    );
};

export default Header;
