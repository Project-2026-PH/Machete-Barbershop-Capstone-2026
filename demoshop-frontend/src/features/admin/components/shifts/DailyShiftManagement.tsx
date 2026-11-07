import React, { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
    Calendar as CalendarIcon,
    ChevronLeft,
    ChevronRight,
    Clock,
    Globe,
    Save,
    Sparkles,
    Shield,
    Users,
    Check,
    X,
    AlertCircle,
    Info,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { StaffScheduleAssignment, StaffScheduleMember } from '@/features/admin/services/staff-schedule.service';
import {
    springTransition,
    snappySpringTransition,
    viewTransitionVariants,
    cardContainerVariants,
    cardItemVariants,
    reducedMotionVariants,
} from './shift-animations';

interface DailyShiftManagementProps {
    selectedDateIso: string;
    onDateChange: (dateIso: string) => void;
    onBackToCalendar?: () => void;
    staff: StaffScheduleMember[];
    assignments: StaffScheduleAssignment[];
    onUpdateAssignment: (userId: string, shiftDate: string, patch: Partial<StaffScheduleAssignment>) => void;
    onSave: () => Promise<void>;
    isSaving: boolean;
    onApplyPatternToDay?: (dateIso: string) => void;
    showToast: (message: string) => void;
}

const PRESET_SHIFTS = [
    { label: 'Full Day', startTime: '09:00', endTime: '21:00', desc: '09:00 AM - 09:00 PM' },
    { label: 'Morning', startTime: '09:00', endTime: '15:00', desc: '09:00 AM - 03:00 PM' },
    { label: 'Afternoon', startTime: '15:00', endTime: '21:00', desc: '03:00 PM - 09:00 PM' },
];

const pad = (n: number) => String(n).padStart(2, '0');

const formatDisplayDate = (isoDate: string): { dayName: string; formattedDate: string; isToday: boolean } => {
    const [y, m, d] = isoDate.split('-').map(Number);
    const dateObj = new Date(Date.UTC(y, m - 1, d));
    const now = new Date();
    const todayIso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
    const formattedDate = dateObj.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
    });

    return {
        dayName,
        formattedDate,
        isToday: isoDate === todayIso,
    };
};

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

export const DailyShiftManagement: React.FC<DailyShiftManagementProps> = ({
    selectedDateIso,
    onDateChange,
    onBackToCalendar,
    staff,
    assignments,
    onUpdateAssignment,
    onSave,
    isSaving,
    onApplyPatternToDay,
    showToast,
}) => {
    const prefersReducedMotion = useReducedMotion();
    const [customEditUserId, setCustomEditUserId] = useState<string | null>(null);

    const { dayName, formattedDate, isToday } = useMemo(
        () => formatDisplayDate(selectedDateIso),
        [selectedDateIso]
    );

    // Step date by delta days
    const stepDate = (deltaDays: number) => {
        const [y, m, d] = selectedDateIso.split('-').map(Number);
        const dateObj = new Date(Date.UTC(y, m - 1, d + deltaDays));
        const nextIso = `${dateObj.getUTCFullYear()}-${pad(dateObj.getUTCMonth() + 1)}-${pad(dateObj.getUTCDate())}`;
        onDateChange(nextIso);
    };

    // Find assignments for current selected date
    const dayAssignments = useMemo(() => {
        const map = new Map<string, StaffScheduleAssignment>();
        assignments
            .filter((a) => a.shiftDate === selectedDateIso)
            .forEach((a) => map.set(a.userId, a));
        return map;
    }, [assignments, selectedDateIso]);

    // Compute online booking allocation count for current selected date (Max 3 Barbers Rule)
    const onlineBookingCount = useMemo(() => {
        let count = 0;
        staff.forEach((member) => {
            if (member.role !== 'Barber') return;
            const assignment = dayAssignments.get(member.userId);
            const isOff = assignment ? assignment.isOff : false;
            const isOnline = assignment?.isOnlineBookingEnabled;
            if (!isOff && isOnline) {
                count += 1;
            }
        });
        return count;
    }, [staff, dayAssignments]);

    const isQuotaFull = onlineBookingCount >= 3;

    // Handle online booking toggle
    const handleToggleOnlineBooking = (member: StaffScheduleMember, currentAssignment?: StaffScheduleAssignment) => {
        if (member.role !== 'Barber') return;

        const isCurrentlyOff = currentAssignment ? currentAssignment.isOff : false;
        if (isCurrentlyOff) {
            showToast(`${member.name} is off duty on this day. Set on-duty hours first.`);
            return;
        }

        const currentlyEnabled = Boolean(currentAssignment?.isOnlineBookingEnabled);

        if (!currentlyEnabled && isQuotaFull) {
            showToast('Maximum of 3 barbers can accept online bookings for this day.');
            return;
        }

        const nextEnabled = !currentlyEnabled;
        onUpdateAssignment(member.userId, selectedDateIso, {
            isOnlineBookingEnabled: nextEnabled,
        });

        if (nextEnabled) {
            showToast(`${member.name} enabled for online booking (${onlineBookingCount + 1}/3 allocated).`);
        } else {
            showToast(`${member.name} removed from online booking.`);
        }
    };

    // Handle shift timing change
    const handleSetShift = (
        member: StaffScheduleMember,
        startTime: string,
        endTime: string,
        isOff: boolean
    ) => {
        const currentAssignment = dayAssignments.get(member.userId);
        let nextOnline = currentAssignment?.isOnlineBookingEnabled;

        // If turning off duty, automatically turn off online booking
        if (isOff) {
            nextOnline = false;
        }

        onUpdateAssignment(member.userId, selectedDateIso, {
            startTime: isOff ? null : startTime,
            endTime: isOff ? null : endTime,
            isOff,
            isOnlineBookingEnabled: nextOnline,
        });
    };

    return (
        <motion.div
            variants={prefersReducedMotion ? reducedMotionVariants : viewTransitionVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="w-full flex flex-col gap-2.5 sm:gap-3.5"
        >
            {/* Date Stepper Header & Operational Controls */}
            <div className="shrink-0 flex flex-col gap-2.5 bg-charcoal-light border border-white/10 rounded-sm p-2.5 sm:p-3.5 shadow-lg">
                {/* Tier 1: Navigation & Date Stepper */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-gold shrink-0" />
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-gold leading-none">
                                Daily Roster Schedule
                            </p>
                            <p className="text-xs font-semibold text-ivory-dim leading-tight mt-0.5">
                                Day-by-day shift allocation & barber online slots
                            </p>
                        </div>
                    </div>

                    {/* Unified Inline Date Display & Step Controls with Large Accessible Tap Targets */}
                    <div className="inline-flex items-center bg-charcoal border border-white/10 rounded-sm min-h-[40px] px-1 shrink-0">
                        <button
                            type="button"
                            onClick={() => stepDate(-1)}
                            className="min-h-[38px] min-w-[38px] sm:min-h-[36px] sm:min-w-[36px] rounded hover:bg-white/10 active:bg-gold/20 active:scale-95 text-ivory-dim hover:text-gold active:text-gold flex items-center justify-center transition-all cursor-pointer shrink-0"
                            aria-label="Previous day"
                        >
                            <ChevronLeft className="w-5 h-5 shrink-0" />
                        </button>

                        <div className="px-2.5 sm:px-3 flex items-center gap-2 shrink-0">
                            <span className="text-sm sm:text-base font-bold text-ivory tracking-tight whitespace-nowrap">
                                {formattedDate}
                            </span>
                            <span className="text-xs font-semibold uppercase tracking-wider text-ivory-dim/70 border-l border-white/10 pl-2 whitespace-nowrap">
                                {dayName}
                            </span>
                            {isToday && (
                                <span className="px-1.5 py-0.5 rounded-full bg-gold/20 text-gold text-[9px] font-black uppercase tracking-wider border border-gold/40 whitespace-nowrap">
                                    Today
                                </span>
                            )}
                        </div>

                        <button
                            type="button"
                            onClick={() => stepDate(1)}
                            className="min-h-[38px] min-w-[38px] sm:min-h-[36px] sm:min-w-[36px] rounded hover:bg-white/10 active:bg-gold/20 active:scale-95 text-ivory-dim hover:text-gold active:text-gold flex items-center justify-center transition-all cursor-pointer shrink-0"
                            aria-label="Next day"
                        >
                            <ChevronRight className="w-5 h-5 shrink-0" />
                        </button>
                    </div>
                </div>

                {/* Tier 2: Quota Indicator & Symmetrical Action Controls */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-2 border-t border-white/5">
                    {/* Live Quota Counter Pill (Responsive wrapping & text) */}
                    <div
                        className={`min-h-[38px] flex items-center justify-between sm:justify-start gap-2 px-3 py-1.5 rounded-full text-xs font-semibold tracking-tight border transition-all ${
                            isQuotaFull
                                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                                : onlineBookingCount > 0
                                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                                : 'bg-charcoal border-white/15 text-ivory-dim'
                        }`}
                        title={
                            isQuotaFull
                                ? 'Quota reached: exactly 3 barbers allocated for online booking'
                                : `${onlineBookingCount} of 3 online booking slots allocated`
                        }
                    >
                        <div className="flex items-center gap-1.5 min-w-0">
                            <Globe className="w-3.5 h-3.5 text-gold shrink-0" />
                            <span className="truncate">
                                <span className="sm:hidden font-bold">{onlineBookingCount}/3 Online Slots</span>
                                <span className="hidden sm:inline font-medium">
                                    {onlineBookingCount} of 3 barbers assigned for customer booking
                                </span>
                            </span>
                        </div>
                        {isQuotaFull && (
                            <span className="shrink-0 text-[10px] uppercase font-bold bg-emerald-500/25 text-emerald-200 px-2 py-0.5 rounded-full border border-emerald-500/30 whitespace-nowrap">
                                Quota Full
                            </span>
                        )}
                    </div>

                    {/* Symmetrical Action Buttons (Balanced grid on mobile, inline flex on desktop) */}
                    <div className={`shrink-0 w-full sm:w-auto ${onApplyPatternToDay ? 'grid grid-cols-2 gap-2' : 'flex'}`}>
                        {onApplyPatternToDay && (
                            <button
                                type="button"
                                onClick={() => onApplyPatternToDay(selectedDateIso)}
                                className="min-h-[40px] px-3.5 rounded border border-white/15 bg-charcoal text-xs font-semibold text-ivory-dim hover:text-gold hover:border-gold/40 transition-colors cursor-pointer inline-flex items-center justify-center gap-1.5"
                                title="Reset this day's roster to default weekday pattern"
                            >
                                <Sparkles className="w-3.5 h-3.5 text-gold/80 shrink-0" />
                                <span className="whitespace-nowrap">Apply Pattern</span>
                            </button>
                        )}

                        <Button
                            variant="primary"
                            onClick={() => void onSave()}
                            disabled={isSaving || staff.length === 0}
                            className="min-h-[40px] px-4 rounded bg-gold text-charcoal font-bold text-xs shadow-[0_0_15px_rgba(212,175,55,0.3)] hover:shadow-[0_0_20px_rgba(212,175,55,0.5)] cursor-pointer inline-flex items-center justify-center gap-1.5"
                        >
                            <Save className="h-4 w-4 shrink-0" />
                            <span className="whitespace-nowrap">{isSaving ? 'Saving...' : 'Save Changes'}</span>
                        </Button>
                    </div>
                </div>
            </div>

            {/* Quota Policy Note (Streamlined low-profile callout) */}
            <div className="shrink-0 flex items-center gap-2 px-2.5 py-1.5 rounded-sm bg-charcoal/80 border border-white/5 text-[11px] sm:text-xs text-ivory-dim">
                <Info className="w-3.5 h-3.5 text-gold shrink-0" />
                <p className="truncate sm:whitespace-normal">
                    <strong className="text-ivory font-semibold">Max 3 Online:</strong> Up to 3 barbers can be designated for customer online booking per day.
                </p>
            </div>

            {/* Staff Cards Grid */}
            <div className="w-full">
                {staff.length === 0 ? (
                    <div className="rounded-sm border border-white/10 bg-charcoal p-12 text-center text-sm text-ivory-dim">
                        No barber or cashier accounts found in this shop branch.
                    </div>
                ) : (
                    <motion.div
                        variants={prefersReducedMotion ? undefined : cardContainerVariants}
                        initial="initial"
                        animate="animate"
                        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4"
                    >
                        {staff.map((member) => {
                            const assignment = dayAssignments.get(member.userId);
                            const isOff = assignment ? assignment.isOff : false;
                            const isBarber = member.role === 'Barber';
                            const isOnline = Boolean(assignment?.isOnlineBookingEnabled && !isOff);
                            const startTime = assignment?.startTime || '09:00';
                            const endTime = assignment?.endTime || '21:00';
                            const isCustomOpen = customEditUserId === member.userId;

                            // Determine if this barber's online toggle should be disabled
                            const isOnlineToggleDisabled = !isBarber || isOff || (!isOnline && isQuotaFull);

                            return (
                                <motion.div
                                    key={member.userId}
                                    variants={prefersReducedMotion ? undefined : cardItemVariants}
                                    className={`relative flex flex-col justify-between rounded-sm border transition-all duration-200 p-3 sm:p-4 ${
                                        isOff
                                            ? 'bg-charcoal/60 border-white/5 opacity-75'
                                            : isOnline
                                            ? 'bg-charcoal-light border-gold/40 shadow-[0_0_16px_rgba(212,175,55,0.1)]'
                                            : 'bg-charcoal-light border-white/10'
                                    }`}
                                >
                                    {/* Card Header: Avatar, Name, Role & Status */}
                                    <div>
                                        <div className="flex items-start justify-between gap-2.5 mb-2.5 sm:mb-3">
                                            <div className="flex items-center gap-2.5 sm:gap-3">
                                                <div
                                                    className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-bold text-xs border shrink-0 overflow-hidden relative ${
                                                        isBarber
                                                            ? isOnline
                                                            ? 'bg-gold/20 text-gold border-gold/70 shadow-[0_0_8px_rgba(212,175,55,0.3)]'
                                                            : 'bg-charcoal text-ivory border-gold/30'
                                                        : 'bg-sky-500/15 text-sky-300 border-sky-500/40'
                                                    }`}
                                                >
                                                    <span className="select-none">{getInitials(member.name)}</span>
                                                    {(member.profile_picture || assignment?.profile_picture) && (
                                                        <img
                                                            src={(member.profile_picture || assignment?.profile_picture)!}
                                                            alt={member.name}
                                                            className="absolute inset-0 w-full h-full object-cover"
                                                            onError={(e) => {
                                                                (e.currentTarget as HTMLElement).style.display = 'none';
                                                            }}
                                                        />
                                                    )}
                                                    <span
                                                        className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border border-charcoal ${
                                                            isOff
                                                                ? 'bg-zinc-500'
                                                                : isOnline
                                                                ? 'bg-gold'
                                                                : 'bg-emerald-500'
                                                        }`}
                                                        title={isOff ? 'Off Duty' : isOnline ? 'Online Queue Active' : 'On Duty'}
                                                    />
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-sm text-ivory leading-snug">
                                                        {member.name}
                                                    </h4>
                                                    <span
                                                        className={`inline-block text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                                                            isBarber
                                                                ? 'bg-gold/10 text-gold border-gold/30'
                                                                : 'bg-sky-500/10 text-sky-300 border-sky-500/30'
                                                        }`}
                                                    >
                                                        {member.role}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Duty Status Badge */}
                                            <button
                                                type="button"
                                                onClick={() => handleSetShift(member, startTime, endTime, !isOff)}
                                                className={`min-h-[26px] sm:min-h-[28px] px-2 sm:px-2.5 rounded text-[10px] font-bold uppercase tracking-wider border cursor-pointer transition-colors ${
                                                    isOff
                                                        ? 'bg-zinc-800/80 text-zinc-400 border-zinc-700 hover:border-zinc-500'
                                                        : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/25'
                                                }`}
                                                title={isOff ? 'Click to set On Duty' : 'Click to set Off Duty'}
                                            >
                                                {isOff ? 'Off Duty' : 'On Duty'}
                                            </button>
                                        </div>

                                        {/* Shift Timing Presets */}
                                        <div className="space-y-1.5 sm:space-y-2 pt-1.5 sm:pt-2 border-t border-white/5">
                                            <div className="flex items-center justify-between text-[11px]">
                                                <span className="text-ivory-dim font-medium flex items-center gap-1">
                                                    <Clock className="w-3.5 h-3.5 text-gold" />
                                                    <span>Shift Hours:</span>
                                                </span>
                                                <span className="text-ivory font-semibold">
                                                    {isOff ? 'Off Duty' : `${formatTime12h(startTime)} - ${formatTime12h(endTime)}`}
                                                </span>
                                            </div>

                                            {/* Preset Chips */}
                                            <div className="grid grid-cols-4 gap-1">
                                                {PRESET_SHIFTS.map((preset) => {
                                                    const isSelected =
                                                        !isOff &&
                                                        startTime === preset.startTime &&
                                                        endTime === preset.endTime;
                                                    return (
                                                        <button
                                                            key={preset.label}
                                                            type="button"
                                                            onClick={() => {
                                                                handleSetShift(member, preset.startTime, preset.endTime, false);
                                                                setCustomEditUserId(null);
                                                            }}
                                                            className={`min-h-[28px] sm:min-h-[30px] rounded text-[10px] font-semibold tracking-tight border transition-colors cursor-pointer ${
                                                                isSelected
                                                                    ? 'bg-gold text-charcoal border-gold font-bold shadow-[0_0_8px_rgba(212,175,55,0.3)]'
                                                                    : 'bg-charcoal text-ivory-dim border-white/10 hover:border-gold/40 hover:text-ivory'
                                                            }`}
                                                            title={preset.desc}
                                                        >
                                                            {preset.label}
                                                        </button>
                                                    );
                                                })}

                                                {/* Custom Timing Toggle */}
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (isOff) handleSetShift(member, '09:00', '21:00', false);
                                                        setCustomEditUserId(isCustomOpen ? null : member.userId);
                                                    }}
                                                    className={`min-h-[28px] sm:min-h-[30px] rounded text-[10px] font-semibold tracking-tight border transition-colors cursor-pointer ${
                                                        isCustomOpen
                                                            ? 'bg-gold/20 text-gold border-gold/50'
                                                            : 'bg-charcoal text-ivory-dim border-white/10 hover:border-gold/40 hover:text-ivory'
                                                    }`}
                                                >
                                                    Custom
                                                </button>
                                            </div>

                                            {/* Collapsible Custom Time Inputs */}
                                            {isCustomOpen && !isOff && (
                                                <div className="p-2.5 rounded bg-charcoal border border-white/10 space-y-2 mt-2">
                                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                                        <div>
                                                            <label className="block text-[10px] uppercase font-semibold text-ivory-dim mb-1">
                                                                Start Time
                                                            </label>
                                                            <input
                                                                type="time"
                                                                value={startTime}
                                                                onChange={(e) =>
                                                                    handleSetShift(member, e.target.value, endTime, false)
                                                                }
                                                                className="w-full bg-charcoal-light border border-white/10 rounded px-2 py-1 text-xs text-ivory focus:border-gold focus:outline-none"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-[10px] uppercase font-semibold text-ivory-dim mb-1">
                                                                End Time
                                                            </label>
                                                            <input
                                                                type="time"
                                                                value={endTime}
                                                                onChange={(e) =>
                                                                    handleSetShift(member, startTime, e.target.value, false)
                                                                }
                                                                className="w-full bg-charcoal-light border border-white/10 rounded px-2 py-1 text-xs text-ivory focus:border-gold focus:outline-none"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Card Footer: Online Booking Allocation Toggle */}
                                    <div className="mt-2.5 sm:mt-3 pt-2 sm:pt-2.5 border-t border-white/5">
                                        {isBarber ? (
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <p className="text-xs font-bold text-ivory flex items-center gap-1.5">
                                                        <Globe
                                                            className={`w-3.5 h-3.5 ${
                                                                isOnline ? 'text-gold' : 'text-ivory-dim/60'
                                                            }`}
                                                        />
                                                        <span>Enable Online Booking</span>
                                                    </p>
                                                    <p className="text-[10px] text-ivory-dim/70">
                                                        {isOff
                                                            ? 'Barber is off duty'
                                                            : isOnline
                                                            ? 'Visible in customer online booking'
                                                            : isQuotaFull
                                                            ? 'Max 3 booking slots filled'
                                                            : 'Walk-ins only (hidden from web)'}
                                                    </p>
                                                </div>

                                                {/* Toggle Switch */}
                                                <button
                                                    type="button"
                                                    role="switch"
                                                    aria-checked={isOnline}
                                                    disabled={isOnlineToggleDisabled}
                                                    onClick={() => handleToggleOnlineBooking(member, assignment)}
                                                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${
                                                        isOnline
                                                            ? 'bg-gold border-gold/80 shadow-[0_0_10px_rgba(212,175,55,0.4)]'
                                                            : 'bg-zinc-800 border-zinc-700'
                                                    }`}
                                                    title={
                                                        isOff
                                                            ? 'Barber is off duty on this day.'
                                                            : !isOnline && isQuotaFull
                                                            ? 'Maximum of 3 barbers can accept online bookings for this day.'
                                                            : isOnline
                                                            ? 'Click to disable online booking for this barber'
                                                            : 'Click to enable online booking'
                                                    }
                                                >
                                                    <motion.span
                                                        layout
                                                        transition={springTransition}
                                                        className={`inline-block h-4 w-4 rounded-full bg-white shadow-md transform ${
                                                            isOnline ? 'translate-x-6' : 'translate-x-1'
                                                        }`}
                                                    />
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2 text-[11px] text-ivory-dim/60 bg-charcoal px-2.5 py-1.5 rounded border border-white/5">
                                                <Shield className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                                                <span>Operational Role • In-store POS cashier only</span>
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            );
                        })}
                    </motion.div>
                )}
            </div>
        </motion.div>
    );
};

export default DailyShiftManagement;
