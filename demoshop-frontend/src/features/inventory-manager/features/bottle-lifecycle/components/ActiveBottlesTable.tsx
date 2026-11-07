import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/feedback/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '../../../shared/components/EmptyState';
import { formatDateTime } from '../../../shared/utils/formatting';
import type { BottleLifecycle } from '../lifecycle.types';
import type { BottleReturnPayload } from '../lifecycle.service';

interface ActiveBottlesTableProps {
  records: BottleLifecycle[];
  loading: boolean;
  onReturnBottle: (record: BottleLifecycle, payload: BottleReturnPayload) => Promise<void> | void;
}

export const ActiveBottlesTable: React.FC<ActiveBottlesTableProps> = ({
  records,
  loading,
  onReturnBottle,
}) => {
  const [returningRecord, setReturningRecord] = useState<BottleLifecycle | null>(null);
  const [returnCondition, setReturnCondition] = useState<'empty' | 'partially_used'>('empty');
  const [remainingPercent, setRemainingPercent] = useState<number>(50);
  const [returnNotes, setReturnNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleOpenReturnModal = (record: BottleLifecycle) => {
    setReturningRecord(record);
    setReturnCondition('empty');
    setRemainingPercent(0);
    setReturnNotes('');
  };

  const handleConfirmReturn = async () => {
    if (!returningRecord || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onReturnBottle(returningRecord, {
        returnCondition,
        estimatedRemainingPercent: returnCondition === 'partially_used' ? remainingPercent : 0,
        notes: returnNotes.trim() || undefined,
      });
      setReturningRecord(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="rounded-xl border border-white/10 bg-charcoal-light p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-bold">Active issuances</h3>
          <p className="mt-1 text-xs text-ivory-dim">
            An item/barber pair can have only one active issuance at a time.
          </p>
        </div>
        <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-xs text-amber-300">
          {records.length} active
        </span>
      </div>

      {loading ? (
        <div className="mt-5 space-y-3" aria-label="Loading lifecycle records" role="status">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="rounded-lg border border-white/10 bg-charcoal p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-44" />
                <Skeleton className="h-5 w-20" />
              </div>
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : records.length === 0 ? (
        <div className="mt-5">
          <EmptyState>No active bottle issuances.</EmptyState>
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="border-b border-white/10 bg-charcoal text-[10px] font-semibold uppercase tracking-wider text-ivory-dim">
              <tr>
                <th className="px-3 py-3">Item</th>
                <th className="px-3 py-3">Barber</th>
                <th className="px-3 py-3">Quantity</th>
                <th className="px-3 py-3">Customers at issue</th>
                <th className="px-3 py-3">Issued</th>
                <th className="px-3 py-3">Notes</th>
                <th className="px-3 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {records.map((record) => (
                <tr key={record.id}>
                  <td className="px-3 py-3 font-bold">
                    {record.itemName}{' '}
                    <span className="text-xs font-normal text-ivory-dim">
                      ({record.unit})
                    </span>
                  </td>
                  <td className="px-3 py-3">{record.barberName}</td>
                  <td className="px-3 py-3">{record.quantity} {record.unit}</td>
                  <td className="px-3 py-3 text-gold">{record.issuedAtCustomerCount}</td>
                  <td className="px-3 py-3 text-xs text-ivory-dim">
                    {formatDateTime(record.issuedAt)}
                  </td>
                  <td className="px-3 py-3 text-xs text-ivory-dim">
                    {record.notes || '—'}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Button
                      variant="outline"
                      className="min-h-11 px-3 py-2 text-xs font-semibold hover:border-gold hover:text-gold"
                      onClick={() => handleOpenReturnModal(record)}
                    >
                      Log return
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Bottle Return Modal */}
      <Modal
        isOpen={Boolean(returningRecord)}
        onClose={() => !isSubmitting && setReturningRecord(null)}
        title="Log Bottle Return"
        size="md"
        footer={
          <>
            <Button
              variant="outline"
              disabled={isSubmitting}
              onClick={() => setReturningRecord(null)}
              className="min-h-11"
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={isSubmitting}
              onClick={() => void handleConfirmReturn()}
              className="min-h-11"
            >
              {isSubmitting ? 'Logging Return…' : 'Confirm Return'}
            </Button>
          </>
        }
      >
        {returningRecord && (
          <div className="space-y-4 text-sm text-ivory">
            <div className="rounded-lg border border-white/10 bg-charcoal p-3 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-ivory-dim">Item:</span>
                <span className="font-semibold text-ivory">{returningRecord.itemName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ivory-dim">Barber:</span>
                <span className="font-semibold text-gold">{returningRecord.barberName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ivory-dim">Issued At:</span>
                <span className="text-ivory">{formatDateTime(returningRecord.issuedAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ivory-dim">Snapshot at Issue:</span>
                <span className="font-mono text-gold">{returningRecord.issuedAtCustomerCount} customers</span>
              </div>
            </div>

            <div className="rounded-lg border border-gold/20 bg-gold/5 p-3 text-xs text-ivory-dim space-y-1">
              <p className="font-semibold text-gold">Automatic Customer Calculation</p>
              <p>
                The barber&apos;s current cumulative completed/paid customer count will be automatically snapshotted upon return. The net customers served (<span className="text-ivory font-mono">returned_total - issued_total</span>) will be computed and saved without mutating bulk inventory.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-ivory-dim mb-2">
                Return Condition <span className="text-red-400">*</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setReturnCondition('empty');
                    setRemainingPercent(0);
                  }}
                  className={`min-h-11 rounded-lg border p-3 text-left transition cursor-pointer ${
                    returnCondition === 'empty'
                      ? 'border-gold bg-gold/15 text-gold'
                      : 'border-white/10 bg-charcoal text-ivory-dim hover:text-ivory'
                  }`}
                >
                  <div className="font-bold text-xs uppercase tracking-wider">Empty</div>
                  <div className="mt-1 text-[11px] opacity-80">Bottle was fully consumed (0% left)</div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setReturnCondition('partially_used');
                    if (remainingPercent <= 0) setRemainingPercent(50);
                  }}
                  className={`min-h-11 rounded-lg border p-3 text-left transition cursor-pointer ${
                    returnCondition === 'partially_used'
                      ? 'border-gold bg-gold/15 text-gold'
                      : 'border-white/10 bg-charcoal text-ivory-dim hover:text-ivory'
                  }`}
                >
                  <div className="font-bold text-xs uppercase tracking-wider">Partially Used</div>
                  <div className="mt-1 text-[11px] opacity-80">Returned with remaining product</div>
                </button>
              </div>
            </div>

            {returnCondition === 'partially_used' && (
              <div className="space-y-2 rounded-lg border border-white/10 bg-charcoal p-3">
                <div className="flex justify-between text-xs">
                  <span className="font-semibold text-ivory">Estimated Remaining Volume:</span>
                  <span className="font-mono font-bold text-gold">{remainingPercent}%</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={99}
                  step={1}
                  value={remainingPercent}
                  onChange={(e) => setRemainingPercent(Number(e.target.value))}
                  className="w-full accent-gold h-2 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-ivory-dim">
                  <span>Nearly Empty (1%)</span>
                  <span>Half Full (50%)</span>
                  <span>Almost Full (99%)</span>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-ivory-dim mb-1">
                Return Notes (Optional)
              </label>
              <textarea
                rows={2}
                value={returnNotes}
                onChange={(e) => setReturnNotes(e.target.value)}
                placeholder="Condition notes, reason for early return, or station observations..."
                className="w-full rounded border border-white/10 bg-charcoal px-3 py-2 text-xs text-ivory placeholder-ivory-dim/50 focus:border-gold/60 focus:outline-none"
              />
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
};
