import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ChevronLeft, ChevronDown, ChevronRight, Eye, FileImage, Maximize2, RotateCcw, Search, Upload, X } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/feedback/ToastContext';
import { useSearchHighlight } from '@/features/admin/hooks/useSearchHighlight';
import { LogoutModal } from '@/components/common/LogoutModal';
import PurchaseOrderReviewPanel from '@/features/admin/components/PurchaseOrderReviewPanel';
import { api } from '@/config/api';
import type { PurchaseOrder } from '@/features/inventory-manager/inventory-manager.service';
import { formatPurchaseOrderStatus, formatUnit } from '@/features/inventory-manager/shared/utils/formatting';

const errorMessage = (error: any, fallback: string) =>
    error?.response?.data?.message || error?.response?.data?.error || fallback;


const ReceiptPreviewStrip: React.FC<{ files: File[]; onRemove: (index: number) => void }> = ({ files, onRemove }) => {
    const previews = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);
    useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);
    if (files.length === 0) return null;
    return <div className="rounded border border-gold/30 bg-charcoal-light p-2"><p className="mb-2 text-xs font-bold text-ivory-dim">Selected receipt images ({files.length})</p><div className="grid max-h-40 grid-cols-4 gap-2 overflow-y-auto">{previews.map((preview, index) => <div key={preview} className="group relative aspect-square overflow-hidden rounded border border-white/10"><img src={preview} alt={`Selected receipt ${index + 1}`} className="h-full w-full object-cover" /><button type="button" onClick={() => onRemove(index)} aria-label={`Remove image ${index + 1}`} className="absolute right-1 top-1 rounded-full bg-black/80 p-1 text-white opacity-100"><X className="h-3 w-3" /></button></div>)}</div></div>;
};

const RECEIPT_MODAL_STORAGE_KEY = 'demoshop:admin:new-receipt-modal-open';
const RECEIPT_SELECTED_ORDERS_KEY = 'demoshop:admin:new-receipt-selected-orders';
const HISTORY_PAGE_SIZE = 6;

interface OrderHistoryPanelProps {
    onNavigateTab?: (tab: string, subTab?: string) => void;
}

const OrderHistoryPanel: React.FC<OrderHistoryPanelProps> = ({ onNavigateTab }) => {
    const { addToast } = useToast();
    const [searchParams] = useSearchParams();
    const [orders, setOrders] = useState<PurchaseOrder[]>([]);
    const [receipts, setReceipts] = useState<any[]>([]);
    const [suppliers, setSuppliers] = useState<any[]>([]);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>(() => {
        try {
            const raw = sessionStorage.getItem(RECEIPT_SELECTED_ORDERS_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    });
    const [receiptId, setReceiptId] = useState('');
    const [receiptFiles, setReceiptFiles] = useState<File[]>([]);
    const [receiptMode, setReceiptMode] = useState<'existing' | 'new'>('existing');
    const [newReceiptModalOpen, setNewReceiptModalOpen] = useState(() => {
        try {
            return sessionStorage.getItem(RECEIPT_MODAL_STORAGE_KEY) === 'true';
        } catch {
            return false;
        }
    });
    const [supplierId, setSupplierId] = useState('');
    const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
    const [viewingReceipt, setViewingReceipt] = useState<any | null>(null);
    const [receiptViewerIndex, setReceiptViewerIndex] = useState(0);
    const [linking, setLinking] = useState(false);
    const [removingReceiptId, setRemovingReceiptId] = useState<string | null>(null);
    const [receiptRemovalTarget, setReceiptRemovalTarget] = useState<PurchaseOrder | null>(null);
    const [imageRemovalTarget, setImageRemovalTarget] = useState<{ receiptId: string; attachmentId?: string; imageNumber: number } | null>(null);
    const [removingImage, setRemovingImage] = useState(false);
    const [loading, setLoading] = useState(true);
    const [historySearch, setHistorySearch] = useState('');
    const [historyStatus, setHistoryStatus] = useState<'all' | 'approved' | 'fulfilled'>('all');
    const [historyDate, setHistoryDate] = useState('');
    const [historyPage, setHistoryPage] = useState(1);
    const viewerImages = useMemo(() => (viewingReceipt?.receiptImageUrls || [viewingReceipt?.receiptImageUrl]).filter(Boolean) as string[], [viewingReceipt]);
    const activeViewerImage = viewerImages[receiptViewerIndex] || viewerImages[0];
    const selectedOrderForUpload = orders.find((order) => selectedOrderIds.includes(order.id));

    useEffect(() => {
        setReceiptViewerIndex(0);
    }, [viewingReceipt]);

    const searchQuery = (searchParams.get('search') || searchParams.get('q') || '').trim().toLowerCase();
    const highlightId = searchParams.get('highlightId');

    const filteredOrders = useMemo(() => {
        const query = `${historySearch} ${searchQuery}`.trim().toLowerCase();
        return orders.filter((order) => {
            const matchesQuery = !query || [order.poNumber, order.id, order.createdByName || '', ...order.lines.map((line) => line.itemName || '')]
                .join(' ').toLowerCase().includes(query);
            const matchesStatus = historyStatus === 'all' || order.status === historyStatus;
            const date = (order.submittedAt || order.createdAt || '').slice(0, 10);
            return matchesQuery && matchesStatus && (!historyDate || date === historyDate);
        });
    }, [historyDate, historySearch, historyStatus, orders, searchQuery]);

    const historyPageCount = Math.max(1, Math.ceil(filteredOrders.length / HISTORY_PAGE_SIZE));
    const paginatedOrders = useMemo(() => {
        const start = (historyPage - 1) * HISTORY_PAGE_SIZE;
        return filteredOrders.slice(start, start + HISTORY_PAGE_SIZE);
    }, [filteredOrders, historyPage]);

    useEffect(() => {
        setHistoryPage(1);
    }, [historyDate, historySearch, historyStatus, searchQuery]);

    useEffect(() => {
        setHistoryPage((current) => Math.min(current, historyPageCount));
    }, [historyPageCount]);

    // Activate glow highlight and smooth scroll-into-view
    useSearchHighlight(!loading && filteredOrders.length > 0);

    // Auto-expand matching purchase order on deep link
    useEffect(() => {
        if (loading || orders.length === 0) return;
        const matched = orders.find((o) => {
            if (highlightId && (`po-${o.id}` === highlightId || o.id === highlightId || o.poNumber === highlightId || `po-${o.poNumber}` === highlightId)) return true;
            if (searchQuery && (o.poNumber.toLowerCase() === searchQuery || o.id.toLowerCase() === searchQuery)) return true;
            return false;
        });
        if (matched) {
            setExpandedId(matched.id);
        }
    }, [loading, orders, highlightId, searchQuery]);

    const closeNewReceiptModal = () => {
        setNewReceiptModalOpen(false);
        try {
            sessionStorage.removeItem(RECEIPT_MODAL_STORAGE_KEY);
        } catch {
            // ignore session storage error
        }
    };

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [response, receiptResponse, supplierResponse] = await Promise.all([
                api.get<PurchaseOrder[]>('/api/inventory/purchase-orders'),
                api.get<any[]>('/api/inventory/receipts'),
                api.get<any[]>('/api/inventory/suppliers'),
            ]);
            setOrders(Array.isArray(response.data)
                ? response.data.filter((order) => ['approved', 'fulfilled'].includes(order.status))
                : []);
            setReceipts(Array.isArray(receiptResponse.data) ? receiptResponse.data : []);
            setSuppliers(Array.isArray(supplierResponse.data) ? supplierResponse.data : []);
        } catch (error) {
            addToast({ type: 'error', title: 'Order history could not be loaded', message: errorMessage(error, 'Please try again.') });
        } finally {
            setLoading(false);
        }
    }, [addToast]);

    const attachReceipt = async () => {
        const invalidSelection = selectedOrderIds.length === 0
            || (receiptMode === 'existing' ? !receiptId : receiptFiles.length === 0 || (!selectedOrderForUpload?.receiptId && (!supplierId || !purchaseDate)));
        if (invalidSelection) return;
        setLinking(true);
        const imageCount = receiptMode === 'new' ? receiptFiles.length : 1;
        try {
            let selectedReceiptId: string | null = receiptId;
            if (receiptMode === 'new') {
                const formData = new FormData();
                receiptFiles.forEach((file) => formData.append('receipt', file));
                const selectedOrder = selectedOrderForUpload;
                if (selectedOrder?.receiptId) {
                    await api.post(`/api/inventory/receipts/${selectedOrder.receiptId}/attachments`, formData);
                    selectedReceiptId = null;
                } else {
                    formData.append('supplierId', supplierId);
                    formData.append('purchaseDate', purchaseDate);
                    if (selectedOrder?.branchId) formData.append('branchId', String(selectedOrder.branchId));
                    const upload = await api.post<{ id: string }>('/api/inventory/receipts', formData);
                    selectedReceiptId = upload.data.id;
                }
            }
            if (selectedReceiptId) await api.post(`/api/inventory/receipts/${selectedReceiptId}/link`, { purchaseOrderIds: selectedOrderIds });
            setSelectedOrderIds([]);
            try {
                sessionStorage.removeItem(RECEIPT_SELECTED_ORDERS_KEY);
            } catch {
                // ignore session storage error
            }
            setReceiptId('');
            setReceiptFiles([]);
            closeNewReceiptModal();
            window.dispatchEvent(new Event('demoshop:purchase-orders-changed'));
            await load();
            addToast({ type: 'success', title: 'Proof of purchase attached', message: `${imageCount} receipt image${imageCount === 1 ? '' : 's'} were saved and attached to the selected stock requests.` });
        } catch (error) {
            addToast({ type: 'error', title: 'Receipt could not be attached', message: errorMessage(error, 'Please try again.') });
        } finally {
            setLinking(false);
        }
    };

    const removeReceipt = async (order: PurchaseOrder) => {
        if (order.status !== 'approved' || !order.receiptId) return;
        setRemovingReceiptId(order.id);
        try {
            await api.delete(`/api/inventory/purchase-orders/${order.id}/receipt`);
            setReceiptRemovalTarget(null);
            await load();
            window.dispatchEvent(new Event('demoshop:purchase-orders-changed'));
            addToast({ type: 'success', title: 'Receipt removed from stock request', message: `${order.poNumber} no longer has this receipt linked. The receipt evidence was retained.` });
        } catch (error) {
            addToast({ type: 'error', title: 'Receipt could not be removed', message: errorMessage(error, 'Only approved stock requests can have receipt evidence removed.') });
        } finally {
            setRemovingReceiptId(null);
        }
    };

    const removeReceiptImage = async () => {
        if (!imageRemovalTarget) return;
        setRemovingImage(true);
        try {
            await api.delete(imageRemovalTarget.attachmentId
                ? `/api/inventory/receipts/${imageRemovalTarget.receiptId}/attachments/${imageRemovalTarget.attachmentId}`
                : `/api/inventory/receipts/${imageRemovalTarget.receiptId}/primary-image`);
            setImageRemovalTarget(null);
            await load();
            window.dispatchEvent(new Event('demoshop:purchase-orders-changed'));
            addToast({ type: 'success', title: 'Receipt image removed', message: `Receipt image ${imageRemovalTarget.imageNumber} was removed.` });
        } catch (error) {
            addToast({ type: 'error', title: 'Receipt image could not be removed', message: errorMessage(error, 'Please try again.') });
        } finally {
            setRemovingImage(false);
        }
    };

    useEffect(() => {
        void load();
        window.addEventListener('demoshop:purchase-orders-changed', load);
        return () => window.removeEventListener('demoshop:purchase-orders-changed', load);
    }, [load]);

    return (
        <section className="rounded-xl border border-white/10 bg-charcoal-light p-4 md:p-5">
            <LogoutModal
                isOpen={Boolean(receiptRemovalTarget)}
                onClose={() => setReceiptRemovalTarget(null)}
                onConfirm={() => receiptRemovalTarget ? removeReceipt(receiptRemovalTarget) : undefined}
                isLoading={Boolean(removingReceiptId)}
                title="Remove receipt?"
                message={receiptRemovalTarget ? `Remove the receipt from ${receiptRemovalTarget.poNumber}? The receipt evidence will be retained and can be linked again.` : ''}
                confirmLabel="Remove receipt"
                loadingLabel="Removing…"
            />
            <LogoutModal
                isOpen={Boolean(imageRemovalTarget)}
                onClose={() => setImageRemovalTarget(null)}
                onConfirm={() => void removeReceiptImage()}
                isLoading={removingImage}
                title="Remove receipt image?"
                message={imageRemovalTarget ? `Remove receipt image ${imageRemovalTarget.imageNumber}? Other receipt images will remain attached.` : ''}
                confirmLabel="Remove image"
                loadingLabel="Removing…"
            />
            {newReceiptModalOpen && (
            <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
                role="dialog"
                aria-modal="true"
            >
            <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl border border-white/10 bg-charcoal p-5 shadow-xl">
            <div className="flex shrink-0 items-start justify-between border-b border-white/10 pb-4">
            <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold">
                    Procurement · receipt
                </p>
                <h3 className="mt-1 text-lg font-bold">Add new receipt</h3>
                <p className="mt-1 text-xs text-ivory-dim">
                    Attach these receipt images to the {selectedOrderIds.length} selected stock request
                    {selectedOrderIds.length === 1 ? '' : 's'}.
                </p>
                </div>
                <button
                type="button"
                onClick={closeNewReceiptModal}
                aria-label="Close"
                >
                <X className="h-5 w-5 text-ivory-dim" />
                </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-4">
                <div>
                    <div className="flex items-center justify-between text-xs text-ivory-dim">
                        <span>Supplier *</span>
                        {onNavigateTab && (
                            <button
                                type="button"
                                onClick={() => {
                                    try {
                                        sessionStorage.setItem(RECEIPT_MODAL_STORAGE_KEY, 'true');
                                    } catch {
                                        // ignore session storage error
                                    }
                                    onNavigateTab('inventory', 'suppliers');
                                }}
                                className="font-bold text-gold hover:text-gold/80 transition-colors"
                            >
                                Add Supplier +
                            </button>
                        )}
                    </div>
                    <select
                        value={supplierId}
                        onChange={(event) => setSupplierId(event.target.value)}
                        className="mt-1.5 w-full rounded border border-white/10 bg-charcoal-light px-3 py-2 text-sm text-ivory"
                    >
                        <option value="">Select supplier…</option>
                        {suppliers.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>
                            {supplier.name}
                        </option>
                        ))}
                    </select>
                </div>

                <label className="block text-xs text-ivory-dim">
                <span>Purchase date *</span>
                <input
                    type="date"
                    value={purchaseDate}
                    onChange={(event) => setPurchaseDate(event.target.value)}
                    className="mt-1.5 w-full rounded border border-white/10 bg-charcoal-light px-3 py-2 text-sm text-ivory"
                />
                </label>

                <label className="flex cursor-pointer flex-col items-center justify-center rounded border border-dashed border-gold/40 px-4 py-8 text-center text-xs text-ivory-dim hover:bg-gold/5">
                <Upload className="mb-2 h-5 w-5 text-gold" />
                <span className="font-bold text-gold">Choose receipt images</span>
                <span className="mt-1">Select multiple JPEG or PNG images; each image will be saved together as proof of purchase.</span>
                <input
                    type="file"
                    multiple
                    accept="image/jpeg,image/png"
                    onChange={(event) => setReceiptFiles(Array.from(event.target.files || []))}
                    className="sr-only"
                />
                </label>

                <ReceiptPreviewStrip
                    files={receiptFiles}
                    onRemove={(index) =>
                        setReceiptFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))
                    }
                />

                {receiptFiles.length > 0 && (
                <p className="text-xs text-ivory-dim">
                    {receiptFiles.length} receipt image{receiptFiles.length === 1 ? '' : 's'} ready to save.
                </p>
                )}
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t border-white/10 pt-4">
                <Button
                type="button"
                variant="outline"
                onClick={closeNewReceiptModal}
                >
                Cancel
                </Button>
                <Button
                type="button"
                disabled={linking || receiptFiles.length === 0 || (!selectedOrderForUpload?.receiptId && (!supplierId || !purchaseDate))}
                onClick={() => {
                    void attachReceipt();
                }}
                >
                {linking ? 'Saving receipt images…' : 'Save proof of purchase'}
                </Button>
            </div>
            </div>
        </div>
        )}

        {viewingReceipt && (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
            role="dialog"
            aria-modal="true"
        >
            <div className="flex max-h-[90vh] w-fit max-w-[90vw] min-w-[min(20rem,90vw)] flex-col overflow-y-auto rounded-xl border border-white/10 bg-charcoal p-4 sm:p-5">
            <div className="flex items-center justify-between">
                <div><h3 className="font-bold">Receipt {viewingReceipt.receiptNumber || ''}</h3>{viewerImages.length > 1 && <p className="mt-1 text-xs text-ivory-dim">Image {receiptViewerIndex + 1} of {viewerImages.length}</p>}</div>
                <button
                type="button"
                onClick={() => setViewingReceipt(null)}
                aria-label="Close receipt"
                >
                <X className="h-5 w-5" />
                </button>
            </div>

            <div className="mt-4 flex max-h-[65vh] items-center justify-center gap-2 overflow-auto rounded border border-white/10 bg-black/30 p-2">
                {viewerImages.length > 1 && <button type="button" aria-label="Previous receipt image" className="shrink-0 rounded-full border border-white/10 p-2 text-ivory-dim hover:text-gold" onClick={() => setReceiptViewerIndex((current) => (current - 1 + viewerImages.length) % viewerImages.length)}><ChevronLeft className="h-5 w-5" /></button>}
                {activeViewerImage ? <img src={activeViewerImage} alt={`Receipt evidence ${receiptViewerIndex + 1}`} className="max-h-[60vh] max-w-[min(75vw,48rem)] rounded object-contain" /> : <p className="p-10 text-sm text-ivory-dim">No receipt image is available.</p>}
                {viewerImages.length > 1 && <button type="button" aria-label="Next receipt image" className="shrink-0 rounded-full border border-white/10 p-2 text-ivory-dim hover:text-gold" onClick={() => setReceiptViewerIndex((current) => (current + 1) % viewerImages.length)}><ChevronRight className="h-5 w-5" /></button>}
            </div>
            {viewerImages.length > 1 && <div className="mt-3 flex max-w-[80vw] gap-2 overflow-x-auto pb-1">{viewerImages.map((url, index) => <button key={url} type="button" aria-label={`View receipt image ${index + 1}`} onClick={() => setReceiptViewerIndex(index)} className={`h-16 w-12 shrink-0 overflow-hidden rounded border ${index === receiptViewerIndex ? 'border-gold' : 'border-white/10'}`}><img src={url} alt="" className="h-full w-full object-contain" /></button>)}</div>}
            <div className="mt-4 border-t border-white/10 pt-3 text-xs text-ivory-dim"><p>Uploaded: {viewingReceipt.createdAt ? new Date(viewingReceipt.createdAt).toLocaleString() : 'Date unavailable'}</p><p className="mt-1">Filename: {viewingReceipt.originalFilename || viewingReceipt.fileName || 'Filename unavailable'}</p>{viewingReceipt.uploadedBy && <p className="mt-1">Uploaded by: {viewingReceipt.uploadedByName || viewingReceipt.uploadedBy}</p>}</div>
            </div>
        </div>
        )}

        <div className="flex items-center justify-between gap-3">
        <div>
            <h3 className="text-lg font-bold">Order history</h3>
            <p className="mt-1 text-xs text-ivory-dim">
            Approved and fulfilled stock requests.
            </p>
        </div>
        </div>
        <div className="mt-4 grid gap-2 rounded border border-white/10 bg-charcoal p-3 md:grid-cols-[minmax(14rem,1fr)_10rem_10rem_auto] md:items-center">
            <label className="relative block text-xs text-ivory-dim"><span className="sr-only">Search stock requests</span><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4" /><input value={historySearch} onChange={(event) => setHistorySearch(event.target.value)} placeholder="Search request, item, or requester" className="w-full rounded border border-white/10 bg-charcoal-light py-2 pl-9 pr-3 text-sm text-ivory" /></label>
            <label className="text-xs text-ivory-dim"><span className="sr-only">Filter by status</span><select value={historyStatus} onChange={(event) => setHistoryStatus(event.target.value as typeof historyStatus)} className="w-full rounded border border-white/10 bg-charcoal-light px-3 py-2 text-sm text-ivory"><option value="all">All statuses</option><option value="approved">Approved</option><option value="fulfilled">Fulfilled</option></select></label>
            <label className="text-xs text-ivory-dim"><span className="sr-only">Filter by requested date</span><input type="date" value={historyDate} onChange={(event) => setHistoryDate(event.target.value)} className="w-full rounded border border-white/10 bg-charcoal-light px-3 py-2 text-sm text-ivory" /></label>
            <button
                type="button"
                onClick={() => { setHistorySearch(''); setHistoryStatus('all'); setHistoryDate(''); setHistoryPage(1); }}
                className="inline-flex h-[38px] items-center justify-center gap-1.5 rounded border border-white/15 bg-charcoal-light px-3.5 text-xs font-semibold uppercase tracking-wider text-ivory-dim transition hover:border-gold/40 hover:bg-white/5 hover:text-gold cursor-pointer"
                title="Clear all filters"
            >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Clear</span>
            </button>
        </div>
            {loading ? <div className="mt-4 space-y-3" role="status" aria-label="Loading receiving history"><Skeleton className="h-16 w-full rounded border border-white/10" /><Skeleton className="h-16 w-full rounded border border-white/10" /><Skeleton className="h-16 w-full rounded border border-white/10" /></div> : filteredOrders.length === 0 ? <p className="mt-4 rounded border border-white/10 p-4 text-sm text-ivory-dim">No stock requests match the selected filters.</p> : <><div className="mt-4 min-h-[22rem] overflow-x-auto rounded-lg border border-white/10 bg-charcoal"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-charcoal-light text-[11px] uppercase tracking-wider text-ivory-dim"><tr><th className="px-3 py-3">Request ID</th><th className="px-3 py-3">Date</th><th className="px-3 py-3">Items</th><th className="px-3 py-3">Requested By</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Fulfilled Date</th><th className="px-3 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-white/10">{paginatedOrders.map((order) => {
                const linkedReceipt = receipts.find((r) => r.id === order.receiptId);
                const receiptImages = (order.receiptImageUrls && order.receiptImageUrls.length > 0)
                    ? order.receiptImageUrls
                    : (order.receiptImageUrl ? [order.receiptImageUrl] : (linkedReceipt?.receiptImageUrls || (linkedReceipt?.receiptImageUrl ? [linkedReceipt.receiptImageUrl] : [])));
                const hasReceipt = Boolean(order.receiptId || receiptImages.length > 0);

                return (
                    <Fragment key={order.id}>
                    <tr data-search-id={`po-${order.id} po-${order.poNumber} ${order.id} ${order.poNumber}`} className="align-middle">
                        <td className="px-3 py-3"><span className="font-bold text-gold">{order.poNumber}</span></td>
                        <td className="px-3 py-3 text-ivory-dim">{order.submittedAt || order.createdAt ? new Date(order.submittedAt || order.createdAt || '').toLocaleDateString() : '—'}</td>
                        <td className="px-3 py-3">{order.lines.length} item{order.lines.length === 1 ? '' : 's'}</td>
                        <td className="px-3 py-3 text-ivory-dim">{order.createdByName || '—'}</td>
                        <td className="px-3 py-3"><span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${order.status === 'fulfilled' ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300' : 'border-gold/40 bg-gold/10 text-gold'}`}>{formatPurchaseOrderStatus(order.status)}</span></td>
                        <td className="px-3 py-3 text-ivory-dim">{order.fulfilledAt ? new Date(order.fulfilledAt).toLocaleDateString() : '—'}</td>
                        <td className="px-3 py-3 text-right"><div className="flex flex-wrap justify-end gap-3">{order.status !== 'fulfilled' && <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-ivory-dim hover:text-gold hover:underline" onClick={() => { setSelectedOrderIds([order.id]); setReceiptMode('new'); setReceiptId(''); setReceiptFiles([]); setNewReceiptModalOpen(true); try { sessionStorage.setItem(RECEIPT_SELECTED_ORDERS_KEY, JSON.stringify([order.id])); sessionStorage.setItem(RECEIPT_MODAL_STORAGE_KEY, 'true'); } catch { /* ignore session storage error */ } }}><Upload className="h-3.5 w-3.5" />Add Receipt</button>}<button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-gold hover:underline" aria-expanded={expandedId === order.id} aria-controls={`details-${order.id}`} onClick={() => setExpandedId(expandedId === order.id ? null : order.id)}><Eye className="h-3.5 w-3.5" />{expandedId === order.id ? 'Hide details' : 'View details'}<ChevronDown className={`h-3.5 w-3.5 transition-transform ${expandedId === order.id ? 'rotate-180' : ''}`} /></button></div></td>
                    </tr>
                    {expandedId === order.id && <tr id={`details-${order.id}`}><td colSpan={7} className="border-t border-white/10 bg-charcoal-light p-3">
                        <div className="grid items-start gap-4 lg:grid-cols-[2fr_3fr]">
                            <div className="order-2 rounded-xl border border-white/10 bg-charcoal-light p-4 lg:order-2">
                                <h4 className="mb-3 font-bold text-xs uppercase tracking-wider text-gold">Item Details</h4>
                                <table className="w-full text-left text-xs">
                                    <thead className="text-ivory-dim">
                                        <tr>
                                            <th className="py-2 pr-3">Item</th>
                                            <th className="py-2 pr-3">Quantity</th>
                                            <th className="py-2">Unit cost</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {order.lines.map((line) => (
                                            <tr key={line.id || line.inventoryStockId}>
                                                <td className="py-2 pr-3">{line.itemName} ({line.unit})</td>
                                                <td className="py-2 pr-3 text-gold">{line.quantityRequested}{line.unit ? ` ${formatUnit(line.quantityRequested, line.unit)}` : ''}</td>
                                                <td className="py-2">{line.unitCost == null ? '—' : `₱${line.unitCost.toFixed(2)}`}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                                {hasReceipt && (
                                    <div className="order-1 rounded-xl border border-white/10 bg-charcoal-light p-4 space-y-3 lg:order-2">
                                        <h4 className="font-bold text-xs uppercase tracking-wider text-gold">Proof of Purchase</h4>
                                        <div className="space-y-3">
                                            <button
                                                type="button"
                                                onClick={() => setViewingReceipt(linkedReceipt || {
                                                    id: order.receiptId,
                                                    receiptNumber: order.receiptNumber,
                                                    receiptImageUrl: order.receiptImageUrl,
                                                    receiptImageUrls: receiptImages,
                                                })}
                                                className="text-xs text-emerald-400 font-medium flex items-center gap-1.5 hover:underline text-left cursor-pointer"
                                                title="Click to view receipt"
                                            >
                                                <FileImage className="h-4 w-4" />
                                                Receipt evidence attached{receiptImages.length > 0 ? ` (${receiptImages.length} file${receiptImages.length > 1 ? 's' : ''})` : '.'}
                                            </button>

                                            {receiptImages.length > 0 && (
                                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                                    {receiptImages.map((imageUrl: string, index: number) => {
                                                        const attachmentId = order.receiptImageIds?.[index] || null;
                                                        return <div key={imageUrl} className="group relative overflow-hidden rounded-lg border border-white/10 bg-black/40">
                                                        <button
                                                            type="button"
                                                            onClick={() => setViewingReceipt(linkedReceipt || {
                                                                id: order.receiptId,
                                                                receiptNumber: order.receiptNumber,
                                                                receiptImageUrl: order.receiptImageUrl,
                                                                receiptImageUrls: receiptImages,
                                                            })}
                                                            className="block w-full text-left transition hover:border-gold/60 focus:outline-none focus:ring-1 focus:ring-gold"
                                                            title={`View receipt image ${index + 1}`}
                                                        >
                                                            <img src={imageUrl} alt={`Receipt evidence ${index + 1} of ${receiptImages.length}`} className="h-36 w-full object-contain transition duration-300 group-hover:scale-105" />
                                                            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/65 px-2 py-1.5 text-[10px] font-semibold text-gold"><span>Receipt {index + 1}</span><Maximize2 className="h-3.5 w-3.5" /></div>
                                                        </button>
                                                        {order.status !== 'fulfilled' && order.receiptId && receiptImages.length > 1 && <button type="button" aria-label={`Remove receipt image ${index + 1}`} title="Remove this receipt image" onClick={() => setImageRemovalTarget({ receiptId: order.receiptId!, attachmentId: attachmentId || undefined, imageNumber: index + 1 })} className="absolute right-1 top-1 rounded-full bg-black/80 px-2 py-1 text-xs font-bold text-red-300 hover:bg-red-500/20">×</button>}
                                                        </div>;
                                                    })}
                                                </div>
                                            )}

                                            <button
                                                type="button"
                                                onClick={() => setViewingReceipt(linkedReceipt || {
                                                    id: order.receiptId,
                                                    receiptNumber: order.receiptNumber,
                                                    receiptImageUrl: order.receiptImageUrl,
                                                    receiptImageUrls: receiptImages,
                                                })}
                                                className="inline-flex items-center gap-1 text-xs font-semibold text-gold hover:underline"
                                            >
                                                <Eye className="h-3.5 w-3.5" />
                                                View receipt modal
                                            </button>

                                            {order.status === 'approved' && order.receiptId && (
                                                <button
                                                    type="button"
                                                    onClick={() => setReceiptRemovalTarget(order)}
                                                    disabled={removingReceiptId === order.id}
                                                    className="ml-3 inline-flex items-center gap-1 text-xs font-semibold text-red-300 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                    <X className="h-3.5 w-3.5" />
                                                    {removingReceiptId === order.id ? 'Removing…' : 'Remove incorrect receipt'}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}
                                {!hasReceipt && (
                                    <div className="order-1 rounded-xl border border-dashed border-white/10 bg-charcoal-light p-4 lg:order-2">
                                        <h4 className="font-bold text-xs uppercase tracking-wider text-gold">Proof of Purchase</h4>
                                        <p className="mt-3 text-sm text-ivory-dim">No receipt attached to this stock request.</p>
                                    </div>
                                )}
                        </div>
                    </td></tr>}
                    </Fragment>
                );
            })}</tbody></table></div>{historyPageCount > 1 && <nav className="mt-4 flex items-center justify-between gap-3 border-t border-white/10 pt-4" aria-label="Stock request history pagination"><p className="text-xs text-ivory-dim" aria-live="polite">Page {historyPage} of {historyPageCount}</p><div className="flex gap-2"><button type="button" onClick={() => setHistoryPage((page) => Math.max(1, page - 1))} disabled={historyPage === 1} className="rounded border border-white/10 px-3 py-1.5 text-xs font-semibold text-ivory transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40">Previous</button><button type="button" onClick={() => setHistoryPage((page) => Math.min(historyPageCount, page + 1))} disabled={historyPage === historyPageCount} className="rounded border border-white/10 px-3 py-1.5 text-xs font-semibold text-ivory transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40">Next</button></div></nav>}</>}
        </section>
    );
};

interface PurchaseOrdersTabProps {
    activeSubTab?: string;
    onNavigateSubTab?: (subTab: string) => void;
    onNavigateTab?: (tab: string, subTab?: string) => void;
}

const PurchaseOrdersTab: React.FC<PurchaseOrdersTabProps> = ({ activeSubTab = 'purchase-order-approval', onNavigateSubTab, onNavigateTab }) => (
    <PurchaseOrdersContent activeSubTab={activeSubTab} onNavigateSubTab={onNavigateSubTab} onNavigateTab={onNavigateTab} />
);

const PurchaseOrdersContent: React.FC<PurchaseOrdersTabProps> = ({ activeSubTab = 'purchase-order-approval', onNavigateSubTab, onNavigateTab }) => {
    const [pendingCount, setPendingCount] = useState(0);

    const loadPendingCount = useCallback(async () => {
        try {
            const response = await api.get<any[]>('/api/inventory/purchase-orders');
            setPendingCount(Array.isArray(response.data) ? response.data.filter((order) => order.status === 'pending').length : 0);
        } catch {
            setPendingCount(0);
        }
    }, []);

    useEffect(() => {
        void loadPendingCount();
        window.addEventListener('demoshop:purchase-orders-changed', loadPendingCount);
        return () => window.removeEventListener('demoshop:purchase-orders-changed', loadPendingCount);
    }, [loadPendingCount]);

    return (
        <section className="h-full min-h-0 overflow-y-auto overscroll-contain space-y-4 pb-24 sm:pb-28 lg:pb-6">
            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold">Owner/Admin • procurement workflow</p>
                    <h2 className="mt-1 text-2xl font-serif font-bold text-ivory">Stock Requests</h2>
                    <p className="mt-2 max-w-2xl text-sm text-ivory-dim">
                        Review pending stock requests from inventory managers and track received orders with receipts.
                    </p>
                </div>
            </div>

            <nav className="flex flex-nowrap overflow-x-auto whitespace-nowrap scrollbar-none touch-pan-x [-webkit-overflow-scrolling:touch] gap-2 border-b border-white/10 pb-3 lg:hidden shrink-0" aria-label="Stock request stages">
                {[
                    ['purchase-order-approval', 'Stock Request Approval'],
                    ['history', 'Receiving'],
                ].map(([id, label]) => {
                    const isSelected = activeSubTab === id || (id === 'purchase-order-approval' && activeSubTab === 'awaiting-approval');
                    return (
                        <button
                            key={id}
                            type="button"
                            onClick={() => onNavigateSubTab?.(id)}
                            className={`shrink-0 rounded px-3 py-2 text-xs font-bold transition-colors cursor-pointer ${isSelected ? 'bg-gold text-charcoal' : 'text-ivory-dim hover:bg-white/5 hover:text-ivory'}`}
                        >
                            {label}
                            {id === 'purchase-order-approval' && pendingCount > 0 && (
                                <span className="ml-2 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] text-white">{pendingCount}</span>
                            )}
                        </button>
                    );
                })}
            </nav>

            {(activeSubTab === 'purchase-order-approval' || activeSubTab === 'awaiting-approval') && <PurchaseOrderReviewPanel />}
            {activeSubTab === 'history' && (
                <OrderHistoryPanel onNavigateTab={onNavigateTab} />
            )}
        </section>
    );
};

export default PurchaseOrdersTab;
