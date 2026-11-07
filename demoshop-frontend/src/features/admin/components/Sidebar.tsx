import { DashboardSidebarHeader } from '@/components/layout/DashboardSidebarHeader';
import React, { useEffect, useState } from 'react';
import {
    BarChart3,
    Calendar,
    CalendarClock,
    ChevronDown,
    ClipboardCheck,
    LayoutDashboard,
    Lock,
    Package,
    Receipt,
    Scissors,
    Settings,
    Shield,
    ShieldCheck,
    Sliders,
    Star,
    TrendingUp,
    Users,
    Wallet,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { DashboardSidebarFooter } from '@/components/layout/DashboardSidebarFooter';
import Portal from '@/components/common/Portal';

interface SidebarProps {
    activeTab: string;
    activeSubTab?: string;
    setActiveTab: (tab: string, subTab?: string) => void;
    handleLogout?: () => void;
    pendingShiftRequests?: number;
    pendingPurchaseOrders?: number;
    pendingAppointments?: number;
    onCollapsedChange?: (collapsed: boolean) => void;
}

interface SubNavItem {
    id: string;
    label: string;
    icon: React.ElementType;
    badge?: number;
}

interface NavItem {
    tab: string;
    label: string;
    icon: React.ElementType;
    badge?: number;
    subNavItems?: SubNavItem[];
    defaultSubTab?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
    activeTab,
    activeSubTab = 'staff',
    setActiveTab,
    handleLogout,
    pendingShiftRequests = 0,
    pendingPurchaseOrders = 0,
    pendingAppointments = 0,
    onCollapsedChange,
}) => {
    const [expandedTab, setExpandedTab] = useState<string | null>(activeTab);
    const [flyoutTab, setFlyoutTab] = useState<string | null>(null);
    const [flyoutPosition, setFlyoutPosition] = useState({ top: 16, left: 88 });
    const [isCollapsed, setIsCollapsed] = useState(false);

    useEffect(() => {
        setExpandedTab(activeTab);
    }, [activeTab]);

    const toggleCollapsed = () => {
        setIsCollapsed((current) => {
            const next = !current;
            onCollapsedChange?.(next);
            return next;
        });
    };

    const navItems: NavItem[] = [
        { tab: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        {
            tab: 'appointments',
            label: 'Reservations',
            icon: Calendar,
            badge: pendingAppointments,
        },
        {
            tab: 'management',
            label: 'Management',
            icon: Sliders,
            badge: pendingShiftRequests,
            defaultSubTab: 'staff',
            subNavItems: [
                { id: 'staff', label: 'Staff Directory', icon: Users },
                { id: 'shifts', label: 'Staff Shifts', icon: CalendarClock, badge: pendingShiftRequests },
                { id: 'services', label: 'Services', icon: Scissors },
                { id: 'roles-access', label: 'Roles & Access', icon: ShieldCheck },
                { id: 'reviews', label: 'Barbershop Reviews', icon: Star },
                { id: 'drawer', label: 'Money Drawer', icon: Wallet },
            ],
        },
        {
            tab: 'inventory',
            label: 'Inventory',
            icon: Package,
            defaultSubTab: 'consumables',
            subNavItems: [
                { id: 'consumables', label: 'Consumables', icon: Package },
                { id: 'retails', label: 'Retails', icon: Package },
                { id: 'suppliers', label: 'Suppliers', icon: Package },
                { id: 'forecast', label: 'Forecasting', icon: TrendingUp },
            ],
        },
        {
            tab: 'purchase-orders',
            label: 'Stock Requests',
            icon: ClipboardCheck,
            badge: pendingPurchaseOrders,
            defaultSubTab: 'purchase-order-approval',
            subNavItems: [
                { id: 'purchase-order-approval', label: 'Stock Request Approval', icon: ClipboardCheck, badge: pendingPurchaseOrders },
                { id: 'history', label: 'Receiving', icon: ClipboardCheck },
            ],
        },
        {
            tab: 'reports',
            label: 'Reports & Audits',
            icon: BarChart3,
            defaultSubTab: 'transactions',
            subNavItems: [
                { id: 'transactions', label: 'Transactions', icon: Receipt },
                { id: 'sales', label: 'Sales', icon: TrendingUp },
                { id: 'commissions', label: 'Commissions', icon: Scissors },
                { id: 'inventory', label: 'Inventory Report', icon: Package },
                { id: 'appointments', label: 'Reservations', icon: Calendar },
                { id: 'audit-logs', label: 'Audit Logs', icon: Shield },
            ],
        },
        { tab: 'settings', label: 'Configuration', icon: Settings },
    ];

    const handleNavClick = (item: NavItem, event: React.MouseEvent<HTMLButtonElement>) => {
        const hasSubNav = Boolean(item.subNavItems?.length);

        if (isCollapsed && hasSubNav) {
            const buttonRect = event.currentTarget.getBoundingClientRect();
            if (activeTab !== item.tab) {
                setActiveTab(item.tab, item.defaultSubTab);
            }
            setExpandedTab(item.tab);
            setFlyoutPosition({ top: Math.max(16, buttonRect.top), left: buttonRect.right + 8 });
            setFlyoutTab((current) => current === item.tab ? null : item.tab);
            return;
        }

        if (hasSubNav && activeTab === item.tab) {
            setExpandedTab((current) => current === item.tab ? null : item.tab);
            return;
        }

        setExpandedTab(item.tab);
        const currentSubTab = item.subNavItems?.some((sub) => sub.id === activeSubTab)
            ? activeSubTab
            : item.tab === 'purchase-orders' && activeSubTab === 'awaiting-approval'
                ? 'purchase-order-approval'
                : item.defaultSubTab;
        setActiveTab(item.tab, hasSubNav ? currentSubTab : undefined);
    };

    const isSubTabActive = (tab: string, subTab: string) => (
        activeTab === tab
        && (
            activeSubTab === subTab
            || (tab === 'reports' && subTab === 'transactions' && activeSubTab === 'reports-transactions')
            || (tab === 'purchase-orders' && subTab === 'purchase-order-approval' && activeSubTab === 'awaiting-approval')
        )
    );

    const renderSubNav = (item: NavItem) => {
        const shouldRender = isCollapsed ? flyoutTab === item.tab : expandedTab === item.tab;
        if (!item.subNavItems?.length || !shouldRender) return null;

        const flyout = (
            <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2, ease: 'easeInOut' }}
                    style={isCollapsed
                        ? { top: flyoutPosition.top, left: flyoutPosition.left }
                        : undefined}
                    className={isCollapsed
                        ? 'fixed z-[120] max-h-[calc(100vh-2rem)] w-64 overflow-y-auto rounded-lg border border-white/10 bg-charcoal-light p-2 shadow-2xl'
                        : 'relative overflow-hidden py-1 pl-3 pr-1 space-y-1'}
                >
                    {!isCollapsed && <div className="absolute bottom-2 left-6 top-2 w-px bg-white/10" />}
                    {item.subNavItems.map((sub) => {
                        const SubIcon = sub.icon;
                        const isActive = isSubTabActive(item.tab, sub.id);
                        return (
                            <button
                                key={sub.id}
                                type="button"
                                onClick={() => {
                                    setActiveTab(item.tab, sub.id);
                                    if (isCollapsed) setFlyoutTab(null);
                                }}
                                title={isCollapsed ? sub.label : undefined}
                                className={`w-full group flex items-center justify-between rounded-sm text-xs transition-all duration-150 cursor-pointer text-left relative ${isCollapsed ? 'px-3 py-3' : 'pl-7 pr-2.5 py-2'} ${isActive
                                    ? 'bg-gold/15 text-gold font-bold shadow-[inset_2px_0_0_rgba(212,175,55,1)]'
                                    : 'text-ivory-dim/70 hover:text-ivory hover:bg-white/[0.04]'
                                    }`}
                            >
                                <span className="flex min-w-0 items-center gap-2.5">
                                    <SubIcon className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-gold' : 'text-ivory-dim/60 group-hover:text-gold'}`} />
                                    <span className="truncate tracking-wide">{sub.label}</span>
                                </span>
                                {sub.badge !== undefined && sub.badge > 0 && (
                                    <span className="ml-2 rounded-full bg-[#e05555] px-1.5 py-0.5 text-[9px] font-black text-white">
                                        {sub.badge > 99 ? '99+' : sub.badge}
                                    </span>
                                )}
                            </button>
                        );
                    })}
            </motion.div>
        );

        return (
            <AnimatePresence initial={false}>
                {isCollapsed ? <Portal>{flyout}</Portal> : flyout}
            </AnimatePresence>
        );
    };

    return (
        <aside
            aria-label="Admin workspace navigation"
            className={`fixed z-20 hidden h-full select-none flex-col border-r border-white/5 bg-charcoal-light print:hidden transition-[width] duration-200 ease-in-out lg:flex ${isCollapsed ? 'w-20' : 'w-64'}`}
        >
            <DashboardSidebarHeader
                isCollapsed={isCollapsed}
                onToggleCollapsed={toggleCollapsed}
                moduleName="Admin Workspace"
                moduleIcon={Shield}
            />

            <nav className={`flex-1 space-y-1.5 overflow-y-auto ${isCollapsed ? 'p-2' : 'p-3.5'}`}>
                <div className={`px-2.5 py-1 text-[10px] font-mono font-semibold uppercase tracking-wider text-ivory-dim/60 ${isCollapsed ? 'sr-only' : ''}`}>Menu</div>
                {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.tab;
                    const hasSubNav = Boolean(item.subNavItems?.length);
                    const isExpanded = expandedTab === item.tab;
                    return (
                        <div key={item.tab} className={`relative space-y-1 ${isCollapsed ? 'isolate' : ''}`}>
                            <button
                                type="button"
                                onClick={(event) => handleNavClick(item, event)}
                                title={isCollapsed ? item.label : undefined}
                                aria-expanded={hasSubNav ? isExpanded : undefined}
                                className={`w-full group flex items-center justify-between rounded-sm text-left transition-all duration-200 cursor-pointer ${isCollapsed ? 'justify-center px-2 py-3' : 'px-3 py-2.5'} ${isActive
                                    ? 'border-l-2 border-gold bg-gold/15 text-gold shadow-[inset_0_1px_0_rgba(212,175,55,0.15)]'
                                    : 'text-ivory-dim/80 hover:bg-white/[0.04] hover:text-ivory'
                                    }`}
                            >
                                <span className={`flex min-w-0 items-center ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
                                    <span className={`rounded-sm p-1.5 ${isActive ? 'bg-gold/25 text-gold shadow-[0_0_10px_rgba(212,175,55,0.3)]' : 'bg-white/[0.03] text-ivory-dim group-hover:bg-gold/10 group-hover:text-gold'}`}>
                                        <Icon className="h-4 w-4" />
                                    </span>
                                    <span className={`${isCollapsed ? 'hidden' : 'block'} truncate text-sm tracking-wide ${isActive ? 'font-bold text-gold' : 'font-medium'}`}>{item.label}</span>
                                </span>
                                <span className={`${isCollapsed ? 'hidden' : 'flex'} shrink-0 items-center gap-1.5`}>
                                    {item.badge !== undefined && item.badge > 0 && <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#e05555] px-1 text-[10px] font-black text-white">{item.badge > 99 ? '99+' : item.badge}</span>}
                                    {hasSubNav ? <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isExpanded ? 'rotate-180 text-gold' : ''}`} /> : isActive ? <span className="h-1.5 w-1.5 rounded-full bg-gold" /> : null}
                                </span>
                            </button>
                            {renderSubNav(item)}
                        </div>
                    );
                })}
            </nav>

            <DashboardSidebarFooter
                onLogout={handleLogout}
                className={isCollapsed ? 'p-2 [&_button]:justify-center [&_button]:gap-0 [&_button]:px-2 [&_button]:text-[0px] [&>div:last-child]:hidden' : ''}
            />
        </aside>
    );
};

export default Sidebar;
