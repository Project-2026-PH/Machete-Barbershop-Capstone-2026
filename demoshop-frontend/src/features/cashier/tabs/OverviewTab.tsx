import React, { useCallback, useEffect, useState } from 'react';
import { Clock, ArrowUpRight, Banknote, Wallet, Users } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/components/auth/AuthContext';
import { useToast } from '@/components/feedback/ToastContext';
import { OverviewDataProvider, useOverviewData } from '../context/OverviewDataContext';
import { useQueueData } from '../context/QueueDataContext';
import type { CustomerInfo } from '../components/queue/types';
import { RecentActivitySection } from '../components/overview/RecentActivitySection';
import { BarberStatusSection } from '../components/overview/BarberStatusSection';
import { ClientDetailModal } from '../components/overview/ClientDetailModal';

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 2,
  }).format(amount);

const DashboardSkeleton: React.FC = () => (
  <div className="space-y-6" aria-label="Loading cashier operations dashboard" aria-busy="true">
    <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-4">
      <div>
        <p className="text-[11px] uppercase tracking-[0.15em] text-ivory-dim">Floor Operations</p>
        <h1 className="text-2xl font-bold font-serif text-ivory">Dashboard</h1>
      </div>
      <Skeleton variant="text" className="w-40 h-4" />
    </header>

    {/* Top: 3 Compact Summary Cards */}
    <section aria-label="Loading summary metrics">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-sm border border-white/10 bg-white/5 p-4 sm:p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gold">Cashier • Revenue</p>
          <h3 className="mt-1 font-serif text-lg font-bold text-ivory">Today’s Sales</h3>
          <Skeleton variant="text" className="mt-4 w-36 h-8" />
          <p className="mt-1 text-xs text-ivory-dim">Current day total</p>
        </div>
        <div className="rounded-sm border border-white/10 bg-white/5 p-4 sm:p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gold">Cashier • Register</p>
          <h3 className="mt-1 font-serif text-lg font-bold text-ivory">Expected Cash</h3>
          <Skeleton variant="text" className="mt-4 w-36 h-8" />
          <p className="mt-1 text-xs text-ivory-dim">Fixed fund + cash sales</p>
        </div>
        <div className="rounded-sm border border-white/10 bg-white/5 p-4 sm:p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gold">Cashier • Service</p>
          <h3 className="mt-1 font-serif text-lg font-bold text-ivory">Customers Served</h3>
          <Skeleton variant="text" className="mt-4 w-20 h-8" />
          <p className="mt-1 text-xs text-ivory-dim">Completed services today</p>
        </div>
      </div>
    </section>

    {/* Lower: 2-column Recent Activity & Barber Status */}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="rounded-sm border border-white/10 bg-white/5 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton variant="text" className="w-32 h-4" />
          <Skeleton variant="text" className="w-24 h-4" />
        </div>
        <Skeleton variant="text" className="w-full h-12" />
        <Skeleton variant="text" className="w-full h-12" />
      </div>
      <div className="rounded-sm border border-white/10 bg-white/5 p-5 space-y-3">
        <Skeleton variant="text" className="w-32 h-4" />
        <Skeleton variant="text" className="w-full h-24" />
      </div>
    </div>
  </div>
);

function OverviewTabContent() {
  const { user, authReady } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const branchId = Number(user?.branch_id);
  const hasBranch = Number.isInteger(branchId) && branchId > 0;

  // Real-time queue & reservation data from the single source of truth (QueueDataContext)
  const {
    queue,
    barbers: queueBarbers,
    loading: queueLoading,
    setBarberStatus,
  } = useQueueData();

  // Overview summary & transactions from OverviewDataContext
  const {
    sales,
    cashSales,
    defaultCashCount,
    expectedCash,
    customers,
    transactions,
    transactionsLoading,
  } = useOverviewData();

  // Navigation helpers
  const goTo = useCallback((path: string) => () => navigate(path), [navigate]);
  const handleKeyActivate = useCallback(
    (path: string) => (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        navigate(path);
      }
    },
    [navigate],
  );

  // Live Manila Time clock
  const [currentDateTime, setCurrentDateTime] = useState(() => new Date());
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentDateTime(new Date());
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  // Modal inspection state for client queue details
  const [selectedClient, setSelectedClient] = useState<CustomerInfo | null>(null);
  const [selectedClientBarber, setSelectedClientBarber] = useState<string | undefined>(undefined);

  const handleSelectClient = useCallback((customer: CustomerInfo, barberName?: string) => {
    setSelectedClient(customer);
    setSelectedClientBarber(barberName);
  }, []);

  const handleUpdateBarberStatus = useCallback(
    async (barberId: string | number, status: string) => {
      try {
        await setBarberStatus(barberId, status);
        addToast({
          type: 'success',
          title: 'Barber Status Updated',
          message: `Barber status set to ${status}.`,
        });
      } catch (err: any) {
        addToast({
          type: 'error',
          title: 'Update Failed',
          message: err.response?.data?.message || err.message || 'Could not update barber status.',
        });
      }
    },
    [setBarberStatus, addToast],
  );

  if (!authReady) {
    return <DashboardSkeleton />;
  }

  if (!hasBranch) {
    return (
      <div className="p-8 text-center text-ivory-dim border border-white/10 rounded-sm bg-white/5">
        Your account is not assigned to a branch.
      </div>
    );
  }

  return (
    <div className="space-y-6 text-ivory">
      {/* Operations Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.15em] text-ivory-dim">Floor Operations</p>
          <h1 className="text-2xl font-serif font-bold text-ivory">Cashier Dashboard</h1>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 text-ivory-dim bg-white/[0.03] px-3 py-1.5 rounded-sm border border-white/10">
            <Clock className="w-3.5 h-3.5 text-gold" />
            <span>
              {new Intl.DateTimeFormat('en-PH', {
                timeZone: 'Asia/Manila',
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: true,
              }).format(currentDateTime)}
            </span>
          </div>
        </div>
      </header>

      {/* TOP: Today's Sales | Expected Cash | Customers Served */}
      <section aria-labelledby="today-summary-heading">
        <h2 id="today-summary-heading" className="sr-only">
          Today's Summary
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Today's Sales Card */}
          <div
            role="link"
            tabIndex={0}
            onClick={goTo('/cashier/sale/today')}
            onKeyDown={handleKeyActivate('/cashier/sale/today')}
            aria-label="View today's sales details"
            className="group cursor-pointer rounded-sm border border-white/10 bg-white/5 p-4 sm:p-5 transition-all hover:border-gold/40 hover:bg-gold/[0.06] focus:outline-none focus:ring-2 focus:ring-gold/50 card-gold-accent"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-sm border border-gold/20 bg-gold/10 text-gold"><Banknote className="h-4 w-4" aria-hidden="true" /></span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gold">Cashier • Revenue</p>
                  <h3 className="mt-0.5 font-serif text-lg font-bold text-ivory">Today’s Sales</h3>
                </div>
              </div>
              <ArrowUpRight
                className="w-4 h-4 text-ivory-dim group-hover:text-gold transition-colors"
                aria-hidden="true"
              />
            </div>
            <p className="mt-4 border-t border-white/5 pt-4 text-2xl sm:text-3xl font-serif font-bold text-gold tabular-nums">
              {formatCurrency(sales)}
            </p>
            <p className="mt-1 text-xs text-ivory-dim group-hover:text-ivory transition-colors">
              Current day total · Tap to view breakdown
            </p>
          </div>

          {/* Expected Cash Card */}
          <div
            aria-label="Expected cash counter"
            className="rounded-sm border border-white/10 bg-white/5 p-4 sm:p-5 card-gold-accent"
          >
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-sm border border-gold/20 bg-gold/10 text-gold"><Wallet className="h-4 w-4" aria-hidden="true" /></span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gold">Cashier • Register</p>
                <h3 className="mt-0.5 font-serif text-lg font-bold text-ivory">Expected Cash</h3>
              </div>
            </div>
            <p className="mt-4 border-t border-white/5 pt-4 text-2xl sm:text-3xl font-serif font-bold text-gold tabular-nums">
              {formatCurrency(expectedCash)}
            </p>
            <p className="mt-1 text-xs text-ivory-dim">
              {defaultCashCount > 0
                ? `${formatCurrency(defaultCashCount)} Float + ${formatCurrency(cashSales)} Cash sales`
                : `${formatCurrency(cashSales)} Cash sales · Float reset (Injects 9:00 AM)`}
            </p>
          </div>

          {/* Customers Served Card */}
          <div
            role="link"
            tabIndex={0}
            onClick={goTo('/cashier/customers-served')}
            onKeyDown={handleKeyActivate('/cashier/customers-served')}
            aria-label="View customers served history"
            className="group cursor-pointer rounded-sm border border-white/10 bg-white/5 p-4 sm:p-5 transition-all hover:border-gold/40 hover:bg-gold/[0.06] focus:outline-none focus:ring-2 focus:ring-gold/50 card-gold-accent"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-sm border border-gold/20 bg-gold/10 text-gold"><Users className="h-4 w-4" aria-hidden="true" /></span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gold">Cashier • Service</p>
                  <h3 className="mt-0.5 font-serif text-lg font-bold text-ivory">Customers Served</h3>
                </div>
              </div>
              <ArrowUpRight
                className="w-4 h-4 text-ivory-dim group-hover:text-gold transition-colors"
                aria-hidden="true"
              />
            </div>
            <p className="mt-4 border-t border-white/5 pt-4 text-2xl sm:text-3xl font-serif font-bold text-ivory tabular-nums">
              {customers}
            </p>
            <p className="mt-1 text-xs text-ivory-dim group-hover:text-ivory transition-colors">
              Completed services today · Tap to see history
            </p>
          </div>
        </div>
      </section>

      {/* Queue Overview hidden temporarily.
      <div className="grid grid-cols-1 gap-6 items-start">
        <QueueOverviewSection
          queue={queue}
          barbers={queueBarbers}
          loading={queueLoading}
          onSelectClient={handleSelectClient}
        />
      </div>
      */}

      {/* LOWER: Two-Column Section: Recent Activity (Left) | Barber Status (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        <RecentActivitySection
          transactions={transactions}
          loading={transactionsLoading}
          onViewAll={goTo('/cashier/sale/today')}
        />

        <BarberStatusSection
          barbers={queueBarbers}
          loading={queueLoading}
          onUpdateBarberStatus={handleUpdateBarberStatus}
        />
      </div>

      {/* Secondary Details Modal for Client in Queue */}
      <ClientDetailModal
        isOpen={Boolean(selectedClient)}
        onClose={() => setSelectedClient(null)}
        customer={selectedClient}
        barberName={selectedClientBarber}
        onOpenPOS={() => navigate('/cashier/pos')}
        onOpenQueue={() => navigate('/cashier/queue')}
      />
    </div>
  );
}

export default function OverviewTab() {
  return (
    <OverviewDataProvider>
      <OverviewTabContent />
    </OverviewDataProvider>
  );
}
