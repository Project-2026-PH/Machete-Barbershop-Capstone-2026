import React from 'react';
import InventoryCountsTab from './InventoryCountsTab';
import { SupplierPanel } from '@/features/inventory-manager/InventoryManagerOperations';
import { InventorySubHeaderNav } from '@/features/admin/components/Inventory/InventorySubHeaderNav';
import InventoryForecastPanel from '@/features/inventory/components/InventoryForecastPanel';

export type InventorySubTab = 'consumables' | 'retails' | 'suppliers' | 'forecast';

interface InventoryTabProps {
    activeSubTab?: string;
    onSelectSubTab?: (subTab: InventorySubTab) => void;
}

const InventoryTab: React.FC<InventoryTabProps> = ({ activeSubTab = 'consumables', onSelectSubTab }) => {
    const current = ['consumables', 'retails', 'suppliers', 'forecast'].includes(activeSubTab) ? activeSubTab as InventorySubTab : 'consumables';

    return (
        <section className="h-full min-h-0 flex flex-col gap-3 overflow-y-auto custom-scrollbar pb-24 sm:pb-28 lg:pb-6 touch-pan-y [-webkit-overflow-scrolling:touch]">
            {/* Page Header (Consistent with Reports & Audits) */}
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between shrink-0">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold">Owner/Admin • Authoritative Stock</p>
                    <h2 className="mt-1 text-2xl font-serif font-bold text-ivory">Inventory Management</h2>
                    <p className="mt-1 max-w-xl text-xs text-ivory-dim">
                        Manage stock operations and review the read-only demand baseline for replenishment decisions.
                    </p>
                </div>
            </div>

            {/* Top Sub-Header Segmented Bar (Anchored beneath header, exactly like Reports & Audits) */}
            <div className="shrink-0 lg:hidden">
                <InventorySubHeaderNav
                    activeSub={current}
                    onSelect={(sub) => {
                        if (sub !== 'forecast') onSelectSubTab?.(sub);
                    }}
                />
            </div>

            {/* Content Body Container */}
            <div className="w-full shrink-0 lg:shrink lg:flex-1 lg:min-h-0 flex flex-col overflow-visible">
                {current === 'forecast' ? (
                    <InventoryForecastPanel role="admin" />
                ) : current === 'suppliers' ? (
                    <SupplierPanel embedded={true} />
                ) : (
                    <InventoryCountsTab
                        category={current}
                        onSelectCategory={(category) => onSelectSubTab?.(category)}
                        embedded={true}
                    />
                )}
            </div>
        </section>
    );
};

export default InventoryTab;
