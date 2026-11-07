import React from 'react';
import {
    Scissors,
    ShoppingBag,
    Building2,
    TrendingUp,
    type LucideIcon,
} from 'lucide-react';

export interface InventorySubNavItem {
    id: 'consumables' | 'retails' | 'suppliers' | 'forecast';
    label: string;
    icon: LucideIcon;
}

export const INVENTORY_SUB_ITEMS: InventorySubNavItem[] = [
    { id: 'consumables', label: 'Consumables', icon: Scissors },
    { id: 'retails', label: 'Retail Items', icon: ShoppingBag },
    { id: 'suppliers', label: 'Suppliers', icon: Building2 },
    { id: 'forecast', label: 'Forecasting', icon: TrendingUp },
];

export interface InventorySubHeaderNavProps {
    activeSub?: 'consumables' | 'retails' | 'suppliers' | 'forecast';
    onSelect?: (sub: 'consumables' | 'retails' | 'suppliers' | 'forecast') => void;
    className?: string;
}

export const InventorySubHeaderNav: React.FC<InventorySubHeaderNavProps> = ({
    activeSub = 'consumables',
    onSelect,
    className = '',
}) => {
    return (
        <div className={`w-full overflow-x-auto whitespace-nowrap scrollbar-none touch-pan-x [-webkit-overflow-scrolling:touch] shrink-0 lg:hidden ${className}`}>
            <nav
                aria-label="Inventory sub-navigation"
                className="inline-flex items-center gap-1 p-1 bg-charcoal-light/95 border border-white/10 rounded-xl shadow-xs"
            >
                {INVENTORY_SUB_ITEMS.map((item) => {
                    const isActive = activeSub === item.id;
                    const Icon = item.icon;

                    return (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => onSelect?.(item.id)}
                            className={`shrink-0 px-3 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer flex items-center gap-1.5 touch-manipulation min-h-[44px] select-none ${
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

export default InventorySubHeaderNav;
