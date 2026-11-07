import React from 'react';
import { ChevronRight } from 'lucide-react';
import { SelectField } from '../../../shared/components/SelectField';
import { EmptyState } from '../../../shared/components/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tooltip } from '@/components/ui/Tooltip';
import { formatPurchaseOrderStatus, statusClass } from '../../../shared/utils/formatting';
import type { PurchaseOrder } from '../purchase-order.types';

interface PurchaseOrderListProps {
  orders: PurchaseOrder[];
  statusFilter: string;
  loading: boolean;
  onStatusFilterChange: (status: string) => void;
  onEdit: (order: PurchaseOrder) => void;
  onDelete: (order: PurchaseOrder) => void;
  onSubmit: (order: PurchaseOrder) => void;
  onFulfill: (order: PurchaseOrder) => void;
  onSelectOrder?: (order: PurchaseOrder) => void;
}

const formatDate = (isoString?: string | null): string => {
  if (!isoString) return '—';
  const d = new Date(isoString);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatTime = (isoString?: string | null): string => {
  if (!isoString) return '—';
  const d = new Date(isoString);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
};

const formatItemsSummary = (lines: PurchaseOrder['lines']): string => {
  if (!lines || lines.length === 0) return '—';
  return lines
    .map((line) => `${line.itemName || 'Item'} (${line.quantityRequested})`)
    .join(', ');
};

const renderItemsTooltip = (lines: PurchaseOrder['lines']): React.ReactNode => {
  if (!lines || lines.length === 0) return 'No items listed.';

  return (
    <div className="space-y-1">
      {lines.map((line, index) => (
        <div key={line.id || `${line.inventoryStockId}-${index}`} className="flex gap-3">
          <span className="min-w-0 flex-1 break-words text-ivory">
            {line.itemName || 'Item'}
          </span>
          <span className="shrink-0 font-semibold text-gold">{line.quantityRequested}</span>
        </div>
      ))}
    </div>
  );
};

const purchaseOrderPriority: Partial<Record<PurchaseOrder['status'], number>> = {
  pending: 0,
  approved: 1,
  fulfilled: 2,
};

const sortPurchaseOrdersByPriority = (orders: PurchaseOrder[]): PurchaseOrder[] =>
  [...orders].sort(
    (left, right) =>
      (purchaseOrderPriority[left.status] ?? 3) - (purchaseOrderPriority[right.status] ?? 3),
  );

const PURCHASE_ORDERS_PER_PAGE = 5;

export const PurchaseOrderList: React.FC<PurchaseOrderListProps> = ({
  orders,
  statusFilter,
  loading,
  onStatusFilterChange,
  onSelectOrder,
}) => {
  const [currentPage, setCurrentPage] = React.useState(1);
  const sortedOrders = React.useMemo(() => sortPurchaseOrdersByPriority(orders), [orders]);
  const totalPages = Math.ceil(sortedOrders.length / PURCHASE_ORDERS_PER_PAGE);
  const visibleOrders = sortedOrders.slice(
    (currentPage - 1) * PURCHASE_ORDERS_PER_PAGE,
    currentPage * PURCHASE_ORDERS_PER_PAGE,
  );

  React.useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, orders.length]);

  React.useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  return (
    <section className="rounded-xl border border-white/10 bg-charcoal-light p-5">
    <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
      <div>
        <h3 className="font-bold text-ivory">Stock Requests</h3>
        <p className="mt-1 text-xs text-ivory-dim">
          Click any stock request row to view its live Order Tracker and full details.
        </p>
      </div>
      <SelectField
        label="Status filter"
        value={statusFilter}
        onChange={(event) => onStatusFilterChange(event.target.value)}
      >
        <option value="all">All statuses</option>
        <option value="draft">Draft</option>
        <option value="pending">Pending review</option>
        <option value="approved">Approved</option>
        <option value="rejected">Rejected</option>
        <option value="fulfilled">Fulfilled</option>
      </SelectField>
    </div>

    {loading ? (
      <div className="mt-5 space-y-3" aria-label="Loading stock requests">
        {[0, 1, 2].map((item) => (
          <Skeleton key={item} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    ) : orders.length === 0 ? (
      <div className="mt-5">
        <EmptyState>No stock requests match this filter.</EmptyState>
      </div>
    ) : (
      <div className="mt-5 min-h-[20rem] overflow-x-auto rounded-lg border border-white/10 bg-charcoal">
        <table className="w-full min-w-[680px] text-left text-xs">
          <thead className="border-b border-white/10 bg-charcoal text-[10px] font-semibold uppercase tracking-wider text-ivory-dim">
            <tr>
              <th className="whitespace-nowrap py-3.5 pl-4 pr-3">Stock Request ID</th>
              <th className="py-3.5 px-3">Item/s (Quantity)</th>
              <th className="py-3.5 px-3">Date</th>
              <th className="py-3.5 px-3">Time</th>
              <th className="py-3.5 px-3">Status</th>
              <th className="py-3.5 pr-4 text-right"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {visibleOrders.map((order) => {
              const itemsSummary = formatItemsSummary(order.lines);
              const dateStr = formatDate(order.createdAt);
              const timeStr = formatTime(order.createdAt);

              return (
                <tr
                  key={order.id}
                  onClick={() => onSelectOrder?.(order)}
                  className="group cursor-pointer transition-colors hover:bg-white/5 focus-visible:bg-white/5 focus-visible:outline-none"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectOrder?.(order);
                    }
                  }}
                  role="button"
                  aria-label={`View order ${order.poNumber}`}
                >
                  {/* Stock Request ID */}
                  <td className="whitespace-nowrap py-3.5 pl-4 pr-3 font-semibold text-gold group-hover:underline">
                    {order.poNumber}
                  </td>

                  {/* Item/s (Quantity) */}
                  <td className="max-w-xs py-3.5 px-3 font-medium text-ivory">
                    <Tooltip
                      title="Items & Quantities"
                      content={renderItemsTooltip(order.lines)}
                      maxWidth="max-w-sm"
                    >
                      <span className="block min-w-0 truncate">{itemsSummary}</span>
                    </Tooltip>
                  </td>

                  {/* Date */}
                  <td className="py-3.5 px-3 text-ivory-dim whitespace-nowrap">
                    {dateStr}
                  </td>

                  {/* Time */}
                  <td className="py-3.5 px-3 text-ivory-dim whitespace-nowrap">
                    {timeStr}
                  </td>

                  {/* Status */}
                  <td className="py-3.5 px-3 whitespace-nowrap">
                    <span
                      className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${
                        statusClass[order.status] || statusClass.draft
                      }`}
                    >
                      {formatPurchaseOrderStatus(order.status)}
                    </span>
                  </td>

                  {/* Arrow Indicator */}
                  <td className="py-3.5 pr-4 text-right text-ivory-dim/40 group-hover:text-gold transition-colors">
                    <ChevronRight className="inline-block h-4 w-4" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    )}

    {!loading && totalPages > 1 && (
      <nav
        className="mt-4 flex items-center justify-between gap-3 border-t border-white/10 pt-4"
        aria-label="Stock request pagination"
      >
        <p className="text-xs text-ivory-dim" aria-live="polite">
          Page {currentPage} of {totalPages}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            disabled={currentPage === 1}
            className="rounded border border-white/10 px-3 py-1.5 text-xs font-semibold text-ivory transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
            disabled={currentPage === totalPages}
            className="rounded border border-white/10 px-3 py-1.5 text-xs font-semibold text-ivory transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </nav>
    )}
  </section>
  );
};
