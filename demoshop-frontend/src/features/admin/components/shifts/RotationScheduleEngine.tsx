import React, { useState, useMemo, useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
    Calendar as CalendarIcon,
    Clock,
    Globe,
    Sparkles,
    Shield,
    Users,
    Check,
    X,
    RotateCw,
    Plus,
    CalendarDays,
    Info,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { StaffScheduleMember } from '@/features/admin/services/staff-schedule.service';
import {
    ApplyScheduleModal,
    type WeeklyTemplate,
    type WeekTemplateDays,
    type DayTemplateSlot,
} from './ApplyScheduleModal';
import {
    springTransition,
    snappySpringTransition,
    viewTransitionVariants,
    cardContainerVariants,
    cardItemVariants,
    reducedMotionVariants,
} from './shift-animations';

interface RotationScheduleEngineProps {
    staff: StaffScheduleMember[];
    onApplySuccess: (message: string) => void;
    showToast: (message: string) => void;
}

const PRESET_SHIFTS = [
    { label: 'Full Day', startTime: '09:00', endTime: '21:00', desc: '09:00 AM - 09:00 PM' },
    { label: 'Morning', startTime: '09:00', endTime: '15:00', desc: '09:00 AM - 03:00 PM' },
    { label: 'Afternoon', startTime: '15:00', endTime: '21:00', desc: '03:00 PM - 09:00 PM' },
];

const WEEKDAY_NAMES = [
    { dayIndex: 1, label: 'Mon', full: 'Monday' },
    { dayIndex: 2, label: 'Tue', full: 'Tuesday' },
    { dayIndex: 3, label: 'Wed', full: 'Wednesday' },
    { dayIndex: 4, label: 'Thu', full: 'Thursday' },
    { dayIndex: 5, label: 'Fri', full: 'Friday' },
    { dayIndex: 6, label: 'Sat', full: 'Saturday' },
    { dayIndex: 0, label: 'Sun', full: 'Sunday' },
];

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

const buildDefaultTemplates = (staffList: StaffScheduleMember[]): WeeklyTemplate[] => {
    const barbers = staffList.filter((s) => s.role === 'Barber');

    // 1. Standard Week (All operating days on; first 3 barbers online)
    const standardDays: WeekTemplateDays = {};
    for (let day = 0; day <= 6; day++) {
        standardDays[day] = {};
        staffList.forEach((member) => {
            const isBarber = member.role === 'Barber';
            const barberIndex = barbers.findIndex((b) => b.userId === member.userId);
            const isOnline = isBarber && barberIndex >= 0 && barberIndex < 3;
            standardDays[day][member.userId] = {
                startTime: '09:00',
                endTime: day === 0 ? '20:00' : (day === 6 ? '22:00' : '21:00'),
                isOff: false,
                isOnlineBookingEnabled: isOnline,
            };
        });
    }

    // 2. Alternate Rotation A (Mon, Wed, Fri, Sun on)
    const rotADays: WeekTemplateDays = {};
    for (let day = 0; day <= 6; day++) {
        rotADays[day] = {};
        const isOn = [1, 3, 5, 0].includes(day);
        staffList.forEach((member) => {
            const isBarber = member.role === 'Barber';
            const barberIndex = barbers.findIndex((b) => b.userId === member.userId);
            rotADays[day][member.userId] = {
                startTime: '09:00',
                endTime: '21:00',
                isOff: !isOn,
                isOnlineBookingEnabled: isBarber && isOn && barberIndex >= 0 && barberIndex < 3,
            };
        });
    }

    // 3. Alternate Rotation B (Tue, Thu, Sat on)
    const rotBDays: WeekTemplateDays = {};
    for (let day = 0; day <= 6; day++) {
        rotBDays[day] = {};
        const isOn = [2, 4, 6].includes(day);
        staffList.forEach((member) => {
            const isBarber = member.role === 'Barber';
            const barberIndex = barbers.findIndex((b) => b.userId === member.userId);
            rotBDays[day][member.userId] = {
                startTime: '09:00',
                endTime: '22:00',
                isOff: !isOn,
                isOnlineBookingEnabled: isBarber && isOn && barberIndex >= 0 && barberIndex < 3,
            };
        });
    }

    // 4. Weekend Heavy (Thu-Sun on, Mon-Wed off)
    const weekendDays: WeekTemplateDays = {};
    for (let day = 0; day <= 6; day++) {
        weekendDays[day] = {};
        const isWeekend = [4, 5, 6, 0].includes(day);
        staffList.forEach((member) => {
            const isBarber = member.role === 'Barber';
            const barberIndex = barbers.findIndex((b) => b.userId === member.userId);
            weekendDays[day][member.userId] = {
                startTime: '09:00',
                endTime: '22:00',
                isOff: !isWeekend,
                isOnlineBookingEnabled: isBarber && isWeekend && barberIndex >= 0 && barberIndex < 3,
            };
        });
    }

    return [
        {
            id: 'standard_week',
            name: 'Standard Week',
            description: 'Mon–Sat full working days with Sunday off.',
            days: standardDays,
        },
        {
            id: 'alternate_a',
            name: 'Alternate Rotation A',
            description: 'Mon / Wed / Fri / Sun primary coverage.',
            days: rotADays,
        },
        {
            id: 'alternate_b',
            name: 'Alternate Rotation B',
            description: 'Tue / Thu / Sat high-volume coverage.',
            days: rotBDays,
        },
        {
            id: 'weekend_heavy',
            name: 'Weekend Heavy',
            description: 'Thu–Sun extended hours (until 10 PM).',
            days: weekendDays,
        },
    ];
};

export const RotationScheduleEngine: React.FC<RotationScheduleEngineProps> = ({
    staff,
    onApplySuccess,
    showToast,
}) => {
    const prefersReducedMotion = useReducedMotion();

    // Active Day Tab (1=Mon ... 0=Sun)
    const [selectedWeekday, setSelectedWeekday] = useState<number>(1);
    const [isApplyModalOpen, setIsApplyModalOpen] = useState<boolean>(false);
    const [customEditUserId, setCustomEditUserId] = useState<string | null>(null);

    // Initial template loader with localStorage persistence
    const [templates, setTemplates] = useState<WeeklyTemplate[]>(() => {
        const defaults = buildDefaultTemplates(staff);
        try {
            const stored = localStorage.getItem('demoshop_schedule_templates');
            if (stored) {
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            }
        } catch {}
        return defaults;
    });

    const [activeTemplateId, setActiveTemplateId] = useState<string>('standard_week');

    // Sync staff into template if new staff members were added
    useEffect(() => {
        if (staff.length === 0) return;
        setTemplates((currentTemplates) => {
            return currentTemplates.map((tpl) => {
                const updatedDays = { ...tpl.days };
                for (let day = 0; day <= 6; day++) {
                    updatedDays[day] = { ...(updatedDays[day] || {}) };
                    staff.forEach((member) => {
                        if (!updatedDays[day][member.userId]) {
                            updatedDays[day][member.userId] = {
                                startTime: '09:00',
                                endTime: '21:00',
                                isOff: day === 0,
                                isOnlineBookingEnabled: false,
                            };
                        }
                    });
                }
                return { ...tpl, days: updatedDays };
            });
        });
    }, [staff]);

    // Active Template Object
    const activeTemplate = useMemo(
        () => templates.find((t) => t.id === activeTemplateId) || templates[0],
        [templates, activeTemplateId]
    );

    // Active Day slots
    const daySlots = useMemo(
        () => activeTemplate.days[selectedWeekday] || {},
        [activeTemplate, selectedWeekday]
    );

    // Compute online booking allocation count for the selected day in this template
    const onlineBookingCountForDay = useMemo(() => {
        let count = 0;
        staff.forEach((m) => {
            if (m.role !== 'Barber') return;
            const slot = daySlots[m.userId];
            if (slot && !slot.isOff && slot.isOnlineBookingEnabled) {
                count += 1;
            }
        });
        return count;
    }, [staff, daySlots]);

    const isDayQuotaFull = onlineBookingCountForDay >= 3;

    // Update slot in active template
    const handleUpdateSlot = (
        userId: string,
        patch: Partial<DayTemplateSlot>
    ) => {
        setTemplates((currentTemplates) => {
            const updated = currentTemplates.map((tpl) => {
                if (tpl.id !== activeTemplateId) return tpl;
                const updatedDays = { ...tpl.days };
                const dayMap = { ...(updatedDays[selectedWeekday] || {}) };
                dayMap[userId] = {
                    ...dayMap[userId],
                    ...patch,
                };
                updatedDays[selectedWeekday] = dayMap;
                return { ...tpl, days: updatedDays };
            });

            try {
                localStorage.setItem('demoshop_schedule_templates', JSON.stringify(updated));
            } catch {}
            return updated;
        });
    };

    // Toggle Online Booking for a barber on the selected day
    const handleToggleOnlineBooking = (member: StaffScheduleMember) => {
        if (member.role !== 'Barber') return;
        const currentSlot = daySlots[member.userId] || {
            startTime: '09:00',
            endTime: '21:00',
            isOff: false,
            isOnlineBookingEnabled: false,
        };

        if (currentSlot.isOff) {
            showToast(`${member.name} is off duty on this day. Set On Duty first.`);
            return;
        }

        const currentlyEnabled = Boolean(currentSlot.isOnlineBookingEnabled);
        if (!currentlyEnabled && isDayQuotaFull) {
            const dayName = WEEKDAY_NAMES.find((w) => w.dayIndex === selectedWeekday)?.full || 'this day';
            showToast(`Maximum of 3 barbers can accept online bookings for ${dayName}.`);
            return;
        }

        const next = !currentlyEnabled;
        handleUpdateSlot(member.userId, { isOnlineBookingEnabled: next });

        const dayName = WEEKDAY_NAMES.find((w) => w.dayIndex === selectedWeekday)?.full || 'this day';
        if (next) {
            showToast(`${member.name} enabled for online booking on ${dayName} (${onlineBookingCountForDay + 1}/3 allocated).`);
        } else {
            showToast(`${member.name} removed from online booking for ${dayName}.`);
        }
    };

    // Set shift timing
    const handleSetShift = (
        member: StaffScheduleMember,
        startTime: string,
        endTime: string,
        isOff: boolean
    ) => {
        const current = daySlots[member.userId];
        let nextOnline = current?.isOnlineBookingEnabled;
        if (isOff) nextOnline = false;

        handleUpdateSlot(member.userId, {
            startTime,
            endTime,
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
            {/* Template Controls & Range Application CTA */}
            <div className="shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-charcoal-light border border-white/10 rounded-sm p-3 sm:p-4 shadow-lg">
                {/* Left: Template Selector */}
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                        <RotateCw className="w-5 h-5 text-gold shrink-0" />
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-gold">
                                Recurring Rotation Engine
                            </p>
                            <h3 className="text-sm font-bold text-ivory">
                                Weekly Schedule Template Builder
                            </h3>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <select
                            value={activeTemplateId}
                            onChange={(e) => setActiveTemplateId(e.target.value)}
                            className="min-h-[38px] px-3 rounded border border-white/15 bg-charcoal text-xs font-semibold text-ivory focus:border-gold focus:outline-none cursor-pointer"
                        >
                            {templates.map((tpl) => (
                                <option key={tpl.id} value={tpl.id}>
                                    {tpl.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Right: Apply to Date Range CTA */}
                <div className="flex items-center gap-3">
                    <Button
                        variant="primary"
                        onClick={() => setIsApplyModalOpen(true)}
                        className="bg-gold text-charcoal font-bold text-xs min-h-[38px] shadow-[0_0_15px_rgba(212,175,55,0.3)] hover:shadow-[0_0_20px_rgba(212,175,55,0.5)] cursor-pointer flex items-center gap-2"
                    >
                        <CalendarDays className="w-4 h-4" />
                        <span>Apply Schedule to Timeline...</span>
                    </Button>
                </div>
            </div>

            {/* Weekday Selector Tabs (Monday through Sunday) */}
            <div className="shrink-0 flex items-center gap-1 bg-charcoal border border-white/10 p-1 rounded-sm overflow-x-auto no-scrollbar">
                {WEEKDAY_NAMES.map(({ dayIndex, label, full }) => {
                    const isSelected = selectedWeekday === dayIndex;
                    // Compute on-duty and online count for that day
                    let dayActiveCount = 0;
                    let dayOnlineCount = 0;
                    staff.forEach((m) => {
                        const slot = activeTemplate.days[dayIndex]?.[m.userId];
                        if (slot && !slot.isOff) {
                            dayActiveCount += 1;
                            if (slot.isOnlineBookingEnabled && m.role === 'Barber') {
                                dayOnlineCount += 1;
                            }
                        }
                    });

                    return (
                        <button
                            key={dayIndex}
                            type="button"
                            onClick={() => setSelectedWeekday(dayIndex)}
                            className={`relative flex-1 min-w-[90px] py-2 px-2 rounded-sm text-center transition-all cursor-pointer flex flex-col items-center gap-1 ${
                                isSelected
                                    ? 'bg-gold/20 text-gold border border-gold/50 shadow-[0_0_10px_rgba(212,175,55,0.2)]'
                                    : 'bg-charcoal-light/40 text-ivory-dim hover:text-ivory hover:bg-white/[0.04] border border-transparent'
                            }`}
                        >
                            <span className="text-xs font-bold font-mono uppercase tracking-wider">
                                {label}
                            </span>
                            <div className="flex items-center gap-1 text-[9px] font-mono">
                                <span className={dayActiveCount > 0 ? 'text-ivory' : 'text-zinc-500'}>
                                    {dayActiveCount} on duty
                                </span>
                                <span
                                    className={`px-1 py-0.2 rounded font-bold ${
                                        dayOnlineCount >= 3
                                            ? 'bg-emerald-500/20 text-emerald-300'
                                            : dayOnlineCount > 0
                                            ? 'bg-amber-500/20 text-amber-300'
                                            : 'bg-white/5 text-zinc-500'
                                    }`}
                                >
                                    {dayOnlineCount}/3
                                </span>
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* Active Day Header & Live Quota Pill */}
            <div className="shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-3 py-2 bg-charcoal border border-white/10 rounded-sm">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-ivory">
                        {WEEKDAY_NAMES.find((w) => w.dayIndex === selectedWeekday)?.full} Template Configuration
                    </span>
                    <span className="text-[11px] text-ivory-dim/60 font-medium">
                        ({activeTemplate.name})
                    </span>
                </div>

                <div
                    className={`min-h-[34px] flex items-center justify-between sm:justify-start gap-2 px-3 py-1 rounded-full text-xs font-semibold tracking-tight border transition-all ${
                        isDayQuotaFull
                            ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                            : onlineBookingCountForDay > 0
                            ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                            : 'bg-charcoal-light border-white/10 text-ivory-dim'
                    }`}
                >
                    <div className="flex items-center gap-1.5 min-w-0">
                        <Globe className="w-3.5 h-3.5 text-gold shrink-0" />
                        <span className="truncate">
                            <span className="sm:hidden font-bold">{onlineBookingCountForDay}/3 Online Slots</span>
                            <span className="hidden sm:inline font-medium">
                                {onlineBookingCountForDay} of 3 barbers assigned for customer booking on{' '}
                                {WEEKDAY_NAMES.find((w) => w.dayIndex === selectedWeekday)?.label}
                            </span>
                        </span>
                    </div>
                    {isDayQuotaFull && (
                        <span className="shrink-0 text-[10px] uppercase font-bold bg-emerald-500/25 text-emerald-200 px-2 py-0.5 rounded-full border border-emerald-500/30 whitespace-nowrap">
                            Quota Full
                        </span>
                    )}
                </div>
            </div>

            {/* Staff Cards Grid for the Active Weekday */}
            <div className="w-full">
                <motion.div
                    key={`${activeTemplateId}-${selectedWeekday}`}
                    variants={prefersReducedMotion ? undefined : cardContainerVariants}
                    initial="initial"
                    animate="animate"
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4"
                >
                    {staff.map((member) => {
                        const slot = daySlots[member.userId] || {
                            startTime: '09:00',
                            endTime: '21:00',
                            isOff: selectedWeekday === 0,
                            isOnlineBookingEnabled: false,
                        };
                        const isOff = slot.isOff;
                        const isBarber = member.role === 'Barber';
                        const isOnline = Boolean(slot.isOnlineBookingEnabled && !isOff);
                        const isCustomOpen = customEditUserId === member.userId;

                        // Online toggle disabled if off duty, or not a barber, or quota full and not currently enabled
                        const isOnlineToggleDisabled =
                            !isBarber || isOff || (!isOnline && isDayQuotaFull);

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
                                {/* Card Header */}
                                <div>
                                    <div className="flex items-start justify-between gap-2.5 mb-2.5 sm:mb-3">
                                        <div className="flex items-center gap-2.5 sm:gap-3">
                                            <div
                                                className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-bold text-xs border shrink-0 ${
                                                    isBarber
                                                        ? isOnline
                                                            ? 'bg-gold/20 text-gold border-gold/70 shadow-[0_0_8px_rgba(212,175,55,0.3)]'
                                                            : 'bg-charcoal text-ivory border-gold/30'
                                                        : 'bg-sky-500/15 text-sky-300 border-sky-500/40'
                                                }`}
                                            >
                                                {getInitials(member.name)}
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
                                            onClick={() =>
                                                handleSetShift(
                                                    member,
                                                    slot.startTime || '09:00',
                                                    slot.endTime || '21:00',
                                                    !isOff
                                                )
                                            }
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
                                                {isOff
                                                    ? 'Off Duty'
                                                    : `${formatTime12h(slot.startTime)} - ${formatTime12h(slot.endTime)}`}
                                            </span>
                                        </div>

                                        {/* Preset Chips */}
                                        <div className="grid grid-cols-4 gap-1">
                                            {PRESET_SHIFTS.map((preset) => {
                                                const isSelected =
                                                    !isOff &&
                                                    slot.startTime === preset.startTime &&
                                                    slot.endTime === preset.endTime;
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

                                            {/* Custom Time */}
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

                                        {/* Collapsible Custom Inputs */}
                                        {isCustomOpen && !isOff && (
                                            <div className="p-2.5 rounded bg-charcoal border border-white/10 space-y-2 mt-2">
                                                <div className="grid grid-cols-2 gap-2 text-xs">
                                                    <div>
                                                        <label className="block text-[10px] uppercase font-semibold text-ivory-dim mb-1">
                                                            Start Time
                                                        </label>
                                                        <input
                                                            type="time"
                                                            value={slot.startTime}
                                                            onChange={(e) =>
                                                                handleSetShift(member, e.target.value, slot.endTime, false)
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
                                                            value={slot.endTime}
                                                            onChange={(e) =>
                                                                handleSetShift(member, slot.startTime, e.target.value, false)
                                                            }
                                                            className="w-full bg-charcoal-light border border-white/10 rounded px-2 py-1 text-xs text-ivory focus:border-gold focus:outline-none"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Card Footer: Online Booking Toggle */}
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
                                                        ? 'Customer booking enabled'
                                                        : isDayQuotaFull
                                                        ? 'Max 3 limit reached for this day'
                                                        : 'Walk-ins only'}
                                                </p>
                                            </div>

                                            {/* Toggle Switch */}
                                            <button
                                                type="button"
                                                role="switch"
                                                aria-checked={isOnline}
                                                disabled={isOnlineToggleDisabled}
                                                onClick={() => handleToggleOnlineBooking(member)}
                                                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${
                                                    isOnline
                                                        ? 'bg-gold border-gold/80 shadow-[0_0_10px_rgba(212,175,55,0.4)]'
                                                        : 'bg-zinc-800 border-zinc-700'
                                                }`}
                                                title={
                                                    isOff
                                                        ? 'Barber is off duty.'
                                                        : !isOnline && isDayQuotaFull
                                                        ? 'Maximum of 3 barbers can accept online bookings for this day.'
                                                        : isOnline
                                                        ? 'Click to disable online booking for this day'
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
            </div>

            {/* Apply Schedule Modal */}
            <ApplyScheduleModal
                isOpen={isApplyModalOpen}
                onClose={() => setIsApplyModalOpen(false)}
                templates={templates}
                activeTemplateId={activeTemplateId}
                staff={staff}
                onSuccess={(msg) => {
                    showToast(msg);
                    onApplySuccess(msg);
                }}
            />
        </motion.div>
    );
};

export default RotationScheduleEngine;
