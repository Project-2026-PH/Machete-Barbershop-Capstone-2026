import { DashboardSidebarHeader } from '@/components/layout/DashboardSidebarHeader';
import { 
    Scissors, 
    History, 
    TrendingUp, 
    CalendarClock,
} from 'lucide-react';
import React, { useState } from 'react';
import { DashboardSidebarFooter } from '@/components/layout/DashboardSidebarFooter';

interface BarberSidebarProps {
    activeTab: string;
    setActiveTab: (tab: string) => void;
    handleLogout?: () => void;
    branchName?: string;
    barberName?: string;
    onOpenProfile?: () => void;
    onCollapsedChange?: (collapsed: boolean) => void;
}

interface NavItem {
    id: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    description?: string;
}

export const BarberSidebar: React.FC<BarberSidebarProps> = ({
    activeTab,
    setActiveTab,
    handleLogout,
    onOpenProfile,
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

    const navItems: NavItem[] = [
        { 
            id: 'queue', 
            label: 'Queue Dashboard', 
            icon: Scissors,
            description: 'Live waiting queue & chair' 
        },
        { 
            id: 'history', 
            label: 'Customer History', 
            icon: History,
            description: 'Logs, notes & past cuts' 
        },
        { 
            id: 'profile', 
            label: 'My Portfolio', 
            icon: TrendingUp,
            description: 'Specialties, work & feedback' 
        },
        { 
            id: 'status', 
            label: 'Shift Schedule', 
            icon: CalendarClock,
            description: 'Weekly assigned shifts' 
        },
    ];

    return (
        <>
            <aside className={`bg-charcoal-light border-r border-white/5 fixed h-full z-20 hidden lg:flex flex-col select-none transition-[width] duration-200 ease-in-out ${isCollapsed ? 'w-20' : 'w-64'}`}>
                <DashboardSidebarHeader
                    isCollapsed={isCollapsed}
                    onToggleCollapsed={toggleCollapsed}
                    moduleName="Barber Portal"
                    moduleIcon={Scissors}
                />

                {/* Navigation Menu */}
                <nav className={`space-y-1.5 flex-1 overflow-y-auto ${isCollapsed ? 'p-2' : 'p-3.5'}`}>
                    <div className={`px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-ivory-dim/60 font-semibold ${isCollapsed ? 'sr-only' : ''}`}>
                        Menu
                    </div>
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = activeTab === item.id;

                        return (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => setActiveTab(item.id)}
                                title={isCollapsed ? item.label : undefined}
                                className={`w-full group flex items-center justify-between rounded-sm transition-all duration-200 cursor-pointer text-left ${
                                    isCollapsed ? 'justify-center p-2.5' : 'px-3 py-2.5'
                                } ${
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
                                    {!isCollapsed && (
                                        <div className="truncate">
                                            <span className={`text-sm block tracking-wide ${isActive ? 'font-bold text-gold' : 'font-medium'}`}>
                                                {item.label}
                                            </span>
                                        </div>
                                    )}
                                </div>
                                {isActive && !isCollapsed && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-gold shadow-[0_0_8px_rgba(212,175,55,0.9)] shrink-0"></span>
                                )}
                            </button>
                        );
                    })}
                </nav>

                {/* Standardized Sidebar Footer */}
                <DashboardSidebarFooter 
                    onLogout={handleLogout} 
                    className={isCollapsed ? 'p-2 [&_button]:justify-center [&_button]:gap-0 [&_button]:px-2 [&_button]:text-[0px] [&>div:last-child]:hidden' : ''} 
                />
            </aside>
        </>
    );
};

export default BarberSidebar;

