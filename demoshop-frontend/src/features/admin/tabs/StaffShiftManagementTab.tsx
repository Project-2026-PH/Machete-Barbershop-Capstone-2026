import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
    Calendar as CalendarIcon,
    CalendarDays,
    RefreshCw,
    RotateCw,
    Sparkles,
    Users,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { StaffScheduleCalendar } from '@/features/admin/components/shifts/StaffScheduleCalendar';
import { DailyShiftManagement } from '@/features/admin/components/shifts/DailyShiftManagement';
import { RotationScheduleEngine } from '@/features/admin/components/shifts/RotationScheduleEngine';
import {
    staffScheduleService,
    type StaffScheduleAssignment,
    type StaffScheduleMember,
} from '@/features/admin/services/staff-schedule.service';
import { ManagementSubHeaderNav } from '@/features/admin/components/Management/ManagementSubHeaderNav';
import {
    springTransition,
    viewTransitionVariants,
    reducedMotionVariants,
} from '@/features/admin/components/shifts/shift-animations';
import { api } from '@/config/api';

export type ShiftSubView = 'calendar' | 'shifts';
export type ShiftManagementMode = 'daily' | 'rotation';

interface StaffShiftManagementTabProps {
    initialView?: ShiftSubView | 'roster';
    onNavigateSubTab?: (subTab: string) => void;
}

const pad = (value: number) => String(value).padStart(2, '0');
const toIsoDate = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;
const weekdayIndex = (isoDate: string) => {
    const [year, month, day] = isoDate.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
};

const defaultSlot = (weekday: number) => ({
    startTime: '09:00',
    endTime: weekday === 0 ? '20:00' : (weekday === 6 ? '22:00' : '21:00'),
    isOff: false,
    isOnlineBookingEnabled: false,
});

export const StaffShiftManagementTab: React.FC<StaffShiftManagementTabProps> = ({
    initialView,
    onNavigateSubTab,
}) => {
    const prefersReducedMotion = useReducedMotion();
    const [searchParams, setSearchParams] = useSearchParams();

    // Parse shiftView from URL search param with fallback
    const [shiftView, setShiftView] = useState<ShiftSubView>(() => {
        const queryView = searchParams.get('shiftView');
        if (queryView === 'calendar' || queryView === 'shifts') {
            return queryView;
        }
        if (queryView === 'roster') return 'shifts';
        if (initialView === 'roster') return 'shifts';
        if (initialView && (initialView === 'calendar' || initialView === 'shifts')) {
            return initialView;
        }
        try {
            const stored = localStorage.getItem('demoshop_shift_management_view');
            if (stored === 'calendar' || stored === 'shifts') {
                return stored as ShiftSubView;
            }
            if (stored === 'roster') return 'shifts';
        } catch {}
        return 'calendar';
    });

    // Sub-mode for Shift Management tab: 'daily' vs 'rotation'
    const [shiftMode, setShiftMode] = useState<ShiftManagementMode>('daily');

    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [selectedDateIso, setSelectedDateIso] = useState<string>(() => {
        return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    });

    const [staff, setStaff] = useState<StaffScheduleMember[]>([]);
    const [assignments, setAssignments] = useState<StaffScheduleAssignment[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isComplete, setIsComplete] = useState(false);
    const [autoFilledMonths, setAutoFilledMonths] = useState<number[]>([]);
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    // Sync shiftView with URL parameters
    useEffect(() => {
        const queryView = searchParams.get('shiftView');
        if (queryView === 'calendar' || queryView === 'shifts') {
            setShiftView(queryView);
        } else if (queryView === 'roster') {
            setShiftView('shifts');
        }
    }, [searchParams]);

    const handleViewChange = (view: ShiftSubView) => {
        setShiftView(view);
        try {
            localStorage.setItem('demoshop_shift_management_view', view);
        } catch {}
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set('shiftView', view);
            return next;
        });
    };

    const showToast = (message: string) => {
        setToastMessage(message);
        window.setTimeout(() => setToastMessage(null), 4000);
    };

    const daysInMonth = useMemo(() => new Date(year, month, 0).getDate(), [year, month]);

    const shiftMonth = (delta: number) => {
        const cursor = new Date(Date.UTC(year, month - 1 + delta, 1));
        const nextYear = cursor.getUTCFullYear();
        const nextMonth = cursor.getUTCMonth() + 1;
        setYear(nextYear);
        setMonth(nextMonth);
    };

    const handleGoToToday = () => {
        const today = new Date();
        setYear(today.getFullYear());
        setMonth(today.getMonth() + 1);
        setSelectedDateIso(`${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`);
    };

    const loadRoster = useCallback(async () => {
        setIsLoading(true);
        try {
            const roster = await staffScheduleService.getMonthRoster(year, month);
            setStaff(roster.staff);
            setIsComplete(roster.isComplete);
            setAutoFilledMonths(roster.autoFilledMonths || []);

            // Build full month map of assignments, synthesizing missing slots from defaults
            const existingMap = new Map<string, StaffScheduleAssignment>();
            roster.assignments.forEach((a) => {
                existingMap.set(`${a.userId}|${a.shiftDate}`, a);
            });

            const synthesizedAssignments: StaffScheduleAssignment[] = [];
            roster.staff.forEach((member) => {
                for (let day = 1; day <= daysInMonth; day++) {
                    const shiftDate = toIsoDate(year, month, day);
                    const key = `${member.userId}|${shiftDate}`;
                    const existing = existingMap.get(key);

                    if (existing) {
                        synthesizedAssignments.push(existing);
                    } else {
                        const fallback = defaultSlot(weekdayIndex(shiftDate));
                        synthesizedAssignments.push({
                            userId: member.userId,
                            staffName: member.name,
                            role: member.role,
                            shiftDate,
                            startTime: fallback.isOff ? null : fallback.startTime,
                            endTime: fallback.isOff ? null : fallback.endTime,
                            isOff: fallback.isOff,
                            isOnlineBookingEnabled: false,
                        });
                    }
                }
            });

            setAssignments(synthesizedAssignments);
        } catch (err) {
            console.error('Failed to load staff shift roster:', err);
            showToast('Staff shift roster could not be loaded.');
        } finally {
            setIsLoading(false);
        }
    }, [year, month, daysInMonth]);

    useEffect(() => {
        if (shiftView === 'calendar' || shiftView === 'shifts') {
            void loadRoster();
        }
    }, [loadRoster, shiftView]);

    // Handle date selection from Calendar Overview -> Transition to Daily Shift Management
    const handleSelectDateFromCalendar = (dateIso: string) => {
        const [y, m] = dateIso.split('-').map(Number);
        if (y !== year || m !== month) {
            setYear(y);
            setMonth(m);
        }
        setSelectedDateIso(dateIso);
        setShiftMode('daily');
        handleViewChange('shifts');
    };

    // Handle date change from Daily Shift Management stepper
    const handleDateChangeFromStepper = (newDateIso: string) => {
        const [y, m] = newDateIso.split('-').map(Number);
        if (y !== year || m !== month) {
            setYear(y);
            setMonth(m);
        }
        setSelectedDateIso(newDateIso);
    };

    // Update single assignment in memory
    const handleUpdateAssignment = (
        userId: string,
        shiftDate: string,
        patch: Partial<StaffScheduleAssignment>
    ) => {
        setAssignments((current) => {
            const index = current.findIndex(
                (a) => a.userId === userId && a.shiftDate === shiftDate
            );
            if (index === -1) {
                const member = staff.find((s) => s.userId === userId);
                const fallback = defaultSlot(weekdayIndex(shiftDate));
                const newAssignment: StaffScheduleAssignment = {
                    userId,
                    staffName: member?.name,
                    role: member?.role || 'Barber',
                    shiftDate,
                    startTime: fallback.isOff ? null : fallback.startTime,
                    endTime: fallback.isOff ? null : fallback.endTime,
                    isOff: fallback.isOff,
                    isOnlineBookingEnabled: false,
                    ...patch,
                };
                return [...current, newAssignment];
            }

            const updated = [...current];
            updated[index] = {
                ...updated[index],
                ...patch,
            };
            return updated;
        });
    };

    // Reset day's roster to default weekday pattern
    const handleApplyPatternToDay = (dateIso: string) => {
        const weekday = weekdayIndex(dateIso);
        const slot = defaultSlot(weekday);
        setAssignments((current) => {
            return current.map((a) => {
                if (a.shiftDate !== dateIso) return a;
                return {
                    ...a,
                    startTime: slot.isOff ? null : slot.startTime,
                    endTime: slot.isOff ? null : slot.endTime,
                    isOff: slot.isOff,
                    isOnlineBookingEnabled: false,
                };
            });
        });
        showToast(`Default ${slot.isOff ? 'off duty' : 'working'} pattern applied to this date. Save to publish.`);
    };

    // Save full-month roster to backend
    const handleSaveRoster = async () => {
        setIsSaving(true);
        try {
            // Filter assignments belonging to the active month
            const monthAssignments = assignments.filter((a) => {
                const [y, m] = a.shiftDate.split('-').map(Number);
                return y === year && m === month;
            });

            const result = await staffScheduleService.saveMonthRoster(year, month, monthAssignments);
            setIsComplete(result.isComplete);
            setAutoFilledMonths(result.autoFilledMonths || []);

            if (result.autoFilledMonths && result.autoFilledMonths.length > 0) {
                showToast(`Roster saved. Copied weekday pattern to ${result.autoFilledMonths.length} remaining month(s).`);
            } else if (result.isComplete) {
                showToast('Full-month roster saved for every staff member.');
            } else {
                showToast('Roster changes saved successfully.');
            }
            await loadRoster();
        } catch (err: any) {
            console.error('Failed to save staff shift roster:', err);
            showToast(err?.response?.data?.error || err?.message || 'Roster could not be saved.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="w-full flex-1 flex flex-col gap-3 sm:gap-4 pt-4 pb-28 sm:pb-32 lg:pb-12 touch-pan-y">
            {/* Global Toast Notification */}
            {toastMessage && (
                <div className="fixed top-4 right-4 z-[100] flex items-center gap-3 rounded-sm border border-gold bg-charcoal-light px-5 py-3 text-gold shadow-2xl">
                    <Sparkles className="h-5 w-5 shrink-0" />
                    <span className="text-sm font-semibold">{toastMessage}</span>
                </div>
            )}

            {/* Header (Consistent with Reports & Audits) */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-3 shrink-0">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold">Owner/Admin • Shift Scheduling</p>
                    <h2 className="mt-0.5 sm:mt-1 text-xl sm:text-2xl font-bold text-ivory">Staff Shift Management</h2>
                    <p className="text-ivory-dim text-xs mt-0.5 hidden sm:block">
                        Configure barber shift rosters and manage online booking caps.
                    </p>
                </div>
                <div className="hidden sm:flex items-center gap-2">
                    <Button
                        variant="outline"
                        onClick={() => void loadRoster()}
                        disabled={isLoading || isSaving}
                        className="text-xs h-[34px] px-2.5"
                        title="Reload schedule data"
                    >
                        <RefreshCw
                            className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin text-gold' : ''}`}
                        />
                        <span className="ml-1.5">Reload</span>
                    </Button>
                </div>
            </div>

            {/* Sub-Header Segmented Bar (Consistent across Management Module) */}
            <div className="shrink-0 lg:hidden">
                <ManagementSubHeaderNav
                    activeSub="shifts"
                    onSelect={onNavigateSubTab}
                />
            </div>

            {/* Sub-Navigation Toggle Bar (Responsive Horizontal Scroll on Mobile) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 pb-1 border-b border-white/5">
                <div className="w-full sm:w-auto overflow-x-auto no-scrollbar py-0.5">
                    <div className="inline-flex bg-charcoal border border-white/10 p-1 rounded-sm sm:rounded-full min-w-max gap-1">
                        {/* 1. Staff Schedule Calendar (Primary / Default) */}
                        <button
                            type="button"
                            onClick={() => handleViewChange('calendar')}
                            aria-pressed={shiftView === 'calendar'}
                            className="relative min-h-[38px] px-3.5 sm:px-5 py-1.5 rounded-xs sm:rounded-full text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-2 shrink-0"
                        >
                            {shiftView === 'calendar' && (
                                <motion.div
                                    layoutId="activeShiftSubTab"
                                    transition={prefersReducedMotion ? { duration: 0 } : springTransition}
                                    className="absolute inset-0 rounded-xs sm:rounded-full bg-gold shadow-[0_0_12px_rgba(212,175,55,0.35)]"
                                />
                            )}
                            <CalendarDays
                                className={`w-4 h-4 relative z-10 ${
                                    shiftView === 'calendar' ? 'text-charcoal' : 'text-ivory-dim'
                                }`}
                            />
                            <span
                                className={`relative z-10 ${
                                    shiftView === 'calendar'
                                        ? 'text-charcoal font-black'
                                        : 'text-ivory-dim hover:text-ivory'
                                }`}
                            >
                                Calendar
                            </span>
                            <span
                                className={`relative z-10 hidden sm:inline ${
                                    shiftView === 'calendar'
                                        ? 'text-charcoal font-black'
                                        : 'text-ivory-dim hover:text-ivory'
                                }`}
                            >
                                Overview
                            </span>
                        </button>

                        {/* 2. Staff Shift Management (Daily Roster & Online Booking) */}
                        <button
                            type="button"
                            onClick={() => handleViewChange('shifts')}
                            aria-pressed={shiftView === 'shifts'}
                            className="relative min-h-[38px] px-3.5 sm:px-5 py-1.5 rounded-xs sm:rounded-full text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-2 shrink-0"
                        >
                            {shiftView === 'shifts' && (
                                <motion.div
                                    layoutId="activeShiftSubTab"
                                    transition={prefersReducedMotion ? { duration: 0 } : springTransition}
                                    className="absolute inset-0 rounded-xs sm:rounded-full bg-gold shadow-[0_0_12px_rgba(212,175,55,0.35)]"
                                />
                            )}
                            <Users
                                className={`w-4 h-4 relative z-10 ${
                                    shiftView === 'shifts' ? 'text-charcoal' : 'text-ivory-dim'
                                }`}
                            />
                            <span
                                className={`relative z-10 ${
                                    shiftView === 'shifts'
                                        ? 'text-charcoal font-black'
                                        : 'text-ivory-dim hover:text-ivory'
                                }`}
                            >
                                Shift Management
                            </span>
                        </button>
                    </div>
                </div>

                {/* Right Context Label */}
                <div className="flex items-center gap-3">
                    <span className="text-[11px] font-mono text-ivory-dim/60 hidden md:inline">
                        {shiftView === 'calendar'
                            ? 'Overview • Scheduled Roster & Quotas'
                            : shiftMode === 'daily'
                            ? 'Daily Roster • Online Booking Allocation (Max 3)'
                            : 'Rotation Engine • Weekly Patterns & Range Scheduling'}
                    </span>
                </div>
            </div>

            {/* Sub-view Content Area */}
            <div className="w-full flex-1 flex flex-col mt-2 sm:mt-3">
                <AnimatePresence mode="wait">
                    {shiftView === 'calendar' ? (
                        <motion.div
                            key="calendar-view"
                            variants={prefersReducedMotion ? reducedMotionVariants : viewTransitionVariants}
                            initial="initial"
                            animate="animate"
                            exit="exit"
                            className="w-full flex-1 flex flex-col"
                        >
                            <StaffScheduleCalendar
                                year={year}
                                month={month}
                                staff={staff}
                                assignments={assignments}
                                isComplete={isComplete}
                                autoFilledMonths={autoFilledMonths}
                                onMonthChange={shiftMonth}
                                onGoToToday={handleGoToToday}
                                onSelectDate={handleSelectDateFromCalendar}
                            />
                        </motion.div>
                    ) : (
                        <motion.div
                            key="shifts-view"
                            variants={prefersReducedMotion ? reducedMotionVariants : viewTransitionVariants}
                            initial="initial"
                            animate="animate"
                            exit="exit"
                            className="w-full flex flex-col gap-2.5 sm:gap-3"
                        >
                            {/* Mode Toggle: Daily Roster vs Rotation Engine (Full-width 50/50 split) */}
                            <div className="shrink-0 w-full pb-1 border-b border-white/5">
                                <div className="w-full grid grid-cols-2 bg-charcoal border border-white/10 p-1 rounded-sm gap-1">
                                    <button
                                        type="button"
                                        onClick={() => setShiftMode('daily')}
                                        aria-pressed={shiftMode === 'daily'}
                                        className="relative w-full min-h-[38px] px-3 py-1.5 rounded-xs text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-2"
                                    >
                                        {shiftMode === 'daily' && (
                                            <motion.div
                                                layoutId="shiftModeTab"
                                                transition={prefersReducedMotion ? { duration: 0 } : springTransition}
                                                className="absolute inset-0 rounded-xs bg-gold shadow-[0_0_10px_rgba(212,175,55,0.35)]"
                                            />
                                        )}
                                        <CalendarIcon
                                            className={`w-3.5 h-3.5 relative z-10 shrink-0 ${
                                                shiftMode === 'daily' ? 'text-charcoal' : 'text-ivory-dim'
                                            }`}
                                        />
                                        <span
                                            className={`relative z-10 whitespace-nowrap ${
                                                shiftMode === 'daily'
                                                    ? 'text-charcoal font-black'
                                                    : 'text-ivory-dim hover:text-ivory'
                                            }`}
                                        >
                                            Daily Roster
                                        </span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setShiftMode('rotation')}
                                        aria-pressed={shiftMode === 'rotation'}
                                        className="relative w-full min-h-[38px] px-3 py-1.5 rounded-xs text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-2"
                                    >
                                        {shiftMode === 'rotation' && (
                                            <motion.div
                                                layoutId="shiftModeTab"
                                                transition={prefersReducedMotion ? { duration: 0 } : springTransition}
                                                className="absolute inset-0 rounded-xs bg-gold shadow-[0_0_10px_rgba(212,175,55,0.35)]"
                                            />
                                        )}
                                        <RotateCw
                                            className={`w-3.5 h-3.5 relative z-10 shrink-0 ${
                                                shiftMode === 'rotation' ? 'text-charcoal' : 'text-ivory-dim'
                                            }`}
                                        />
                                        <span
                                            className={`relative z-10 whitespace-nowrap ${
                                                shiftMode === 'rotation'
                                                    ? 'text-charcoal font-black'
                                                    : 'text-ivory-dim hover:text-ivory'
                                            }`}
                                        >
                                            <span className="sm:hidden">Rotation</span>
                                            <span className="hidden sm:inline">Rotation Schedules</span>
                                        </span>
                                    </button>
                                </div>
                            </div>

                            {/* Mode Content Area */}
                            <div className="w-full flex flex-col">
                                <AnimatePresence mode="wait">
                                    {shiftMode === 'daily' ? (
                                        <motion.div
                                            key="daily-mode"
                                            variants={prefersReducedMotion ? reducedMotionVariants : viewTransitionVariants}
                                            initial="initial"
                                            animate="animate"
                                            exit="exit"
                                            className="w-full flex flex-col"
                                        >
                                            <DailyShiftManagement
                                                selectedDateIso={selectedDateIso}
                                                onDateChange={handleDateChangeFromStepper}
                                                onBackToCalendar={() => handleViewChange('calendar')}
                                                staff={staff}
                                                assignments={assignments}
                                                onUpdateAssignment={handleUpdateAssignment}
                                                onSave={handleSaveRoster}
                                                isSaving={isSaving}
                                                onApplyPatternToDay={handleApplyPatternToDay}
                                                showToast={showToast}
                                            />
                                        </motion.div>
                                    ) : (
                                        <motion.div
                                            key="rotation-mode"
                                            variants={prefersReducedMotion ? reducedMotionVariants : viewTransitionVariants}
                                            initial="initial"
                                            animate="animate"
                                            exit="exit"
                                            className="w-full flex flex-col"
                                        >
                                            <RotationScheduleEngine
                                                staff={staff}
                                                onApplySuccess={() => void loadRoster()}
                                                showToast={showToast}
                                            />
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default StaffShiftManagementTab;
