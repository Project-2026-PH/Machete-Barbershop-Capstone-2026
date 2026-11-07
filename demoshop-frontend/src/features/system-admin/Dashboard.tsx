import React, { useState, useEffect, useRef, useCallback, Suspense, lazy } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
    LayoutDashboard,
    Users,
    LogOut,
    Search,
    Bell,
    Shield,
    UserCog,
    Store,
    Scissors,
    Sliders,
    FileText,
    LayoutGrid,
    Loader2,
    X,
    ArrowRight
} from 'lucide-react';
import { useGlobalSearch } from '@/features/admin/hooks/useGlobalSearch';
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

import { BottomNavigation } from './components/BottomNavigation';
import { Sidebar } from './components/Sidebar';
import { LogoutModal } from '@/components/common/LogoutModal';
import { NotificationBell, type AppNotification } from '@/components/common/NotificationBell';
import { NotificationDetailModal } from '@/components/common/NotificationDetailModal';
import { ModuleSwitcher } from '@/components/navigation/ModuleSwitcher';

const Overview = lazy(() => import('./components/Overview').then(m => ({ default: m.Overview })));
const AccountManagement = lazy(() => import('./components/AccountManagement').then(m => ({ default: m.AccountManagement })));
const AuditLogs = lazy(() => import('./components/AuditLogs').then(m => ({ default: m.AuditLogs })));
const FeatureManagement = lazy(() => import('./components/FeatureManagement').then(m => ({ default: m.FeatureManagement })));
const SystemHealth = lazy(() => import('./components/SystemHealth').then(m => ({ default: m.SystemHealth })));
const Diagnostics = lazy(() => import('./components/Diagnostics').then(m => ({ default: m.Diagnostics })));
const DatabaseTrafficMonitor = lazy(() => import('./components/DatabaseTrafficMonitor').then(m => ({ default: m.DatabaseTrafficMonitor })));

const POSTab = lazy(() => import('@/features/cashier/tabs/POSTab'));
const ReservationsTab = lazy(() => import('@/features/cashier/tabs/ReservationsTab'));
const InventoryTab = lazy(() => import('@/features/cashier/tabs/InventoryTab'));
import { QueueDataProvider } from '@/features/cashier/context/QueueDataContext';
import { useFeatures } from '@/context/FeatureContext';
import { useToast } from '@/components/feedback/ToastContext';
import { useAuth } from '@/components/auth/AuthContext';

const SYSTEM_ADMIN_VISIBLE_NOTIFICATION_EVENTS = [
    'barber_shift_request',
    'reservation_cancelled',
    'reservation_pending',
    'cashier_reservation_pending',
    'reservation_confirmed',
] as const;
const SYSTEM_ADMIN_POPUP_NOTIFICATION_EVENTS = [
    'barber_shift_request',
    'reservation_cancelled',
    'reservation_pending',
    'cashier_reservation_pending',
] as const;

export const AdminDashboard = () => {
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [searchParams, setSearchParams] = useSearchParams();
    const tabFromUrl = searchParams.get('tab');
    const verificationFromUrl = searchParams.get('verification');
    const roleFromUrl = searchParams.get('role');
    const statusFromUrl = searchParams.get('status');
    const categoryFromUrl = searchParams.get('category');
    const filterFromUrl = searchParams.get('filter');
    const searchFromUrl = searchParams.get('search');

    const normalizeTab = (raw: string | null): string => {
        if (!raw) return 'overview';
        if (raw === 'users' || raw === 'admins') return 'accounts';
        if (['overview', 'accounts', 'audit', 'features', 'health', 'diagnostics', 'database-traffic', 'operations-pos', 'operations-queue', 'operations-inventory'].includes(raw)) return raw;
        return 'overview';
    };

    const [activeTab, setActiveTabState] = useState(() => normalizeTab(tabFromUrl));
    const [controlsSubTab, setControlsSubTab] = useState<'features' | 'access' | 'content'>(() => {
        const sub = searchParams.get('subtab');
        if (sub === 'access' || sub === 'content') return sub;
        return 'features';
    });

    // Account Management scoped state (synchronized with searchParams when on accounts tab)
    const [accountCategory, setAccountCategory] = useState<string>(categoryFromUrl || 'all');
    const [accountRole, setAccountRole] = useState<string>(roleFromUrl || 'all');
    const [accountStatus, setAccountStatus] = useState<string>(statusFromUrl || 'all');
    const [accountVerification, setAccountVerification] = useState<string>(verificationFromUrl || 'all');
    const [accountSearch, setAccountSearch] = useState<string>(searchFromUrl || '');
    const [isProvisionModalOpen, setIsProvisionModalOpen] = useState(false);

    // Audit logs scoped state (synchronized with searchParams)
    const [auditFilter, setAuditFilter] = useState(filterFromUrl || '');

    const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
    const [selectedNotification, setSelectedNotification] = useState<AppNotification | null>(null);

    const navigate = useNavigate();

    const setActiveTab = (tab: string) => {
        const normalized = normalizeTab(tab);
        setActiveTabState(normalized);
        setSearchParams(prev => {
            const next = new URLSearchParams();
            next.set('tab', normalized);
            if (normalized === 'features') {
                next.set('subtab', controlsSubTab);
            }
            return next;
        }, { replace: true });
    };

    const handleControlsTabChange = (subTab: 'features' | 'access' | 'content') => {
        setControlsSubTab(subTab);
        setActiveTabState('features');
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            next.set('tab', 'features');
            next.set('subtab', subTab);
            return next;
        }, { replace: true });
    };

    const handleNavigateToAccounts = (options?: {
        category?: string;
        role?: string;
        status?: string;
        verification?: string;
        search?: string;
    }) => {
        const targetCategory = options?.category || 'all';
        const targetRole = options?.role || 'all';
        const targetStatus = options?.status || 'all';
        const targetVerification = options?.verification || 'all';
        const targetSearch = options?.search || '';

        setAccountCategory(targetCategory);
        setAccountRole(targetRole);
        setAccountStatus(targetStatus);
        setAccountVerification(targetVerification);
        setAccountSearch(targetSearch);
        setActiveTabState('accounts');

        setSearchParams(prev => {
            const next = new URLSearchParams();
            next.set('tab', 'accounts');
            if (targetCategory !== 'all') next.set('category', targetCategory);
            if (targetRole !== 'all') next.set('role', targetRole);
            if (targetStatus !== 'all') next.set('status', targetStatus);
            if (targetVerification !== 'all') next.set('verification', targetVerification);
            if (targetSearch.trim()) next.set('search', targetSearch.trim());
            return next;
        }, { replace: true });
    };

    // Sync state if URL changes externally (e.g. back/forward button or route search params)
    useEffect(() => {
        if (tabFromUrl) {
            const normalized = normalizeTab(tabFromUrl);
            setActiveTabState(normalized);
        }
        if (tabFromUrl === 'accounts') {
            setAccountCategory(categoryFromUrl || 'all');
            setAccountRole(roleFromUrl || 'all');
            setAccountStatus(statusFromUrl || 'all');
            setAccountVerification(verificationFromUrl || 'all');
            setAccountSearch(searchFromUrl || '');
        }
        if (tabFromUrl === 'audit') {
            setAuditFilter(filterFromUrl || '');
        }
        if (tabFromUrl === 'features') {
            const sub = searchParams.get('subtab');
            if (sub === 'access' || sub === 'content') {
                setControlsSubTab(sub);
            } else {
                setControlsSubTab('features');
            }
        }
    }, [tabFromUrl, categoryFromUrl, roleFromUrl, statusFromUrl, verificationFromUrl, filterFromUrl, searchFromUrl, searchParams]);

    // System Admin Omnibar Search State and Hooks
    const searchContainerRef = useRef<HTMLDivElement>(null);
    const mobileSearchContainerRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const [selectedIndex, setSelectedIndex] = useState<number>(-1);
    const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);

    const {
        query: omnibarQuery,
        setQuery: setOmnibarQuery,
        results: omnibarResults,
        isLoading: isOmnibarLoading,
        isOpen: isOmnibarOpen,
        setIsOpen: setIsOmnibarOpen,
        clearSearch: clearOmnibarSearch,
    } = useGlobalSearch({
        endpoint: '/api/system-admin/search',
        scope: 'system',
        debounceMs: 300,
        minChars: 2,
    });

    // Global keyboard shortcut (Ctrl+K or /)
    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                searchInputRef.current?.focus();
                if (omnibarQuery.trim().length >= 2) setIsOmnibarOpen(true);
            } else if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
                e.preventDefault();
                searchInputRef.current?.focus();
                if (omnibarQuery.trim().length >= 2) setIsOmnibarOpen(true);
            }
        };
        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, [omnibarQuery, setIsOmnibarOpen]);

    // Close search popover on outside clicks
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (
                searchContainerRef.current &&
                !searchContainerRef.current.contains(target) &&
                (!mobileSearchContainerRef.current || !mobileSearchContainerRef.current.contains(target))
            ) {
                setIsOmnibarOpen(false);
                setSelectedIndex(-1);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [setIsOmnibarOpen]);

    const handleSelectResult = useCallback((item: GlobalSearchResult) => {
        setIsOmnibarOpen(false);
        clearOmnibarSearch();
        setIsMobileSearchOpen(false);
        setSelectedIndex(-1);
        navigate(item.targetUrl);
    }, [clearOmnibarSearch, navigate, setIsOmnibarOpen]);

    const handleOmnibarKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!isOmnibarOpen) {
            if (e.key === 'ArrowDown' && omnibarResults.length > 0) {
                setIsOmnibarOpen(true);
                setSelectedIndex(0);
                e.preventDefault();
            }
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex((prev) => (prev < omnibarResults.length - 1 ? prev + 1 : 0));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex((prev) => (prev > 0 ? prev - 1 : omnibarResults.length - 1));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (selectedIndex >= 0 && selectedIndex < omnibarResults.length) {
                handleSelectResult(omnibarResults[selectedIndex]);
            }
        } else if (e.key === 'Escape') {
            setIsOmnibarOpen(false);
            setSelectedIndex(-1);
        }
    };

    const renderResultIcon = (type: GlobalSearchResult['type']) => {
        switch (type) {
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

    // Active operational feature revocation watcher
    const { hasAccess } = useFeatures();
    const { addToast } = useToast();
    const canAccessPos = hasAccess('cashier_pos');
    const canAccessQueue = hasAccess('customer_queue');
    const canAccessInventory = hasAccess('inventory_management');

    useEffect(() => {
        if (activeTab === 'operations-pos' && !canAccessPos) {
            addToast({
                type: 'warning',
                title: 'Access Revoked',
                message: 'Access to Point of Sale (POS) was revoked in System Controls.',
            });
            setActiveTab('overview');
        }
        if (activeTab === 'operations-queue' && !canAccessQueue) {
            addToast({
                type: 'warning',
                title: 'Access Revoked',
                message: 'Access to Walk-in Queue was revoked in System Controls.',
            });
            setActiveTab('overview');
        }
        if (activeTab === 'operations-inventory' && !canAccessInventory) {
            addToast({
                type: 'warning',
                title: 'Access Revoked',
                message: 'Access to Inventory & Stock Control was revoked in System Controls.',
            });
            setActiveTab('overview');
        }
    }, [activeTab, canAccessPos, canAccessQueue, canAccessInventory, addToast]);

    // Enforce dark luxury theme across entire System Admin workspace
    useEffect(() => {
        document.body.classList.remove('light-mode');
        document.documentElement.classList.remove('light-mode');
    }, []);

    // Get current user from AuthContext (populated via Supabase session)
    const { user: currentUser, logout } = useAuth();

    const handleLogout = () => {
        setIsLogoutModalOpen(true);
    };

    const confirmLogout = async () => {
        await logout();
    };

    const renderContent = () => {
        return (
            <Suspense fallback={<div className="py-12 flex justify-center text-ivory-dim text-sm animate-pulse">Loading administrative module...</div>}>
                {activeTab === 'overview' && (
                    <Overview
                        setActiveTab={setActiveTab}
                        onNavigateToAccounts={handleNavigateToAccounts}
                        onSelectCategory={(cat) => handleNavigateToAccounts({ category: cat })}
                        onSelectRole={(role) => handleNavigateToAccounts({ role })}
                        onSelectStatus={(status) => handleNavigateToAccounts({ status })}
                        onSelectVerification={(ver) => handleNavigateToAccounts({ verification: ver })}
                        onOpenProvisionModal={() => { setIsProvisionModalOpen(true); handleNavigateToAccounts(); }}
                    />
                )}
                {activeTab === 'accounts' && (
                    <AccountManagement
                        initialCategory={accountCategory}
                        onCategoryChange={(cat) => {
                            setAccountCategory(cat);
                            setSearchParams(prev => {
                                const next = new URLSearchParams(prev);
                                if (cat === 'all') next.delete('category');
                                else next.set('category', cat);
                                return next;
                            }, { replace: true });
                        }}
                        initialRole={accountRole}
                        onRoleChange={(role) => {
                            setAccountRole(role);
                            setSearchParams(prev => {
                                const next = new URLSearchParams(prev);
                                if (role === 'all') next.delete('role');
                                else next.set('role', role);
                                return next;
                            }, { replace: true });
                        }}
                        initialStatus={accountStatus}
                        onStatusChange={(status) => {
                            setAccountStatus(status);
                            setSearchParams(prev => {
                                const next = new URLSearchParams(prev);
                                if (status === 'all') next.delete('status');
                                else next.set('status', status);
                                return next;
                            }, { replace: true });
                        }}
                        initialVerification={accountVerification}
                        onVerificationChange={(ver) => {
                            setAccountVerification(ver);
                            setSearchParams(prev => {
                                const next = new URLSearchParams(prev);
                                if (ver === 'all') next.delete('verification');
                                else next.set('verification', ver);
                                return next;
                            }, { replace: true });
                        }}
                        initialSearch={accountSearch}
                        onSearchChange={(search) => {
                            setAccountSearch(search);
                            setSearchParams(prev => {
                                const next = new URLSearchParams(prev);
                                if (!search.trim()) next.delete('search');
                                else next.set('search', search.trim());
                                return next;
                            }, { replace: true });
                        }}
                        isProvisionModalOpenExternally={isProvisionModalOpen}
                        onCloseProvisionModalExternally={() => setIsProvisionModalOpen(false)}
                        onViewAuditLogs={(email) => {
                            setAuditFilter(email);
                            setActiveTab('audit');
                            setSearchParams(prev => {
                                const next = new URLSearchParams();
                                next.set('tab', 'audit');
                                if (email.trim()) next.set('filter', email.trim());
                                return next;
                            }, { replace: true });
                        }}
                    />
                )}
                {activeTab === 'audit' && (
                    <AuditLogs
                        auditFilter={auditFilter}
                        setAuditFilter={(filter) => {
                            setAuditFilter(filter);
                            setSearchParams(prev => {
                                const next = new URLSearchParams(prev);
                                if (!filter.trim()) next.delete('filter');
                                else next.set('filter', filter.trim());
                                return next;
                            }, { replace: true });
                        }}
                    />
                )}
                {activeTab === 'features' && (
                    <FeatureManagement 
                        initialTab={controlsSubTab}
                        onTabChange={handleControlsTabChange}
                    />
                )}
                {activeTab === 'health' && <SystemHealth />}
                {activeTab === 'diagnostics' && (
                    <Diagnostics 
                        setActiveTab={setActiveTab} 
                        onNavigateControlsSubTab={handleControlsTabChange} 
                    />
                )}
                {activeTab === 'database-traffic' && <DatabaseTrafficMonitor />}
                {activeTab === 'operations-pos' && (
                    <QueueDataProvider>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between pb-3 border-b border-white/5">
                                <div>
                                    <h2 className="text-xl font-serif font-bold text-ivory">Point of Sale (POS)</h2>
                                    <p className="text-xs text-ivory-dim/60 font-mono">Counter Register & Order Processing</p>
                                </div>
                                <span className="px-2 py-0.5 rounded bg-gold/15 text-gold border border-gold/30 text-[10px] font-mono font-bold uppercase">
                                    Superadmin Operator
                                </span>
                            </div>
                            <POSTab />
                        </div>
                    </QueueDataProvider>
                )}
                {activeTab === 'operations-queue' && (
                    <QueueDataProvider>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between pb-3 border-b border-white/5">
                                <div>
                                    <h2 className="text-xl font-serif font-bold text-ivory">Walk-in Queue Dispatcher</h2>
                                    <p className="text-xs text-ivory-dim/60 font-mono">Live Waitlist & Customer Management</p>
                                </div>
                                <span className="px-2 py-0.5 rounded bg-gold/15 text-gold border border-gold/30 text-[10px] font-mono font-bold uppercase">
                                    Superadmin Operator
                                </span>
                            </div>
                            <ReservationsTab />
                        </div>
                    </QueueDataProvider>
                )}
                {activeTab === 'operations-inventory' && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between pb-3 border-b border-white/5">
                            <div>
                                <h2 className="text-xl font-serif font-bold text-ivory">Inventory & Stock Control</h2>
                                <p className="text-xs text-ivory-dim/60 font-mono">Warehouse Stock Levels & Stock Count Submission</p>
                            </div>
                            <span className="px-2 py-0.5 rounded bg-gold/15 text-gold border border-gold/30 text-[10px] font-mono font-bold uppercase">
                                Superadmin Operator
                            </span>
                        </div>
                        <InventoryTab />
                    </div>
                )}
            </Suspense>
        );
    };

    const getTabTitle = () => {
        switch (activeTab) {
            case 'features': return 'System Controls';
            case 'health': return 'System Health';
            case 'diagnostics': return 'Diagnostics';
            case 'accounts': return 'Account Management';
            case 'audit': return 'Audit Logs';
            case 'overview': return 'System Control Center';
            case 'operations-pos': return 'Point of Sale';
            case 'operations-queue': return 'Walk-in Queue';
            case 'operations-inventory': return 'Inventory & Stock Control';
            default: return activeTab;
        }
    };

    return (
        <div className="h-screen w-full bg-charcoal text-ivory flex overflow-hidden system-admin-scope">
            {/* Sidebar */}
            <Sidebar 
                activeTab={activeTab} 
                setActiveTab={setActiveTab} 
                activeCategory={accountCategory}
                onSelectCategory={(cat) => {
                    handleNavigateToAccounts({ category: cat });
                }}
                activeControlsSubTab={controlsSubTab}
                onSelectControlsSubTab={(subTab) => {
                    handleControlsTabChange(subTab as any);
                }}
                handleLogout={handleLogout}
                onCollapsedChange={setIsSidebarCollapsed}
            />

            {/* Main Content */}
            <main className={`flex-1 relative h-full flex flex-col overflow-hidden min-w-0 pb-20 lg:pb-0 transition-[margin-left] duration-200 ease-in-out ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'}`}>
                {/* Background Texture */}
                <div className="absolute inset-0 bg-texture opacity-50 pointer-events-none"></div>

                {/* Top Bar */}
                <header className="h-20 shrink-0 bg-charcoal/95 backdrop-blur-md border-b border-white/5 z-20 px-4 md:px-8 flex justify-between items-center gap-3">
                    <h2 className="text-xl font-serif font-bold text-ivory capitalize truncate min-w-0">{getTabTitle()}</h2>

                    <div className="flex shrink-0 items-center gap-2 sm:gap-3 md:gap-6">
                        {/* Desktop Omnibar Search Input & Dropdown */}
                        <div className="relative hidden md:block" ref={searchContainerRef}>
                            <div className="relative flex items-center">
                                <input
                                    ref={searchInputRef}
                                    type="search"
                                    role="combobox"
                                    aria-label="Global search across accounts, feature gates, audit logs, and system tools"
                                    aria-expanded={isOmnibarOpen}
                                    aria-autocomplete="list"
                                    value={omnibarQuery}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setOmnibarQuery(val);
                                        setSelectedIndex(-1);
                                        if (val.trim().length >= 2) setIsOmnibarOpen(true);
                                        else setIsOmnibarOpen(false);
                                    }}
                                    onFocus={() => {
                                        if (omnibarQuery.trim().length >= 2) setIsOmnibarOpen(true);
                                    }}
                                    onKeyDown={handleOmnibarKeyDown}
                                    placeholder="Search accounts, features, audit logs, tools…"
                                    className="min-h-[44px] bg-white/5 border border-white/10 rounded-full py-2 pl-10 pr-16 text-sm text-ivory focus:border-gold focus:bg-white/[0.08] outline-none w-72 lg:w-84 transition-all shadow-inner"
                                />
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ivory-dim w-4 h-4 pointer-events-none" />
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
                                    {isOmnibarLoading ? (
                                        <Loader2 className="text-gold w-4 h-4 animate-spin pointer-events-auto" />
                                    ) : omnibarQuery ? (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setOmnibarQuery('');
                                                clearOmnibarSearch();
                                            }}
                                            aria-label="Clear search"
                                            className="flex h-7 w-7 items-center justify-center text-ivory-dim hover:text-ivory transition-colors cursor-pointer pointer-events-auto"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    ) : (
                                        <kbd className="hidden lg:inline-block text-[10px] font-mono text-ivory-dim/40 border border-white/10 px-1.5 py-0.5 rounded bg-white/5">
                                            ⌘K
                                        </kbd>
                                    )}
                                </div>
                            </div>

                            {/* Dropdown Popover */}
                            {isOmnibarOpen && omnibarQuery.trim().length >= 2 && (
                                <div className="absolute left-0 top-full mt-2 w-80 lg:w-96 bg-charcoal-light/98 backdrop-blur-md border border-white/10 rounded-lg shadow-2xl z-50 overflow-hidden animate-fade-in divide-y divide-white/5">
                                    <div className="px-3 py-2 bg-white/[0.02] flex items-center justify-between text-[11px] text-ivory-dim">
                                        <span className="font-bold uppercase tracking-wider text-gold/80">System Search Results</span>
                                        <span>{isOmnibarLoading ? 'Searching…' : `${omnibarResults.length} found`}</span>
                                    </div>

                                    {isOmnibarLoading && omnibarResults.length === 0 ? (
                                        <div className="p-4 text-center text-xs text-ivory-dim flex items-center justify-center gap-2">
                                            <Loader2 className="w-4 h-4 animate-spin text-gold" />
                                            <span>Searching across accounts, features, logs & tools…</span>
                                        </div>
                                    ) : omnibarResults.length === 0 ? (
                                        <div className="p-4 text-center text-xs text-ivory-dim space-y-1">
                                            <p>No results found for "<span className="text-ivory font-medium">{omnibarQuery}</span>".</p>
                                            <p className="text-[11px] text-ivory-dim/60">Try searching by user email, role name, feature key, audit action, or administrative tool.</p>
                                        </div>
                                    ) : (
                                        <ul className="max-h-80 overflow-y-auto py-1 divide-y divide-white/5 custom-scrollbar" role="listbox">
                                            {omnibarResults.map((item, index) => {
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
                                                                <p className={`text-xs font-semibold truncate ${isSelected ? 'text-gold' : 'text-ivory group-hover:text-gold'}`}>
                                                                    {highlightMatch(item.title, omnibarQuery)}
                                                                </p>
                                                                {item.subtitle && (
                                                                    <p className="text-[10px] text-ivory-dim truncate mt-0.5">
                                                                        {highlightMatch(item.subtitle, omnibarQuery)}
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
                                aria-label="Toggle mobile system search"
                                onClick={() => setIsMobileSearchOpen((prev) => !prev)}
                                className="min-h-[44px] min-w-[44px] rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-ivory hover:text-gold transition-colors cursor-pointer"
                            >
                                <Search className="w-4 h-4" />
                            </button>
                        </div>

                        <NotificationBell
                            visibleEvents={SYSTEM_ADMIN_VISIBLE_NOTIFICATION_EVENTS}
                            popupEvents={SYSTEM_ADMIN_POPUP_NOTIFICATION_EVENTS}
                            onSelect={setSelectedNotification}
                            onNewNotification={setSelectedNotification}
                        />

                        <div className="pl-3 md:pl-6 border-l border-white/10">
                            <ModuleSwitcher
                                currentModuleId="system-admin"
                                onLogout={handleLogout}
                            />
                        </div>
                    </div>

                </header>

                {/* Mobile Expandable Search Bar */}
                {isMobileSearchOpen && (
                    <div className="md:hidden bg-charcoal border-b border-white/10 px-4 py-3 sticky top-0 z-20 animate-fade-in" ref={mobileSearchContainerRef}>
                        <div className="relative flex items-center">
                            <input
                                type="search"
                                autoFocus
                                aria-label="Mobile system search"
                                value={omnibarQuery}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    setOmnibarQuery(val);
                                    if (val.trim().length >= 2) setIsOmnibarOpen(true);
                                    else setIsOmnibarOpen(false);
                                }}
                                onKeyDown={handleOmnibarKeyDown}
                                placeholder="Search accounts, features, logs, tools…"
                                className="min-h-[44px] w-full bg-white/5 border border-white/10 rounded-full py-2 pl-10 pr-9 text-sm text-ivory focus:border-gold outline-none"
                            />
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ivory-dim w-4 h-4 pointer-events-none" />
                            {isOmnibarLoading ? (
                                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 text-gold w-4 h-4 animate-spin" />
                            ) : omnibarQuery ? (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setOmnibarQuery('');
                                        clearOmnibarSearch();
                                    }}
                                    className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center text-ivory-dim hover:text-ivory"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            ) : null}
                        </div>

                        {omnibarQuery.trim().length >= 2 && (
                            <div className="mt-2 bg-charcoal-light border border-white/10 rounded-lg shadow-2xl overflow-hidden divide-y divide-white/5">
                                {isOmnibarLoading && omnibarResults.length === 0 ? (
                                    <div className="p-3 text-center text-xs text-ivory-dim flex items-center justify-center gap-2">
                                        <Loader2 className="w-4 h-4 animate-spin text-gold" />
                                        <span>Searching…</span>
                                    </div>
                                ) : omnibarResults.length === 0 ? (
                                    <div className="p-3 text-center text-xs text-ivory-dim">
                                        No results found for "{omnibarQuery}".
                                    </div>
                                ) : (
                                    <ul className="max-h-60 overflow-y-auto py-1 divide-y divide-white/5">
                                        {omnibarResults.map((item) => (
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

                <div id="system-admin-content" className="flex-1 min-h-0 relative overflow-hidden z-10">
                    <div className="h-full overflow-y-auto p-4 md:p-8 pb-24 md:pb-8 custom-scrollbar">
                        {renderContent()}
                    </div>
                    <div id="system-admin-drawer-root" className="pointer-events-none absolute inset-0 z-30 overflow-hidden" />
                </div>
            </main>
            {/* Bottom Navigation (Mobile Only) */}
            <BottomNavigation activeTab={activeTab} setActiveTab={setActiveTab} handleLogout={handleLogout} />

            {/* Logout Modal */}
            <LogoutModal
                sidebarOffset
                isOpen={isLogoutModalOpen}
                onClose={() => setIsLogoutModalOpen(false)}
                onConfirm={confirmLogout}
            />

            {/* Notification Details Modal */}
            <NotificationDetailModal
                isOpen={!!selectedNotification}
                notification={selectedNotification}
                onClose={() => setSelectedNotification(null)}
            />
        </div>
    );
};
