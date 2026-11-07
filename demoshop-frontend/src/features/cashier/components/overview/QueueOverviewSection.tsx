import React, { useMemo } from 'react';
import { useNavigate } from 'react-router';
import {
  Users,
  Scissors,
  Clock,
  CalendarDays,
  Timer,
  AlertCircle,
  ArrowUpRight,
  ChevronRight,
} from 'lucide-react';
import { isCustomerAwaitingArrival, type CustomerInfo, type BarberInfo } from '../queue/types';

interface QueueOverviewSectionProps {
  queue: CustomerInfo[];
  barbers: BarberInfo[];
  onSelectClient: (customer: CustomerInfo, barberName?: string) => void;
  loading?: boolean;
}

export const QueueOverviewSection: React.FC<QueueOverviewSectionProps> = ({
  queue,
  barbers,
  onSelectClient,
  loading = false,
}) => {
  const navigate = useNavigate();

  // Active non-terminal queue entries directly from the shared queue state
  const activeEntries = useMemo(() => {
    return queue.filter((c) => {
      const s = c.status;
      if (s === 'no_show' || s === 'cancelled' || s === 'expired' || s === 'noshow') {
        return false;
      }
      if (s === 'completed' && c.paid) {
        return false;
      }
      return true;
    });
  }, [queue]);

  // Clients currently in service / chair
  const inServiceClients = useMemo(() => {
    return activeEntries.filter((c) => c.status === 'serving');
  }, [activeEntries]);

  // Clients waiting in line (ordered by arrival time or sequence)
  const waitingClients = useMemo(() => {
    return activeEntries
      .filter((c) => c.status !== 'serving' && c.status !== 'completed')
      .sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        if (timeA && timeB && timeA !== timeB) return timeA - timeB;
        return queue.indexOf(a) - queue.indexOf(b);
      });
  }, [activeEntries, queue]);

  const nextUpClient = waitingClients[0] || null;
  const otherWaitingClients = waitingClients.slice(1);

  // Helper to get barber name from barberId
  const getBarberName = (barberId: string) => {
    const b = barbers.find((item) => String(item.id) === String(barberId));
    return b?.name || 'Any Barber';
  };

  const getBarberColor = (barberId: string) => {
    const b = barbers.find((item) => String(item.id) === String(barberId));
    return b?.color || '#D4AF37';
  };

  // Compute elapsed & remaining ONLY if the system has reliable timer data
  const getServiceTiming = (customer: CustomerInfo) => {
    const startTime = customer.serviceStartedAt || customer.timerStartedAt;
    const estDuration = Number(customer.estMinutes) || 30;

    if (!startTime) {
      return {
        hasReliableTimer: false,
        elapsedMinutes: 0,
        remainingMinutes: estDuration,
        isNearlyFinished: false,
        estDuration,
      };
    }

    const startMs = new Date(startTime).getTime();
    if (isNaN(startMs) || startMs <= 0) {
      return {
        hasReliableTimer: false,
        elapsedMinutes: 0,
        remainingMinutes: estDuration,
        isNearlyFinished: false,
        estDuration,
      };
    }

    const elapsedMinutes = Math.max(0, Math.floor((Date.now() - startMs) / 60_000));
    const remainingMinutes = Math.max(0, estDuration - elapsedMinutes);
    const isNearlyFinished = remainingMinutes <= 10 || elapsedMinutes >= Math.max(5, estDuration - 5);

    return {
      hasReliableTimer: true,
      elapsedMinutes,
      remainingMinutes,
      isNearlyFinished,
      estDuration,
    };
  };

  // Count nearly finished chairs only from reliable data
  const nearlyFinishedCount = useMemo(() => {
    return inServiceClients.filter((c) => getServiceTiming(c).isNearlyFinished).length;
  }, [inServiceClients]);

  return (
    <section
      aria-labelledby="queue-overview-heading"
      className="rounded-sm border border-white/10 bg-white/5 p-4 sm:p-5 card-gold-accent flex flex-col gap-4"
    >
      {/* Header & Quick Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-3">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 id="queue-overview-heading" className="text-sm font-bold uppercase tracking-widest text-gold flex items-center gap-2">
                <span>Queue Overview</span>
              </h2>
              <span className="relative flex h-2 w-2" title="Live synchronized queue">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            </div>
          </div>
        </div>

        {/* Live Synchronized Counters & Quick Navigation */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-[11px] bg-charcoal px-2.5 py-1 rounded-sm border border-white/10">
            <Scissors className="w-3 h-3 text-gold" />
            <span className="text-ivory-dim">Serving:</span>
            <span className="font-bold text-gold">{inServiceClients.length}</span>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] bg-charcoal px-2.5 py-1 rounded-sm border border-white/10">
            <Users className="w-3 h-3 text-ivory-dim" />
            <span className="text-ivory-dim">Waiting:</span>
            <span className="font-bold text-ivory">{waitingClients.length}</span>
          </div>
          {nearlyFinishedCount > 0 && (
            <div className="flex items-center gap-1.5 text-[11px] bg-amber-500/15 border border-amber-500/30 text-amber-300 px-2.5 py-1 rounded-sm animate-pulse">
              <AlertCircle className="w-3 h-3 text-amber-400" />
              <span>Nearly Done: <strong>{nearlyFinishedCount}</strong></span>
            </div>
          )}

          <button
            type="button"
            onClick={() => navigate('/cashier/pos')}
            className="text-xs bg-gold/15 hover:bg-gold/25 text-gold border border-gold/40 px-3 py-1 rounded-sm font-semibold transition-colors cursor-pointer flex items-center gap-1"
            title="Open Cashier POS terminal"
          >
            <span>P.O.S</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => navigate('/cashier/queue')}
            className="text-xs bg-white/5 hover:bg-white/10 text-ivory border border-white/10 px-3 py-1 rounded-sm font-medium transition-colors cursor-pointer flex items-center gap-1"
            title="Open Reservations and Full Queue Board"
          >
            <span>Reservation</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Spotlight: Who Is Next? */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-ivory-dim mb-2 flex items-center gap-1.5">
          <span>Next in Line</span>
        </p>

        {loading ? (
          <div className="rounded-sm border border-dashed border-white/10 bg-white/[0.02] p-4 text-center">
            <p className="text-xs text-ivory-dim animate-pulse">Loading queue…</p>
          </div>
        ) : nextUpClient ? (
          <div
            role="button"
            tabIndex={0}
            onClick={() => onSelectClient(nextUpClient, getBarberName(nextUpClient.barberId))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectClient(nextUpClient, getBarberName(nextUpClient.barberId));
              }
            }}
            className="group cursor-pointer rounded-sm border-2 border-gold/40 bg-gradient-to-r from-gold/[0.12] via-gold/[0.04] to-transparent p-3.5 sm:p-4 transition-all hover:border-gold hover:bg-gold/[0.14] focus:outline-none focus:ring-2 focus:ring-gold/50"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gold text-charcoal font-bold font-serif flex items-center justify-center text-sm shadow-md">
                  #1
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-ivory group-hover:text-gold transition-colors">
                      {nextUpClient.name || 'Walk-in Client'}
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gold text-charcoal uppercase tracking-wider">
                      Next Up
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ivory-dim mt-1">
                    <span className="text-ivory font-medium">{nextUpClient.service || 'Haircut'}</span>
                    <span>·</span>
                    <span>Barber: <strong className="text-gold">{getBarberName(nextUpClient.barberId)}</strong></span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-3 border-t sm:border-t-0 border-white/5 pt-2 sm:pt-0">
                <div className="flex items-center gap-1.5 text-xs text-ivory-dim bg-charcoal/60 px-2.5 py-1 rounded-sm border border-white/5">
                  {isCustomerAwaitingArrival(nextUpClient) ? (
                    <CalendarDays className="w-3.5 h-3.5 text-sky-400" />
                  ) : (
                    <Clock className="w-3.5 h-3.5 text-gold" />
                  )}
                  <span>
                    {isCustomerAwaitingArrival(nextUpClient)
                      ? 'Awaiting Arrival'
                      : `Waiting ${nextUpClient.waitMin ? `${nextUpClient.waitMin}m` : 'In line'}`}
                  </span>
                </div>
                <span className="text-xs font-semibold text-gold group-hover:underline flex items-center gap-1">
                  <span>Details</span>
                  <ChevronRight className="w-4 h-4" />
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-sm border border-dashed border-white/10 bg-white/[0.02] p-4 text-center">
            <p className="text-xs text-ivory font-medium">Waiting line is clear</p>
            <p className="text-[11px] text-ivory-dim mt-0.5">No customers currently waiting for barber. Ready for new walk-ins.</p>
          </div>
        )}
      </div>

      {/* Current In-Service Clients (Chairs) */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-ivory-dim flex items-center gap-1.5">
            <span>Customers currently being served. ({inServiceClients.length})</span>
          </p>
          {inServiceClients.length > 0 && (
            <span className="text-[11px] text-ivory-dim">Click card for service timing</span>
          )}
        </div>

        {inServiceClients.length === 0 ? (
          <div className="rounded-sm border border-dashed border-white/10 bg-white/[0.02] p-4 text-center">
            <p className="text-xs text-ivory-dim">No customers currently being served.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {inServiceClients.map((client) => {
              const timing = getServiceTiming(client);
              const barberName = getBarberName(client.barberId);
              const barberColor = getBarberColor(client.barberId);

              return (
                <div
                  key={client.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectClient(client, barberName)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectClient(client, barberName);
                    }
                  }}
                  className={`group cursor-pointer rounded-sm border p-3.5 transition-all focus:outline-none focus:ring-2 focus:ring-gold/50 ${
                    timing.isNearlyFinished
                      ? 'border-amber-500/50 bg-amber-500/[0.07] hover:border-amber-400'
                      : 'border-white/10 bg-charcoal/70 hover:border-gold/40 hover:bg-gold/[0.04]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: barberColor }}
                      />
                      <span className="text-xs font-bold text-gold truncate">
                        {barberName}
                      </span>
                    </div>

                    {timing.isNearlyFinished ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse shrink-0">
                        ⚡ Nearly Finished
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-gold/10 text-gold border border-gold/20 shrink-0">
                        Serving
                      </span>
                    )}
                  </div>

                  <p className="text-sm font-bold text-ivory group-hover:text-gold transition-colors truncate">
                    {client.name || 'Walk-in Client'}
                  </p>
                  <p className="text-xs text-ivory-dim truncate mt-0.5">
                    {client.service || 'Haircut'}
                  </p>

                  <div className="mt-2.5 pt-2 border-t border-white/5 flex items-center justify-between text-[11px]">
                    {timing.hasReliableTimer ? (
                      <>
                        <span className="text-ivory-dim flex items-center gap-1">
                          <Timer className="w-3 h-3 text-gold/70" />
                          {timing.elapsedMinutes}m elapsed
                        </span>
                        <span className={`font-semibold ${timing.isNearlyFinished ? 'text-amber-300' : 'text-ivory-dim'}`}>
                          {timing.remainingMinutes > 0 ? `~${timing.remainingMinutes}m left` : 'Wrapping up'}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-ivory-dim">In Progress</span>
                        <span className="text-ivory-dim font-medium">Est. {timing.estDuration}m</span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Subsequent Waiting Line (Position #2+) */}
      {otherWaitingClients.length > 0 && (
        <div className="border-t border-white/5 pt-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-ivory-dim mb-2">
            Other Waiting Clients ({otherWaitingClients.length})
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {otherWaitingClients.map((client, index) => {
              const pos = index + 2;
              const barberName = getBarberName(client.barberId);

              return (
                <div
                  key={client.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectClient(client, barberName)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectClient(client, barberName);
                    }
                  }}
                  className="cursor-pointer rounded-sm border border-white/5 bg-charcoal/40 hover:border-gold/30 hover:bg-gold/[0.02] p-2.5 flex items-center justify-between text-xs transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                    <span className="w-5 h-5 rounded-full bg-white/10 text-ivory-dim text-[10px] font-bold flex items-center justify-center shrink-0">
                      #{pos}
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-ivory truncate">{client.name}</p>
                      <p className="text-[11px] text-ivory-dim truncate">
                        {client.service} · <span className="text-gold">{barberName}</span>
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] text-ivory-dim shrink-0">
                    {isCustomerAwaitingArrival(client)
                      ? 'Awaiting Arrival'
                      : client.waitMin ? `${client.waitMin}m wait` : 'Waiting'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
};

export default QueueOverviewSection;
