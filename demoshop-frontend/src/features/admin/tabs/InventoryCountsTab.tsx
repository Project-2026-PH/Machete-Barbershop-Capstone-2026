import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { AlertTriangle, Calendar, ChevronDown, Eye, EyeOff, Package, Pencil, Plus, RefreshCw, Scissors, Search, ShoppingBag, Trash2, X } from 'lucide-react';
import { api } from '@/config/api';
import { supabase } from '@/config/supabaseClient';
import { useToast } from '@/components/feedback/ToastContext';
import { Modal } from '@/components/feedback/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { QUANTITY_UNITS, QuantityUnit } from '@demoshop/shared-types';
import { ProductImageFallback } from '../../shop/ProductImageFallback';
import { RetailProductModal } from '../components/RetailProductModal';
import { useSearchHighlight } from '@/features/admin/hooks/useSearchHighlight';

type InventoryCategory = 'barber_assigned' | 'shared_retail';

type InventoryRow = {
    id: string;
    productId: string;
    name: string;
    category: string;
    ownership: string;
    unit: string;
    costPrice: number;
    retailPrice: number | null;
    imageUrl?: string | null;
    retailCategory?: string | null;
    tags?: string[];
    showInShop?: boolean;
    defaultSupplierId: string | null;
    defaultSupplierName: string | null;
    currentStock: number;
    criticalStock: number;
    safetyStock: number;
    highVolumeMultiplier: number;
    stockStatus: string;
    expirationDate?: string | null;
};

type NewItemState = {
    category: InventoryCategory;
    name: string;
    unit: QuantityUnit | string;
    initialQuantity: string;
    costPrice: string;
    retailPrice: string;
    supplierId: string;
    expirationDate?: string;
    validationError: string;
} | null;

const statusClasses: Record<string, string> = {
    Critical: 'border-red-400/40 bg-red-400/10 text-red-300 font-semibold',
    Low: 'border-amber-400/40 bg-amber-400/10 text-amber-300 font-semibold',
    Normal: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300 font-semibold',
    Overstock: 'border-sky-400/40 bg-sky-400/10 text-sky-300 font-semibold',
};

export type ExpirationStatus = 'expired' | 'expiring_soon' | 'valid' | 'none';

export const getExpirationStatus = (expirationDate?: string | null): {
    status: ExpirationStatus;
    label: string;
    formattedDate: string;
    badgeClass: string;
} => {
    if (!expirationDate) {
        return {
            status: 'none',
            label: 'No expiration set',
            formattedDate: 'No expiration set',
            badgeClass: 'text-ivory-dim/60 border-white/10 bg-white/5',
        };
    }

    const cleanDate = expirationDate.split('T')[0];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [year, month, day] = cleanDate.split('-').map(Number);
    const expDate = new Date(year, month - 1, day);
    expDate.setHours(0, 0, 0, 0);

    const diffTime = expDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
        return {
            status: 'expired',
            label: 'Expired',
            formattedDate: cleanDate,
            badgeClass: 'border-red-500/40 bg-red-500/15 text-red-300',
        };
    }

    if (diffDays <= 30) {
        return {
            status: 'expiring_soon',
            label: 'Expiring Soon',
            formattedDate: cleanDate,
            badgeClass: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
        };
    }

    return {
        status: 'valid',
        label: 'Valid',
        formattedDate: cleanDate,
        badgeClass: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400/80',
    };
};

const getRequestError = (error: any, fallback: string) => (
    error?.response?.data?.message
    || error?.response?.data?.error
    || fallback
);

const toInventoryRow = (value: any): InventoryRow => ({
    id: String(value.id),
    productId: String(value.productId ?? value.inventory_product_id ?? value.id),
    name: String(value.name || 'Inventory item'),
    category: String(value.category || 'Customer retail'),
    ownership: (value.ownership === 'Consumables' || value.ownership === 'Barber-assigned' || value.category === 'Barber supplies')
        ? 'Consumables'
        : 'Retail',
    unit: String(value.unit || 'pc'),
    costPrice: Number(Number(value.costPrice ?? 0).toFixed(2)),
    retailPrice: value.retailPrice == null ? null : Number(Number(value.retailPrice).toFixed(2)),
    imageUrl: value.imageUrl || value.image_url || null,
    retailCategory: value.retailCategory || value.retail_category || null,
    tags: Array.isArray(value.tags) ? value.tags : [],
    showInShop: Boolean(value.showInShop ?? value.show_in_shop),
    defaultSupplierId: value.defaultSupplierId == null ? null : String(value.defaultSupplierId),
    defaultSupplierName: value.defaultSupplierName == null ? null : String(value.defaultSupplierName),
    currentStock: Math.floor(Number(value.currentStock ?? 0)),
    criticalStock: Number(value.criticalStock ?? 0),
    safetyStock: Number(value.safetyStock ?? 0),
    highVolumeMultiplier: Number(value.highVolumeMultiplier ?? 1),
    stockStatus: String(value.stockStatus || 'Normal'),
    expirationDate: value.expirationDate || value.expiration_date ? String(value.expirationDate || value.expiration_date).split('T')[0] : null,
});

const isConsumables = (item: InventoryRow) => (
    item.ownership === 'Consumables' || item.ownership === 'Barber-assigned'
);

const CUSTOM_UNITS_STORAGE_KEY = 'demoshop:custom-quantity-units';

const loadStoredCustomUnits = (): string[] => {
    try {
        const raw = localStorage.getItem(CUSTOM_UNITS_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                return parsed.map((item) => String(item).trim().toLowerCase()).filter(Boolean);
            }
        }
    } catch {
        // ignore storage read errors
    }
    return [];
};

interface InventoryCountsTabProps {
    category?: 'all' | 'consumables' | 'retails';
    onSelectCategory?: (category: 'consumables' | 'retails') => void;
    embedded?: boolean;
}

const InventoryCountsTab: React.FC<InventoryCountsTabProps> = ({ category = 'all', onSelectCategory, embedded = false }) => {
    const [searchParams] = useSearchParams();
    const [inventory, setInventory] = useState<InventoryRow[]>([]);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [newItemState, setNewItemState] = useState<NewItemState>(null);
    const [editingItemId, setEditingItemId] = useState<string | null>(null);
    const [isAddingItem, setIsAddingItem] = useState(false);
    const [expandedCardIds, setExpandedCardIds] = useState<Record<string, boolean>>({});
    const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string; isActive: boolean }>>([]);
    const [availableCategories, setAvailableCategories] = useState<string[]>(['Hair', 'Beard', 'Face', 'Tools', 'Grooming']);
    const [availableTags, setAvailableTags] = useState<string[]>(['New', 'Popular', 'Barber Pick', 'Premium', 'Best Seller']);
    const [retailModalState, setRetailModalState] = useState<{ isOpen: boolean; item: InventoryRow | null }>({
        isOpen: false,
        item: null,
    });
    const loadControllerRef = useRef<AbortController | null>(null);
    const { addToast } = useToast();
    const [customUnits, setCustomUnits] = useState<string[]>(loadStoredCustomUnits);
    const [isCustomUnitMode, setIsCustomUnitMode] = useState(false);
    const [customUnitInput, setCustomUnitInput] = useState('');

    const availableUnits = useMemo(() => {
        const set = new Set<string>();
        QUANTITY_UNITS.forEach((unit) => set.add(unit));
        customUnits.forEach((unit) => set.add(unit));
        if (newItemState?.unit && !isCustomUnitMode && newItemState.unit !== '__add_custom__') {
            set.add(newItemState.unit.trim().toLowerCase());
        }
        return Array.from(set);
    }, [customUnits, newItemState?.unit, isCustomUnitMode]);

    const handleSaveCustomUnit = useCallback(() => {
        const trimmed = customUnitInput.trim().toLowerCase();
        if (!trimmed) {
            setNewItemState((current) => current ? { ...current, validationError: 'Please enter a custom unit name.' } : current);
            return;
        }
        if (trimmed.length > 32) {
            setNewItemState((current) => current ? { ...current, validationError: 'Custom unit must be 32 characters or fewer.' } : current);
            return;
        }

        setCustomUnits((prev) => {
            const next = Array.from(new Set([...prev, trimmed]));
            try {
                localStorage.setItem(CUSTOM_UNITS_STORAGE_KEY, JSON.stringify(next));
            } catch {
                // ignore storage error
            }
            return next;
        });

        setNewItemState((current) => current ? { ...current, unit: trimmed, validationError: '' } : current);
        setIsCustomUnitMode(false);
        setCustomUnitInput('');
        addToast({
            type: 'success',
            title: 'Custom unit saved',
            message: `"${trimmed}" is now set as the quantity unit.`,
        });
    }, [customUnitInput, addToast]);

    // Trigger glow animation and smooth scroll-into-view when items load
    useSearchHighlight(!isLoading && inventory.length > 0);

    // Sync search term and status with URL params if provided
    useEffect(() => {
        const q = searchParams.get('search') || searchParams.get('q');
        if (q !== null) {
            setSearchTerm(q);
        }
    }, [searchParams]);

    const replaceInventory = useCallback((values: any[]) => {
        const rows = values.map(toInventoryRow);
        const map = new Map<string, InventoryRow>();
        for (const row of rows) {
            const key = `${row.ownership}:${row.name.trim().toLowerCase()}:${row.unit.trim().toLowerCase()}`;
            const existing = map.get(key);
            if (existing) {
                existing.currentStock += row.currentStock;
                existing.costPrice = Math.max(existing.costPrice, row.costPrice);
                existing.criticalStock = Math.max(existing.criticalStock, row.criticalStock);
                existing.safetyStock = Math.max(existing.safetyStock, row.safetyStock);
                existing.stockStatus = existing.currentStock <= existing.criticalStock || existing.currentStock === 0
                    ? 'Critical'
                    : (existing.safetyStock > 0 && existing.currentStock <= existing.safetyStock ? 'Low' : 'Normal');
                if (!existing.imageUrl && row.imageUrl) existing.imageUrl = row.imageUrl;
                if (!existing.retailCategory && row.retailCategory) existing.retailCategory = row.retailCategory;
                if ((!existing.tags || existing.tags.length === 0) && row.tags && row.tags.length > 0) existing.tags = row.tags;
                if (row.showInShop) existing.showInShop = true;
                if (!existing.expirationDate && row.expirationDate) existing.expirationDate = row.expirationDate;
            } else {
                map.set(key, { ...row });
            }
        }
        setInventory(Array.from(map.values()));
    }, []);

    const loadInventory = useCallback(async () => {
        loadControllerRef.current?.abort();
        const controller = new AbortController();
        loadControllerRef.current = controller;
        setIsLoading(true);
        setLoadError('');
        try {
            const inventoryResponse = await api.get('/api/inventory', { signal: controller.signal });
            if (controller.signal.aborted) return;
            replaceInventory(Array.isArray(inventoryResponse.data) ? inventoryResponse.data : []);
        } catch (error: any) {
            if (controller.signal.aborted || error?.code === 'ERR_CANCELED') return;
            setLoadError(getRequestError(error, 'Inventory could not be loaded.'));
        } finally {
            if (loadControllerRef.current === controller) {
                loadControllerRef.current = null;
                if (!controller.signal.aborted) setIsLoading(false);
            }
        }
    }, [replaceInventory]);

    useEffect(() => {
        void loadInventory();

        let timer: ReturnType<typeof setTimeout> | null = null;
        const debouncedReload = () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                void loadInventory();
            }, 300);
        };

        const channel = supabase
            .channel('admin-inventory-counts-realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_stock' }, debouncedReload)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items' }, debouncedReload)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_products' }, debouncedReload)
            .subscribe();

        return () => {
            if (timer) clearTimeout(timer);
            loadControllerRef.current?.abort();
            void supabase.removeChannel(channel).catch(() => { });
        };
    }, [loadInventory]);

    useEffect(() => {
        if (category === 'retails') {
            setSuppliers([]);
            return;
        }
        let cancelled = false;
        void api.get('/api/inventory/suppliers')
            .then((response) => {
                if (!cancelled) {
                    setSuppliers(Array.isArray(response.data) ? response.data.filter((supplier: any) => supplier?.isActive !== false) : []);
                }
            })
            .catch(() => {
                if (!cancelled) setSuppliers([]);
            });
        return () => {
            cancelled = true;
        };
    }, [category]);

    useEffect(() => {
        let cancelled = false;
        api.get('/api/inventory/retail/categories')
            .then((res) => {
                if (!cancelled && Array.isArray(res.data) && res.data.length > 0) {
                    setAvailableCategories(res.data);
                }
            })
            .catch(() => {});
        api.get('/api/inventory/retail/tags')
            .then((res) => {
                if (!cancelled && Array.isArray(res.data) && res.data.length > 0) {
                    setAvailableTags(res.data);
                }
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, []);

    const toggleShowInShop = async (item: InventoryRow) => {
        const nextVal = !item.showInShop;
        try {
            await api.patch(`/api/inventory/items/${item.id}/retail`, { showInShop: nextVal });
            setInventory((prev) => prev.map((it) => (it.id === item.id ? { ...it, showInShop: nextVal } : it)));
            addToast({
                type: 'success',
                title: nextVal ? 'Enabled in shop' : 'Hidden from shop',
                message: `${item.name} is now ${nextVal ? 'visible' : 'hidden'} on public /shop.`,
            });
        } catch (err: any) {
            addToast({
                type: 'error',
                title: 'Failed to update visibility',
                message: getRequestError(err, 'Could not update shop visibility.'),
            });
        }
    };

    const handleRetailSaved = (saved: any) => {
        const row = toInventoryRow(saved);
        setInventory((prev) => {
            const exists = prev.some((it) => it.id === row.id);
            if (exists) {
                return prev.map((it) => (it.id === row.id ? { ...it, ...row } : it));
            }
            return [row, ...prev];
        });
        window.dispatchEvent(new Event('demoshop:inventory-changed'));
    };

    const filteredInventory = useMemo(() => {
        const normalizedSearch = searchTerm.trim().toLowerCase();
        return inventory.filter((item) => {
            const matchesSearch = !normalizedSearch
                || [item.name, item.category, item.ownership]
                    .some((value) => value.toLowerCase().includes(normalizedSearch));
            return matchesSearch;
        });
    }, [inventory, searchTerm]);

    const barberItems = filteredInventory.filter(isConsumables);
    const retailItems = filteredInventory.filter((item) => !isConsumables(item));

    const consumablesCount = useMemo(() => inventory.filter(isConsumables).length, [inventory]);
    const retailCount = useMemo(() => inventory.filter((item) => !isConsumables(item)).length, [inventory]);

    const toggleCardExpanded = (id: string) => {
        setExpandedCardIds((prev) => ({ ...prev, [id]: !prev[id] }));
    };

    const toggleSelectRow = (id: string) => {
        setSelectedIds((prev) =>
            prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
        );
    };

    const toggleSelectAllGroup = (groupItems: InventoryRow[]) => {
        const groupIds = groupItems.map((i) => i.id);
        const allSelected = groupIds.every((id) => selectedIds.includes(id));
        if (allSelected) {
            setSelectedIds((prev) => prev.filter((id) => !groupIds.includes(id)));
        } else {
            setSelectedIds((prev) => Array.from(new Set([...prev, ...groupIds])));
        }
    };

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0) return;
        setIsDeleting(true);
        try {
            const response = await api.delete('/api/inventory/bulk-delete', {
                data: { itemIds: selectedIds },
            });

            const deletedIds: string[] = response.data?.itemIds || selectedIds;
            setInventory((current) => current.filter((item) => !deletedIds.includes(item.id)));
            setSelectedIds((prev) => prev.filter((id) => !deletedIds.includes(id)));
            setIsDeleteModalOpen(false);
            addToast({
                type: 'success',
                title: 'Items removed',
                message: `${response.data?.deletedCount || deletedIds.length} item(s) removed from inventory.`,
            });
        } catch (error: any) {
            addToast({
                type: 'error',
                title: 'Failed to remove items',
                message: getRequestError(error, 'Could not remove selected inventory items.'),
            });
        } finally {
            setIsDeleting(false);
        }
    };

    const openNewItem = (category: InventoryCategory) => {
        if (category === 'shared_retail') {
            setRetailModalState({ isOpen: true, item: null });
            return;
        }
        setEditingItemId(null);
        setIsCustomUnitMode(false);
        setCustomUnitInput('');
        setNewItemState({
            category,
            name: '',
            unit: 'pc',
            initialQuantity: '',
            costPrice: '',
            retailPrice: '',
            supplierId: '',
            expirationDate: '',
            validationError: '',
        });
    };

    const openEditItem = (item: InventoryRow, category: InventoryCategory) => {
        if (category === 'shared_retail' || item.ownership === 'Retail') {
            setRetailModalState({ isOpen: true, item });
            return;
        }
        setEditingItemId(item.id);
        setIsCustomUnitMode(false);
        setCustomUnitInput('');
        setNewItemState({
            category,
            name: item.name,
            unit: item.unit,
            initialQuantity: '',
            costPrice: item.costPrice.toFixed(2),
            retailPrice: item.retailPrice == null ? '' : item.retailPrice.toFixed(2),
            supplierId: item.defaultSupplierId || '',
            expirationDate: item.expirationDate ? item.expirationDate.split('T')[0] : '',
            validationError: '',
        });
    };

    const closeNewItem = () => {
        if (!isAddingItem) {
            setNewItemState(null);
            setIsCustomUnitMode(false);
            setCustomUnitInput('');
        }
    };

    const createItem = async () => {
        if (!newItemState) return;
        const name = newItemState.name.trim();
        const resolvedUnit = (isCustomUnitMode && customUnitInput.trim())
            ? customUnitInput.trim().toLowerCase()
            : newItemState.unit.trim().toLowerCase();
        const unit = resolvedUnit;
        const rawQuantity = newItemState.initialQuantity.trim();
        const initialQuantity = rawQuantity === '' ? 0 : parseInt(rawQuantity, 10);
        const rawCostPrice = newItemState.costPrice.trim();
        const costPrice = rawCostPrice === '' ? 0 : Number(Number(rawCostPrice).toFixed(2));

        if (name.length < 1 || name.length > 120) {
            setNewItemState((current) => current ? { ...current, validationError: 'Enter an item name between 1 and 120 characters.' } : current);
            return;
        }
        if (!unit || unit.length < 1 || unit.length > 32) {
            setNewItemState((current) => current ? { ...current, validationError: 'Select or enter a valid quantity unit.' } : current);
            return;
        }
        if (!Number.isInteger(initialQuantity) || initialQuantity < 0) {
            setNewItemState((current) => current ? { ...current, validationError: 'Initial stock must be zero or a positive whole integer.' } : current);
            return;
        }
        if (
            !Number.isFinite(costPrice)
            || costPrice < 0
            || costPrice > 99_999_999.99
        ) {
            setNewItemState((current) => current ? { ...current, validationError: 'Cost price must be zero or a positive amount with at most 2 decimal places.' } : current);
            return;
        }

        setIsAddingItem(true);
        try {
            if (unit && !QUANTITY_UNITS.some((known) => known === unit)) {
                setCustomUnits((prev) => {
                    const next = Array.from(new Set([...prev, unit]));
                    try {
                        localStorage.setItem(CUSTOM_UNITS_STORAGE_KEY, JSON.stringify(next));
                    } catch {}
                    return next;
                });
            }

            if (editingItemId) {
                const response = await api.patch(`/api/inventory/items/${editingItemId}/cost-price`, {
                    name,
                    costPrice,
                    unit,
                    retailPrice: newItemState.category === 'shared_retail' && newItemState.retailPrice.trim() !== ''
                        ? Number(newItemState.retailPrice)
                        : null,
                    category: newItemState.category,
                    expirationDate: newItemState.category === 'barber_assigned' ? (newItemState.expirationDate ? newItemState.expirationDate : null) : undefined,
                });
                const updatedName = String(response.data?.name ?? name);
                const updatedCostPrice = Number(response.data?.costPrice ?? costPrice);
                const updatedUnit = String(response.data?.unit ?? unit);
                const updatedRetailPrice = response.data?.retailPrice == null ? null : Number(response.data.retailPrice);
                const updatedExpirationDate = response.data?.expirationDate !== undefined
                    ? (response.data.expirationDate ? String(response.data.expirationDate).split('T')[0] : null)
                    : (newItemState.expirationDate ? newItemState.expirationDate : null);
                setInventory((current) => current.map((item) => (
                    item.id === editingItemId ? {
                        ...item,
                        name: updatedName,
                        unit: updatedUnit,
                        costPrice: updatedCostPrice,
                        retailPrice: updatedRetailPrice,
                        expirationDate: updatedExpirationDate,
                    } : item
                )));
                setNewItemState(null);
                setEditingItemId(null);
                setIsCustomUnitMode(false);
                setCustomUnitInput('');
                addToast({
                    type: 'success',
                    title: 'Inventory item updated',
                    message: `${name} was updated successfully.`,
                });
                return;
            }

            const response = await api.post('/api/inventory/items', {
                name,
                unit,
                initialQuantity,
                costPrice,
                retailPrice: newItemState.category === 'shared_retail' && newItemState.retailPrice.trim() !== ''
                    ? Number(newItemState.retailPrice)
                    : null,
                supplierId: newItemState.category === 'barber_assigned' ? newItemState.supplierId || null : null,
                category: newItemState.category,
                expirationDate: newItemState.category === 'barber_assigned' && newItemState.expirationDate ? newItemState.expirationDate : null,
            });
            const created = toInventoryRow(response.data);
            replaceInventory([created, ...inventory.filter((item) => item.id !== created.id)]);
            setNewItemState(null);
            setIsCustomUnitMode(false);
            setCustomUnitInput('');
            addToast({
                type: 'success',
                title: newItemState.category === 'barber_assigned' ? 'Consumable item added' : 'Retail item added',
                message: `${created.name} is now visible in inventory.`,
            });
            window.dispatchEvent(new Event('demoshop:inventory-changed'));
        } catch (error: any) {
            setNewItemState((current) => current ? {
                ...current,
                validationError: getRequestError(error, 'The inventory item could not be added.'),
            } : current);
        } finally {
            setIsAddingItem(false);
        }
    };

    const renderInventoryTable = (items: InventoryRow[], isBarberCategory: boolean) => {
        return (
            <div className="overflow-x-auto overflow-y-auto admin-table-scroll">
                <table className="w-full min-w-[780px] text-left text-sm">
                    <thead className="border-b border-white/10 bg-charcoal text-[10px] uppercase tracking-wider text-ivory-dim">
                        <tr>
                            <th className="px-4 py-2.5">{isBarberCategory ? 'Item' : 'Product'}</th>
                            {!isBarberCategory && <th className="px-3 py-2.5">Category</th>}
                            {!isBarberCategory && <th className="px-3 py-2.5">Tags</th>}
                            {!isBarberCategory && <th className="px-3 py-2.5">Status</th>}
                            <th className="px-3 py-2.5">Unit</th>
                            <th className="px-3 py-2.5">Unit cost</th>
                            {isBarberCategory && <th className="px-3 py-2.5">Supplier</th>}
                            {isBarberCategory && <th className="px-3 py-2.5">Expiration</th>}
                            {!isBarberCategory && <th className="px-3 py-2.5">Retail price</th>}
                            {!isBarberCategory && <th className="px-3 py-2.5">Public Shop</th>}
                            <th className="px-4 py-2.5 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {items.map((item) => {
                            const isSelected = selectedIds.includes(item.id);
                            const statusClass = statusClasses[item.stockStatus] || statusClasses.Normal;

                            return (
                                <tr
                                    key={item.id}
                                    data-search-id={`inventory-${item.productId} inventory-${item.id} ${item.productId} ${item.id}`}
                                    className={`align-middle transition-colors hover:bg-white/[0.03] ${isSelected ? 'bg-gold/5' : ''}`}
                                >
                                    <td className="px-4 py-3 font-bold text-ivory">
                                        {isBarberCategory ? (
                                            <div>
                                                <div className="font-bold text-ivory leading-snug">{item.name}</div>
                                                <div className="text-[11px] text-ivory-dim font-mono mt-0.5">
                                                    Stock: <span className="font-bold text-ivory">{item.currentStock}</span> {item.unit}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded border border-white/10 overflow-hidden bg-charcoal shrink-0">
                                                    {item.imageUrl ? (
                                                        <img src={item.imageUrl} alt={item.name} width={40} height={40} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <ProductImageFallback name={item.name} category={item.retailCategory} size="sm" />
                                                    )}
                                                </div>
                                                <div>
                                                    <div className="font-bold text-ivory leading-snug">{item.name}</div>
                                                    <div className="text-[11px] text-ivory-dim font-mono mt-0.5">Stock: <span className="font-bold text-ivory">{item.currentStock}</span> {item.unit}</div>
                                                </div>
                                            </div>
                                        )}
                                    </td>
                                    {!isBarberCategory && (
                                        <td className="px-3 py-3">
                                            {item.retailCategory ? (
                                                <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-violet-400/10 text-violet-300 border border-violet-400/20">
                                                    {item.retailCategory}
                                                </span>
                                            ) : (
                                                <span className="text-xs text-ivory-dim/60">—</span>
                                            )}
                                        </td>
                                    )}
                                    {!isBarberCategory && (
                                        <td className="px-3 py-3">
                                            {item.tags && item.tags.length > 0 ? (
                                                <div className="flex flex-wrap gap-1 max-w-[180px]">
                                                    {item.tags.map((t) => (
                                                        <span key={t} className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-gold/10 text-gold border border-gold/20 font-medium">
                                                            {t}
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="text-xs text-ivory-dim/60">—</span>
                                            )}
                                        </td>
                                    )}
                                    {!isBarberCategory && (
                                        <td className="px-3 py-3">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase tracking-wider border ${statusClass}`}>
                                                {item.stockStatus}
                                            </span>
                                        </td>
                                    )}
                                    <td className="px-3 py-3 text-xs text-ivory-dim font-mono">{item.unit}</td>
                                    <td className="px-3 py-3 text-sm font-bold text-ivory font-mono">
                                        ₱{item.costPrice.toFixed(2)}
                                    </td>
                                    {isBarberCategory && (
                                        <td className="px-3 py-3 text-xs">
                                            {item.defaultSupplierName ? (
                                                <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-gold/10 text-gold border border-gold/25 truncate max-w-[140px]" title={item.defaultSupplierName}>
                                                    {item.defaultSupplierName}
                                                </span>
                                            ) : (
                                                <span className="text-ivory-dim/40">—</span>
                                            )}
                                        </td>
                                    )}
                                    {isBarberCategory && (
                                        <td className="px-3 py-3 text-xs">
                                            {(() => {
                                                const exp = getExpirationStatus(item.expirationDate);
                                                if (exp.status === 'none') {
                                                    return (
                                                        <span className="text-[11px] text-ivory-dim/50 italic">
                                                            No expiration set
                                                        </span>
                                                    );
                                                }
                                                return (
                                                    <div className="flex flex-col gap-1 items-start">
                                                        <span className="font-mono text-xs text-ivory">
                                                            Expires: {exp.formattedDate}
                                                        </span>
                                                        {(exp.status === 'expired' || exp.status === 'expiring_soon') && (
                                                            <span className={`inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider border ${exp.badgeClass}`}>
                                                                {exp.label}
                                                            </span>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </td>
                                    )}
                                    {!isBarberCategory && (
                                        <td className="px-3 py-3 text-sm font-bold text-gold font-mono">
                                            {item.retailPrice == null ? '—' : `₱${item.retailPrice.toFixed(2)}`}
                                        </td>
                                    )}
                                    {!isBarberCategory && (
                                        <td className="px-3 py-3">
                                            <button
                                                type="button"
                                                onClick={() => void toggleShowInShop(item)}
                                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors cursor-pointer ${
                                                    item.showInShop
                                                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25'
                                                        : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700 hover:text-zinc-300'
                                                }`}
                                                title="Toggle public storefront visibility"
                                            >
                                                {item.showInShop ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                                                <span>{item.showInShop ? 'Enabled' : 'Disabled'}</span>
                                            </button>
                                        </td>
                                    )}
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex items-center justify-end gap-1.5">
                                            <button
                                                type="button"
                                                aria-label={`Modify ${item.name}`}
                                                onClick={() => openEditItem(item, isBarberCategory ? 'barber_assigned' : 'shared_retail')}
                                                className="rounded border border-gold/40 p-1.5 text-gold hover:bg-gold/15 cursor-pointer transition-colors"
                                                title="Edit Item"
                                            >
                                                <Pencil className="h-3.5 w-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                aria-label={`Delete ${item.name}`}
                                                onClick={() => { setSelectedIds([item.id]); setIsDeleteModalOpen(true); }}
                                                className="rounded border border-red-400/40 p-1.5 text-red-300 hover:bg-red-400/15 cursor-pointer transition-colors"
                                                title="Delete Item"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        );
    };

    const renderInventoryMobileCards = (items: InventoryRow[], isBarberCategory: boolean) => {
        return (
            <div className="divide-y divide-white/5">
                {items.map((item) => {
                    const isSelected = selectedIds.includes(item.id);
                    const isExpanded = expandedCardIds[item.id] === true;
                    const statusClass = statusClasses[item.stockStatus] || statusClasses.Normal;

                    return (
                        <div
                            key={item.id}
                            data-search-id={`inventory-${item.productId} inventory-${item.id} ${item.productId} ${item.id}`}
                            className={`p-3 sm:p-4 space-y-3 transition-colors ${
                                isSelected ? 'bg-gold/5' : isExpanded ? 'bg-white/[0.02]' : 'hover:bg-white/[0.01]'
                            }`}
                        >
                            {/* Top Row: Select checkbox, Thumbnail, Title & Status */}
                            <div className="flex items-start gap-3">
                                <label className="flex items-center pt-1 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => toggleSelectRow(item.id)}
                                        aria-label={`Select ${item.name}`}
                                        className="h-4 w-4 rounded border-white/20 bg-charcoal text-gold focus:ring-gold/50 cursor-pointer accent-gold"
                                    />
                                </label>

                                <div className="w-12 h-12 rounded border border-white/10 overflow-hidden bg-charcoal shrink-0">
                                    {item.imageUrl ? (
                                        <img src={item.imageUrl} alt={item.name} width={48} height={48} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                                    ) : (
                                        <ProductImageFallback name={item.name} category={item.retailCategory} size="sm" />
                                    )}
                                </div>

                                <div className="min-w-0 flex-1">
                                    <div className="flex items-start justify-between gap-1.5">
                                        <h4 className="font-bold text-ivory text-sm truncate leading-tight">
                                            {item.name}
                                        </h4>
                                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-wider shrink-0 border ${statusClass}`}>
                                            {item.stockStatus}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                        {!isBarberCategory && item.retailCategory && (
                                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-400/10 text-violet-300 border border-violet-400/20">
                                                {item.retailCategory}
                                            </span>
                                        )}
                                        <span className="text-[11px] font-mono text-ivory-dim">
                                            Stock: <strong className="text-ivory font-bold">{item.currentStock}</strong> {item.unit}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Price & Supplier Bar */}
                            <div className="grid grid-cols-2 gap-2 text-xs bg-charcoal/70 p-2 rounded border border-white/5">
                                <div>
                                    <span className="text-[9px] uppercase font-bold tracking-wider text-ivory-dim block">
                                        Cost Price
                                    </span>
                                    <span className="font-mono font-bold text-ivory mt-0.5 block text-xs">
                                        ₱{item.costPrice.toFixed(2)}
                                    </span>
                                </div>

                                {!isBarberCategory ? (
                                    <div>
                                        <span className="text-[9px] uppercase font-bold tracking-wider text-ivory-dim block">
                                            Retail Price
                                        </span>
                                        <span className="font-mono font-bold text-gold mt-0.5 block text-xs">
                                            {item.retailPrice == null ? '—' : `₱${item.retailPrice.toFixed(2)}`}
                                        </span>
                                    </div>
                                ) : (
                                    <div>
                                        <span className="text-[9px] uppercase font-bold tracking-wider text-ivory-dim block">
                                            Supplier
                                        </span>
                                        <span className="text-gold font-medium mt-0.5 block truncate text-xs">
                                            {item.defaultSupplierName || '—'}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Consumable Expiration Date Bar */}
                            {isBarberCategory && (
                                <div className="flex items-center justify-between text-xs bg-charcoal/70 px-2.5 py-1.5 rounded border border-white/5">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <Calendar className="h-3.5 w-3.5 text-gold/70 shrink-0" />
                                        <span className="text-[9px] uppercase font-bold tracking-wider text-ivory-dim shrink-0">
                                            Expires:
                                        </span>
                                        <span className="font-mono text-xs text-ivory truncate">
                                            {item.expirationDate ? item.expirationDate.split('T')[0] : 'No expiration set'}
                                        </span>
                                    </div>
                                    {(() => {
                                        const exp = getExpirationStatus(item.expirationDate);
                                        if (exp.status === 'expired' || exp.status === 'expiring_soon') {
                                            return (
                                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider shrink-0 border ${exp.badgeClass}`}>
                                                    {exp.label}
                                                </span>
                                            );
                                        }
                                        return null;
                                    })()}
                                </div>
                            )}

                            {/* Mobile Actions Toolbar */}
                            <div className="flex items-center justify-between gap-2 pt-0.5">
                                {!isBarberCategory && (
                                    <button
                                        type="button"
                                        onClick={() => void toggleShowInShop(item)}
                                        className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer border ${
                                            item.showInShop
                                                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                                : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                                        }`}
                                    >
                                        {item.showInShop ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                                        <span>{item.showInShop ? 'In Shop' : 'Hidden'}</span>
                                    </button>
                                )}

                                <div className="flex items-center gap-1.5 ml-auto">
                                    <button
                                        type="button"
                                        onClick={() => toggleCardExpanded(item.id)}
                                        className={`min-h-[30px] px-2 py-1 text-xs rounded border transition-colors flex items-center gap-1 cursor-pointer ${
                                            isExpanded
                                                ? 'bg-gold/15 text-gold border-gold/40'
                                                : 'bg-white/5 text-ivory-dim hover:text-ivory border-white/10'
                                        }`}
                                        aria-expanded={isExpanded}
                                    >
                                        <span>{isExpanded ? 'Less' : 'Details'}</span>
                                        <ChevronDown className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-180 text-gold' : ''}`} />
                                    </button>
                                    <button
                                        type="button"
                                        aria-label={`Modify ${item.name}`}
                                        onClick={() => openEditItem(item, isBarberCategory ? 'barber_assigned' : 'shared_retail')}
                                        className="min-h-[30px] rounded border border-gold/30 p-1.5 text-gold hover:bg-gold/10 cursor-pointer transition-colors"
                                    >
                                        <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                        type="button"
                                        aria-label={`Delete ${item.name}`}
                                        onClick={() => { setSelectedIds([item.id]); setIsDeleteModalOpen(true); }}
                                        className="min-h-[30px] rounded border border-red-400/30 p-1.5 text-red-300 hover:bg-red-400/10 cursor-pointer transition-colors"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            </div>

                            {/* Collapsible Details */}
                            {isExpanded && (
                                <div className="pt-2 border-t border-white/5 grid grid-cols-2 gap-2 text-[11px] animate-fade-in">
                                    <div className="bg-charcoal p-2 rounded border border-white/5">
                                        <span className="text-[9px] uppercase font-bold tracking-wider text-ivory-dim block">Critical Stock</span>
                                        <span className="font-mono text-red-300 mt-0.5 block">{item.criticalStock} {item.unit}</span>
                                    </div>
                                    <div className="bg-charcoal p-2 rounded border border-white/5">
                                        <span className="text-[9px] uppercase font-bold tracking-wider text-ivory-dim block">Safety Stock</span>
                                        <span className="font-mono text-amber-300 mt-0.5 block">{item.safetyStock} {item.unit}</span>
                                    </div>
                                    {item.tags && item.tags.length > 0 && (
                                        <div className="col-span-2 bg-charcoal p-2 rounded border border-white/5">
                                            <span className="text-[9px] uppercase font-bold tracking-wider text-ivory-dim block mb-1">Tags</span>
                                            <div className="flex flex-wrap gap-1">
                                                {item.tags.map((t) => (
                                                    <span key={t} className="px-1.5 py-0.5 rounded text-[10px] bg-gold/10 text-gold border border-gold/20 font-medium">
                                                        {t}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        );
    };

    const renderInventorySection = (
        title: string,
        description: string,
        items: InventoryRow[],
        category: InventoryCategory,
    ) => {
        const isBarberCategory = category === 'barber_assigned';

        return (
            <section className={`overflow-hidden rounded-lg border bg-charcoal-light shadow-xl ${isBarberCategory ? 'border-gold/25' : 'border-violet-400/25'}`} aria-labelledby={`${category}-heading`}>
                <div className={`flex flex-col justify-between gap-3 border-b px-3 py-3 sm:flex-row sm:items-center ${isBarberCategory ? 'border-gold/20 bg-gold/5' : 'border-violet-400/20 bg-violet-400/5'}`}>
                    <div>
                        <div className="flex items-center gap-2">
                            {isBarberCategory ? <Scissors className="h-4 w-4 text-gold" /> : <ShoppingBag className="h-4 w-4 text-violet-300" />}
                            <h3 id={`${category}-heading`} className={`text-sm font-bold uppercase tracking-wider ${isBarberCategory ? 'text-gold' : 'text-violet-300'}`}>{title}</h3>
                        </div>
                        <p className="mt-1 text-xs text-ivory-dim">{description} • {items.length} shown</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => openNewItem(category)}
                            className="inline-flex items-center gap-1.5 rounded border border-gold/40 bg-gold/10 px-3 py-2 text-xs font-bold text-gold hover:bg-gold/20 transition-colors cursor-pointer"
                        >
                            <Plus className="h-3.5 w-3.5" />
                            Add Item
                        </button>
                    </div>
                </div>

                {items.length === 0 ? (
                    <div className="px-6 py-12 text-center">
                        <Package className="mx-auto h-8 w-8 text-ivory-dim" />
                        <p className="mt-3 font-bold text-ivory">No {title.toLowerCase()} match this view</p>
                        <p className="mt-1 text-sm text-ivory-dim">Add an item or adjust the search and status filters.</p>
                    </div>
                ) : (
                    <>
                        {/* 1. Mobile Cards (< md) */}
                        <div className="block md:hidden">
                            {renderInventoryMobileCards(items, isBarberCategory)}
                        </div>
                        {/* 2. Desktop Table (>= md) */}
                        <div className="hidden md:block">
                            {renderInventoryTable(items, isBarberCategory)}
                        </div>
                    </>
                )}
            </section>
        );
    };

    const selectedItemsList = useMemo(() => {
        return inventory.filter((item) => selectedIds.includes(item.id));
    }, [inventory, selectedIds]);

    return (
        <div className={`flex flex-col gap-3 ${embedded ? 'w-full' : 'h-full min-h-0 overflow-hidden'}`}>
            {!embedded && (
                <div className="shrink-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold">Owner/Admin • authoritative stock</p>
                    <h2 className="mt-1 text-2xl font-serif font-bold text-ivory">Inventory Management</h2>
                    <p className="mt-2 max-w-3xl text-sm text-ivory-dim">Manage barber consumables and shared retail stock separately. Stock quantity and unit cost change only through completed restock receipts. Physical count approvals are handled on the Restock Requests page.</p>
                </div>
            )}

            {/* --- 3 COMPACT KPI METRIC CARDS (Matches Reports & Audits mobile style) --- */}
            <div className="grid grid-cols-2 gap-2 sm:gap-3 shrink-0">
                {/* Consumables Card */}
                <button
                    type="button"
                    onClick={() => onSelectCategory?.('consumables')}
                    className={`bg-charcoal-light border p-2 sm:p-3 rounded-sm card-gold-accent flex items-center justify-between min-w-0 text-left transition-all cursor-pointer ${
                        category === 'consumables' ? 'border-gold/50 bg-gold/10' : 'border-white/5 hover:border-white/20'
                    }`}
                >
                    <div className="min-w-0">
                        <p className="text-[8px] sm:text-[10px] text-ivory-dim uppercase tracking-wider font-bold truncate">
                            Consumables
                        </p>
                        {isLoading ? (
                            <Skeleton variant="text" className="mt-0.5 sm:mt-1 h-5 sm:h-8 w-8 sm:w-16" />
                        ) : (
                            <h4 className="text-sm sm:text-2xl font-serif font-bold text-gold mt-0.5 sm:mt-1 truncate">
                                {consumablesCount}
                            </h4>
                        )}
                    </div>
                    <div className="p-1.5 sm:p-3 bg-gold/10 rounded-full border border-gold/20 shrink-0">
                        <Scissors className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-gold" />
                    </div>
                </button>

                {/* Retail Items Card */}
                <button
                    type="button"
                    onClick={() => onSelectCategory?.('retails')}
                    className={`bg-charcoal-light border p-2 sm:p-3 rounded-sm card-gold-accent flex items-center justify-between min-w-0 text-left transition-all cursor-pointer ${
                        category === 'retails' ? 'border-violet-400/50 bg-violet-400/10' : 'border-white/5 hover:border-white/20'
                    }`}
                >
                    <div className="min-w-0">
                        <p className="text-[8px] sm:text-[10px] text-ivory-dim uppercase tracking-wider font-bold truncate">
                            Retail Items
                        </p>
                        {isLoading ? (
                            <Skeleton variant="text" className="mt-0.5 sm:mt-1 h-5 sm:h-8 w-8 sm:w-16" />
                        ) : (
                            <h4 className="text-sm sm:text-2xl font-serif font-bold text-violet-300 mt-0.5 sm:mt-1 truncate">
                                {retailCount}
                            </h4>
                        )}
                    </div>
                    <div className="p-1.5 sm:p-3 bg-violet-400/10 rounded-full border border-violet-400/20 shrink-0">
                        <ShoppingBag className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-violet-300" />
                    </div>
                </button>

            </div>

            {/* --- SEARCH TOOLBAR --- */}
            <div className="shrink-0 bg-charcoal-light border border-white/5 rounded-sm p-2 sm:p-3 flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
                <div className="relative flex-1">
                    <label className="relative block">
                        <span className="sr-only">Search inventory</span>
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ivory-dim" />
                        <input
                            value={searchTerm}
                            onChange={(event) => setSearchTerm(event.target.value)}
                            placeholder="Search item, category, or supplier…"
                            className="w-full min-h-[38px] sm:min-h-[40px] rounded-sm border border-white/10 bg-charcoal py-2 pl-9 pr-8 text-xs text-ivory outline-none focus:border-gold/60 transition-colors"
                        />
                        {searchTerm && (
                            <button
                                type="button"
                                onClick={() => setSearchTerm('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ivory-dim hover:text-ivory p-0.5"
                                aria-label="Clear search"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </label>
                </div>

            </div>

            {/* Bulk Selection Bar */}
            {selectedIds.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 sm:p-4 shadow-xl animate-fade-in shrink-0">
                    <div className="flex items-center gap-2">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-500/20 text-xs font-bold text-red-300">
                            {selectedIds.length}
                        </span>
                        <span className="text-xs sm:text-sm font-semibold text-red-200">
                            item{selectedIds.length === 1 ? '' : 's'} selected for action
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setSelectedIds([])}
                            className="px-2.5 py-1.5 text-xs text-ivory-dim hover:text-ivory transition-colors cursor-pointer"
                        >
                            Deselect All
                        </button>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setIsDeleteModalOpen(true)}
                            className="bg-red-500/20 hover:bg-red-500/30 text-red-200 border-red-500/40 text-xs px-3 sm:px-4 py-1.5 sm:py-2 flex items-center gap-1.5 sm:gap-2 cursor-pointer"
                        >
                            <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-red-300" /> Remove ({selectedIds.length})
                        </Button>
                    </div>
                </div>
            )}

            {isLoading && (
                <div className="space-y-3 rounded-lg border border-white/10 bg-charcoal-light p-4" role="status" aria-label="Loading inventory categories">
                    <span className="sr-only">Loading inventory categories…</span>
                    <Skeleton variant="text" className="h-5 w-48" />
                    <Skeleton variant="rect" className="h-24 w-full" />
                    <Skeleton variant="rect" className="h-32 w-full" />
                </div>
            )}
            {loadError && (
                <div className="flex flex-col gap-3 rounded-lg border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200 sm:flex-row sm:items-center sm:justify-between" role="alert">
                    <span>{loadError}</span>
                    <Button type="button" variant="outline" onClick={() => void loadInventory()} disabled={isLoading}>
                        <RefreshCw className="mr-2 h-4 w-4" /> Retry
                    </Button>
                </div>
            )}

            {!isLoading && !loadError && (
                <div className="space-y-3">
                    {(category === 'all' || category === 'consumables') && renderInventorySection('Consumables', 'Shop-wide consumable supplies for barber services', barberItems, 'barber_assigned')}
                    {(category === 'all' || category === 'retails') && renderInventorySection('Retail Items', 'Common retail stock available system-wide', retailItems, 'shared_retail')}
                </div>
            )}

            {/* Add Item Modal */}
            <Modal sidebarOffset
                isOpen={!!newItemState}
                onClose={closeNewItem}
                title={editingItemId ? 'Modify Inventory Item' : newItemState?.category === 'barber_assigned' ? 'Add Consumable' : 'Add Retail Item'}
                size="sm"
                footer={
                    <>
                        <Button type="button" variant="outline" onClick={closeNewItem} disabled={isAddingItem}>
                            Cancel
                        </Button>
                        <Button type="button" onClick={() => void createItem()} disabled={isAddingItem}>
                            {isAddingItem ? (editingItemId ? 'Saving…' : 'Adding…') : editingItemId ? 'Save Changes' : 'Add Item'}
                        </Button>
                    </>
                }
            >
                <div className="space-y-4">
                    <label className="block">
                        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gold">Item Name</span>
                        <input autoFocus value={newItemState?.name || ''} onChange={(event) => setNewItemState((current) => current ? { ...current, name: event.target.value, validationError: '' } : current)} placeholder="e.g. Pomade, Talc Powder, Shampoo" className="w-full rounded border border-white/10 bg-charcoal px-3 py-2.5 text-sm text-ivory outline-none focus:border-gold/60" />
                    </label>
                    {newItemState?.category === 'barber_assigned' && !editingItemId && (
                        <label className="block">
                            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gold">Supplier</span>
                            <select
                                value={newItemState.supplierId}
                                onChange={(event) => setNewItemState((current) => current ? { ...current, supplierId: event.target.value, validationError: '' } : current)}
                                className="w-full rounded border border-white/10 bg-charcoal px-3 py-2.5 text-sm text-ivory outline-none focus:border-gold/60"
                            >
                                <option value="">Select supplier…</option>
                                {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                            </select>
                        </label>
                    )}
                    <div className="block">
                        <div className="flex items-center justify-between mb-1">
                            <label htmlFor="quantity-unit-select" className="text-[10px] font-bold uppercase tracking-wider text-gold">
                                Quantity Unit
                            </label>
                            {!isCustomUnitMode ? (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsCustomUnitMode(true);
                                        setCustomUnitInput('');
                                    }}
                                    className="inline-flex items-center gap-1 text-[11px] font-medium text-gold hover:text-gold/80 hover:underline cursor-pointer"
                                >
                                    <Plus className="h-3 w-3" />
                                    <span>Add Custom Unit</span>
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsCustomUnitMode(false);
                                        setCustomUnitInput('');
                                    }}
                                    className="text-[11px] text-ivory-dim hover:text-gold hover:underline cursor-pointer"
                                >
                                    Choose from standard units
                                </button>
                            )}
                        </div>

                        {isCustomUnitMode ? (
                            <div className="space-y-1.5">
                                <div className="flex gap-2">
                                    <input
                                        id="custom-quantity-unit-input"
                                        type="text"
                                        autoFocus
                                        placeholder="e.g. sachet, can, gallon, drum"
                                        maxLength={32}
                                        value={customUnitInput}
                                        onChange={(event) => {
                                            const val = event.target.value;
                                            setCustomUnitInput(val);
                                            if (val.trim()) {
                                                setNewItemState((current) => current ? { ...current, unit: val.trim().toLowerCase(), validationError: '' } : current);
                                            }
                                        }}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter') {
                                                event.preventDefault();
                                                handleSaveCustomUnit();
                                            } else if (event.key === 'Escape') {
                                                setIsCustomUnitMode(false);
                                                setCustomUnitInput('');
                                            }
                                        }}
                                        className="w-full flex-1 rounded border border-gold/50 bg-charcoal px-3 py-2 text-sm text-ivory outline-none focus:border-gold"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleSaveCustomUnit}
                                        disabled={!customUnitInput.trim()}
                                        className="shrink-0 rounded border border-gold bg-gold/15 px-3 py-2 text-xs font-bold uppercase tracking-wider text-gold transition hover:bg-gold hover:text-charcoal disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                                    >
                                        Save Unit
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsCustomUnitMode(false);
                                            setCustomUnitInput('');
                                            setNewItemState((current) => current ? { ...current, unit: current.unit || 'pc' } : current);
                                        }}
                                        className="shrink-0 rounded border border-white/10 bg-charcoal-light px-2.5 py-2 text-xs text-ivory-dim hover:text-ivory cursor-pointer"
                                        title="Cancel custom unit"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                                <p className="text-[11px] text-ivory-dim">
                                    Type your unit name and press <span className="text-gold font-semibold">Save Unit</span> or <kbd className="rounded bg-charcoal-light px-1 py-0.5 text-[10px] text-ivory border border-white/10">Enter</kbd> to add it.
                                </p>
                            </div>
                        ) : (
                            <select
                                id="quantity-unit-select"
                                value={newItemState?.unit || 'pc'}
                                onChange={(event) => {
                                    const val = event.target.value;
                                    if (val === '__add_custom__') {
                                        setIsCustomUnitMode(true);
                                        setCustomUnitInput('');
                                    } else {
                                        setIsCustomUnitMode(false);
                                        setNewItemState((current) => current ? { ...current, unit: val, validationError: '' } : current);
                                    }
                                }}
                                className="w-full rounded border border-white/10 bg-charcoal px-3 py-2.5 text-sm text-ivory outline-none focus:border-gold/60"
                            >
                                <optgroup label="Available Units">
                                    {availableUnits.map((unit) => (
                                        <option key={unit} value={unit}>
                                            {unit}
                                        </option>
                                    ))}
                                </optgroup>
                                <optgroup label="Custom">
                                    <option value="__add_custom__">
                                        + Add New Unit…
                                    </option>
                                </optgroup>
                            </select>
                        )}
                    </div>
                    {newItemState?.category === 'shared_retail' && (
                        <label className="block">
                            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gold">Retail Price (₱)</span>
                            <input
                                type="text"
                                inputMode="decimal"
                                placeholder="0.00"
                                value={newItemState.retailPrice}
                                onChange={(event) => {
                                    const val = event.target.value;
                                    if (val === '' || /^\d+(\.\d{0,2})?$/.test(val) || /^\.\d{0,2}$/.test(val)) {
                                        setNewItemState((current) => current ? { ...current, retailPrice: val, validationError: '' } : current);
                                    }
                                }}
                                className="w-full rounded border border-white/10 bg-charcoal px-3 py-2.5 text-sm text-ivory outline-none focus:border-gold/60"
                            />
                        </label>
                    )}
                    <label className="block">
                        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gold">Unit Cost (₱)</span>
                        <input
                            type="text"
                            inputMode="decimal"
                            placeholder="0.00"
                            value={newItemState?.costPrice || ''}
                            onChange={(event) => {
                                const val = event.target.value;
                                if (val === '' || /^\d+(\.\d{0,2})?$/.test(val) || /^\.\d{0,2}$/.test(val)) {
                                    setNewItemState((current) => current ? { ...current, costPrice: val, validationError: '' } : current);
                                }
                            }}
                            className="w-full rounded border border-white/10 bg-charcoal px-3 py-2.5 text-sm text-ivory outline-none focus:border-gold/60"
                        />
                    </label>
                    {newItemState?.category === 'barber_assigned' && (
                        <label className="block">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-gold">Expiration Date (Optional)</span>
                                {newItemState.expirationDate && (
                                    <button
                                        type="button"
                                        onClick={() => setNewItemState((current) => current ? { ...current, expirationDate: '', validationError: '' } : current)}
                                        className="text-[10px] text-ivory-dim hover:text-gold cursor-pointer"
                                    >
                                        Clear Date
                                    </button>
                                )}
                            </div>
                            <input
                                type="date"
                                value={newItemState.expirationDate || ''}
                                onChange={(event) => setNewItemState((current) => current ? { ...current, expirationDate: event.target.value, validationError: '' } : current)}
                                className="w-full rounded border border-white/10 bg-charcoal px-3 py-2.5 text-sm text-ivory outline-none focus:border-gold/60 [color-scheme:dark]"
                            />
                            <span className="mt-1 block text-[11px] text-ivory-dim">
                                Optional shelf-life date for dyes, perms, oils, sanitizers, and blades.
                            </span>
                        </label>
                    )}
                    {newItemState?.validationError && <p className="text-sm text-red-300" role="alert">{newItemState.validationError}</p>}
                </div>
            </Modal>

            {/* Remove Confirmation Modal */}
            <Modal sidebarOffset
                isOpen={isDeleteModalOpen}
                onClose={() => { if (!isDeleting) setIsDeleteModalOpen(false); }}
                title="Confirm Item Removal"
                size="sm"
                footer={
                    <>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setIsDeleteModalOpen(false)}
                            disabled={isDeleting}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            onClick={() => void handleBulkDelete()}
                            disabled={isDeleting}
                            className="bg-red-600 hover:bg-red-700 text-white"
                        >
                            {isDeleting ? 'Removing…' : `Remove (${selectedIds.length})`}
                        </Button>
                    </>
                }
            >
                <div className="space-y-4">
                    <div className="flex items-start gap-3 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
                        <AlertTriangle className="h-5 w-5 shrink-0 text-red-400 mt-0.5" />
                        <div>
                            <p className="font-bold text-red-300">Are you sure you want to remove the selected items?</p>
                            <p className="mt-1 text-xs text-red-200/80">
                                This will remove the selected {selectedIds.length} item(s) from authoritative active inventory.
                            </p>
                        </div>
                    </div>
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-ivory-dim mb-2">Selected Items:</p>
                        <div className="max-h-40 overflow-y-auto space-y-1 rounded border border-white/10 bg-charcoal p-2.5">
                            {selectedItemsList.map((item) => (
                                <div key={item.id} className="flex items-center justify-between text-xs py-1 px-1.5 rounded hover:bg-white/5">
                                    <span className="font-bold text-ivory truncate">{item.name}</span>
                                    <span className="text-ivory-dim text-[11px] shrink-0 ml-2">
                                        ({item.currentStock} {item.unit} • {isConsumables(item) ? 'Consumables' : 'Retail Items'})
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </Modal>

            {/* Dedicated Retail Product Presentation & Stock Modal */}
            <RetailProductModal
                isOpen={retailModalState.isOpen}
                onClose={() => setRetailModalState({ isOpen: false, item: null })}
                item={retailModalState.item}
                availableCategories={availableCategories}
                availableTags={availableTags}
                onSaved={handleRetailSaved}
                onCategoryAdded={(cat) => setAvailableCategories((prev) => prev.includes(cat) ? prev : [...prev, cat])}
                onTagAdded={(tag) => setAvailableTags((prev) => prev.includes(tag) ? prev : [...prev, tag])}
            />
        </div>
    );
};

export default InventoryCountsTab;
