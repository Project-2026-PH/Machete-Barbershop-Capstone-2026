import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Box, CheckCircle2, ChevronDown, ClipboardCheck, Scissors } from 'lucide-react';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/ui/Button';
import type { InventoryItem } from '../../mock-inventory';

export type StockCountShift = 'morning' | 'afternoon' | 'evening';

interface StockCountModalProps {
    items: InventoryItem[];
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (values: {
        shift: StockCountShift;
        notes: string;
        lines: Array<{ inventoryStockId: number; countedQuantity: number }>;
    }) => Promise<boolean>;
}

const shifts: Array<{ value: StockCountShift; label: string }> = [
    { value: 'morning', label: 'Morning count' },
    { value: 'afternoon', label: 'Afternoon count' },
    { value: 'evening', label: 'Evening count' },
];

const StockCountModal: React.FC<StockCountModalProps> = ({ items, isOpen, onClose, onSubmit }) => {
    const [shift, setShift] = useState<StockCountShift>('morning');
    const [quantities, setQuantities] = useState<Record<string, string>>({});
    const [notes, setNotes] = useState('');
    const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
    const [validationError, setValidationError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const formId = 'stock-count-form';

    // Group items into Barber Consumables and Shared Retail Products
    const groups = useMemo(() => {
        const consumables: InventoryItem[] = [];
        const retail: InventoryItem[] = [];
        for (const item of items) {
            if (
                item.ownership === 'Consumables' ||
                item.category === 'Barber supplies' ||
                item.assignedBarber
            ) {
                consumables.push(item);
            } else {
                retail.push(item);
            }
        }
        const result = [];
        if (consumables.length > 0) {
            result.push({
                stationName: 'Consumables',
                isRetail: false,
                items: consumables,
            });
        }
        if (retail.length > 0) {
            result.push({
                stationName: 'Retail Items',
                isRetail: true,
                items: retail,
            });
        }
        return result;
    }, [items]);

    useEffect(() => {
        if (!isOpen) return;
        setShift('morning');
        setQuantities(Object.fromEntries(items.map((item) => [item.id, ''])));
        setNotes('');
        setValidationError('');
        // Open first station by default
        if (groups.length > 0) {
            const initialOpen: Record<string, boolean> = {};
            groups.forEach((g, idx) => {
                initialOpen[g.stationName] = idx === 0;
            });
            setOpenSections(initialOpen);
        }
    }, [isOpen, items, groups]);

    const toggleSection = (stationName: string) => {
        setOpenSections((prev) => ({
            ...prev,
            [stationName]: !prev[stationName],
        }));
    };

    // Calculate progress with whole number requirement
    const filledCount = items.filter((item) => {
        const raw = quantities[item.id]?.trim();
        return raw !== undefined && raw !== '' && /^\d+$/.test(raw) && Number.isSafeInteger(Number(raw)) && Number(raw) >= 0;
    }).length;
    const totalCount = items.length;
    const progressPercentage = totalCount > 0 ? Math.round((filledCount / totalCount) * 100) : 0;
    const isAllFilled = totalCount > 0 && filledCount === totalCount;

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const lines: Array<{ inventoryStockId: number; countedQuantity: number }> = [];
        const missingItemNames: string[] = [];

        for (const item of items) {
            const parsedId = Number(item.id);
            const rawQuantity = quantities[item.id]?.trim();
            const quantity = Number(rawQuantity);

            if (
                rawQuantity === '' ||
                rawQuantity === undefined ||
                !/^\d+$/.test(rawQuantity) ||
                !Number.isSafeInteger(quantity) ||
                quantity < 0
            ) {
                missingItemNames.push(item.name);
            } else if (Number.isSafeInteger(parsedId) && parsedId > 0) {
                lines.push({ inventoryStockId: parsedId, countedQuantity: quantity });
            }
        }

        if (missingItemNames.length > 0) {
            setValidationError(
                `Please enter a valid whole number (0 or higher) for all ${totalCount} items before submitting (${filledCount} of ${totalCount} completed).`
            );
            // Open sections that have missing items
            const openMap = { ...openSections };
            groups.forEach((g) => {
                const hasMissing = g.items.some((i) => {
                    const val = quantities[i.id]?.trim();
                    return !val || !/^\d+$/.test(val);
                });
                if (hasMissing) openMap[g.stationName] = true;
            });
            setOpenSections(openMap);
            return;
        }

        setValidationError('');
        setIsSubmitting(true);
        try {
            const submitted = await onSubmit({ shift, notes, lines });
            if (submitted) onClose();
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Submit physical stock count"
            size="lg"
            footer={
                <>
                    <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        form={formId}
                        disabled={isSubmitting}
                        className={isAllFilled ? '' : 'opacity-90'}
                    >
                        {isSubmitting
                            ? 'Submitting…'
                            : isAllFilled
                                ? 'Submit for review →'
                                : `Submit (${filledCount}/${totalCount} filled)`}
                    </Button>
                </>
            }
        >
            <form id={formId} onSubmit={handleSubmit} className="space-y-5">
                {/* Revised Immutability Banner (Plain language) */}
                <div className="flex items-start gap-3 rounded border border-sky-400/20 bg-sky-400/5 p-4">
                    <ClipboardCheck className="mt-0.5 h-5 w-5 shrink-0 text-sky-300" />
                    <p className="text-sm leading-relaxed text-ivory-dim">
                        Enter exactly what you physically count. Once submitted, this cannot be edited — the owner will review and confirm the numbers.
                    </p>
                </div>

                {/* Shift Selector & Dynamic Progress Bar */}
                <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gold">Count shift</span>
                        <select
                            value={shift}
                            onChange={(event) => setShift(event.target.value as StockCountShift)}
                            className="w-full rounded border border-white/10 bg-charcoal px-3 py-2.5 text-sm text-ivory outline-none focus:border-gold/60"
                        >
                            {shifts.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </label>

                    {/* Live Progress Bar */}
                    <div className="flex flex-col justify-center rounded border border-white/10 bg-charcoal-light px-4 py-2.5">
                        <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-gold uppercase tracking-wider text-[10px]">Count Progress</span>
                            <span className="font-bold text-ivory">
                                {filledCount} of {totalCount} ({progressPercentage}%)
                            </span>
                        </div>
                        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
                            <div
                                className={`h-full rounded-full transition-all duration-300 ${
                                    isAllFilled ? 'bg-emerald-400' : 'bg-gold'
                                }`}
                                style={{ width: `${progressPercentage}%` }}
                            />
                        </div>
                    </div>
                </div>

                {/* Barber-Grouped Accordions */}
                <div className="max-h-[48vh] space-y-3 overflow-y-auto pr-1">
                    {groups.map((group) => {
                        const isOpen = !!openSections[group.stationName];
                        const stationFilledCount = group.items.filter((item) => {
                            const raw = quantities[item.id]?.trim();
                            return raw !== undefined && raw !== '' && /^\d+$/.test(raw);
                        }).length;
                        const isStationComplete = stationFilledCount === group.items.length;

                        return (
                            <div
                                key={group.stationName}
                                className="overflow-hidden rounded-lg border border-white/10 bg-charcoal-light shadow-md"
                            >
                                <button
                                    type="button"
                                    onClick={() => toggleSection(group.stationName)}
                                    className="flex w-full cursor-pointer items-center justify-between gap-3 border-b border-white/5 bg-charcoal px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
                                >
                                    <div className="flex items-center gap-2.5">
                                        {group.isRetail ? (
                                            <Box className="h-4 w-4 text-gold" />
                                        ) : (
                                            <Scissors className="h-4 w-4 text-gold" />
                                        )}
                                        <div>
                                            <span className="text-sm font-bold uppercase tracking-wider text-ivory">
                                                {group.stationName}
                                            </span>
                                            <span className="ml-2 text-xs text-ivory-dim">({group.items.length} items)</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {isStationComplete ? (
                                            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400">
                                                <CheckCircle2 className="h-3.5 w-3.5" />
                                                <span>Completed</span>
                                            </span>
                                        ) : stationFilledCount > 0 ? (
                                            <span className="text-xs text-gold">
                                                {stationFilledCount} of {group.items.length} filled
                                            </span>
                                        ) : (
                                            <span className="text-xs text-ivory-dim">Not started</span>
                                        )}
                                        <ChevronDown
                                            className={`h-4 w-4 text-ivory-dim transition-transform ${
                                                isOpen ? 'rotate-180' : ''
                                            }`}
                                        />
                                    </div>
                                </button>

                                {isOpen && (
                                    <div className="divide-y divide-white/5 p-3 space-y-2">
                                        {group.items.map((item) => {
                                            const rawVal = quantities[item.id];
                                            const isTrimmedEmpty = rawVal === undefined || rawVal.trim() === '';
                                            const isZero = rawVal?.trim() === '0';

                                            return (
                                                <div
                                                    key={item.id}
                                                    className="flex flex-col gap-2 rounded border border-white/5 bg-charcoal/60 p-3 sm:flex-row sm:items-center sm:justify-between"
                                                >
                                                    <div className="min-w-0">
                                                        <span className="block truncate text-sm font-bold text-ivory">
                                                            {item.name}
                                                        </span>
                                                        <span className="mt-0.5 block truncate text-xs text-ivory-dim">
                                                            Unit: {item.unit}
                                                        </span>
                                                    </div>

                                                    <div className="flex items-center gap-2.5 self-end sm:self-auto">
                                                        {isZero && (
                                                            <span className="rounded border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[11px] font-bold text-amber-300">
                                                                0 (Zero) ⚠️
                                                            </span>
                                                        )}
                                                        <div className="relative flex items-center">
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                step="1"
                                                                inputMode="numeric"
                                                                placeholder="—"
                                                                aria-label={`Counted quantity for ${item.name}`}
                                                                value={rawVal || ''}
                                                                onChange={(event) =>
                                                                    setQuantities((current) => ({
                                                                        ...current,
                                                                        [item.id]: event.target.value,
                                                                    }))
                                                                }
                                                                className={`w-28 rounded border bg-charcoal px-3 py-2 text-right text-base font-bold text-ivory outline-none transition-colors focus:border-gold/80 ${
                                                                    isTrimmedEmpty
                                                                        ? 'border-white/10 placeholder:text-ivory-dim/40'
                                                                        : isZero
                                                                            ? 'border-amber-400/50 bg-amber-400/5'
                                                                            : 'border-gold/40'
                                                                }`}
                                                            />
                                                            <span className="ml-2 w-12 text-xs font-medium text-ivory-dim">
                                                                {item.unit}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Optional Count Notes */}
                <label className="block">
                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gold">Notes (optional)</span>
                    <textarea
                        rows={2}
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        placeholder="Add any count observations or shortage reasons..."
                        className="w-full resize-none rounded border border-white/10 bg-charcoal px-3 py-2.5 text-sm text-ivory outline-none placeholder:text-ivory-dim/60 focus:border-gold/60"
                    />
                </label>

                {validationError && (
                    <div className="flex items-center gap-2 rounded border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300" role="alert">
                        <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                        <span>{validationError}</span>
                    </div>
                )}
            </form>
        </Modal>
    );
};

export default StockCountModal;
