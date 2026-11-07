import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ClipboardList, Plus, RefreshCw, X } from 'lucide-react';
import type { StockCountLine, StockCountSubmission } from '@demoshop/shared-types';
import { api } from '@/config/api';
import { useToast } from '@/components/feedback/ToastContext';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/ui/Button';

type InventoryRow = {
    id: string;
    name: string;
    ownership: string;
    assignedBarber?: string;
    unit: string;
    currentStock: number;
    stockStatus: string;
};

type ReviewLine = StockCountLine & { isAdditional?: boolean };

type ReviewState = {
    count: StockCountSubmission;
    decision: 'approved' | 'rejected';
} | null;

type CountItemState = {
    countId: string;
    inventoryStockId: string;
    countedQuantity: string;
    validationError: string;
} | null;

const statusClasses: Record<string, string> = {
    Critical: 'border-red-400/30 bg-red-400/10 text-red-300',
    Low: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
    Normal: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
    Overstock: 'border-sky-400/30 bg-sky-400/10 text-sky-300',
};

const formatDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString();
const formatTimestamp = (value: string) => new Date(value).toLocaleString();
const getDifference = (line: StockCountLine) => line.countedQuantity - (line.currentQuantity ?? 0);
const getRequestError = (error: any, fallback: string) => (
    error?.response?.data?.message
    || error?.response?.data?.error
    || fallback
);

const toInventoryRow = (value: any): InventoryRow => ({
    id: String(value.id),
    name: String(value.name || 'Inventory item'),
    ownership: String(value.ownership || 'Retail Items'),
    assignedBarber: value.assignedBarber || undefined,
    unit: String(value.unit || 'unit'),
    currentStock: Number(value.currentStock ?? 0),
    stockStatus: String(value.stockStatus || 'Normal'),
});

const toStockCount = (value: any): StockCountSubmission => ({
    id: String(value.id),
    branchId: value.branchId == null ? null : Number(value.branchId),
    submittedBy: String(value.submittedBy || ''),
    countDate: String(value.countDate),
    shift: value.shift,
    status: value.status,
    notes: value.notes || '',
    reviewedBy: value.reviewedBy || undefined,
    reviewedAt: value.reviewedAt || undefined,
    reviewReason: value.reviewReason || undefined,
    createdAt: String(value.createdAt),
    lines: Array.isArray(value.lines) ? value.lines.map((line: any) => ({
        id: String(line.id),
        inventoryStockId: String(line.inventoryStockId),
        countedQuantity: Number(line.countedQuantity),
        notes: line.notes || '',
        itemName: line.itemName || 'Inventory item',
        unit: line.unit || 'unit',
        assignedBarber: line.assignedBarber || undefined,
        ownership: line.ownership || undefined,
        currentQuantity: Number(line.currentQuantity ?? 0),
    })) : [],
});

const ownershipLabel = (line: StockCountLine) => (
    line.ownership === 'barber_consumables' || line.ownership === 'barber_assigned'
        ? 'Consumables'
        : 'Retail Items'
);

const PendingStockCountsPanel: React.FC = () => {
    const [inventory, setInventory] = useState<InventoryRow[]>([]);
    const [counts, setCounts] = useState<StockCountSubmission[]>([]);
    const [additionalLines, setAdditionalLines] = useState<Record<string, ReviewLine[]>>({});
    const [reviewState, setReviewState] = useState<ReviewState>(null);
    const [countItemState, setCountItemState] = useState<CountItemState>(null);
    const [reason, setReason] = useState('');
    const [validationError, setValidationError] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const loadControllerRef = useRef<AbortController | null>(null);
    const { addToast } = useToast();

    const loadCounts = useCallback(async () => {
        loadControllerRef.current?.abort();
        const controller = new AbortController();
        loadControllerRef.current = controller;
        setIsLoading(true);
        setError('');
        try {
            const [inventoryResponse, countsResponse] = await Promise.all([
                api.get('/api/inventory', { signal: controller.signal }),
                api.get('/api/inventory/counts/pending', { signal: controller.signal }),
            ]);
            if (controller.signal.aborted) return;
            setInventory((Array.isArray(inventoryResponse.data) ? inventoryResponse.data : []).map(toInventoryRow));
            setCounts((Array.isArray(countsResponse.data) ? countsResponse.data : []).map(toStockCount));
        } catch (requestError: any) {
            if (controller.signal.aborted || requestError?.code === 'ERR_CANCELED') return;
            setError(getRequestError(requestError, 'Pending physical counts could not be loaded.'));
        } finally {
            if (loadControllerRef.current === controller) {
                loadControllerRef.current = null;
                if (!controller.signal.aborted) setIsLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        void loadCounts();
        return () => loadControllerRef.current?.abort();
    }, [loadCounts]);

    const inventoryById = useMemo(
        () => new Map(inventory.map((item) => [item.id, item])),
        [inventory],
    );

    const getReviewLines = (count: StockCountSubmission): ReviewLine[] => [
        ...count.lines,
        ...(additionalLines[count.id] || []),
    ];

    const closeReview = (force = false) => {
        if (isSubmitting && !force) return;
        setReviewState(null);
        setReason('');
        setValidationError('');
    };

    const openCountItem = (count: StockCountSubmission) => {
        const existingIds = new Set(getReviewLines(count).map((line) => line.inventoryStockId));
        const firstAvailable = inventory.find((item) => !existingIds.has(item.id));
        setCountItemState({
            countId: count.id,
            inventoryStockId: firstAvailable?.id || '',
            countedQuantity: firstAvailable ? String(firstAvailable.currentStock) : '',
            validationError: '',
        });
    };

    const addCountItem = () => {
        if (!countItemState) return;
        const count = counts.find((candidate) => candidate.id === countItemState.countId);
        const item = inventory.find((candidate) => candidate.id === countItemState.inventoryStockId);
        if (!count || !item) {
            setCountItemState((current) => current ? {
                ...current,
                validationError: 'Select an inventory item.',
            } : current);
            return;
        }
        const rawQuantity = countItemState.countedQuantity.trim();
        const countedQuantity = Number(rawQuantity);
        if (
            rawQuantity === ''
            || !/^(?:\d+(?:\.\d{1,3})?|\.\d{1,3})$/.test(rawQuantity)
            || !Number.isFinite(countedQuantity)
            || countedQuantity < 0
        ) {
            setCountItemState((current) => current ? {
                ...current,
                validationError: 'Enter a zero or positive quantity with at most 3 decimal places.',
            } : current);
            return;
        }
        if (getReviewLines(count).some((line) => line.inventoryStockId === item.id)) {
            setCountItemState((current) => current ? {
                ...current,
                validationError: 'This item is already included in the count.',
            } : current);
            return;
        }

        const line: ReviewLine = {
            id: `additional-${Date.now()}-${item.id}`,
            inventoryStockId: item.id,
            countedQuantity,
            notes: 'Added by reviewer',
            itemName: item.name,
            unit: item.unit,
            assignedBarber: item.assignedBarber,
            ownership: item.ownership === 'Barber-assigned' ? 'barber_assigned' : 'shared_retail',
            currentQuantity: item.currentStock,
            isAdditional: true,
        };
        setAdditionalLines((current) => ({
            ...current,
            [count.id]: [...(current[count.id] || []), line],
        }));
        setCountItemState(null);
    };

    const completeReview = async () => {
        if (!reviewState) return;
        const trimmedReason = reason.trim();
        if (reviewState.decision === 'rejected' && trimmedReason.length < 3) {
            setValidationError('Add a meaningful reason before rejecting this count.');
            return;
        }

        setValidationError('');
        setIsSubmitting(true);
        try {
            await api.patch(`/api/inventory/counts/${reviewState.count.id}/review`, {
                status: reviewState.decision,
                rejectionReason: trimmedReason || undefined,
                ...(reviewState.decision === 'approved' && additionalLines[reviewState.count.id]?.length
                    ? {
                        additionalLines: additionalLines[reviewState.count.id].map((line) => ({
                            inventoryStockId: Number(line.inventoryStockId),
                            countedQuantity: line.countedQuantity,
                            notes: line.notes,
                        })),
                    }
                    : {}),
            });
            setCounts((current) => current.filter((count) => count.id !== reviewState.count.id));
            setAdditionalLines((current) => {
                const next = { ...current };
                delete next[reviewState.count.id];
                return next;
            });
            addToast({
                type: 'success',
                title: `Count ${reviewState.decision}`,
                message: reviewState.decision === 'approved'
                    ? 'Inventory was updated and count-correction movements were recorded.'
                    : 'The count was rejected and inventory was unchanged.',
            });
            closeReview(true);
        } catch (requestError: any) {
            if (requestError?.response?.status === 409) await loadCounts();
            addToast({
                type: 'error',
                title: 'Count review failed',
                message: getRequestError(requestError, 'This count may have already been reviewed.'),
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const selectedCountItem = inventory.find((item) => item.id === countItemState?.inventoryStockId);
    const selectedCountIsWholeUnit = selectedCountItem?.ownership === 'Consumables'
        || selectedCountItem?.ownership === 'Barber-assigned';

    return (
        <section className="space-y-4" aria-labelledby="pending-stock-counts-heading">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold">Physical count review</p>
                    <h3 id="pending-stock-counts-heading" className="mt-1 text-xl font-serif font-bold text-ivory">Pending stock counts</h3>
                    <p className="mt-1 text-sm text-ivory-dim">Review submitted physical counts from Cashiers and Inventory Managers. Approval applies the count to authoritative stock.</p>
                </div>
                <button type="button" onClick={() => void loadCounts()} disabled={isLoading} className="inline-flex items-center gap-2 self-start rounded border border-white/10 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-ivory-dim hover:border-gold/40 hover:text-gold disabled:opacity-50">
                    <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} /> Refresh counts
                </button>
            </div>

            {isLoading && <div className="rounded-lg border border-white/10 bg-charcoal-light p-4 text-sm text-ivory-dim" role="status">Loading pending stock counts…</div>}
            {error && <div className="flex items-center justify-between gap-3 rounded-lg border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200" role="alert"><span>{error}</span><Button type="button" variant="outline" onClick={() => void loadCounts()}>Retry</Button></div>}
            {!isLoading && !error && counts.length === 0 && (
                <div className="rounded-lg border border-dashed border-white/10 bg-charcoal-light px-6 py-10 text-center">
                    <ClipboardList className="mx-auto h-8 w-8 text-ivory-dim" />
                    <p className="mt-3 font-bold text-ivory">No pending stock counts</p>
                    <p className="mt-1 text-sm text-ivory-dim">New physical stock count submissions will appear here.</p>
                </div>
            )}

            {counts.map((count) => (
                <article key={count.id} className="overflow-hidden rounded-lg border border-white/10 bg-charcoal-light shadow-xl">
                    <div className="flex flex-col justify-between gap-3 border-b border-white/10 px-4 py-4 sm:flex-row sm:items-center">
                        <div>
                            <p className="font-bold text-ivory">{formatDate(count.countDate)} • {count.shift} count</p>
                            <p className="mt-1 text-xs text-ivory-dim">Submitted {formatTimestamp(count.createdAt)} by {count.submittedBy} • {getReviewLines(count).length} items</p>
                            {count.notes && <p className="mt-2 text-xs italic text-ivory-dim">“{count.notes}”</p>}
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => openCountItem(count)} disabled={isSubmitting} className="inline-flex items-center gap-1 rounded border border-gold/40 px-2.5 py-2 text-[10px] font-bold uppercase tracking-wider text-gold hover:bg-gold/10 disabled:opacity-50"><Plus className="h-3.5 w-3.5" /> Add line</button>
                            <button type="button" onClick={() => { setReviewState({ count, decision: 'approved' }); setReason(''); setValidationError(''); }} disabled={isSubmitting} className="inline-flex items-center gap-1 rounded border border-emerald-400/40 px-2.5 py-2 text-[10px] font-bold uppercase tracking-wider text-emerald-300 hover:bg-emerald-400/10 disabled:opacity-50"><Check className="h-3.5 w-3.5" /> Approve</button>
                            <button type="button" onClick={() => { setReviewState({ count, decision: 'rejected' }); setReason(''); setValidationError(''); }} disabled={isSubmitting} className="inline-flex items-center gap-1 rounded border border-red-400/40 px-2.5 py-2 text-[10px] font-bold uppercase tracking-wider text-red-300 hover:bg-red-400/10 disabled:opacity-50"><X className="h-3.5 w-3.5" /> Reject</button>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[1080px] text-left text-sm">
                            <thead className="border-b border-white/10 bg-charcoal text-[10px] uppercase tracking-wider text-ivory-dim">
                                <tr><th className="px-4 py-3">Item</th><th className="px-4 py-3">System stock</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Ownership</th><th className="px-4 py-3">Physical count</th><th className="px-4 py-3">Difference</th><th className="px-4 py-3">Action</th></tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {getReviewLines(count).map((line) => {
                                    const difference = getDifference(line);
                                    const item = inventoryById.get(line.inventoryStockId);
                                    const status = item?.stockStatus || 'Normal';
                                    return (
                                        <tr key={line.id} className="align-top">
                                            <td className="px-4 py-4"><p className="font-bold text-ivory">{line.itemName}</p><p className="mt-1 text-xs text-ivory-dim">{line.unit} • {ownershipLabel(line)}</p>{line.notes && <p className="mt-2 text-xs italic text-ivory-dim">“{line.notes}”</p>}</td>
                                            <td className="px-4 py-4 font-bold text-ivory">{line.currentQuantity} {line.unit}</td>
                                            <td className="px-4 py-4"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${statusClasses[status] || statusClasses.Normal}`}>{status}</span></td>
                                            <td className="px-4 py-4 text-xs text-ivory-dim">{ownershipLabel(line)}</td>
                                            <td className="px-4 py-4 font-bold text-gold">{line.countedQuantity} {line.unit}</td>
                                            <td className={`px-4 py-4 font-bold ${difference < 0 ? 'text-red-300' : difference > 0 ? 'text-emerald-300' : 'text-ivory-dim'}`}>{difference > 0 ? '+' : ''}{difference} {line.unit}</td>
                                            <td className="px-4 py-4">{line.isAdditional && <button type="button" onClick={() => setAdditionalLines((current) => ({ ...current, [count.id]: (current[count.id] || []).filter((candidate) => candidate.inventoryStockId !== line.inventoryStockId) }))} disabled={isSubmitting} className="text-xs text-red-300 hover:underline disabled:opacity-50">Remove</button>}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </article>
            ))}

            <Modal sidebarOffset isOpen={!!reviewState} onClose={() => closeReview()} title={reviewState?.decision === 'approved' ? 'Approve stock count' : 'Reject stock count'} size="sm" footer={<><Button type="button" variant="outline" onClick={() => closeReview()} disabled={isSubmitting}>Cancel</Button><Button type="button" onClick={() => void completeReview()} disabled={isSubmitting}>{isSubmitting ? 'Saving…' : reviewState?.decision === 'approved' ? 'Approve count' : 'Reject count'}</Button></>}>
                <div className="space-y-4">
                    <p className="text-sm leading-relaxed text-ivory-dim">{reviewState?.decision === 'approved' ? 'Approval updates authoritative stock transactionally and records count-correction movements.' : 'Rejection records the reason and leaves inventory unchanged.'}</p>
                    <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gold">{reviewState?.decision === 'rejected' ? 'Reason (required)' : 'Review note (optional)'}</span><textarea rows={4} value={reason} onChange={(event) => { setReason(event.target.value); setValidationError(''); }} className="w-full resize-none rounded border border-white/10 bg-charcoal px-3 py-2.5 text-sm text-ivory outline-none focus:border-gold/60" />{validationError && <span className="mt-2 block text-sm text-red-300" role="alert">{validationError}</span>}</label>
                </div>
            </Modal>

            <Modal sidebarOffset isOpen={!!countItemState} onClose={() => setCountItemState(null)} title="Add inventory line to count" size="sm" footer={<><Button type="button" variant="outline" onClick={() => setCountItemState(null)}>Cancel</Button><Button type="button" onClick={addCountItem} disabled={inventory.length === 0}><Plus className="h-4 w-4" /> Add line</Button></>}>
                <div className="space-y-4">
                    <p className="text-sm text-ivory-dim">Select an existing inventory item and enter its physical counted quantity. It is persisted only if this count is approved.</p>
                    <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gold">Inventory item</span><select value={countItemState?.inventoryStockId || ''} onChange={(event) => { const item = inventory.find((candidate) => candidate.id === event.target.value); setCountItemState((current) => current ? { ...current, inventoryStockId: event.target.value, countedQuantity: item ? String(item.currentStock) : '', validationError: '' } : current); }} className="w-full rounded border border-white/10 bg-charcoal px-3 py-2.5 text-sm text-ivory outline-none focus:border-gold/60"><option value="" disabled>Select an item</option>{inventory.filter((item) => { const count = countItemState ? counts.find((candidate) => candidate.id === countItemState.countId) : undefined; return count ? !getReviewLines(count).some((line) => line.inventoryStockId === item.id) : true; }).map((item) => <option key={item.id} value={item.id}>{item.name} • {item.ownership || 'Retail Items'}</option>)}</select></label>
                    <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gold">Physical counted quantity</span><input type="number" min="0" step={selectedCountIsWholeUnit ? '1' : '0.001'} value={countItemState?.countedQuantity || ''} onChange={(event) => setCountItemState((current) => current ? { ...current, countedQuantity: event.target.value, validationError: '' } : current)} className="w-full rounded border border-white/10 bg-charcoal px-3 py-2.5 text-sm text-ivory outline-none focus:border-gold/60" /></label>
                    {countItemState?.validationError && <p className="text-sm text-red-300" role="alert">{countItemState.validationError}</p>}
                </div>
            </Modal>
        </section>
    );
};

export default PendingStockCountsPanel;
