import React, { useEffect, useRef } from 'react';
import { Users } from 'lucide-react';
import { isActiveCustomerQueueEntry } from '../services/customer-queue-state';

const STATUS_LABELS: Record<string, string> = {
    pending: 'Awaiting review', accepted: 'Confirmed', confirmed: 'Confirmed',
    late: 'Late arrival', waiting: 'Waiting', serving: 'In chair',
    completed: 'Completed', done: 'Completed', cancelled: 'Cancelled',
    declined: 'Declined', expired: 'Expired', no_show: 'No-show',
};
export const guestQueueStatusLabel = (status: string): string => STATUS_LABELS[status] || status;

interface GroupQueueGuest {
    id: string | number;
    name: string;
    reference: string;
    status: string;
    serviceTitle: string;
    barber: { name?: string } | null;
}

export const GroupQueueCards: React.FC<{
    guests: GroupQueueGuest[];
    selectedId: string | number;
    onSelect: (id: string) => void;
}> = ({ guests, selectedId, onSelect }) => {
    const stripRef = useRef<HTMLDivElement>(null);
    const selectedRef = useRef<HTMLButtonElement>(null);

    // Reveal the selected guest within the strip without moving the page.
    useEffect(() => {
        const strip = stripRef.current;
        const card = selectedRef.current;
        if (!strip || !card || strip.scrollWidth <= strip.clientWidth) return;
        const stripBounds = strip.getBoundingClientRect();
        const cardBounds = card.getBoundingClientRect();
        if (cardBounds.left < stripBounds.left) {
            strip.scrollLeft += cardBounds.left - stripBounds.left;
        } else if (cardBounds.right > stripBounds.right) {
            strip.scrollLeft += cardBounds.right - stripBounds.right;
        }
    }, [selectedId]);

    return (
    <section aria-label="Group guest queues" className="min-w-0 space-y-2 lg:space-y-3">
        <div className="flex items-center justify-between gap-2 lg:block">
            <h3 className="flex items-center gap-1.5 text-xs font-bold text-gold lg:gap-2 lg:text-sm">
                <Users className="h-4 w-4" /> Your group's queues
            </h3>
            <span className="shrink-0 text-[10px] text-ivory-dim lg:hidden">Select guest</span>
            <p className="mt-1 hidden text-xs text-ivory-dim lg:block">Select a guest to view their timer and barber's lineup.</p>
        </div>
        <div ref={stripRef} className="relative grid auto-cols-[calc((100%_-_1rem)/3)] grid-flow-col snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain pb-1 lg:grid-flow-row lg:auto-cols-auto lg:grid-cols-3 lg:gap-3 lg:overflow-visible lg:pb-0">
            {guests.map(guest => {
                const selected = String(guest.id) === String(selectedId);
                const active = isActiveCustomerQueueEntry(guest);
                return (
                    <button
                        key={guest.id}
                        ref={selected ? selectedRef : undefined}
                        type="button"
                        aria-pressed={selected}
                        aria-label={`${guest.name}, ${guest.reference}, ${guestQueueStatusLabel(guest.status)}`}
                        disabled={!active}
                        onClick={() => onSelect(String(guest.id))}
                        className={`min-w-0 snap-start rounded-sm border p-2 text-left transition-colors lg:p-4 ${selected
                            ? 'border-gold bg-gold/10'
                            : 'border-white/10 bg-white/[0.03] enabled:hover:border-gold/50'} ${active ? 'cursor-pointer' : 'cursor-default'}`}
                    >
                        <div className="flex items-center justify-between gap-1.5 lg:flex-wrap lg:gap-2">
                            <span className="min-w-0 truncate text-[10px] font-semibold text-ivory lg:hidden">{guest.name.replace(/^Guest\s*(\d+)/i, 'G$1')}</span>
                            <span className="hidden min-w-0 text-xs font-semibold text-ivory lg:block">{guest.name}</span>
                            <span className={`shrink-0 rounded-full px-1 py-0.5 text-[8px] font-semibold lg:px-2 lg:text-[10px] ${guest.status === 'serving'
                                ? 'bg-gold/15 text-gold' : guest.status === 'completed'
                                    ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/5 text-ivory-dim'}`}>
                                <span className="lg:hidden">{guest.status === 'serving' ? 'Chair' : guest.status === 'pending' ? 'Review' : guestQueueStatusLabel(guest.status)}</span>
                                <span className="hidden lg:inline">{guestQueueStatusLabel(guest.status)}</span>
                            </span>
                        </div>
                        <p className="mt-1.5 font-mono text-[11px] font-bold text-gold lg:mt-3 lg:text-lg">{guest.reference}</p>
                        <p className="mt-1 truncate text-[10px] text-ivory lg:mt-2 lg:text-xs" title={guest.barber?.name}>{guest.barber?.name || 'Assigned barber'}</p>
                        <p className="mt-1 hidden text-xs text-ivory-dim lg:block">{guest.serviceTitle}</p>
                        <p className="mt-3 hidden text-[10px] font-semibold uppercase tracking-wider text-gold lg:block">
                            {selected ? 'Viewing this guest' : active ? 'View queue' : 'Queue closed'}
                        </p>
                    </button>
                );
            })}
        </div>
    </section>
    );
};
