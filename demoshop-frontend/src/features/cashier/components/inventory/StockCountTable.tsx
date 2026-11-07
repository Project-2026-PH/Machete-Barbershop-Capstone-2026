import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ClipboardCheck, Save, Search } from 'lucide-react';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/feedback/ToastContext';
import { NumberField } from '@/components/ui/NumberField';
import { getManilaDateIso } from '@/utils/manila-date';
import type { InventoryItem } from '../../mock-inventory';
import type { StockCountShift } from './StockCountModal';

interface StockCountTableProps {
    items: InventoryItem[];
    morningCounts: Record<string, number>;
    morningCountsStatus: 'loading' | 'ready' | 'error';
    onSubmit: (values: {
        shift: StockCountShift;
        notes: string;
        lines: Array<{ inventoryStockId: number; countedQuantity: number }>;
    }) => Promise<boolean>;
}

const getSnapshotKey = () => `demoshop.stock-count-snapshot.${getManilaDateIso()}`;

const shifts: Array<{ value: StockCountShift; label: string }> = [
    { value: 'morning', label: 'Morning Stock Count' },
    { value: 'afternoon', label: 'Afternoon Stock Count' },
    { value: 'evening', label: 'Evening Stock Count' },
];

type InventoryCategoryTab = 'all' | 'consumables' | 'retail';

const categoryTabs: Array<{ id: InventoryCategoryTab; label: string }> = [
    { id: 'all', label: 'All Inventory' },
    { id: 'consumables', label: 'Consumables' },
    { id: 'retail', label: 'Retail Items' },
];

type CountValues = Record<StockCountShift, string>;

const emptyCount = (): CountValues => ({ morning: '', afternoon: '', evening: '' });
const isValidCount = (value: string) => {
    const trimmed = (value ?? '').trim();
    return /^\d+$/.test(trimmed) && Number.isSafeInteger(Number(trimmed)) && Number(trimmed) >= 0;
};

const isConsumable = (item: InventoryItem) =>
    item.ownership === 'Consumables' ||
    item.category === 'Barber supplies' ||
    Boolean(item.assignedBarber);

interface ConfirmModalState {
    shift: StockCountShift;
    items: InventoryItem[];
}

const getSavedCountKey = (itemId: string, shift: StockCountShift) => `${itemId}:${shift}`;

const StockCountTable: React.FC<StockCountTableProps> = ({ items, morningCounts, morningCountsStatus, onSubmit }) => {
    const { addToast } = useToast();

    // Snapshot restore: preserve typed values and locks across tab changes
    const [counts, setCounts] = useState<Record<string, CountValues>>(() => {
        if (typeof window === 'undefined' || !window.localStorage) return {};
        try {
            const raw = localStorage.getItem(getSnapshotKey());
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed?.counts && typeof parsed.counts === 'object') {
                    return parsed.counts;
                }
            }
        } catch {
            // Ignore parse errors
        }
        return {};
    });

    const [savedCounts, setSavedCounts] = useState<Set<string>>(() => {
        if (typeof window === 'undefined' || !window.localStorage) return new Set();
        try {
            const raw = localStorage.getItem(getSnapshotKey());
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed?.savedCounts)) {
                    return new Set(parsed.savedCounts);
                }
                if (Array.isArray(parsed?.savedRows)) {
                    return new Set(parsed.savedRows.map((itemId: string) => getSavedCountKey(itemId, 'morning')));
                }
            }
        } catch {
            // Ignore parse errors
        }
        return new Set();
    });

    const [activeCategory, setActiveCategory] = useState<InventoryCategoryTab>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [activeShift, setActiveShift] = useState<StockCountShift>('morning');
    const [confirmModalState, setConfirmModalState] = useState<ConfirmModalState | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

    // Debounced status transition from 'saving' to 'saved'
    useEffect(() => {
        if (saveStatus !== 'saving' || isSubmitting) return;
        const timer = setTimeout(() => {
            setSaveStatus('saved');
        }, 600);
        return () => clearTimeout(timer);
    }, [saveStatus, counts, isSubmitting]);

    // Merge incoming inventory items without blowing away restored snapshot
    useEffect(() => {
        setCounts((current) => {
            let hasNewItems = false;
            const next = { ...current };
            items.forEach((item) => {
                if (!next[item.id]) {
                    next[item.id] = emptyCount();
                    hasNewItems = true;
                }
            });
            return hasNewItems ? next : current;
        });
    }, [items]);

    // Continuously persist snapshot to localStorage on any input or row lock
    useEffect(() => {
        if (typeof window === 'undefined' || !window.localStorage) return;
        try {
            const snapshot = {
                counts,
                savedCounts: Array.from(savedCounts),
                savedAt: new Date().toISOString(),
            };
            localStorage.setItem(getSnapshotKey(), JSON.stringify(snapshot));
        } catch {
            // Storage quota / disabled
        }
    }, [counts, savedCounts]);

    const filteredItems = useMemo(() => {
        return items.filter((item) => {
            const matchesCategory = activeCategory === 'all' || (activeCategory === 'consumables' ? isConsumable(item) : !isConsumable(item));
            return matchesCategory && item.name.toLowerCase().includes(searchTerm.trim().toLowerCase());
        });
    }, [items, activeCategory, searchTerm]);

    const activeShiftLabel = shifts.find((shift) => shift.value === activeShift)?.label || 'Stock Count';
    const confirmShiftLabel = confirmModalState
        ? shifts.find((shift) => shift.value === confirmModalState.shift)?.label || 'Stock Count'
        : activeShiftLabel;
    const savedCount = items.filter((item) => savedCounts.has(getSavedCountKey(item.id, activeShift))).length;
    const unsavedItems = items.filter((item) => !savedCounts.has(getSavedCountKey(item.id, activeShift)));
    const readyCount = unsavedItems.filter((item) => isValidCount(counts[item.id]?.[activeShift] ?? '')).length;
    const missingCount = unsavedItems.length - readyCount;
    const canSaveAll = unsavedItems.length > 0 && missingCount === 0 && !isSubmitting;
    const allCountsRecorded = items.length > 0 && items.every(
        (item) => savedCounts.has(getSavedCountKey(item.id, activeShift)),
    );

    const updateCount = (itemId: string, shift: StockCountShift, value: string) => {
        if (savedCounts.has(getSavedCountKey(itemId, shift))) return;
        setCounts((current) => ({
            ...current,
            [itemId]: { ...(current[itemId] || emptyCount()), [shift]: value },
        }));
        setSaveStatus('saving');
    };

    const requestSaveAll = () => {
        const itemsToSave = items.filter(
            (item) => !savedCounts.has(getSavedCountKey(item.id, activeShift)),
        );
        if (itemsToSave.length === 0) return;

        const incompleteItems = itemsToSave.filter(
            (item) => !isValidCount(counts[item.id]?.[activeShift] ?? ''),
        );
        if (incompleteItems.length > 0) {
            addToast({
                type: 'error',
                title: 'Stock count is incomplete',
                message: `Enter a valid whole-number ${activeShift} count for all ${items.length} items, including items in the other category tab.`,
            });
            return;
        }

        if (itemsToSave.length > 500) {
            addToast({
                type: 'error',
                title: 'Too many stock items',
                message: 'A consolidated stock count can include up to 500 items.',
            });
            return;
        }

        setConfirmModalState({
            shift: activeShift,
            items: itemsToSave,
        });
    };

    const handleConfirmSave = async () => {
        if (!confirmModalState) return;

        const shiftToSave = confirmModalState.shift;
        const itemsToSave = confirmModalState.items.filter(
            (item) => !savedCounts.has(getSavedCountKey(item.id, shiftToSave)),
        );
        if (itemsToSave.length === 0) {
            setConfirmModalState(null);
            return;
        }

        setIsSubmitting(true);
        setSaveStatus('saving');
        try {
            const lines = itemsToSave.map((item) => ({
                inventoryStockId: Number(item.id),
                countedQuantity: Number(counts[item.id]?.[shiftToSave] || 0),
            }));
            const success = await onSubmit({ shift: shiftToSave, notes: '', lines });

            if (success) {
                setSavedCounts((prev) => {
                    const next = new Set(prev);
                    itemsToSave.forEach((item) => next.add(getSavedCountKey(item.id, shiftToSave)));
                    return next;
                });
                setSaveStatus('saved');
            } else {
                setSaveStatus('idle');
            }
        } finally {
            setIsSubmitting(false);
            setConfirmModalState(null);
        }
    };

    return (
        <section className="space-y-5">
            {/* Top Category Tabs (Like Reference Image) */}
            <div className="flex flex-wrap items-center gap-2 rounded-sm border border-white/10 bg-charcoal-light p-2 text-sm">
                {categoryTabs.map((tab) => {
                    const isActive = activeCategory === tab.id;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveCategory(tab.id)}
                            aria-pressed={isActive}
                            className={`inline-flex min-h-9 items-center gap-2 rounded-sm px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold ${
                                isActive
                                    ? 'bg-gold text-charcoal'
                                    : 'text-ivory-dim hover:bg-white/5 hover:text-ivory'
                            }`}
                        >
                            <span>{tab.label}</span>
                            <span className={`rounded-full px-1.5 text-[10px] ${isActive ? 'bg-charcoal/15' : 'bg-white/10'}`}>{items.filter((item) => tab.id === 'all' || (tab.id === 'consumables' ? isConsumable(item) : !isConsumable(item))).length}</span>
                        </button>
                    );
                })}
            </div>

            {/* One count category at a time keeps the entry view focused. */}
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-white/10 bg-charcoal-light p-2">
                {shifts.map((shift) => {
                    const isActive = activeShift === shift.value;
                    const completed = items.length > 0 && items.every(
                        (item) => savedCounts.has(getSavedCountKey(item.id, shift.value)),
                    );
                    return (
                        <button
                            key={shift.value}
                            type="button"
                            onClick={() => setActiveShift(shift.value)}
                            aria-pressed={isActive}
                            className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors md:text-sm ${
                                isActive
                                    ? 'bg-gold text-charcoal shadow-sm'
                                    : 'text-ivory-dim hover:bg-white/5 hover:text-ivory'
                            }`}
                        >
                            <span className="block">{shift.label.replace(' Stock Count', '')}</span>
                            <span className="mt-0.5 block text-[10px] font-normal opacity-80">
                                {completed ? 'Recorded' : 'Pending'}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Action Bar without shift dropdown */}
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                <div>
                    <div className="flex items-center gap-2 text-gold">
                        <ClipboardCheck className="h-5 w-5" />
                        <h3 className="text-xs font-bold uppercase tracking-[0.2em]">Physical stock count</h3>
                    </div>
                    <p className="mt-1 text-sm text-neutral-500 dark:text-ivory-dim">
                        Count the items physically available and enter whole numbers. Enter 0 when none remain. Submit all categories together for the {activeShift} shift.
                    </p>
                </div>
            </div>

            {/* Main Table Card */}
            <div className={`${allCountsRecorded ? 'hidden' : ''} w-full max-w-full overflow-hidden rounded-lg border border-white/10 bg-charcoal-light p-3 md:p-5 shadow-sm`}>
                <div className="mb-4 rounded-sm border border-white/10 bg-charcoal p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-ivory">{savedCount + readyCount} of {items.length} items counted</span>
                        <span className="text-ivory-dim">{missingCount} still need a count · {savedCount} submitted</span>
                    </div>
                    <div role="progressbar" aria-label={`${activeShiftLabel} completion`} aria-valuemin={0} aria-valuemax={items.length || 1} aria-valuenow={savedCount + readyCount} className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gold transition-all" style={{ width: `${items.length ? ((savedCount + readyCount) / items.length) * 100 : 0}%` }} /></div>
                </div>
                <label className="relative mb-4 block sm:max-w-sm">
                    <span className="sr-only">Search items to count</span>
                    <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ivory-dim" />
                    <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Find an item to count..." className="h-10 w-full rounded-sm border border-white/10 bg-charcoal pl-9 pr-3 text-sm text-ivory placeholder:text-ivory-dim/60 focus:outline-none focus:ring-1 focus:ring-gold" />
                </label>
                <div className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-col gap-1">
                        <span className="text-xs text-neutral-500 dark:text-ivory-dim">
                            {savedCount} of {items.length} items already submitted for {activeShift}.
                            {missingCount > 0 ? ` ${missingCount} count${missingCount === 1 ? '' : 's'} still needed.` : ''}
                        </span>
                        {saveStatus !== 'idle' && (
                            <span className="text-xs font-semibold tracking-wide transition-all duration-200">
                                {saveStatus === 'saving' || isSubmitting ? (
                                    <span className="text-amber-600 dark:text-gold flex items-center gap-1.5">
                                        <span className="h-2 w-2 rounded-full bg-amber-500 dark:bg-gold animate-pulse" />
                                        {isSubmitting ? 'Submitting counts...' : 'Saving draft on this device...'}
                                    </span>
                                ) : (
                                    <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                        Draft saved locally
                                    </span>
                                )}
                            </span>
                        )}
                    </div>
                    <Button
                        type="button"
                        onClick={requestSaveAll}
                        disabled={!canSaveAll}
                        className="shrink-0 px-4 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <Save className="h-4 w-4" />
                        Submit {activeShift} counts ({unsavedItems.length})
                    </Button>
                </div>
                <div className="w-full max-w-full overflow-x-auto overflow-y-auto max-h-[505px] rounded-sm border border-white/10">
                    <table className={`w-full ${activeShift === 'evening' ? 'min-w-[920px]' : 'min-w-[760px]'} border-separate border-spacing-0 text-left`}>
                        <thead className="sticky top-0 z-10">
                            <tr className="bg-charcoal text-ivory-dim text-xs font-semibold">
                                <th className="sticky top-0 bg-charcoal py-3.5 pl-6 pr-4 font-semibold">Item</th>
                                {activeShift === 'evening' && (
                                    <th className="sticky top-0 bg-charcoal py-3.5 px-4 font-semibold text-right">
                                        Morning Stock Count
                                    </th>
                                )}
                                <th className="sticky top-0 bg-charcoal py-3.5 px-4 font-semibold text-right">
                                    Physical count ({activeShift})
                                </th>
                                <th className="sticky top-0 bg-charcoal py-3.5 pl-6 pr-6 font-semibold">Entry status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100 dark:divide-white/5 text-[13.5px] md:text-sm text-neutral-700 dark:text-neutral-200">
                            {filteredItems.length === 0 && <tr><td colSpan={activeShift === 'evening' ? 4 : 3} className="px-6 py-10 text-center text-sm text-ivory-dim">{items.length === 0 ? 'No inventory items available to count.' : 'No items match this search or category.'}</td></tr>}
                            {filteredItems.map((item) => {
                                const values = counts[item.id] || emptyCount();
                                const isSaved = savedCounts.has(getSavedCountKey(item.id, activeShift));
                                return (
                                    <tr
                                        key={item.id}
                                        className={`transition-colors hover:bg-neutral-50/70 dark:hover:bg-white/[0.02] ${
                                            isSaved ? 'bg-emerald-500/[0.03]' : ''
                                        }`}
                                    >
                                        <td className="py-4 pl-6 pr-4 align-middle">
                                            <span className="block min-w-44 font-medium text-neutral-900 dark:text-ivory">
                                                {item.name}
                                            </span>
                                            <span className="text-xs text-neutral-400 dark:text-ivory-dim/60">
                                                Unit: {item.unit}
                                            </span>
                                        </td>
                                        {activeShift === 'evening' && (
                                            <td className="py-4 px-4 text-right align-middle tabular-nums">
                                                {morningCountsStatus === 'loading' ? (
                                                    <span className="text-xs text-neutral-400 dark:text-ivory-dim">Loading...</span>
                                                ) : morningCountsStatus === 'error' ? (
                                                    <span className="text-xs text-rose-500">Unavailable</span>
                                                ) : morningCounts[item.id] == null ? (
                                                    <span className="text-xs text-neutral-400 dark:text-ivory-dim">Not recorded</span>
                                                ) : (
                                                    <div className="flex flex-col">
                                                        <span className="font-semibold text-neutral-800 dark:text-ivory">
                                                            {morningCounts[item.id]}
                                                        </span>
                                                        {isValidCount(values.evening) && (
                                                            <span className="mt-0.5 text-[11px] text-neutral-500 dark:text-ivory-dim">
                                                                Evening − morning: {Number(values.evening) - morningCounts[item.id] > 0 ? '+' : ''}{Number(values.evening) - morningCounts[item.id]}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                        )}
                                        <td className="py-4 px-4 text-right align-middle">
                                            <NumberField
                                                min={0}
                                                step={1}
                                                value={values[activeShift]}
                                                onChange={(val) => updateCount(item.id, activeShift, val)}
                                                disabled={isSaved}
                                                ariaLabel={`${activeShiftLabel} for ${item.name}`}
                                                className="w-28 md:w-32 ml-auto"
                                            />
                                        </td>
                                        <td className="py-4 pl-6 pr-6 align-middle">
                                            <div className="flex items-center justify-between gap-3 min-w-[130px]">
                                                {isSaved ? (
                                                    <>
                                                        <span className="font-medium text-teal-500 dark:text-emerald-400">
                                                            Submitted
                                                        </span>
                                                        <span className="inline-flex h-8 w-8 items-center justify-center text-teal-500 dark:text-emerald-400">
                                                            <CheckCircle2 className="h-4 w-4" />
                                                        </span>
                                                    </>
                                                ) : (
                                                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${isValidCount(values[activeShift]) ? 'border-emerald-400/25 bg-emerald-400/5 text-emerald-300' : 'border-gold/25 bg-gold/5 text-gold'}`}>
                                                        {isValidCount(values[activeShift]) ? 'Ready to submit' : 'Not counted'}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Footer status row */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 pt-3 text-xs text-neutral-500 dark:text-ivory-dim/80 border-t border-neutral-100 dark:border-white/5">
                    <span>{readyCount} counts ready to submit; {missingCount} still needed across all categories.</span>
                    <span className="font-medium text-amber-600 dark:text-gold">Saving submits and locks the consolidated {activeShift} count for review.</span>
                </div>
            </div>

            {allCountsRecorded && (
                <div className="w-full overflow-hidden rounded-2xl md:rounded-3xl border border-emerald-400/30 bg-white dark:bg-charcoal-light p-3 md:p-5 shadow-sm">
                    <div className="mb-4 flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                        <div>
                            <h3 className="font-semibold text-neutral-900 dark:text-ivory">Daily count summary</h3>
                            <p className="text-xs text-neutral-500 dark:text-ivory-dim">{activeShiftLabel}s are recorded. Track usage through manager handouts between counts.</p>
                        </div>
                    </div>
                    <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-white/10">
                        <table className="w-full min-w-[620px] text-left text-sm">
                            <thead className="bg-neutral-100 text-xs text-neutral-600 dark:bg-charcoal dark:text-ivory-dim">
                                <tr>
                                    <th className="px-4 py-3">Item</th>
                                    {shifts.map((shift) => <th key={shift.value} className="px-4 py-3 text-right">{shift.label.replace(' Stock Count', '')}</th>)}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100 dark:divide-white/5">
                                {items.map((item) => {
                                    const values = counts[item.id] || emptyCount();
                                    return (
                                        <tr key={item.id}>
                                            <td className="px-4 py-3 font-medium text-neutral-900 dark:text-ivory">{item.name}</td>
                                            {shifts.map((shift) => (
                                                <td key={shift.value} className="px-4 py-3 text-right font-mono text-neutral-700 dark:text-ivory">
                                                    {values[shift.value] || '0'} {item.unit}
                                                </td>
                                            ))}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Scrollable Summary Confirmation Modal */}
            <Modal
                isOpen={Boolean(confirmModalState)}
                onClose={() => setConfirmModalState(null)}
                title={`Confirm ${confirmShiftLabel}`}
                size="lg"
                footer={
                    <>
                        <Button type="button" variant="outline" onClick={() => setConfirmModalState(null)}>
                            Review Again
                        </Button>
                        <Button type="button" onClick={handleConfirmSave} disabled={isSubmitting}>
                            {isSubmitting ? 'Saving...' : `Confirm and save ${confirmModalState?.items.length ?? 0} counts`}
                        </Button>
                    </>
                }
            >
                <div className="space-y-4 text-sm text-neutral-600 dark:text-ivory-dim">
                    <p className="text-base font-medium text-neutral-900 dark:text-ivory">
                        Review {confirmModalState?.items.length ?? 0} item counts for the {confirmShiftLabel.toLowerCase()}.
                    </p>
                    <p className="text-xs text-neutral-500 dark:text-ivory-dim/70">
                        Confirming submits these rows together as one stock count for Owner/Admin review.
                    </p>

                    {/* Scrollable Summary Table */}
                    <div className="max-h-60 overflow-y-auto rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-50/50 dark:bg-charcoal/50 p-1">
                        <table className="w-full text-left text-xs border-collapse">
                            <thead className="sticky top-0 bg-neutral-100 dark:bg-charcoal text-neutral-600 dark:text-neutral-300 font-semibold border-b border-neutral-200 dark:border-white/10">
                                <tr>
                                    <th className="py-2.5 px-3">Item Name</th>
                                    <th className="py-2.5 px-3 text-right">{confirmShiftLabel}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-200/60 dark:divide-white/5">
                                {confirmModalState?.items.map((item) => {
                                    const values = counts[item.id] || emptyCount();
                                    return (
                                        <tr key={item.id} className="hover:bg-neutral-100/50 dark:hover:bg-white/[0.02]">
                                            <td className="py-2.5 px-3">
                                                <span className="font-semibold block text-neutral-900 dark:text-ivory">
                                                    {item.name}
                                                </span>
                                                <span className="text-[11px] text-neutral-400 dark:text-ivory-dim/60">
                                                    Unit: {item.unit}
                                                </span>
                                            </td>
                                            <td className="py-2.5 px-3 text-right font-mono font-medium text-neutral-800 dark:text-ivory">
                                                {values[confirmModalState?.shift ?? activeShift] || '0'}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <p className="text-xs font-medium text-amber-600 dark:text-amber-300">
                        Once submitted, these counts are locked for the selected shift.
                    </p>
                </div>
            </Modal>
        </section>
    );
};

export default StockCountTable;

