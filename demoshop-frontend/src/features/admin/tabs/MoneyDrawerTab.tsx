import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Wallet,
  DollarSign,
  Calendar,
  Clock,
  Lock,
  Unlock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  ArrowRight,
  ShieldAlert,
  Info,
  CalendarClock,
  Sparkles,
  HelpCircle,
  Hash,
  Coins,
} from 'lucide-react';
import { supabase } from '@/config/supabaseClient';
import { moneyDrawerService } from '../services/money-drawer.service';
import { ManagementSubHeaderNav } from '@/features/admin/components/Management/ManagementSubHeaderNav';
import { Button } from '@/components/ui/Button';
import type {
  MoneyDrawerStatusResponse,
  MoneyDrawerLogItem,
} from '@demoshop/shared-types';

interface MoneyDrawerTabProps {
  onNavigateSubTab?: (subTab: string) => void;
}

export const MoneyDrawerTab: React.FC<MoneyDrawerTabProps> = ({ onNavigateSubTab }) => {
  // Data state
  const [data, setData] = useState<MoneyDrawerStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Form state for "Adjust Amount" control
  const [inputAmount, setInputAmount] = useState<string>('10000');
  const [inputDate, setInputDate] = useState<string>(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date())
  );
  const [inputNotes, setInputNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Table filter state
  const [historySearch, setHistorySearch] = useState('');
  const [historyTypeFilter, setHistoryTypeFilter] = useState<'all' | 'manual_adjustment' | 'daily_injection'>('all');

  // Format currency in PHP
  const formatPHP = (val: number) =>
    new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
    }).format(val);

  // Fetch drawer status and history
  const fetchStatus = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    else setIsRefreshing(true);
    setErrorMessage(null);

    try {
      const res = await moneyDrawerService.getDrawerStatus();
      setData(res);
      // Pre-populate input amount if available and not yet modified
      if (res && res.can_modify_today) {
        setInputAmount(String(res.configured_amount || 10000));
      }
    } catch (err: any) {
      console.error('Failed to load money drawer status:', err);
      setErrorMessage(
        err?.response?.data?.message ||
          err?.message ||
          'Unable to load money drawer information. Please try again.'
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus(false);
  }, [fetchStatus]);

  // Real-time synchronization with Supabase
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const debouncedRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void fetchStatus(true);
      }, 400);
    };

    const channel = supabase
      .channel('admin-money-drawer-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'money_drawer_logs' },
        debouncedRefresh
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'money_drawer_configs' },
        debouncedRefresh
      )
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [fetchStatus]);

  // Handle Form Submission (Adjust Amount)
  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const parsedAmount = parseFloat(inputAmount);
    if (!parsedAmount || parsedAmount <= 0 || Number.isNaN(parsedAmount)) {
      setFormError('Please enter a valid cash amount greater than zero.');
      return;
    }

    if (!inputDate) {
      setFormError('Please select a valid target date.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await moneyDrawerService.adjustAmount({
        amount: parsedAmount,
        date: inputDate,
        notes: inputNotes.trim() || undefined,
      });

      setSuccessToast(
        `Successfully adjusted expected cash to ${formatPHP(parsedAmount)} for ${inputDate}. Transaction ID: ${res.log.transaction_id}`
      );
      setInputNotes('');
      await fetchStatus(true);
      setTimeout(() => setSuccessToast(null), 6000);
    } catch (err: any) {
      console.error('Adjustment failed:', err);
      setFormError(
        err?.response?.data?.message ||
          err?.message ||
          'Failed to adjust money drawer. Modifications are restricted to once per calendar day.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered Amount Changes History
  const filteredHistory = useMemo(() => {
    if (!data?.history) return [];
    let list = [...data.history];

    if (historyTypeFilter !== 'all') {
      list = list.filter((item) => item.entry_type === historyTypeFilter);
    }

    if (historySearch.trim()) {
      const q = historySearch.toLowerCase().trim();
      list = list.filter(
        (item) =>
          item.transaction_id.toLowerCase().includes(q) ||
          item.date.toLowerCase().includes(q) ||
          item.time.toLowerCase().includes(q) ||
          (item.notes && item.notes.toLowerCase().includes(q))
      );
    }

    return list;
  }, [data?.history, historyTypeFilter, historySearch]);

  const isLockedToday = data ? data.is_modified_today || !data.can_modify_today : false;

  return (
    <div className="w-full flex-1 flex flex-col space-y-6 animate-fade-in text-ivory">
      {/* --- PAGE HEADER --- */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-ivory flex items-center gap-2">
              <Wallet className="w-6 h-6 text-gold" />
              Money Drawer
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Cashier POS Synchronized
            </span>
          </div>
          <p className="text-xs md:text-sm text-neutral-400 mt-1">
            Manage the starting and expected cash float for the Cashier POS with automated 9:00 AM injections, midnight resets, and once-a-day modification restrictions.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="ghost"
            onClick={() => void fetchStatus(true)}
            disabled={isRefreshing || isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-semibold text-neutral-300 transition-all cursor-pointer"
            title="Refresh drawer status"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-gold ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Syncing...' : 'Sync Live'}</span>
          </Button>
        </div>
      </div>

      {/* --- MOBILE SUB-NAVIGATION PILL BAR --- */}
      <div className="shrink-0 lg:hidden">
        <ManagementSubHeaderNav activeSub="drawer" onSelect={onNavigateSubTab} />
      </div>

      {/* --- TOAST / SUCCESS ALERT --- */}
      {successToast && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex items-start gap-3 shadow-md">
          <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-400" />
          <div className="text-xs">
            <h4 className="font-bold uppercase tracking-wider">Adjustment Recorded</h4>
            <p className="mt-0.5">{successToast}</p>
          </div>
        </div>
      )}

      {/* --- ERROR ALERT --- */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="text-xs">
            <h4 className="font-bold uppercase tracking-wider">Error</h4>
            <p className="mt-0.5">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* --- TOP SUMMARY CARDS (KPIs & SCHEDULE STATUS) --- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Active POS Expected Cash */}
        <div className="relative overflow-hidden bg-gradient-to-br from-charcoal-light to-charcoal border border-white/10 rounded-xl p-4 shadow-sm group hover:border-gold/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
              Active POS Cash Float
            </span>
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Coins className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-extrabold text-gold tracking-tight">
              {data ? formatPHP(data.schedule_status.active_float) : '₱10,000.00'}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            {data?.schedule_status.is_active ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Injected (9:00 AM - 12:00 AM)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Clock className="w-3 h-3" />
                Reset (12:00 AM - 9:00 AM)
              </span>
            )}
          </div>
        </div>

        {/* Card 2: Configured Opening Float */}
        <div className="relative overflow-hidden bg-gradient-to-br from-charcoal-light to-charcoal border border-white/10 rounded-xl p-4 shadow-sm group hover:border-gold/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
              Today's Float Amount
            </span>
            <div className="p-2 rounded-lg bg-gold/10 text-gold border border-gold/20">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-extrabold text-ivory tracking-tight">
              {data ? formatPHP(data.configured_amount) : '₱10,000.00'}
            </span>
          </div>
          <p className="mt-2 text-[11px] text-neutral-400">
            {data?.is_modified_today
              ? 'Manually configured for today'
              : 'Carried over from recent configuration'}
          </p>
        </div>

        {/* Card 3: Automated Daily Schedule */}
        <div className="relative overflow-hidden bg-gradient-to-br from-charcoal-light to-charcoal border border-white/10 rounded-xl p-4 shadow-sm group hover:border-gold/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
              Daily Automation
            </span>
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <CalendarClock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-sm font-bold text-ivory flex items-center gap-1.5">
              <span className="text-gold">9:00 AM</span> Daily Injection
            </div>
            <div className="text-xs text-neutral-400 mt-1 flex items-center gap-1.5">
              <span className="text-amber-400">12:00 AM</span> Midnight Reset
            </div>
          </div>
          <div className="mt-2 text-[11px] text-neutral-500">
            Next: {data?.schedule_status.next_scheduled_event || '9:00 AM Daily Injection'}
          </div>
        </div>

        {/* Card 4: Once-a-Day Modification Limit */}
        <div className="relative overflow-hidden bg-gradient-to-br from-charcoal-light to-charcoal border border-white/10 rounded-xl p-4 shadow-sm group hover:border-gold/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
              Modification Limit
            </span>
            <div
              className={`p-2 rounded-lg border ${
                isLockedToday
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              }`}
            >
              {isLockedToday ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
            </div>
          </div>
          <div className="mt-3">
            <div className="text-base font-bold text-ivory">
              {isLockedToday ? 'Modification Locked' : '1 Modification Available'}
            </div>
            <p className="text-[11px] text-neutral-400 mt-1">
              {isLockedToday
                ? 'Amount was already updated today'
                : 'Limited to once per calendar day'}
            </p>
          </div>
          <div className="mt-2 text-[10px] text-neutral-500">
            {isLockedToday ? 'Unlocks tomorrow at 12:00 AM' : 'Available for today'}
          </div>
        </div>
      </div>

      {/* --- MAIN GRID: ADJUST AMOUNT FORM & SCHEDULE WORKFLOW --- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT 2 COLS: "ADJUST AMOUNT" FORM CONTROL */}
        <div className="lg:col-span-2 bg-charcoal-light/80 border border-white/10 rounded-xl p-5 shadow-sm backdrop-blur-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="text-base font-bold text-ivory flex items-center gap-2">
                  <Coins className="w-4 h-4 text-gold" />
                  Adjust Expected Cash Float
                </h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Set the opening money drawer float for the front-desk Cashier POS.
                </p>
              </div>

              {isLockedToday ? (
                <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  Locked for Today
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold flex items-center gap-1.5">
                  <Unlock className="w-3.5 h-3.5" />
                  Ready to Adjust
                </span>
              )}
            </div>

            {/* Locked Warning Banner (if modified today) */}
            {isLockedToday && (
              <div className="mt-4 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5 text-amber-400" />
                <div className="text-xs">
                  <h4 className="font-bold uppercase tracking-wider">Once-a-Day Limit Active</h4>
                  <p className="mt-1 text-amber-200/90 leading-relaxed">
                    The expected cash amount for today has already been configured to{' '}
                    <strong className="text-white font-bold">
                      {data ? formatPHP(data.configured_amount) : '₱10,000.00'}
                    </strong>
                    . To maintain strict accounting and audit integrity, manual drawer adjustments are restricted to{' '}
                    <strong>once per calendar day</strong>. The next adjustment window opens tomorrow at 12:00 AM.
                  </p>
                </div>
              </div>
            )}

            {/* Form Error */}
            {formError && (
              <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{formError}</span>
              </div>
            )}

            {/* The Form */}
            <form onSubmit={handleAdjustSubmit} className="mt-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* 1. Cash Amount Input */}
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                    Expected Cash Amount (₱) <span className="text-gold">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gold font-bold text-sm">
                      ₱
                    </span>
                    <input
                      type="number"
                      step="50"
                      min="100"
                      disabled={isLockedToday || isSubmitting}
                      value={inputAmount}
                      onChange={(e) => setInputAmount(e.target.value)}
                      placeholder="e.g. 10000"
                      className="w-full bg-black/50 border border-white/10 rounded-lg pl-8 pr-3 py-2 text-sm text-ivory font-semibold focus:outline-hidden focus:border-gold disabled:opacity-50 disabled:cursor-not-allowed"
                      required
                    />
                  </div>

                  {/* Quick Preset Buttons */}
                  {!isLockedToday && (
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      <span className="text-[10px] text-neutral-500">Presets:</span>
                      {[5000, 8000, 10000, 12000, 15000].map((presetVal) => (
                        <button
                          key={presetVal}
                          type="button"
                          onClick={() => setInputAmount(String(presetVal))}
                          className="px-2 py-0.5 rounded bg-white/5 hover:bg-gold/20 text-neutral-300 hover:text-gold border border-white/10 text-[10px] font-semibold transition-all cursor-pointer"
                        >
                          ₱{presetVal.toLocaleString()}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* 2. Set Date Input */}
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                    Set Date <span className="text-gold">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="date"
                      disabled={isLockedToday || isSubmitting}
                      value={inputDate}
                      onChange={(e) => setInputDate(e.target.value)}
                      className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-ivory font-semibold focus:outline-hidden focus:border-gold disabled:opacity-50 disabled:cursor-not-allowed"
                      required
                    />
                  </div>
                  <p className="text-[10px] text-neutral-500 mt-1">
                    Date this expected starting float applies to
                  </p>
                </div>
              </div>

              {/* 3. Reason / Notes Input */}
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                  Adjustment Reason / Notes <span className="text-neutral-500">(Optional)</span>
                </label>
                <input
                  type="text"
                  disabled={isLockedToday || isSubmitting}
                  value={inputNotes}
                  onChange={(e) => setInputNotes(e.target.value)}
                  placeholder="e.g. Starting float adjustment for Saturday operational rush"
                  className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-xs text-ivory focus:outline-hidden focus:border-gold disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>

              {/* Submit Button */}
              <div className="pt-2 flex items-center justify-between">
                <div className="text-[11px] text-neutral-400">
                  {isLockedToday ? (
                    <span className="text-amber-400 flex items-center gap-1">
                      <Lock className="w-3 h-3" /> Modification locked until tomorrow
                    </span>
                  ) : (
                    <span>Manual changes take effect immediately on Cashier POS</span>
                  )}
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  disabled={isLockedToday || isSubmitting}
                  className="px-5 py-2 bg-gold hover:bg-gold/90 text-charcoal font-bold rounded-lg text-xs shadow-md transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Coins className="w-3.5 h-3.5" />
                  <span>{isSubmitting ? 'Recording Adjustment...' : 'Confirm Drawer Adjustment'}</span>
                </Button>
              </div>
            </form>
          </div>

          {/* Fallback Default Rule Footer Callout */}
          <div className="mt-5 pt-3 border-t border-white/10 text-xs text-neutral-400 flex items-start gap-2 bg-black/30 p-3 rounded-lg border border-white/5">
            <Info className="w-4 h-4 text-gold shrink-0 mt-0.5" />
            <div>
              <strong className="text-ivory font-semibold">Automatic Fallback Default Policy:</strong>
              <p className="mt-0.5 text-neutral-400 text-[11px] leading-relaxed">
                If the admin does not manually adjust the amount on a given day, the Cashier POS automatically carries over the{' '}
                <span className="text-gold font-bold">most recently configured amount</span> (currently{' '}
                {data ? formatPHP(data.configured_amount) : '₱10,000.00'}) as the opening expected cash float.
              </p>
            </div>
          </div>
        </div>

        {/* RIGHT 1 COL: DAILY SCHEDULE EXPLANATION & WORKFLOW */}
        <div className="bg-charcoal-light/80 border border-white/10 rounded-xl p-5 shadow-sm backdrop-blur-xs flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-ivory flex items-center gap-2 border-b border-white/10 pb-3">
              <CalendarClock className="w-4 h-4 text-blue-400" />
              Automated POS Schedule
            </h3>

            <div className="mt-4 space-y-4 text-xs">
              {/* Event 1: 12:00 AM Midnight Reset */}
              <div className="p-3 rounded-xl bg-black/40 border border-white/5 flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold shrink-0">
                  <Clock className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h4 className="font-bold text-ivory flex items-center gap-2">
                    <span>12:00 AM Daily Reset</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400">Midnight</span>
                  </h4>
                  <p className="text-[11px] text-neutral-400 mt-1">
                    Automatically clears/resets the active Expected Cash float on Cashier POS to{' '}
                    <strong className="text-white font-mono">₱0.00</strong> during pre-opening hours.
                  </p>
                </div>
              </div>

              {/* Event 2: 9:00 AM Daily Injection */}
              <div className="p-3 rounded-xl bg-black/40 border border-white/5 flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold shrink-0">
                  <Coins className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h4 className="font-bold text-ivory flex items-center gap-2">
                    <span>9:00 AM Daily Injection</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400">Morning</span>
                  </h4>
                  <p className="text-[11px] text-neutral-400 mt-1">
                    Automatically applies the configured (or carried-over fallback) amount as the active{' '}
                    <strong className="text-gold">Expected Cash</strong> float on Cashier POS when doors open.
                  </p>
                </div>
              </div>

              {/* Event 3: Cashier POS Formula */}
              <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold block mb-1">
                  Cashier POS Expected Formula
                </span>
                <div className="font-mono text-xs text-gold bg-black/60 p-2 rounded border border-white/10">
                  Expected Cash = Active Float + Cash Sales
                </div>
                <p className="text-[10px] text-neutral-400 mt-1.5">
                  GCash and online transfers are excluded to keep physical cash counts accurate.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-white/10 text-[11px] text-neutral-500">
            System Timezone: Asia/Manila (UTC+8)
          </div>
        </div>
      </div>

      {/* --- AMOUNT CHANGES HISTORY TABLE --- */}
      <div className="bg-charcoal-light/80 border border-white/10 rounded-xl p-5 shadow-sm backdrop-blur-xs space-y-4">
        {/* Table Header & Search Filter */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div>
            <h3 className="text-base font-bold text-ivory flex items-center gap-2">
              <Hash className="w-4 h-4 text-gold" />
              Amount Changes
            </h3>
            <p className="text-xs text-neutral-400 mt-0.5">
              Historical record of all manual drawer adjustments and automated 9:00 AM POS injections.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filter by Type */}
            <select
              value={historyTypeFilter}
              onChange={(e) => setHistoryTypeFilter(e.target.value as any)}
              className="bg-black/50 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-ivory focus:outline-hidden focus:border-gold cursor-pointer"
            >
              <option value="all">All Events ({data?.history.length ?? 0})</option>
              <option value="manual_adjustment">Manual Adjustments</option>
              <option value="daily_injection">9:00 AM Injections</option>
            </select>

            {/* Search Input */}
            <div className="relative min-w-[180px]">
              <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Search transaction ID..."
                className="w-full bg-black/50 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-ivory placeholder-neutral-500 focus:outline-hidden focus:border-gold"
              />
            </div>
          </div>
        </div>

        {/* The Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-neutral-400 text-[10px] uppercase tracking-wider">
                <th className="py-2.5 px-3">Transaction ID</th>
                <th className="py-2.5 px-3 text-right">Amount</th>
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3">Time</th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3">Notes / Audit Context</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-sans">
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={6} className="py-3 px-3">
                      <div className="h-6 rounded bg-white/5 animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-neutral-500 text-xs">
                    No amount change records found matching criteria.
                  </td>
                </tr>
              ) : (
                filteredHistory.map((item) => (
                  <tr key={item.id} className="hover:bg-white/5 transition-colors">
                    {/* Transaction ID */}
                    <td className="py-3 px-3 font-mono text-[11px] text-neutral-200">
                      <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 font-bold text-gold">
                        {item.transaction_id}
                      </span>
                    </td>

                    {/* Amount */}
                    <td className="py-3 px-3 text-right font-bold text-sm text-emerald-400">
                      {formatPHP(item.amount)}
                    </td>

                    {/* Date */}
                    <td className="py-3 px-3 text-neutral-300 font-mono text-[11px]">
                      {item.date}
                    </td>

                    {/* Time */}
                    <td className="py-3 px-3 text-neutral-300 font-mono text-[11px]">
                      {item.time}
                    </td>

                    {/* Type Badge */}
                    <td className="py-3 px-3">
                      {item.entry_type === 'manual_adjustment' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-gold/10 text-gold border border-gold/30">
                          <Coins className="w-2.5 h-2.5" /> Manual Adjustment
                        </span>
                      ) : item.entry_type === 'daily_injection' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                          <Clock className="w-2.5 h-2.5" /> 9:00 AM Daily Injection
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/30">
                          System Event
                        </span>
                      )}
                    </td>

                    {/* Notes */}
                    <td className="py-3 px-3 text-neutral-400 text-[11px] max-w-xs truncate">
                      {item.notes || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default MoneyDrawerTab;
