import { DashboardSidebarHeader } from '@/components/layout/DashboardSidebarHeader';
import React, { useState, useEffect } from 'react';
import {
    LayoutDashboard,
    Users,
    Shield,
    Sliders,
    ChevronDown,
    UserCheck,
    Scissors,
    UserCog,
    FileText,
    LucideIcon,
    CreditCard,
    Package,
    Activity,
    Wrench,
    Database,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { DashboardSidebarFooter } from '@/components/layout/DashboardSidebarFooter';
import { useFeatures } from '@/context/FeatureContext';

interface SidebarProps {
    activeTab: string;
    setActiveTab: (tab: string) => void;
    activeCategory?: string;
    onSelectCategory?: (category: string) => void;
    activeControlsSubTab?: string;
    onSelectControlsSubTab?: (subTab: string) => void;
    handleLogout?: () => void;
    onCollapsedChange?: (collapsed: boolean) => void;
}

interface NavItem {
    id: string;
    label: string;
    icon: LucideIcon;
    hasDropdown?: boolean;
}

interface SubNavItem {
    id: string;
    label: string;
    icon: LucideIcon;
    badge?: string;
    isLive?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
    activeTab, 
    setActiveTab,
    activeCategory = 'all',
    onSelectCategory,
    activeControlsSubTab = 'features',
    onSelectControlsSubTab,
    handleLogout,
    onCollapsedChange,
}) => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const toggleCollapsed = () => {
        const next = !isCollapsed;
        setIsCollapsed(next);
        onCollapsedChange?.(next);
    };
    const [isAccountsExpanded, setIsAccountsExpanded] = useState<boolean>(activeTab === 'accounts');
    const [isControlsExpanded, setIsControlsExpanded] = useState<boolean>(activeTab === 'features');

    const { hasAccess } = useFeatures();
    const canAccessPos = hasAccess('cashier_pos');
    const canAccessQueue = hasAccess('customer_queue');
    const canAccessInventory = hasAccess('inventory_management');

    const operationalItems = React.useMemo(() => {
        const items = [];
        if (canAccessPos) {
            items.push({ id: 'operations-pos', label: 'Point of Sale', icon: CreditCard });
        }
        if (canAccessQueue) {
            items.push({ id: 'operations-queue', label: 'Walk-in Queue', icon: Users });
        }
        if (canAccessInventory) {
            items.push({ id: 'operations-inventory', label: 'Inventory', icon: Package });
        }
        return items;
    }, [canAccessPos, canAccessQueue, canAccessInventory]);

    useEffect(() => {
        if (activeTab === 'accounts') {
            setIsAccountsExpanded(true);
        } else if (activeTab === 'features') {
            setIsControlsExpanded(true);
        }
    }, [activeTab]);

    const navItems: NavItem[] = [
        { id: 'overview', label: 'Overview', icon: LayoutDashboard },
        { id: 'accounts', label: 'Accounts', icon: Users, hasDropdown: true },
        { id: 'audit', label: 'Audit Logs', icon: Shield },
        { id: 'features', label: 'System Controls', icon: Sliders, hasDropdown: true },
        { id: 'health', label: 'System Health', icon: Activity },
        { id: 'diagnostics', label: 'Diagnostics', icon: Wrench },
        { id: 'database-traffic', label: 'Database & Traffic', icon: Database },
    ];

    const accountSubItems: SubNavItem[] = [
        { id: 'all', label: 'All', icon: Users },
        { id: 'customers', label: 'Customers', icon: UserCheck },
        { id: 'staff', label: 'Staff', icon: Scissors },
        { id: 'admins', label: 'Administrators', icon: Shield },
    ];

    const systemControlsSubItems: SubNavItem[] = [
        { id: 'features', label: 'Features', icon: Sliders, badge: 'Live', isLive: true },
        { id: 'access', label: 'Roles & Access', icon: UserCheck, badge: 'Live', isLive: true },
        { id: 'content', label: 'Content Management', icon: FileText, badge: 'Live', isLive: true },
    ];

    return (
        <>
            <aside aria-label="System admin workspace navigation" className={`bg-charcoal-light border-r border-white/5 fixed h-full z-20 hidden lg:flex flex-col select-none transition-[width] duration-200 ease-in-out ${isCollapsed ? 'w-20' : 'w-64'}`}>
                <DashboardSidebarHeader
                    isCollapsed={isCollapsed}
                    onToggleCollapsed={toggleCollapsed}
                    moduleName="System Admin"
                    moduleIcon={Shield}
                />

                {/* Navigation Menu */}
                <nav className={`space-y-1.5 flex-1 overflow-y-auto ${isCollapsed ? 'p-2' : 'p-3.5'}`}>
                    {isCollapsed ? (
                        [...navItems, ...operationalItems].map((item) => {
                            const Icon = item.icon;
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    title={item.label}
                                    aria-label={item.label}
                                    onClick={() => {
                                        setActiveTab(item.id);
                                        if (item.id === 'accounts' || item.id === 'features') {
                                            setIsAccountsExpanded(item.id === 'accounts');
                                            setIsControlsExpanded(item.id === 'features');
                                            toggleCollapsed();
                                        }
                                    }}
                                    className={`flex w-full cursor-pointer items-center justify-center rounded-sm px-2 py-3 transition-colors ${activeTab === item.id ? 'border-l-2 border-gold bg-gold/15 text-gold' : 'text-ivory-dim/80 hover:bg-white/[0.04] hover:text-gold'}`}
                                >
                                    <span className={`rounded-sm p-1.5 ${activeTab === item.id ? 'bg-gold/25' : 'bg-white/[0.03]'}`}>
                                        <Icon className="h-4 w-4" />
                                    </span>
                                </button>
                            );
                        })
                    ) : (
                    <>
                    <div className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-ivory-dim/60 font-semibold">
                        Menu
                    </div>
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = activeTab === item.id;
                        const isAccounts = item.id === 'accounts';

                        if (isAccounts) {
                            return (
                                <div key={item.id} className="space-y-1">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (activeTab === 'accounts') {
                                                setIsAccountsExpanded((prev) => !prev);
                                            } else {
                                                setIsAccountsExpanded(true);
                                                setActiveTab('accounts');
                                            }
                                        }}
                                        aria-expanded={isAccountsExpanded}
                                        className={`w-full group flex items-center justify-between px-3 py-2.5 rounded-sm transition-all duration-200 cursor-pointer text-left ${
                                            isActive 
                                                ? 'bg-gradient-to-r from-gold/15 via-gold/10 to-transparent text-gold border-l-2 border-gold shadow-[inset_0_1px_0_rgba(212,175,55,0.15)]' 
                                                : 'text-ivory-dim/80 hover:text-ivory hover:bg-white/[0.04]'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3 min-w-0 flex-1 pr-1.5">
                                            <div className={`p-1.5 rounded-sm transition-all duration-200 shrink-0 ${
                                                isActive 
                                                    ? 'bg-gold/25 text-gold shadow-[0_0_10px_rgba(212,175,55,0.3)]' 
                                                    : 'bg-white/[0.03] text-ivory-dim group-hover:text-gold group-hover:bg-gold/10'
                                            }`}>
                                                <Icon className="w-4 h-4" />
                                            </div>
                                            <div className="truncate">
                                                <span className={`text-sm block tracking-wide ${isActive ? 'font-bold text-gold' : 'font-medium'}`}>
                                                    {item.label}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Dropdown Chevron Toggle */}
                                        <div
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setIsAccountsExpanded((prev) => !prev);
                                            }}
                                            className="p-1 rounded text-ivory-dim/60 hover:text-gold transition-colors shrink-0 cursor-pointer"
                                            aria-label={isAccountsExpanded ? 'Collapse accounts sub-menu' : 'Expand accounts sub-menu'}
                                        >
                                            <ChevronDown
                                                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                                                    isAccountsExpanded ? 'rotate-180 text-gold' : ''
                                                }`}
                                            />
                                        </div>
                                    </button>

                                    {/* Nested Sub-Items for Account Management */}
                                    <AnimatePresence initial={false}>
                                        {isAccountsExpanded && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: 'auto' }}
                                                exit={{ opacity: 0, height: 0 }}
                                                transition={{ duration: 0.2, ease: 'easeInOut' }}
                                                className="overflow-hidden pl-7 pr-1 space-y-0.5 pt-0.5"
                                            >
                                                {accountSubItems.map((subItem) => {
                                                    const isSubActive = isActive && activeCategory === subItem.id;
                                                    const SubIcon = subItem.icon;
                                                    return (
                                                        <button
                                                            key={subItem.id}
                                                            type="button"
                                                            onClick={() => {
                                                                if (onSelectCategory) {
                                                                    onSelectCategory(subItem.id);
                                                                } else {
                                                                    setActiveTab('accounts');
                                                                }
                                                            }}
                                                            className={`w-full group/sub flex items-center justify-between px-3 py-2 rounded-sm text-xs transition-all duration-150 cursor-pointer text-left ${
                                                                isSubActive
                                                                    ? 'bg-gold/15 text-gold font-bold border-l-2 border-gold shadow-[inset_0_1px_0_rgba(212,175,55,0.1)]'
                                                                    : 'text-ivory-dim/70 hover:text-ivory hover:bg-white/[0.03]'
                                                            }`}
                                                        >
                                                            <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-1.5">
                                                                <SubIcon className={`w-3.5 h-3.5 shrink-0 transition-colors ${
                                                                    isSubActive ? 'text-gold' : 'text-ivory-dim/60 group-hover/sub:text-gold'
                                                                }`} />
                                                                <span className="truncate">{subItem.label}</span>
                                                            </div>
                                                            {isSubActive && (
                                                                <span className="w-1.5 h-1.5 rounded-full bg-gold shadow-[0_0_6px_rgba(212,175,55,0.8)] shrink-0 ml-1"></span>
                                                            )}
                                                        </button>
                                                    );
                                                })}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            );
                        }

                        if (item.id === 'features') {
                            return (
                                <div key={item.id} className="space-y-1">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (activeTab === 'features') {
                                                setIsControlsExpanded((prev) => !prev);
                                            } else {
                                                setIsControlsExpanded(true);
                                                setActiveTab('features');
                                            }
                                        }}
                                        aria-expanded={isControlsExpanded}
                                        className={`w-full group flex items-center justify-between px-3 py-2.5 rounded-sm transition-all duration-200 cursor-pointer text-left ${
                                            isActive 
                                                ? 'bg-gradient-to-r from-gold/15 via-gold/10 to-transparent text-gold border-l-2 border-gold shadow-[inset_0_1px_0_rgba(212,175,55,0.15)]' 
                                                : 'text-ivory-dim/80 hover:text-ivory hover:bg-white/[0.04]'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3 min-w-0 flex-1 pr-1.5">
                                            <div className={`p-1.5 rounded-sm transition-all duration-200 shrink-0 ${
                                                isActive 
                                                    ? 'bg-gold/25 text-gold shadow-[0_0_10px_rgba(212,175,55,0.3)]' 
                                                    : 'bg-white/[0.03] text-ivory-dim group-hover:text-gold group-hover:bg-gold/10'
                                            }`}>
                                                <Icon className="w-4 h-4" />
                                            </div>
                                            <div className="truncate">
                                                <span className={`text-sm block tracking-wide ${isActive ? 'font-bold text-gold' : 'font-medium'}`}>
                                                    {item.label}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Dropdown Chevron Toggle */}
                                        <div
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setIsControlsExpanded((prev) => !prev);
                                            }}
                                            className="p-1 rounded text-ivory-dim/60 hover:text-gold transition-colors shrink-0 cursor-pointer"
                                            aria-label={isControlsExpanded ? 'Collapse controls sub-menu' : 'Expand controls sub-menu'}
                                        >
                                            <ChevronDown
                                                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                                                    isControlsExpanded ? 'rotate-180 text-gold' : ''
                                                }`}
                                            />
                                        </div>
                                    </button>

                                    {/* Nested Sub-Items for System Controls */}
                                    <AnimatePresence initial={false}>
                                        {isControlsExpanded && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: 'auto' }}
                                                exit={{ opacity: 0, height: 0 }}
                                                transition={{ duration: 0.2, ease: 'easeInOut' }}
                                                className="overflow-hidden pl-7 pr-1 space-y-0.5 pt-0.5"
                                            >
                                                {systemControlsSubItems.map((subItem) => {
                                                    const isSubActive = isActive && activeControlsSubTab === subItem.id;
                                                    const SubIcon = subItem.icon;
                                                    return (
                                                        <button
                                                            key={subItem.id}
                                                            type="button"
                                                            onClick={() => {
                                                                if (onSelectControlsSubTab) {
                                                                    onSelectControlsSubTab(subItem.id);
                                                                } else {
                                                                    setActiveTab('features');
                                                                }
                                                            }}
                                                            className={`w-full group/sub flex items-center justify-between px-3 py-2 rounded-sm text-xs transition-all duration-150 cursor-pointer text-left ${
                                                                isSubActive
                                                                    ? 'bg-gold/15 text-gold font-bold border-l-2 border-gold shadow-[inset_0_1px_0_rgba(212,175,55,0.1)]'
                                                                    : 'text-ivory-dim/70 hover:text-ivory hover:bg-white/[0.03]'
                                                            }`}
                                                        >
                                                            <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-1.5">
                                                                <SubIcon className={`w-3.5 h-3.5 shrink-0 transition-colors ${
                                                                    isSubActive ? 'text-gold' : 'text-ivory-dim/60 group-hover/sub:text-gold'
                                                                }`} />
                                                                <span className="truncate">{subItem.label}</span>
                                                            </div>
                                                            {subItem.badge && (
                                                                <span className={`px-1 py-0.2 rounded-[2px] text-[8px] font-mono uppercase font-bold tracking-wider shrink-0 ${
                                                                    subItem.isLive
                                                                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                                                        : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                                                }`}>
                                                                    {subItem.badge}
                                                                </span>
                                                            )}
                                                        </button>
                                                    );
                                                })}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            );
                        }

                        return (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => setActiveTab(item.id)}
                                className={`w-full group flex items-center justify-between px-3 py-2.5 rounded-sm transition-all duration-200 cursor-pointer text-left ${
                                    isActive 
                                        ? 'bg-gradient-to-r from-gold/15 via-gold/10 to-transparent text-gold border-l-2 border-gold shadow-[inset_0_1px_0_rgba(212,175,55,0.15)]' 
                                        : 'text-ivory-dim/80 hover:text-ivory hover:bg-white/[0.04]'
                                }`}
                            >
                                <div className="flex items-center gap-3 min-w-0 flex-1 pr-2">
                                    <div className={`p-1.5 rounded-sm transition-all duration-200 shrink-0 ${
                                        isActive 
                                            ? 'bg-gold/25 text-gold shadow-[0_0_10px_rgba(212,175,55,0.3)]' 
                                            : 'bg-white/[0.03] text-ivory-dim group-hover:text-gold group-hover:bg-gold/10'
                                    }`}>
                                        <Icon className="w-4 h-4" />
                                    </div>
                                    <div className="truncate">
                                        <span className={`text-sm block tracking-wide ${isActive ? 'font-bold text-gold' : 'font-medium'}`}>
                                            {item.label}
                                        </span>
                                    </div>
                                </div>
                                {isActive && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-gold shadow-[0_0_8px_rgba(212,175,55,0.9)] shrink-0 ml-2"></span>
                                )}
                            </button>
                        );
                    })}

                    {/* Operational Modules: Only rendered if modular operational features are granted to Superadmin */}
                    {operationalItems.length > 0 && (
                        <div className="pt-3 mt-2 border-t border-white/5 space-y-1">
                            <div className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-ivory-dim/60 font-semibold flex items-center justify-between">
                                <span>Operations</span>
                                <span className="px-1 py-0.2 rounded bg-gold/10 text-gold text-[8px] font-bold border border-gold/20">Modular</span>
                            </div>
                            {operationalItems.map((item) => {
                                const Icon = item.icon;
                                const isActive = activeTab === item.id;
                                return (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => setActiveTab(item.id)}
                                        className={`w-full group flex items-center justify-between px-3 py-2.5 rounded-sm transition-all duration-200 cursor-pointer text-left ${
                                            isActive 
                                                ? 'bg-gradient-to-r from-gold/15 via-gold/10 to-transparent text-gold border-l-2 border-gold shadow-[inset_0_1px_0_rgba(212,175,55,0.15)]' 
                                                : 'text-ivory-dim/80 hover:text-ivory hover:bg-white/[0.04]'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3 min-w-0 flex-1 pr-2">
                                            <div className={`p-1.5 rounded-sm transition-all duration-200 shrink-0 ${
                                                isActive 
                                                    ? 'bg-gold/25 text-gold shadow-[0_0_10px_rgba(212,175,55,0.3)]' 
                                                    : 'bg-white/[0.03] text-ivory-dim group-hover:text-gold group-hover:bg-gold/10'
                                            }`}>
                                                <Icon className="w-4 h-4" />
                                            </div>
                                            <div className="truncate">
                                                <span className={`text-sm block tracking-wide ${isActive ? 'font-bold text-gold' : 'font-medium'}`}>
                                                    {item.label}
                                                </span>
                                            </div>
                                        </div>
                                        {isActive && (
                                            <span className="w-1.5 h-1.5 rounded-full bg-gold shadow-[0_0_8px_rgba(212,175,55,0.9)] shrink-0 ml-2"></span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                    </>
                    )}
                </nav>

                {/* Bottom Section: Standard Dashboard Sidebar Footer */}
                <DashboardSidebarFooter onLogout={handleLogout} className={isCollapsed ? 'p-2 [&_button]:justify-center [&_button]:gap-0 [&_button]:px-2 [&_button]:text-[0px] [&>div:last-child]:hidden' : ''} />
            </aside>
        </>
    );
};

export default Sidebar;
