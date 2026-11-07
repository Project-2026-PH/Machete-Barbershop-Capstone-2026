import React from 'react';
import { ArrowUpRight, Clock, Scissors, Receipt } from 'lucide-react';
import type { OverviewTransaction } from '../../context/OverviewDataContext';
import { formatServiceTitle } from '../../utils/reservation-slots';

interface RecentActivitySectionProps {
  transactions: OverviewTransaction[];
  loading?: boolean;
  onViewAll: () => void;
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 2,
  }).format(amount);

const serviceLabel = (service: string) => formatServiceTitle(service)
  .replace(/\bHair Cut\b/g, 'Haircut').replace(/\bw\/\s*/g, 'with ');

const formatTransactionTime = (createdAt: string) => {
  try {
    return new Intl.DateTimeFormat('en-PH', {
      timeZone: 'Asia/Manila',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(createdAt));
  } catch {
    return 'Recent';
  }
};

export const RecentActivitySection: React.FC<RecentActivitySectionProps> = ({
  transactions,
  loading = false,
  onViewAll,
}) => {
  const latestTransactions = transactions;

  return (
    <section
      aria-labelledby="recent-activity-heading"
      className="min-w-0 rounded-sm border border-white/10 bg-white/5 p-4 sm:p-5 card-gold-accent flex flex-col"
    >
      {/* Header with View All action */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-4 mb-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gold">Cashier • Transactions</p>
          <h2 id="recent-activity-heading" className="mt-1 text-lg sm:text-xl font-serif font-bold text-ivory">
            Recent Activity
          </h2>
          <p className="text-[11px] text-ivory-dim mt-0.5">Today&apos;s register &amp; POS checkouts</p>
        </div>

        <button
          type="button"
          onClick={onViewAll}
          className="group inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-ivory-dim hover:text-gold transition-colors py-2 px-3 rounded-sm border border-white/10 hover:border-gold/30 bg-charcoal/50 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold"
        >
          <span>View All Transactions</span>
          <ArrowUpRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </button>

      </div>

      {loading && latestTransactions.length === 0 ? (
        <div className="space-y-2" aria-label="Loading latest transactions" role="status">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="flex items-center justify-between rounded-sm border border-white/5 bg-charcoal/40 p-2.5 animate-pulse"
            >
              <div className="min-w-0 flex-1 space-y-2 pr-6">
                <div className="h-3 w-2/5 rounded-sm bg-white/10" />
                <div className="h-2.5 w-3/5 rounded-sm bg-white/[0.06]" />
              </div>
              <div className="flex w-16 shrink-0 flex-col items-end gap-2">
                <div className="h-3 w-14 rounded-sm bg-gold/20" />
                <div className="h-2.5 w-11 rounded-sm bg-white/[0.06]" />
              </div>
            </div>
          ))}
          <span className="sr-only">Loading latest transactions…</span>
        </div>
      ) : latestTransactions.length === 0 ? (
        <div className="flex min-h-52 flex-1 flex-col items-center justify-center rounded-sm border border-dashed border-white/10 bg-white/[0.015] px-4 py-10 text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5 text-gold/60"><Receipt className="h-6 w-6" aria-hidden="true" /></span>
          <p className="text-sm font-semibold text-ivory">No transactions recorded yet today</p>
          <p className="mt-1 max-w-xs text-xs text-ivory-dim">Today&apos;s register and POS checkouts will appear here.</p>
        </div>
      ) : (
        <div
          className="divide-y divide-white/5"
          role="region"
          aria-label="Today’s transactions"
        >
          {latestTransactions.map((tx) => (
            <div
              key={tx.id}
              className="flex items-start justify-between gap-2.5 py-2.5 first:pt-0 last:pb-0 transition-colors hover:bg-white/[0.02]"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-xs text-ivory break-words">{tx.customer || 'Walk-in Customer'}</p>
                  {tx.service === 'Reservation Fee' && (
                    <span className="inline-flex items-center rounded-sm border border-gold/30 bg-gold/10 px-1 py-0.2 text-[9px] font-semibold text-gold shrink-0">
                      Fee
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-ivory-dim">
                  <span className="break-words">{serviceLabel(tx.service)}</span>
                  {tx.barber && <span className="inline-flex max-w-full items-center gap-1 rounded-sm border border-gold/20 bg-gold/[0.07] px-1.5 py-0.5 text-[10px] font-medium text-gold" title={`Barber: ${tx.barber}`}>
                    <Scissors className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                    <span className="break-words">{tx.barber}</span>
                  </span>}
                </div>
              </div>

              <div className="flex max-w-[40%] shrink-0 flex-col items-end text-right">
                <p className="font-sans text-sm font-semibold tracking-normal text-gold tabular-nums">{formatCurrency(tx.amount)}</p>
                <div className="mt-1 flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-[10px] text-ivory-dim">
                  <span className="font-medium">{tx.payment_method || 'Not recorded'}</span>
                  <span className="inline-flex items-center gap-1"><Clock className="h-2.5 w-2.5" aria-hidden="true" />{formatTransactionTime(tx.created_at)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export default RecentActivitySection;
