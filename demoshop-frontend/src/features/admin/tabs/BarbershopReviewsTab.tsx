import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import {
  Star,
  Scissors,
  Users,
  Award,
  Calendar,
  Search,
  RefreshCw,
  TrendingUp,
  MessageSquare,
  Sparkles,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  DollarSign,
  Filter,
  Eye,
  AlertCircle,
  Clock,
  User,
  History,
  X,
  FileSpreadsheet,
} from 'lucide-react';
import { supabase } from '@/config/supabaseClient';
import { adminReviewsService } from '@/features/admin/services/admin-reviews.service';
import { ManagementSubHeaderNav } from '@/features/admin/components/Management/ManagementSubHeaderNav';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/ui/Button';
import type {
  BarberPerformanceReviewsResponse,
  BarberPerformanceMetric,
  BarberReviewLogItem,
  BarberCompletedServiceLogItem,
} from '@demoshop/shared-types';

interface BarbershopReviewsTabProps {
  onNavigateSubTab?: (subTab: string) => void;
}

type PeriodPreset = 'all' | 'today' | 'week' | 'month' | 'last-month' | 'custom';

export const BarbershopReviewsTab: React.FC<BarbershopReviewsTabProps> = ({
  onNavigateSubTab,
}) => {
  const [, setSearchParams] = useSearchParams();

  // Filter states
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [selectedBarberFilter, setSelectedBarberFilter] = useState<number | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTabMode, setActiveTabMode] = useState<'barbers' | 'reviews'>('barbers');

  // Data states
  const [data, setData] = useState<BarberPerformanceReviewsResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());

  // Modal inspection state for a specific barber
  const [inspectedBarber, setInspectedBarber] = useState<BarberPerformanceMetric | null>(null);
  const [modalTab, setModalTab] = useState<'reviews' | 'services'>('reviews');
  const [modalSearchQuery, setModalSearchQuery] = useState<string>('');

  // Calculate preset dates
  const computePresetDates = useCallback((preset: PeriodPreset) => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const formatYMD = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (preset === 'today') {
      const todayStr = formatYMD(now);
      return { start: todayStr, end: todayStr };
    }
    if (preset === 'week') {
      const d = new Date(now);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d.setDate(diff));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return { start: formatYMD(monday), end: formatYMD(sunday) };
    }
    if (preset === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { start: formatYMD(start), end: formatYMD(end) };
    }
    if (preset === 'last-month') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: formatYMD(start), end: formatYMD(end) };
    }
    return { start: '', end: '' };
  }, []);

  // Fetch reviews and performance data
  const fetchData = useCallback(
    async (isSilent = false) => {
      if (!isSilent) setIsLoading(true);
      else setIsRefreshing(true);
      setErrorMessage(null);

      try {
        let activeStart = startDate;
        let activeEnd = endDate;

        if (periodPreset !== 'custom') {
          const range = computePresetDates(periodPreset);
          activeStart = range.start;
          activeEnd = range.end;
        }

        const res = await adminReviewsService.getBarberPerformanceReviews({
          startDate: activeStart || undefined,
          endDate: activeEnd || undefined,
          barberId: selectedBarberFilter === 'all' ? undefined : selectedBarberFilter,
        });

        setData(res);
        setLastRefreshedAt(new Date());
      } catch (err: any) {
        console.error('Failed to load barber performance and reviews:', err);
        setErrorMessage(
          err?.response?.data?.message ||
            err?.message ||
            'Unable to load barber review records. Please try again.'
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [periodPreset, startDate, endDate, selectedBarberFilter, computePresetDates]
  );

  // Initial fetch and dependency trigger
  useEffect(() => {
    void fetchData(false);
  }, [fetchData]);

  // Handle Preset Change
  const handlePresetChange = (preset: PeriodPreset) => {
    setPeriodPreset(preset);
    if (preset !== 'custom') {
      const { start, end } = computePresetDates(preset);
      setStartDate(start);
      setEndDate(end);
    }
  };

  // Real-time synchronization with Supabase (ratings & completed queue entries)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const debouncedRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void fetchData(true);
      }, 400);
    };

    const channel = supabase
      .channel('admin-barber-reviews-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ratings' },
        debouncedRefresh
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'queue_entries' },
        debouncedRefresh
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'barbers' },
        debouncedRefresh
      )
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  // Filtered Barbers
  const filteredBarbers = useMemo(() => {
    if (!data?.barbers) return [];
    let list = [...data.barbers];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (b) =>
          b.barber_name.toLowerCase().includes(q) ||
          (b.email && b.email.toLowerCase().includes(q))
      );
    }

    return list;
  }, [data?.barbers, searchQuery]);

  // Filtered All Reviews
  const filteredReviews = useMemo(() => {
    if (!data?.reviews) return [];
    let list = [...data.reviews];

    if (selectedBarberFilter !== 'all') {
      list = list.filter((r) => r.barber_id === selectedBarberFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (r) =>
          r.barber_name.toLowerCase().includes(q) ||
          r.customer_name.toLowerCase().includes(q) ||
          r.service_name.toLowerCase().includes(q) ||
          (r.comment && r.comment.toLowerCase().includes(q))
      );
    }

    return list;
  }, [data?.reviews, selectedBarberFilter, searchQuery]);

  // Inspected Barber Reviews
  const inspectedBarberReviews = useMemo(() => {
    if (!inspectedBarber || !data?.reviews) return [];
    let list = data.reviews.filter((r) => r.barber_id === inspectedBarber.barber_id);
    if (modalSearchQuery.trim()) {
      const q = modalSearchQuery.toLowerCase().trim();
      list = list.filter(
        (r) =>
          r.customer_name.toLowerCase().includes(q) ||
          r.service_name.toLowerCase().includes(q) ||
          (r.comment && r.comment.toLowerCase().includes(q))
      );
    }
    return list;
  }, [inspectedBarber, data?.reviews, modalSearchQuery]);

  // Inspected Barber Completed Services
  const inspectedBarberServices = useMemo(() => {
    if (!inspectedBarber || !data?.completed_services) return [];
    let list = data.completed_services.filter(
      (s) => s.barber_id === inspectedBarber.barber_id
    );
    if (modalSearchQuery.trim()) {
      const q = modalSearchQuery.toLowerCase().trim();
      list = list.filter(
        (s) =>
          s.customer_name.toLowerCase().includes(q) ||
          s.service_name.toLowerCase().includes(q) ||
          (s.comment && s.comment.toLowerCase().includes(q))
      );
    }
    return list;
  }, [inspectedBarber, data?.completed_services, modalSearchQuery]);

  // Helper for rendering star icons
  const renderStars = (rating: number, max = 5, sizeClass = 'w-4 h-4') => {
    const fullStars = Math.floor(rating);
    const hasHalf = rating - fullStars >= 0.5;

    return (
      <div className="flex items-center gap-0.5 text-gold">
        {Array.from({ length: max }).map((_, i) => {
          const isFilled = i < fullStars;
          const isHalf = i === fullStars && hasHalf;
          return (
            <Star
              key={i}
              className={`${sizeClass} ${
                isFilled || isHalf ? 'fill-gold text-gold' : 'text-white/20'
              }`}
            />
          );
        })}
      </div>
    );
  };

  return (
    <div className="w-full flex-1 flex flex-col space-y-6 animate-fade-in text-ivory">
      {/* --- PAGE HEADER --- */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-ivory flex items-center gap-2">
              <Star className="w-6 h-6 text-gold fill-gold" />
              Barbershop Reviews & Performance
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live Sync Active
            </span>
          </div>
          <p className="text-xs md:text-sm text-neutral-400 mt-1">
            Track individual barber productivity, customer ratings, and service completion logs for appraisals and commission reconciliation.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="ghost"
            onClick={() => void fetchData(true)}
            disabled={isRefreshing || isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-semibold text-neutral-300 transition-all cursor-pointer"
            title="Refresh ratings from customer module"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-gold ${isRefreshing ? 'animate-spin' : ''}`}
            />
            <span>{isRefreshing ? 'Syncing...' : 'Sync Live'}</span>
          </Button>
        </div>
      </div>

      {/* --- MOBILE SUB-NAVIGATION PILL BAR --- */}
      <div className="shrink-0 lg:hidden">
        <ManagementSubHeaderNav
          activeSub="reviews"
          onSelect={onNavigateSubTab}
        />
      </div>

      {/* --- FILTER & PERIOD CONTROL BAR --- */}
      <div className="bg-charcoal/80 border border-white/10 rounded-xl p-4 shadow-sm backdrop-blur-xs flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        {/* Preset Buttons */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-neutral-400 mr-1 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-gold" /> Period:
          </span>
          {(
            [
              { id: 'all', label: 'All Time' },
              { id: 'today', label: 'Today' },
              { id: 'week', label: 'This Week' },
              { id: 'month', label: 'This Month' },
              { id: 'last-month', label: 'Last Month' },
              { id: 'custom', label: 'Custom Range' },
            ] as const
          ).map((preset) => {
            const isActive = periodPreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handlePresetChange(preset.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer ${
                  isActive
                    ? 'bg-gold text-charcoal shadow-sm font-bold'
                    : 'bg-white/5 text-neutral-300 hover:bg-white/10 border border-white/5'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        {/* Custom Range Inputs (if custom is active) */}
        {periodPreset === 'custom' && (
          <div className="flex flex-wrap items-center gap-2 bg-charcoal-light/60 p-2 rounded-lg border border-gold/30">
            <Calendar className="w-3.5 h-3.5 text-gold" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-black/50 border border-white/10 rounded px-2 py-1 text-xs text-ivory focus:outline-hidden focus:border-gold"
            />
            <span className="text-xs text-neutral-400">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-black/50 border border-white/10 rounded px-2 py-1 text-xs text-ivory focus:outline-hidden focus:border-gold"
            />
            <button
              type="button"
              onClick={() => void fetchData(false)}
              className="px-2.5 py-1 bg-gold text-charcoal rounded text-xs font-bold hover:bg-gold/90 transition-all cursor-pointer"
            >
              Apply
            </button>
          </div>
        )}

        {/* Search & Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Barber filter selector */}
          {data?.barbers && data.barbers.length > 0 && (
            <select
              value={selectedBarberFilter}
              onChange={(e) =>
                setSelectedBarberFilter(
                  e.target.value === 'all' ? 'all' : Number(e.target.value)
                )
              }
              aria-label="Filter by Barber"
              className="bg-charcoal-light border border-white/10 text-xs text-ivory rounded-lg px-3 py-1.5 focus:outline-hidden focus:border-gold cursor-pointer"
            >
              <option value="all">All Barbers ({data.barbers.length})</option>
              {data.barbers.map((b) => (
                <option key={b.barber_id} value={b.barber_id}>
                  {b.barber_name}
                </option>
              ))}
            </select>
          )}

          {/* Search keyword input */}
          <div className="relative min-w-[200px] flex-1 sm:flex-initial">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search barber, client, service..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-charcoal-light border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-ivory placeholder-neutral-500 focus:outline-hidden focus:border-gold"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* --- TOP AGGREGATE KPI SUMMARY CARDS --- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Shop Overall Average Star Rating */}
        <div className="relative overflow-hidden bg-gradient-to-br from-charcoal-light to-charcoal border border-white/10 rounded-xl p-4 shadow-sm group hover:border-gold/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
              Aggregate Rating
            </span>
            <div className="p-2 rounded-lg bg-gold/10 text-gold border border-gold/20">
              <Star className="w-4 h-4 fill-gold text-gold" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-gold tracking-tight">
              {data?.summary?.overall_avg_rating
                ? Number(data.summary.overall_avg_rating).toFixed(1)
                : '5.0'}
            </span>
            <span className="text-xs text-neutral-400 font-medium">/ 5.0</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            {renderStars(data?.summary?.overall_avg_rating || 5, 5, 'w-3.5 h-3.5')}
            <span className="text-[11px] text-neutral-400 ml-1">
              ({data?.summary?.total_reviews ?? 0} reviews)
            </span>
          </div>
        </div>

        {/* Card 2: Cumulative Completed Services */}
        <div className="relative overflow-hidden bg-gradient-to-br from-charcoal-light to-charcoal border border-white/10 rounded-xl p-4 shadow-sm group hover:border-gold/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
              Completed Services
            </span>
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Scissors className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-ivory tracking-tight">
              {data?.summary?.total_completed_services?.toLocaleString() ?? 0}
            </span>
            <span className="text-xs text-neutral-400 font-medium">services</span>
          </div>
          <p className="mt-2 text-[11px] text-neutral-400">
            For commission & productivity reconciliation
          </p>
        </div>

        {/* Card 3: Total Verified Reviews */}
        <div className="relative overflow-hidden bg-gradient-to-br from-charcoal-light to-charcoal border border-white/10 rounded-xl p-4 shadow-sm group hover:border-gold/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
              Client Feedback Count
            </span>
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <MessageSquare className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-ivory tracking-tight">
              {data?.summary?.total_reviews?.toLocaleString() ?? 0}
            </span>
            <span className="text-xs text-emerald-400 font-medium">verified</span>
          </div>
          <p className="mt-2 text-[11px] text-neutral-400">
            Submitted dynamically via Customer Module
          </p>
        </div>

        {/* Card 4: Top Rated Barber */}
        <div className="relative overflow-hidden bg-gradient-to-br from-charcoal-light to-charcoal border border-white/10 rounded-xl p-4 shadow-sm group hover:border-gold/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
              Top Rated Barber
            </span>
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-lg font-bold text-ivory truncate">
              {data?.summary?.top_rated_barber?.barber_name || 'All Stylists'}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs font-extrabold text-gold flex items-center gap-1">
                <Star className="w-3 h-3 fill-gold text-gold" />
                {data?.summary?.top_rated_barber?.avg_rating
                  ? Number(data.summary.top_rated_barber.avg_rating).toFixed(1)
                  : '5.0'}
              </span>
              <span className="text-[11px] text-neutral-400">
                · {data?.summary?.top_rated_barber?.completed_services_count ?? 0} cuts completed
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* --- VIEW TOGGLE TABS (Barber Scorecards vs Review Timeline Feed) --- */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTabMode('barbers')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeTabMode === 'barbers'
                ? 'bg-gold text-charcoal shadow-sm'
                : 'text-neutral-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Barber Performance Scorecards ({filteredBarbers.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTabMode('reviews')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeTabMode === 'reviews'
                ? 'bg-gold text-charcoal shadow-sm'
                : 'text-neutral-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Customer Review Feed ({filteredReviews.length})</span>
          </button>
        </div>

        <span className="text-[11px] text-neutral-500 hidden sm:inline">
          Last updated: {lastRefreshedAt.toLocaleTimeString()}
        </span>
      </div>

      {/* --- ERROR ALERT --- */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider">Sync Error</h4>
            <p className="text-xs mt-0.5">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* --- MAIN CONTENT: BARBERS VIEW --- */}
      {activeTabMode === 'barbers' && (
        <>
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-64 rounded-xl bg-white/5 border border-white/10 animate-pulse"
                />
              ))}
            </div>
          ) : filteredBarbers.length === 0 ? (
            <div className="p-12 text-center rounded-xl bg-charcoal/50 border border-white/10">
              <Users className="w-12 h-12 text-neutral-600 mx-auto mb-3" />
              <h3 className="text-base font-bold text-neutral-300">No Barbers Found</h3>
              <p className="text-xs text-neutral-500 mt-1 max-w-md mx-auto">
                No active barbers match the search or filter criteria. Try adjusting your search query or selecting a different period preset.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredBarbers.map((barber) => {
                const totalStarCount = barber.total_reviews || 0;
                const starPct = (count: number) =>
                  totalStarCount > 0
                    ? Math.round((count / totalStarCount) * 100)
                    : 0;

                return (
                  <div
                    key={barber.barber_id}
                    className="flex flex-col justify-between bg-charcoal-light/80 hover:bg-charcoal-light border border-white/10 hover:border-gold/50 rounded-xl p-5 shadow-sm transition-all duration-200 group"
                  >
                    <div>
                      {/* Card Header: Barber Avatar + Details */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          {barber.profile_picture ? (
                            <img
                              src={barber.profile_picture}
                              alt={barber.barber_name}
                              className="w-12 h-12 rounded-full object-cover border-2 border-gold/40 shadow-xs"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-full bg-gold/10 border-2 border-gold/30 flex items-center justify-center text-gold font-bold text-base">
                              {barber.barber_name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-bold text-base text-ivory group-hover:text-gold transition-colors">
                                {barber.barber_name}
                              </h3>
                              {barber.is_active && (
                                <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" title="Active Staff" />
                              )}
                            </div>
                            <p className="text-[11px] text-neutral-400 truncate max-w-[170px]">
                              {barber.email || 'Master Barber'}
                            </p>
                          </div>
                        </div>

                        {/* Average Rating Badge */}
                        <div className="flex flex-col items-end">
                          <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gold/10 border border-gold/30 text-gold font-extrabold text-sm">
                            <Star className="w-3.5 h-3.5 fill-gold text-gold" />
                            <span>{Number(barber.avg_rating || 5.0).toFixed(1)}</span>
                          </div>
                          <span className="text-[10px] text-neutral-400 mt-1">
                            {barber.total_reviews} {barber.total_reviews === 1 ? 'review' : 'reviews'}
                          </span>
                        </div>
                      </div>

                      {/* Productivity & Metrics Strip */}
                      <div className="grid grid-cols-2 gap-3 mt-4 p-3 bg-black/40 rounded-lg border border-white/5">
                        {/* Metric: Cumulative Completed Services */}
                        <div>
                          <div className="flex items-center gap-1.5 text-neutral-400 text-[11px]">
                            <Scissors className="w-3 h-3 text-gold" />
                            <span>Completed Services</span>
                          </div>
                          <div className="text-xl font-bold text-ivory mt-1">
                            {barber.completed_services_count.toLocaleString()}
                          </div>
                          <span className="text-[10px] text-neutral-500">
                            In selected period
                          </span>
                        </div>

                        {/* Metric: Service Revenue Generated */}
                        <div>
                          <div className="flex items-center gap-1.5 text-neutral-400 text-[11px]">
                            <DollarSign className="w-3 h-3 text-emerald-400" />
                            <span>Service Volume</span>
                          </div>
                          <div className="text-xl font-bold text-emerald-400 mt-1">
                            ₱{Number(barber.total_revenue || 0).toLocaleString('en-US', { minimumFractionDigits: 0 })}
                          </div>
                          <span className="text-[10px] text-neutral-500">
                            Commission base
                          </span>
                        </div>
                      </div>

                      {/* Rating Breakdown Bars (5 stars down to 1 star) */}
                      <div className="mt-4 space-y-1.5">
                        <div className="text-[11px] font-semibold text-neutral-400 flex items-center justify-between">
                          <span>Star Distribution</span>
                          <span>{barber.total_reviews} total ratings</span>
                        </div>
                        {[
                          { star: 5, count: barber.star5 },
                          { star: 4, count: barber.star4 },
                          { star: 3, count: barber.star3 },
                          { star: 2, count: barber.star2 },
                          { star: 1, count: barber.star1 },
                        ].map((s) => {
                          const pct = starPct(s.count);
                          return (
                            <div key={s.star} className="flex items-center gap-2 text-[10px]">
                              <span className="w-5 text-neutral-400">{s.star}★</span>
                              <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                                <div
                                  className="h-full bg-gold rounded-full transition-all duration-300"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="w-8 text-right text-neutral-500">
                                {s.count}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Bottom Action: Inspect Performance History */}
                    <div className="mt-5 pt-3 border-t border-white/10">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setInspectedBarber(barber);
                          setModalTab('reviews');
                          setModalSearchQuery('');
                        }}
                        className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-gold/10 hover:bg-gold hover:text-charcoal text-gold text-xs font-bold border border-gold/30 hover:border-gold transition-all cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Inspect Performance & Service History</span>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* --- MAIN CONTENT: ALL REVIEWS FEED VIEW --- */}
      {activeTabMode === 'reviews' && (
        <div className="space-y-3">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-28 rounded-xl bg-white/5 border border-white/10 animate-pulse"
                />
              ))}
            </div>
          ) : filteredReviews.length === 0 ? (
            <div className="p-12 text-center rounded-xl bg-charcoal/50 border border-white/10">
              <MessageSquare className="w-12 h-12 text-neutral-600 mx-auto mb-3" />
              <h3 className="text-base font-bold text-neutral-300">No Customer Reviews Yet</h3>
              <p className="text-xs text-neutral-500 mt-1 max-w-md mx-auto">
                Customer reviews submitted through the mobile booking portal or queue checkout will display here in real-time.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredReviews.map((rev) => (
                <div
                  key={rev.id}
                  className="p-4 bg-charcoal-light/90 border border-white/10 rounded-xl hover:border-gold/30 transition-all flex flex-col md:flex-row md:items-start justify-between gap-4"
                >
                  <div className="flex items-start gap-3 flex-1">
                    <div className="w-10 h-10 rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center text-gold font-bold text-sm shrink-0">
                      {rev.customer_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-bold text-sm text-ivory">
                          {rev.customer_name}
                        </h4>
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          Verified Client
                        </span>
                        <span className="text-xs text-neutral-400">· attended by</span>
                        <span className="text-xs font-bold text-gold flex items-center gap-1">
                          <User className="w-3 h-3 text-gold" />
                          {rev.barber_name}
                        </span>
                      </div>

                      {/* Stars & Service rendered */}
                      <div className="flex items-center gap-3 mt-1.5">
                        {renderStars(rev.stars, 5, 'w-3.5 h-3.5')}
                        <span className="text-xs font-semibold text-gold">
                          {Number(rev.stars).toFixed(1)} / 5.0
                        </span>
                        <span className="text-xs text-neutral-400">|</span>
                        <span className="text-xs text-neutral-300 flex items-center gap-1">
                          <Scissors className="w-3 h-3 text-gold" />
                          {rev.service_name}
                        </span>
                      </div>

                      {/* Feedback Comment Quote */}
                      {rev.comment ? (
                        <blockquote className="mt-2.5 p-3 rounded-lg bg-black/40 border border-white/5 text-xs text-neutral-200 italic font-serif">
                          "{rev.comment}"
                        </blockquote>
                      ) : (
                        <p className="mt-2 text-xs text-neutral-500 italic">
                          No written commentary provided with this rating.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Timestamp & Queue ID */}
                  <div className="text-left md:text-right shrink-0">
                    <div className="flex items-center gap-1 text-xs text-neutral-400">
                      <Calendar className="w-3.5 h-3.5 text-neutral-500" />
                      <span>{rev.date}</span>
                    </div>
                    <div className="text-[11px] text-neutral-500 mt-0.5">
                      {rev.time}
                    </div>
                    {rev.queue_id && (
                      <span className="mt-2 inline-block px-2 py-0.5 rounded text-[10px] bg-white/5 border border-white/10 text-neutral-400 font-mono">
                        Ticket #{rev.queue_id}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* --- DETAILED BARBER INSPECTION & HISTORY MODAL --- */}
      {inspectedBarber && (
        <Modal
          isOpen={!!inspectedBarber}
          onClose={() => setInspectedBarber(null)}
          title={`Performance & History: ${inspectedBarber.barber_name}`}
          size="xl"
          footer={
            <div className="flex items-center justify-between w-full">
              <span className="text-xs text-neutral-400">
                Data reflects selected period: <strong className="text-ivory">{periodPreset.toUpperCase()}</strong>
              </span>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setInspectedBarber(null)}
                className="px-4 py-1.5 rounded-lg border border-white/10 text-xs font-semibold hover:bg-white/10 cursor-pointer"
              >
                Close View
              </Button>
            </div>
          }
        >
          <div className="space-y-5">
            {/* Barber Profile Summary Strip in Modal */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-charcoal-light border border-gold/30">
              <div className="flex items-center gap-3">
                {inspectedBarber.profile_picture ? (
                  <img
                    src={inspectedBarber.profile_picture}
                    alt={inspectedBarber.barber_name}
                    className="w-14 h-14 rounded-full object-cover border-2 border-gold"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-gold/10 border-2 border-gold flex items-center justify-center text-gold font-bold text-xl">
                    {inspectedBarber.barber_name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <h3 className="text-lg font-bold text-ivory">
                    {inspectedBarber.barber_name}
                  </h3>
                  <p className="text-xs text-neutral-400">
                    {inspectedBarber.email || 'Master Stylist'}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    {renderStars(inspectedBarber.avg_rating, 5, 'w-3.5 h-3.5')}
                    <span className="text-xs font-bold text-gold">
                      {Number(inspectedBarber.avg_rating).toFixed(1)} / 5.0
                    </span>
                    <span className="text-xs text-neutral-500">
                      ({inspectedBarber.total_reviews} verified reviews)
                    </span>
                  </div>
                </div>
              </div>

              {/* KPI Pills */}
              <div className="flex items-center gap-3">
                <div className="p-3 bg-black/40 rounded-lg border border-white/10 text-center min-w-[100px]">
                  <span className="text-[10px] text-neutral-400 uppercase tracking-wider block">
                    Completed
                  </span>
                  <span className="text-lg font-extrabold text-ivory">
                    {inspectedBarber.completed_services_count}
                  </span>
                  <span className="text-[10px] text-neutral-500 block">services</span>
                </div>
                <div className="p-3 bg-black/40 rounded-lg border border-white/10 text-center min-w-[110px]">
                  <span className="text-[10px] text-neutral-400 uppercase tracking-wider block">
                    Service Sales
                  </span>
                  <span className="text-lg font-extrabold text-emerald-400">
                    ₱{Number(inspectedBarber.total_revenue).toLocaleString()}
                  </span>
                  <span className="text-[10px] text-neutral-500 block">estimated</span>
                </div>
              </div>
            </div>

            {/* Modal Tabs: Customer Reviews vs Completed Services Log */}
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setModalTab('reviews')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    modalTab === 'reviews'
                      ? 'bg-gold text-charcoal'
                      : 'text-neutral-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Customer Reviews & Feedback ({inspectedBarberReviews.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setModalTab('services')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    modalTab === 'services'
                      ? 'bg-gold text-charcoal'
                      : 'text-neutral-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <History className="w-3.5 h-3.5" />
                  <span>Completed Services Log ({inspectedBarberServices.length})</span>
                </button>
              </div>

              {/* Modal Search Input */}
              <div className="relative min-w-[180px]">
                <Search className="w-3 h-3 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter logs..."
                  value={modalSearchQuery}
                  onChange={(e) => setModalSearchQuery(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-lg pl-7 pr-3 py-1 text-xs text-ivory placeholder-neutral-500 focus:outline-hidden focus:border-gold"
                />
              </div>
            </div>

            {/* TAB CONTENT 1: Reviews & Feedback */}
            {modalTab === 'reviews' && (
              <div className="max-h-[380px] overflow-y-auto space-y-3 pr-1">
                {inspectedBarberReviews.length === 0 ? (
                  <div className="p-8 text-center rounded-xl bg-charcoal/40 border border-white/5 text-neutral-400">
                    <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-xs">No client reviews found for this barber in the selected period.</p>
                  </div>
                ) : (
                  inspectedBarberReviews.map((rev) => (
                    <div
                      key={rev.id}
                      className="p-3.5 rounded-xl bg-black/40 border border-white/5 hover:border-gold/30 transition-all"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <h5 className="text-xs font-bold text-ivory">
                              {rev.customer_name}
                            </h5>
                            <span className="text-[10px] text-neutral-400">· {rev.service_name}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            {renderStars(rev.stars, 5, 'w-3 h-3')}
                            <span className="text-xs font-semibold text-gold">
                              {rev.stars} / 5
                            </span>
                          </div>
                        </div>
                        <div className="text-right text-[11px] text-neutral-400">
                          <div>{rev.date}</div>
                          <div className="text-[10px] text-neutral-500">{rev.time}</div>
                        </div>
                      </div>
                      {rev.comment && (
                        <blockquote className="mt-2.5 p-2.5 rounded bg-white/5 border border-white/5 text-xs text-neutral-300 italic">
                          "{rev.comment}"
                        </blockquote>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* TAB CONTENT 2: Completed Services Log */}
            {modalTab === 'services' && (
              <div className="max-h-[380px] overflow-y-auto pr-1">
                {inspectedBarberServices.length === 0 ? (
                  <div className="p-8 text-center rounded-xl bg-charcoal/40 border border-white/5 text-neutral-400">
                    <Scissors className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-xs">No completed services logged for this barber in this period.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-white/10 text-neutral-400 text-[10px] uppercase tracking-wider">
                          <th className="py-2.5 px-3">Ticket / Time</th>
                          <th className="py-2.5 px-3">Customer</th>
                          <th className="py-2.5 px-3">Service</th>
                          <th className="py-2.5 px-3 text-right">Fee</th>
                          <th className="py-2.5 px-3 text-center">Rating</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {inspectedBarberServices.map((srv) => (
                          <tr key={srv.id} className="hover:bg-white/5 transition-colors">
                            <td className="py-2 px-3 font-mono text-[11px] text-neutral-300">
                              <div>#{srv.id}</div>
                              <span className="text-[10px] text-neutral-500">
                                {srv.date} {srv.time}
                              </span>
                            </td>
                            <td className="py-2 px-3 font-medium text-ivory">
                              {srv.customer_name}
                            </td>
                            <td className="py-2 px-3 text-neutral-300">
                              {srv.service_name}
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-emerald-400">
                              ₱{Number(srv.price).toFixed(2)}
                            </td>
                            <td className="py-2 px-3 text-center">
                              {srv.stars ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gold/10 text-gold text-[10px] font-bold border border-gold/30">
                                  <Star className="w-2.5 h-2.5 fill-gold" />
                                  {srv.stars}★
                                </span>
                              ) : (
                                <span className="text-[10px] text-neutral-500 italic">
                                  Unrated
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};

export default BarbershopReviewsTab;
