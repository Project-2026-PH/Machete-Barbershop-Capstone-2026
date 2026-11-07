import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
    Calendar as CalendarIcon,
    AlertTriangle,
    CheckCircle2,
    Clock,
    X,
    Sparkles,
    ArrowRight,
    ShieldAlert,
    RotateCw,
    Save,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { barberService, type BarberShiftRequestData } from '@/features/barber/services/barber.service';
import {
    staffScheduleService,
    type StaffScheduleMember,
    type StaffScheduleAssignment,
} from '@/features/admin/services/staff-schedule.service';
import { springTransition, snappySpringTransition } from './shift-animations';

export interface DayTemplateSlot {
    startTime: string;
    endTime: string;
    isOff: boolean;
    isOnlineBookingEnabled: boolean;
}

export type WeekTemplateDays = Record<number, Record<string, DayTemplateSlot>>;

export interface WeeklyTemplate {
    id: string;
    name: string;
    description: string;
    days: WeekTemplateDays;
}

interface ApplyScheduleModalProps {
    isOpen: boolean;
    onClose: () => void;
    templates: WeeklyTemplate[];
    activeTemplateId: string;
    staff: StaffScheduleMember[];
    onSuccess: (message: string) => void;
}

const pad = (n: number) => String(n).padStart(2, '0');
const toIsoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const getPresetDates = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Next 2 Weeks (14 days)
    const twoWeeksEnd = new Date(today);
    twoWeeksEnd.setDate(today.getDate() + 13);

    // This Month End
    const thisMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    // Next Month
    const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const nextMonthEnd = new Date(today.getFullYear(), today.getMonth() + 2, 0);

    // Next 3 Months End
    const threeMonthsEnd = new Date(today.getFullYear(), today.getMonth() + 3, 0);

    return {
        today: toIsoDate(today),
        twoWeeksEnd: toIsoDate(twoWeeksEnd),
        thisMonthEnd: toIsoDate(thisMonthEnd),
        nextMonthStart: toIsoDate(nextMonthStart),
        nextMonthEnd: toIsoDate(nextMonthEnd),
        threeMonthsEnd: toIsoDate(threeMonthsEnd),
    };
};

export const ApplyScheduleModal: React.FC<ApplyScheduleModalProps> = ({
    isOpen,
    onClose,
    templates,
    activeTemplateId,
    staff,
    onSuccess,
}) => {
    const prefersReducedMotion = useReducedMotion();
    const presets = useMemo(() => getPresetDates(), []);

    const [startDate, setStartDate] = useState(presets.today);
    const [endDate, setEndDate] = useState(presets.twoWeeksEnd);
    const [rotationMode, setRotationMode] = useState<'single' | 'alternating'>('single');
    const [primaryTemplateId, setPrimaryTemplateId] = useState(activeTemplateId);
    const [secondaryTemplateId, setSecondaryTemplateId] = useState(
        templates.find((t) => t.id !== activeTemplateId)?.id || activeTemplateId
    );
    const [preserveApprovedLeaves, setPreserveApprovedLeaves] = useState(true);

    const [shiftRequests, setShiftRequests] = useState<BarberShiftRequestData[]>([]);
    const [isLoadingRequests, setIsLoadingRequests] = useState(false);
    const [isApplying, setIsApplying] = useState(false);

    // Fetch approved requests for conflict detection
    useEffect(() => {
        if (!isOpen) return;
        let isMounted = true;
        setIsLoadingRequests(true);

        void barberService
            .getAllShiftRequests()
            .then((data) => {
                if (isMounted) setShiftRequests(data || []);
            })
            .catch((err) => {
                console.error('Failed to fetch shift requests for conflict check:', err);
            })
            .finally(() => {
                if (isMounted) setIsLoadingRequests(false);
            });

        return () => {
            isMounted = false;
        };
    }, [isOpen]);

    // Primary & Secondary Template Objects
    const primaryTemplate = useMemo(
        () => templates.find((t) => t.id === primaryTemplateId) || templates[0],
        [templates, primaryTemplateId]
    );

    const secondaryTemplate = useMemo(
        () => templates.find((t) => t.id === secondaryTemplateId) || templates[1] || templates[0],
        [templates, secondaryTemplateId]
    );

    // Parse Dates
    const dateRangeList = useMemo(() => {
        if (!startDate || !endDate || startDate > endDate) return [];
        const list: string[] = [];
        const [sy, sm, sd] = startDate.split('-').map(Number);
        const [ey, em, ed] = endDate.split('-').map(Number);
        const current = new Date(Date.UTC(sy, sm - 1, sd));
        const end = new Date(Date.UTC(ey, em - 1, ed));

        while (current <= end) {
            const iso = `${current.getUTCFullYear()}-${pad(current.getUTCMonth() + 1)}-${pad(current.getUTCDate())}`;
            list.push(iso);
            current.setUTCDate(current.getUTCDate() + 1);
        }
        return list;
    }, [startDate, endDate]);

    // Conflict detection: Scan dates in range against approved leaves
    const detectedConflicts = useMemo(() => {
        if (dateRangeList.length === 0 || shiftRequests.length === 0) return [];

        const approvedLeaves = shiftRequests.filter(
            (r) => r.status === 'approved' && r.request_type === 'time_off'
        );

        if (approvedLeaves.length === 0) return [];

        const conflicts: Array<{
            date: string;
            staffName: string;
            userId?: string;
            reason: string;
        }> = [];

        // Build lookup map for quick matching
        dateRangeList.forEach((dateIso, dayIndex) => {
            const dateObj = new Date(dateIso);
            const weekday = dateObj.getUTCDay();

            // Which template applies to this day?
            const weekNumber = Math.floor(dayIndex / 7);
            const activeTpl =
                rotationMode === 'alternating' && weekNumber % 2 === 1
                    ? secondaryTemplate
                    : primaryTemplate;

            staff.forEach((member) => {
                const slot = activeTpl.days[weekday]?.[member.userId];
                // Only considered a conflict if the template marks this staff member as ON DUTY
                if (slot && !slot.isOff) {
                    const matchedLeave = approvedLeaves.find(
                        (l) => l.shift_date === dateIso
                    );
                    if (matchedLeave) {
                        conflicts.push({
                            date: dateIso,
                            staffName: member.name,
                            userId: member.userId,
                            reason: matchedLeave.reason || 'Approved time-off request',
                        });
                    }
                }
            });
        });

        return conflicts;
    }, [dateRangeList, shiftRequests, rotationMode, primaryTemplate, secondaryTemplate, staff]);

    // Bulk apply schedule
    const handleApply = async () => {
        if (dateRangeList.length === 0) return;
        setIsApplying(true);

        try {
            // Group assignments by year-month
            const assignmentsByMonth = new Map<string, StaffScheduleAssignment[]>();

            dateRangeList.forEach((dateIso, dayIndex) => {
                const [y, m, d] = dateIso.split('-').map(Number);
                const monthKey = `${y}-${m}`;
                if (!assignmentsByMonth.has(monthKey)) {
                    assignmentsByMonth.set(monthKey, []);
                }

                const dateObj = new Date(Date.UTC(y, m - 1, d));
                const weekday = dateObj.getUTCDay();

                const weekNumber = Math.floor(dayIndex / 7);
                const activeTpl =
                    rotationMode === 'alternating' && weekNumber % 2 === 1
                        ? secondaryTemplate
                        : primaryTemplate;

                staff.forEach((member) => {
                    const slot = activeTpl.days[weekday]?.[member.userId] || {
                        startTime: '09:00',
                        endTime: '21:00',
                        isOff: weekday === 0,
                        isOnlineBookingEnabled: false,
                    };

                    // Check if this member has an approved leave and user chose to preserve
                    const hasLeaveConflict =
                        preserveApprovedLeaves &&
                        detectedConflicts.some(
                            (c) => c.date === dateIso && c.userId === member.userId
                        );

                    const isOff = hasLeaveConflict ? true : slot.isOff;
                    const isOnline = hasLeaveConflict ? false : slot.isOnlineBookingEnabled;

                    assignmentsByMonth.get(monthKey)!.push({
                        userId: member.userId,
                        staffName: member.name,
                        role: member.role,
                        shiftDate: dateIso,
                        startTime: isOff ? null : slot.startTime,
                        endTime: isOff ? null : slot.endTime,
                        isOff,
                        isOnlineBookingEnabled: isOff ? false : isOnline,
                    });
                });
            });

            // Save for each month sequentially
            for (const [monthKey, monthAssignments] of assignmentsByMonth.entries()) {
                const [y, m] = monthKey.split('-').map(Number);
                await staffScheduleService.saveMonthRoster(y, m, monthAssignments);
            }

            const conflictNote =
                detectedConflicts.length > 0 && preserveApprovedLeaves
                    ? ` (Preserved ${detectedConflicts.length} approved leave date[s])`
                    : '';

            onSuccess(
                `Schedule applied across ${dateRangeList.length} days (${startDate} to ${endDate})${conflictNote}.`
            );
            onClose();
        } catch (err: any) {
            console.error('Failed to apply schedule template:', err);
            alert(err?.response?.data?.error || err?.message || 'Failed to apply schedule.');
        } finally {
            setIsApplying(false);
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
                {/* Backdrop */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="fixed inset-0 bg-black/80 backdrop-blur-sm"
                />

                {/* Modal Container */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 12 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 12 }}
                    transition={prefersReducedMotion ? { duration: 0.1 } : springTransition}
                    className="relative w-full max-w-2xl bg-charcoal border border-white/10 rounded-sm shadow-2xl flex flex-col max-h-[90vh] overflow-hidden z-10"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-charcoal-light">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-gold/15 border border-gold/40 flex items-center justify-center text-gold">
                                <RotateCw className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="text-base font-serif font-bold text-ivory">
                                    Apply Schedule to Timeline
                                </h3>
                                <p className="text-xs text-ivory-dim">
                                    Batch-schedule shifts and online booking quotas across days, weeks, or months
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="text-ivory-dim hover:text-ivory rounded p-1 hover:bg-white/5 cursor-pointer transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Content Body */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                        {/* 1. Date Range Picker & Quick Presets */}
                        <div className="space-y-3">
                            <label className="block text-xs font-mono font-bold uppercase tracking-wider text-gold">
                                1. Select Date Range
                            </label>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <span className="block text-[11px] text-ivory-dim mb-1 font-mono">
                                        Start Date:
                                    </span>
                                    <input
                                        type="date"
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                        className="w-full bg-charcoal-light border border-white/10 rounded px-3 py-2 text-xs text-ivory font-mono focus:border-gold focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <span className="block text-[11px] text-ivory-dim mb-1 font-mono">
                                        End Date:
                                    </span>
                                    <input
                                        type="date"
                                        value={endDate}
                                        onChange={(e) => setEndDate(e.target.value)}
                                        min={startDate}
                                        className="w-full bg-charcoal-light border border-white/10 rounded px-3 py-2 text-xs text-ivory font-mono focus:border-gold focus:outline-none"
                                    />
                                </div>
                            </div>

                            {/* Range Shortcut Pills */}
                            <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                <span className="text-[10px] text-ivory-dim/60 font-mono">Presets:</span>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setStartDate(presets.today);
                                        setEndDate(presets.twoWeeksEnd);
                                    }}
                                    className="px-2 py-1 rounded bg-white/5 hover:bg-gold/15 text-[10px] font-mono text-ivory-dim hover:text-gold border border-white/5 hover:border-gold/30 cursor-pointer transition-colors"
                                >
                                    Next 2 Weeks
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setStartDate(presets.today);
                                        setEndDate(presets.thisMonthEnd);
                                    }}
                                    className="px-2 py-1 rounded bg-white/5 hover:bg-gold/15 text-[10px] font-mono text-ivory-dim hover:text-gold border border-white/5 hover:border-gold/30 cursor-pointer transition-colors"
                                >
                                    Remainder of This Month
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setStartDate(presets.nextMonthStart);
                                        setEndDate(presets.nextMonthEnd);
                                    }}
                                    className="px-2 py-1 rounded bg-white/5 hover:bg-gold/15 text-[10px] font-mono text-ivory-dim hover:text-gold border border-white/5 hover:border-gold/30 cursor-pointer transition-colors"
                                >
                                    Next Month
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setStartDate(presets.today);
                                        setEndDate(presets.threeMonthsEnd);
                                    }}
                                    className="px-2 py-1 rounded bg-white/5 hover:bg-gold/15 text-[10px] font-mono text-ivory-dim hover:text-gold border border-white/5 hover:border-gold/30 cursor-pointer transition-colors"
                                >
                                    Next 3 Months
                                </button>
                            </div>

                            <p className="text-[11px] font-mono text-ivory-dim/70">
                                Target timeline:{' '}
                                <strong className="text-gold">{dateRangeList.length} total days</strong>
                            </p>
                        </div>

                        {/* 2. Rotation Mode & Template Selection */}
                        <div className="space-y-3 pt-4 border-t border-white/5">
                            <label className="block text-xs font-mono font-bold uppercase tracking-wider text-gold">
                                2. Rotation Strategy
                            </label>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => setRotationMode('single')}
                                    className={`p-3 rounded-sm border text-left transition-colors cursor-pointer ${
                                        rotationMode === 'single'
                                            ? 'bg-gold/10 border-gold text-ivory shadow-[0_0_12px_rgba(212,175,55,0.2)]'
                                            : 'bg-charcoal-light border-white/10 text-ivory-dim hover:border-white/20'
                                    }`}
                                >
                                    <p className="text-xs font-bold text-ivory flex items-center gap-1.5">
                                        <span>Standard Single Template</span>
                                    </p>
                                    <p className="text-[11px] text-ivory-dim mt-1">
                                        Repeats the chosen weekly pattern continuously every week.
                                    </p>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setRotationMode('alternating')}
                                    className={`p-3 rounded-sm border text-left transition-colors cursor-pointer ${
                                        rotationMode === 'alternating'
                                            ? 'bg-gold/10 border-gold text-ivory shadow-[0_0_12px_rgba(212,175,55,0.2)]'
                                            : 'bg-charcoal-light border-white/10 text-ivory-dim hover:border-white/20'
                                    }`}
                                >
                                    <p className="text-xs font-bold text-ivory flex items-center gap-1.5">
                                        <RotateCw className="w-3.5 h-3.5 text-gold" />
                                        <span>Alternating Bi-Weekly Rotation</span>
                                    </p>
                                    <p className="text-[11px] text-ivory-dim mt-1">
                                        Alternates between Template A and Template B every 7 days.
                                    </p>
                                </button>
                            </div>

                            {/* Template dropdown(s) */}
                            <div className="space-y-3 mt-3">
                                <div>
                                    <label className="block text-[11px] font-mono text-ivory-dim mb-1">
                                        {rotationMode === 'alternating'
                                            ? 'Week 1 Pattern (Template A):'
                                            : 'Active Weekly Template:'}
                                    </label>
                                    <select
                                        value={primaryTemplateId}
                                        onChange={(e) => setPrimaryTemplateId(e.target.value)}
                                        className="w-full bg-charcoal-light border border-white/10 rounded px-3 py-2 text-xs text-ivory focus:border-gold focus:outline-none"
                                    >
                                        {templates.map((tpl) => (
                                            <option key={tpl.id} value={tpl.id}>
                                                {tpl.name} — {tpl.description}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {rotationMode === 'alternating' && (
                                    <div>
                                        <label className="block text-[11px] font-mono text-ivory-dim mb-1">
                                            Week 2 Pattern (Template B):
                                        </label>
                                        <select
                                            value={secondaryTemplateId}
                                            onChange={(e) => setSecondaryTemplateId(e.target.value)}
                                            className="w-full bg-charcoal-light border border-white/10 rounded px-3 py-2 text-xs text-ivory focus:border-gold focus:outline-none"
                                        >
                                            {templates.map((tpl) => (
                                                <option key={tpl.id} value={tpl.id}>
                                                    {tpl.name} — {tpl.description}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 3. Conflict Detection & Safeguard Settings */}
                        <div className="space-y-3 pt-4 border-t border-white/5">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-mono font-bold uppercase tracking-wider text-gold flex items-center gap-1.5">
                                    <ShieldAlert className="w-3.5 h-3.5" />
                                    <span>3. Leave Conflict Safeguards</span>
                                </label>
                                {isLoadingRequests && (
                                    <span className="text-[10px] text-ivory-dim animate-pulse">
                                        Checking requests...
                                    </span>
                                )}
                            </div>

                            {detectedConflicts.length > 0 ? (
                                <div className="rounded-sm border border-amber-500/40 bg-amber-500/10 p-3.5 space-y-2">
                                    <div className="flex items-center gap-2 text-amber-300 text-xs font-bold">
                                        <AlertTriangle className="w-4 h-4 shrink-0" />
                                        <span>
                                            {detectedConflicts.length} Approved Leave Conflict(s) Detected in this range:
                                        </span>
                                    </div>
                                    <div className="max-h-28 overflow-y-auto space-y-1 text-[11px] text-ivory-dim font-mono">
                                        {detectedConflicts.map((c, idx) => (
                                            <div
                                                key={`${c.date}-${c.staffName}-${idx}`}
                                                className="flex items-center justify-between bg-charcoal/60 px-2 py-1 rounded"
                                            >
                                                <span className="text-ivory font-semibold">{c.staffName}</span>
                                                <span className="text-amber-300">{c.date}</span>
                                                <span className="text-ivory-dim/60 truncate max-w-[140px]">
                                                    {c.reason}
                                                </span>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Action Toggle */}
                                    <label className="flex items-center gap-2 pt-2 border-t border-white/10 text-xs cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={preserveApprovedLeaves}
                                            onChange={(e) => setPreserveApprovedLeaves(e.target.checked)}
                                            className="rounded border-white/20 bg-charcoal text-gold focus:ring-gold"
                                        />
                                        <span className="text-ivory font-semibold">
                                            Skip conflicting dates (Preserve approved leaves as Off Duty)
                                        </span>
                                    </label>
                                </div>
                            ) : (
                                <div className="rounded-sm border border-emerald-500/30 bg-emerald-500/10 p-3 flex items-center gap-2 text-xs text-emerald-300 font-mono">
                                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                                    <span>No approved leave conflicts found within the selected dates.</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 bg-charcoal-light">
                        <Button variant="outline" onClick={onClose} disabled={isApplying} className="text-xs">
                            Cancel
                        </Button>

                        <Button
                            variant="primary"
                            onClick={() => void handleApply()}
                            disabled={isApplying || dateRangeList.length === 0}
                            className="bg-gold text-charcoal font-bold text-xs shadow-[0_0_15px_rgba(212,175,55,0.3)] hover:shadow-[0_0_20px_rgba(212,175,55,0.5)] cursor-pointer"
                        >
                            <Save className="mr-1.5 h-4 w-4" />
                            <span>
                                {isApplying
                                    ? 'Applying Schedule...'
                                    : `Apply to ${dateRangeList.length} Day(s)`}
                            </span>
                        </Button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default ApplyScheduleModal;
