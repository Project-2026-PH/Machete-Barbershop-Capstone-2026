import React from 'react';
import { useBottleLifecycle } from '../hooks/useBottleLifecycle';
import { BottleIssueForm } from './BottleIssueForm';
import { ActiveBottlesTable } from './ActiveBottlesTable';
import { PageHeader } from '../../../shared/components/PageHeader';

export const LifecyclePanel: React.FC = () => {
  const {
    barbers,
    itemId,
    setItemId,
    barberId,
    setBarberId,
    notes,
    setNotes,
    loading,
    isIssuing,
    activeRecords,
    handouts,
    consumableCatalog,
    quantity,
    setQuantity,
    issue,
    completeReturn,
  } = useBottleLifecycle();

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Inventory Manager"
        title="Consumable Handouts"
        description="Record each barbering supply handed to a barber. Quantities are deducted from branch stock and included in usage history."
      />

      <BottleIssueForm
        consumableCatalog={consumableCatalog}
        barbers={barbers}
        itemId={itemId}
        barberId={barberId}
        quantity={quantity}
        notes={notes}
        isIssuing={isIssuing}
        onItemIdChange={setItemId}
        onBarberIdChange={setBarberId}
        onQuantityChange={setQuantity}
        onNotesChange={setNotes}
        onIssue={() => void issue()}
      />

      <ActiveBottlesTable
        records={activeRecords}
        loading={loading}
        onReturnBottle={(record, payload) => void completeReturn(record, payload)}
      />
      <section className="rounded-xl border border-white/10 bg-charcoal-light p-5">
        <h3 className="font-bold">Recent handouts</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-white/10 text-xs uppercase text-ivory-dim">
              <tr><th className="px-3 py-2">Item</th><th className="px-3 py-2">Quantity</th><th className="px-3 py-2">Barber</th><th className="px-3 py-2">Recorded by</th><th className="px-3 py-2">Issued at</th></tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {handouts.slice(0, 20).map((entry) => (
                <tr key={entry.id}><td className="px-3 py-2">{entry.itemName}</td><td className="px-3 py-2">{entry.quantity} {entry.unit}</td><td className="px-3 py-2">{entry.barberName}</td><td className="px-3 py-2">{entry.handedOutByName || '—'}</td><td className="px-3 py-2">{new Date(entry.handedOutAt).toLocaleString()}</td></tr>
              ))}
              {handouts.length === 0 && <tr><td className="px-3 py-4 text-ivory-dim" colSpan={5}>No handouts recorded yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
};

export default LifecyclePanel;
