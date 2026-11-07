import React, { useState } from 'react';
import {
  Search,
  Filter,
  X,
  RotateCcw,
  Calendar,
  ChevronDown,
  DollarSign,
  Tag,
  User,
  CreditCard,
  SlidersHorizontal,
  Download,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export interface TransactionFiltersState {
  search: string;
  channel: 'all' | 'walk-in' | 'online' | 'retail' | 'unknown';
  preset: 'today' | 'this_week' | 'last_7_days' | 'this_month' | 'custom';
  startDate: string;
  endDate: string;
  paymentMethod: string;
  barberId: string;
  status: string;
  category: string;
  minAmount: string;
  maxAmount: string;
}

export interface StaffOption {
  id: number;
  name: string;
}

export interface TransactionFiltersProps {
  filters: TransactionFiltersState;
  onChange: (updated: Partial<TransactionFiltersState>) => void;
  onReset: () => void;
  staffList?: StaffOption[];
  activeFilterCount: number;
  hideDatePresets?: boolean;
  onExportCsv?: () => void;
  canExport?: boolean;
}

const PRESET_OPTIONS: Array<{ id: TransactionFiltersState['preset']; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'this_week', label: 'This Week' },
  { id: 'last_7_days', label: 'Last 7 Days' },
  { id: 'this_month', label: 'This Month' },
  { id: 'custom', label: 'Custom' },
];

const CHANNEL_OPTIONS: Array<{ id: TransactionFiltersState['channel']; label: string }> = [
  { id: 'all', label: 'Overall' },
  { id: 'walk-in', label: 'Walk-in / Cashier' },
  { id: 'online', label: 'Online Booking' },
  { id: 'retail', label: 'Retail Only' },
  { id: 'unknown', label: 'Unknown origin' },
];

export const TransactionFilters: React.FC<TransactionFiltersProps> = ({
  filters,
  onChange,
  onReset,
  staffList = [],
  activeFilterCount,
  hideDatePresets = false,
  onExportCsv,
  canExport = false,
}) => {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  return (
    <div className="bg-charcoal-light border border-white/10 rounded-sm p-4 space-y-3 shadow-md">
      {/* Primary Row: Search Bar, Channel Tabs, Date Preset, Advanced Toggle, Reset */}
      <div className="flex flex-col xl:flex-row gap-3 items-stretch xl:items-center justify-between">
        {/* Search Bar */}
        <div className="relative flex-1 min-w-[260px]">
          <Search className="w-4 h-4 text-ivory-dim absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search Reference #, Invoice ID, Customer, Phone..."
            value={filters.search}
            onChange={(e) => onChange({ search: e.target.value })}
            className="min-h-[44px] w-full bg-charcoal border border-white/10 pl-10 pr-9 py-2 text-xs text-ivory placeholder-ivory-dim/50 focus:border-gold focus:outline-none rounded-sm transition-colors"
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => onChange({ search: '' })}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ivory-dim hover:text-ivory transition-colors p-0.5 cursor-pointer"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Channel Segmented Buttons */}
        <div className="flex items-center bg-charcoal border border-white/10 p-1 rounded-sm overflow-x-auto shrink-0 touch-pan-x [-webkit-overflow-scrolling:touch] scrollbar-none">
          {CHANNEL_OPTIONS.map((opt) => {
            const isActive = filters.channel === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onChange({ channel: opt.id })}
                className={`px-3 py-1.5 text-xs font-semibold rounded-sm transition-all whitespace-nowrap cursor-pointer ${isActive
                  ? 'bg-gold text-charcoal shadow-sm'
                  : 'text-ivory-dim hover:text-ivory hover:bg-white/[0.04]'
                  }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Date Presets Group (Hidden when controlled by parent Reports header) */}
        {!hideDatePresets && (
          <div className="flex items-center bg-charcoal border border-white/10 p-1 rounded-sm overflow-x-auto shrink-0 touch-pan-x [-webkit-overflow-scrolling:touch] scrollbar-none">
            <Calendar className="w-3.5 h-3.5 text-gold ml-2 mr-1 shrink-0" />
            {PRESET_OPTIONS.map((p) => {
              const isActive = filters.preset === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onChange({ preset: p.id })}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-sm transition-all whitespace-nowrap cursor-pointer ${isActive
                    ? 'bg-gold/20 text-gold border border-gold/40'
                    : 'text-ivory-dim hover:text-ivory hover:bg-white/[0.03]'
                    }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Action Controls: Export CSV, Advanced Filters & Reset */}
        <div className="flex items-center gap-2 shrink-0">
          {onExportCsv && (
            <button
              type="button"
              onClick={onExportCsv}
              disabled={!canExport}
              className={`min-h-[44px] px-3 py-2 flex items-center gap-1.5 text-xs font-semibold border rounded-sm transition-all cursor-pointer ${
                canExport
                  ? 'bg-charcoal border-white/10 text-gold hover:text-gold-light hover:bg-gold/10 hover:border-gold/30'
                  : 'bg-charcoal border-white/5 text-ivory-dim/40 cursor-not-allowed'
              }`}
              title="Export Transactions to CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export CSV</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsAdvancedOpen((prev) => !prev)}
            className={`min-h-[44px] px-3.5 py-2 flex items-center gap-2 text-xs font-semibold border rounded-sm transition-all cursor-pointer ${isAdvancedOpen || activeFilterCount > 0
              ? 'bg-gold/15 text-gold border-gold/40'
              : 'bg-charcoal border-white/10 text-ivory-dim hover:text-ivory hover:border-white/20'
              }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-gold" />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="bg-gold text-charcoal text-[10px] font-black px-1.5 py-0.2 rounded-full">
                {activeFilterCount}
              </span>
            )}
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-200 ${isAdvancedOpen ? 'rotate-180 text-gold' : 'text-ivory-dim'
                }`}
            />
          </button>

          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={onReset}
              className="min-h-[44px] px-3 py-2 flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/15 border border-red-500/20 rounded-sm transition-all cursor-pointer"
              title="Reset all filters"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Custom Date Pickers (Shown if Preset is Custom and date presets not hidden) */}
      {!hideDatePresets && filters.preset === 'custom' && (
        <div className="pt-2 border-t border-white/5 flex flex-wrap items-center gap-3">
          <span className="text-[11px] uppercase tracking-wider text-gold font-bold">
            Custom Manila Timeframe:
          </span>
          <div className="flex items-center gap-2">
            <label className="text-xs text-ivory-dim">From:</label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => onChange({ startDate: e.target.value })}
              className="bg-charcoal border border-white/10 px-2.5 py-1.5 text-xs text-ivory rounded-sm focus:border-gold focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-ivory-dim">To:</label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => onChange({ endDate: e.target.value })}
              className="bg-charcoal border border-white/10 px-2.5 py-1.5 text-xs text-ivory rounded-sm focus:border-gold focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* Collapsible Advanced Filters Bar */}
      <AnimatePresence>
        {isAdvancedOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden pt-3 border-t border-white/5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
          >
            {/* Payment Method */}
            <div className="space-y-1">
              <label className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-ivory-dim font-bold">
                <CreditCard className="w-3 h-3 text-gold" />
                Payment Method
              </label>
              <select
                value={filters.paymentMethod}
                onChange={(e) => onChange({ paymentMethod: e.target.value })}
                className="w-full bg-charcoal border border-white/10 px-3 py-2 text-xs text-ivory rounded-sm focus:border-gold focus:outline-none cursor-pointer"
              >
                <option value="all">All Methods</option>
                <option value="Cash">Cash</option>
                <option value="GCash">GCash</option>
                <option value="PayMongo">PayMongo / Card</option>
                <option value="Maya">Maya</option>
                <option value="Split">Split Payment</option>
              </select>
            </div>

            {/* Barber / Staff */}
            <div className="space-y-1">
              <label className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-ivory-dim font-bold">
                <User className="w-3 h-3 text-gold" />
                Barber / Assigned Staff
              </label>
              <select
                value={filters.barberId}
                onChange={(e) => onChange({ barberId: e.target.value })}
                className="w-full bg-charcoal border border-white/10 px-3 py-2 text-xs text-ivory rounded-sm focus:border-gold focus:outline-none cursor-pointer"
              >
                <option value="all">All Barbers</option>
                <option value="unassigned">Unassigned / Retail Only</option>
                {staffList.map((staff) => (
                  <option key={staff.id} value={String(staff.id)}>
                    {staff.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Service / Item Category */}
            <div className="space-y-1">
              <label className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-ivory-dim font-bold">
                <Tag className="w-3 h-3 text-gold" />
                Category
              </label>
              <select
                value={filters.category}
                onChange={(e) => onChange({ category: e.target.value })}
                className="w-full bg-charcoal border border-white/10 px-3 py-2 text-xs text-ivory rounded-sm focus:border-gold focus:outline-none cursor-pointer"
              >
                <option value="all">All Categories</option>
                <option value="haircuts">Haircuts & Styling</option>
                <option value="grooming">Grooming & Treatments</option>
                <option value="retail">Retail Products</option>
              </select>
            </div>

            {/* Amount Range Bounds */}
            <div className="space-y-1">
              <label className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-ivory-dim font-bold">
                <DollarSign className="w-3 h-3 text-gold" />
                Amount Bounds (₱)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="Min ₱"
                  value={filters.minAmount}
                  onChange={(e) => onChange({ minAmount: e.target.value })}
                  className="w-1/2 bg-charcoal border border-white/10 px-2.5 py-2 text-xs text-ivory rounded-sm focus:border-gold focus:outline-none"
                />
                <span className="text-ivory-dim text-xs">—</span>
                <input
                  type="number"
                  placeholder="Max ₱"
                  value={filters.maxAmount}
                  onChange={(e) => onChange({ maxAmount: e.target.value })}
                  className="w-1/2 bg-charcoal border border-white/10 px-2.5 py-2 text-xs text-ivory rounded-sm focus:border-gold focus:outline-none"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
