import React, { useState, useEffect, useCallback, useId, useRef, useMemo } from 'react';
import {
  Calendar,
  Users,
  Star,
  Mail,
  Trash2,
  Play,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  X,
  Eye,
  Send,
  Plus,
  Minus,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search,
  Loader2,
} from 'lucide-react';
import { api } from '@/config/api';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/feedback/Modal';
import { useToast } from '@/components/feedback/ToastContext';
import Portal from '@/components/common/Portal';
import { getManilaDateIso, addDaysToIsoDate, timeToMinutes } from '@/utils/manila-date';
import { bookingService } from '@/features/booking/booking.service';
import type {
  DiagnosticCreateReservationDto,
  DiagnosticReservationResult,
  DiagnosticInsertWalkInsDto,
  DiagnosticWalkInsResult,
  DiagnosticSkipQueueDto,
  DiagnosticCreateReviewDto,
  DiagnosticEmailPreviewDto,
  DiagnosticEmailPreviewResult,
  DiagnosticSendTestEmailDto,
  DiagnosticSendTestEmailResult,
  DiagnosticTestDataCounts,
  DiagnosticTestDataReviewResponse,
  DiagnosticCleanupDto,
  DiagnosticCleanupResult,
} from '@demoshop/shared-types';

interface BranchInfo {
  id: number;
  name: string;
  address?: string;
}

interface BarberItem {
  barber_id: number;
  name: string;
  image?: string | null;
  profile_picture?: string | null;
  status?: string;
  is_off_today?: boolean;
  is_on_duty_today?: boolean;
  is_online_booking_enabled_today?: boolean;
  schedule_reason?: string | null;
}

interface ServiceItem {
  service_id: number;
  title: string;
  price: number;
  duration_minutes?: number;
}

type ActiveTool =
  | 'none'
  | 'reservation'
  | 'walkin'
  | 'skip'
  | 'review'
  | 'email'
  | 'review_data';

// Helper: Format ISO YYYY-MM-DD to "Oct 5, 2026"
const formatDisplayDate = (isoDate: string): string => {
  if (!isoDate) return '';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  const year = Number(parts[0]);
  const month = Number(parts[1]) - 1;
  const day = Number(parts[2]);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${monthNames[month] || ''} ${day}, ${year}`;
};

// Helper: Format ISO YYYY-MM-DD to "Oct 5"
const formatShortDate = (isoDate: string): string => {
  if (!isoDate) return '';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  const month = Number(parts[1]) - 1;
  const day = Number(parts[2]);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${monthNames[month] || ''} ${day}`;
};

// Helper: Clean and sanitize API errors (never expose raw Axios/SQL/Supabase/stack trace)
const cleanErrorMessage = (err: any, fallback: string): string => {
  const msg = err?.response?.data?.message || err?.message;
  if (!msg || typeof msg !== 'string') return fallback;
  const lower = msg.toLowerCase();
  if (
    lower.includes('axios') ||
    lower.includes('sqlstate') ||
    lower.includes('supabase') ||
    lower.includes('redis') ||
    lower.includes('econnrefused') ||
    lower.includes('stack trace') ||
    lower.includes('syntax error')
  ) {
    return fallback;
  }
  return msg;
};

// Helper: Operational Status Tone
const getBarberStatusLabel = (barber: BarberItem): { label: string; tone: 'emerald' | 'amber' | 'neutral' } => {
  if (barber.is_off_today) {
    return { label: 'Off Today', tone: 'neutral' };
  }
  if (barber.is_on_duty_today === false) {
    return { label: 'Not on Shift', tone: 'neutral' };
  }
  if (barber.is_online_booking_enabled_today === false) {
    return { label: 'Walk-in Only', tone: 'amber' };
  }
  return { label: barber.status || 'Available', tone: 'emerald' };
};

// ═════════════════════════════════════════════════════════════════════
// SHARED PRIMITIVE 1: DIAGNOSTIC COMBOBOX
// ═════════════════════════════════════════════════════════════════════
export interface ComboboxOption {
  value: string | number;
  label: string;
  secondaryLabel?: string;
  keywords?: string;
  disabled?: boolean;
  meta?: any;
}

interface DiagnosticComboboxProps {
  options: ComboboxOption[];
  value: string | number | null;
  onChange: (value: any) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  disabled?: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  renderTriggerContent?: (selectedOption: ComboboxOption | undefined) => React.ReactNode;
  renderOptionContent?: (option: ComboboxOption, isSelected: boolean) => React.ReactNode;
  popoverWidthClass?: string;
}

export const DiagnosticCombobox: React.FC<DiagnosticComboboxProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Select an option...',
  searchPlaceholder = 'Search...',
  isLoading = false,
  error = null,
  onRetry,
  disabled = false,
  isOpen,
  onToggle,
  onClose,
  renderTriggerContent,
  renderOptionContent,
  popoverWidthClass = 'w-full',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [openUpward, setOpenUpward] = useState(false);

  const selectedOption = useMemo(
    () => options.find((opt) => opt.value === value),
    [options, value]
  );

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((opt) => {
      const matchLabel = opt.label.toLowerCase().includes(q);
      const matchSec = opt.secondaryLabel?.toLowerCase().includes(q);
      const matchKey = opt.keywords?.toLowerCase().includes(q);
      return matchLabel || matchSec || matchKey;
    });
  }, [options, query]);

  useEffect(() => {
    if (isOpen) {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        setOpenUpward(spaceBelow < 280 && rect.top > 280);
      }
      setHighlightedIndex(0);
      const frame = requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
      return () => cancelAnimationFrame(frame);
    }
    setQuery('');
  }, [isOpen]);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      return () => document.removeEventListener('mousedown', handleOutsideClick);
    }
  }, [isOpen, onClose]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.min(prev + 1, Math.max(0, filteredOptions.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredOptions[highlightedIndex] && !filteredOptions[highlightedIndex].disabled) {
        onChange(filteredOptions[highlightedIndex].value);
        onClose();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (isLoading) {
    return (
      <div className="h-10 w-full rounded border border-white/10 bg-charcoal-light px-3 flex items-center gap-2 text-xs text-ivory-dim">
        <RefreshCw className="w-3.5 h-3.5 animate-spin text-gold" />
        <span>Loading options...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-10 w-full rounded border border-rose-500/30 bg-rose-500/10 px-3 flex items-center justify-between text-xs text-rose-300">
        <span className="truncate">{error}</span>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="text-gold hover:underline text-xs font-semibold ml-2 shrink-0 cursor-pointer"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full" onKeyDown={handleKeyDown}>
      <button
        type="button"
        disabled={disabled || options.length === 0}
        onClick={onToggle}
        className="h-10 w-full rounded border border-white/10 bg-charcoal-light px-3 flex items-center justify-between text-left text-xs transition-colors hover:border-white/20 focus:border-gold outline-none disabled:opacity-50 cursor-pointer"
      >
        <div className="min-w-0 flex-1 pr-2">
          {renderTriggerContent ? (
            renderTriggerContent(selectedOption)
          ) : selectedOption ? (
            <div className="flex items-center justify-between w-full truncate">
              <span className="font-medium text-ivory truncate">{selectedOption.label}</span>
              {selectedOption.secondaryLabel && (
                <span className="text-ivory-dim/60 ml-2 font-mono shrink-0">{selectedOption.secondaryLabel}</span>
              )}
            </div>
          ) : (
            <span className="text-ivory-dim/50">{placeholder}</span>
          )}
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 text-ivory-dim shrink-0 transition-transform ${
            isOpen ? 'rotate-180 text-gold' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          className={`absolute left-0 z-50 ${popoverWidthClass} rounded border border-white/10 bg-charcoal shadow-2xl overflow-hidden animate-fade-in ${
            openUpward ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
        >
          <div className="p-2 border-b border-white/10 bg-charcoal-light/60">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ivory-dim" />
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setHighlightedIndex(0);
                }}
                placeholder={searchPlaceholder}
                className="w-full h-8 pl-8 pr-2.5 bg-charcoal border border-white/10 rounded text-xs text-ivory outline-none focus:border-gold placeholder:text-ivory-dim/40"
              />
            </div>
          </div>

          <div ref={listRef} className="max-h-60 overflow-y-auto p-1 space-y-0.5 custom-scrollbar">
            {filteredOptions.length === 0 ? (
              <div className="p-3 text-center text-xs text-ivory-dim/50">No matching options found</div>
            ) : (
              filteredOptions.map((opt, idx) => {
                const isSelected = opt.value === value;
                const isHighlighted = idx === highlightedIndex;

                return (
                  <button
                    key={String(opt.value)}
                    type="button"
                    disabled={opt.disabled}
                    onClick={() => {
                      onChange(opt.value);
                      onClose();
                    }}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={`w-full px-2.5 py-2 rounded text-left flex items-center justify-between text-xs transition-colors cursor-pointer ${
                      opt.disabled
                        ? 'opacity-40 cursor-not-allowed'
                        : isHighlighted
                        ? 'bg-gold/20 text-gold'
                        : isSelected
                        ? 'bg-gold/10 text-gold font-medium'
                        : 'text-ivory hover:bg-white/5'
                    }`}
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      {renderOptionContent ? (
                        renderOptionContent(opt, isSelected)
                      ) : (
                        <div className="flex items-center justify-between w-full truncate">
                          <span className="truncate">{opt.label}</span>
                          {opt.secondaryLabel && (
                            <span className="text-gold font-mono text-[11px] ml-2 shrink-0">
                              {opt.secondaryLabel}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-gold shrink-0 ml-1.5" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════
// SHARED PRIMITIVE 2: CONTROLLED DEMOSHOP DATE PICKER
// ═════════════════════════════════════════════════════════════════════
interface DiagnosticDatePickerProps {
  value: string; // ISO YYYY-MM-DD
  onChange: (isoDate: string) => void;
  availableDates?: string[]; // ISO dates with open slots
  disabled?: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}

export const DiagnosticDatePicker: React.FC<DiagnosticDatePickerProps> = ({
  value,
  onChange,
  availableDates = [],
  disabled = false,
  isOpen,
  onToggle,
  onClose,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const todayIso = useMemo(() => getManilaDateIso(), []);

  // Calendar navigation state
  const [navYear, setNavYear] = useState<number>(() => {
    const yr = Number(value?.split('-')[0]);
    return Number.isFinite(yr) && yr > 2000 ? yr : Number(todayIso.split('-')[0]);
  });
  const [navMonth, setNavMonth] = useState<number>(() => {
    const m = Number(value?.split('-')[1]) - 1;
    return Number.isFinite(m) && m >= 0 && m <= 11 ? m : Number(todayIso.split('-')[1]) - 1;
  });

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // Sync nav view when value changes
  useEffect(() => {
    if (value) {
      const parts = value.split('-');
      if (parts.length === 3) {
        setNavYear(Number(parts[0]));
        setNavMonth(Number(parts[1]) - 1);
      }
    }
  }, [value]);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      return () => document.removeEventListener('mousedown', handleOutsideClick);
    }
  }, [isOpen, onClose]);

  const handlePrevMonth = () => {
    if (navMonth === 0) {
      setNavMonth(11);
      setNavYear((y) => y - 1);
    } else {
      setNavMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (navMonth === 11) {
      setNavMonth(0);
      setNavYear((y) => y + 1);
    } else {
      setNavMonth((m) => m + 1);
    }
  };

  // Calendar cells matrix calculation
  const calendarCells = useMemo(() => {
    const firstDayIndex = new Date(Date.UTC(navYear, navMonth, 1)).getUTCDay(); // 0 (Sun) to 6 (Sat)
    const daysInCurrentMonth = new Date(Date.UTC(navYear, navMonth + 1, 0)).getUTCDate();

    const cells: { dateIso: string; dayNum: number; isCurrentMonth: boolean }[] = [];

    // Empty lead cells
    for (let i = 0; i < firstDayIndex; i++) {
      cells.push({ dateIso: '', dayNum: 0, isCurrentMonth: false });
    }

    // Current month cells
    for (let d = 1; d <= daysInCurrentMonth; d++) {
      const iso = `${navYear}-${String(navMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ dateIso: iso, dayNum: d, isCurrentMonth: true });
    }

    return cells;
  }, [navYear, navMonth]);

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        disabled={disabled}
        onClick={onToggle}
        className="h-10 w-full rounded border border-white/10 bg-charcoal-light px-3 flex items-center justify-between text-left text-xs transition-colors hover:border-white/20 focus:border-gold outline-none disabled:opacity-50 cursor-pointer"
      >
        <span className="font-medium text-ivory font-mono">
          {formatDisplayDate(value) || 'Select date...'}
        </span>
        <Calendar className="w-4 h-4 text-gold shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute left-0 z-50 mt-1 w-72 rounded border border-white/10 bg-charcoal shadow-2xl p-3 animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between pb-2 border-b border-white/10 text-xs">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1 rounded text-ivory-dim hover:text-ivory hover:bg-white/5 cursor-pointer"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-mono font-semibold text-ivory text-xs">
              {monthNames[navMonth]} {navYear}
            </span>
            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1 rounded text-ivory-dim hover:text-ivory hover:bg-white/5 cursor-pointer"
              aria-label="Next month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Day of Week Labels */}
          <div className="grid grid-cols-7 gap-1 text-center font-mono text-[10px] text-ivory-dim/60 py-1.5 border-b border-white/5">
            <span>Su</span>
            <span>Mo</span>
            <span>Tu</span>
            <span>We</span>
            <span>Th</span>
            <span>Fr</span>
            <span>Sa</span>
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1 pt-1.5 text-xs font-mono">
            {calendarCells.map((cell, idx) => {
              if (!cell.isCurrentMonth) {
                return <div key={`empty-${idx}`} className="h-7 w-7" />;
              }

              const isPast = cell.dateIso < todayIso;
              const isToday = cell.dateIso === todayIso;
              const isSelected = cell.dateIso === value;
              const hasOnlineSlots = availableDates.length > 0 && availableDates.includes(cell.dateIso);

              return (
                <button
                  key={cell.dateIso}
                  type="button"
                  disabled={isPast}
                  onClick={() => {
                    onChange(cell.dateIso);
                    onClose();
                  }}
                  className={`h-7 w-7 rounded flex flex-col items-center justify-center relative transition-colors cursor-pointer ${
                    isPast
                      ? 'opacity-20 cursor-not-allowed text-ivory-dim'
                      : isSelected
                      ? 'bg-gold text-charcoal font-bold shadow-sm'
                      : isToday
                      ? 'border border-gold text-gold hover:bg-gold/15'
                      : 'text-ivory hover:bg-white/10'
                  }`}
                >
                  <span className="text-[11px] leading-none">{cell.dayNum}</span>
                  {hasOnlineSlots && !isSelected && (
                    <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-emerald-400" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════
// SHARED PRIMITIVE 3: ACTIONABLE TIME SLOT PICKER
// ═════════════════════════════════════════════════════════════
interface DiagnosticSlotPickerProps {
  slots: string[];
  selectedSlot: string;
  onSelectSlot: (slot: string) => void;
  isLoading?: boolean;
  notice?: string | null;
  targetDate: string;
  disabled?: boolean;
}

export const DiagnosticSlotPicker: React.FC<DiagnosticSlotPickerProps> = ({
  slots,
  selectedSlot,
  onSelectSlot,
  isLoading = false,
  notice = null,
  targetDate,
  disabled = false,
}) => {
  const morningSlots = useMemo(() => slots.filter((s) => timeToMinutes(s) < 720), [slots]);
  const afternoonSlots = useMemo(
    () => slots.filter((s) => {
      const m = timeToMinutes(s);
      return m >= 720 && m < 1020;
    }),
    [slots]
  );
  const eveningSlots = useMemo(() => slots.filter((s) => timeToMinutes(s) >= 1020), [slots]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-ivory/80 uppercase tracking-wider font-mono">
          Available Time
        </span>
        {slots.length > 0 && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onSelectSlot(slots[0])}
            className="text-[11px] font-mono text-gold hover:underline cursor-pointer disabled:opacity-40 disabled:no-underline"
          >
            First Available ({slots[0]})
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="h-14 rounded border border-white/10 bg-charcoal-light px-3 flex items-center justify-center gap-2 text-xs text-ivory-dim font-mono">
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-gold" />
          <span>Evaluating live schedule &amp; appointment slots...</span>
        </div>
      ) : slots.length === 0 ? (
        <div className="p-3 bg-charcoal-light border border-white/10 rounded text-xs space-y-1">
          <div className="text-amber-400 font-medium">
            No available times on {formatDisplayDate(targetDate)}.
          </div>
          <div className="text-[11px] text-ivory-dim/60">
            {notice || 'Try choosing another date or an on-duty barber.'}
          </div>
        </div>
      ) : (
        <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
          {morningSlots.length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-ivory-dim/60">
                Morning
              </span>
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
                {morningSlots.map((slot) => {
                  const isSelected = selectedSlot === slot;
                  return (
                    <button
                      key={slot}
                      type="button"
                      disabled={disabled}
                      onClick={() => onSelectSlot(slot)}
                      className={`py-1.5 px-1 text-center font-mono text-xs rounded border transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                        isSelected
                          ? 'bg-gold text-charcoal font-bold border-gold shadow-sm'
                          : 'bg-charcoal-light border-white/10 text-ivory hover:border-gold/50'
                      }`}
                    >
                      {slot}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {afternoonSlots.length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-ivory-dim/60">
                Afternoon
              </span>
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
                {afternoonSlots.map((slot) => {
                  const isSelected = selectedSlot === slot;
                  return (
                    <button
                      key={slot}
                      type="button"
                      disabled={disabled}
                      onClick={() => onSelectSlot(slot)}
                      className={`py-1.5 px-1 text-center font-mono text-xs rounded border transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                        isSelected
                          ? 'bg-gold text-charcoal font-bold border-gold shadow-sm'
                          : 'bg-charcoal-light border-white/10 text-ivory hover:border-gold/50'
                      }`}
                    >
                      {slot}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {eveningSlots.length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-ivory-dim/60">
                Evening
              </span>
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
                {eveningSlots.map((slot) => {
                  const isSelected = selectedSlot === slot;
                  return (
                    <button
                      key={slot}
                      type="button"
                      disabled={disabled}
                      onClick={() => onSelectSlot(slot)}
                      className={`py-1.5 px-1 text-center font-mono text-xs rounded border transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                        isSelected
                          ? 'bg-gold text-charcoal font-bold border-gold shadow-sm'
                          : 'bg-charcoal-light border-white/10 text-ivory hover:border-gold/50'
                      }`}
                    >
                      {slot}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════
// SHARED PRIMITIVE 4: COMPACT SEGMENTED CONTROL
// ═════════════════════════════════════════════════════════════
interface DiagnosticSegmentedControlProps {
  label: string;
  value: string;
  onChange: (value: any) => void;
  options: { value: string; label: string; sublabel?: string }[];
  disabled?: boolean;
}

export const DiagnosticSegmentedControl: React.FC<DiagnosticSegmentedControlProps> = ({
  label,
  value,
  onChange,
  options,
  disabled = false,
}) => (
  <div className="space-y-1.5">
    <span className="text-xs font-semibold text-ivory/80 uppercase tracking-wider font-mono">
      {label}
    </span>
    <div className="flex rounded border border-white/10 bg-charcoal-light p-0.5">
      {options.map((opt) => {
        const isSelected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={`flex-1 py-1.5 px-3 text-xs rounded transition-colors cursor-pointer font-medium text-center disabled:opacity-50 disabled:cursor-not-allowed ${
              isSelected
                ? 'bg-gold text-charcoal font-bold shadow-sm'
                : 'text-ivory-dim hover:text-ivory hover:bg-white/5'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
    {options.find((o) => o.value === value)?.sublabel && (
      <span className="text-[10px] text-ivory-dim/60 block font-sans">
        {options.find((o) => o.value === value)?.sublabel}
      </span>
    )}
  </div>
);

// ═════════════════════════════════════════════════════════════════════
// MAIN DEMO & TESTING TAB COMPONENT
// ═════════════════════════════════════════════════════════════════════
export const DemoTestingTab: React.FC = () => {
  // ── 1. Operating Branch Resolution (Internal & Read-Only) ─────────
  const [activeBranch, setActiveBranch] = useState<BranchInfo | null>(null);
  const [, setIsLoadingBranch] = useState<boolean>(true);
  const [branchError, setBranchError] = useState<string | null>(null);

  // ── 2. Shared Barber Collection State ─────────────────────────────
  const [barbers, setBarbers] = useState<BarberItem[]>([]);
  const [isLoadingBarbers, setIsLoadingBarbers] = useState<boolean>(false);
  const [barbersError, setBarbersError] = useState<string | null>(null);

  // ── 3. Shared Services Collection State ───────────────────────────
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [isLoadingServices, setIsLoadingServices] = useState<boolean>(false);
  const [servicesError, setServicesError] = useState<string | null>(null);

  // ── Active Drawer & Popover State ─────────────────────────────────
  const [activeTool, setActiveTool] = useState<ActiveTool>('none');
  const [activePopover, setActivePopover] = useState<string | null>(null);

  // ── Test Data Live Counts ───────────────────────────────────────────
  const [testCounts, setTestCounts] = useState<DiagnosticTestDataCounts>({
    reservationsCount: 0,
    walkInsCount: 0,
    reviewsCount: 0,
    total: 0,
  });
  const [isLoadingCounts, setIsLoadingCounts] = useState<boolean>(false);

  // ── Reservation Simulator State ────────────────────────────────────
  const [resBarberId, setResBarberId] = useState<number | null>(null);
  const [resServiceId, setResServiceId] = useState<number | null>(null);
  const [resDate, setResDate] = useState<string>(() => addDaysToIsoDate(getManilaDateIso(), 1));
  const [resTime, setResTime] = useState<string>('');
  const [resAvailableSlots, setResAvailableSlots] = useState<string[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState<boolean>(false);
  const [slotsNotice, setSlotsNotice] = useState<string | null>(null);
  const [barberOnlineDates, setBarberOnlineDates] = useState<string[]>([]);
  const [resInitialStatus, setResInitialStatus] = useState<'pending' | 'accepted'>('pending');
  const [isSubmittingRes, setIsSubmittingRes] = useState<boolean>(false);
  const [resResult, setResResult] = useState<DiagnosticReservationResult | null>(null);
  const [resError, setResError] = useState<string | null>(null);

  // ── Walk-in Generator State ─────────────────────────────────────────
  const [walkBarberId, setWalkBarberId] = useState<number | null>(null);
  const [walkServiceId, setWalkServiceId] = useState<number | null>(null);
  const [walkQty, setWalkQty] = useState<number>(5);
  const [isSubmittingWalk, setIsSubmittingWalk] = useState<boolean>(false);
  const [walkResult, setWalkResult] = useState<DiagnosticWalkInsResult | null>(null);
  const [walkError, setWalkError] = useState<string | null>(null);

  // ── Queue Inspector / Skip State ────────────────────────────────────
  const [skipBarberId, setSkipBarberId] = useState<number | null>(null);
  const [skipQueueList, setSkipQueueList] = useState<any[]>([]);
  const [isLoadingSkipQueue, setIsLoadingSkipQueue] = useState<boolean>(false);
  const [selectedEntryToSkip, setSelectedEntryToSkip] = useState<any | null>(null);
  const [skipReasonCategory, setSkipReasonCategory] = useState<'demonstration' | 'not_present' | 'other'>('demonstration');
  const [skipCustomReason, setSkipCustomReason] = useState<string>('');
  const [isSkippingEntry, setIsSkippingEntry] = useState<boolean>(false);
  const [skipMessage, setSkipMessage] = useState<string | null>(null);
  const [skipError, setSkipError] = useState<string | null>(null);

  // ── Barber Review Generator State ───────────────────────────────────
  const [revBarberId, setRevBarberId] = useState<number | null>(null);
  const [revStars, setRevStars] = useState<number>(5);
  const [hoverStars, setHoverStars] = useState<number | null>(null);
  const [revComment, setRevComment] = useState<string>('');
  const [revIsPublic, setRevIsPublic] = useState<boolean>(true);
  const [isSubmittingRev, setIsSubmittingRev] = useState<boolean>(false);
  const [revSuccess, setRevSuccess] = useState<boolean>(false);
  const [revError, setRevError] = useState<string | null>(null);

  // ── Email Tester State ──────────────────────────────────────────────
  const [emailTemplate, setEmailTemplate] = useState<string>('RESERVATION_CONFIRMED');
  const [emailRecipient, setEmailRecipient] = useState<string>('');
  const [emailCustomerName, setEmailCustomerName] = useState<string>('Test Customer');
  const [emailBarberName, setEmailBarberName] = useState<string>('Kent Mutya');
  const [emailServiceTitle, setEmailServiceTitle] = useState<string>('Hair Cut');
  const [emailDate, setEmailDate] = useState<string>(() => getManilaDateIso());
  const [emailTime, setEmailTime] = useState<string>('10:00 AM');
  const [emailDeclineReason, setEmailDeclineReason] = useState<string>('Barber schedule conflict');
  const [emailReceiptNo, setEmailReceiptNo] = useState<string>('RCP-DEMO-001');
  const [emailPreviewHtml, setEmailPreviewHtml] = useState<{ subject: string; html: string } | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState<boolean>(false);
  const [isSendingEmail, setIsSendingEmail] = useState<boolean>(false);
  const [emailSendResult, setEmailSendResult] = useState<DiagnosticSendTestEmailResult | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [showSendConfirmation, setShowSendConfirmation] = useState<boolean>(false);

  // ── Test Data Review & Cleanup State ─────────────────────────────────
  const [testDataReview, setTestDataReview] = useState<DiagnosticTestDataReviewResponse | null>(null);
  const [isLoadingReview, setIsLoadingReview] = useState<boolean>(false);
  const [cleanupScope, setCleanupScope] = useState<'all' | 'reservations' | 'walk-ins' | 'reviews'>('all');
  const [isCleaningUp, setIsCleaningUp] = useState<boolean>(false);
  const [cleanupResult, setCleanupResult] = useState<DiagnosticCleanupResult | null>(null);
  const [cleanupError, setCleanupError] = useState<string | null>(null);
  const [showCleanupModal, setShowCleanupModal] = useState<boolean>(false);

  const customReasonInputId = useId();
  const emailInputId = useId();

  // Toast context for mutation feedback lifecycle
  const { addToast } = useToast();

  // In-flight mutation guards to prevent rapid double-clicks or duplicate Enter events
  const resInFlightRef = useRef(false);
  const walkInFlightRef = useRef(false);
  const skipInFlightRef = useRef(false);
  const revInFlightRef = useRef(false);
  const emailInFlightRef = useRef(false);
  const cleanupInFlightRef = useRef(false);

  // ── Keyboard Management: Escape Handling ────────────────────────────
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (activePopover) {
          e.preventDefault();
          e.stopPropagation();
          setActivePopover(null);
        } else if (activeTool !== 'none') {
          setActiveTool('none');
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, { capture: true });
  }, [activePopover, activeTool]);

  // ── Shared Barber Combobox Options ──────────────────────────────────
  const barberComboboxOptions = useMemo<ComboboxOption[]>(() => {
    return barbers.map((b) => {
      const status = getBarberStatusLabel(b);
      return {
        value: b.barber_id,
        label: b.name,
        secondaryLabel: status.label,
        keywords: `${b.name} ${status.label}`,
        meta: b,
      };
    });
  }, [barbers]);

  // ── Shared Service Combobox Options ─────────────────────────────────
  const serviceComboboxOptions = useMemo<ComboboxOption[]>(() => {
    return services.map((s) => ({
      value: s.service_id,
      label: s.title,
      secondaryLabel: `₱${s.price.toFixed(2)}`,
      keywords: `${s.title} ₱${s.price}`,
      meta: s,
    }));
  }, [services]);

  // ── Email Template Combobox Options ─────────────────────────────────
  const emailTemplateOptions = useMemo<ComboboxOption[]>(
    () => [
      { value: 'RESERVATION_CONFIRMED', label: 'Reservation Confirmed', secondaryLabel: 'Reservation' },
      { value: 'BOOKING_RECEIVED', label: 'Booking Received (Under Review)', secondaryLabel: 'Reservation' },
      { value: 'RESERVATION_DECLINED', label: 'Reservation Declined', secondaryLabel: 'Reservation' },
      { value: 'RESERVATION_CANCELLED', label: 'Reservation Cancelled', secondaryLabel: 'Reservation' },
      { value: 'DAILY_STOCK_REPORT', label: 'Daily Stock Report', secondaryLabel: 'Inventory' },
      { value: 'RECEIPT', label: 'Receipt Email', secondaryLabel: 'Billing' },
      { value: 'ACCOUNT_VERIFICATION_OTP', label: 'Account Verification OTP', secondaryLabel: 'Auth' },
      { value: 'FORGOT_PASSWORD_OTP', label: 'Forgot Password OTP', secondaryLabel: 'Auth' },
      { value: 'CHANGE_PASSWORD_OTP', label: 'Change Password OTP', secondaryLabel: 'Auth' },
    ],
    []
  );

  // ── Load Shared Branch, Barbers, and Services ────────────────────────
  const fetchCounts = useCallback(async () => {
    setIsLoadingCounts(true);
    try {
      const res = await api.get<DiagnosticTestDataCounts>('/api/system-admin/diagnostics/test-data');
      if (res.data) setTestCounts(res.data);
    } catch {
      // silently handle
    } finally {
      setIsLoadingCounts(false);
    }
  }, []);

  const fetchBarbersForBranch = useCallback(async (branchId: number) => {
    setIsLoadingBarbers(true);
    setBarbersError(null);
    try {
      const res = await api.get(`/api/queue/public/barbers?branchId=${branchId}`);
      const raw = Array.isArray(res.data) ? res.data : [];
      const norm: BarberItem[] = raw.map((b: any) => ({
        barber_id: b.barber_id || b.id,
        name: b.name || `Barber #${b.id}`,
        image: b.image || b.profile_picture || null,
        profile_picture: b.profile_picture || b.image || null,
        status: b.status || 'Available',
        is_off_today: Boolean(b.is_off_today),
        is_on_duty_today: b.is_on_duty_today ?? b.isOnDutyToday ?? true,
        is_online_booking_enabled_today: b.is_online_booking_enabled_today ?? b.isOnlineBookingEnabledToday ?? true,
        schedule_reason: b.schedule_reason || null,
      }));
      setBarbers(norm);
      if (norm.length > 0) {
        setResBarberId((prev) => prev ?? norm[0].barber_id);
        setWalkBarberId((prev) => prev ?? norm[0].barber_id);
        setSkipBarberId((prev) => prev ?? norm[0].barber_id);
        setRevBarberId((prev) => prev ?? norm[0].barber_id);
      }
    } catch {
      setBarbersError('Unable to load barbers.');
    } finally {
      setIsLoadingBarbers(false);
    }
  }, []);

  const fetchServicesData = useCallback(async () => {
    setIsLoadingServices(true);
    setServicesError(null);
    try {
      const res = await api.get('/api/services');
      const raw = Array.isArray(res.data) ? res.data : [];
      const norm: ServiceItem[] = raw.map((s: any) => ({
        service_id: s.service_id || s.id,
        title: s.title || s.name || 'Service',
        price: Number(s.price) || 0,
        duration_minutes: s.duration_minutes,
      }));
      setServices(norm);
      if (norm.length > 0) {
        setResServiceId((prev) => prev ?? norm[0].service_id);
        setWalkServiceId((prev) => prev ?? norm[0].service_id);
      }
    } catch {
      setServicesError('Unable to load services.');
    } finally {
      setIsLoadingServices(false);
    }
  }, []);

  const initData = useCallback(async () => {
    setIsLoadingBranch(true);
    setBranchError(null);
    try {
      const res = await api.get('/api/queue/public/branches');
      const rawBranches = Array.isArray(res.data) ? res.data : [];
      if (rawBranches.length === 0) {
        setBranchError('The active shop branch could not be determined.');
        return;
      }
      // The product is single-branch SampleBranch. Prefer the canonical name when
      // the API returns more than one row, while still using the API id.
      const branch = rawBranches.find((candidate: any) =>
        String(candidate.name || '').trim().toLowerCase() === 'samplebranch branch'
      ) || rawBranches[0];
      const branchId = Number(branch.branch_id || branch.id);
      if (!Number.isInteger(branchId) || branchId <= 0) {
        setBranchError('The active SampleBranch branch could not be determined.');
        return;
      }
      const primaryBranch: BranchInfo = {
        id: branchId,
        name: branch.name || 'SampleBranch Branch',
        address: branch.address || '',
      };
      setActiveBranch(primaryBranch);

      await Promise.all([
        fetchBarbersForBranch(primaryBranch.id),
        fetchServicesData(),
        fetchCounts(),
      ]);
    } catch {
      setBranchError('The active shop branch could not be determined.');
    } finally {
      setIsLoadingBranch(false);
    }
  }, [fetchBarbersForBranch, fetchServicesData, fetchCounts]);

  useEffect(() => {
    initData();
  }, [initData]);

  // ── Load Online Booking Dates for Selected Barber ───────────────────
  useEffect(() => {
    if (!resBarberId) return;
    const today = getManilaDateIso();
    const end = addDaysToIsoDate(today, 21);

    api.get(`/api/queue/public/barber-schedule?barberId=${resBarberId}&startDate=${today}&endDate=${end}`)
      .then((res) => {
        const dates: string[] = res.data?.onlineBookingDates || [];
        setBarberOnlineDates(dates);

        // Auto-select the next available date if current date is not bookable
        if (dates.length > 0) {
          const nextAvail = dates.find((d) => d >= today);
          if (nextAvail && (!resDate || !dates.includes(resDate))) {
            setResDate(nextAvail);
            setResTime('');
          }
        }
      })
      .catch(() => {
        setBarberOnlineDates([]);
      });
  }, [resBarberId]);

  // ── Dependent Field Flow: Real Availability for Reservation Simulator ──
  useEffect(() => {
    if (!resBarberId || !resServiceId || !resDate || !activeBranch?.id) {
      setResAvailableSlots([]);
      setSlotsNotice(null);
      return;
    }

    let isCancelled = false;
    setIsLoadingSlots(true);
    setSlotsNotice(null);

    bookingService.fetchAvailability(resBarberId, resDate, resServiceId, activeBranch.id)
      .then((avail) => {
        if (isCancelled) return;
        const slots = (avail?.availableSlots || []).map((s: any) => s.hour || s.time || String(s));
        setResAvailableSlots(slots);
        if (slots.length === 0) {
          setSlotsNotice(avail?.reason || 'No appointment slots open on this date.');
        } else {
          setSlotsNotice(null);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setResAvailableSlots([]);
          setSlotsNotice('Unable to evaluate live time slots.');
        }
      })
      .finally(() => {
        if (!isCancelled) setIsLoadingSlots(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [resBarberId, resServiceId, resDate, activeBranch?.id]);

  // ── Load Barber's Live Queue for Queue Inspector ───────────────────
  const fetchSkipQueue = useCallback(async (barberId: number) => {
    if (!barberId) return;
    setIsLoadingSkipQueue(true);
    setSkipError(null);
    try {
      const res = await api.get<any[]>(`/api/system-admin/diagnostics/queue/barber/${barberId}`);
      setSkipQueueList(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      setSkipError(err.response?.data?.message || 'Unable to load active barber queue.');
    } finally {
      setIsLoadingSkipQueue(false);
    }
  }, []);

  useEffect(() => {
    if (activeTool === 'skip' && skipBarberId) {
      fetchSkipQueue(skipBarberId);
    }
  }, [activeTool, skipBarberId, fetchSkipQueue]);

  // ── Handler: Create Test Reservation ────────────────────────────────
  const handleCreateReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (resInFlightRef.current) return;
    if (!activeBranch?.id || !resBarberId || !resServiceId) {
      setResError('Please select a barber and service.');
      return;
    }
    if (isLoadingSlots) {
      setResError('Please wait while live appointment slots are checked.');
      return;
    }
    const chosenTime = resTime || resAvailableSlots[0];
    if (!chosenTime) {
      setResError('No live appointment slot is available for this barber, service, and date. Choose another date or barber.');
      return;
    }

    resInFlightRef.current = true;
    setIsSubmittingRes(true);
    setResError(null);

    const barberObj = barbers.find((b) => b.barber_id === resBarberId);
    const barberName = barberObj?.name || 'Barber';
    const serviceObj = services.find((s) => s.service_id === resServiceId);
    const serviceTitle = serviceObj?.title || 'Service';

    // Single stable toast ID for the entire mutation lifecycle
    const toastId = `diag_res_${Date.now()}`;
    addToast({
      id: toastId,
      type: 'loading',
      title: 'Creating test reservation…',
      message: `${barberName} · ${serviceTitle} · ${formatShortDate(resDate)} · ${chosenTime}`,
    });

    // Deliberate submission: ONE stable request key to ensure backend idempotency
    const idempotencyKey = `diag_test_res_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;

    try {
      const dto: DiagnosticCreateReservationDto = {
        branchId: activeBranch.id,
        barberId: resBarberId,
        serviceIds: [resServiceId],
        preferredDate: resDate,
        preferredTime: chosenTime,
        initialStatus: resInitialStatus,
        idempotencyKey,
      };

      const res = await api.post<DiagnosticReservationResult>('/api/system-admin/diagnostics/reservations', dto);
      const createdData = res.data;
      // Notify another same-origin cashier tab without creating any server,
      // database, or Redis traffic. Realtime remains the cross-device path.
      try {
        const reservationChannel = new BroadcastChannel('demoshop_reservations_channel');
        reservationChannel.postMessage({ type: 'reservation-created' });
        reservationChannel.close();
      } catch {
        // BroadcastChannel is optional; the normal Realtime/fallback path remains.
      }

      // IMMEDIATELY update the same loading toast to success
      const statusTag = createdData.status === 'accepted' ? 'Accepted' : 'Pending Review';
      addToast({
        id: toastId,
        type: 'success',
        title: 'Test reservation created',
        message: `${createdData.barberName || barberName} · ${createdData.serviceTitles?.join(', ') || serviceTitle}\n${formatDisplayDate(resDate)} · ${chosenTime}\n${statusTag}`,
      });

      // Clear submitting state immediately so UI does not remain stuck
      setIsSubmittingRes(false);
      resInFlightRef.current = false;

      // Close drawer and reset form state for clean next opening
      setActiveTool('none');
      setResTime('');
      setResResult(null);
      setResError(null);

      // Asynchronously refresh counts and queue without blocking UI
      fetchCounts().catch(() => {});
      if (skipBarberId === resBarberId) {
        fetchSkipQueue(resBarberId).catch(() => {});
      }
    } catch (err: any) {
      const errorMsg = cleanErrorMessage(err, 'Unable to create test reservation.');
      addToast({
        id: toastId,
        type: 'error',
        title: 'Unable to create reservation',
        message: errorMsg,
      });
      setResError(errorMsg);
      setIsSubmittingRes(false);
      resInFlightRef.current = false;

      // Unlock form, KEEP selections, and refresh availability in case slot changed
      if (resBarberId && resServiceId && resDate && activeBranch?.id) {
        bookingService.fetchAvailability(resBarberId, resDate, resServiceId, activeBranch.id)
          .then((avail) => {
            const slots = (avail?.availableSlots || []).map((s: any) => s.hour || s.time || String(s));
            setResAvailableSlots(slots);
          })
          .catch(() => {});
      }
    }
  };

  // ── Handler: Insert Test Walk-ins ───────────────────────────────────
  const handleInsertWalkIns = async (e: React.FormEvent) => {
    e.preventDefault();
    if (walkInFlightRef.current) return;
    if (!activeBranch?.id || !walkBarberId || !walkServiceId) {
      setWalkError('Please select a barber and service.');
      return;
    }

    walkInFlightRef.current = true;
    setIsSubmittingWalk(true);
    setWalkError(null);

    const barberObj = barbers.find((b) => b.barber_id === walkBarberId);
    const barberName = barberObj?.name || 'Barber';
    const serviceObj = services.find((s) => s.service_id === walkServiceId);
    const serviceTitle = serviceObj?.title || 'Service';

    const toastId = `diag_walk_${Date.now()}`;
    addToast({
      id: toastId,
      type: 'loading',
      title: `Inserting ${walkQty} test walk-in${walkQty > 1 ? 's' : ''}…`,
      message: `${barberName} · ${serviceTitle}`,
    });

    const idempotencyKey = `diag_batch_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;

    try {
      const dto: DiagnosticInsertWalkInsDto = {
        branchId: activeBranch.id,
        barberId: walkBarberId,
        serviceIds: [walkServiceId],
        quantity: walkQty,
        idempotencyKey,
      };

      const res = await api.post<DiagnosticWalkInsResult>('/api/system-admin/diagnostics/walk-ins', dto);

      addToast({
        id: toastId,
        type: 'success',
        title: 'Test walk-ins added',
        message: `${walkQty} test walk-in${walkQty > 1 ? 's' : ''} added to ${res.data.barberName || barberName}'s queue.`,
      });

      setIsSubmittingWalk(false);
      walkInFlightRef.current = false;

      setActiveTool('none');
      setWalkResult(null);
      setWalkError(null);

      fetchCounts().catch(() => {});
      if (skipBarberId === walkBarberId) {
        fetchSkipQueue(walkBarberId).catch(() => {});
      }
    } catch (err: any) {
      const errorMsg = cleanErrorMessage(err, 'Unable to insert test walk-ins.');
      addToast({
        id: toastId,
        type: 'error',
        title: 'Unable to insert test walk-ins',
        message: errorMsg,
      });
      setWalkError(errorMsg);
      setIsSubmittingWalk(false);
      walkInFlightRef.current = false;
    }
  };

  // ── Handler: Skip Queue Entry ───────────────────────────────────────
  const handleConfirmSkipEntry = async () => {
    if (skipInFlightRef.current || !selectedEntryToSkip) return;

    skipInFlightRef.current = true;
    setIsSkippingEntry(true);
    setSkipError(null);

    const entryToSkip = selectedEntryToSkip;
    const entryName = entryToSkip.guest_name || entryToSkip.customer_name || 'Walk-in';
    const toastId = `diag_skip_${Date.now()}`;

    addToast({
      id: toastId,
      type: 'loading',
      title: 'Skipping queue entry…',
      message: `${entryName} (${entryToSkip.service_name || 'Service'})`,
    });

    try {
      const reason = skipReasonCategory === 'other' ? skipCustomReason : undefined;
      const dto: DiagnosticSkipQueueDto = {
        reasonCategory: skipReasonCategory,
        reason,
      };

      const res = await api.post<{ success: boolean; message: string }>(
        `/api/system-admin/diagnostics/queue/${entryToSkip.id}/skip`,
        dto
      );

      addToast({
        id: toastId,
        type: 'success',
        title: 'Queue entry skipped',
        message: res.data.message || `Queue entry for ${entryName} was skipped.`,
      });

      setIsSkippingEntry(false);
      skipInFlightRef.current = false;
      setSelectedEntryToSkip(null);
      setSkipMessage(res.data.message || 'Queue entry skipped successfully.');

      if (skipBarberId) {
        fetchSkipQueue(skipBarberId).catch(() => {});
      }
      fetchCounts().catch(() => {});
    } catch (err: any) {
      const errorMsg = cleanErrorMessage(err, 'Unable to skip queue entry.');
      addToast({
        id: toastId,
        type: 'error',
        title: 'Unable to skip queue entry',
        message: errorMsg,
      });
      setSkipError(errorMsg);
      setIsSkippingEntry(false);
      skipInFlightRef.current = false;

      // If entry already changed/disappeared, refetch queue to show current reality
      if (skipBarberId) {
        fetchSkipQueue(skipBarberId).catch(() => {});
      }
    }
  };

  // ── Handler: Submit Test Review ─────────────────────────────────────
  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (revInFlightRef.current) return;
    if (!revBarberId) {
      setRevError('Please select a barber.');
      return;
    }

    revInFlightRef.current = true;
    setIsSubmittingRev(true);
    setRevError(null);
    setRevSuccess(false);

    const barberObj = barbers.find((b) => b.barber_id === revBarberId);
    const barberName = barberObj?.name || 'Barber';
    const toastId = `diag_rev_${Date.now()}`;

    addToast({
      id: toastId,
      type: 'loading',
      title: 'Creating test review…',
      message: `${barberName} · ${revStars} Star${revStars > 1 ? 's' : ''}`,
    });

    try {
      const dto: DiagnosticCreateReviewDto = {
        barberId: revBarberId,
        stars: revStars,
        comment: revComment,
        showInPublicPortfolio: revIsPublic,
      };

      await api.post('/api/system-admin/diagnostics/reviews', dto);

      addToast({
        id: toastId,
        type: 'success',
        title: 'Test review created',
        message: `Test review for ${barberName} (${revStars} stars) recorded.`,
      });

      setIsSubmittingRev(false);
      revInFlightRef.current = false;

      setActiveTool('none');
      setRevComment('');
      setRevError(null);

      fetchCounts().catch(() => {});
    } catch (err: any) {
      const errorMsg = cleanErrorMessage(err, 'Unable to create test review.');
      addToast({
        id: toastId,
        type: 'error',
        title: 'Unable to create test review',
        message: errorMsg,
      });
      setRevError(errorMsg);
      setIsSubmittingRev(false);
      revInFlightRef.current = false;
    }
  };

  // ── Handler: Preview Email ──────────────────────────────────────────
  const handlePreviewEmail = async () => {
    setIsLoadingPreview(true);
    setEmailError(null);
    try {
      const dto: DiagnosticEmailPreviewDto = {
        templateType: emailTemplate,
        variables: {
          customerName: emailCustomerName,
          barberName: emailBarberName,
          serviceTitle: emailServiceTitle,
          preferredDate: emailDate,
          preferredTime: emailTime,
          declineReason: emailDeclineReason,
          cancelReason: emailDeclineReason,
          receiptNumber: emailReceiptNo,
          firstName: emailCustomerName.split(' ')[0] || 'Customer',
        },
      };
      const res = await api.post<DiagnosticEmailPreviewResult>('/api/system-admin/diagnostics/email/preview', dto);
      setEmailPreviewHtml(res.data);
    } catch (err: any) {
      setEmailError(err.response?.data?.message || 'Unable to render email preview.');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  // ── Handler: Send Test Email ────────────────────────────────────────
  const handleSendTestEmail = async () => {
    if (emailInFlightRef.current) return;
    if (!emailRecipient || !emailRecipient.includes('@')) {
      setEmailError('Please enter a valid recipient email address.');
      return;
    }

    emailInFlightRef.current = true;
    setIsSendingEmail(true);
    setEmailError(null);
    setEmailSendResult(null);

    const toastId = `diag_email_${Date.now()}`;
    addToast({
      id: toastId,
      type: 'loading',
      title: 'Sending test email…',
      message: `To ${emailRecipient.trim()} (${emailTemplate})`,
    });

    try {
      const dto: DiagnosticSendTestEmailDto = {
        templateType: emailTemplate,
        toEmail: emailRecipient.trim(),
        variables: {
          customerName: emailCustomerName,
          barberName: emailBarberName,
          serviceTitle: emailServiceTitle,
          preferredDate: emailDate,
          preferredTime: emailTime,
          declineReason: emailDeclineReason,
          cancelReason: emailDeclineReason,
          receiptNumber: emailReceiptNo,
          firstName: emailCustomerName.split(' ')[0] || 'Customer',
        },
      };

      const res = await api.post<DiagnosticSendTestEmailResult>('/api/system-admin/diagnostics/email/test', dto);

      addToast({
        id: toastId,
        type: 'success',
        title: 'Test email sent',
        message: `Diagnostic email successfully sent to ${emailRecipient.trim()}.`,
      });

      setIsSendingEmail(false);
      emailInFlightRef.current = false;
      setEmailSendResult(res.data);
      setShowSendConfirmation(false);
    } catch (err: any) {
      const errorMsg = cleanErrorMessage(err, 'Unable to send test email.');
      addToast({
        id: toastId,
        type: 'error',
        title: 'Unable to send test email',
        message: errorMsg,
      });
      setEmailError(errorMsg);
      setIsSendingEmail(false);
      emailInFlightRef.current = false;
      setShowSendConfirmation(false);
    }
  };

  // ── Handler: Load Test Data Review ──────────────────────────────────
  const handleOpenReviewData = async () => {
    setActiveTool('review_data');
    setIsLoadingReview(true);
    try {
      const res = await api.get<DiagnosticTestDataReviewResponse>('/api/system-admin/diagnostics/test-data/review');
      setTestDataReview(res.data);
    } catch {
      // silently handle
    } finally {
      setIsLoadingReview(false);
    }
  };

  // ── Handler: Cleanup Test Data ──────────────────────────────────────
  const handleCleanupTestData = async () => {
    if (cleanupInFlightRef.current) return;

    cleanupInFlightRef.current = true;
    setIsCleaningUp(true);
    setCleanupError(null);

    const toastId = `diag_clean_${Date.now()}`;
    addToast({
      id: toastId,
      type: 'loading',
      title: 'Cleaning up test data…',
      message: `Scope: ${cleanupScope}`,
    });

    try {
      const dto: DiagnosticCleanupDto = { scope: cleanupScope };
      const res = await api.delete<DiagnosticCleanupResult>('/api/system-admin/diagnostics/test-data', { data: dto });

      addToast({
        id: toastId,
        type: 'success',
        title: 'Test data cleaned up',
        message: `Removed ${res.data.reservationsRemoved} reservations, ${res.data.walkInsRemoved} walk-ins, and ${res.data.reviewsRemoved} reviews.`,
      });

      setIsCleaningUp(false);
      cleanupInFlightRef.current = false;
      setCleanupResult(res.data);
      setShowCleanupModal(false);

      fetchCounts().catch(() => {});
      if (testDataReview || activeTool === 'review_data') {
        api.get<DiagnosticTestDataReviewResponse>('/api/system-admin/diagnostics/test-data/review')
          .then((revRes) => setTestDataReview(revRes.data))
          .catch(() => {});
      }
      if (skipBarberId) {
        fetchSkipQueue(skipBarberId).catch(() => {});
      }
    } catch (err: any) {
      const errorMsg = cleanErrorMessage(err, 'Unable to clean up test data.');
      addToast({
        id: toastId,
        type: 'error',
        title: 'Unable to clean up test data',
        message: errorMsg,
      });
      setCleanupError(errorMsg);
      setIsCleaningUp(false);
      cleanupInFlightRef.current = false;
    }
  };

  // ── Global Error Guard if Branch Resolution Failed ──────────────────
  if (branchError) {
    return (
      <div className="p-6 bg-charcoal-light border border-white/10 rounded-sm text-center space-y-3 shadow-xl">
        <div className="text-amber-400 font-semibold text-xs flex items-center justify-center gap-1.5 uppercase font-mono tracking-wider">
          <AlertTriangle className="w-4 h-4" />
          Demo tools unavailable
        </div>
        <p className="text-xs text-ivory-dim max-w-md mx-auto">{branchError}</p>
        <Button
          type="button"
          onClick={initData}
          variant="outline"
          className="text-xs border-gold text-gold hover:bg-gold/10 h-8 px-4"
        >
          Try Again
        </Button>
      </div>
    );
  }

  const ratingLabels: Record<number, string> = {
    1: '1 — Poor',
    2: '2 — Fair',
    3: '3 — Average',
    4: '4 — Good',
    5: '5 — Excellent',
  };
  const activeDisplayRating = hoverStars ?? revStars;

  return (
    <div className="space-y-4">
      {/* ── Subheader & Notice (Informational Branch Context) ──────── */}
      <div className="p-3.5 bg-charcoal-light border border-white/10 rounded-sm shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-bold text-ivory tracking-wide flex items-center gap-2">
              <span>Demo &amp; Testing</span>
              <span className="px-2 py-0.5 text-[9px] font-mono uppercase bg-gold/10 text-gold border border-gold/20 rounded">
                Admin Toolkit
              </span>
            </h2>
            {activeBranch && (
              <span className="text-xs text-ivory-dim/75 font-mono">
                · Testing against <strong className="text-ivory font-medium">{activeBranch.name}</strong>
              </span>
            )}
          </div>
          <p className="text-[11px] text-ivory-dim/70">
            Controlled diagnostics for live queue, booking, portfolio, and email verification. Test records are tagged and isolated.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={fetchCounts}
          disabled={isLoadingCounts}
          className="text-xs border-white/10 text-ivory-dim hover:text-ivory h-8 shrink-0 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isLoadingCounts ? 'animate-spin text-gold' : ''}`} />
          <span>Refresh Stats</span>
        </Button>
      </div>

      {/* ── Operational Cards Grid (Compact 3-Column Admin Utilities) ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {/* 1. RESERVATIONS: Reservation Simulator */}
        <div className="bg-charcoal-light border border-white/10 rounded-sm p-4 shadow-xl flex flex-col justify-between space-y-3 hover:border-gold/30 transition-colors">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="p-2 rounded bg-white/5 border border-white/10 text-gold w-fit">
                <Calendar className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-ivory-dim/50">
                Area 1: Bookings
              </span>
            </div>
            <h3 className="text-sm font-semibold text-ivory tracking-wide">
              Reservation Simulator
            </h3>
            <p className="text-xs text-ivory-dim/70 leading-relaxed">
              Create controlled demo bookings with bypassed payment proof to test Cashier acceptance and queue progression.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setResResult(null);
              setResError(null);
              setActivePopover(null);
              setActiveTool('reservation');
            }}
            className="text-xs border-white/10 hover:border-gold/40 text-gold flex items-center justify-between w-full h-8 cursor-pointer"
          >
            <span>Configure Booking →</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* 2. QUEUE: Walk-in Generator */}
        <div className="bg-charcoal-light border border-white/10 rounded-sm p-4 shadow-xl flex flex-col justify-between space-y-3 hover:border-gold/30 transition-colors">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="p-2 rounded bg-white/5 border border-white/10 text-gold w-fit">
                <Users className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-ivory-dim/50">
                Area 2: Queue
              </span>
            </div>
            <h3 className="text-sm font-semibold text-ivory tracking-wide">
              Walk-in Generator
            </h3>
            <p className="text-xs text-ivory-dim/70 leading-relaxed">
              Populate a barber&apos;s lane with 1 to 20 synthetic walk-in guests to verify lane capacity, order preservation, and live display.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setWalkResult(null);
              setWalkError(null);
              setActivePopover(null);
              setActiveTool('walkin');
            }}
            className="text-xs border-white/10 hover:border-gold/40 text-gold flex items-center justify-between w-full h-8 cursor-pointer"
          >
            <span>Generate Walk-ins →</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* 3. QUEUE: Queue Inspector / Skip Queue Entry */}
        <div className="bg-charcoal-light border border-white/10 rounded-sm p-4 shadow-xl flex flex-col justify-between space-y-3 hover:border-gold/30 transition-colors">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="p-2 rounded bg-white/5 border border-white/10 text-amber-400 w-fit">
                <Play className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-ivory-dim/50">
                Area 2: Progression
              </span>
            </div>
            <h3 className="text-sm font-semibold text-ivory tracking-wide">
              Queue Inspector
            </h3>
            <p className="text-xs text-ivory-dim/70 leading-relaxed">
              Inspect active queue lanes and safely skip or cancel entries to test position decrementing and next-customer promotion.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setSkipMessage(null);
              setSkipError(null);
              setActivePopover(null);
              setActiveTool('skip');
              if (skipBarberId) fetchSkipQueue(skipBarberId);
            }}
            className="text-xs border-white/10 hover:border-gold/40 text-gold flex items-center justify-between w-full h-8 cursor-pointer"
          >
            <span>Open Lane Inspector →</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* 4. CUSTOMER EXPERIENCE: Barber Review Generator */}
        <div className="bg-charcoal-light border border-white/10 rounded-sm p-4 shadow-xl flex flex-col justify-between space-y-3 hover:border-gold/30 transition-colors">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="p-2 rounded bg-white/5 border border-white/10 text-gold w-fit">
                <Star className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-ivory-dim/50">
                Area 3: Portfolio
              </span>
            </div>
            <h3 className="text-sm font-semibold text-ivory tracking-wide">
              Barber Review Generator
            </h3>
            <p className="text-xs text-ivory-dim/70 leading-relaxed">
              Generate synthetic 1–5 star reviews to test barber rating calculations and public portfolio feedback display.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setRevSuccess(false);
              setRevError(null);
              setActivePopover(null);
              setActiveTool('review');
            }}
            className="text-xs border-white/10 hover:border-gold/40 text-gold flex items-center justify-between w-full h-8 cursor-pointer"
          >
            <span>Create Review →</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* 5. NOTIFICATIONS: Email Tester */}
        <div className="bg-charcoal-light border border-white/10 rounded-sm p-4 shadow-xl flex flex-col justify-between space-y-3 hover:border-gold/30 transition-colors">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="p-2 rounded bg-white/5 border border-white/10 text-gold w-fit">
                <Mail className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-ivory-dim/50">
                Area 4: Notifications
              </span>
            </div>
            <h3 className="text-sm font-semibold text-ivory tracking-wide">
              Email Tester
            </h3>
            <p className="text-xs text-ivory-dim/70 leading-relaxed">
              Render HTML email templates or send live transactional tests (booking decisions, inventory reports, receipts, synthetic OTPs).
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setEmailPreviewHtml(null);
              setEmailSendResult(null);
              setEmailError(null);
              setActivePopover(null);
              setActiveTool('email');
            }}
            className="text-xs border-white/10 hover:border-gold/40 text-gold flex items-center justify-between w-full h-8 cursor-pointer"
          >
            <span>Open Email Tester →</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* 6. TEST DATA: Test Data Management */}
        <div className="bg-charcoal-light border border-white/10 rounded-sm p-4 shadow-xl flex flex-col justify-between space-y-3 hover:border-gold/30 transition-colors">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="p-2 rounded bg-white/5 border border-white/10 text-rose-400 w-fit">
                <Trash2 className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-ivory-dim/50">
                Area 5: Test Data
              </span>
            </div>
            <h3 className="text-sm font-semibold text-ivory tracking-wide">
              Test Data Management
            </h3>
            <p className="text-xs text-ivory-dim/70 leading-relaxed">
              Review and clean up synthetic reservations, walk-ins, and reviews.
            </p>
            <div className="grid grid-cols-4 gap-1 pt-1 text-center font-mono">
              <div className="p-1.5 bg-charcoal rounded border border-white/5">
                <span className="text-xs font-bold text-ivory block">{testCounts.reservationsCount}</span>
                <span className="text-[9px] uppercase text-ivory-dim/60">Bookings</span>
              </div>
              <div className="p-1.5 bg-charcoal rounded border border-white/5">
                <span className="text-xs font-bold text-ivory block">{testCounts.walkInsCount}</span>
                <span className="text-[9px] uppercase text-ivory-dim/60">Walk-ins</span>
              </div>
              <div className="p-1.5 bg-charcoal rounded border border-white/5">
                <span className="text-xs font-bold text-ivory block">{testCounts.reviewsCount}</span>
                <span className="text-[9px] uppercase text-ivory-dim/60">Reviews</span>
              </div>
              <div className="p-1.5 bg-charcoal rounded border border-gold/20 bg-gold/5">
                <span className="text-xs font-bold text-gold block">{testCounts.total}</span>
                <span className="text-[9px] uppercase text-gold/80">Total</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={handleOpenReviewData}
              className="text-xs border-white/10 hover:border-gold/40 text-ivory flex-1 h-8 cursor-pointer"
            >
              Review Data
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setCleanupResult(null);
                setCleanupError(null);
                setShowCleanupModal(true);
              }}
              disabled={testCounts.total === 0}
              className="text-xs border-rose-500/20 text-rose-300 hover:bg-rose-500/10 flex-1 h-8 disabled:opacity-40 cursor-pointer"
            >
              Clean Up
            </Button>
          </div>
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════════ */}
      {/* DRAWER 1: RESERVATION SIMULATOR                              */}
      {/* ═════════════════════════════════════════════════════════════ */}
      {activeTool === 'reservation' && (
        <Portal>
          <div className="fixed inset-0 z-[100] flex justify-end">
            <div className="fixed inset-0 bg-black/80" onClick={() => setActiveTool('none')} />
            <div className="relative w-full max-w-[560px] bg-charcoal border-l border-white/10 shadow-2xl h-full flex flex-col z-10 animate-fade-in">
              {/* Header */}
              <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between bg-charcoal-light/60 shrink-0">
                <div>
                  <h3 className="text-sm font-bold text-ivory tracking-wide flex items-center gap-2 font-mono uppercase">
                    <Calendar className="w-4 h-4 text-gold" />
                    CREATE TEST RESERVATION
                  </h3>
                  <p className="text-[11px] text-ivory-dim/70 mt-0.5 font-sans">
                    Testing against {activeBranch?.name || 'SampleBranch Branch'} · Payment proof skipped
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTool('none')}
                  className="p-1 rounded text-ivory-dim hover:text-ivory hover:bg-white/5 cursor-pointer"
                  aria-label="Close drawer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Form Content & Sticky Footer */}
              {resResult ? (
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-sm space-y-3">
                    <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs uppercase font-mono tracking-wider">
                      <CheckCircle2 className="w-4 h-4" />
                      Test reservation created
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-1">
                      <div>
                        <span className="text-ivory-dim/60 block text-[10px] uppercase">Customer</span>
                        <span className="text-ivory font-bold">{resResult.customerName}</span>
                      </div>
                      <div>
                        <span className="text-ivory-dim/60 block text-[10px] uppercase">Barber</span>
                        <span className="text-ivory font-bold">{resResult.barberName}</span>
                      </div>
                      <div>
                        <span className="text-ivory-dim/60 block text-[10px] uppercase">Service</span>
                        <span className="text-ivory">{resResult.serviceTitles.join(', ')}</span>
                      </div>
                      <div>
                        <span className="text-ivory-dim/60 block text-[10px] uppercase">Date &amp; Time</span>
                        <span className="text-ivory">{resResult.preferredDate} • {resResult.preferredTime}</span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-ivory-dim/60 block text-[10px] uppercase">Initial Status</span>
                        <span className="text-gold font-bold uppercase">{resResult.status}</span>
                      </div>
                      {resResult.referenceNumber && (
                        <div className="col-span-2">
                          <span className="text-ivory-dim/60 block text-[10px] uppercase">Reference Code</span>
                          <span className="text-gold font-bold">{resResult.referenceNumber}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setResResult(null)}
                    className="text-xs w-full border-white/10 hover:border-gold/40 text-gold h-9 cursor-pointer"
                  >
                    Create Another Reservation
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleCreateReservation} className="flex-1 flex flex-col min-h-0">
                  <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {resError && (
                      <div className="p-2.5 rounded-sm bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>{resError}</span>
                      </div>
                    )}

                    {/* BARBER COMBOBOX */}
                    <div className="space-y-1.5">
                      <span className="text-xs font-semibold text-ivory/80 uppercase tracking-wider font-mono">
                        Barber
                      </span>
                      <DiagnosticCombobox
                        options={barberComboboxOptions}
                        value={resBarberId}
                        onChange={(id) => {
                          setResBarberId(id);
                          setResTime('');
                          setResAvailableSlots([]);
                        }}
                        placeholder="Select barber..."
                        searchPlaceholder="Search barbers..."
                        isLoading={isLoadingBarbers}
                        error={barbersError}
                        onRetry={() => activeBranch?.id && fetchBarbersForBranch(activeBranch.id)}
                        disabled={isSubmittingRes}
                        isOpen={activePopover === 'res-barber'}
                        onToggle={() => setActivePopover((prev) => (prev === 'res-barber' ? null : 'res-barber'))}
                        onClose={() => setActivePopover(null)}
                        renderTriggerContent={(opt) => {
                          if (!opt) return <span className="text-ivory-dim/50">Select barber...</span>;
                          const b: BarberItem = opt.meta;
                          const status = getBarberStatusLabel(b);
                          return (
                            <div className="flex items-center gap-2 min-w-0 pr-2">
                              <div className="h-6 w-6 rounded-full overflow-hidden bg-charcoal border border-white/10 shrink-0">
                                <img
                                  src={b.image || b.profile_picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(b.name)}&background=1a1a1a&color=d4af37`}
                                  alt={b.name}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              <span className="font-medium text-ivory truncate">{b.name}</span>
                              <span className="text-ivory-dim/40">·</span>
                              <span className={`text-[11px] shrink-0 font-mono ${
                                status.tone === 'emerald' ? 'text-emerald-400' :
                                status.tone === 'amber' ? 'text-amber-400' : 'text-ivory-dim/60'
                              }`}>
                                {status.label}
                              </span>
                            </div>
                          );
                        }}
                        renderOptionContent={(opt) => {
                          const b: BarberItem = opt.meta;
                          const status = getBarberStatusLabel(b);
                          return (
                            <div className="flex items-center gap-2.5 min-w-0 pr-2">
                              <div className="h-7 w-7 rounded-full overflow-hidden bg-charcoal border border-white/10 shrink-0">
                                <img
                                  src={b.image || b.profile_picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(b.name)}&background=1a1a1a&color=d4af37`}
                                  alt={b.name}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              <div className="min-w-0">
                                <span className="font-medium block truncate">{b.name}</span>
                                <span className={`text-[10px] block font-mono ${
                                  status.tone === 'emerald' ? 'text-emerald-400' :
                                  status.tone === 'amber' ? 'text-amber-400' : 'text-ivory-dim/60'
                                }`}>
                                  {status.label}
                                </span>
                              </div>
                            </div>
                          );
                        }}
                      />
                    </div>

                    {/* SERVICE COMBOBOX */}
                    <div className="space-y-1.5">
                      <span className="text-xs font-semibold text-ivory/80 uppercase tracking-wider font-mono">
                        Service
                      </span>
                      <DiagnosticCombobox
                        options={serviceComboboxOptions}
                        value={resServiceId}
                        onChange={(id) => {
                          setResServiceId(id);
                          setResTime('');
                          setResAvailableSlots([]);
                        }}
                        placeholder="Select service..."
                        searchPlaceholder="Search services..."
                        isLoading={isLoadingServices}
                        error={servicesError}
                        onRetry={fetchServicesData}
                        disabled={isSubmittingRes}
                        isOpen={activePopover === 'res-service'}
                        onToggle={() => setActivePopover((prev) => (prev === 'res-service' ? null : 'res-service'))}
                        onClose={() => setActivePopover(null)}
                      />
                    </div>

                    {/* DATE PICKER & QUICK BUTTONS */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-ivory/80 uppercase tracking-wider font-mono">
                          Date
                        </span>
                        {/* Quick Selection Shortcuts */}
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={isSubmittingRes}
                            onClick={() => {
                              setResDate(getManilaDateIso());
                              setResTime('');
                            }}
                            className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                              resDate === getManilaDateIso()
                                ? 'bg-gold/20 border-gold text-gold font-bold'
                                : 'border-white/10 bg-white/5 text-ivory-dim hover:text-ivory hover:border-gold/40'
                            }`}
                          >
                            Today
                          </button>
                          <button
                            type="button"
                            disabled={isSubmittingRes}
                            onClick={() => {
                              setResDate(addDaysToIsoDate(getManilaDateIso(), 1));
                              setResTime('');
                            }}
                            className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                              resDate === addDaysToIsoDate(getManilaDateIso(), 1)
                                ? 'bg-gold/20 border-gold text-gold font-bold'
                                : 'border-white/10 bg-white/5 text-ivory-dim hover:text-ivory hover:border-gold/40'
                            }`}
                          >
                            Tomorrow
                          </button>
                          {(() => {
                            const today = getManilaDateIso();
                            const nextAvail = barberOnlineDates.find((d) => d >= today);
                            if (!nextAvail || nextAvail === resDate) return null;
                            return (
                              <button
                                type="button"
                                disabled={isSubmittingRes}
                                onClick={() => {
                                  setResDate(nextAvail);
                                  setResTime('');
                                }}
                                className="px-2 py-0.5 rounded text-[10px] font-mono border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Next Available ({formatDisplayDate(nextAvail).split(',')[0]})
                              </button>
                            );
                          })()}
                        </div>
                      </div>

                      <DiagnosticDatePicker
                        value={resDate}
                        onChange={(iso) => {
                          setResDate(iso);
                          setResTime('');
                        }}
                        availableDates={barberOnlineDates}
                        disabled={isSubmittingRes}
                        isOpen={activePopover === 'res-date'}
                        onToggle={() => setActivePopover((prev) => (prev === 'res-date' ? null : 'res-date'))}
                        onClose={() => setActivePopover(null)}
                      />
                    </div>

                    {/* TIME SLOT PICKER */}
                    <DiagnosticSlotPicker
                      slots={resAvailableSlots}
                      selectedSlot={resTime}
                      onSelectSlot={setResTime}
                      isLoading={isLoadingSlots}
                      notice={slotsNotice}
                      targetDate={resDate}
                      disabled={isSubmittingRes}
                    />

                    {/* BOOKING STATE (SEGMENTED CONTROL) */}
                    <div className="pt-2 border-t border-white/10">
                      <DiagnosticSegmentedControl
                        label="Booking State"
                        value={resInitialStatus}
                        onChange={setResInitialStatus}
                        disabled={isSubmittingRes}
                        options={[
                          {
                            value: 'pending',
                            label: 'Pending Review',
                            sublabel: 'Recommended for demonstrating Cashier review and acceptance.',
                          },
                          {
                            value: 'accepted',
                            label: 'Accepted',
                            sublabel: 'Bypasses review and accepts directly into the queue.',
                          },
                        ]}
                      />
                    </div>
                  </div>

                  {/* Sticky Footer */}
                  <div className="px-5 py-3 border-t border-white/10 bg-charcoal-light/95 backdrop-blur-sm flex items-center justify-end gap-2.5 shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setActiveTool('none')}
                      className="h-9 px-4 text-xs border-white/10 text-ivory-dim hover:text-ivory cursor-pointer"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={isSubmittingRes || isLoadingSlots || !resBarberId || !resServiceId || resAvailableSlots.length === 0}
                      aria-busy={isSubmittingRes}
                      className="h-9 px-4 text-xs bg-gold hover:bg-gold-light text-charcoal font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                    >
                      {isSubmittingRes ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-charcoal" />
                          <span>Creating…</span>
                        </>
                      ) : (
                        <span>Create Reservation</span>
                      )}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </Portal>
      )}

      {/* ═════════════════════════════════════════════════════════════ */}
      {/* DRAWER 2: WALK-IN GENERATOR                                  */}
      {/* ═════════════════════════════════════════════════════════════ */}
      {activeTool === 'walkin' && (
        <Portal>
          <div className="fixed inset-0 z-[100] flex justify-end">
            <div className="fixed inset-0 bg-black/80" onClick={() => setActiveTool('none')} />
            <div className="relative w-full max-w-[560px] bg-charcoal border-l border-white/10 shadow-2xl h-full flex flex-col z-10 animate-fade-in">
              <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between bg-charcoal-light/60 shrink-0">
                <div>
                  <h3 className="text-sm font-bold text-ivory tracking-wide flex items-center gap-2 font-mono uppercase">
                    <Users className="w-4 h-4 text-gold" />
                    INSERT TEST WALK-INS
                  </h3>
                  <p className="text-[11px] text-ivory-dim/70 mt-0.5 font-sans">
                    Testing against {activeBranch?.name || 'SampleBranch Branch'} · Queue demonstration
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTool('none')}
                  className="p-1 rounded text-ivory-dim hover:text-ivory hover:bg-white/5 cursor-pointer"
                  aria-label="Close drawer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {walkResult ? (
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-sm space-y-3">
                    <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs uppercase font-mono tracking-wider">
                      <CheckCircle2 className="w-4 h-4" />
                      {walkResult.count} test walk-ins inserted
                    </div>
                    <div className="text-xs font-mono space-y-1">
                      <div>
                        <span className="text-ivory-dim/60">Barber: </span>
                        <span className="text-ivory font-bold">{walkResult.barberName}</span>
                      </div>
                      <div>
                        <span className="text-ivory-dim/60">Queue Positions: </span>
                        <span className="text-gold font-bold">#{walkResult.startPosition}–#{walkResult.endPosition}</span>
                      </div>
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-1 p-2 bg-charcoal rounded border border-white/5 font-mono text-[11px]">
                      {walkResult.entries.map((entry) => (
                        <div key={entry.id} className="flex items-center justify-between py-1 border-b border-white/5 last:border-0">
                          <span className="text-ivory">{entry.customerName}</span>
                          <span className="text-gold font-bold">Position #{entry.position}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setWalkResult(null)}
                    className="text-xs w-full border-white/10 hover:border-gold/40 text-gold h-9 cursor-pointer"
                  >
                    Insert More Walk-ins
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleInsertWalkIns} className="flex-1 flex flex-col min-h-0">
                  <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {walkError && (
                      <div className="p-2.5 rounded-sm bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>{walkError}</span>
                      </div>
                    )}

                    {/* BARBER COMBOBOX */}
                    <div className="space-y-1.5">
                      <span className="text-xs font-semibold text-ivory/80 uppercase tracking-wider font-mono">
                        Barber
                      </span>
                      <DiagnosticCombobox
                        options={barberComboboxOptions}
                        value={walkBarberId}
                        onChange={setWalkBarberId}
                        placeholder="Select barber..."
                        searchPlaceholder="Search barbers..."
                        isLoading={isLoadingBarbers}
                        error={barbersError}
                        onRetry={() => activeBranch?.id && fetchBarbersForBranch(activeBranch.id)}
                        disabled={isSubmittingWalk}
                        isOpen={activePopover === 'walk-barber'}
                        onToggle={() => setActivePopover((prev) => (prev === 'walk-barber' ? null : 'walk-barber'))}
                        onClose={() => setActivePopover(null)}
                        renderTriggerContent={(opt) => {
                          if (!opt) return <span className="text-ivory-dim/50">Select barber...</span>;
                          const b: BarberItem = opt.meta;
                          const status = getBarberStatusLabel(b);
                          return (
                            <div className="flex items-center gap-2 min-w-0 pr-2">
                              <div className="h-6 w-6 rounded-full overflow-hidden bg-charcoal border border-white/10 shrink-0">
                                <img
                                  src={b.image || b.profile_picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(b.name)}&background=1a1a1a&color=d4af37`}
                                  alt={b.name}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              <span className="font-medium text-ivory truncate">{b.name}</span>
                              <span className="text-ivory-dim/40">·</span>
                              <span className={`text-[11px] shrink-0 font-mono ${
                                status.tone === 'emerald' ? 'text-emerald-400' :
                                status.tone === 'amber' ? 'text-amber-400' : 'text-ivory-dim/60'
                              }`}>
                                {status.label}
                              </span>
                            </div>
                          );
                        }}
                        renderOptionContent={(opt) => {
                          const b: BarberItem = opt.meta;
                          const status = getBarberStatusLabel(b);
                          return (
                            <div className="flex items-center gap-2.5 min-w-0 pr-2">
                              <div className="h-7 w-7 rounded-full overflow-hidden bg-charcoal border border-white/10 shrink-0">
                                <img
                                  src={b.image || b.profile_picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(b.name)}&background=1a1a1a&color=d4af37`}
                                  alt={b.name}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              <div className="min-w-0">
                                <span className="font-medium block truncate">{b.name}</span>
                                <span className={`text-[10px] block font-mono ${
                                  status.tone === 'emerald' ? 'text-emerald-400' :
                                  status.tone === 'amber' ? 'text-amber-400' : 'text-ivory-dim/60'
                                }`}>
                                  {status.label}
                                </span>
                              </div>
                            </div>
                          );
                        }}
                      />
                    </div>

                    {/* SERVICE COMBOBOX */}
                    <div className="space-y-1.5">
                      <span className="text-xs font-semibold text-ivory/80 uppercase tracking-wider font-mono">
                        Service
                      </span>
                      <DiagnosticCombobox
                        options={serviceComboboxOptions}
                        value={walkServiceId}
                        onChange={setWalkServiceId}
                        placeholder="Select service..."
                        searchPlaceholder="Search services..."
                        isLoading={isLoadingServices}
                        error={servicesError}
                        onRetry={fetchServicesData}
                        disabled={isSubmittingWalk}
                        isOpen={activePopover === 'walk-service'}
                        onToggle={() => setActivePopover((prev) => (prev === 'walk-service' ? null : 'walk-service'))}
                        onClose={() => setActivePopover(null)}
                      />
                    </div>

                    {/* QUANTITY STEPPER */}
                    <div className="space-y-1.5">
                      <span className="text-xs font-semibold text-ivory/80 uppercase tracking-wider font-mono">
                        Quantity
                      </span>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center border border-white/10 rounded bg-charcoal-light">
                          <button
                            type="button"
                            onClick={() => setWalkQty((prev) => Math.max(1, prev - 1))}
                            disabled={isSubmittingWalk || walkQty <= 1}
                            className="w-9 h-9 flex items-center justify-center text-ivory hover:text-gold hover:bg-white/5 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                            aria-label="Decrease quantity"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="w-10 text-center font-mono text-sm font-bold text-gold">
                            {walkQty}
                          </span>
                          <button
                            type="button"
                            onClick={() => setWalkQty((prev) => Math.min(20, prev + 1))}
                            disabled={isSubmittingWalk || walkQty >= 20}
                            className="w-9 h-9 flex items-center justify-center text-ivory hover:text-gold hover:bg-white/5 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                            aria-label="Increase quantity"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <span className="text-xs text-ivory-dim/60 font-mono">Maximum 20 per batch</span>
                      </div>
                    </div>
                  </div>

                  {/* Sticky Footer */}
                  <div className="px-5 py-3 border-t border-white/10 bg-charcoal-light/95 backdrop-blur-sm flex items-center justify-end gap-2.5 shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setActiveTool('none')}
                      className="h-9 px-4 text-xs border-white/10 text-ivory-dim hover:text-ivory cursor-pointer"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={isSubmittingWalk || !walkBarberId || !walkServiceId}
                      aria-busy={isSubmittingWalk}
                      className="h-9 px-4 text-xs bg-gold hover:bg-gold-light text-charcoal font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                    >
                      {isSubmittingWalk ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-charcoal" />
                          <span>Inserting…</span>
                        </>
                      ) : (
                        <span>Insert {walkQty} Walk-ins</span>
                      )}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </Portal>
      )}

      {/* ═════════════════════════════════════════════════════════════ */}
      {/* DRAWER 3: QUEUE INSPECTOR / SKIP ENTRY                        */}
      {/* ═════════════════════════════════════════════════════════════ */}
      {activeTool === 'skip' && (
        <Portal>
          <div className="fixed inset-0 z-[100] flex justify-end">
            <div className="fixed inset-0 bg-black/80" onClick={() => setActiveTool('none')} />
            <div className="relative w-full max-w-[560px] bg-charcoal border-l border-white/10 shadow-2xl h-full flex flex-col z-10 animate-fade-in">
              <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between bg-charcoal-light/60 shrink-0">
                <div>
                  <h3 className="text-sm font-bold text-ivory tracking-wide flex items-center gap-2 font-mono uppercase">
                    <Play className="w-4 h-4 text-amber-400" />
                    QUEUE INSPECTOR
                  </h3>
                  <p className="text-[11px] text-ivory-dim/70 mt-0.5 font-sans">
                    Testing against {activeBranch?.name || 'SampleBranch Branch'} · Live Lane Inspection
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTool('none')}
                  className="p-1 rounded text-ivory-dim hover:text-ivory hover:bg-white/5 cursor-pointer"
                  aria-label="Close drawer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {/* BARBER SELECTOR */}
                <div className="space-y-1.5 pb-2 border-b border-white/10">
                  <span className="text-xs font-semibold text-ivory/80 uppercase tracking-wider font-mono">
                    Barber
                  </span>
                  <DiagnosticCombobox
                    options={barberComboboxOptions}
                    value={skipBarberId}
                    onChange={(id) => {
                      setSkipBarberId(id);
                      fetchSkipQueue(id);
                    }}
                    placeholder="Select barber..."
                    searchPlaceholder="Search barbers..."
                    isLoading={isLoadingBarbers}
                    error={barbersError}
                    onRetry={() => activeBranch?.id && fetchBarbersForBranch(activeBranch.id)}
                    isOpen={activePopover === 'skip-barber'}
                    onToggle={() => setActivePopover((prev) => (prev === 'skip-barber' ? null : 'skip-barber'))}
                    onClose={() => setActivePopover(null)}
                    renderTriggerContent={(opt) => {
                      if (!opt) return <span className="text-ivory-dim/50">Select barber...</span>;
                      const b: BarberItem = opt.meta;
                      const status = getBarberStatusLabel(b);
                      return (
                        <div className="flex items-center gap-2 min-w-0 pr-2">
                          <div className="h-6 w-6 rounded-full overflow-hidden bg-charcoal border border-white/10 shrink-0">
                            <img
                              src={b.image || b.profile_picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(b.name)}&background=1a1a1a&color=d4af37`}
                              alt={b.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <span className="font-medium text-ivory truncate">{b.name}</span>
                          <span className="text-ivory-dim/40">·</span>
                          <span className={`text-[11px] shrink-0 font-mono ${
                            status.tone === 'emerald' ? 'text-emerald-400' :
                            status.tone === 'amber' ? 'text-amber-400' : 'text-ivory-dim/60'
                          }`}>
                            {status.label}
                          </span>
                        </div>
                      );
                    }}
                    renderOptionContent={(opt) => {
                      const b: BarberItem = opt.meta;
                      const status = getBarberStatusLabel(b);
                      return (
                        <div className="flex items-center gap-2.5 min-w-0 pr-2">
                          <div className="h-7 w-7 rounded-full overflow-hidden bg-charcoal border border-white/10 shrink-0">
                            <img
                              src={b.image || b.profile_picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(b.name)}&background=1a1a1a&color=d4af37`}
                              alt={b.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="min-w-0">
                            <span className="font-medium block truncate">{b.name}</span>
                            <span className={`text-[10px] block font-mono ${
                              status.tone === 'emerald' ? 'text-emerald-400' :
                              status.tone === 'amber' ? 'text-amber-400' : 'text-ivory-dim/60'
                            }`}>
                              {status.label}
                            </span>
                          </div>
                        </div>
                      );
                    }}
                  />
                </div>

                {skipMessage && (
                  <div className="p-2.5 rounded-sm bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between">
                    <span>{skipMessage}</span>
                    <button type="button" onClick={() => setSkipMessage(null)} className="text-emerald-400 font-bold" aria-label="Dismiss message">✕</button>
                  </div>
                )}
                {skipError && (
                  <div className="p-2.5 rounded-sm bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                    {skipError}
                  </div>
                )}

                {/* LIVE QUEUE DISPLAY */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono uppercase text-ivory/80 font-bold">
                      Queue Lane ({skipQueueList.length} total)
                    </span>
                    <button
                      type="button"
                      onClick={() => skipBarberId && fetchSkipQueue(skipBarberId)}
                      disabled={isLoadingSkipQueue || !skipBarberId}
                      className="text-[11px] text-gold hover:underline flex items-center gap-1 cursor-pointer font-mono"
                    >
                      <RefreshCw className={`w-3 h-3 ${isLoadingSkipQueue ? 'animate-spin' : ''}`} />
                      Refresh
                    </button>
                  </div>

                  {isLoadingSkipQueue ? (
                    <div className="p-6 text-center text-xs text-ivory-dim">Loading live queue...</div>
                  ) : skipQueueList.length === 0 ? (
                    <div className="p-6 text-center text-xs text-ivory-dim/60 border border-white/5 rounded">
                      No active customers in queue for this barber.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* NOW SERVING */}
                      {(() => {
                        const servingEntry = skipQueueList.find((e) => e.status === 'serving');
                        if (!servingEntry) return null;
                        const isTest = Boolean(servingEntry.is_test);
                        return (
                          <div className="space-y-1">
                            <span className="text-[10px] font-mono uppercase tracking-wider text-gold font-bold block">
                              NOW SERVING
                            </span>
                            <div className="p-3 bg-gold/5 border border-gold/30 rounded flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-ivory truncate">
                                    {servingEntry.guest_name || servingEntry.customer_name || 'Walk-in'}
                                  </span>
                                  {isTest ? (
                                    <span className="px-1.5 py-0.2 rounded bg-gold/15 text-gold text-[9px] font-mono uppercase font-bold">
                                      TEST
                                    </span>
                                  ) : (
                                    <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[9px] font-mono uppercase font-bold">
                                      LIVE
                                    </span>
                                  )}
                                </div>
                                <span className="text-[11px] text-ivory-dim/70 block">
                                  {servingEntry.service_name || 'Service'}
                                </span>
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                disabled={isSkippingEntry && selectedEntryToSkip?.id === servingEntry.id}
                                onClick={() => {
                                  setSelectedEntryToSkip(servingEntry);
                                  setSkipReasonCategory('demonstration');
                                  setSkipCustomReason('');
                                }}
                                className="h-7 px-2.5 text-[11px] border-amber-500/40 text-amber-300 hover:bg-amber-500/10 shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Skip
                              </Button>
                            </div>
                          </div>
                        );
                      })()}

                      {/* WAITING */}
                      <div className="space-y-1">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-ivory-dim/60 block">
                          WAITING
                        </span>
                        <div className="space-y-1">
                          {skipQueueList
                            .filter((e) => e.status !== 'serving')
                            .map((entry, idx) => {
                              const isTest = Boolean(entry.is_test);
                              return (
                                <div
                                  key={entry.id}
                                  className="p-2.5 bg-charcoal-light border border-white/5 rounded flex items-center justify-between gap-2 hover:border-white/10"
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <span className="text-xs font-mono font-bold text-ivory-dim/60 shrink-0 w-6">
                                      #{entry.position || idx + 1}
                                    </span>
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-xs font-semibold text-ivory truncate">
                                          {entry.guest_name || entry.customer_name || 'Walk-in'}
                                        </span>
                                        {isTest && (
                                          <span className="px-1 py-0.2 rounded bg-gold/15 text-gold text-[9px] font-mono uppercase font-bold">
                                            TEST
                                          </span>
                                        )}
                                      </div>
                                      <span className="text-[10px] text-ivory-dim/60 block truncate">
                                        {entry.service_name || 'Service'}
                                      </span>
                                    </div>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    disabled={isSkippingEntry && selectedEntryToSkip?.id === entry.id}
                                    onClick={() => {
                                      setSelectedEntryToSkip(entry);
                                      setSkipReasonCategory('demonstration');
                                      setSkipCustomReason('');
                                    }}
                                    className="h-6 px-2 text-[10px] border-white/10 hover:border-amber-500/40 text-ivory-dim hover:text-amber-300 shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    Skip
                                  </Button>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Sticky Footer */}
              <div className="px-5 py-3 border-t border-white/10 bg-charcoal-light/95 backdrop-blur-sm flex items-center justify-between shrink-0">
                <span className="text-[11px] font-mono text-ivory-dim/60">
                  {skipQueueList.length} queue {skipQueueList.length === 1 ? 'entry' : 'entries'}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setActiveTool('none')}
                  className="h-9 px-4 text-xs border-white/10 text-ivory-dim hover:text-ivory cursor-pointer"
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* Confirmation Modal: Skip Queue Entry */}
      {selectedEntryToSkip && (
        <Modal
          isOpen={true}
          onClose={() => !isSkippingEntry && setSelectedEntryToSkip(null)}
          title={`Skip ${selectedEntryToSkip.guest_name || selectedEntryToSkip.customer_name || 'Customer'}?`}
          size="sm"
        >
          <div className="space-y-3.5">
            {!selectedEntryToSkip.is_test ? (
              <div className="p-2.5 bg-rose-500/15 border border-rose-500/40 rounded-sm space-y-1">
                <div className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  LIVE CUSTOMER
                </div>
                <p className="text-xs text-rose-200 leading-relaxed">
                  This is not test data. Skipping this entry will modify the live customer queue.
                </p>
              </div>
            ) : (
              <p className="text-xs text-ivory-dim leading-relaxed">
                This will remove the customer from the active queue and allow the queue to continue using normal progression rules.
              </p>
            )}

            <div className="space-y-1.5">
              <span className="text-xs font-mono uppercase text-ivory/80 block font-semibold">
                Reason
              </span>
              <div className="space-y-1.5 text-xs text-ivory">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="skipReason"
                    value="demonstration"
                    disabled={isSkippingEntry}
                    checked={skipReasonCategory === 'demonstration'}
                    onChange={() => setSkipReasonCategory('demonstration')}
                    className="accent-gold cursor-pointer disabled:opacity-50"
                  />
                  <span>Test / Demonstration</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="skipReason"
                    value="not_present"
                    disabled={isSkippingEntry}
                    checked={skipReasonCategory === 'not_present'}
                    onChange={() => setSkipReasonCategory('not_present')}
                    className="accent-gold cursor-pointer disabled:opacity-50"
                  />
                  <span>Customer Not Present</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="skipReason"
                    value="other"
                    disabled={isSkippingEntry}
                    checked={skipReasonCategory === 'other'}
                    onChange={() => setSkipReasonCategory('other')}
                    className="accent-gold cursor-pointer disabled:opacity-50"
                  />
                  <span>Other</span>
                </label>
              </div>
            </div>

            {skipReasonCategory === 'other' && (
              <div className="space-y-1">
                <label htmlFor={`skip-reason-${customReasonInputId}`} className="text-[11px] font-mono uppercase text-ivory-dim">Specify Reason</label>
                <input
                  id={`skip-reason-${customReasonInputId}`}
                  type="text"
                  value={skipCustomReason}
                  disabled={isSkippingEntry}
                  onChange={(e) => setSkipCustomReason(e.target.value)}
                  placeholder="Enter reason..."
                  className="w-full bg-charcoal border border-white/10 rounded px-3 py-1.5 text-xs text-ivory outline-none focus:border-gold disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            )}

            <div className="pt-2 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={isSkippingEntry}
                onClick={() => setSelectedEntryToSkip(null)}
                className="h-8 px-3 text-xs border-white/10 text-ivory-dim cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleConfirmSkipEntry}
                disabled={isSkippingEntry || (skipReasonCategory === 'other' && !skipCustomReason.trim())}
                aria-busy={isSkippingEntry}
                className={`h-8 px-3 text-xs font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 ${
                  !selectedEntryToSkip.is_test
                    ? 'bg-rose-600 hover:bg-rose-500 text-white'
                    : 'bg-amber-500 hover:bg-amber-400 text-charcoal'
                }`}
              >
                {isSkippingEntry ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Skipping…</span>
                  </>
                ) : (
                  <span>Confirm Skip</span>
                )}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ═════════════════════════════════════════════════════════════ */}
      {/* DRAWER 4: BARBER REVIEW GENERATOR                             */}
      {/* ═════════════════════════════════════════════════════════════ */}
      {activeTool === 'review' && (
        <Portal>
          <div className="fixed inset-0 z-[100] flex justify-end">
            <div className="fixed inset-0 bg-black/80" onClick={() => setActiveTool('none')} />
            <div className="relative w-full max-w-[560px] bg-charcoal border-l border-white/10 shadow-2xl h-full flex flex-col z-10 animate-fade-in">
              <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between bg-charcoal-light/60 shrink-0">
                <div>
                  <h3 className="text-sm font-bold text-ivory tracking-wide flex items-center gap-2 font-mono uppercase">
                    <Star className="w-4 h-4 text-gold" />
                    CREATE TEST REVIEW
                  </h3>
                  <p className="text-[11px] text-ivory-dim/70 mt-0.5 font-sans">
                    Testing against {activeBranch?.name || 'SampleBranch Branch'} · Barber Portfolio Rating
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTool('none')}
                  className="p-1 rounded text-ivory-dim hover:text-ivory hover:bg-white/5 cursor-pointer"
                  aria-label="Close drawer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSubmitReview} className="flex-1 flex flex-col min-h-0">
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  {revSuccess && (
                    <div className="p-2.5 rounded-sm bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between">
                      <span>Test review submitted successfully.</span>
                      <button type="button" onClick={() => setRevSuccess(false)} className="text-emerald-400 font-bold" aria-label="Dismiss message">✕</button>
                    </div>
                  )}
                  {revError && (
                    <div className="p-2.5 rounded-sm bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                      {revError}
                    </div>
                  )}

                  {/* BARBER COMBOBOX */}
                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold text-ivory/80 uppercase tracking-wider font-mono">
                      Barber
                    </span>
                    <DiagnosticCombobox
                      options={barberComboboxOptions}
                      value={revBarberId}
                      onChange={setRevBarberId}
                      placeholder="Select barber..."
                      searchPlaceholder="Search barbers..."
                      isLoading={isLoadingBarbers}
                      error={barbersError}
                      onRetry={() => activeBranch?.id && fetchBarbersForBranch(activeBranch.id)}
                      disabled={isSubmittingRev}
                      isOpen={activePopover === 'rev-barber'}
                      onToggle={() => setActivePopover((prev) => (prev === 'rev-barber' ? null : 'rev-barber'))}
                      onClose={() => setActivePopover(null)}
                      renderTriggerContent={(opt) => {
                        if (!opt) return <span className="text-ivory-dim/50">Select barber...</span>;
                        const b: BarberItem = opt.meta;
                        const status = getBarberStatusLabel(b);
                        return (
                          <div className="flex items-center gap-2 min-w-0 pr-2">
                            <div className="h-6 w-6 rounded-full overflow-hidden bg-charcoal border border-white/10 shrink-0">
                              <img
                                src={b.image || b.profile_picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(b.name)}&background=1a1a1a&color=d4af37`}
                                alt={b.name}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <span className="font-medium text-ivory truncate">{b.name}</span>
                            <span className="text-ivory-dim/40">·</span>
                            <span className={`text-[11px] shrink-0 font-mono ${
                              status.tone === 'emerald' ? 'text-emerald-400' :
                              status.tone === 'amber' ? 'text-amber-400' : 'text-ivory-dim/60'
                            }`}>
                              {status.label}
                            </span>
                          </div>
                        );
                      }}
                      renderOptionContent={(opt) => {
                        const b: BarberItem = opt.meta;
                        const status = getBarberStatusLabel(b);
                        return (
                          <div className="flex items-center gap-2.5 min-w-0 pr-2">
                            <div className="h-7 w-7 rounded-full overflow-hidden bg-charcoal border border-white/10 shrink-0">
                              <img
                                src={b.image || b.profile_picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(b.name)}&background=1a1a1a&color=d4af37`}
                                alt={b.name}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div className="min-w-0">
                              <span className="font-medium block truncate">{b.name}</span>
                              <span className={`text-[10px] block font-mono ${
                                status.tone === 'emerald' ? 'text-emerald-400' :
                                status.tone === 'amber' ? 'text-amber-400' : 'text-ivory-dim/60'
                              }`}>
                                {status.label}
                              </span>
                            </div>
                          </div>
                        );
                      }}
                    />
                  </div>

                  {/* RATING WITH INTERACTIVE STARS AND PREVIEW */}
                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold text-ivory/80 uppercase tracking-wider font-mono">
                      Rating
                    </span>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1" onMouseLeave={() => setHoverStars(null)}>
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            type="button"
                            disabled={isSubmittingRev}
                            onMouseEnter={() => setHoverStars(star)}
                            onClick={() => setRevStars(star)}
                            className="p-1 text-gold hover:scale-110 transition-transform cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            aria-label={`Rate ${star} stars`}
                          >
                            <Star
                              className={`w-5 h-5 ${
                                star <= activeDisplayRating ? 'fill-gold text-gold' : 'text-ivory-dim/30'
                              }`}
                            />
                          </button>
                        ))}
                      </div>
                      <span className="text-xs font-mono text-gold font-semibold">
                        {ratingLabels[activeDisplayRating] || ''}
                      </span>
                    </div>
                  </div>

                  {/* REVIEW TEXTAREA */}
                  <div className="space-y-1.5">
                    <label htmlFor="rev-comment-input" className="text-xs font-semibold text-ivory/80 uppercase tracking-wider font-mono">
                      Review
                    </label>
                    <textarea
                      id="rev-comment-input"
                      value={revComment}
                      disabled={isSubmittingRev}
                      onChange={(e) => setRevComment(e.target.value)}
                      placeholder="Enter a test review..."
                      rows={3}
                      className="w-full bg-charcoal-light border border-white/10 rounded p-2.5 text-xs text-ivory focus:border-gold outline-none resize-none disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>

                  {/* PUBLIC PORTFOLIO TOGGLE */}
                  <div className="pt-1">
                    <label className="flex items-start gap-2.5 text-xs text-ivory cursor-pointer">
                      <input
                        type="checkbox"
                        checked={revIsPublic}
                        disabled={isSubmittingRev}
                        onChange={(e) => setRevIsPublic(e.target.checked)}
                        className="mt-0.5 rounded accent-gold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      <div>
                        <span className="font-medium text-ivory">Show in public portfolio during testing</span>
                        <span className="text-[10px] text-ivory-dim/60 block">Test reviews may temporarily affect the displayed barber rating.</span>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Sticky Footer */}
                <div className="px-5 py-3 border-t border-white/10 bg-charcoal-light/95 backdrop-blur-sm flex items-center justify-end gap-2.5 shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setActiveTool('none')}
                    className="h-9 px-4 text-xs border-white/10 text-ivory-dim hover:text-ivory cursor-pointer"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSubmittingRev || !revBarberId}
                    aria-busy={isSubmittingRev}
                    className="h-9 px-4 text-xs bg-gold hover:bg-gold-light text-charcoal font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                  >
                    {isSubmittingRev ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-charcoal" />
                        <span>Creating…</span>
                      </>
                    ) : (
                      <span>Create Review</span>
                    )}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </Portal>
      )}

      {/* ═════════════════════════════════════════════════════════════ */}
      {/* DRAWER 5: EMAIL TESTER                                        */}
      {/* ═════════════════════════════════════════════════════════════ */}
      {activeTool === 'email' && (
        <Portal>
          <div className="fixed inset-0 z-[100] flex justify-end">
            <div className="fixed inset-0 bg-black/80" onClick={() => setActiveTool('none')} />
            <div className="relative w-full max-w-[560px] bg-charcoal border-l border-white/10 shadow-2xl h-full flex flex-col z-10 animate-fade-in">
              <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between bg-charcoal-light/60 shrink-0">
                <div>
                  <h3 className="text-sm font-bold text-ivory tracking-wide flex items-center gap-2 font-mono uppercase">
                    <Mail className="w-4 h-4 text-gold" />
                    EMAIL TESTER
                  </h3>
                  <p className="text-[11px] text-ivory-dim/70 mt-0.5 font-sans">
                    Transactional email preview and SMTP transmission test
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTool('none')}
                  className="p-1 rounded text-ivory-dim hover:text-ivory hover:bg-white/5 cursor-pointer"
                  aria-label="Close drawer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {emailSendResult && (
                  <div className={`p-2.5 rounded-sm text-xs ${
                    emailSendResult.sent
                      ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
                  }`}>
                    {emailSendResult.sent
                      ? 'Test email delivered successfully via SMTP.'
                      : `Delivery failed: ${emailSendResult.errorMessage || 'Unable to deliver.'}`}
                  </div>
                )}
                {emailError && (
                  <div className="p-2.5 rounded-sm bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                    {emailError}
                  </div>
                )}

                {/* TEMPLATE COMBOBOX */}
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-ivory/80 uppercase tracking-wider font-mono">
                    Template
                  </span>
                  <DiagnosticCombobox
                    options={emailTemplateOptions}
                    value={emailTemplate}
                    onChange={setEmailTemplate}
                    placeholder="Select email template..."
                    searchPlaceholder="Search templates..."
                    isOpen={activePopover === 'email-template'}
                    onToggle={() => setActivePopover((prev) => (prev === 'email-template' ? null : 'email-template'))}
                    onClose={() => setActivePopover(null)}
                  />
                </div>

                {/* RECIPIENT INPUT */}
                <div className="space-y-1.5">
                  <label htmlFor={`email-${emailInputId}`} className="text-xs font-semibold text-ivory/80 uppercase tracking-wider font-mono">
                    Recipient Email
                  </label>
                  <input
                    id={`email-${emailInputId}`}
                    type="email"
                    value={emailRecipient}
                    onChange={(e) => setEmailRecipient(e.target.value)}
                    placeholder="portfolio@example.invalid"
                    className="w-full h-10 bg-charcoal-light border border-white/10 rounded px-3 text-xs text-ivory focus:border-gold outline-none"
                  />
                  <span className="text-[10px] text-ivory-dim/60 block">
                    Required only when transmitting a test email through SMTP.
                  </span>
                </div>

                {/* TEMPLATE VARIABLES */}
                <div className="space-y-2.5 p-3 bg-charcoal-light border border-white/10 rounded">
                  <span className="text-[11px] font-mono uppercase text-gold font-bold block">
                    Template Fields
                  </span>

                  {emailTemplate.startsWith('RESERVATION_') || emailTemplate === 'BOOKING_RECEIVED' ? (
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="space-y-1">
                        <label htmlFor="email-cust-name" className="text-[11px] font-mono text-ivory-dim">Customer Name</label>
                        <input
                          id="email-cust-name"
                          type="text"
                          value={emailCustomerName}
                          onChange={(e) => setEmailCustomerName(e.target.value)}
                          className="w-full h-8 bg-charcoal border border-white/10 rounded px-2 text-xs text-ivory"
                        />
                      </div>
                      <div className="space-y-1">
                        <label htmlFor="email-barber-name" className="text-[11px] font-mono text-ivory-dim">Barber</label>
                        <input
                          id="email-barber-name"
                          type="text"
                          value={emailBarberName}
                          onChange={(e) => setEmailBarberName(e.target.value)}
                          className="w-full h-8 bg-charcoal border border-white/10 rounded px-2 text-xs text-ivory"
                        />
                      </div>
                      <div className="space-y-1">
                        <label htmlFor="email-service-title" className="text-[11px] font-mono text-ivory-dim">Service</label>
                        <input
                          id="email-service-title"
                          type="text"
                          value={emailServiceTitle}
                          onChange={(e) => setEmailServiceTitle(e.target.value)}
                          className="w-full h-8 bg-charcoal border border-white/10 rounded px-2 text-xs text-ivory"
                        />
                      </div>
                      <div className="space-y-1">
                        <label htmlFor="email-pref-time" className="text-[11px] font-mono text-ivory-dim">Time</label>
                        <input
                          id="email-pref-time"
                          type="text"
                          value={emailTime}
                          onChange={(e) => setEmailTime(e.target.value)}
                          className="w-full h-8 bg-charcoal border border-white/10 rounded px-2 text-xs text-ivory"
                        />
                      </div>
                    </div>
                  ) : emailTemplate === 'RECEIPT' ? (
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="space-y-1">
                        <label htmlFor="email-receipt-customer" className="text-[11px] font-mono text-ivory-dim">Customer</label>
                        <input
                          id="email-receipt-customer"
                          type="text"
                          value={emailCustomerName}
                          onChange={(e) => setEmailCustomerName(e.target.value)}
                          className="w-full h-8 bg-charcoal border border-white/10 rounded px-2 text-xs text-ivory"
                        />
                      </div>
                      <div className="space-y-1">
                        <label htmlFor="email-receipt-num" className="text-[11px] font-mono text-ivory-dim">Receipt Number</label>
                        <input
                          id="email-receipt-num"
                          type="text"
                          value={emailReceiptNo}
                          onChange={(e) => setEmailReceiptNo(e.target.value)}
                          className="w-full h-8 bg-charcoal border border-white/10 rounded px-2 text-xs text-ivory"
                        />
                      </div>
                    </div>
                  ) : emailTemplate.endsWith('_OTP') ? (
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <label htmlFor="email-otp-first-name" className="text-[11px] font-mono text-ivory-dim">User First Name</label>
                        <input
                          id="email-otp-first-name"
                          type="text"
                          value={emailCustomerName}
                          onChange={(e) => setEmailCustomerName(e.target.value)}
                          className="w-full h-8 bg-charcoal border border-white/10 rounded px-2 text-xs text-ivory"
                        />
                      </div>
                      <div className="p-2 bg-charcoal rounded text-[11px] font-mono text-ivory-dim/75">
                        Fixed Diagnostic OTP: <strong className="text-gold">123456</strong> (Synthetic challenge).
                      </div>
                    </div>
                  ) : (
                    <div className="text-[11px] text-ivory-dim/70">
                      Standard Daily Stock Report metrics for {emailDate}.
                    </div>
                  )}
                </div>
              </div>

              {/* Sticky Footer */}
              <div className="px-5 py-3 border-t border-white/10 bg-charcoal-light/95 backdrop-blur-sm flex items-center justify-end gap-2.5 shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handlePreviewEmail}
                  disabled={isLoadingPreview}
                  className="h-9 px-4 text-xs border-white/10 hover:border-gold/40 text-gold cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5 mr-1.5" />
                  <span>{isLoadingPreview ? 'Rendering...' : 'Preview Email'}</span>
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    if (!emailRecipient || !emailRecipient.includes('@')) {
                      setEmailError('Please enter a recipient email address.');
                      return;
                    }
                    setShowSendConfirmation(true);
                  }}
                  disabled={isSendingEmail || !emailRecipient}
                  className="h-9 px-4 text-xs bg-gold hover:bg-gold-light text-charcoal font-bold cursor-pointer disabled:opacity-40"
                >
                  <Send className="w-3.5 h-3.5 mr-1.5" />
                  <span>Send Test Email</span>
                </Button>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* Modal: Email HTML Preview */}
      {emailPreviewHtml && (
        <Modal
          isOpen={true}
          onClose={() => setEmailPreviewHtml(null)}
          title={`Email Preview: ${emailPreviewHtml.subject}`}
          size="lg"
        >
          <div className="space-y-3">
            <div className="p-2 bg-charcoal rounded border border-white/10 text-xs font-mono">
              <span className="text-ivory-dim/60">Subject: </span>
              <span className="text-gold font-bold">{emailPreviewHtml.subject}</span>
            </div>
            <div className="border border-white/10 rounded overflow-hidden max-h-[60vh] overflow-y-auto bg-black">
              <iframe
                title="Email Preview"
                srcDoc={emailPreviewHtml.html}
                className="w-full min-h-[440px] border-0"
                sandbox="allow-same-origin"
              />
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEmailPreviewHtml(null)}
                className="h-8 px-4 text-xs border-white/10 text-ivory cursor-pointer"
              >
                Close Preview
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirmation Modal: Send Test Email */}
      {showSendConfirmation && (
        <Modal
          isOpen={true}
          onClose={() => !isSendingEmail && setShowSendConfirmation(false)}
          title="Send test email?"
          size="sm"
        >
          <div className="space-y-3.5">
            <p className="text-xs text-ivory-dim leading-relaxed">
              This will send a real transactional email via SMTP to the specified recipient. Rate limits are restricted to 5 test emails per minute.
            </p>
            <div className="p-2.5 bg-charcoal rounded border border-white/10 text-xs font-mono space-y-1">
              <div>
                <span className="text-ivory-dim/60">Template: </span>
                <span className="text-gold font-bold">{emailTemplate}</span>
              </div>
              <div>
                <span className="text-ivory-dim/60">Recipient: </span>
                <span className="text-ivory font-bold">{emailRecipient}</span>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                disabled={isSendingEmail}
                onClick={() => setShowSendConfirmation(false)}
                className="h-8 px-3 text-xs border-white/10 text-ivory-dim cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSendTestEmail}
                disabled={isSendingEmail}
                aria-busy={isSendingEmail}
                className="h-8 px-3 text-xs bg-gold hover:bg-gold-light text-charcoal font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {isSendingEmail ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-charcoal" />
                    <span>Sending…</span>
                  </>
                ) : (
                  <span>Send Test Email</span>
                )}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ═════════════════════════════════════════════════════════════ */}
      {/* DRAWER 6: TEST DATA REVIEW & PURGE                            */}
      {/* ═════════════════════════════════════════════════════════════ */}
      {activeTool === 'review_data' && (
        <Portal>
          <div className="fixed inset-0 z-[100] flex justify-end">
            <div className="fixed inset-0 bg-black/80" onClick={() => setActiveTool('none')} />
            <div className="relative w-full max-w-[560px] bg-charcoal border-l border-white/10 shadow-2xl h-full flex flex-col z-10 animate-fade-in">
              <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between bg-charcoal-light/60 shrink-0">
                <div>
                  <h3 className="text-sm font-bold text-ivory tracking-wide flex items-center gap-2 font-mono uppercase">
                    <Trash2 className="w-4 h-4 text-rose-400" />
                    REVIEW TEST DATA
                  </h3>
                  <p className="text-[11px] text-ivory-dim/70 mt-0.5 font-sans">
                    Inspect diagnostic records currently active in database
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTool('none')}
                  className="p-1 rounded text-ivory-dim hover:text-ivory hover:bg-white/5 cursor-pointer"
                  aria-label="Close drawer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {isLoadingReview ? (
                  <div className="p-8 text-center text-xs text-ivory-dim">Loading test data records...</div>
                ) : !testDataReview || testDataReview.counts.total === 0 ? (
                  <div className="p-8 text-center text-xs text-ivory-dim/60 border border-white/5 rounded">
                    No diagnostic test records found in the database.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Reservations */}
                    <div className="space-y-1.5">
                      <span className="text-xs font-mono uppercase text-gold font-bold flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        Test Reservations ({testDataReview.reservations.length})
                      </span>
                      {testDataReview.reservations.length === 0 ? (
                        <p className="text-[11px] text-ivory-dim/50 pl-5">None</p>
                      ) : (
                        <div className="space-y-1">
                          {testDataReview.reservations.map((r) => (
                            <div key={r.id} className="p-2 bg-charcoal-light border border-white/5 rounded text-xs flex items-center justify-between">
                              <div>
                                <span className="font-semibold text-ivory block">{r.customerName}</span>
                                <span className="text-[10px] text-ivory-dim/60">{r.barberName} • {r.date} {r.time}</span>
                              </div>
                              <span className="text-[10px] font-mono uppercase text-gold px-1.5 py-0.5 bg-gold/10 rounded">
                                {r.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Walk-ins */}
                    <div className="space-y-1.5">
                      <span className="text-xs font-mono uppercase text-gold font-bold flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5" />
                        Test Walk-ins ({testDataReview.walkIns.length})
                      </span>
                      {testDataReview.walkIns.length === 0 ? (
                        <p className="text-[11px] text-ivory-dim/50 pl-5">None</p>
                      ) : (
                        <div className="space-y-1">
                          {testDataReview.walkIns.map((w) => (
                            <div key={w.id} className="p-2 bg-charcoal-light border border-white/5 rounded text-xs flex items-center justify-between">
                              <div>
                                <span className="font-semibold text-ivory block">{w.customerName}</span>
                                <span className="text-[10px] text-ivory-dim/60">{w.barberName} • {w.status}</span>
                              </div>
                              <span className="text-[10px] font-mono text-ivory px-1.5 py-0.5 bg-white/10 rounded">
                                #{w.position}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Reviews */}
                    <div className="space-y-1.5">
                      <span className="text-xs font-mono uppercase text-gold font-bold flex items-center gap-1.5">
                        <Star className="w-3.5 h-3.5" />
                        Test Reviews ({testDataReview.reviews.length})
                      </span>
                      {testDataReview.reviews.length === 0 ? (
                        <p className="text-[11px] text-ivory-dim/50 pl-5">None</p>
                      ) : (
                        <div className="space-y-1">
                          {testDataReview.reviews.map((rev) => (
                            <div key={rev.id} className="p-2 bg-charcoal-light border border-white/5 rounded text-xs space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-ivory">{rev.barberName}</span>
                                <span className="text-gold font-mono text-[11px] font-bold">{rev.stars} ★</span>
                              </div>
                              <p className="text-[11px] text-ivory-dim/75 italic">&quot;{rev.comment}&quot;</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Sticky Footer */}
              <div className="px-5 py-3 border-t border-white/10 bg-charcoal-light/95 backdrop-blur-sm flex items-center justify-between shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setActiveTool('none')}
                  className="h-9 px-4 text-xs border-white/10 text-ivory-dim hover:text-ivory cursor-pointer"
                >
                  Close
                </Button>
                {testDataReview && testDataReview.counts.total > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isCleaningUp}
                    onClick={() => {
                      setActiveTool('none');
                      setShowCleanupModal(true);
                    }}
                    className="h-9 px-4 text-xs border-rose-500/30 text-rose-300 hover:bg-rose-500/10 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Clean Up Test Data...
                  </Button>
                )}
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* Confirmation Modal: Clean Up Test Data */}
      {showCleanupModal && (
        <Modal
          isOpen={true}
          onClose={() => !isCleaningUp && setShowCleanupModal(false)}
          title="Clean Up Test Data?"
          size="sm"
        >
          <div className="space-y-3.5">
            <p className="text-xs text-ivory-dim leading-relaxed">
              Safely removes diagnostic test records. Real customer bookings, walk-ins, and reviews are not affected. Audit logs are permanently preserved.
            </p>

            {cleanupError && (
              <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                {cleanupError}
              </div>
            )}

            {/* Scope Selection */}
            <div className="space-y-1.5">
              <span className="text-xs font-mono uppercase text-ivory/80 block font-semibold">
                Cleanup Scope
              </span>
              <div className="space-y-1.5 text-xs text-ivory">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="cleanScope"
                    value="all"
                    disabled={isCleaningUp}
                    checked={cleanupScope === 'all'}
                    onChange={() => setCleanupScope('all')}
                    className="accent-rose-500 cursor-pointer disabled:opacity-50"
                  />
                  <span>All Test Data ({testCounts.total} records)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="cleanScope"
                    value="reservations"
                    disabled={isCleaningUp}
                    checked={cleanupScope === 'reservations'}
                    onChange={() => setCleanupScope('reservations')}
                    className="accent-rose-500 cursor-pointer disabled:opacity-50"
                  />
                  <span>Reservations Only ({testCounts.reservationsCount})</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="cleanScope"
                    value="walk-ins"
                    disabled={isCleaningUp}
                    checked={cleanupScope === 'walk-ins'}
                    onChange={() => setCleanupScope('walk-ins')}
                    className="accent-rose-500 cursor-pointer disabled:opacity-50"
                  />
                  <span>Walk-ins Only ({testCounts.walkInsCount})</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="cleanScope"
                    value="reviews"
                    disabled={isCleaningUp}
                    checked={cleanupScope === 'reviews'}
                    onChange={() => setCleanupScope('reviews')}
                    className="accent-rose-500 cursor-pointer disabled:opacity-50"
                  />
                  <span>Reviews Only ({testCounts.reviewsCount})</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                disabled={isCleaningUp}
                onClick={() => setShowCleanupModal(false)}
                className="h-8 px-3 text-xs border-white/10 text-ivory-dim cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleCleanupTestData}
                disabled={isCleaningUp}
                aria-busy={isCleaningUp}
                className="h-8 px-3 text-xs bg-rose-600 hover:bg-rose-500 text-white font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {isCleaningUp ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                    <span>Cleaning up…</span>
                  </>
                ) : (
                  <span>Clean Up Test Data</span>
                )}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
