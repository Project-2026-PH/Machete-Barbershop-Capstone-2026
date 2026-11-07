import React from 'react';
import { Search } from 'lucide-react';
import type { DailyStockReportItem, StockStatus } from '../stock-report.types';
import type { FlaggedItem } from '../hooks/useDailyStockReport';

interface DailyStockReportTableProps {
  items: DailyStockReportItem[];
  itemStatusMap: Map<string, StockStatus>;
  flaggedItems: FlaggedItem[];
}

export const DailyStockReportTable: React.FC<DailyStockReportTableProps> = ({
  items,
  itemStatusMap,
}) => {
  const [searchTerm, setSearchTerm] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const filteredItems = items.filter((item) => item.itemName.toLowerCase().includes(searchTerm.trim().toLowerCase()) && (statusFilter === 'all' || (itemStatusMap.get(item.inventoryStockId)?.tone || 'normal') === statusFilter));
  return (
  <div className="space-y-5">
    <div className="flex flex-wrap items-end gap-3 rounded-sm border border-white/10 bg-charcoal p-3">
      <label className="w-full sm:w-64"><span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gold">Search report</span><span className="relative block"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ivory-dim" /><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search item name..." className="h-9 w-full rounded-sm border border-white/10 bg-charcoal-light pl-8 pr-3 text-xs text-ivory focus:outline-none focus:ring-1 focus:ring-gold" /></span></label>
      <label className="w-full sm:w-48"><span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gold">Report status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-9 w-full rounded-sm border border-white/10 bg-charcoal-light px-3 text-xs text-ivory focus:outline-none focus:ring-1 focus:ring-gold"><option value="all">All statuses</option><option value="danger">Ran out</option><option value="warning">Not counted</option><option value="info">Usage logged</option><option value="normal">Normal</option></select></label>
      <span aria-live="polite" className="pb-2 text-xs text-ivory-dim">{filteredItems.length} of {items.length} items</span>
      {(searchTerm || statusFilter !== 'all') && <button type="button" onClick={() => { setSearchTerm(''); setStatusFilter('all'); }} className="min-h-9 rounded-sm px-2 text-xs font-semibold text-gold hover:bg-gold/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold">Clear filters</button>}
    </div>
    <p className="text-xs text-ivory-dim">Morning, midday, and evening values are physical counts. Recorded usage comes from logged handouts. A dash means no count was submitted.</p>
    {/* Consolidated Stock Table */}
    <div className="max-h-[32rem] overflow-auto rounded-lg border border-white/10 bg-charcoal-light">
      <table className="w-full min-w-[760px] text-left text-sm">
        <caption className="sr-only">Daily stock quantities and report statuses</caption>
        <thead className="sticky top-0 z-10 border-b border-white/15 bg-charcoal text-xs font-semibold text-ivory-dim">
          <tr>
            <th className="py-3 px-3">Item</th>
            <th className="py-3 px-3">Status</th>
            <th className="py-3 px-3 text-right">Morning count</th>
            <th className="py-3 px-3 text-right">Midday count</th>
            <th className="py-3 px-3 text-right">Evening count</th>
            <th className="py-3 px-3 text-right">Stock on hand</th>
            <th className="py-3 px-3 text-right text-gold">Recorded usage</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {filteredItems.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-ivory-dim">{items.length ? 'No items match these filters.' : 'No stock items available for this report.'}</td></tr>}
          {filteredItems.map((item) => {
            const status = itemStatusMap.get(item.inventoryStockId) || {
              label: 'Normal',
              tone: 'normal',
              message: `${item.itemName} — normal`,
            };

            const statusBadgeClass =
              status.tone === 'danger'
                ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                : status.tone === 'warning'
                  ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                  : status.tone === 'info'
                    ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                    : 'bg-white/5 text-ivory-dim border border-white/10';

            return (
              <tr
                key={item.inventoryStockId}
                className={`transition-colors hover:bg-white/[0.02] ${status.tone === 'danger'
                    ? 'bg-rose-500/[0.02]'
                    : status.tone === 'warning'
                      ? 'bg-amber-500/[0.02]'
                      : ''
                  }`}
              >
                <td className="py-2.5 px-3 font-medium text-ivory">
                  {item.itemName} <span className="text-ivory-dim text-[11px]">({item.unit})</span>
                </td>
                <td className="py-2.5 px-3">
                  <span
                    title={status.message}
                    className={`inline-block whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-medium ${statusBadgeClass}`}
                  >
                    {status.label}
                  </span>
                </td>
                <td className="py-3.5 px-3 text-right tabular-nums text-ivory">{item.openingQuantity ?? '—'}</td>
                <td className="py-3.5 px-3 text-right tabular-nums text-ivory">{item.midDayQuantity ?? '—'}</td>
                <td className="py-3.5 px-3 text-right tabular-nums text-ivory">{item.closingQuantity ?? '—'}</td>
                <td className="py-3.5 px-3 text-right tabular-nums text-ivory">{Math.round(item.currentStock)}</td>
                <td className="py-3.5 px-3 text-right tabular-nums font-semibold text-gold">
                  {item.loggedUsage}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </div>
);
};
