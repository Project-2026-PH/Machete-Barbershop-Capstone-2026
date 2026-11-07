import React, { useState } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, Clock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export type TimePeriod = 'morning' | 'afternoon' | 'evening';

export interface CalendarDay {
  isoDate: string;
  dayName: string;
  dayNumber: number;
  fullDate: string;
  monthYear: string;
}

export interface DateStatus {
  label: string;
  reason: string;
  canBook: boolean;
  kind: 'bookable' | 'walk-in' | 'off-duty';
}

export interface TimeOption {
  hour: string;
  isCapacityExhausted: boolean;
  isPartialGroupCapacity: boolean;
  isBarberBlocked?: boolean;
  barberOccupiedUntil?: string;
  availableBarberCount: number;
}

export type TimeOptionsByPeriod = Record<TimePeriod, TimeOption[]>;

interface DateTimeStepProps {
  variant: 'desktop' | 'mobile-date' | 'mobile-time';
  days: CalendarDay[];
  todayIso: string;
  selectedDateIso: string | null;
  selectedDate: string | null;
  selectedTime: string | null;
  partySizeNote: string | null;
  isSpecificBarberFlow: boolean;
  getDateStatus: (isoDate: string) => DateStatus;
  timeOptions: TimeOptionsByPeriod;
  loadState: 'idle' | 'loading' | 'error' | 'ready';
  availabilityError: string | null;
  showCachedNotice: boolean;
  isRefreshing: boolean;
  onSelectDate: (day: CalendarDay) => void;
  onSelectTime: (time: string) => void;
  onRetry: () => void;
  onChangeDate: () => void;
}

const DAYS_PER_PAGE = 7;
const PERIODS: TimePeriod[] = ['morning', 'afternoon', 'evening'];

const PERIOD_META: Record<TimePeriod, { label: string; range: string }> = {
  morning: { label: 'Morning', range: 'Before 12:00 PM' },
  afternoon: { label: 'Afternoon', range: '12:00 – 4:59 PM' },
  evening: { label: 'Evening', range: '5:00 PM onward' },
};

// A time is hidden when it is fully booked. Barber-blocked times stay visible
// because the customer can still pick a peer barber from them.
const isBookableTime = (option: TimeOption): boolean =>
  !option.isCapacityExhausted || Boolean(option.isBarberBlocked);

const statusTextClass = (kind: DateStatus['kind']): string => {
  if (kind === 'walk-in') return 'text-amber-400';
  if (kind === 'bookable') return 'text-emerald-400';
  return 'text-ivory-dim/60';
};

export const DateTimeStep: React.FC<DateTimeStepProps> = ({
  variant,
  days,
  todayIso,
  selectedDateIso,
  selectedDate,
  selectedTime,
  partySizeNote,
  isSpecificBarberFlow,
  getDateStatus,
  timeOptions,
  loadState,
  availabilityError,
  showCachedNotice,
  isRefreshing,
  onSelectDate,
  onSelectTime,
  onRetry,
  onChangeDate,
}) => {
  const [pageOverride, setPageOverride] = useState<number | null>(null);
  const [periodPick, setPeriodPick] = useState<{ dateIso: string; period: TimePeriod } | null>(null);

  const selectedIndex = days.findIndex((day) => day.isoDate === selectedDateIso);
  const pageCount = Math.ceil(days.length / DAYS_PER_PAGE);
  const page = pageOverride ?? Math.max(0, Math.floor(selectedIndex / DAYS_PER_PAGE));
  const pageDays = days.slice(page * DAYS_PER_PAGE, page * DAYS_PER_PAGE + DAYS_PER_PAGE);
  const monthLabel = pageDays[0]?.monthYear ?? '';

  const visibleByPeriod: TimeOptionsByPeriod = {
    morning: timeOptions.morning.filter(isBookableTime),
    afternoon: timeOptions.afternoon.filter(isBookableTime),
    evening: timeOptions.evening.filter(isBookableTime),
  };
  const visibleTotal = PERIODS.reduce((sum, key) => sum + visibleByPeriod[key].length, 0);
  const totalCandidates = PERIODS.reduce((sum, key) => sum + timeOptions[key].length, 0);
  const hiddenCount = totalCandidates - visibleTotal;

  const openPeriods = PERIODS.filter((key) => visibleByPeriod[key].length > 0);
  const firstPeriodWithSlots = openPeriods[0] ?? null;
  const activePeriod: TimePeriod | null =
    periodPick && periodPick.dateIso === selectedDateIso && visibleByPeriod[periodPick.period].length > 0
      ? periodPick.period
      : firstPeriodWithSlots;

  const isToday = Boolean(selectedDateIso) && selectedDateIso === todayIso;
  const nextDay = selectedIndex >= 0 ? days[selectedIndex + 1] : undefined;

  const renderDates = () => (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-gold font-bold">1. Select Date</p>
          <p className="text-xs text-ivory-dim font-light mt-0.5">Choose your preferred appointment day</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            aria-label="Previous days"
            disabled={page === 0}
            onClick={() => setPageOverride(page - 1)}
            className="p-1.5 rounded-full text-ivory-dim hover:text-gold hover:bg-white/5 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="min-w-[7.5rem] text-center text-sm font-serif font-bold text-ivory">{monthLabel}</span>
          <button
            type="button"
            aria-label="Next days"
            disabled={page >= pageCount - 1}
            onClick={() => setPageOverride(page + 1)}
            className="p-1.5 rounded-full text-ivory-dim hover:text-gold hover:bg-white/5 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {days.length === 0 ? (
        <div className="p-6 border border-gold/20 bg-gold/[0.03] rounded-sm text-center">
          <p className="text-sm text-ivory font-serif font-bold">No Online Booking Dates Available</p>
          <p className="text-xs text-ivory-dim mt-1.5 leading-relaxed">
            No online booking dates are open right now. Please contact the shop for advance appointments.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {pageDays.map((day) => {
            const isSelected = day.isoDate === selectedDateIso;
            const status = isSpecificBarberFlow ? getDateStatus(day.isoDate) : null;
            const disabled = Boolean(status && !status.canBook);

            let subLabel = '';
            if (isSelected && loadState === 'ready') {
              subLabel = visibleTotal > 0 ? `${visibleTotal} open` : 'Full';
            } else if (status) {
              subLabel = status.label;
            }

            return (
              <button
                key={day.isoDate}
                type="button"
                disabled={disabled}
                aria-pressed={isSelected}
                title={status?.reason}
                onClick={() => onSelectDate(day)}
                className={`flex min-h-[72px] flex-col items-center justify-center rounded-lg border px-1 py-2 transition-all duration-200 ${
                  disabled
                    ? 'border-white/5 bg-white/[0.01] text-ivory-dim/40 opacity-40 cursor-not-allowed'
                    : isSelected
                      ? 'bg-gold text-charcoal border-gold shadow-[0_0_20px_rgba(212,175,55,0.3)]'
                      : 'border-white/10 bg-white/[0.03] text-ivory hover:border-gold/60 hover:bg-white/[0.06] cursor-pointer'
                }`}
              >
                <span className={`text-[10px] font-medium uppercase leading-tight ${isSelected ? 'text-charcoal/80' : 'text-ivory-dim'}`}>
                  {day.isoDate === todayIso ? 'Today' : day.dayName}
                </span>
                <span className={`mt-0.5 text-base sm:text-lg font-bold leading-tight ${isSelected ? 'text-charcoal' : 'text-ivory'}`}>
                  {day.dayNumber}
                </span>
                {subLabel && (
                  <span className={`mt-0.5 text-[10px] leading-tight ${
                    isSelected ? 'font-semibold text-charcoal/80' : status ? statusTextClass(status.kind) : 'text-ivory-dim'
                  }`}>
                    {subLabel}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );

  const renderSlotsGrid = () => {
    if (!activePeriod) return null;
    const options = visibleByPeriod[activePeriod];
    const gridCols = variant === 'desktop' ? 'grid-cols-6' : 'grid-cols-3';

    return (
      <div className={`grid ${gridCols} gap-2 sm:gap-2.5`}>
        {options.map((option) => {
          const isSelected = selectedTime === option.hour;
          const isBlocked = Boolean(option.isBarberBlocked);

          return (
            <button
              key={option.hour}
              id={`slot-btn-${option.hour.replace(/[^a-zA-Z0-9]/g, '-')}`}
              type="button"
              aria-pressed={isSelected}
              title={
                isBlocked && option.barberOccupiedUntil
                  ? `Barber occupied until ${option.barberOccupiedUntil}`
                  : option.isPartialGroupCapacity
                    ? `${option.availableBarberCount} chairs open. Choose stagger or next slot`
                    : undefined
              }
              onClick={() => onSelectTime(option.hour)}
              className={`flex min-h-[52px] flex-col items-center justify-center rounded-lg border px-2 py-2 transition-all duration-200 cursor-pointer ${
                isSelected
                  ? 'bg-gold text-charcoal border-gold font-bold shadow-[0_0_20px_rgba(212,175,55,0.3)]'
                  : isBlocked
                    ? 'border-amber-500/30 bg-amber-500/[0.04] hover:border-amber-400/60 hover:bg-amber-500/[0.08]'
                    : 'border-white/10 bg-white/[0.03] text-ivory hover:border-gold/60 hover:bg-white/[0.06]'
              }`}
            >
              <span className={`text-xs sm:text-sm font-bold ${isSelected ? 'text-charcoal' : 'text-ivory'}`}>
                {option.hour}
              </span>
              {isBlocked && option.barberOccupiedUntil ? (
                <span className="mt-0.5 max-w-full truncate text-[9px] font-semibold text-amber-400">
                  Occupied until {option.barberOccupiedUntil}
                </span>
              ) : option.isPartialGroupCapacity ? (
                <span className={`mt-0.5 text-[10px] font-semibold ${isSelected ? 'text-charcoal/80' : 'text-amber-400'}`}>
                  Limited · {option.availableBarberCount} chairs
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    );
  };

  const renderTimes = () => (
    <section className="space-y-3">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-gold font-bold">2. Select Time</p>
        {selectedDateIso ? (
          <p className="text-xs text-ivory-dim font-light mt-0.5">
            Open times for <span className="text-ivory font-bold">{selectedDate}</span>
            {partySizeNote && <> · {partySizeNote}</>}
          </p>
        ) : (
          <p className="text-xs text-ivory-dim font-light mt-0.5">Pick a day to see open times</p>
        )}
      </div>

      {isToday && (
        <div className="flex items-start gap-2 rounded-lg border border-gold/20 bg-gold/[0.04] px-3 py-2 text-xs text-ivory-dim">
          <Clock className="w-3.5 h-3.5 text-gold shrink-0 mt-0.5" />
          <span>Same-day bookings open 2 hours ahead, so earlier times are closed.</span>
        </div>
      )}

      {!selectedDateIso ? (
        <div className="p-8 border border-dashed border-white/10 rounded-sm text-center bg-white/[0.01]">
          <Clock className="w-8 h-8 text-ivory-dim/40 mx-auto mb-2" />
          <p className="text-ivory-dim text-sm italic">Select a date to see available times.</p>
        </div>
      ) : loadState === 'error' ? (
        <div className="rounded-sm border border-amber-500/20 bg-amber-500/[0.04] p-5 text-center">
          <p className="text-sm text-amber-200">{availabilityError}</p>
          <Button variant="outline" onClick={onRetry} className="mt-3 text-xs">
            Retry availability
          </Button>
        </div>
      ) : loadState === 'loading' ? (
        <div className={`grid gap-2.5 ${variant === 'desktop' ? 'grid-cols-6' : 'grid-cols-3'}`}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-[52px] rounded-lg border border-white/5 bg-white/[0.02] animate-pulse" />
          ))}
        </div>
      ) : visibleTotal === 0 ? (
        <div className="p-6 border border-dashed border-white/10 rounded-sm text-center space-y-3">
          <p className="text-ivory-dim text-sm italic">No open times on {selectedDate}.</p>
          {nextDay && (
            <Button variant="outline" onClick={() => onSelectDate(nextDay)} className="text-xs text-gold border-gold/40">
              Try {nextDay.fullDate}
            </Button>
          )}
        </div>
      ) : (
        <>
          {showCachedNotice && (
            <div className="flex items-center justify-between rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              <span className="flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                Connection issue. Showing cached times.
              </span>
              <button type="button" onClick={onRetry} className="ml-2 font-bold text-gold underline hover:text-gold-light">
                Retry
              </button>
            </div>
          )}
          {isRefreshing && (
            <div className="flex items-center gap-2 text-[10px] text-gold/70 animate-pulse">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Updating open times...</span>
            </div>
          )}

          {/* Only periods with open times are rendered, so a period disappears once its last slot is taken */}
          <div
            role="tablist"
            className={`grid ${openPeriods.length === 1 ? 'grid-cols-1' : openPeriods.length === 2 ? 'grid-cols-2' : 'grid-cols-3'} gap-2 p-1 rounded-lg border border-white/5 bg-white/[0.02]`}
          >
            {openPeriods.map((key) => {
              const count = visibleByPeriod[key].length;
              const isActive = activePeriod === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setPeriodPick({ dateIso: selectedDateIso as string, period: key })}
                  className={`flex flex-col items-center rounded-md border px-1 py-1.5 transition-all cursor-pointer ${
                    isActive
                      ? 'border-gold bg-gold/[0.06] text-gold'
                      : 'border-transparent text-ivory-dim hover:text-ivory hover:bg-white/[0.02]'
                  }`}
                >
                  <span className="text-xs font-bold leading-tight">{PERIOD_META[key].label}</span>
                  <span className="text-[10px] opacity-80">{count} open</span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-ivory-dim/70">{PERIOD_META[activePeriod as TimePeriod]?.range}</p>

          {renderSlotsGrid()}

          {hiddenCount > 0 && (
            <p className="text-[11px] text-ivory-dim/60">
              {hiddenCount} fully booked {hiddenCount === 1 ? 'time is' : 'times are'} hidden.
            </p>
          )}
        </>
      )}
    </section>
  );

  if (variant === 'mobile-time') {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center justify-between p-3.5 bg-white/[0.03] border border-white/10 rounded-sm">
          <div>
            <span className="block text-[10px] uppercase tracking-wider text-gold font-bold">Appointment Date</span>
            <span className="text-sm font-serif font-bold text-ivory">{selectedDate}</span>
          </div>
          <button type="button" onClick={onChangeDate} className="text-xs text-gold hover:underline font-semibold">
            Change Date
          </button>
        </div>
        {renderTimes()}
      </div>
    );
  }

  if (variant === 'mobile-date') {
    return <div className="space-y-6 animate-fade-in">{renderDates()}</div>;
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-5">{renderDates()}</div>
      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-5">{renderTimes()}</div>
    </div>
  );
};
