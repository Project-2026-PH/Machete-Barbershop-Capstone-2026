import { DashboardSidebarHeader } from '@/components/layout/DashboardSidebarHeader';
import React, { useState } from 'react';
import { Calendar, Scissors, History, Settings, Users, User, } from 'lucide-react';

interface SidebarNavigationProps {
    activeTab: string;
    setActiveTab: (tab: string) => void;
    activeQueue: any;
    userBranch?: string;
    onCollapsedChange?: (collapsed: boolean) => void;
}

export const SidebarNavigation: React.FC<SidebarNavigationProps> = ({
    activeTab,
    setActiveTab,
    activeQueue,
    userBranch,
    onCollapsedChange,
}) => {
    const [isCollapsed, setIsCollapsed] = useState(false);

    const toggleCollapsed = () => {
        setIsCollapsed((current) => {
            const next = !current;
            onCollapsedChange?.(next);
            return next;
        });
    };

    const navItems = [
        { id: 'overview', label: 'Overview', icon: Calendar },
        { id: 'history', label: 'Reservation History', icon: History },
        activeQueue
            ? { id: 'queue', label: 'Queue', icon: Users }
            : { id: 'book', label: 'Book', icon: Scissors },
        { id: 'settings', label: 'Settings', icon: Settings },
    ];

    // Helper to determine if an item is active
    const isItemActive = (id: string) => {
        if (id === 'settings' && ['settings', 'payments'].includes(activeTab)) {
            return true;
        }
        return activeTab === id;
    };

    return (
        <>
            <aside
                aria-label="Customer portal navigation"
                className={`bg-charcoal-light border-r border-white/5 fixed h-full z-20 hidden lg:flex flex-col select-none transition-[width] duration-200 ease-in-out ${isCollapsed ? 'w-20' : 'w-64'}`}
            >
                <DashboardSidebarHeader
                    isCollapsed={isCollapsed}
                    onToggleCollapsed={toggleCollapsed}
                    moduleName="Customer Portal"
                    moduleIcon={User}
                />

                {/* Navigation Menu */}
                <nav className={`space-y-1.5 flex-1 overflow-y-auto ${isCollapsed ? 'p-2' : 'p-3.5'}`}>
                    <div className={`px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-ivory-dim/60 font-semibold ${isCollapsed ? 'sr-only' : ''}`}>
                        Menu
                    </div>
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = isItemActive(item.id);

                        return (
                            <button
                                key={item.id}
                                onClick={() => setActiveTab(item.id)}
                                title={isCollapsed ? item.label : undefined}
                                className={`w-full group flex items-center justify-between rounded-sm transition-all duration-200 cursor-pointer text-left ${isCollapsed ? 'justify-center px-2 py-3' : 'px-3 py-2.5'} ${
                                    isActive 
                                        ? 'bg-gradient-to-r from-gold/15 via-gold/10 to-transparent text-gold border-l-2 border-gold shadow-[inset_0_1px_0_rgba(212,175,55,0.15)]' 
                                        : 'text-ivory-dim/80 hover:text-ivory hover:bg-white/[0.04]'
                                }`}
                            >
                                <div className={`flex items-center min-w-0 ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
                                    <div className={`p-1.5 rounded-sm transition-all duration-200 shrink-0 ${
                                        isActive 
                                            ? 'bg-gold/25 text-gold shadow-[0_0_10px_rgba(212,175,55,0.3)]' 
                                            : 'bg-white/[0.03] text-ivory-dim group-hover:text-gold group-hover:bg-gold/10'
                                    }`}>
                                        <Icon className="w-4 h-4" />
                                    </div>
                                    <div className={`${isCollapsed ? 'hidden' : 'block'} truncate`}>
                                        <span className={`text-sm block tracking-wide ${isActive ? 'font-bold text-gold' : 'font-medium'}`}>
                                            {item.label}
                                        </span>
                                    </div>
                                </div>
                                <div className={`${isCollapsed ? 'hidden' : 'flex'} items-center gap-2 shrink-0`}>
                                    {item.id === 'queue' && activeQueue && (
                                        <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]"></span>
                                    )}
                                    {isActive && (
                                        <span className="w-1.5 h-1.5 rounded-full bg-gold shadow-[0_0_8px_rgba(212,175,55,0.9)]"></span>
                                    )}
                                </div>
                            </button>
                        );
                    })}
                </nav>
            </aside>
        </>
    );
};

export default SidebarNavigation;
