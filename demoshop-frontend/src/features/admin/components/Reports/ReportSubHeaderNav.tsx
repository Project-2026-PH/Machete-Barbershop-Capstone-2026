import React from 'react';
import { useSearchParams } from 'react-router';
import {
    Receipt,
    TrendingUp,
    Percent,
    Package,
    Calendar,
    Lock,
    ShieldAlert,
    type LucideIcon,
} from 'lucide-react';

export interface ReportSubNavItem {
    id: string;
    label: string;
    icon: LucideIcon;
}

export const REPORT_SUB_ITEMS: ReportSubNavItem[] = [
    { id: 'transactions', label: 'Transactions', icon: Receipt },
    { id: 'sales', label: 'Sales', icon: TrendingUp },
    { id: 'commissions', label: 'Commissions', icon: Percent },
    { id: 'inventory', label: 'Inventory Report', icon: Package },
    { id: 'appointments', label: 'Reservations', icon: Calendar },
    { id: 'audit-logs', label: 'Audit Logs', icon: ShieldAlert },
];

export interface ReportSubHeaderNavProps {
    activeSub?: string;
    onSelect?: (sub: string) => void;
    className?: string;
}

export const ReportSubHeaderNav: React.FC<ReportSubHeaderNavProps> = ({
    activeSub = 'transactions',
    onSelect,
    className = '',
}) => {
    const [, setSearchParams] = useSearchParams();

    const normalizedActive =
        activeSub === 'reports-transactions' || !activeSub
            ? 'transactions'
            : activeSub;

    const handleTabClick = (subId: string) => {
        if (onSelect) {
            onSelect(subId);
        }
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set('tab', 'reports');
            next.set('subtab', subId);
            return next;
        });
    };

    return (
        <div className={`w-full overflow-x-auto whitespace-nowrap scrollbar-none touch-pan-x [-webkit-overflow-scrolling:touch] shrink-0 lg:hidden ${className}`}>
            <nav
                aria-label="Report sub-navigation"
                className="inline-flex items-center gap-1 p-1 bg-charcoal-light/95 border border-white/10 rounded-xl shadow-xs"
            >
                {REPORT_SUB_ITEMS.map((item) => {
                    const isActive = normalizedActive === item.id;
                    const Icon = item.icon;

                    return (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => handleTabClick(item.id)}
                            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer flex items-center gap-1.5 touch-manipulation min-h-[34px] select-none ${
                                isActive
                                    ? 'bg-gold text-charcoal font-bold shadow-xs border border-gold'
                                    : 'text-ivory-dim/80 hover:text-ivory hover:bg-white/5 border border-transparent'
                            }`}
                        >
                            <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-charcoal' : 'text-gold'}`} />
                            <span>{item.label}</span>
                        </button>
                    );
                })}
            </nav>
        </div>
    );
};

export default ReportSubHeaderNav;
