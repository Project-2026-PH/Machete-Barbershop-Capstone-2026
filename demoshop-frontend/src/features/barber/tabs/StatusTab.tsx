import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
    Calendar, 
    Clock, 
    UserCheck, 
    Sun, 
    Info 
} from 'lucide-react';
import { barberService, BarberPublishedShift } from '../services/barber.service';
import { supabase } from '@/config/supabaseClient';

type WeekDaySchedule = {
    day: string;
    short: string;
    openHour: number;
    closeHour: number;
    hours: string;
    active: boolean;
};

const FALLBACK_SCHEDULE: WeekDaySchedule[] = [
    { day: 'Monday', short: 'MON', openHour: 9, closeHour: 21, hours: '9:00 AM - 9:00 PM', active: true },
    { day: 'Tuesday', short: 'TUE', openHour: 9, closeHour: 21, hours: '9:00 AM - 9:00 PM', active: true },
    { day: 'Wednesday', short: 'WED', openHour: 9, closeHour: 21, hours: '9:00 AM - 9:00 PM', active: true },
    { day: 'Thursday', short: 'THU', openHour: 9, closeHour: 21, hours: '9:00 AM - 9:00 PM', active: true },
    { day: 'Friday', short: 'FRI', openHour: 9, closeHour: 21, hours: '9:00 AM - 9:00 PM', active: true },
    { day: 'Saturday', short: 'SAT', openHour: 9, closeHour: 22, hours: '9:00 AM - 10:00 PM', active: true },
    { day: 'Sunday', short: 'SUN', openHour: 0, closeHour: 0, hours: 'Off Duty', active: false },
];

const pad = (value: number) => String(value).padStart(2, '0');
const toIsoDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const formatHourLabel = (time: string) => {
    const [hourText, minuteText] = time.split(':');
    const hour = Number(hourText);
    const minute = Number(minuteText);
    const suffix = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${pad(minute)} ${suffix}`;
};

const toDecimalHour = (time: string) => {
    const [hourText, minuteText] = time.split(':');
    return Number(hourText) + (Number(minuteText) / 60);
};

const currentWeekRange = () => {
    const now = new Date();
    const monday = new Date(now);
    const day = now.getDay();
    monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { from: toIsoDate(monday), to: toIsoDate(sunday), monday };
};

const scheduleFromAssignments = (assignments: BarberPublishedShift[], monday: Date): WeekDaySchedule[] => {
    if (assignments.length === 0) return FALLBACK_SCHEDULE;
    return FALLBACK_SCHEDULE.map((fallback, index) => {
        const date = new Date(monday);
        date.setDate(monday.getDate() + index);
        const iso = toIsoDate(date);
        const assignment = assignments.find((item) => item.shiftDate === iso);
        if (!assignment) return fallback;
        if (assignment.isOff || !assignment.startTime || !assignment.endTime) {
            return { ...fallback, openHour: 0, closeHour: 0, hours: 'Off Duty', active: false };
        }
        return {
            ...fallback,
            openHour: toDecimalHour(assignment.startTime),
            closeHour: toDecimalHour(assignment.endTime),
            hours: `${formatHourLabel(assignment.startTime)} - ${formatHourLabel(assignment.endTime)}`,
            active: true,
        };
    });
};

/**
 * Custom hook for smooth numerical count-up easing animations
 */
function useCountUp(target: number, duration: number = 900, decimals: number = 0, isReady: boolean = true) {
    const [count, setCount] = useState(0);

    useEffect(() => {
        if (!isReady) {
            setCount(0);
            return;
        }

        let startTimestamp: number | null = null;
        let animationFrameId: number;

        const step = (timestamp: number) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            const easeOut = 1 - Math.pow(1 - progress, 3);
            setCount(easeOut * target);

            if (progress < 1) {
                animationFrameId = requestAnimationFrame(step);
            } else {
                setCount(target);
            }
        };

        animationFrameId = requestAnimationFrame(step);
        return () => cancelAnimationFrame(animationFrameId);
    }, [target, duration, decimals, isReady]);

    return count.toFixed(decimals);
}

export const StatusTab: React.FC = () => {
    const [isLoadingSchedule, setIsLoadingSchedule] = useState(true);
    const [animateBars, setAnimateBars] = useState(false);
    const [publishedShifts, setPublishedShifts] = useState<BarberPublishedShift[]>([]);
    const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const schedule = useMemo(() => {
        const { monday } = currentWeekRange();
        return scheduleFromAssignments(publishedShifts, monday);
    }, [publishedShifts]);

    // Detect current day of week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
    const now = new Date();
    const dayIndex = now.getDay();
    // Re-map Sunday (0) to index 6 in Monday-based schedule
    const mondayBasedTodayIndex = dayIndex === 0 ? 6 : dayIndex - 1;
    const todaySchedule = schedule[mondayBasedTodayIndex];

    const fetchSchedule = useCallback(async (silent = false) => {
        if (!silent) setIsLoadingSchedule(true);
        try {
            const { from, to } = currentWeekRange();
            const shifts = await barberService.getMySchedule(from, to).catch(() => []);
            setPublishedShifts(shifts);
        } catch (err) {
            console.error('Failed to load published schedule:', err);
        } finally {
            if (!silent) setIsLoadingSchedule(false);
            setTimeout(() => setAnimateBars(true), 80);
        }
    }, []);

    useEffect(() => {
        fetchSchedule();

        // 1. Immediate re-synchronization when user resumes or switches back to tab
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                fetchSchedule(true);
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        // 2. Supabase Realtime channel subscription for published shift updates from Admin
        const channel = supabase
            .channel('barber-schedule-realtime')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'staff_shift_assignments' },
                () => {
                    if (refreshTimer.current) clearTimeout(refreshTimer.current);
                    refreshTimer.current = setTimeout(() => { fetchSchedule(true); }, 1500);
                }
            )
            .subscribe();

        // 3. Relaxed 60s fallback heartbeat for degraded websocket connection scenarios
        const interval = setInterval(() => {
            if (document.visibilityState === 'visible') {
                fetchSchedule(true);
            }
        }, 60000);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            clearInterval(interval);
            if (refreshTimer.current) clearTimeout(refreshTimer.current);
            void supabase.removeChannel(channel).catch(() => {});
        };
    }, [fetchSchedule]);

    // Determine active shift progress & operational window status
    const currentShiftStatus = useMemo(() => {
        if (!todaySchedule.active) {
            return {
                status: 'Day Off',
                badgeStyle: 'bg-white/10 text-white/40 border-white/15',
                progress: 0,
                description: 'You are off duty today. Enjoy your rest day!',
                isOnDuty: false
            };
        }

        const currentHour = now.getHours() + (now.getMinutes() / 60);
        const start = todaySchedule.openHour;
        const end = todaySchedule.closeHour;

        if (currentHour < start) {
            return {
                status: 'Upcoming Shift',
                badgeStyle: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
                progress: 0,
                description: `Your shift begins today at ${todaySchedule.hours.split(' - ')[0]}.`,
                isOnDuty: false
            };
        } else if (currentHour >= end) {
            return {
                status: 'Shift Ended',
                badgeStyle: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
                progress: 100,
                description: `Your operational shift ended at ${todaySchedule.hours.split(' - ')[1]}. Great work today!`,
                isOnDuty: false
            };
        } else {
            const shiftDuration = end - start;
            const elapsed = currentHour - start;
            const percent = Math.min(100, Math.max(0, Math.round((elapsed / shiftDuration) * 100)));
            return {
                status: 'On Duty',
                badgeStyle: 'bg-gold/20 text-gold border-gold/40 shadow-[0_0_12px_rgba(212,175,55,0.2)]',
                progress: percent,
                description: `Shift active (${todaySchedule.hours}). Real-time queue and station active.`,
                isOnDuty: true
            };
        }
    }, [todaySchedule, now]);

    // Animated CountUp for Today's shift completion %
    const animatedProgressPercent = useCountUp(currentShiftStatus.progress, 1000, 0, !isLoadingSchedule);

    return (
        <div className="w-full space-y-6">
            {/* Master Unified Shift Schedule Card */}
            <div className="bg-charcoal-light border border-white/10 rounded-sm overflow-hidden shadow-2xl relative animate-fade-in">
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-gold/60 to-transparent"></div>

                {/* Card Header: View-Focused */}
                <div className="bg-white/[0.02] px-5 sm:px-6 py-4 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-sm bg-gold/10 border border-gold/25 flex items-center justify-center text-gold shadow-sm">
                            <Calendar className="w-4.5 h-4.5" />
                        </div>
                        <div>
                            <h3 className="font-serif font-bold text-ivory text-base tracking-wide">
                                Shift Schedule & Weekly Roster
                            </h3>
                            <span className="text-[11px] text-ivory-dim">
                                SampleBranch Branch
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-auto">
                        <span className="text-[10px] font-mono font-bold text-gold/90 bg-gold/10 px-3 py-1.5 rounded-sm border border-gold/30 uppercase tracking-wider flex items-center gap-1.5 shadow-xs">
                            <Calendar className="w-3.5 h-3.5 text-gold" />
                            Official Shift Schedule
                        </span>
                    </div>
                </div>

                <div className="p-4 sm:p-6 space-y-6">
                    {/* Today's Live Status Highlight Banner */}
                    <div className="bg-charcoal border border-white/5 p-4 sm:p-5 rounded-sm space-y-3 shadow-inner relative overflow-hidden">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5 flex-wrap">
                                <div className="flex items-center gap-1.5">
                                    <Clock className="w-4 h-4 text-gold" />
                                    <span className="text-sm font-bold text-ivory">
                                        Today ({todaySchedule.day}):
                                    </span>
                                </div>
                                <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider border ${currentShiftStatus.badgeStyle}`}>
                                    {currentShiftStatus.status}
                                </span>
                                <span className="text-xs text-ivory-dim flex items-center gap-1.5">
                                    <Sun className="w-3.5 h-3.5 text-gold/80" />
                                    <strong className="text-ivory font-medium">{todaySchedule.hours}</strong>
                                </span>
                            </div>

                            {todaySchedule.active && (
                                <span className="font-bold font-mono text-xs text-gold self-start sm:self-auto bg-gold/10 px-2.5 py-1 rounded border border-gold/20">
                                    {animatedProgressPercent}% Completed
                                </span>
                            )}
                        </div>

                        {todaySchedule.active && (
                            <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden border border-white/5">
                                <div
                                    className="bg-gradient-to-r from-gold/70 via-gold to-gold-400 h-full rounded-full transition-all duration-1000 ease-out shadow-[0_0_12px_rgba(212,175,55,0.4)]"
                                    style={{ width: animateBars ? `${currentShiftStatus.progress}%` : '0%' }}
                                ></div>
                            </div>
                        )}

                        <p className="text-xs text-ivory-dim/90">
                            {currentShiftStatus.description}
                        </p>
                    </div>

                    {/* 7-Day Responsive Roster Grid (4 cols on tablet, 7 cols on XL desktop, 2 cols on mobile) */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] uppercase font-bold tracking-widest text-ivory-dim flex items-center gap-1.5">
                                <UserCheck className="w-3.5 h-3.5 text-gold/80" />
                                Weekly Roster Overview
                            </span>
                            <span className="text-[10px] font-mono text-gold/80 uppercase">
                                Mon – Sun
                            </span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7 gap-2.5 sm:gap-3">
                            {schedule.map((item, index) => {
                                const isToday = index === mondayBasedTodayIndex;

                                return (
                                    <div
                                        key={item.day}
                                        className={`relative border p-3 sm:p-3.5 rounded-sm flex flex-col justify-between transition-all duration-200 min-h-[105px] shadow-sm select-none animate-fade-in ${
                                            isToday
                                                ? 'bg-gradient-to-b from-gold/20 via-charcoal to-charcoal border-gold shadow-[0_0_18px_rgba(212,175,55,0.22)] scale-[1.01] z-10'
                                                : item.active 
                                                    ? 'bg-charcoal border-white/10 text-ivory hover:border-gold/30' 
                                                    : 'bg-white/[0.01] border-white/5 text-white/20'
                                        }`}
                                        style={{ animationDelay: `${index * 60}ms`, animationFillMode: 'both' }}
                                    >
                                        {/* Top highlight bar for today */}
                                        {isToday && (
                                            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gold shadow-[0_0_8px_rgba(212,175,55,0.8)]"></div>
                                        )}

                                        <div className="flex items-start justify-between gap-1">
                                            <div className="min-w-0 flex-1">
                                                <span className={`text-xs font-bold block leading-tight truncate ${isToday ? 'text-gold font-bold' : 'text-ivory'}`} title={item.day}>
                                                    {item.day}
                                                </span>
                                                <span className="text-[9px] font-mono text-white/40 uppercase block">
                                                    {item.short}
                                                </span>
                                            </div>
                                            {isToday && (
                                                <span className="text-[7px] font-bold bg-gold text-charcoal px-1.5 py-0.5 rounded-xs uppercase tracking-wider font-mono shadow-xs shrink-0">
                                                    TODAY
                                                </span>
                                            )}
                                        </div>

                                        <div className="mt-3 pt-2.5 border-t border-white/5 space-y-1">
                                            <span className={`text-[10px] block font-semibold leading-tight break-words ${
                                                isToday ? 'text-gold font-bold' : item.active ? 'text-ivory-dim' : 'text-white/20'
                                            }`}>
                                                {item.hours}
                                            </span>
                                            <span className={`text-[8px] uppercase tracking-wider font-bold block ${
                                                isToday ? 'text-gold' : item.active ? 'text-emerald-400' : 'text-white/20'
                                            }`}>
                                                {item.active ? (isToday ? 'Active Shift' : 'Scheduled') : 'Day Off'}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Minimalist Discreet Shift Policy Footer */}
                <div className="px-5 sm:px-6 py-3 bg-white/[0.01] border-t border-white/5 flex items-center gap-2 text-[11px] text-ivory-dim/70">
                    <Info className="w-3.5 h-3.5 text-gold/80 flex-shrink-0" />
                    <span>
                        <strong>Station Policy:</strong> Station clippers, blades, and shears must be sanitized 10 minutes before shift opening and between client services. Station availability automatically synchronizes to active queue allocation.
                    </span>
                </div>
            </div>

            {/* Bottom 2-Column Operational Suite to Balance Page Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Shift Protocols & Handover Rules */}
                <div className="lg:col-span-5 bg-charcoal-light border border-white/10 rounded-sm overflow-hidden shadow-2xl relative flex flex-col justify-between animate-fade-in" style={{ animationDelay: '80ms', animationFillMode: 'both' }}>
                    <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-gold/40 to-transparent"></div>
                    
                    <div className="bg-white/[0.02] px-6 py-4 border-b border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Info className="w-4.5 h-4.5 text-gold" />
                            <h4 className="font-serif font-bold text-ivory text-sm tracking-wide">Shift Protocols & Guidelines</h4>
                        </div>
                        <span className="text-[9px] font-bold text-gold/80 bg-gold/10 px-2.5 py-0.5 rounded-full uppercase tracking-wider border border-gold/20">
                            STANDARD
                        </span>
                    </div>

                    <div className="p-6 space-y-4 flex-1 text-xs text-ivory-dim leading-relaxed">
                        <div className="flex items-start gap-3">
                            <div className="w-2 h-2 rounded-full bg-gold/80 mt-1.5 flex-shrink-0"></div>
                            <div>
                                <strong className="text-ivory block font-semibold">Shift Schedule Adherence</strong>
                                <span>Barbers are expected to be on station during assigned shift hours. Weekly rosters are published by shop administration.</span>
                            </div>
                        </div>

                        <div className="flex items-start gap-3">
                            <div className="w-2 h-2 rounded-full bg-gold/80 mt-1.5 flex-shrink-0"></div>
                            <div>
                                <strong className="text-ivory block font-semibold">Chair & Tool Sanitization</strong>
                                <span>All clippers, blades, and shears must be sanitized 10 minutes before shift opening and between every client queue service.</span>
                            </div>
                        </div>

                        <div className="flex items-start gap-3">
                            <div className="w-2 h-2 rounded-full bg-gold/80 mt-1.5 flex-shrink-0"></div>
                            <div>
                                <strong className="text-ivory block font-semibold">Live Queue Check-In</strong>
                                <span>Station availability automatically synchronizes to active queue allocation once your shift window begins.</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Branch Operations & Rest Day Summary */}
                <div className="lg:col-span-7 bg-charcoal-light border border-white/10 rounded-sm overflow-hidden shadow-2xl relative flex flex-col justify-between animate-fade-in" style={{ animationDelay: '140ms', animationFillMode: 'both' }}>
                    <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-gold/40 to-transparent"></div>
                    
                    <div className="bg-white/[0.02] px-6 py-4 border-b border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Clock className="w-4.5 h-4.5 text-gold" />
                            <h4 className="font-serif font-bold text-ivory text-sm tracking-wide">Shop Operating Hours</h4>
                        </div>
                        <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full uppercase tracking-wider border border-emerald-500/20">
                            SAMPLEBRANCH BRANCH
                        </span>
                    </div>

                    <div className="p-6 space-y-3.5 flex-1 text-xs text-ivory-dim leading-relaxed">
                        <div className="flex justify-between items-center pb-2.5 border-b border-white/5">
                            <span className="font-semibold text-ivory">Monday – Thursday</span>
                            <span className="font-mono text-gold font-medium">9:00 AM – 9:00 PM (12 hrs)</span>
                        </div>
                        <div className="flex justify-between items-center pb-2.5 border-b border-white/5">
                            <span className="font-semibold text-ivory">Friday</span>
                            <span className="font-mono text-gold font-medium">9:00 AM – 9:00 PM (High Volume)</span>
                        </div>
                        <div className="flex justify-between items-center pb-2.5 border-b border-white/5">
                            <span className="font-semibold text-ivory">Saturday</span>
                            <span className="font-mono text-gold font-bold">9:00 AM – 10:00 PM (Extended Peak)</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="font-semibold text-ivory">Sunday</span>
                            <span className="font-mono text-white/40">Off Duty / Shop Rest Day</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
