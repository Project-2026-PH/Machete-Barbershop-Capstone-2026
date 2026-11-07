import React from 'react';
import { ClipboardCheck, Send } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useDailyStockReport } from '../hooks/useDailyStockReport';
import { ShiftSubmissionCards } from './ShiftSubmissionCards';
import { DailyStockReportTable } from './DailyStockReportTable';
import { PageHeader } from '../../../shared/components/PageHeader';

export const DailyStockReportPanel: React.FC = () => {
  const {
    report,
    loading,
    sending,
    isMorningCountDone,
    isEveningCountDone,
    allItemsCounted,
    uncountedItemCount,
    canSendReport,
    itemStatusMap,
    flaggedItems,
    sendReport,
  } = useDailyStockReport();

  const sendTooltip = !isMorningCountDone
    ? 'Morning count must be submitted before sending to admin'
    : !isEveningCountDone
      ? 'Evening count must be submitted before sending to admin'
    : !allItemsCounted
      ? `All items need morning and evening counts (${uncountedItemCount} item${uncountedItemCount === 1 ? '' : 's'} missing)`
      : undefined;

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Stock Overview"
        title="Daily Stock Report"
        description="Morning opening and evening closing counts, recorded handouts, receipts, and current on-hand quantities."
      />

      <section className="rounded-lg border border-white/10 bg-charcoal-light p-4 sm:p-5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-gold" />
            <div>
              <h3 className="font-semibold text-ivory">Daily count summary {report && <span className="ml-2 text-sm font-normal text-gold">{report.reportDate}</span>}</h3>
              <p className="mt-1 text-xs text-ivory-dim">
                Review both shifts and item quantities before sending this report to Admin.
              </p>
            </div>
          </div>
          <div className="flex flex-col items-start sm:items-end">
            <Button
              disabled={!canSendReport}
              onClick={() => void sendReport()}
              title={sendTooltip}
            >
              <Send className="mr-2 h-4 w-4" />
              {sending ? 'Sending…' : 'Send to Admin'}
            </Button>
            {report && (!isMorningCountDone || !isEveningCountDone) && (
              <span className="mt-1 text-[11px] text-amber-400/90">
                Available once morning and evening counts are submitted.
              </span>
            )}
            {report && isMorningCountDone && isEveningCountDone && !allItemsCounted && (
              <span className="mt-1 text-[11px] text-amber-400/90">
                {uncountedItemCount} item{uncountedItemCount === 1 ? '' : 's'} missing morning or evening count.
              </span>
            )}
          </div>
        </div>

        {loading && !report && (
          <div className="mt-6 space-y-5" aria-label="Loading daily stock report" role="status">
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 2 }).map((_, index) => (
                <div key={index} className="rounded-lg border border-white/10 bg-charcoal p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-5 w-16" />
                  </div>
                  <Skeleton className="h-3 w-36" />
                </div>
              ))}
            </div>
            <div className="rounded-lg border border-white/10 bg-charcoal p-3.5 space-y-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          </div>
        )}

        {report && (
          <div className="mt-6 space-y-5">
            <ShiftSubmissionCards shifts={report.shifts} />
            <DailyStockReportTable
              items={report.items}
              itemStatusMap={itemStatusMap}
              flaggedItems={flaggedItems}
            />
          </div>
        )}
      </section>
    </section>
  );
};

export default DailyStockReportPanel;
