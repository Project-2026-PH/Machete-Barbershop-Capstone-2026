import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
    Calendar as CalendarIcon,
    ChevronLeft,
    ChevronRight,
    Clock,
    Globe,
    Users,
    Sparkles,
    CheckCircle2,
    CalendarDays,
    X,
    Scissors,
    ArrowRight,
    Edit3,
    AlertCircle,
} from 'lucide-react';
import type { StaffScheduleAssignment, StaffScheduleMember } from '@/features/admin/services/staff-schedule.service';
import Portal from '@/components/common/Portal';
import {
    springTransition,
    viewTransitionVariants,
    reducedMotionVariants,
} from './shift-animations';

interface StaffScheduleCalendarProps {
    year: number;
    month: number;
    staff: StaffScheduleMember[];
    assignments: StaffScheduleAssignment[];
    isComplete: boolean;
    autoFilledMonths?: number[];
    onMonthChange: (delta: number) => void;
    onGoToToday: () => void;
    onSelectDate: (dateIso: string) => void;
}

type CalendarViewMode = 'month' | 'week';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FULL_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_LABELS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

const pad = (n: number) => String(n).padStart(2, '0');
const toIsoDate = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;

const formatTime12h = (timeStr?: string | null): string => {
    if (!timeStr) return '';
    const [hStr, mStr] = timeStr.split(':');
    const h = parseInt(hStr, 10);
    if (isNaN(h)) return timeStr;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayH = h % 12 === 0 ? 12 : h % 12;
    return `${displayH}:${mStr || '00'} ${ampm}`;
};

const getInitials = (name: string): string => {
    if (!name) return '??';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

export const StaffScheduleCalendar: React.FC<StaffScheduleCalendarProps> = ({
    year,
    month,
    staff,
    assignments,
    isComplete,
    autoFilledMonths = [],
    onMonthChange,
    onGoToToday,
    onSelectDate,
}) => {
    const prefersReducedMotion = useReducedMotion();
    const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
    const [selectedWeekIndex, setSelectedWeekIndex] = useState<number>(0);
    const [selectedDateForModal, setSelectedDateForModal] = useState<string | null>(null);

    // Current real-world date in ISO
    const todayIso = useMemo(() => {
        const d = new Date();
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }, []);

    // Days in current selected month
    const daysInMonth = useMemo(() => new Date(year, month, 0).getDate(), [year, month]);
    const firstDayWeekday = useMemo(() => new Date(year, month - 1, 1).getDay(), [year, month]);

    // Map of assignments grouped by date -> array of assignments
    const assignmentsByDate = useMemo(() => {
        const map = new Map<string, StaffScheduleAssignment[]>();
        assignments.forEach((assignment) => {
            if (!map.has(assignment.shiftDate)) {
                map.set(assignment.shiftDate, []);
            }
            map.get(assignment.shiftDate)!.push(assignment);
        });
        return map;
    }, [assignments]);

    // Staff lookup map
    const staffMap = useMemo(() => {
        const map = new Map<string, StaffScheduleMember>();
        staff.forEach((m) => map.set(m.userId, m));
        return map;
    }, [staff]);

    // Construct full calendar day cells for the month view (including leading empty slots)
    const calendarCells = useMemo(() => {
        const cells: Array<{
            dayNumber: number | null;
            dateIso: string | null;
            isCurrentMonth: boolean;
            isToday: boolean;
        }> = [];

        // Leading blanks
        for (let i = 0; i < firstDayWeekday; i++) {
            cells.push({
                dayNumber: null,
                dateIso: null,
                isCurrentMonth: false,
                isToday: false,
            });
        }

        // Days of current month
        for (let day = 1; day <= daysInMonth; day++) {
            const dateIso = toIsoDate(year, month, day);
            cells.push({
                dayNumber: day,
                dateIso,
                isCurrentMonth: true,
                isToday: dateIso === todayIso,
            });
        }

        // Trailing blanks to complete standard 7-col grid
        const remainder = cells.length % 7;
        if (remainder > 0) {
            const trailing = 7 - remainder;
            for (let i = 0; i < trailing; i++) {
                cells.push({
                    dayNumber: null,
                    dateIso: null,
                    isCurrentMonth: false,
                    isToday: false,
                });
            }
        }

        return cells;
    }, [year, month, daysInMonth, firstDayWeekday, todayIso]);

    // Chunk into weeks for week view option
    const calendarWeeks = useMemo(() => {
        const weeks: Array<typeof calendarCells> = [];
        for (let i = 0; i < calendarCells.length; i += 7) {
            weeks.push(calendarCells.slice(i, i + 7));
        }
        return weeks;
    }, [calendarCells]);

    // Current week displayed if in week mode
    const displayedCells = useMemo(() => {
        if (viewMode === 'week') {
            const clampedIndex = Math.min(Math.max(0, selectedWeekIndex), calendarWeeks.length - 1);
            return calendarWeeks[clampedIndex] || [];
        }
        return calendarCells;
    }, [viewMode, selectedWeekIndex, calendarWeeks, calendarCells]);

    // Helper to compute stats for a single date cell
    const getDateStats = (dateIso: string | null) => {
        if (!dateIso) return null;
        const dayAssignments = assignmentsByDate.get(dateIso) || [];
        const onDutyStaff = dayAssignments.filter((a) => !a.isOff);
        const onDutyBarbers = onDutyStaff.filter((a) => {
            const member = staffMap.get(a.userId);
            return (member?.role || a.role) === 'Barber';
        });
        const onlineBarbers = onDutyBarbers.filter((a) => a.isOnlineBookingEnabled);
        const onDutyCashiers = onDutyStaff.filter((a) => {
            const member = staffMap.get(a.userId);
            return (member?.role || a.role) === 'Cashier';
        });

        return {
            onDutyStaff,
            onDutyBarbers,
            onlineBarbers,
            onDutyCashiers,
            onlineCount: onlineBarbers.length,
            isQuotaFilled: onlineBarbers.length >= 3,
        };
    };

    // Day details for open overview modal
    const selectedModalStats = useMemo(() => {
        return getDateStats(selectedDateForModal);
    }, [selectedDateForModal, assignmentsByDate, staffMap]);

    const formattedModalDate = useMemo(() => {
        if (!selectedDateForModal) return '';
        const [y, m, d] = selectedDateForModal.split('-').map(Number);
        const dateObj = new Date(y, m - 1, d);
        return dateObj.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    }, [selectedDateForModal]);

    const selectedModalOffDutyStaff = useMemo(() => {
        if (!selectedDateForModal) return [];
        const dayAssignments = assignmentsByDate.get(selectedDateForModal) || [];
        return dayAssignments.filter((a) => a.isOff);
    }, [selectedDateForModal, assignmentsByDate]);

    return (
        <motion.div
            variants={prefersReducedMotion ? reducedMotionVariants : viewTransitionVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="w-full flex flex-col gap-3 sm:gap-4 pb-8"
        >
            {/* Calendar Control & Header Bar */}
            <div className="shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-2.5 sm:gap-3 bg-charcoal-light border border-white/10 rounded-sm p-3 sm:p-4 mb-1 sm:mb-2">
                <div className="flex items-center justify-between sm:justify-start gap-2 sm:gap-3 w-full md:w-auto">
                    <div className="flex items-center gap-1 sm:gap-1.5 bg-charcoal border border-white/10 rounded-sm p-1">
                        <button
                            type="button"
                            onClick={() => onMonthChange(-1)}
                            className="min-h-[34px] min-w-[34px] sm:min-h-[36px] sm:min-w-[36px] rounded hover:bg-white/5 text-ivory-dim hover:text-gold flex items-center justify-center transition-colors cursor-pointer"
                            aria-label="Previous month"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <div className="px-2 sm:px-3 min-w-[120px] sm:min-w-[150px] text-center">
                            <h3 className="text-sm sm:text-base font-serif font-bold text-ivory tracking-wide">
                                {MONTH_LABELS[month - 1]} {year}
                            </h3>
                            <p className="text-[9px] sm:text-[10px] font-mono uppercase text-ivory-dim/70">
                                {daysInMonth} Days • {staff.length} Staff
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => onMonthChange(1)}
                            className="min-h-[34px] min-w-[34px] sm:min-h-[36px] sm:min-w-[36px] rounded hover:bg-white/5 text-ivory-dim hover:text-gold flex items-center justify-center transition-colors cursor-pointer"
                            aria-label="Next month"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>

                    <button
                        type="button"
                        onClick={onGoToToday}
                        className="min-h-[36px] sm:min-h-[38px] px-2.5 sm:px-3 rounded border border-white/15 bg-charcoal text-xs font-semibold text-ivory-dim hover:text-gold hover:border-gold/40 transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                        <CalendarIcon className="w-3.5 h-3.5 text-gold" />
                        <span>Today</span>
                    </button>
                </div>

                {/* View Mode Toggle & Status Badges */}
                <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
                    {/* View mode switcher */}
                    <div className="inline-flex bg-charcoal border border-white/10 p-0.5 rounded-sm text-xs">
                        <button
                            type="button"
                            onClick={() => setViewMode('month')}
                            className={`px-3 py-1.5 rounded-xs text-[11px] font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                                viewMode === 'month'
                                    ? 'bg-gold/20 text-gold border border-gold/40'
                                    : 'text-ivory-dim hover:text-ivory'
                            }`}
                        >
                            Month
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode('week')}
                            className={`px-3 py-1.5 rounded-xs text-[11px] font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                                viewMode === 'week'
                                    ? 'bg-gold/20 text-gold border border-gold/40'
                                    : 'text-ivory-dim hover:text-ivory'
                            }`}
                        >
                            Week
                        </button>
                    </div>

                    {/* Month completion status pill */}
                    <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                            isComplete
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                        }`}
                    >
                        <CheckCircle2 className="w-3 h-3" />
                        <span>{isComplete ? 'Roster Complete' : 'Incomplete Roster'}</span>
                    </span>

                    {/* Auto-fill indicator if applicable */}
                    {autoFilledMonths.includes(month) && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gold/10 border border-gold/30 text-gold">
                            <Sparkles className="w-3 h-3" />
                            <span>Pattern Auto-filled</span>
                        </span>
                    )}
                </div>
            </div>

            {/* If in week mode, provide a week stepper */}
            {viewMode === 'week' && (
                <div className="shrink-0 flex items-center justify-between px-3 py-2 bg-charcoal border border-white/10 rounded-sm mb-2">
                    <button
                        type="button"
                        onClick={() => setSelectedWeekIndex((i) => Math.max(0, i - 1))}
                        disabled={selectedWeekIndex === 0}
                        className="px-2.5 py-1 text-xs text-ivory-dim hover:text-gold disabled:opacity-40 disabled:hover:text-ivory-dim cursor-pointer transition-colors"
                    >
                        &larr; Previous Week
                    </button>
                    <span className="text-xs font-mono font-bold text-ivory">
                        Week {selectedWeekIndex + 1} of {calendarWeeks.length}
                    </span>
                    <button
                        type="button"
                        onClick={() => setSelectedWeekIndex((i) => Math.min(calendarWeeks.length - 1, i + 1))}
                        disabled={selectedWeekIndex === calendarWeeks.length - 1}
                        className="px-2.5 py-1 text-xs text-ivory-dim hover:text-gold disabled:opacity-40 disabled:hover:text-ivory-dim cursor-pointer transition-colors"
                    >
                        Next Week &rarr;
                    </button>
                </div>
            )}

            {/* Calendar Grid Container */}
            <div className="w-full bg-charcoal rounded-sm border border-white/10 flex flex-col overflow-hidden shadow-xl">
                {/* Weekday Column Headers */}
                <div className="grid grid-cols-7 border-b border-white/10 bg-charcoal-light/60">
                    {WEEKDAYS.map((day, idx) => (
                        <div
                            key={day}
                            className={`py-1.5 sm:py-2 md:py-2.5 px-0.5 sm:px-1 text-center text-[10px] sm:text-xs font-bold uppercase tracking-wider ${
                                idx === 0 || idx === 6 ? 'text-gold/90' : 'text-ivory-dim'
                            }`}
                        >
                            <span className="hidden md:inline">{FULL_WEEKDAYS[idx]}</span>
                            <span className="md:hidden">{day.toUpperCase()}</span>
                        </div>
                    ))}
                </div>

                {/* Calendar Days Grid */}
                <div className="w-full grid grid-cols-7 auto-rows-fr divide-x divide-y divide-white/5 bg-[#0e0e0e]">
                    {displayedCells.map((cell, idx) => {
                        if (!cell.dayNumber || !cell.dateIso) {
                            return (
                                <div
                                    key={`empty-${idx}`}
                                    className="bg-charcoal-dark/40 h-10 sm:h-12 md:h-auto md:min-h-[140px] p-1 md:p-2.5 select-none border-b border-white/5"
                                    aria-hidden="true"
                                />
                            );
                        }

                        const stats = getDateStats(cell.dateIso);
                        const isToday = cell.isToday;

                        return (
                            <div
                                key={cell.dateIso}
                                role="button"
                                tabIndex={0}
                                onClick={() => setSelectedDateForModal(cell.dateIso!)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        setSelectedDateForModal(cell.dateIso!);
                                    }
                                }}
                                className={`group relative h-10 sm:h-12 md:h-auto md:min-h-[140px] flex flex-col justify-between p-1 md:p-2.5 transition-all duration-150 cursor-pointer border-b border-white/5 ${
                                    isToday
                                        ? 'bg-gold/[0.04] hover:bg-gold/[0.08] ring-1 ring-inset ring-gold/40'
                                        : 'bg-charcoal/50 hover:bg-white/[0.04]'
                                }`}
                                aria-label={`View schedule details for ${cell.dateIso}`}
                            >
                                {/* Top Row: Date Number & Status */}
                                <div className="flex items-center justify-between text-[11px] md:text-xs leading-tight w-full gap-0.5">
                                    <span
                                        className={`font-semibold font-mono inline-flex items-center justify-center transition-transform group-hover:scale-105 shrink-0 ${
                                            isToday
                                                ? 'min-w-[17px] h-[17px] md:min-w-[22px] md:h-[22px] rounded-full bg-gold text-charcoal font-black shadow-[0_0_8px_rgba(212,175,55,0.4)] text-[10px] md:text-xs'
                                                : 'text-ivory group-hover:text-gold text-xs'
                                        }`}
                                    >
                                        {cell.dayNumber}
                                    </span>

                                    {/* Verbose text indicator (Off Duty / X active): hidden on mobile (< md), visible on desktop */}
                                    <span className="hidden md:inline text-[10px] text-neutral-400 font-mono font-medium truncate">
                                        {stats && stats.onDutyStaff.length > 0
                                            ? `${stats.onDutyStaff.length} active`
                                            : 'Off Duty'}
                                    </span>
                                </div>

                                {/* Mobile Indicator (< md): Minimal high-density dot or compact badge */}
                                <div className="flex md:hidden items-center justify-center my-auto w-full">
                                    {stats && stats.onDutyStaff.length > 0 ? (
                                        <span
                                            className={`inline-flex items-center justify-center gap-1 px-1 py-0.5 rounded text-[9px] font-bold font-mono border leading-none ${
                                                stats.isQuotaFilled
                                                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                                    : 'bg-gold/15 text-gold border-gold/30'
                                            }`}
                                        >
                                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${stats.isQuotaFilled ? 'bg-emerald-400' : 'bg-gold'}`} />
                                            <span>{stats.onDutyStaff.length}</span>
                                        </span>
                                    ) : isToday ? (
                                        <span className="w-1.5 h-1.5 rounded-full bg-gold shadow-[0_0_4px_rgba(212,175,55,0.6)]" />
                                    ) : null}
                                </div>

                                {/* Desktop Middle Row (>= md): Centered Avatar Stack & Online Badge */}
                                <div className="hidden md:flex flex-col items-center justify-center gap-1.5 my-auto w-full py-1">
                                    {stats && stats.onDutyStaff.length > 0 ? (
                                        <>
                                            {/* Desktop Avatar Stack (at most 3 overlapping circles + count badge) */}
                                            <div className="flex items-center justify-center -space-x-1.5 max-w-full overflow-hidden py-0.5">
                                                {stats.onDutyStaff.slice(0, 3).map((assignment) => {
                                                    const member = staffMap.get(assignment.userId);
                                                    const name = member?.name || assignment.staffName || 'Staff';
                                                    const role = member?.role || assignment.role;
                                                    const isBarber = role === 'Barber';
                                                    const isOnline = Boolean(assignment.isOnlineBookingEnabled);
                                                    const hours = `${formatTime12h(assignment.startTime)} - ${formatTime12h(assignment.endTime)}`;
                                                    const tooltip = `${name} (${role}) • ${hours}${isBarber ? (isOnline ? ' • Online Booking Active' : ' • Walk-in Only') : ''}`;
                                                    const avatarUrl = member?.profile_picture || assignment.profile_picture;

                                                    return (
                                                        <div
                                                            key={`d-${assignment.userId}`}
                                                            title={tooltip}
                                                            className={`relative flex items-center justify-center text-[10px] font-bold rounded-full ring-2 ring-charcoal transition-all overflow-hidden shrink-0 ${
                                                                isBarber
                                                                    ? isOnline
                                                                        ? 'w-7 h-7 bg-gold/20 text-gold border border-gold/60 shadow-[0_0_6px_rgba(212,175,55,0.25)]'
                                                                        : 'w-7 h-7 bg-charcoal-light text-ivory border border-gold/30'
                                                                    : 'w-7 h-7 bg-sky-500/15 text-sky-300 border border-sky-500/30'
                                                            }`}
                                                        >
                                                            <span className="select-none">{getInitials(name)}</span>
                                                            {avatarUrl && (
                                                                <img
                                                                    src={avatarUrl}
                                                                    alt={name}
                                                                    className="absolute inset-0 w-full h-full object-cover"
                                                                    onError={(e) => {
                                                                        (e.currentTarget as HTMLElement).style.display = 'none';
                                                                    }}
                                                                />
                                                            )}
                                                        </div>
                                                    );
                                                })}

                                                {stats.onDutyStaff.length > 3 && (
                                                    <div
                                                        title={stats.onDutyStaff
                                                            .slice(3)
                                                            .map((a) => {
                                                                const m = staffMap.get(a.userId);
                                                                return `${m?.name || a.staffName} (${m?.role || a.role})`;
                                                            })
                                                            .join(', ')}
                                                        className="w-7 h-7 rounded-full bg-charcoal-light ring-2 ring-charcoal text-ivory-dim border border-white/20 flex items-center justify-center text-[9px] font-mono font-bold shrink-0"
                                                    >
                                                        +{stats.onDutyStaff.length - 3}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Online Badge (e.g., 3/3 online) */}
                                            {stats.onDutyBarbers.length > 0 && (
                                                <div className="flex items-center justify-center">
                                                    <span
                                                        title={
                                                            stats.isQuotaFilled
                                                                ? '3 of 3 barbers online • Quota Filled'
                                                                : stats.onlineCount > 0
                                                                ? `${stats.onlineCount} of 3 barbers online • Under-allocated (${3 - stats.onlineCount} slots open)`
                                                                : '0 of 3 barbers online • Walk-in only'
                                                        }
                                                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold tracking-tight border transition-all ${
                                                            stats.isQuotaFilled
                                                                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                                                : stats.onlineCount > 0
                                                                ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                                                : 'bg-white/5 text-ivory-dim/60 border-white/10'
                                                        }`}
                                                    >
                                                        <Globe className={`w-2.5 h-2.5 shrink-0 ${stats.isQuotaFilled ? 'text-emerald-400' : stats.onlineCount > 0 ? 'text-amber-400' : 'text-ivory-dim/50'}`} />
                                                        <span>{stats.onlineCount}/3 online</span>
                                                    </span>
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <div className="h-6 flex items-center justify-center text-ivory-dim/30 text-xs italic font-mono">
                                            —
                                        </div>
                                    )}
                                </div>

                                {/* Desktop Bottom Row (>= md): "View Roster →" Affordance or Non-working State */}
                                <div className="hidden md:flex w-full pt-1.5 border-t border-white/[0.06] items-center justify-center text-center">
                                    {stats && stats.onDutyStaff.length > 0 ? (
                                        <span className="text-[11px] text-amber-400 font-semibold hover:underline flex items-center justify-center gap-0.5 transition-colors">
                                            View Roster &rarr;
                                        </span>
                                    ) : (
                                        <span className="text-[11px] text-neutral-500 font-mono">
                                            {stats && stats.onDutyBarbers.length === 0 && stats.onDutyStaff.length > 0
                                                ? 'No barbers'
                                                : 'Off Duty'}
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Quick Legend Footer */}
            <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-charcoal-light/60 border border-white/10 rounded-sm text-[11px] text-ivory-dim mt-4 sm:mt-5 shadow-lg">
                <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                    <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full bg-gold/20 border border-gold/60 inline-block" />
                        <span>Barber (Gold)</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full bg-sky-500/20 border border-sky-500/60 inline-block" />
                        <span>Cashier (Sky)</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block shadow-[0_0_6px_rgba(52,211,153,0.5)]" />
                        <span>Online Booking Active</span>
                    </span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-gold/80">
                    <CalendarDays className="w-3.5 h-3.5" />
                    <span>Click any day to configure shift hours and online booking allocation</span>
                </div>
            </div>
            {/* Day Roster Overview Modal (Compact, Sticky Header/Footer & Mobile Bounds) */}
            <Portal>
                <AnimatePresence>
                    {selectedDateForModal && selectedModalStats && (
                        <div
                            className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 pb-20 sm:pb-4 bg-black/80 backdrop-blur-xs overscroll-contain select-none"
                            onClick={() => setSelectedDateForModal(null)}
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="day-roster-title"
                        >
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                                transition={prefersReducedMotion ? { duration: 0 } : springTransition}
                                className="relative w-full max-w-[340px] xs:max-w-sm sm:max-w-md bg-charcoal border border-gold/30 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[calc(100dvh-6rem)] sm:max-h-[85vh] my-auto select-text"
                                onClick={(e) => e.stopPropagation()}
                            >
                                {/* Modal Header (Sticky / Fixed Top) */}
                                <div className="shrink-0 flex items-center justify-between p-3 sm:p-4 border-b border-white/10 bg-charcoal-light">
                                    <div className="flex items-center gap-2.5 sm:gap-3">
                                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gold/10 border border-gold/30 flex items-center justify-center text-gold shrink-0">
                                            <CalendarIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-1.5 sm:gap-2">
                                                <span className="text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-widest text-gold">
                                                    Day Roster Overview
                                                </span>
                                                {selectedDateForModal === todayIso && (
                                                    <span className="px-1.5 py-0.2 rounded text-[8px] sm:text-[9px] font-mono font-bold uppercase bg-gold text-charcoal">
                                                        Today
                                                    </span>
                                                )}
                                            </div>
                                            <h3 id="day-roster-title" className="text-sm sm:text-base font-serif font-bold text-ivory">
                                                {formattedModalDate}
                                            </h3>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedDateForModal(null)}
                                        className="p-1 sm:p-1.5 rounded-lg text-ivory-dim hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                                        aria-label="Close overview"
                                    >
                                        <X className="w-4 h-4 sm:w-5 sm:h-5" />
                                    </button>
                                </div>

                                {/* Shift Coverage Metrics Bar (Sticky / Fixed below Header) */}
                                <div className="shrink-0 grid grid-cols-3 divide-x divide-white/5 border-b border-white/10 bg-white/[0.02]">
                                    <div className="p-2 sm:p-3 text-center">
                                        <p className="text-[9px] sm:text-[10px] font-mono uppercase text-ivory-dim">On Duty</p>
                                        <p className="text-sm sm:text-lg font-bold font-mono text-ivory mt-0.5">
                                            {selectedModalStats.onDutyStaff.length}
                                            <span className="text-[10px] sm:text-xs text-ivory-dim/60 font-normal"> / {staff.length}</span>
                                        </p>
                                    </div>
                                    <div className="p-2 sm:p-3 text-center">
                                        <p className="text-[9px] sm:text-[10px] font-mono uppercase text-ivory-dim">Online Quota</p>
                                        <div className="flex items-center justify-center gap-1 sm:gap-1.5 mt-0.5">
                                            <span className={`text-sm sm:text-lg font-bold font-mono ${selectedModalStats.isQuotaFilled ? 'text-emerald-400' : selectedModalStats.onlineCount > 0 ? 'text-amber-400' : 'text-ivory-dim'}`}>
                                                {selectedModalStats.onlineCount}/3
                                            </span>
                                            <Globe className={`w-3 h-3 sm:w-3.5 sm:h-3.5 ${selectedModalStats.isQuotaFilled ? 'text-emerald-400' : selectedModalStats.onlineCount > 0 ? 'text-amber-400' : 'text-ivory-dim/50'}`} />
                                        </div>
                                    </div>
                                    <div className="p-2 sm:p-3 text-center">
                                        <p className="text-[9px] sm:text-[10px] font-mono uppercase text-ivory-dim">Barbers / Cashiers</p>
                                        <p className="text-sm sm:text-lg font-bold font-mono text-ivory mt-0.5">
                                            <span className="text-gold">{selectedModalStats.onDutyBarbers.length}</span>
                                            <span className="text-[10px] sm:text-xs text-ivory-dim/40 mx-1">•</span>
                                            <span className="text-sky-300">{selectedModalStats.onDutyCashiers.length}</span>
                                        </p>
                                    </div>
                                </div>

                                {/* Modal Body: Scheduled Staff List (Only this section is scrollable) */}
                                <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4 custom-scrollbar touch-pan-y overscroll-contain">
                                    <div>
                                        <h4 className="text-[11px] sm:text-xs font-mono font-bold uppercase tracking-wider text-ivory-dim mb-2 sm:mb-3 flex items-center justify-between">
                                            <span>Scheduled Active Roster</span>
                                            <span className="text-[10px] sm:text-[11px] font-normal text-gold">
                                                {selectedModalStats.onDutyStaff.length} Member{selectedModalStats.onDutyStaff.length !== 1 ? 's' : ''}
                                            </span>
                                        </h4>

                                        {selectedModalStats.onDutyStaff.length === 0 ? (
                                            <div className="p-4 sm:p-6 text-center rounded-lg border border-dashed border-white/10 bg-white/[0.02]">
                                                <AlertCircle className="w-6 h-6 sm:w-8 sm:h-8 text-ivory-dim/40 mx-auto mb-1.5 sm:mb-2" />
                                                <p className="text-xs sm:text-sm font-medium text-ivory-dim">No staff scheduled on duty for this date.</p>
                                                <p className="text-[10px] sm:text-xs text-ivory-dim/60 mt-1">Click &ldquo;Edit Shifts&rdquo; below to assign daily shifts.</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-1.5 sm:space-y-2">
                                                {selectedModalStats.onDutyStaff.map((assignment) => {
                                                    const member = staffMap.get(assignment.userId);
                                                    const name = member?.name || assignment.staffName || 'Staff Member';
                                                    const role = member?.role || assignment.role;
                                                    const isBarber = role === 'Barber';
                                                    const isOnline = Boolean(assignment.isOnlineBookingEnabled);
                                                    const hours = `${formatTime12h(assignment.startTime)} - ${formatTime12h(assignment.endTime)}`;

                                                    const modalAvatarUrl = member?.profile_picture || assignment.profile_picture;

                                                    return (
                                                        <div
                                                            key={assignment.userId}
                                                            className="flex items-center justify-between p-2 sm:p-3 rounded-lg border border-white/5 bg-charcoal-light/70 hover:border-gold/30 transition-colors gap-2"
                                                        >
                                                            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                                                                <div className={`relative w-7 h-7 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-bold shrink-0 border overflow-hidden ${
                                                                    isBarber
                                                                        ? isOnline
                                                                            ? 'bg-gold/20 text-gold border-gold/60 shadow-[0_0_8px_rgba(212,175,55,0.25)]'
                                                                            : 'bg-charcoal text-ivory border-gold/30'
                                                                        : 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                                                                }`}>
                                                                    <span className="select-none">{getInitials(name)}</span>
                                                                    {modalAvatarUrl && (
                                                                        <img
                                                                            src={modalAvatarUrl}
                                                                            alt={name}
                                                                            className="absolute inset-0 w-full h-full object-cover"
                                                                            onError={(e) => {
                                                                                (e.currentTarget as HTMLElement).style.display = 'none';
                                                                            }}
                                                                        />
                                                                    )}
                                                                    {isBarber && isOnline && (
                                                                        <span className="absolute -top-0.5 -right-0.5 w-2 sm:w-2.5 h-2 sm:h-2.5 rounded-full bg-emerald-400 border sm:border-2 border-charcoal z-10" />
                                                                    )}
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <div className="flex items-center gap-1.5 sm:gap-2">
                                                                        <p className="text-xs sm:text-sm font-semibold text-ivory truncate">{name}</p>
                                                                        <span className={`px-1 sm:px-1.5 py-0.2 text-[8px] sm:text-[9px] font-mono font-bold uppercase rounded ${
                                                                            isBarber ? 'bg-gold/15 text-gold' : 'bg-sky-500/15 text-sky-300'
                                                                        }`}>
                                                                            {role}
                                                                        </span>
                                                                    </div>
                                                                    <p className="text-[10px] sm:text-xs text-ivory-dim flex items-center gap-1 mt-0.5 font-mono">
                                                                        <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-gold/80 shrink-0" />
                                                                        <span className="truncate">{hours}</span>
                                                                    </p>
                                                                </div>
                                                            </div>

                                                            {/* Online Booking / Walk-in Availability Badge */}
                                                            {isBarber && (
                                                                <div className="shrink-0">
                                                                    {isOnline ? (
                                                                        <span className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[9px] sm:text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-[0_0_8px_rgba(16,185,129,0.15)]">
                                                                            <Globe className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-emerald-400 shrink-0" />
                                                                            <span className="hidden xs:inline">Online Booking</span>
                                                                            <span className="xs:hidden">Online</span>
                                                                        </span>
                                                                    ) : (
                                                                        <span className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[9px] sm:text-[10px] font-mono font-semibold bg-white/5 text-ivory-dim/70 border border-white/10">
                                                                            <Scissors className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-ivory-dim/50 shrink-0" />
                                                                            <span className="hidden xs:inline">Walk-in</span>
                                                                            <span className="xs:hidden">Walk-in</span>
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>

                                    {/* Off-Duty Staff Summary (if any) */}
                                    {selectedModalOffDutyStaff.length > 0 && (
                                        <div className="pt-2 border-t border-white/5">
                                            <h5 className="text-[10px] sm:text-[11px] font-mono uppercase tracking-wider text-ivory-dim/60 mb-1.5">
                                                Off Duty ({selectedModalOffDutyStaff.length})
                                            </h5>
                                            <div className="flex flex-wrap gap-1 sm:gap-1.5">
                                                {selectedModalOffDutyStaff.map((assignment) => {
                                                    const member = staffMap.get(assignment.userId);
                                                    const name = member?.name || assignment.staffName || 'Staff';
                                                    return (
                                                        <span
                                                            key={assignment.userId}
                                                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] sm:text-xs bg-white/[0.03] border border-white/5 text-ivory-dim/60 font-mono"
                                                        >
                                                            <span className="w-1.5 h-1.5 rounded-full bg-white/30" />
                                                            <span>{name}</span>
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Modal Footer with "Edit Shifts" CTA (Sticky / Fixed Bottom) */}
                                <div className="shrink-0 flex items-center justify-between p-3 sm:p-4 border-t border-white/10 bg-charcoal-light">
                                    <button
                                        type="button"
                                        onClick={() => setSelectedDateForModal(null)}
                                        className="px-3 sm:px-4 py-1.5 sm:py-2 rounded border border-white/15 text-xs font-semibold text-ivory-dim hover:text-white hover:border-white/30 transition-colors cursor-pointer"
                                    >
                                        Close
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const targetDate = selectedDateForModal;
                                            setSelectedDateForModal(null);
                                            onSelectDate(targetDate);
                                        }}
                                        className="px-3.5 sm:px-5 py-1.5 sm:py-2 rounded bg-gold hover:bg-gold-light text-charcoal font-bold text-xs shadow-[0_0_15px_rgba(212,175,55,0.3)] hover:shadow-[0_0_20px_rgba(212,175,55,0.5)] transition-all flex items-center gap-1.5 sm:gap-2 cursor-pointer"
                                    >
                                        <Edit3 className="w-3.5 h-3.5" />
                                        <span>Edit Shifts</span>
                                        <ArrowRight className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>
            </Portal>
        </motion.div>
    );
};

export default StaffScheduleCalendar;
