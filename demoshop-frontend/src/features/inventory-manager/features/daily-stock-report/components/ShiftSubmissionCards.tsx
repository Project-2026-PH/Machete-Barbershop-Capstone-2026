import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { DailyStockReportShift } from '../stock-report.types';
import { isSubmittedShiftStatus } from '../stock-report.rules';

interface ShiftSubmissionCardsProps {
  shifts: DailyStockReportShift[];
}

const shiftList: Array<{ shift: 'morning' | 'afternoon' | 'evening'; label: string }> = [
  { shift: 'morning', label: 'Morning (Opening)' },
  { shift: 'afternoon', label: 'Afternoon (Midday)' },
  { shift: 'evening', label: 'Evening (Closing)' },
];

export const ShiftSubmissionCards: React.FC<ShiftSubmissionCardsProps> = ({ shifts }) => (
  <div className="grid gap-3 sm:grid-cols-3">
    {shiftList.map(({ shift, label }) => {
      const shiftData = shifts.find((s) => s.shift === shift);
      const isDone = isSubmittedShiftStatus(shiftData?.status);

      return (
        <div
          key={shift}
          className="rounded-lg border border-white/10 bg-charcoal p-3.5 text-xs"
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold uppercase tracking-wider text-ivory">{label}</p>
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                isDone
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                  : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
              }`}
            >
              {isDone ? (
                <>
                  <CheckCircle2 className="h-3 w-3" />
                  Submitted
                </>
              ) : (
                'Not submitted'
              )}
            </span>
          </div>
          <p className="mt-2.5 text-ivory-dim">
            {isDone && shiftData?.submittedByName
              ? `Submitted by ${shiftData.submittedByName}`
              : isDone
                ? 'Count submitted'
                : 'Pending count submission'}
          </p>
        </div>
      );
    })}
  </div>
);
