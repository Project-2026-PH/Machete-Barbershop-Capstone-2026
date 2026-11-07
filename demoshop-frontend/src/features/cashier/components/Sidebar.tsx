import { DashboardSidebarHeader } from '@/components/layout/DashboardSidebarHeader';
import React, { useEffect, useState } from 'react';
import {
    LayoutDashboard, Banknote, Users, ChevronDown, CalendarDays,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { DashboardSidebarFooter } from '@/components/layout/DashboardSidebarFooter';

interface NavItem {
    tab: string;
    icon: React.ElementType;
    label: string;
    shortcut?: string;
    badge?: number;
    subNavItems?: SubNavItem[];
}

interface SubNavItem {
    id: string;
    label: string;
    icon: React.ElementType;
}

interface SidebarProps {
    activeTab: string;
    activeSubTab?: string;
    setActiveTab: (tab: string, subTab?: string) => void;
    handleLogout?: () => void;
    pendingCount?: number;
    navItems?: NavItem[];
    moduleName?: string;
    moduleIcon?: React.ElementType;
    onCollapsedChange?: (collapsed: boolean) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ 
    activeTab, 
    activeSubTab,
    setActiveTab, 
    handleLogout,
    pendingCount = 0,
    navItems: propNavItems,
    moduleName = 'Cashier Workspace',
    moduleIcon: ModuleIcon = Banknote,
    onCollapsedChange,
}) => {
    const [expandedTab, setExpandedTab] = useState<string | null>(activeTab);
    const [isCollapsed, setIsCollapsed] = useState(false);

    const toggleCollapsed = () => {
        setIsCollapsed((current) => {
            const next = !current;
            onCollapsedChange?.(next);
            return next;
        });
    };

    useEffect(() => {
        setExpandedTab(activeTab);
    }, [activeTab]);

    const defaultNavItems: NavItem[] = [
        { tab: 'overview', icon: LayoutDashboard, label: 'Dashboard', shortcut: 'Alt+1' },
        { tab: 'pos', icon: Banknote, label: 'Cashier', shortcut: 'Alt+2' },
        { tab: 'queue', icon: CalendarDays, label: 'Reservations', badge: pendingCount, shortcut: 'Alt+3' }
    ];

    const navItems = propNavItems || defaultNavItems;

    return (
        <>
            <aside
                aria-label="Cashier workspace navigation"
                className={`bg-charcoal-light border-r border-white/5 fixed h-full z-20 hidden lg:flex flex-col select-none transition-[width] duration-200 ease-in-out ${isCollapsed ? 'w-20' : 'w-64'}`}
            >
                <DashboardSidebarHeader
                    isCollapsed={isCollapsed}
                    onToggleCollapsed={toggleCollapsed}
                    moduleName={moduleName}
                    moduleIcon={ModuleIcon}
                />

                {/* Navigation Menu */}
                <nav className={`space-y-1.5 flex-1 overflow-y-auto ${isCollapsed ? 'p-2' : 'p-3.5'}`}>
                    <div className={`px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-ivory-dim/60 font-semibold ${isCollapsed ? 'sr-only' : ''}`}>
                        Menu
                    </div>
                    {navItems.map(({ tab, icon: Icon, label, badge, shortcut, subNavItems }) => {
                        const isActive = activeTab === tab;
                        const hasSubNav = Boolean(subNavItems?.length);
                        const isExpanded = expandedTab === tab;

                        return (
                            <div key={tab} className="space-y-1">
                                <div className="flex items-center">
                                    <button
                                        onClick={() => {
                                            if (hasSubNav && isActive) {
                                                setExpandedTab((current) => current === tab ? null : tab);
                                            } else {
                                                setExpandedTab(tab);
                                                setActiveTab(tab);
                                            }
                                        }}
                                        title={isCollapsed ? label : undefined}
                                        className={`w-full group flex items-center justify-between rounded-sm transition-all duration-200 cursor-pointer text-left ${isCollapsed ? 'justify-center px-2 py-3' : 'px-3 py-2.5'} ${
                                            isActive
                                                ? 'bg-gradient-to-r from-gold/15 via-gold/10 to-transparent text-gold border-l-2 border-gold shadow-[inset_0_1px_0_rgba(212,175,55,0.15)]'
                                                : 'text-ivory-dim/80 hover:text-ivory hover:bg-white/[0.04]'
                                        }`}
                                        aria-expanded={hasSubNav ? isExpanded : undefined}
                                    >
                                        <div className={`flex items-center min-w-0 ${isCollapsed ? 'justify-center' : hasSubNav && shortcut ? 'gap-2.5' : 'gap-3'}`}>
                                            <div className={`p-1.5 rounded-sm transition-all duration-200 shrink-0 ${
                                                isActive
                                                    ? 'bg-gold/25 text-gold shadow-[0_0_10px_rgba(212,175,55,0.3)]'
                                                    : 'bg-white/[0.03] text-ivory-dim group-hover:text-gold group-hover:bg-gold/10'
                                            }`}>
                                                <Icon className="w-4 h-4" />
                                            </div>
                                            <div className={`${isCollapsed ? 'hidden' : 'block'} truncate`}>
                                                <span className={`text-sm block ${hasSubNav && shortcut ? '' : 'tracking-wide'} ${isActive ? 'font-bold text-gold' : 'font-medium'}`}>
                                                    {label}
                                                </span>
                                            </div>
                                        </div>

                                        <div className={`${isCollapsed ? 'hidden' : 'flex'} items-center ${hasSubNav && shortcut ? 'gap-1' : 'gap-2'} shrink-0`}>
                                            {badge !== undefined && badge > 0 && (
                                                <span className="bg-[#e05555] text-white text-[10px] font-black min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center shadow-md animate-pulse">
                                                    {badge}
                                                </span>
                                            )}
                                            {shortcut && (
                                                <kbd className={`${hasSubNav ? 'px-1' : 'px-1.5'} py-0.5 text-[10px] font-mono font-medium rounded border transition-colors ${
                                                    isActive
                                                        ? 'text-gold/90 bg-gold/10 border-gold/30'
                                                        : 'text-ivory-dim/40 bg-white/[0.03] border-white/10'
                                                }`}>
                                                    {shortcut}
                                                </kbd>
                                            )}
                                            {hasSubNav ? (
                                                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-180 text-gold' : ''}`} />
                                            ) : !shortcut && isActive && (
                                                <span className="w-1.5 h-1.5 rounded-full bg-gold shadow-[0_0_8px_rgba(212,175,55,0.9)]"></span>
                                            )}
                                        </div>
                                    </button>
                                </div>

                                {hasSubNav && (
                                    <AnimatePresence initial={false}>
                                        {isExpanded && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: 'auto' }}
                                                exit={{ opacity: 0, height: 0 }}
                                                transition={{ duration: 0.2, ease: 'easeInOut' }}
                                                className={`overflow-hidden py-1 space-y-1 relative ${isCollapsed ? 'px-0' : 'pl-3 pr-1'}`}
                                            >
                                                <div className="absolute left-6 top-2 bottom-2 w-px bg-white/10" />
                                                {subNavItems?.map((sub) => {
                                                    const isSubActive = isActive && activeSubTab === sub.id;
                                                    const SubIcon = sub.icon;

                                                    return (
                                                        <button
                                                            key={sub.id}
                                                            type="button"
                                                            onClick={() => setActiveTab(tab, sub.id)}
                                                            title={isCollapsed ? sub.label : undefined}
                                                            className={`w-full group flex items-center justify-between rounded-sm text-xs transition-all duration-150 cursor-pointer text-left relative ${isCollapsed ? 'justify-center px-2 py-3' : 'pl-7 pr-2.5 py-2'} ${
                                                                isSubActive
                                                                    ? 'bg-gradient-to-r from-gold/15 to-transparent text-gold font-bold shadow-[inset_2px_0_0_rgba(212,175,55,1)]'
                                                                    : 'text-ivory-dim/70 hover:text-ivory hover:bg-white/[0.04]'
                                                            }`}
                                                        >
                                                            <div className={`flex items-center min-w-0 ${isCollapsed ? 'justify-center' : 'gap-2.5'}`}>
                                                                <SubIcon className={`w-3.5 h-3.5 shrink-0 ${isSubActive ? 'text-gold' : 'text-ivory-dim/60 group-hover:text-gold'}`} />
                                                                <span className={`${isCollapsed ? 'hidden' : 'inline'} truncate tracking-wide`}>{sub.label}</span>
                                                            </div>
                                                            {isSubActive && <span className="w-1 h-1 rounded-full bg-gold shadow-[0_0_6px_rgba(212,175,55,0.9)]" />}
                                                        </button>
                                                    );
                                                })}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                )}
                            </div>
                        );
                    })}
                </nav>

                {/* Standardized Sidebar Footer */}
                <DashboardSidebarFooter onLogout={handleLogout} className={isCollapsed ? 'p-2 [&_button]:px-2 [&_button]:text-[0px] [&_button]:gap-0 [&_button]:justify-center [&>div:last-child]:hidden' : ''} />
            </aside>
        </>
    );
};

export default Sidebar;
