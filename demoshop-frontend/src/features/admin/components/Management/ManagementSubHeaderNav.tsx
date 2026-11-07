import React from 'react';
import { useSearchParams } from 'react-router';
import {
    Users,
    CalendarClock,
    Scissors,
    ShieldCheck,
    Star,
    Wallet,
    type LucideIcon,
} from 'lucide-react';

export interface ManagementSubNavItem {
    id: string;
    label: string;
    icon: LucideIcon;
}

export const MANAGEMENT_SUB_ITEMS: ManagementSubNavItem[] = [
    { id: 'staff', label: 'Staff Directory', icon: Users },
    { id: 'shifts', label: 'Staff Shifts', icon: CalendarClock },
    { id: 'services', label: 'Services', icon: Scissors },
    { id: 'roles-access', label: 'Roles & Access', icon: ShieldCheck },
    { id: 'reviews', label: 'Barbershop Reviews', icon: Star },
    { id: 'drawer', label: 'Money Drawer', icon: Wallet },
];

export interface ManagementSubHeaderNavProps {
    activeSub?: string;
    onSelect?: (sub: string) => void;
    className?: string;
}

export const ManagementSubHeaderNav: React.FC<ManagementSubHeaderNavProps> = ({
    activeSub = 'staff',
    onSelect,
    className = '',
}) => {
    const [, setSearchParams] = useSearchParams();

    const normalizedActive = !activeSub || activeSub === 'management' ? 'staff' : activeSub;

    const handleTabClick = (subId: string) => {
        if (onSelect) {
            onSelect(subId);
        }
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set('tab', 'management');
            next.set('subtab', subId);
            return next;
        });
    };

    return (
        <div className={`w-full overflow-x-auto no-scrollbar scrollbar-none flex-nowrap whitespace-nowrap touch-pan-x [-webkit-overflow-scrolling:touch] shrink-0 lg:hidden ${className}`}>
            <nav
                aria-label="Management sub-navigation"
                className="inline-flex items-center gap-1.5 p-1 bg-charcoal-light/95 border border-white/10 rounded-xl shadow-xs"
            >
                {MANAGEMENT_SUB_ITEMS.map((item) => {
                    const isActive = normalizedActive === item.id;
                    const Icon = item.icon;

                    return (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => handleTabClick(item.id)}
                            className={`shrink-0 px-3.5 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer flex items-center gap-2 touch-manipulation min-h-[36px] select-none ${
                                isActive
                                    ? 'bg-[#d4af37] text-black font-bold shadow-xs border border-[#d4af37]'
                                    : 'border border-white/10 text-neutral-400 hover:text-ivory hover:bg-white/5'
                            }`}
                        >
                            <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-black' : 'text-[#d4af37]'}`} />
                            <span>{item.label}</span>
                        </button>
                    );
                })}
            </nav>
        </div>
    );
};

export default ManagementSubHeaderNav;
