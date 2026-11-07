import React, { Fragment } from 'react';
import { ChevronDown } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '../../../shared/components/EmptyState';
import { formatDateTime } from '../../../shared/utils/formatting';
import type { GroupedBottleHistory } from '../consumption.types';

interface ConsumptionTableProps {
  groupedHistory: GroupedBottleHistory[];
  expandedGroup: string | null;
  loading: boolean;
  searchQuery: string;
  selectedBarberId: string;
  onToggleGroup: (key: string) => void;
}

export const ConsumptionTable: React.FC<ConsumptionTableProps> = ({
  groupedHistory,
  expandedGroup,
  loading,
  searchQuery,
  selectedBarberId,
  onToggleGroup,
}) => (
  <section className="rounded-xl border border-white/10 bg-charcoal-light p-5">
    <div className="flex items-center justify-between gap-3 mb-4">
      <h3 className="font-bold">Consumption breakdown</h3>
      <span className="text-xs text-ivory-dim">
        {groupedHistory.length} {groupedHistory.length === 1 ? 'group' : 'groups'}
      </span>
    </div>

    {loading ? (
      <div className="py-8 space-y-3" aria-label="Loading consumption records" role="status">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="rounded-lg border border-white/10 bg-charcoal p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-24" />
            </div>
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    ) : groupedHistory.length === 0 ? (
      <EmptyState>
        {searchQuery || selectedBarberId
          ? 'No consumption records matched your filter criteria.'
          : 'Returned bottles will appear here with customers served and estimated usage.'}
      </EmptyState>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-white/10 bg-charcoal text-[10px] font-semibold uppercase tracking-wider text-ivory-dim">
            <tr>
              <th className="px-3 py-3">Item / Barber</th>
              <th className="px-3 py-3">Bottles Returned</th>
              <th className="px-3 py-3">Total Customers Served</th>
              <th className="px-3 py-3">Last Returned</th>
              <th className="px-3 py-3 text-right">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {groupedHistory.map((group) => {
              const key = `${group.itemName}-${group.barberName}`;
              const isExpanded = expandedGroup === key;
              return (
                <Fragment key={key}>
                  <tr
                    className="cursor-pointer hover:bg-white/5 transition-colors"
                    onClick={() => onToggleGroup(key)}
                  >
                    <td className="px-3 py-3">
                      <p className="font-bold text-ivory">{group.itemName}</p>
                      <p className="text-xs text-ivory-dim">{group.barberName}</p>
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-block rounded bg-white/5 px-2 py-0.5 text-xs text-ivory-dim">
                        {group.returnsCount} {group.returnsCount === 1 ? 'bottle' : 'bottles'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-gold font-semibold">
                      {group.totalCustomers > 0 ? group.totalCustomers : '—'}
                    </td>
                    <td className="px-3 py-3 text-xs text-ivory-dim">
                      {formatDateTime(group.lastReturnedAt)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button
                        type="button"
                        className="text-xs text-gold hover:underline inline-flex items-center gap-1 cursor-pointer"
                      >
                        <span>{isExpanded ? 'Hide history' : 'View history'}</span>
                        <ChevronDown
                          className={`w-3.5 h-3.5 transition-transform duration-200 ${
                            isExpanded ? 'rotate-180' : ''
                          }`}
                        />
                      </button>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={5} className="p-0 border-b border-white/5 bg-charcoal">
                        <div className="px-5 py-4">
                          <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-ivory-dim">
                            Individual return logs ({group.records.length})
                          </p>
                          <table className="w-full text-left text-xs">
                            <thead className="border-b border-white/5 text-[10px] font-semibold uppercase tracking-wider text-ivory-dim">
                              <tr>
                                <th className="pb-2 pr-3 font-medium">Issued Date</th>
                                <th className="pb-2 pr-3 font-medium">Returned Date</th>
                                <th className="pb-2 pr-3 font-medium">Customers Served</th>
                                <th className="pb-2 pr-3 font-medium">Condition</th>
                                <th className="pb-2 font-medium">Notes</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                              {group.records
                                .sort(
                                  (a, b) =>
                                    new Date(b.returnedAt || 0).getTime() -
                                    new Date(a.returnedAt || 0).getTime(),
                                )
                                .map((r) => (
                                  <tr key={r.id}>
                                    <td className="py-2.5 pr-3 text-ivory-dim">
                                      {formatDateTime(r.issuedAt)}
                                    </td>
                                    <td className="py-2.5 pr-3 text-ivory-dim">
                                      {formatDateTime(r.returnedAt)}
                                    </td>
                                    <td className="py-2.5 pr-3 text-gold font-medium">
                                      {r.customersServed ?? '—'}
                                    </td>
                                    <td className="py-2.5 pr-3">
                                      <span
                                        className={`inline-block px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                                          r.returnCondition === 'empty'
                                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                            : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                        }`}
                                      >
                                        {r.returnCondition === 'empty' ? 'Empty' : 'Partially Used'}
                                      </span>
                                    </td>
                                    <td className="py-2.5 text-ivory-dim text-xs">
                                      {r.notes || '—'}
                                    </td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    )}
  </section>
);
