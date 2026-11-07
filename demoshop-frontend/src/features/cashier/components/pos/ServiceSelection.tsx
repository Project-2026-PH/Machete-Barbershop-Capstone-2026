import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Package, Plus, Scissors, Search, UserPlus, Lock, Eye, EyeOff } from 'lucide-react';
import { fetchRetailCatalog, fetchServiceCatalog } from '../../services/cashier-catalog.service';
import { invalidateCashierRequests } from '../../services/shared-request-cache';
import { useAuth } from '@/components/auth/AuthContext';
import { useToast } from '@/components/feedback/ToastContext';
import { useInventoryRealtime } from '@/features/inventory-manager/shared/hooks/useInventoryRealtime';
import { validateServiceCombo, type ComboEligibleService } from '@demoshop/shared-types';

export interface SelectionItem {
    id: string;
    name: string;
    price: number;
    type: string;
    category?: string | null;
    sub_category?: string | null;
    kind: 'service' | 'product';
    duration?: number;
    stock?: number;
    unit?: string;
    quantity?: number;
}

interface ServiceSelectionProps {
    orderStarted: boolean;
    onToggleItem: (item: SelectionItem) => void;
    selectedItemKeys?: string[];
    selectedItems?: any[];
    originalItemKeys?: string[];
    isEditMode?: boolean;
    retailOnly?: boolean;
}

const itemKey = (item: Pick<SelectionItem, 'kind' | 'id'>) => `${item.kind}:${item.id}`;

const toComboService = (item: any): ComboEligibleService => ({
    service_id: Number(item.id ?? item.service_id),
    title: String(item.name ?? item.title ?? ''),
    category: item.category ?? item.type ?? null,
    sub_category: item.sub_category ?? null,
});

const ServiceSelection: React.FC<ServiceSelectionProps> = ({
    orderStarted,
    onToggleItem,
    selectedItemKeys = [],
    selectedItems = [],
    originalItemKeys,
    isEditMode = false,
    retailOnly = false,
}) => {
    const { user } = useAuth();
    const { addToast } = useToast();
    const branchId = Number(user?.branch_id);
    const catalogScope = Number.isInteger(branchId) && branchId > 0 ? String(branchId) : 'current';
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'SERVICE' | 'RETAIL'>('ALL');
    const [services, setServices] = useState<SelectionItem[]>([]);
    const [products, setProducts] = useState<SelectionItem[]>([]);
    const [showLocked, setShowLocked] = useState(false);

    // Auto-hide locked services whenever selected items change
    useEffect(() => {
        setShowLocked(false);
    }, [selectedItemKeys]);

    const loadCatalogs = useCallback(async () => {
        try {
            const [serviceResponse, inventoryResponse] = await Promise.all([
                fetchServiceCatalog(),
                fetchRetailCatalog(catalogScope),
            ]);
            const mappedServices = Array.isArray(serviceResponse.data) ? serviceResponse.data.map((service) => ({
                    id: String(service.service_id),
                    name: service.title,
                    price: Number(service.price) || 0,
                    type: service.category || 'Service',
                    category: service.category ?? null,
                    sub_category: service.sub_category ?? null,
                    kind: 'service' as const,
                    duration: Number(service.duration_minutes) || 30,
                })) : [];
            const mappedProducts = Array.isArray(inventoryResponse.data)
                ? inventoryResponse.data
                    .filter((item) => item.category === 'Customer retail' || item.ownership === 'Retail Items')
                    .map((item) => ({
                            id: String(item.productId || item.id),
                            name: item.name,
                            price: Number(item.retailPrice) || 0,
                            type: item.unit ? `Retail · ${item.unit}` : 'Retail',
                            kind: 'product' as const,
                            stock: Number(item.currentStock) || 0,
                            unit: item.unit,
                    }))
                : [];
            setServices(mappedServices);
            setProducts(mappedProducts);
            window.dispatchEvent(new CustomEvent('demoshop:cashier-retail-catalog-updated', {
                detail: { scope: catalogScope },
            }));
        } catch (error) {
            console.error('Failed to load POS catalog', error);
            setServices([]);
            setProducts([]);
        }
    }, [catalogScope]);

    useEffect(() => {
        void loadCatalogs();
    }, [loadCatalogs]);

    const reloadCatalogs = useCallback(() => {
        invalidateCashierRequests(`catalog:retail:${catalogScope}`);
        return loadCatalogs();
    }, [catalogScope, loadCatalogs]);

    useInventoryRealtime({
        channelName: `cashier-pos-catalog-${catalogScope}`,
        tables: ['inventory_products', 'inventory_stock'],
        windowEvents: ['demoshop:inventory-changed'],
        onReload: reloadCatalogs,
    });

    const selectedServiceItems = useMemo(() => {
        if (selectedItems && selectedItems.length > 0) {
            return selectedItems.filter(item => item.kind !== 'product');
        }
        return services.filter(s => selectedItemKeys.includes(itemKey(s)));
    }, [services, selectedItemKeys, selectedItems]);

    const evaluatedServices = useMemo(() => {
        return services.map((service) => {
            const isSelected = selectedItemKeys.includes(itemKey(service));
            let isLocked = false;
            let conflictReason: string | undefined = undefined;

            if (!isEditMode && !isSelected && selectedServiceItems.length > 0) {
                const candidate = [...selectedServiceItems, service];
                const conflict = validateServiceCombo(candidate.map(toComboService));
                if (conflict) {
                    isLocked = true;
                    conflictReason = conflict.reason;
                }
            }

            return {
                ...service,
                isSelected,
                isLocked,
                conflictReason,
            };
        });
    }, [services, selectedItemKeys, selectedServiceItems, isEditMode]);

    const totalLockedCount = useMemo(() => {
        return evaluatedServices.filter(s => s.isLocked && !s.isSelected).length;
    }, [evaluatedServices]);

    const visibleServices = useMemo(() => {
        const normalizedSearch = searchTerm.trim().toLowerCase();
        return evaluatedServices.filter((service) => {
            const matchesSearch = !normalizedSearch || `${service.name} ${service.type} ${service.sub_category || ''}`.toLowerCase().includes(normalizedSearch);
            if (!matchesSearch) return false;

            // Auto-hide: if showLocked is false, hide locked unselected services
            if (!showLocked && service.isLocked && !service.isSelected) {
                return false;
            }

            return true;
        });
    }, [searchTerm, evaluatedServices, showLocked]);

    const visibleProducts = useMemo(() => {
        const normalizedSearch = searchTerm.trim().toLowerCase();
        return products.filter((product) => {
            const matchesSearch = !normalizedSearch || `${product.name} ${product.type}`.toLowerCase().includes(normalizedSearch);
            return matchesSearch;
        });
    }, [searchTerm, products]);

    const itemClass = (isSelected: boolean, disabled: boolean, isLocked: boolean, isNewlyAdded: boolean = false) =>
        `flex items-center justify-between rounded-sm border p-3.5 text-left transition-all ${
            disabled
                ? 'cursor-not-allowed border-white/5 opacity-40 bg-charcoal/40'
                : isLocked
                    ? 'cursor-not-allowed border-red-500/20 bg-red-950/10 opacity-60 hover:bg-red-950/20'
                    : isNewlyAdded
                        ? 'cursor-pointer border-emerald-500/40 bg-emerald-500/[0.08] hover:border-emerald-500/60 hover:bg-emerald-500/[0.12]'
                        : isSelected
                            ? 'cursor-pointer border-gold/50 bg-gold/[0.08] hover:border-gold hover:bg-gold/[0.12]'
                            : 'cursor-pointer border-white/10 bg-white/5 hover:border-gold/30 hover:bg-white/[0.08]'
        }`;

    const showServices = !retailOnly && (categoryFilter === 'ALL' || categoryFilter === 'SERVICE');
    const showRetail = categoryFilter === 'ALL' || categoryFilter === 'RETAIL';

    return (
        <div className="space-y-5">
            {!orderStarted && (
                <div className="flex items-center gap-3 rounded-sm border border-white/10 bg-white/5 p-3.5 text-xs text-ivory-dim">
                    <UserPlus className="h-4 w-4 shrink-0 text-gold" />
                    <span>Services unlock after you start the order and enter the customer details.</span>
                </div>
            )}
            <div className="flex flex-col justify-between gap-3 sm:flex-row">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ivory-dim" />
                    <input
                        type="text"
                        placeholder="Search services and retail..."
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        className="w-full rounded-sm border border-white/10 bg-charcoal/80 py-1.5 pl-9 pr-3 text-xs sm:text-sm text-ivory transition-colors focus:border-gold/60 focus:outline-none focus:ring-1 focus:ring-gold/50 placeholder:text-ivory-dim/40"
                    />
                </div>
                <div className="flex gap-1.5 shrink-0">
                    {(['ALL', 'SERVICE', 'RETAIL'] as const).map((category) => (
                        <button
                            type="button"
                            key={category}
                            onClick={() => setCategoryFilter(category)}
                            className={`rounded-sm px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                                categoryFilter === category
                                    ? 'bg-gold text-charcoal font-bold shadow-sm'
                                    : 'border border-white/10 bg-white/5 text-ivory-dim hover:text-ivory hover:bg-white/10'
                            }`}
                        >
                            {category === 'ALL' ? 'All' : category === 'SERVICE' ? 'Services' : 'Retail'}
                        </button>
                    ))}
                </div>
            </div>

            <div className="space-y-6">
                {showServices && (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gold">
                                <Scissors className="h-3.5 w-3.5" /> Services
                            </h3>
                            {totalLockedCount > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setShowLocked(prev => !prev)}
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-sm border transition-all ${
                                        showLocked
                                            ? 'bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25'
                                            : 'bg-white/5 text-ivory-dim border-white/10 hover:border-gold/40 hover:text-gold'
                                    }`}
                                >
                                    {showLocked ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                    <span>{showLocked ? 'Hide Unavailable' : `Show Unavailable (${totalLockedCount})`}</span>
                                </button>
                            )}
                        </div>

                        {visibleServices.length === 0 ? (
                            <div className="rounded-sm border border-dashed border-white/10 bg-white/[0.02] p-6 text-center space-y-3">
                                <p className="text-xs text-ivory-dim">
                                    {totalLockedCount > 0
                                        ? 'All matching services are currently unavailable with your selection.'
                                        : 'No services match your criteria.'}
                                </p>
                                {totalLockedCount > 0 && !showLocked && (
                                    <button
                                        type="button"
                                        onClick={() => setShowLocked(true)}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-sm border border-gold/30 text-gold hover:bg-gold/10 transition-colors"
                                    >
                                        <Eye className="h-3.5 w-3.5" /> Show unavailable services ({totalLockedCount})
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                {visibleServices.map((service) => {
                                    const key = itemKey(service);
                                    const isSelected = selectedItemKeys.includes(key);
                                    const isOriginal = originalItemKeys ? originalItemKeys.includes(key) : false;
                                    const isNewlyAdded = isEditMode && isSelected && !isOriginal;
                                    const disabled = !orderStarted || service.isLocked;
                                    return (
                                        <button
                                            key={key}
                                            type="button"
                                            disabled={disabled}
                                            onClick={() => {
                                                if (service.isLocked) {
                                                    addToast({
                                                        type: 'warning',
                                                        title: 'Combination not allowed',
                                                        message: service.conflictReason || 'This service conflicts with your current selection.',
                                                    });
                                                    return;
                                                }
                                                onToggleItem(service);
                                            }}
                                            aria-pressed={isSelected}
                                            aria-disabled={disabled}
                                            title={service.conflictReason}
                                            className={`${itemClass(isSelected, !orderStarted, service.isLocked, isNewlyAdded)} group items-start`}
                                        >
                                            <div className="min-w-0 flex-1 pr-2">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className={`text-xs sm:text-sm font-semibold transition-colors ${isNewlyAdded ? 'text-emerald-300' : isSelected ? 'text-gold' : 'text-ivory group-hover:text-gold'}`}>
                                                        {service.name}
                                                    </span>
                                                    {service.sub_category && (
                                                        <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[9px] uppercase font-bold tracking-wider bg-gold/10 text-gold/80 border border-gold/20">
                                                             {service.sub_category}
                                                        </span>
                                                    )}
                                                    {service.isLocked && (
                                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[9px] uppercase font-bold tracking-wider bg-red-900/30 text-red-300 border border-red-500/30">
                                                            <Lock className="h-2.5 w-2.5" />
                                                            Locked
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="mt-1 text-xs text-ivory-dim">
                                                    {service.type} · {service.duration} mins
                                                </div>
                                                {service.isLocked && service.conflictReason && (
                                                    <p className="mt-1 text-[11px] text-red-300/90 font-medium">
                                                        {service.conflictReason}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="flex min-w-0 max-w-[48%] shrink-0 flex-col items-end gap-1.5 text-right">
                                                <div className={`font-bold text-sm ${isNewlyAdded ? 'text-emerald-400' : 'text-gold'}`}>₱{service.price}</div>
                                                {isNewlyAdded ? (
                                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase tracking-wider">
                                                        + Added
                                                    </span>
                                                ) : isSelected ? (
                                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-gold/20 text-gold border border-gold/30 uppercase tracking-wider">
                                                        ✓ Selected
                                                    </span>
                                                ) : service.isLocked ? (
                                                    <div className="rounded-full bg-red-950/40 border border-red-500/30 p-1 text-red-400">
                                                        <Lock className="h-3.5 w-3.5" />
                                                    </div>
                                                ) : (
                                                    <div className="rounded-sm bg-white/5 border border-white/10 p-1 opacity-0 transition-opacity group-hover:opacity-100">
                                                        <Plus className="h-3.5 w-3.5 text-ivory" />
                                                    </div>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {totalLockedCount > 0 && (
                            <div className="flex items-center justify-between rounded-sm border border-white/5 bg-charcoal/60 px-3.5 py-2 text-xs text-ivory-dim">
                                <span className="flex items-center gap-1.5">
                                    <Lock className="h-3.5 w-3.5 text-gold/60" />
                                    {showLocked
                                        ? `Showing ${totalLockedCount} unavailable ${totalLockedCount === 1 ? 'service' : 'services'}`
                                        : `${totalLockedCount} ${totalLockedCount === 1 ? 'service' : 'services'} unavailable with current selection`}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setShowLocked(prev => !prev)}
                                    className="font-bold uppercase tracking-wider text-gold hover:text-gold-light transition-colors flex items-center gap-1"
                                >
                                    {showLocked ? (
                                        <>
                                            <EyeOff className="h-3 w-3" /> Hide
                                        </>
                                    ) : (
                                        <>
                                            <Eye className="h-3 w-3" /> Show
                                        </>
                                    )}
                                </button>
                            </div>
                        )}
                    </div>
                )}
                {showRetail && (
                    <div className="space-y-3">
                        <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gold">
                            <Package className="h-3.5 w-3.5" /> Retail Products
                        </h3>
                        {visibleProducts.length === 0 ? (
                            <div className="rounded-sm border border-dashed border-white/10 bg-white/[0.02] p-6 text-center">
                                <p className="text-xs text-ivory-dim">No retail products are available.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                {visibleProducts.map((product) => {
                                    const key = itemKey(product);
                                    const isSelected = selectedItemKeys.includes(key);
                                    const isOriginal = originalItemKeys ? originalItemKeys.includes(key) : false;
                                    const isNewlyAdded = isEditMode && isSelected && !isOriginal;
                                    const outOfStock = (product.stock ?? 0) <= 0;
                                    const disabled = !orderStarted || (outOfStock && !isSelected);
                                    return (
                                        <button
                                            key={key}
                                            type="button"
                                            disabled={disabled}
                                            onClick={() => onToggleItem(product)}
                                            aria-pressed={isSelected}
                                            className={`${itemClass(isSelected, disabled, false, isNewlyAdded)} group items-start`}
                                        >
                                            <div className="min-w-0 flex-1 pr-2">
                                                <div className={`text-xs sm:text-sm font-semibold transition-colors ${isNewlyAdded ? 'text-emerald-300' : 'text-ivory group-hover:text-gold'} truncate`}>
                                                    {product.name}
                                                </div>
                                                <div className="mt-1 text-xs text-ivory-dim">
                                                    {product.type} · {outOfStock ? 'Out of stock' : `${product.stock} in stock`}
                                                </div>
                                            </div>
                                            <div className="flex min-w-0 max-w-[48%] shrink-0 flex-col items-end gap-1.5 text-right">
                                                <div className={`font-bold text-sm ${isNewlyAdded ? 'text-emerald-400' : 'text-gold'}`}>₱{product.price}</div>
                                                {isNewlyAdded ? (
                                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase tracking-wider">
                                                        + Added
                                                    </span>
                                                ) : isSelected ? (
                                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-gold/20 text-gold border border-gold/30 uppercase tracking-wider">
                                                        ✓ Selected
                                                    </span>
                                                ) : !outOfStock && (
                                                    <div className="rounded-sm bg-white/5 border border-white/10 p-1 opacity-0 transition-opacity group-hover:opacity-100">
                                                        <Plus className="h-3.5 w-3.5 text-ivory" />
                                                    </div>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ServiceSelection;
