import React from 'react';
import { Box } from 'lucide-react';
import type { InventoryItem, StockStatus } from '../../mock-inventory';

export interface InventoryTableProps {
    items: InventoryItem[];
    onCreatePurchaseOrder: (item: InventoryItem) => void;
}

export const isNeedsActionItem = (item: InventoryItem): boolean => {
    const status = item.stockStatus || item.status;
    return status !== 'In Stock';
};

const stockStatusBadgeClasses: Record<StockStatus, string> = {
    'Out of Stock': 'border-red-400/25 bg-red-400/[0.06] text-red-200',
    'Critically Low': 'border-rose-400/35 bg-rose-400/10 text-rose-300',
    'Low Stock': 'border-gold/25 bg-gold/[0.06] text-gold',
    'In Stock': 'border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-200',
};

const stockStatusDotClasses: Record<StockStatus, string> = {
    'Out of Stock': 'bg-red-400',
    'Critically Low': 'bg-rose-400',
    'Low Stock': 'bg-yellow-400',
    'In Stock': 'bg-emerald-400',
};

const stockStatusOrder: Record<StockStatus, number> = {
    'Out of Stock': 0,
    'Critically Low': 1,
    'Low Stock': 2,
    'In Stock': 3,
};

const sortByStockStatus = (items: InventoryItem[]): InventoryItem[] => [...items].sort((a, b) => {
    const aStatus = (a.stockStatus || a.status) as StockStatus;
    const bStatus = (b.stockStatus || b.status) as StockStatus;
    return (stockStatusOrder[aStatus] ?? 99) - (stockStatusOrder[bStatus] ?? 99) || a.name.localeCompare(b.name);
});

interface SimplifiedStockTableProps {
    items: InventoryItem[];
    onCreatePurchaseOrder: (item: InventoryItem) => void;
}

const SimplifiedStockTable: React.FC<SimplifiedStockTableProps> = ({ items, onCreatePurchaseOrder }) => (
    <div className="max-h-[32rem] overflow-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <caption className="sr-only">Stock list with available quantities, status, and stock request actions. Items needing attention appear first.</caption>
            <thead className="sticky top-0 z-10 border-b border-white/15 bg-charcoal text-xs font-semibold text-ivory-dim shadow-sm">
                <tr>
                    <th scope="col" className="px-5 py-3">Item</th>
                    <th scope="col" className="px-4 py-3">Stock on hand</th>
                    <th scope="col" className="px-5 py-3">Status</th>
                    <th scope="col" className="px-5 py-3">Action</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.07]">
                {items.map((item) => {
                    const needsAction = isNeedsActionItem(item);
                    const status = (item.stockStatus || item.status) as StockStatus;
                    const isSupply = item.ownership === 'Consumables' || Boolean(item.assignedBarber);
                    const displayedStock = isSupply ? Math.round(item.currentStock) : item.currentStock;
                    return (
                        <tr key={item.id} className="align-middle transition-colors hover:bg-white/[0.035]">
                            <th scope="row" className="px-5 py-4 text-left font-normal">
                                <p className="font-semibold text-ivory">{item.name}</p>
                                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${isSupply ? 'border-gold/25 bg-gold/[0.06] text-gold' : 'border-sky-300/30 bg-sky-300/10 text-sky-200'}`}>{isSupply ? 'Consumables' : 'Retail items'}</span>
                                    <span className="text-xs text-ivory-dim">{item.category}</span>
                                </div>
                            </th>
                            <td className="px-4 py-4">
                                <span className={`text-base font-semibold tabular-nums ${item.currentStock === 0 ? 'text-red-300' : 'text-ivory'}`}>{displayedStock.toLocaleString()}</span>{' '}
                                <span className="text-xs text-ivory-dim">{item.unit}</span>
                            </td>
                            <td className="px-5 py-4">
                                <span className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${stockStatusBadgeClasses[status] || stockStatusBadgeClasses['In Stock']}`}>
                                    <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${stockStatusDotClasses[status] || stockStatusDotClasses['In Stock']}`} />
                                    {status}
                                </span>
                            </td>
                            <td className="px-5 py-4">
                                {needsAction ? (
                                    <button
                                        type="button"
                                        onClick={() => onCreatePurchaseOrder(item)}
                                        aria-label={`Request stock for ${item.name}`}
                                        className="inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-sm border border-gold/35 bg-gold/[0.06] px-3 text-xs font-semibold text-gold transition-colors hover:border-gold hover:bg-gold hover:text-charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                                    >
                                        Request stock
                                    </button>
                                ) : (
                                    <span className="text-xs text-ivory-dim">No action needed</span>
                                )}
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    </div>
);
const InventoryTable: React.FC<InventoryTableProps> = ({ items, onCreatePurchaseOrder }) => {
    const [page, setPage] = React.useState(1);
    const pageSize = 10;

    React.useEffect(() => setPage(1), [items]);

    if (items.length === 0) {
        return (
            <div className="rounded-lg border border-dashed border-white/10 bg-charcoal-light px-6 py-12 text-center">
                <Box className="mx-auto h-8 w-8 text-ivory-dim" />
                <p className="mt-3 font-bold text-ivory">No inventory items found</p>
                <p className="mt-1 text-sm text-ivory-dim">Try changing your search or filters.</p>
            </div>
        );
    }

    const sortedItems = sortByStockStatus(items);
    const paginatedItems = sortedItems.slice((page - 1) * pageSize, page * pageSize);
    const totalPages = Math.ceil(sortedItems.length / pageSize);

    return (
        <div className="overflow-hidden rounded-lg border border-white/10 bg-charcoal-light shadow-xl">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-white/[0.03] px-4 py-3.5">
                <div><h3 className="text-base font-semibold text-ivory">Stock List</h3><p className="mt-1 text-xs text-ivory-dim">Items needing restock appear first.</p></div>
                <span className="text-xs text-ivory-dim">{items.length} {items.length === 1 ? 'item' : 'items'}</span>
            </div>
            <SimplifiedStockTable items={paginatedItems} onCreatePurchaseOrder={onCreatePurchaseOrder} />
            {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-white/10 bg-charcoal px-4 py-3">
                    <span className="text-xs text-ivory-dim">Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, items.length)} of {items.length} items</span>
                    <div className="flex items-center gap-2">
                        <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1} className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-ivory disabled:opacity-50">Previous</button>
                        <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages} className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-ivory disabled:opacity-50">Next</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InventoryTable;
