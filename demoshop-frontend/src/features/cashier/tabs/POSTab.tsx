import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Loader2, AlertCircle, Check, CheckCircle, Clock, Users, Scissors, UserPlus, X, Sparkles, Search, Pencil, Wallet, ReceiptText, RotateCcw, LogIn, UserMinus, CalendarX } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthContext';
import { telemetryManager } from '@/utils/adaptive-polling';
import { fetchRetailCatalog, fetchServiceCatalog } from '../services/cashier-catalog.service';
import { createRetailSale, createWalkInOrder, fetchOfflineReceiptProfile, type CreateWalkInOrderRequest, type CreateWalkInOrderResponse } from '../services/cashier-pos.service';
import { getCashierConnectivityStatus, isCashierConnectivityFailure, subscribeToCashierConnectivity } from '../services/cashier-connectivity';
import { completeForPayment, createRetryableMutation } from '../checkout-flow';
import {
    cancelQueueEntry,
    completeQueueEntry,
    checkInQueueEntry as checkInQueueEntryRequest,
    markQueueNoShow,
    fetchQueueOrderImpactPreview,
    getPaymentAttemptReceiptUrl,
    fetchQueueReceipt,
    reconcilePaymentAttempt,
    requestQueuePaymentQuote,
    submitQueuePayment,
    updateQueueOrder,
    updateQueueIdentity,
} from '../services/cashier-queue.service';
import { useQueueData } from '../context/QueueDataContext';
import { useToast } from '@/components/feedback/ToastContext';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/ui/Button';
import QueuePaymentModal, { type PaymentQuote } from '../components/queue/QueuePaymentModal';
import OfflineCashPaymentModal from '../components/queue/OfflineCashPaymentModal';
import OfflineWalkInEditModal from '../components/queue/OfflineWalkInEditModal';
import FinalizedReceiptModal from '../components/queue/FinalizedReceiptModal';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { sanitizeCustomerName, isInvalidCustomerNameKey, isValidCustomerName, isLikelyUnusualCustomerName, normalizeCustomerNameCase } from '@/utils/customer-name.util';
import { BARBER_COLORS } from '../components/queue/constants';
import type { BarberInfo, CustomerInfo } from '../components/queue/types';
import type { BranchInvoiceProfile, PaymentAttemptStatus, ReceiptResponse } from '@demoshop/shared-types';
import type { LocalWalkInTransaction } from '../services/cashier-offline.repository';
import { normalizeLocalCashCapture, renderOfflineReceiptHtml, type OfflineReceiptSnapshotInput } from '../services/cashier-offline-payment';
import { mapLocalWalkInToQueueEntry, resolveCashierQueueActionEntry } from '../services/cashier-offline-queue';
import { filterCashierQueueForBusinessDay } from '../services/cashier-reservations';
import { canCompleteCashierService } from '../services/cashier-completion';
import { getManilaDateIso, reservationTimeToEpoch } from '@/utils/manila-date';
import { calculateQueueCompletionEstimatesByBarber } from '@/utils/queue-estimates';
import type { AxiosResponse } from 'axios';
import ServiceSelection, { type SelectionItem } from '../components/pos/ServiceSelection';
import OrderPanel from '../components/pos/OrderPanel';
import { formatServiceTitle, formatDurationHuman, DEFAULT_DURATION_MIN } from '../utils/reservation-slots';
import CashierReassignmentModal from '../components/CashierReassignmentModal';
import {
    getReservationImpactConflict,
    parseReservationImpactPreview,
    requiresReservationImpactPreview,
    type ReservationImpactPreview,
} from '../reservation-impact-preview';

export const BARBER_COLOR_STORAGE_KEY = 'demoshop:cashier:barber-colors';

const normalizeInlineText = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
const isHaircutStylingService = (serviceName: string): boolean =>
    ['hair cut', 'haircut', 'hair art'].some((qualifier) =>
        serviceName.toLowerCase().includes(qualifier));
const editDistance = (a: string, b: string) => {
    const row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        let diagonal = row[0]; row[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const above = row[j];
            row[j] = a[i - 1] === b[j - 1] ? diagonal : Math.min(row[j] + 1, row[j - 1] + 1, diagonal + 1);
            diagonal = above;
        }
    }
    return row[b.length];
};

const InlineIdentityCell: React.FC<{
    customer: CustomerInfo;
    field: 'name' | 'barber';
    barbers: BarberInfo[];
    currentValue: string;
    onSave: (customer: CustomerInfo, name: string, barberId: number) => Promise<void>;
}> = ({ customer, field, barbers, currentValue, onSave }) => {
    const [value, setValue] = useState(currentValue);
    const [editing, setEditing] = useState(false);
    const canEditIdentity = ['waiting', 'serving', 'in_service', 'in_chair', 'accepted', 'confirmed', 'scheduled', 'pending', 'late'].includes((customer.status || '').toLowerCase()) && !customer.paid;
    useEffect(() => setValue(currentValue), [currentValue]);
    if (!editing && !canEditIdentity) {
        return <span className="text-left" title="Customer details can only be edited while waiting or being served and unpaid">{currentValue}</span>;
    }
    if (!editing) {
        return (
            <button
                type="button"
                className="group/inline inline-flex items-center gap-1.5 text-left text-ivory hover:text-gold transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold rounded-sm px-1 py-0.5 -mx-1 border-b border-dashed border-white/30 hover:border-gold/80 cursor-pointer"
                onClick={() => setEditing(true)}
                title={field === 'barber' ? 'Click to change barber' : 'Click to edit customer name'}
            >
                <span className="truncate">{currentValue}</span>
                <Pencil className="w-2.5 h-2.5 text-gold/70 group-hover/inline:text-gold transition-colors shrink-0" aria-hidden="true" />
            </button>
        );
    }

    if (field === 'barber') {
        return (
            <select
                autoFocus
                value={String(customer.barberId)}
                onChange={async (event) => {
                    const chosenId = Number(event.target.value);
                    const chosen = barbers.find((b) => Number(b.id) === chosenId);
                    if (chosen) {
                        setValue(chosen.name);
                        await onSave(customer, customer.name, chosenId);
                    }
                    setEditing(false);
                }}
                onBlur={() => setEditing(false)}
                onKeyDown={(event) => {
                    if (event.key === 'Escape') setEditing(false);
                }}
                className="w-full min-w-28 rounded border border-gold/60 bg-charcoal px-1.5 py-1 text-xs text-ivory outline-none focus:ring-1 focus:ring-gold"
            >
                {barbers.map((b) => (
                    <option key={b.id} value={b.id} className="bg-charcoal text-ivory">
                        {b.name} ({b.status === 'serving' ? 'In Chair' : 'Available'})
                    </option>
                ))}
            </select>
        );
    }

    const commit = async () => {
        const entered = sanitizeCustomerName(value).trim();
        if (!entered || !isValidCustomerName(entered)) {
            setValue(currentValue);
            setEditing(false);
            return;
        }
        await onSave(customer, entered, Number(customer.barberId));
        setEditing(false);
    };

    return (
        <input
            autoFocus
            value={value}
            onChange={(event) => setValue(sanitizeCustomerName(event.target.value))}
            onBlur={() => void commit()}
            onKeyDown={(event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    void commit();
                }
                if (event.key === 'Escape') {
                    setValue(currentValue);
                    setEditing(false);
                }
            }}
            className="w-full min-w-24 rounded border border-gold/60 bg-charcoal px-2 py-1 text-xs text-ivory outline-none focus:ring-1 focus:ring-gold"
        />
    );
};

export const BARBER_PALETTE = [
    '#c9a84c', // Gold
    '#4c9ac9', // Sky Blue
    '#4caf82', // Emerald
    '#c94c7a', // Rose Pink
    '#9b6ae0', // Purple
    '#f97316', // Coral Orange
    '#06b6d4', // Cyan
    '#ec4899', // Magenta
    '#84cc16', // Lime Green
    '#6366f1', // Indigo
];

export const BarberColorPicker: React.FC<{
    barberId: string;
    barberName: string;
    color: string;
    allBarbers: BarberInfo[];
    getBarberColor: (id: string | number) => string;
    onChange: (color: string) => void;
    onResetDefault: () => void;
}> = ({ barberId, barberName, color, allBarbers, getBarberColor, onChange, onResetDefault }) => {
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        if (!open) return;

        const handleClickOutside = (event: MouseEvent | TouchEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [open]);

    // Track colors taken by other barbers to prevent conflicts
    const takenColorsMap = useMemo(() => {
        const map = new Map<string, string>();
        allBarbers.forEach((b) => {
            if (String(b.id) === String(barberId)) return;
            const bColor = getBarberColor(b.id).toLowerCase();
            map.set(bColor, b.name);
        });
        return map;
    }, [allBarbers, barberId, getBarberColor]);

    return (
        <span ref={containerRef} className="relative inline-flex shrink-0">
            <button
                type="button"
                aria-label={`Choose color for ${barberName}`}
                title={`Change color for ${barberName}`}
                onClick={() => setOpen((current) => !current)}
                className="h-3.5 w-3.5 rounded-full border border-white/20 transition-transform hover:scale-125 focus:outline-none focus:ring-1 focus:ring-gold cursor-pointer"
                style={{ backgroundColor: color }}
            />
            {open && (
                <span className="absolute left-0 top-5 z-40 flex flex-col gap-2 rounded-sm border border-white/15 bg-charcoal p-2 shadow-2xl min-w-[145px]">
                    <span className="text-[10px] font-semibold text-ivory-dim tracking-wide px-0.5">
                        Barber Color
                    </span>
                    <span className="flex flex-wrap gap-1.5 max-w-[155px]">
                        {BARBER_PALETTE.map((paletteColor) => {
                            const isSelected = color.toLowerCase() === paletteColor.toLowerCase();
                            const takenBy = takenColorsMap.get(paletteColor.toLowerCase());
                            const isTaken = Boolean(takenBy) && !isSelected;

                            if (isTaken) {
                                return (
                                    <button
                                        key={paletteColor}
                                        type="button"
                                        disabled={true}
                                        title={`Already used by ${takenBy}`}
                                        aria-label={`Color ${paletteColor} is already used by ${takenBy}`}
                                        className="relative h-4 w-4 rounded-full border border-white/10 opacity-25 cursor-not-allowed"
                                        style={{ backgroundColor: paletteColor }}
                                    >
                                        <span className="absolute inset-0 flex items-center justify-center">
                                            <span className="w-full h-0.5 bg-white/70 -rotate-45" />
                                        </span>
                                    </button>
                                );
                            }

                            return (
                                <button
                                    key={paletteColor}
                                    type="button"
                                    title={isSelected ? `${barberName}'s current color` : `Set ${barberName}'s color`}
                                    aria-label={`Set ${barberName} color to ${paletteColor}`}
                                    onClick={() => {
                                        onChange(paletteColor);
                                        setOpen(false);
                                    }}
                                    className={`h-4 w-4 rounded-full border transition-transform hover:scale-125 focus:outline-none focus:ring-1 focus:ring-gold cursor-pointer ${
                                        isSelected
                                            ? 'border-white ring-2 ring-white/80 scale-110 shadow'
                                            : 'border-white/20 hover:border-white/60'
                                    }`}
                                    style={{ backgroundColor: paletteColor }}
                                />
                            );
                        })}
                    </span>
                    <button
                        type="button"
                        onClick={() => {
                            onResetDefault();
                            setOpen(false);
                        }}
                        className="mt-0.5 pt-1.5 border-t border-white/10 flex items-center justify-center gap-1.5 w-full text-[10px] font-medium text-ivory-dim hover:text-gold transition-colors cursor-pointer"
                        title="Reset to default barber color"
                    >
                        <RotateCcw className="w-2.5 h-2.5 text-gold/70" />
                        <span>Reset to default</span>
                    </button>
                </span>
            )}
        </span>
    );
};

const QueueStatusPill: React.FC<{
    status: string;
    isReviewNeeded: boolean;
    size?: 'sm' | 'md';
}> = ({ status, isReviewNeeded, size = 'md' }) => {
    const iconSize = size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3';
    const textSize = size === 'sm' ? 'text-[10px] px-2 py-0.5' : 'text-[11px] px-2.5 py-0.5';
    const norm = (status || '').toLowerCase();

    if (isReviewNeeded) {
        return (
            <span className={`inline-flex items-center gap-1 rounded-full font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-400/40 shadow-sm shadow-indigo-500/10 ${textSize}`}>
                <ReceiptText className={`${iconSize} text-indigo-300 shrink-0`} />
                <span>Review Receipt</span>
            </span>
        );
    }

    if (['serving', 'in_service', 'in_chair'].includes(norm)) {
        return (
            <span className={`inline-flex items-center gap-1 rounded-full font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm shadow-emerald-500/10 ${textSize}`}>
                <Scissors className={`${iconSize} text-emerald-300 shrink-0 animate-pulse`} />
                <span>Serving</span>
            </span>
        );
    }

    if (['completed', 'done'].includes(norm)) {
        return (
            <span className={`inline-flex items-center gap-1 rounded-full font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm shadow-emerald-500/10 ${textSize}`}>
                <CheckCircle className={`${iconSize} text-emerald-300 shrink-0`} />
                <span>Done</span>
            </span>
        );
    }

    if (norm === 'late') {
        return (
            <span className={`inline-flex items-center gap-1 rounded-full font-semibold bg-red-500/20 text-red-300 border border-red-500/40 shadow-sm shadow-red-500/10 ${textSize}`}>
                <AlertCircle className={`${iconSize} text-red-300 shrink-0`} />
                <span>Late</span>
            </span>
        );
    }

    const label = norm === 'confirmed' ? 'Confirmed' : norm === 'scheduled' ? 'Scheduled' : 'Waiting';
    return (
        <span className={`inline-flex items-center gap-1 rounded-full font-semibold bg-gold/15 text-gold border border-gold/40 shadow-sm shadow-gold/10 ${textSize}`}>
            <Clock className={`${iconSize} text-gold shrink-0`} />
            <span>{label}</span>
        </span>
    );
};

interface CatalogServiceItem {
    id: string;
    name: string;
    price: number;
    duration: number;
    priceKnown: boolean;
    durationKnown: boolean;
}

const OfflinePendingBadge: React.FC<{ status?: CustomerInfo['offlineSyncStatus']; error?: string; locallyCompleted?: boolean }> = ({ status = 'pending', error, locallyCompleted = false }) => (
    status === 'synced' ? null :
    <span className="inline-flex items-center rounded-full border border-amber-300/25 bg-amber-300/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-200">
        <span title={error}>{locallyCompleted && status === 'retryable'
                ? 'Completed locally - retry scheduled'
                : locallyCompleted && status === 'conflict'
                    ? 'Completed locally - conflict'
                    : locallyCompleted && status === 'failed'
                        ? 'Completed locally - needs review'
                        : locallyCompleted
                            ? 'Completed locally - pending sync'
            : status === 'retryable'
                ? 'Offline · Retry scheduled'
                : status === 'conflict'
                    ? 'Offline · Conflict'
                    : status === 'failed'
                        ? 'Offline · Sync failed'
                        : 'Offline · Pending sync'}</span>
    </span>
);

const newIdempotencyKey = () => (
    typeof globalThis.crypto?.randomUUID === 'function'
        ? globalThis.crypto.randomUUID()
        : `cashier-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
);

const isOpenPaymentAttempt = (status?: PaymentAttemptStatus): boolean =>
    status === 'pending_verification' || status === 'automated_review_passed' || status === 'flagged';

function formatTime(isoString?: string | null): string {
    if (!isoString) {
        const now = new Date();
        let h = now.getHours();
        const m = now.getMinutes().toString().padStart(2, '0');
        const ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12 || 12;
        return `${h}:${m} ${ampm}`;
    }
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Manila',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    }).format(date);
}

function formatEstimatedCompletion(timestamp: number | null): string {
    return timestamp === null ? '—' : formatTime(new Date(timestamp).toISOString());
}

function formatScheduledTime12Hour(time?: string | null): string {
    const match = /^(\d{1,2}):(\d{2})/.exec((time || '').trim());
    if (!match) return time || 'Scheduled time';
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour > 23 || minute > 59) return time || 'Scheduled time';
    return new Intl.DateTimeFormat('en-US', {
        hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC',
    }).format(new Date(Date.UTC(2020, 0, 1, hour, minute)));
}

const isReservationQueueEntry = (customer: CustomerInfo): boolean =>
    customer.isWalkIn === false || Boolean(customer.preferredDate || customer.preferredTime);

const canMarkReservationNoShow = (customer: CustomerInfo): boolean =>
    isReservationQueueEntry(customer) && ['accepted', 'late'].includes((customer.status || '').toLowerCase());

function getReservationCheckInState(customer: CustomerInfo, now: number) {
    const status = (customer.status || '').toLowerCase();
    const isEligibleStatus = ['confirmed', 'accepted', 'late'].includes(status);
    const scheduledAt = reservationTimeToEpoch(customer.preferredDate, customer.preferredTime);
    const eligible = isReservationQueueEntry(customer)
        && isEligibleStatus
        && scheduledAt !== null
        && now >= scheduledAt - 10 * 60_000;
    return {
        eligible,
        isEarly: eligible && scheduledAt !== null && now < scheduledAt,
    };
}

function formatReservationDate(dateIso?: string | null): string {
    if (!dateIso) return '';
    const date = new Date(`${dateIso.slice(0, 10)}T12:00:00Z`);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Manila',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    }).format(date);
}

function formatQueueTimeIn(customer: CustomerInfo): { value: string } {
    const isReservation = isReservationQueueEntry(customer);
    if (isReservation) {
        const date = formatReservationDate(customer.preferredDate);
        const time = formatScheduledTime12Hour(customer.preferredTime);
        return {
            value: [date || null, customer.preferredTime ? time : null].filter(Boolean).join(' • ') || 'Scheduled time',
        };
    }

    const timestamp = customer.createdAt || customer.timerStartedAt;
    const date = timestamp ? new Date(timestamp) : new Date();
    const dateLabel = Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric',
    }).format(date);
    const timeLabel = formatTime(timestamp);
    return { value: [dateLabel || null, timeLabel].filter(Boolean).join(' - ') };
}

function QueueSourceLabel({ isReservation }: { isReservation: boolean }) {
    return <span className="text-[10px] text-ivory-dim/60">{isReservation ? 'Reservation' : 'Walk-in'}</span>;
}

const areSelectionItemsEqual = (a: SelectionItem[], b: SelectionItem[]): boolean => {
    const mapA = new Map<string, number>();
    for (const item of a) {
        const key = `${item.kind}:${item.id}`;
        mapA.set(key, (mapA.get(key) || 0) + (item.kind === 'product' ? Number(item.quantity || 1) : 1));
    }

    const mapB = new Map<string, number>();
    for (const item of b) {
        const key = `${item.kind}:${item.id}`;
        mapB.set(key, (mapB.get(key) || 0) + (item.kind === 'product' ? Number(item.quantity || 1) : 1));
    }

    if (mapA.size !== mapB.size) return false;

    for (const [key, qtyA] of mapA.entries()) {
        const qtyB = mapB.get(key);
        if (qtyB === undefined || qtyB !== qtyA) return false;
    }

    return true;
};

const formatSchedulePreviewTimestamp = (timestamp: string | number | null): string => {
    if (timestamp === null) return '—';
    const epoch = typeof timestamp === 'number' ? timestamp : Date.parse(timestamp);
    if (!Number.isFinite(epoch)) return '—';
    return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    }).format(new Date(epoch));
};

const POSTab: React.FC = () => {
    const reduceMotion = useReducedMotion();
    const { user } = useAuth();
    const branchId = Number(user?.branch_id);
    const catalogScope = Number.isInteger(branchId) && branchId > 0 ? String(branchId) : 'current';
    const cashierId = String(user?.user_id ?? '');
    const offlineDraftKey = Number.isInteger(branchId) && branchId > 0 && cashierId
        ? `${branchId}:${cashierId}` : null;
    const {
        queue: sourceQueue,
        barbers,
        refetch,
        patchQueueEntry,
        addOptimisticQueueEntry,
        addLocalOfflineQueueEntry,
        queueDataStatus,
        queueDataUpdatedAt,
        queueDataError,
        queueRefreshing,
        bypassTimeRestrictions,
    } = useQueueData();
    const [connectivity, setConnectivity] = useState(getCashierConnectivityStatus);
    useEffect(() => {
        const unsubscribe = subscribeToCashierConnectivity(setConnectivity);
        setConnectivity(getCashierConnectivityStatus());
        return unsubscribe;
    }, []);
    const queue = useMemo(() => sourceQueue.map((customer) =>
        resolveCashierQueueActionEntry(customer, connectivity)), [sourceQueue, connectivity]);
    const { addToast } = useToast();
    const handleReservationCheckIn = useCallback(async (customer: CustomerInfo) => {
        const scheduledAt = reservationTimeToEpoch(customer.preferredDate, customer.preferredTime);
        if (scheduledAt === null || Date.now() < scheduledAt - 10 * 60_000) {
            const scheduledLabel = customer.preferredTime ? formatScheduledTime12Hour(customer.preferredTime) : 'the scheduled time';
            addToast({
                type: 'info',
                title: 'Check In Locked',
                message: `Early check-in opens 10 minutes before the scheduled arrival time (${scheduledLabel}).`,
            });
            return;
        }

        setCheckingInQueueId(customer.id);
        try {
            await checkInQueueEntryRequest(customer.id);
            addToast({ type: 'success', title: 'Checked In', message: `${customer.name || 'Reservation'} checked in.` });
            await refetch();
        } catch (error: any) {
            addToast({ type: 'error', title: 'Check In Failed', message: error?.response?.data?.message || 'Unable to check in this reservation.' });
        } finally {
            setCheckingInQueueId(null);
        }
    }, [addToast, refetch]);

    // Form state
    const [customerName, setCustomerName] = useState('');
    const [nameConfirmation, setNameConfirmation] = useState<string | null>(null);
    const [selectedServiceId, setSelectedServiceId] = useState('');
    const [selectedRetailItems, setSelectedRetailItems] = useState<SelectionItem[]>([]);
    const [selectedBarberId, setSelectedBarberId] = useState('');
    const [formTouched, setFormTouched] = useState<{ name?: boolean; service?: boolean }>({});
    const [formSubmitted, setFormSubmitted] = useState(false);
    const [barberColors, setBarberColors] = useState<Record<string, string>>(() => {
        try {
            const stored = localStorage.getItem(BARBER_COLOR_STORAGE_KEY);
            const parsed = stored ? JSON.parse(stored) : {};
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch {
            return {};
        }
    });

    const getBarberName = useCallback((barberId: string | number) => {
        const barber = barbers.find(b => String(b.id) === String(barberId));
        return barber?.name || 'Unassigned';
    }, [barbers]);

    const getDefaultBarberColor = useCallback((barberId: string | number) => {
        const barberIndex = barbers.findIndex((b) => String(b.id) === String(barberId));
        const barber = barberIndex >= 0 ? barbers[barberIndex] : undefined;
        if (barber && (barber as any).color) return (barber as any).color;
        if (barberIndex >= 0) return BARBER_PALETTE[barberIndex % BARBER_PALETTE.length];
        return BARBER_PALETTE[0];
    }, [barbers]);

    const getBarberColor = useCallback((barberId: string | number) => {
        return barberColors[String(barberId)] || getDefaultBarberColor(barberId);
    }, [barberColors, getDefaultBarberColor]);

    useEffect(() => {
        const handleSync = () => {
            try {
                const stored = localStorage.getItem(BARBER_COLOR_STORAGE_KEY);
                const parsed = stored ? JSON.parse(stored) : {};
                setBarberColors(parsed && typeof parsed === 'object' ? parsed : {});
            } catch {
                // ignore
            }
        };
        window.addEventListener('storage', handleSync);
        window.addEventListener('demoshop:barber-colors-updated', handleSync);
        return () => {
            window.removeEventListener('storage', handleSync);
            window.removeEventListener('demoshop:barber-colors-updated', handleSync);
        };
    }, []);

    const handleBarberColorChange = useCallback((barberId: string, color: string) => {
        setBarberColors((current) => {
            const next = { ...current, [String(barberId)]: color };
            try {
                localStorage.setItem(BARBER_COLOR_STORAGE_KEY, JSON.stringify(next));
                window.dispatchEvent(new Event('demoshop:barber-colors-updated'));
            } catch {
                // Keep the color change available for the current session.
            }
            return next;
        });
    }, []);

    const handleResetBarberColor = useCallback((barberId: string) => {
        setBarberColors((current) => {
            const next = { ...current };
            delete next[String(barberId)];
            try {
                localStorage.setItem(BARBER_COLOR_STORAGE_KEY, JSON.stringify(next));
                window.dispatchEvent(new Event('demoshop:barber-colors-updated'));
            } catch {
                // Keep default color in current session
            }
            return next;
        });
    }, []);
    const [queueBarberFilter, setQueueBarberFilter] = useState('all');
    const [queueStatusFilter, setQueueStatusFilter] = useState<'all' | 'serving' | 'waiting' | 'completed'>('all');
    const [queueSourceFilter, setQueueSourceFilter] = useState<'all' | 'walk-in' | 'reservation'>('all');
    const [customerSearchQuery, setCustomerSearchQuery] = useState('');
    const [queueClock, setQueueClock] = useState(Date.now());
    const [checkingInQueueId, setCheckingInQueueId] = useState<string | null>(null);
    useEffect(() => {
        const timer = window.setInterval(() => setQueueClock(Date.now()), 15_000);
        return () => window.clearInterval(timer);
    }, []);
    const queueFreshnessLabel = queueDataStatus === 'online'
        ? 'Connected'
        : queueDataStatus === 'cached' || queueDataStatus === 'stale'
            ? 'Cached'
            : queueDataStatus === 'loading'
                ? 'Checking'
                : 'Unavailable';
    const queueFreshnessTitle = [
        queueDataError || (queueDataStatus === 'online' ? 'Latest queue snapshot loaded from the server.' : 'Queue snapshot is not current.'),
        queueDataUpdatedAt !== null
            ? `Last refreshed ${new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(queueDataUpdatedAt))}.`
            : null,
    ].filter(Boolean).join(' ');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const walkInRequest = useRef(createRetryableMutation(
        (payload: Omit<CreateWalkInOrderRequest, 'idempotencyKey'>, idempotencyKey: string) =>
            createWalkInOrder({ ...payload, idempotencyKey }),
        newIdempotencyKey,
    ));
    const [services, setServices] = useState<CatalogServiceItem[]>([]);
    const [retailProducts, setRetailProducts] = useState<SelectionItem[]>([]);
    const [servicesLoading, setServicesLoading] = useState(true);
    const firstCatalogReadyReportedRef = useRef(false);
    const firstCatalogLoadStartedAtRef = useRef(Date.now());
    const [catalogRecoveryMessage, setCatalogRecoveryMessage] = useState<string | null>(null);
    const [freshCatalogScopeKey, setFreshCatalogScopeKey] = useState<string | null>(null);
    const [usableOfflineCatalogScopeKey, setUsableOfflineCatalogScopeKey] = useState<string | null>(null);
    const [offlineEditCatalog, setOfflineEditCatalog] = useState<{
        scopeKey: string;
        services: CatalogServiceItem[];
        barbers: BarberInfo[];
    } | null>(null);
    const [offlineReceiptProfile, setOfflineReceiptProfile] = useState<BranchInvoiceProfile | null>(null);
    const [draftStorageReady, setDraftStorageReady] = useState(false);
    const [hasRestoredDraft, setHasRestoredDraft] = useState(false);
    const draftTouchedFieldsRef = useRef(new Set<string>());
    const draftSubmissionCommittedRef = useRef(false);
    const draftClearPromiseRef = useRef<Promise<void> | null>(null);

    // Edit Queue Entry modal state
    const [removeTarget, setRemoveTarget] = useState<CustomerInfo | null>(null);
    const [isRemoving, setIsRemoving] = useState(false);
    const [editTarget, setEditTarget] = useState<CustomerInfo | null>(null);
    const [editItems, setEditItems] = useState<SelectionItem[]>([]);
    const [originalEditItems, setOriginalEditItems] = useState<SelectionItem[]>([]);
    const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
    const [showReservationImpactPreview, setShowReservationImpactPreview] = useState(false);
    const [reservationImpactPreview, setReservationImpactPreview] = useState<ReservationImpactPreview | null>(null);
    const [reservationImpactPreviewError, setReservationImpactPreviewError] = useState<string | null>(null);
    const [isSavingEdit, setIsSavingEdit] = useState(false);
    const [barberAssignmentTarget, setBarberAssignmentTarget] = useState<CustomerInfo | null>(null);

    // Payment state
    const [paymentModalOpen, setPaymentModalOpen] = useState(false);
    const [paymentTargetId, setPaymentTargetId] = useState<string | null>(null);
    const [paymentQuote, setPaymentQuote] = useState<PaymentQuote | null>(null);
    const [paymentQuoteLoading, setPaymentQuoteLoading] = useState(false);
    const [paymentQuoteError, setPaymentQuoteError] = useState<string | null>(null);
    const [paymentServicesMissing, setPaymentServicesMissing] = useState(false);
    const repairingPaymentTargetRef = useRef<string | null>(null);
    const [paymentIdempotencyKey, setPaymentIdempotencyKey] = useState<string | null>(null);
    const [finalizedReceipt, setFinalizedReceipt] = useState<ReceiptResponse | null>(null);
    const [offlinePaymentTarget, setOfflinePaymentTarget] = useState<LocalWalkInTransaction | null>(null);
    const [offlineEditTarget, setOfflineEditTarget] = useState<LocalWalkInTransaction | null>(null);
    const [isSavingOfflineEdit, setIsSavingOfflineEdit] = useState(false);
    const [localReceiptId, setLocalReceiptId] = useState<string | null>(null);
    const [localReceiptPrintAttemptCount, setLocalReceiptPrintAttemptCount] = useState(0);
    const [localReceiptSnapshot, setLocalReceiptSnapshot] = useState<OfflineReceiptSnapshotInput | null>(null);
    const [localReceiptPrintStatus, setLocalReceiptPrintStatus] = useState<'ready' | 'printed' | 'print_requested' | 'print_failed' | 'synced'>('ready');
    const [localReceiptPrintError, setLocalReceiptPrintError] = useState<string | null>(null);
    const paymentQuoteRequestRef = useRef(0);
    const paymentTargetRef = useRef<string | null>(null);
    const completingQueueEntryIdsRef = useRef(new Set<string>());
    const completionPaymentTargetRef = useRef<CustomerInfo | null>(null);
    const [customerToComplete, setCustomerToComplete] = useState<CustomerInfo | null>(null);
    const [customSpecification, setCustomSpecification] = useState('');
    const [isCompletingService, setIsCompletingService] = useState(false);

    // Digital Payment Attempt Review State
    const [paymentAttemptReviewTarget, setPaymentAttemptReviewTarget] = useState<CustomerInfo | null>(null);
    const [paymentAttemptReceiptUrl, setPaymentAttemptReceiptUrl] = useState<string | null>(null);
    const [paymentAttemptReceiptLoading, setPaymentAttemptReceiptLoading] = useState(false);
    const [paymentAttemptReviewError, setPaymentAttemptReviewError] = useState<string | null>(null);
    const [paymentAttemptVerified, setPaymentAttemptVerified] = useState(false);
    const [paymentAttemptConfirming, setPaymentAttemptConfirming] = useState(false);
    const [paymentAttemptRejecting, setPaymentAttemptRejecting] = useState(false);

    // Local draft I/O is kept off the initial data-fetch path. The POS remains
    // interactive while IndexedDB opens and restores the current cashier draft.
    useEffect(() => {
        let isMounted = true;
        draftTouchedFieldsRef.current.clear();
        draftSubmissionCommittedRef.current = false;
        setDraftStorageReady(false);
        setHasRestoredDraft(false);
        setCustomerName('');
        setSelectedServiceId('');
        setSelectedBarberId('');

        if (!offlineDraftKey) return () => { isMounted = false; };

        void import('../services/cashier-offline.repository').then(async (repository) => {
            const storage = await repository.initializeCashierOfflineStorage();
            if (!isMounted || !storage.available) return;

            const draft = await repository.getCashierDraft(offlineDraftKey);
            if (!isMounted || draftSubmissionCommittedRef.current) return;
            if (draft && draft.branchId === branchId && draft.cashierId === cashierId) {
                if (!draftTouchedFieldsRef.current.has('customerName')) setCustomerName(draft.customerName);
                if (!draftTouchedFieldsRef.current.has('serviceId')) setSelectedServiceId(draft.serviceId);
                if (!draftTouchedFieldsRef.current.has('barberId')) setSelectedBarberId(draft.barberId);
                setHasRestoredDraft(true);
            }
            setDraftStorageReady(true);
        }).catch((error) => {
            console.warn('[POSTab] Cashier draft storage is unavailable:', error);
        });

        return () => { isMounted = false; };
    }, [offlineDraftKey, branchId, cashierId]);

    useEffect(() => {
        if (!draftStorageReady || !offlineDraftKey || draftSubmissionCommittedRef.current) return;
        const hasDraftFields = Boolean(customerName || selectedServiceId || selectedBarberId);
        if (!hasDraftFields && draftTouchedFieldsRef.current.size === 0 && !hasRestoredDraft) return;

        const timeout = window.setTimeout(() => {
            if (draftSubmissionCommittedRef.current) return;
            void (async () => {
                try {
                    if (draftClearPromiseRef.current) await draftClearPromiseRef.current;
                    if (draftSubmissionCommittedRef.current) return;
                    const repository = await import('../services/cashier-offline.repository');
                    if (draftClearPromiseRef.current) await draftClearPromiseRef.current;
                    if (draftSubmissionCommittedRef.current) return;
                    await repository.saveCashierDraft({
                        key: offlineDraftKey,
                        branchId,
                        cashierId,
                        customerName,
                        serviceId: selectedServiceId,
                        barberId: selectedBarberId,
                        updatedAt: Date.now(),
                    });
                } catch (error) {
                    console.warn('[POSTab] Failed to persist cashier draft:', error);
                }
            })();
        }, 250);

        return () => window.clearTimeout(timeout);
    }, [draftStorageReady, offlineDraftKey, branchId, cashierId, customerName, selectedServiceId, selectedBarberId, hasRestoredDraft]);

    // SECT Tie Resolution Modal State
    const [tieModal, setTieModal] = useState<{
        isOpen: boolean;
        tiedBarbers: any[];
        serviceIds: number[];
        customerName: string;
        retailItems: Array<{ productId: number; quantity: number }>;
    }>({
        isOpen: false,
        tiedBarbers: [],
        serviceIds: [],
        customerName: '',
        retailItems: [],
    });

    // Load available services
    useEffect(() => {
        let isMounted = true;
        setServicesLoading(true);
        setRetailProducts([]);
        const loadServices = async () => {
            setFreshCatalogScopeKey(null);
            setUsableOfflineCatalogScopeKey(null);
            setOfflineEditCatalog(null);
            try {
                const [serviceResponse, retailResponse] = await Promise.all([
                    fetchServiceCatalog(),
                    fetchRetailCatalog(catalogScope),
                ]);
                let invoiceProfile: BranchInvoiceProfile | null = null;
                try {
                    const fetchedProfile = await fetchOfflineReceiptProfile(branchId);
                    if (fetchedProfile?.branchId === branchId) invoiceProfile = fetchedProfile;
                } catch {
                    if (offlineDraftKey) {
                        const repository = await import('../services/cashier-offline.repository');
                        const cachedCatalog = await repository.getCashierOfflineCatalog(offlineDraftKey);
                        if (cachedCatalog?.branchId === branchId && cachedCatalog.cashierId === cashierId) {
                            invoiceProfile = cachedCatalog.invoiceProfile ?? null;
                        }
                    }
                }
                if (!isMounted) return;
                const mapped = Array.isArray(serviceResponse.data)
                    ? serviceResponse.data.map((item: any) => ({
                        id: String(item.service_id ?? item.id),
                        name: String(item.title ?? item.name ?? ''),
                        price: Number(item.price) || 0,
                        duration: Number(item.duration_minutes) || 30,
                        priceKnown: item.price !== undefined && item.price !== null && item.price !== '' && Number.isFinite(Number(item.price)) && Number(item.price) >= 0,
                        durationKnown: item.duration_minutes !== undefined && item.duration_minutes !== null && item.duration_minutes !== '' && Number.isFinite(Number(item.duration_minutes)) && Number(item.duration_minutes) > 0,
                    }))
                    : [];
                const mappedRetail = Array.isArray(retailResponse.data)
                    ? retailResponse.data.filter((item: any) => item.category === 'Customer retail' || item.ownership === 'Retail Items').map((item: any) => ({
                        id: String(item.productId ?? item.id),
                        name: String(item.name ?? 'Retail product'),
                        price: Number(item.retailPrice) || 0,
                        type: 'Retail',
                        kind: 'product' as const,
                        stock: Number(item.currentStock) || 0,
                        quantity: 1,
                    }))
                    : [];
                setServices(mapped);
                setRetailProducts(mappedRetail);
                if (!firstCatalogReadyReportedRef.current) {
                    firstCatalogReadyReportedRef.current = true;
                    telemetryManager.logEvent('cashier_first_data_ready', {
                        flow: 'pos_catalog',
                        durationMs: Date.now() - firstCatalogLoadStartedAtRef.current,
                    });
                }
                setOfflineReceiptProfile(invoiceProfile);
                setCatalogRecoveryMessage(null);
                setFreshCatalogScopeKey(offlineDraftKey);
                setUsableOfflineCatalogScopeKey(offlineDraftKey);
            } catch (err) {
                try {
                    if (!offlineDraftKey) throw new Error('Cashier and branch scope is unavailable.');
                    const repository = await import('../services/cashier-offline.repository');
                    const storage = await repository.initializeCashierOfflineStorage();
                    const cachedCatalog = storage.available
                        ? await repository.getCashierOfflineCatalog(offlineDraftKey)
                        : null;
                    if (!isMounted) return;

                    if (
                        !cachedCatalog
                        || cachedCatalog.branchId !== branchId
                        || cachedCatalog.cashierId !== cashierId
                    ) {
                        setOfflineReceiptProfile(null);
                        setServices([]);
                        setRetailProducts([]);
                        setCatalogRecoveryMessage('The offline service catalog is unavailable for this cashier and branch. Reconnect to load it before adding a walk-in.');
                        setUsableOfflineCatalogScopeKey(null);
                    } else if (Date.now() - cachedCatalog.capturedAt > repository.CASHIER_OFFLINE_CATALOG_MAX_AGE_MS) {
                        const cachedServices = cachedCatalog.services.map((service) => ({
                            id: String(service.id),
                            name: service.name,
                            price: Number(service.price),
                            duration: Number(service.duration),
                            priceKnown: service.priceKnown,
                            durationKnown: service.durationKnown,
                        }));
                        const cachedBarbers: BarberInfo[] = cachedCatalog.barbers.map((barber, index) => ({
                            id: String(barber.id),
                            name: barber.name,
                            color: BARBER_COLORS[index % BARBER_COLORS.length],
                            status: 'offline_availability_unverified',
                        }));
                        setOfflineReceiptProfile(cachedCatalog.invoiceProfile ?? null);
                        setOfflineEditCatalog({ scopeKey: offlineDraftKey, services: cachedServices, barbers: cachedBarbers });
                        setServices([]);
                        setRetailProducts([]);
                        setCatalogRecoveryMessage(null);
                        setUsableOfflineCatalogScopeKey(null);
                    } else {
                        const cachedServices = cachedCatalog.services.map((service) => ({
                            id: String(service.id),
                            name: service.name,
                            price: Number(service.price),
                            duration: Number(service.duration),
                            priceKnown: service.priceKnown,
                            durationKnown: service.durationKnown,
                        }));
                        const cachedBarbers: BarberInfo[] = cachedCatalog.barbers.map((barber, index) => ({
                            id: String(barber.id),
                            name: barber.name,
                            color: BARBER_COLORS[index % BARBER_COLORS.length],
                            status: 'offline_availability_unverified',
                        }));
                        setOfflineReceiptProfile(cachedCatalog.invoiceProfile ?? null);
                        setOfflineEditCatalog({ scopeKey: offlineDraftKey, services: cachedServices, barbers: cachedBarbers });
                        setServices(cachedServices);
                        setRetailProducts([]);
                        setCatalogRecoveryMessage(null);
                        setUsableOfflineCatalogScopeKey(offlineDraftKey);
                    }
                } catch (catalogError) {
                    if (isMounted) {
                        console.warn('[POSTab] Failed to load services and cached catalog:', { err, catalogError });
                        setServices([]);
                        setRetailProducts([]);
                        setOfflineReceiptProfile(null);
                        setOfflineEditCatalog(null);
                        setCatalogRecoveryMessage('The offline service catalog could not be opened. Reconnect to load it before adding a walk-in.');
                        setUsableOfflineCatalogScopeKey(null);
                    }
                }
            } finally {
                if (isMounted) setServicesLoading(false);
            }
        };
        const handleRetailCatalogUpdated = (event: Event) => {
            const updatedScope = (event as CustomEvent<{ scope?: string }>).detail?.scope;
            if (updatedScope === catalogScope) void loadServices();
        };
        window.addEventListener('demoshop:cashier-retail-catalog-updated', handleRetailCatalogUpdated);
        void loadServices();
        return () => {
            isMounted = false;
            window.removeEventListener('demoshop:cashier-retail-catalog-updated', handleRetailCatalogUpdated);
        };
    }, [catalogScope, offlineDraftKey, branchId, cashierId]);

    useEffect(() => {
        if (!offlineDraftKey || freshCatalogScopeKey !== offlineDraftKey || services.length === 0 || barbers.length === 0) return;
        const cachedServices = services.map((service) => ({ ...service }));
        const cachedBarbers: BarberInfo[] = barbers.map((barber) => ({ ...barber }));
        setOfflineEditCatalog({ scopeKey: offlineDraftKey, services: cachedServices, barbers: cachedBarbers });
        void import('../services/cashier-offline.repository').then((repository) =>
            repository.saveCashierOfflineCatalog({
                scopeKey: offlineDraftKey,
                branchId,
                cashierId,
                capturedAt: Date.now(),
                services: cachedServices,
                barbers: cachedBarbers.map((barber) => ({ id: String(barber.id), name: barber.name })),
                invoiceProfile: offlineReceiptProfile,
            }),
        ).catch((error) => {
            console.warn('[POSTab] Failed to cache the offline walk-in catalog:', error);
        });
    }, [offlineDraftKey, freshCatalogScopeKey, branchId, cashierId, services, barbers, offlineReceiptProfile]);

    // Keep scheduled reservations scoped to the active business day before
    // applying the existing active queue status rules.
    const cashierBusinessDate = getManilaDateIso();
    const activeWalkIns = useMemo(() => {
        return filterCashierQueueForBusinessDay(queue, cashierBusinessDate).filter((customer) => {
            if (customer.status === 'no_show' || customer.status === 'cancelled') {
                return false;
            }
            if (customer.status === 'completed'
                && (customer.paid || customer.offlineSyncStatus === 'synced')) {
                return false;
            }
            return true;
        });
    }, [queue, cashierBusinessDate]);

    // Customers filtered by barber first
    const barberFilteredWalkIns = useMemo(() => (
        queueBarberFilter === 'all'
            ? activeWalkIns
            : activeWalkIns.filter((customer) => customer.barberId === queueBarberFilter)
    ), [activeWalkIns, queueBarberFilter]);

    const sourceCounts = useMemo(() => ({
        all: barberFilteredWalkIns.length,
        'walk-in': barberFilteredWalkIns.filter((customer) => !isReservationQueueEntry(customer)).length,
        reservation: barberFilteredWalkIns.filter(isReservationQueueEntry).length,
    }), [barberFilteredWalkIns]);

    // Live counts for status filter chips (scoped to selected barber filter)
    const statusCounts = useMemo(() => {
        let all = barberFilteredWalkIns.length;
        let serving = 0;
        let waiting = 0;
        let completed = 0;

        barberFilteredWalkIns.forEach((c) => {
            const st = (c.status || '').toLowerCase();
            if (['serving', 'in_service', 'in_chair'].includes(st)) serving++;
            else if (['completed', 'done'].includes(st)) completed++;
            else waiting++;
        });

        return { all, serving, waiting, completed };
    }, [barberFilteredWalkIns]);

    // Per-barber queue position numbering (#1, #2, #3...):
    // Each barber's queue is numbered sequentially in arrival order.
    // Customers waiting for the same barber are numbered based on that barber's line.
    const waitingQueuePositions = useMemo(() => {
        const positions = new Map<string, number>();
        const perBarberCount = new Map<string, number>();

        activeWalkIns.forEach((customer) => {
            const st = (customer.status || '').toLowerCase();
            // Count all active non-serving customers per barber
            if (['serving', 'in_service', 'in_chair', 'completed', 'done', 'no_show', 'cancelled'].includes(st)) return;

            const barberKey = String(customer.barberId || 'unassigned');
            const nextPos = (perBarberCount.get(barberKey) || 0) + 1;
            perBarberCount.set(barberKey, nextPos);
            positions.set(customer.id, nextPos);
        });

        return positions;
    }, [activeWalkIns]);

    // Visible walk-ins after applying barber filter, status chip, and customer search query
    const visibleWalkIns = useMemo(() => {
        const query = customerSearchQuery.trim().toLowerCase();

        return barberFilteredWalkIns.filter((customer) => {
            const st = (customer.status || '').toLowerCase();
            const isServing = ['serving', 'in_service', 'in_chair'].includes(st);
            const isCompleted = ['completed', 'done'].includes(st);
            const isWaiting = !isServing && !isCompleted;

            if (queueSourceFilter === 'walk-in' && isReservationQueueEntry(customer)) return false;
            if (queueSourceFilter === 'reservation' && !isReservationQueueEntry(customer)) return false;

            if (queueStatusFilter !== 'all') {
                if (queueStatusFilter === 'serving' && !isServing) return false;
                if (queueStatusFilter === 'waiting' && !isWaiting) return false;
                if (queueStatusFilter === 'completed' && !isCompleted) return false;
            }

            if (query) {
                const nameMatch = (customer.name || '').toLowerCase().includes(query);
                const barberMatch = getBarberName(customer.barberId).toLowerCase().includes(query);
                const serviceMatch = (customer.service || '').toLowerCase().includes(query);
                return nameMatch || barberMatch || serviceMatch;
            }

            return true;
        });
    }, [barberFilteredWalkIns, queueStatusFilter, queueSourceFilter, customerSearchQuery, getBarberName]);

    const estimatedCompletionByCustomer = useMemo(() => {
        const now = queueClock;
        const activeEntries = barberFilteredWalkIns.filter((customer) =>
            !['completed', 'no_show', 'cancelled'].includes(String(customer.status).toLowerCase()),
        );
      return calculateQueueCompletionEstimatesByBarber(activeEntries.map((customer) => {
        const barber = barbers.find((candidate) => candidate.id === customer.barberId);
        const preferredStart = reservationTimeToEpoch(customer.preferredDate, customer.preferredTime);
        return {
          id: customer.id,
          barber_id: customer.barberId,
          position: customer.position,
          status: customer.status,
          is_walk_in: customer.isWalkIn,
          duration_minutes: customer.estMinutes,
          scheduled_start_at: customer.scheduledStartAt
            ?? (preferredStart === null ? null : new Date(preferredStart).toISOString()),
          estimated_start_at: customer.estimatedStartAt,
          timer_started_at: customer.timerStartedAt,
          service_started_at: customer.serviceStartedAt,
          service_ends_at: customer.serviceEndsAt,
          barber_status: customer.barberStatus ?? barber?.status,
          barber_break_started_at: customer.barberBreakStartedAt ?? barber?.breakStartedAt,
        };
      }), now);
    }, [barberFilteredWalkIns, barbers, queueClock]);

    const serviceOptions = useMemo(() => {
        return services.map((service) => {
            const formattedTitle = formatServiceTitle(service.name);
            const dur = service.durationKnown && service.duration > 0 ? service.duration : DEFAULT_DURATION_MIN;
            const durText = formatDurationHuman(dur);

            return {
                value: service.id,
                label: `${formattedTitle} — ₱${service.price.toFixed(0)}`,
                shortLabel: formattedTitle,
                badge: {
                    text: durText,
                    variant: !service.durationKnown ? ('warning' as const) : ('gold' as const),
                },
                extraRight: `₱${service.price.toFixed(0)}`,
                description: !service.durationKnown ? 'Estimated duration missing — using default' : undefined,
            };
        });
    }, [services]);

    const barberOptions = useMemo(() => {
        return [
            {
                value: '',
                label: 'Any available barber (Auto-assign SECT)',
                shortLabel: 'Any available barber',
                badge: {
                    text: 'Auto SECT',
                    variant: 'gold' as const,
                },
                description: 'Auto-assigns barber with shortest estimated completion time',
            },
            ...barbers.map((barber) => {
                const isOff = Boolean(barber.isOffToday);
                const isOnBreak = ['on_break', 'break'].includes(String(barber.status || '').trim().toLowerCase().replace(/[\s-]+/g, '_'));
                const isServing = barber.status === 'serving' || activeWalkIns.some(
                    (c) => String(c.barberId) === String(barber.id) && ['serving', 'in_service', 'in_chair'].includes((c.status || '').toLowerCase())
                );
                const waitingCount = activeWalkIns.filter(
                    (c) => String(c.barberId) === String(barber.id) && !['serving', 'in_service', 'in_chair', 'completed', 'done', 'no_show', 'cancelled'].includes((c.status || '').toLowerCase())
                ).length;
                const badgeText = isOff
                    ? 'Off Duty'
                    : isOnBreak
                        ? 'On Break'
                    : isServing
                        ? (waitingCount > 0 ? `In Chair (${waitingCount} wait)` : 'In Chair')
                        : (waitingCount > 0 ? `Available (${waitingCount} wait)` : 'Available');
                const badgeVariant = isOff ? ('danger' as const) : isOnBreak ? ('warning' as const) : isServing ? ('gold' as const) : ('success' as const);

                return {
                    value: barber.id,
                    label: `${barber.name}${isOff ? ' (Off Duty)' : isOnBreak ? ' (On Break · will wait)' : isServing ? ' (In Chair)' : ' (Available)'}`,
                    shortLabel: barber.name,
                    colorDot: getBarberColor(barber.id),
                    badge: {
                        text: badgeText,
                        variant: badgeVariant,
                    },
                    disabled: isOff,
                };
            }),
        ];
    }, [barbers, activeWalkIns, getBarberColor]);

    const queueBarberFilterOptions = useMemo(() => [
        {
            value: 'all',
            label: 'All barbers',
            shortLabel: 'All barbers',
            badge: {
                text: `${activeWalkIns.length} in queue`,
                variant: 'neutral' as const,
            },
        },
        ...barbers.map((barber) => {
            const isOff = Boolean(barber.isOffToday);
            const isServing = barber.status === 'serving' || activeWalkIns.some(
                (c) => String(c.barberId) === String(barber.id) && ['serving', 'in_service', 'in_chair'].includes((c.status || '').toLowerCase())
            );
            const waitingCount = activeWalkIns.filter(
                (c) => String(c.barberId) === String(barber.id) && !['serving', 'in_service', 'in_chair', 'completed', 'done', 'no_show', 'cancelled'].includes((c.status || '').toLowerCase())
            ).length;

            const badgeText = isOff
                ? 'Off Duty'
                : isServing
                    ? (waitingCount > 0 ? `In Chair (${waitingCount} wait)` : 'In Chair')
                    : (waitingCount > 0 ? `Available (${waitingCount} wait)` : 'Available');

            const badgeVariant = isOff ? ('danger' as const) : isServing ? ('gold' as const) : ('success' as const);

            return {
                value: barber.id,
                label: `${barber.name}${isOff ? ' (Off Duty)' : isServing ? ' (In Chair)' : ' (Available)'}`,
                shortLabel: barber.name,
                colorDot: getBarberColor(barber.id),
                badge: {
                    text: badgeText,
                    variant: badgeVariant,
                },
            };
        }),
    ], [barbers, activeWalkIns, getBarberColor]);

    const serviceAndRetailOptions = useMemo(() => [
        ...serviceOptions.map((option) => ({ ...option, value: `service:${option.value}` })),
        ...retailProducts.map((product) => ({
            value: `product:${product.id}`,
            label: `${product.name} — ₱${product.price.toFixed(0)}`,
            shortLabel: product.name,
            badge: {
                text: 'Retail',
                variant: 'neutral' as const,
            },
            extraRight: `₱${product.price.toFixed(0)}`,
            description: product.stock !== undefined ? `${product.stock} in stock` : undefined,
        })),
    ], [retailProducts, serviceOptions]);

    const selectedOrderValue = selectedServiceId
        ? `service:${selectedServiceId}`
        : selectedRetailItems.length === 1
            ? `product:${selectedRetailItems[0].id}`
            : '';

    const handleOrderItemChange = (value: string) => {
        draftTouchedFieldsRef.current.add('serviceId');
        draftSubmissionCommittedRef.current = false;
        setFormTouched((prev) => ({ ...prev, service: true }));
        const [kind, id] = value.split(':');
        if (kind === 'service') {
            setSelectedServiceId(id || '');
            return;
        }
        if (kind === 'product' && id) {
            const product = retailProducts.find((item) => item.id === id);
            if (!product) return;
            setSelectedRetailItems((current) => {
                const existing = current.find((item) => item.id === id);
                return existing
                    ? current.map((item) => item.id === id ? { ...item, quantity: Number(item.quantity || 1) + 1 } : item)
                    : [...current, { ...product, quantity: 1 }];
            });
        }
    };

    const removeSelectedRetailItem = (productId: string) => {
        setSelectedRetailItems((current) => {
            const next = current.filter((item) => item.id !== productId);
            if (next.length === 0 && !selectedServiceId) {
                setFormTouched((prev) => ({ ...prev, service: true }));
            }
            return next;
        });
    };

    const retailSelectedKeys = useMemo(() => selectedRetailItems.map((item) => `product:${item.id}`), [selectedRetailItems]);

    const clearCashierDraft = (): Promise<void> => {
        draftSubmissionCommittedRef.current = true;
        draftTouchedFieldsRef.current.clear();
        setHasRestoredDraft(false);
        if (!offlineDraftKey) return Promise.resolve();
        const clearing = (async () => {
            try {
                const repository = await import('../services/cashier-offline.repository');
                await repository.deleteCashierDraft(offlineDraftKey);
            } catch (error) {
                console.warn('[POSTab] Failed to clear submitted cashier draft:', error);
            }
        })();
        draftClearPromiseRef.current = clearing;
        void clearing.then(() => {
            if (draftClearPromiseRef.current === clearing) draftClearPromiseRef.current = null;
        });
        return clearing;
    };

    const discardCashierDraft = async () => {
        await clearCashierDraft();
        setCustomerName('');
        setSelectedServiceId('');
        setSelectedRetailItems([]);
        setSelectedBarberId('');
        setFormTouched({});
        setFormSubmitted(false);
    };

    const commitOfflineWalkIn = async (
        name: string,
        serviceId: number,
        barberId: number | undefined,
        retailItems: Array<{ productId: number; quantity: number }>,
    ): Promise<CreateWalkInOrderResponse> => {
        if (retailItems.length > 0) {
            throw new Error('Retail add-ons cannot be added while offline. Remove them or reconnect and retry.');
        }
        if (!barberId) {
            throw new Error('Choose a barber before saving a walk-in offline. Auto-assignment needs a connection.');
        }
        if (!offlineDraftKey || !Number.isInteger(branchId) || branchId < 1 || !cashierId) {
            throw new Error('Cashier and branch scope is unavailable. Reconnect before adding this walk-in.');
        }
        const idempotencyKey = walkInRequest.current.idempotencyKey;
        if (!idempotencyKey) throw new Error('The walk-in retry key is unavailable. Please submit again.');

        const repository = await import('../services/cashier-offline.repository');
        const storage = await repository.initializeCashierOfflineStorage();
        if (!storage.available) {
            throw new Error('Offline checkout is unavailable because this browser cannot open local storage. Reconnect before accepting cash.');
        }
        const catalog = await repository.getCashierOfflineCatalog(offlineDraftKey);
        if (!catalog || Date.now() - catalog.capturedAt > repository.CASHIER_OFFLINE_CATALOG_MAX_AGE_MS) {
            throw new Error('The cached service and barber list is missing or too old. Reconnect to refresh it before adding a walk-in.');
        }
        if (catalog.branchId !== branchId || catalog.cashierId !== cashierId) {
            throw new Error('The cached catalog belongs to a different cashier session. Reconnect before adding this walk-in.');
        }

        const service = catalog.services.find((item) => Number(item.id) === serviceId);
        const barber = catalog.barbers.find((item) => Number(item.id) === barberId);
        if (!service || !service.priceKnown || !service.durationKnown || !Number.isFinite(service.price) || service.price < 0 || !Number.isFinite(service.duration) || service.duration <= 0) {
            throw new Error('This service is not available in the cached catalog. Reconnect or select another service.');
        }
        if (!barber) throw new Error('This barber is not available in the cached list. Reconnect or select another barber.');

        const now = Date.now();
        const localId = `local-${window.crypto.randomUUID?.() || `${now}-${Math.random().toString(36).slice(2, 10)}`}`;
        const operationPayload = {
            customerName: name,
            barberId,
            serviceIds: [serviceId],
            idempotencyKey,
            isPrePaid: false,
            _offlineDestination: '/api/cashier/walk-in',
        };
        const transaction = {
            localId,
            cloudId: null,
            scopeKey: offlineDraftKey,
            branchId,
            cashierId,
            customerName: name,
            barberId,
            barberName: barber.name,
            serviceIds: [serviceId],
            serviceSnapshot: [{ serviceId, name: service.name, price: service.price, durationMinutes: service.duration }],
            status: 'queued' as const,
            syncStatus: 'pending' as const,
            version: 1,
            createdAt: now,
            updatedAt: now,
            idempotencyKey,
        };
        const operation = {
            operationId: `${localId}:create`,
            localTransactionId: localId,
            branchId,
            cashierId,
            type: 'create' as const,
            payload: operationPayload,
            sequence: 1,
            idempotencyKey,
            status: 'pending' as const,
            retryCount: 0,
            lastError: null,
            nextRetryAt: null,
            version: 1,
            createdAt: now,
            updatedAt: now,
            syncedAt: null,
        };

        await repository.commitLocalWalkIn(transaction, operation);
        walkInRequest.current.commitLocally();
        window.dispatchEvent(new Event('cashier-offline-sync-requested'));
        addLocalOfflineQueueEntry({
            id: localId,
            isWalkIn: true,
            name,
            barberId: String(barberId),
            originalBarber: barber.name,
            originalBarberId: String(barberId),
            movedFrom: null,
            service: service.name,
            serviceIds: [serviceId],
            retailItems: [],
            estMinutes: service.duration,
            waitMin: 0,
            status: 'waiting',
            paid: false,
            createdAt: new Date(now).toISOString(),
            timerStartedAt: null,
            offlineSyncStatus: 'pending',
            offlineLocal: true,
        });
        return { id: localId, barberId, barberName: barber.name, status: 'waiting', offline: true };
    };

    const handleAddToQueue = async (e?: React.FormEvent, confirmedName?: string) => {
        e?.preventDefault();
        setFormSubmitted(true);
        const trimmedName = normalizeCustomerNameCase(sanitizeCustomerName(confirmedName ?? customerName));
        const hasName = Boolean(trimmedName);
        const hasItem = Boolean(selectedServiceId || selectedRetailItems.length > 0);

        if (!hasName || !hasItem) {
            setFormTouched((previous) => ({ ...previous, name: true, service: true }));
            return;
        }

        if (!confirmedName && isLikelyUnusualCustomerName(trimmedName)) {
            setNameConfirmation(trimmedName);
            return;
        }

        const serviceIdNum = Number(selectedServiceId);
        const retailPayload = selectedRetailItems.map((item) => ({ productId: Number(item.id), quantity: Number(item.quantity || 1) }));
        if (!Number.isSafeInteger(serviceIdNum) || serviceIdNum <= 0) {
            if (retailPayload.length === 0) {
                addToast({ type: 'error', title: 'Item Required', message: 'Please select a service or retail product.' });
                return;
            }
            setIsSubmitting(true);
            try {
                const response = await createRetailSale({
                    customerName: trimmedName,
                    items: retailPayload,
                    paymentMethod: 'Cash',
                    idempotencyKey: `cashier-retail-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
                });
                await clearCashierDraft();
                setFinalizedReceipt(response.data.receipt || null);
                setCustomerName('');
                setNameConfirmation(null);
                setSelectedRetailItems([]);
                setSelectedServiceId('');
                setSelectedBarberId('');
                setFormTouched({});
                setFormSubmitted(false);
                addToast({ type: 'success', title: 'Retail Sale Completed', message: `Transaction #${response.data.transactionId} recorded without a queue entry.` });
            } catch (error: any) {
                addToast({ type: 'error', title: 'Retail Sale Failed', message: error.response?.data?.error || 'Unable to complete retail sale.' });
            } finally {
                setIsSubmitting(false);
            }
            return;
        }

        const barberIdNum = selectedBarberId ? Number(selectedBarberId) : undefined;
        if (barberIdNum !== undefined && (!Number.isSafeInteger(barberIdNum) || barberIdNum <= 0)) {
            addToast({
                type: 'error',
                title: 'Invalid Barber',
                message: 'Please select a valid barber or auto-assign.',
            });
            return;
        }

        if (walkInRequest.current.pending) return;
        setIsSubmitting(true);
        try {
            let response: { data: CreateWalkInOrderResponse };
            let savedOffline = false;
            try {
                response = await walkInRequest.current.run({
                    customerName: trimmedName,
                    barberId: barberIdNum,
                    serviceIds: [serviceIdNum],
                    retailItems: retailPayload,
                    isPrePaid: false,
                });
            } catch (error) {
                if (!isCashierConnectivityFailure(error)) throw error;
                response = { data: await commitOfflineWalkIn(trimmedName, serviceIdNum, barberIdNum, retailPayload) };
                savedOffline = true;
            }

            // Check if SECT returned a tie that requires cashier resolution
            const tieData = (response.data as any)?.sectTie;
            if (tieData?.isTie && Array.isArray(tieData.tiedBarbers) && tieData.tiedBarbers.length > 1) {
                setTieModal({
                    isOpen: true,
                    tiedBarbers: tieData.tiedBarbers,
                    serviceIds: [serviceIdNum],
                    customerName: trimmedName,
                    retailItems: retailPayload,
                });
                return;
            }

            void clearCashierDraft();
            const assignedBarberIdStr = String((response.data as any)?.barberId ?? barberIdNum ?? '');
            const assignedBarberName =
                (response.data as any)?.barberName ||
                (assignedBarberIdStr ? barbers.find((b) => String(b.id) === assignedBarberIdStr)?.name : '') ||
                (selectedBarberId ? barbers.find((b) => String(b.id) === selectedBarberId)?.name : '');

            // Immediately reflect newly created customer in the queue table
            const createdData = response.data as any;
            if (createdData?.id && !savedOffline) {
                const matchedService = services.find((s) => String(s.id) === String(serviceIdNum));
                addOptimisticQueueEntry({
                    id: String(createdData.id),
                    isWalkIn: true,
                    name: trimmedName,
                    barberId: assignedBarberIdStr,
                    originalBarber: assignedBarberName || 'Barber',
                    originalBarberId: assignedBarberIdStr,
                    movedFrom: null,
                    service: matchedService?.name || 'Classic Cut',
                    serviceIds: [serviceIdNum],
                    retailItems: [],
                    estMinutes: matchedService?.duration || Number(createdData.durationMinutes) || 30,
                    waitMin: 0,
                    status: createdData.status || 'waiting',
                    paid: false,
                    guestReference: createdData.guestReference ?? null,
                    createdAt: new Date().toISOString(),
                    timerStartedAt: createdData.timerStartedAt ?? null,
                });
            }

            // Reset form
            setCustomerName('');
            setNameConfirmation(null);
            setSelectedServiceId('');
            setSelectedRetailItems([]);
            setSelectedBarberId('');
            setFormTouched({});
            setFormSubmitted(false);
            setFormTouched({});
            setFormSubmitted(false);

            addToast({
                type: savedOffline ? 'warning' : 'success',
                title: savedOffline ? 'Walk-in Saved Offline' : 'Customer Added',
                message: savedOffline
                    ? `${trimmedName} is stored locally for ${assignedBarberName || 'the selected barber'} and is pending sync. Queue position is not confirmed.`
                    : assignedBarberName
                        ? `${trimmedName} is now in the queue for ${assignedBarberName}.`
                        : `${trimmedName} is now in the queue.`,
            });

            if (!savedOffline) void refetch();
        } catch (error: any) {
            const message = error.message || error.response?.data?.error || error.response?.data?.message || 'Failed to add customer to queue.';
            addToast({
                type: 'error',
                title: 'Cannot Add to Queue',
                message,
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    // Handle tied barber selection
    const handleSelectTiedBarber = async (barber: any) => {
        if (walkInRequest.current.pending) return;
        const barberId = Number(barber.barberId ?? barber.id);
        const { serviceIds, customerName: tiedName, retailItems } = tieModal;
        setTieModal(prev => ({ ...prev, isOpen: false }));

        setIsSubmitting(true);
        try {
            const response = await walkInRequest.current.run({
                customerName: tiedName,
                barberId,
                serviceIds,
                retailItems,
                isPrePaid: false,
            });

            const createdData = response.data as any;
            if (createdData?.id) {
                const matchedService = services.find((s) => s.id === String(serviceIds[0]));
                addOptimisticQueueEntry({
                    id: String(createdData.id),
                    isWalkIn: true,
                    name: tiedName,
                    barberId: String(barberId),
                    originalBarber: barber.name,
                    originalBarberId: String(barberId),
                    movedFrom: null,
                    service: matchedService?.name || 'Classic Cut',
                    serviceIds,
                    retailItems: [],
                    estMinutes: matchedService?.duration || Number(createdData.durationMinutes) || 30,
                    waitMin: 0,
                    status: createdData.status || 'waiting',
                    paid: false,
                    guestReference: createdData.guestReference ?? null,
                    createdAt: new Date().toISOString(),
                    timerStartedAt: createdData.timerStartedAt ?? null,
                });
            }

            setCustomerName('');
            setSelectedServiceId('');
            setSelectedRetailItems([]);
            setSelectedBarberId('');
            setFormTouched({});
            setFormSubmitted(false);

            addToast({
                type: 'success',
                title: 'Customer Added',
                message: `${tiedName} is now in the queue for ${barber.name}.`,
            });

            void refetch();
        } catch (error: any) {
            addToast({
                type: 'error',
                title: 'Error',
                message: error.response?.data?.error || 'Failed to add customer to queue.',
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    // Walk-ins are removed; reserved queue entries are marked as no-shows.
    const handleConfirmRemove = async () => {
        if (!removeTarget) return;
        const isReservation = isReservationQueueEntry(removeTarget);
        if (isReservation && !canMarkReservationNoShow(removeTarget)) {
            addToast({
                type: 'info',
                title: 'No Show Unavailable',
                message: 'Only reservations that have not started can be marked as No Show.',
            });
            setRemoveTarget(null);
            return;
        }
        const scheduledAt = reservationTimeToEpoch(removeTarget.preferredDate, removeTarget.preferredTime);
        if (isReservation && scheduledAt !== null && Date.now() < scheduledAt) {
            const scheduledLabel = formatScheduledTime12Hour(removeTarget.preferredTime);
            addToast({
                type: 'info',
                title: 'No Show Locked',
                message: `This reservation can be marked No Show at its scheduled time (${scheduledLabel}).`,
            });
            return;
        }
        setIsRemoving(true);
        try {
            if (isReservation) {
                const rollback = patchQueueEntry(removeTarget.id, { status: 'no_show' });
                try {
                    await markQueueNoShow(removeTarget.id);
                } catch (error) {
                    rollback();
                    throw error;
                }
                addToast({ type: 'success', title: 'No Show', message: `${removeTarget.name || 'Reservation'} marked as No Show.` });
            } else {
                await cancelQueueEntry(removeTarget.id);
                addToast({
                    type: 'success',
                    title: 'Customer Removed',
                    message: `${removeTarget.name || 'Customer'} has been removed from the queue.`,
                });
            }
            setRemoveTarget(null);
            void refetch();
        } catch (err: any) {
            addToast({
                type: 'error',
                title: 'Error Removing Customer',
                message: err.response?.data?.error || 'Failed to remove customer from queue.',
            });
        } finally {
            setIsRemoving(false);
        }
    };

    const hasEditChanges = useMemo(() => {
        if (!editTarget) return false;
        return !areSelectionItemsEqual(originalEditItems, editItems);
    }, [editTarget, originalEditItems, editItems]);

    const originalEditItemKeys = useMemo(() => {
        return originalEditItems.map((item) => `${item.kind}:${item.id}`);
    }, [originalEditItems]);

    const editedServiceDuration = useMemo(() => editItems
        .filter((item) => item.kind === 'service')
        .reduce((total, item) => total + (Number(item.duration) || 30), 0) || 30, [editItems]);

    const currentServiceDuration = Math.max(0, Number(editTarget?.estMinutes) || 30);
    const isWalkInServiceExtension = editTarget
        ? editTarget.status !== 'completed' && requiresReservationImpactPreview(editTarget, currentServiceDuration, editedServiceDuration)
        : false;

    const closeEditModal = useCallback(() => {
        repairingPaymentTargetRef.current = null;
        setEditTarget(null);
        setEditItems([]);
        setOriginalEditItems([]);
        setShowDiscardConfirm(false);
        setShowReservationImpactPreview(false);
        setReservationImpactPreview(null);
        setReservationImpactPreviewError(null);
    }, []);

    const handleAttemptCloseEdit = useCallback(() => {
        if (isSavingEdit) return;
        if (hasEditChanges) {
            setShowDiscardConfirm(true);
        } else {
            closeEditModal();
        }
    }, [hasEditChanges, isSavingEdit, closeEditModal]);

    const openEditOrder = (customer: CustomerInfo) => {
        const serviceIds = customer.serviceIds?.length ? customer.serviceIds : [];
        const initialServices: SelectionItem[] = serviceIds.map((id, index) => {
            const catalogService = services.find((s) => String(s.id) === String(id));
            return {
                id: String(id),
                name: catalogService?.name || (index === 0 ? customer.service : `Service ${id}`),
                price: catalogService?.price || 0,
                type: 'Service',
                kind: 'service',
                duration: catalogService?.duration || 30,
            };
        });
        const initialRetail: SelectionItem[] = (customer.retailItems || []).map((item) => ({
            id: String(item.productId),
            name: item.name,
            price: item.unitPrice,
            type: 'Retail',
            kind: 'product',
            quantity: item.quantity,
        }));
        const initialList = [...initialServices, ...initialRetail];
        setEditTarget(customer);
        setEditItems(initialList);
        setOriginalEditItems(initialList);
        setShowDiscardConfirm(false);
        setShowReservationImpactPreview(false);
        setReservationImpactPreview(null);
        setReservationImpactPreviewError(null);
    };

    const toggleEditItem = (item: SelectionItem) => {
        if (repairingPaymentTargetRef.current && item.kind === 'product') {
            addToast({ type: 'info', title: 'Select Service', message: 'Choose the service that was performed to complete this bill.' });
            return;
        }
        setEditItems((current) => {
            const existing = current.find((selected) => selected.kind === item.kind && selected.id === item.id);
            if (!existing) return [...current, { ...item, quantity: item.kind === 'product' ? 1 : undefined }];
            if (item.kind === 'product' && (editTarget?.retailItems || []).some((line) => String(line.productId) === item.id)) {
                return current.map((selected) => selected === existing
                    ? { ...selected, quantity: Number(selected.quantity || 1) + 1 }
                    : selected);
            }
            return current.filter((selected) => selected !== existing);
        });
    };

    const saveEditedOrder = async (confirmReservationImpact = false) => {
        if (!editTarget) return;
        const serviceIds = editItems.filter((item) => item.kind === 'service').map((item) => Number(item.id));
        if (serviceIds.length === 0) {
            addToast({ type: 'error', title: 'Service Required', message: 'Keep at least one service in the order.' });
            return;
        }
        const updatePayload = {
            serviceIds,
            retailItems: editItems
                .filter((item) => item.kind === 'product')
                .map((item) => ({ productId: Number(item.id), quantity: Number(item.quantity || 1) })),
        };
        let requestingPreview = false;

        setIsSavingEdit(true);
        try {
            let reservationImpact: { previewFingerprint: string; confirmed: boolean } | undefined;
            if (isWalkInServiceExtension) {
                let preview = reservationImpactPreview;
                if (!confirmReservationImpact) {
                    requestingPreview = true;
                    const previewResponse = await fetchQueueOrderImpactPreview(editTarget.id, { serviceIds });
                    preview = parseReservationImpactPreview(previewResponse.data);
                    if (!preview) throw new Error('The server returned an invalid reservation impact preview.');

                    if (preview.impacts.length > 0) {
                        setReservationImpactPreview(preview);
                        setReservationImpactPreviewError(null);
                        setShowReservationImpactPreview(true);
                        return;
                    }
                    reservationImpact = { previewFingerprint: preview.previewFingerprint, confirmed: false };
                } else if (preview) {
                    reservationImpact = { previewFingerprint: preview.previewFingerprint, confirmed: true };
                } else {
                    // A confirmation is only valid for the preview the cashier has seen.
                    setReservationImpactPreviewError('Refresh the reservation impact preview before confirming this order change.');
                    setShowReservationImpactPreview(true);
                    return;
                }
            }

            await updateQueueOrder(editTarget.id, {
                ...updatePayload,
                ...(reservationImpact ? { reservationImpact } : {}),
            });
            addToast({ type: 'success', title: 'Order Updated', message: 'Customer queue order updated successfully.' });
            const repairedPaymentTarget = repairingPaymentTargetRef.current;
            closeEditModal();
            void refetch();
            if (repairedPaymentTarget) {
                preparePaymentModal(repairedPaymentTarget);
                await loadPaymentQuote(repairedPaymentTarget);
            }
        } catch (error: any) {
            const impactConflict = getReservationImpactConflict(error);
            if (impactConflict) {
                setReservationImpactPreview(impactConflict.preview);
                setReservationImpactPreviewError(impactConflict.type === 'ReservationImpactChanged'
                    ? 'The queue changed after the previous preview. Review the updated impact and confirm again.'
                    : 'The current queue now has a reservation impact. Review it and confirm the order update.');
                setShowReservationImpactPreview(true);
                return;
            }

            addToast({
                type: 'error',
                title: requestingPreview ? 'Reservation Preview Failed' : 'Order Update Failed',
                message: error.response?.data?.error || error.message || 'Unable to update this order.',
            });
        } finally {
            setIsSavingEdit(false);
        }
    };

    // Service Completion Confirmation & Handling
    const handleConfirmCompleteService = async () => {
        if (!customerToComplete) return;
        const target = customerToComplete;
        setIsCompletingService(true);
        try {
            setCustomerToComplete(null);
            await handleCompleteService(target, customSpecification);
            setCustomSpecification('');
        } finally {
            setIsCompletingService(false);
        }
    };

    const handleCompleteService = async (customer: CustomerInfo, specification = '') => {
        if (!canCompleteCashierService(customer.status, bypassTimeRestrictions)) return;
        let requestId = paymentQuoteRequestRef.current;
        await completeForPayment({
            id: customer.id,
            inFlight: completingQueueEntryIdsRef.current,
            pending: () => {
                preparePaymentModal(customer.id);
                completionPaymentTargetRef.current = customer;
                requestId = paymentQuoteRequestRef.current;
                return patchQueueEntry(customer.id, { status: 'completed' });
            },
            complete: () => completeQueueEntry(customer.id, specification.trim()
                ? { custom_specification: specification.trim().slice(0, 100) }
                : undefined),
            ready: async () => {
                // Refresh independently: its failure must not roll back a
                // completion that the server has already committed.
                void refetch();
                if (requestId !== paymentQuoteRequestRef.current || paymentTargetRef.current !== customer.id) return;
                if (customer.paid) {
                    try {
                        const response = await fetchQueueReceipt(customer.id);
                        if (requestId !== paymentQuoteRequestRef.current || paymentTargetRef.current !== customer.id) return;
                        closePaymentModal();
                        setFinalizedReceipt(response.data);
                    } catch (error: any) {
                        if (requestId !== paymentQuoteRequestRef.current || paymentTargetRef.current !== customer.id) return;
                        setPaymentQuoteLoading(false);
                        setPaymentQuoteError(error.response?.data?.error || 'Unable to load the finalized receipt. Retry to open it.');
                    }
                    return;
                }
                completionPaymentTargetRef.current = null;
                if (customer.paymentAttemptId && isOpenPaymentAttempt(customer.paymentAttemptStatus)) {
                    closePaymentModal();
                    void openPaymentAttemptReview(customer);
                } else {
                    void loadPaymentQuote(customer.id);
                }
                addToast({
                    type: 'success', title: 'Service Completed',
                    message: `Service for ${customer.name || 'Customer'} completed. Ready for payment.`,
                });
            },
            failed: (error: any) => {
                const message = error.response?.data?.error || 'Could not mark service as completed.';
                if (requestId === paymentQuoteRequestRef.current && paymentTargetRef.current === customer.id) {
                    setPaymentQuoteLoading(false);
                    setPaymentQuoteError(`${message} Retry to complete the service and prepare payment.`);
                }
                addToast({ type: 'error', title: 'Completion Failed', message });
            },
        });
    };

    // Payment Modal Preparation & Submission
    const preparePaymentModal = useCallback((id: string) => {
        setPaymentServicesMissing(false);
        paymentQuoteRequestRef.current += 1;
        paymentTargetRef.current = id;
        setPaymentTargetId(id);
        setPaymentQuote(null);
        setPaymentQuoteError(null);
        setPaymentIdempotencyKey(`queue-pay-${id}-${Date.now()}`);
        setPaymentModalOpen(true);
        setPaymentQuoteLoading(true);
    }, []);

    const closePaymentModal = useCallback(() => {
        setPaymentServicesMissing(false);
        completionPaymentTargetRef.current = null;
        paymentQuoteRequestRef.current += 1;
        paymentTargetRef.current = null;
        setPaymentModalOpen(false);
        setPaymentTargetId(null);
        setPaymentQuote(null);
        setPaymentQuoteLoading(false);
        setPaymentQuoteError(null);
        setPaymentIdempotencyKey(null);
    }, []);

    const loadPaymentQuote = useCallback(async (id: string) => {
        const requestId = ++paymentQuoteRequestRef.current;
        setPaymentQuoteLoading(true);
        setPaymentQuoteError(null);
        setPaymentServicesMissing(false);
        try {
            const response = await requestQueuePaymentQuote(id);
            if (requestId !== paymentQuoteRequestRef.current || paymentTargetRef.current !== id) return;
            setPaymentQuote(response.data as PaymentQuote);
            setPaymentQuoteError(null);
        } catch (error: any) {
            if (requestId !== paymentQuoteRequestRef.current || paymentTargetRef.current !== id) return;
            const data = error.response?.data;
            const missingServices = data?.code === 'MISSING_BILLABLE_ITEMS';
            setPaymentServicesMissing(missingServices);
            if (/already been paid|already paid/i.test(data?.error || '')) {
                closePaymentModal();
                addToast({ type: 'info', title: 'Payment Already Completed', message: 'This customer is already marked as paid.' });
                void refetch();
                return;
            }
            const hasOpenAttempt = error.response?.status === 409 && data?.paymentAttemptId;
            setPaymentQuote(null);
            setPaymentQuoteError(
                hasOpenAttempt
                    ? 'A payment receipt is already being processed. Close this window and review the existing payment attempt.'
                    : missingServices
                    ? 'Select the service that was performed before collecting payment.'
                    : data?.error || 'Unable to prepare payment balance.',
            );
            if (hasOpenAttempt) {
                patchQueueEntry(id, {
                    paymentAttemptId: Number(data.paymentAttemptId),
                    paymentAttemptStatus: data.paymentAttemptStatus as PaymentAttemptStatus,
                });
            }
        } finally {
            if (requestId === paymentQuoteRequestRef.current && paymentTargetRef.current === id) {
                setPaymentQuoteLoading(false);
            }
        }
    }, [addToast, closePaymentModal, patchQueueEntry, refetch]);

    const openPaymentModal = useCallback((id: string) => {
        if (queue.find(customer => customer.id === id || customer.cloudId === id)?.paid) {
            addToast({ type: 'info', title: 'Payment Already Completed', message: 'This customer is already marked as paid.' });
            void refetch();
            return;
        }
        preparePaymentModal(id);
        void loadPaymentQuote(id);
    }, [addToast, loadPaymentQuote, preparePaymentModal, queue, refetch]);

    const hasPendingLocalJournalOperations = async (localTransactionId: string): Promise<boolean> => {
        const repository = await import('../services/cashier-offline.repository');
        const operations = await repository.listCashierOutbox(branchId, cashierId);
        return operations.some((operation) => operation.localTransactionId === localTransactionId
            && ['pending', 'retryable', 'sending'].includes(operation.status));
    };

    const openOfflineWalkInEdit = async (customer: CustomerInfo) => {
        if (!offlineDraftKey) return;
        if (getCashierConnectivityStatus() === 'online' && !await hasPendingLocalJournalOperations(customer.id)) {
            addToast({ type: 'warning', title: 'Wait for Sync', message: 'Reconnect and sync this walk-in before making an offline edit.' });
            return;
        }
        try {
            const repository = await import('../services/cashier-offline.repository');
            const transaction = (await repository.listLocalWalkIns(offlineDraftKey))
                .find((item) => item.localId === customer.id);
            if (!transaction || transaction.branchId !== branchId || transaction.cashierId !== cashierId) {
                throw new Error('This walk-in is not available in the active cashier scope.');
            }
            if (transaction.syncStatus === 'conflict' || transaction.syncStatus === 'failed') {
                throw new Error('Resolve the existing sync issue before editing this walk-in.');
            }
            const canEditService = transaction.status === 'queued' && transaction.paymentStatus !== 'paid';
            const canEditBarber = transaction.paymentStatus === 'paid'
                ? transaction.status === 'completed'
                : transaction.status === 'queued';
            if (!canEditService && !canEditBarber) {
                throw new Error('This walk-in can no longer be edited offline.');
            }
            setOfflineEditTarget(transaction);
        } catch (error) {
            addToast({
                type: 'error',
                title: 'Offline Edit Unavailable',
                message: error instanceof Error ? error.message : 'Could not load the local walk-in.',
            });
        }
    };

    const saveOfflineWalkInEdit = async (changes: {
        serviceIds?: number[];
        serviceSnapshot?: Array<{ serviceId: number; name: string; price: number; durationMinutes: number }>;
        barberId?: number;
        barberName?: string;
    }) => {
        if (!offlineEditTarget || !offlineDraftKey) throw new Error('No local walk-in is selected.');
        if (getCashierConnectivityStatus() === 'online' && !await hasPendingLocalJournalOperations(offlineEditTarget.localId)) {
            throw new Error('Reconnect and sync this walk-in before making an offline edit.');
        }
        if (usableOfflineCatalogScopeKey !== offlineDraftKey && offlineEditCatalog?.scopeKey !== offlineDraftKey) {
            throw new Error('The cached service and barber list is stale or unavailable. Reconnect to refresh it.');
        }
        setIsSavingOfflineEdit(true);
        try {
            const repository = await import('../services/cashier-offline.repository');
            const updated = await repository.editLocalWalkIn(
                offlineEditTarget.localId,
                branchId,
                cashierId,
                changes,
            );
            addLocalOfflineQueueEntry(mapLocalWalkInToQueueEntry(updated));
            setOfflineEditTarget(null);
            window.dispatchEvent(new Event('cashier-offline-sync-requested'));
            addToast({
                type: 'success',
                title: 'Walk-in Updated Locally',
                message: `${updated.customerName || 'Customer'}’s changes are saved and will sync in order.`,
            });
        } finally {
            setIsSavingOfflineEdit(false);
        }
    };

    const handleOfflineServiceTransition = async (
        customer: CustomerInfo,
        nextStatus: 'in_service' | 'completed' | 'cancelled',
    ) => {
        if (nextStatus === 'cancelled'
            && !window.confirm(`Cancel ${customer.name || 'this local walk-in'}? This will not capture cash.`)) return;
        if (!offlineDraftKey || (getCashierConnectivityStatus() === 'online'
            && !await hasPendingLocalJournalOperations(customer.id))) {
            addToast({ type: 'warning', title: 'Wait for Sync', message: 'This walk-in is waiting to sync. Offline service actions are available while disconnected.' });
            return;
        }
        try {
            const repository = await import('../services/cashier-offline.repository');
            const transaction = await repository.transitionLocalWalkInStatus(
                customer.id,
                branchId,
                cashierId,
                nextStatus,
            );
            window.dispatchEvent(new Event('cashier-offline-sync-requested'));
            addLocalOfflineQueueEntry(mapLocalWalkInToQueueEntry(transaction));
            addToast({
                type: 'success',
                title: nextStatus === 'in_service'
                    ? 'Service Started Offline'
                    : nextStatus === 'completed'
                        ? 'Service Completed Offline'
                        : 'Walk-in Cancelled Offline',
                message: `${customer.name || 'Customer'} is saved locally. The action will sync when the connection returns.`,
            });
        } catch (error) {
            addToast({
                type: 'error',
                title: 'Offline Service Update Failed',
                message: error instanceof Error ? error.message : 'Could not save the service status locally.',
            });
        }
    };

    const openOfflineCashPayment = async (customer: CustomerInfo) => {
        if (!offlineDraftKey) return;
        if (getCashierConnectivityStatus() === 'online' && !await hasPendingLocalJournalOperations(customer.id)) {
            addToast({ type: 'warning', title: 'Wait for Sync', message: 'Reconnect and sync this walk-in before collecting offline cash.' });
            return;
        }
        try {
            const repository = await import('../services/cashier-offline.repository');
            const transaction = (await repository.listLocalWalkIns(offlineDraftKey))
                .find((item) => item.localId === customer.id);
            if (!transaction || transaction.status !== 'completed' || transaction.paymentStatus === 'paid') {
                throw new Error('Only a completed, unpaid local walk-in can be paid offline.');
            }
            setOfflinePaymentTarget(transaction);
        } catch (error) {
            addToast({
                type: 'error',
                title: 'Offline Cash Unavailable',
                message: error instanceof Error ? error.message : 'Could not load the local service total.',
            });
        }
    };

    const saveOfflineCashPayment = async (tenderedAmount: number) => {
        if (!offlinePaymentTarget || !offlineDraftKey || (getCashierConnectivityStatus() === 'online'
            && !await hasPendingLocalJournalOperations(offlinePaymentTarget.localId))) {
            throw new Error('Cash capture is available only for this cashier’s disconnected local walk-in.');
        }
        const transaction = offlinePaymentTarget;
        const amountDue = transaction.serviceSnapshot.reduce((total, service) =>
            total + Math.round(service.price * 100), 0) / 100;
        const cash = normalizeLocalCashCapture(amountDue, tenderedAmount);
        const now = Date.now();
        const localIdempotencyKey = `cash-${transaction.idempotencyKey}`;
        const localReceiptReference = transaction.localId.replace(/[^a-z0-9]/gi, '').slice(-8).toUpperCase();
        const receiptNumber = `MCH - ${localReceiptReference}`;
        const receiptSnapshot: OfflineReceiptSnapshotInput & { provisional: true } = {
            receiptNumber,
            issuedAt: now,
            branchId: transaction.branchId,
            cashierId: transaction.cashierId,
            cashierName: user?.username || null,
            sellerInvoiceProfile: offlineReceiptProfile,
            customerName: transaction.customerName,
            barberName: transaction.barberName || 'Barber',
            lines: transaction.serviceSnapshot.map((service) => ({ name: service.name, amount: service.price })),
            amount: cash.amount,
            tenderedAmount: cash.tenderedAmount,
            changeAmount: cash.changeAmount,
            provisional: true,
        };
        const repository = await import('../services/cashier-offline.repository');
        const existingOperations = await repository.listCashierOutbox(branchId, cashierId);
        const sequence = existingOperations
            .filter((operation) => operation.localTransactionId === transaction.localId)
            .reduce((max, operation) => Math.max(max, operation.sequence), 0) + 1;
        const payment = {
            localId: `payment:${transaction.localId}`,
            cloudId: null,
            localTransactionId: transaction.localId,
            branchId,
            version: 1,
            method: 'cash' as const,
            ...cash,
            status: 'pending_sync' as const,
            cashierId,
            createdAt: now,
            updatedAt: now,
            idempotencyKey: localIdempotencyKey,
        };
        const receipt = {
            localId: `receipt:${transaction.localId}`,
            cloudId: null,
            localTransactionId: transaction.localId,
            branchId,
            cashierId,
            receiptNumber,
            snapshot: { ...receiptSnapshot } as Readonly<Record<string, unknown>>,
            status: 'ready' as const,
            version: 1,
            printAttemptCount: 0,
            printHistory: [],
            lastPrintError: null,
            cloudReceiptId: null,
            cloudReceiptNumber: null,
            syncStatus: 'pending' as const,
            createdAt: now,
            updatedAt: now,
            idempotencyKey: localIdempotencyKey,
        };
        const operation = {
            operationId: `${transaction.localId}:capture_cash`,
            localTransactionId: transaction.localId,
            branchId,
            cashierId,
            type: 'capture_cash' as const,
            payload: { payment, receiptSnapshot },
            sequence,
            idempotencyKey: localIdempotencyKey,
            status: 'pending' as const,
            retryCount: 0,
            lastError: null,
            nextRetryAt: null,
            version: 1,
            createdAt: now,
            updatedAt: now,
            syncedAt: null,
        };
        await repository.captureLocalCashPayment({ payment, receipt, operation });
        window.dispatchEvent(new Event('cashier-offline-sync-requested'));
        const savedReceipt = await repository.getLocalCashierReceipt(transaction.localId);
        if (!savedReceipt) throw new Error('Cash was saved, but the local receipt could not be reopened.');
        addLocalOfflineQueueEntry({
            ...(queue.find((customer) => customer.id === transaction.localId) || {
                id: transaction.localId,
                name: transaction.customerName,
                barberId: String(transaction.barberId ?? ''),
                originalBarberId: String(transaction.barberId ?? ''),
                movedFrom: null,
                service: transaction.serviceSnapshot.map((service) => service.name).join(', '),
                estMinutes: transaction.serviceSnapshot.reduce((total, service) => total + service.durationMinutes, 0),
                waitMin: 0,
                status: 'completed',
                paid: true,
                offlineSyncStatus: 'pending',
            }),
            status: 'completed',
            paid: true,
            offlineLocal: true,
        });
        setOfflinePaymentTarget(null);
        setLocalReceiptId(savedReceipt.localId);
        setLocalReceiptPrintAttemptCount(savedReceipt.printAttemptCount);
        setLocalReceiptSnapshot(savedReceipt.snapshot as unknown as OfflineReceiptSnapshotInput);
        setLocalReceiptPrintStatus(savedReceipt.status);
        setLocalReceiptPrintError(savedReceipt.lastPrintError);
        setFinalizedReceipt({
            receiptNumber: savedReceipt.receiptNumber,
            html: renderOfflineReceiptHtml(savedReceipt.snapshot as unknown as OfflineReceiptSnapshotInput),
        } as ReceiptResponse);
        window.dispatchEvent(new Event('cashier-offline-sync-requested'));
        addToast({
            type: 'warning',
            title: 'Offline Cash Saved',
            message: 'Payment and provisional receipt are stored on this device and await server sync.',
        });
    };

    const openOfflineReceipt = async (customer: CustomerInfo) => {
        if (!offlineDraftKey) return;
        try {
            const repository = await import('../services/cashier-offline.repository');
            const localReceipt = await repository.getLocalCashierReceipt(customer.id);
            if (!localReceipt) throw new Error('No locally saved receipt was found for this walk-in.');
            setLocalReceiptId(localReceipt.localId);
            setLocalReceiptPrintAttemptCount(localReceipt.printAttemptCount);
            setLocalReceiptSnapshot(localReceipt.snapshot as unknown as OfflineReceiptSnapshotInput);
            setLocalReceiptPrintStatus(localReceipt.status);
            setLocalReceiptPrintError(localReceipt.lastPrintError);
            setFinalizedReceipt({
                receiptNumber: localReceipt.receiptNumber,
                html: renderOfflineReceiptHtml(localReceipt.snapshot as unknown as OfflineReceiptSnapshotInput),
            } as ReceiptResponse);
        } catch (error) {
            addToast({
                type: 'error',
                title: 'Receipt Unavailable',
                message: error instanceof Error ? error.message : 'Could not open the local receipt.',
            });
        }
    };

    const submitPayment = useCallback(async (payment: {
        method: string;
        amount: number;
        cashReceivedAmount?: number;
        paymentMethodId?: string;
        gcashReference?: string;
        referenceNumber?: string;
        receipt?: File;
        cashierConfirmed?: boolean;
    }) => {
        if (!paymentQuote) return;
        const form = new FormData();
        form.append('method', payment.method);
        form.append('amount', payment.amount.toFixed(2));
        if (payment.cashReceivedAmount !== undefined) {
            form.append('cashReceivedAmount', String(payment.cashReceivedAmount));
        }
        form.append('idempotencyKey', paymentIdempotencyKey || `queue-pay-${paymentQuote.queueId}`);
        if (payment.paymentMethodId) {
            form.append('paymentMethodId', payment.paymentMethodId);
        }
        const isDigital = payment.method.toLowerCase() !== 'cash';
        const digitalRef = payment.gcashReference || payment.referenceNumber;
        if (isDigital && digitalRef) {
            form.append('gcashReference', digitalRef);
            form.append('referenceNumber', digitalRef);
            form.append('merchantIdentity', paymentQuote.gcashMerchantName || 'DEMOSHOP');
            form.append('transactionDate', paymentQuote.businessDate || new Date().toISOString().slice(0, 10));
        }
        if (payment.receipt) form.append('receipt', payment.receipt);
        if (isDigital) form.append('cashierConfirmed', String(payment.cashierConfirmed === true));

        try {
            const response = await submitQueuePayment(paymentQuote.queueId, form);
            const attempt = response.data?.attempt;
            const finalResponseData = isDigital && response.data?.pendingVerification && attempt?.payment_attempt_id
                ? (await reconcilePaymentAttempt(attempt.payment_attempt_id, {
                    decision: 'confirm',
                    reason: `Cashier verified the ${payment.method} receipt before recording payment.`,
                })).data
                : response.data;
            const pendingVerification = finalResponseData?.pendingVerification === true;
            const receipt = finalResponseData?.receipt as ReceiptResponse | null | undefined;
            const finalAttempt = finalResponseData?.attempt;
            if (!pendingVerification && finalAttempt?.status !== 'manually_confirmed') {
                throw new Error('The server has not finalized this payment. Your entered payment details have been kept.');
            }
            if (pendingVerification && finalAttempt?.payment_attempt_id) {
                patchQueueEntry(String(paymentQuote.queueId), {
                    paymentAttemptId: Number(finalAttempt.payment_attempt_id),
                    paymentAttemptStatus: finalAttempt.status as PaymentAttemptStatus,
                });
            } else {
                patchQueueEntry(String(paymentQuote.queueId), {
                    paid: true,
                    paymentAttemptId: undefined,
                    paymentAttemptStatus: undefined,
                });
            }
            closePaymentModal();
            if (receipt?.html) setFinalizedReceipt(receipt);
            addToast({
                type: pendingVerification ? 'warning' : 'success',
                title: pendingVerification ? 'Receipt Pending' : 'Payment Confirmed',
                message: pendingVerification
                    ? 'Receipt could not be confirmed automatically. Please review it.'
                    : 'Payment recorded and confirmed.',
            });
            void refetch();
        } catch (error: any) {
            setPaymentIdempotencyKey(newIdempotencyKey());
            addToast({
                type: 'error',
                title: 'Payment Error',
                message: error.response?.data?.error || error.message || 'Payment submission failed.',
            });
        }
    }, [closePaymentModal, addToast, patchQueueEntry, paymentIdempotencyKey, paymentQuote, refetch]);

    // Payment Attempt Review Handlers
    const openPaymentAttemptReview = useCallback(async (customer: CustomerInfo) => {
        if (!customer.paymentAttemptId) return;
        setPaymentAttemptReviewTarget(customer);
        setPaymentAttemptReceiptUrl(null);
        setPaymentAttemptReviewError(null);
        setPaymentAttemptVerified(false);
        setPaymentAttemptReceiptLoading(true);
        try {
            const response = await getPaymentAttemptReceiptUrl(customer.paymentAttemptId);
            if (!response.data?.url) throw new Error('The saved receipt could not be opened.');
            setPaymentAttemptReceiptUrl(response.data.url);
        } catch (error: any) {
            setPaymentAttemptReviewError(error.response?.data?.error || 'Unable to load saved receipt.');
        } finally {
            setPaymentAttemptReceiptLoading(false);
        }
    }, []);

    const closePaymentAttemptReview = useCallback(() => {
        setPaymentAttemptReviewTarget(null);
        setPaymentAttemptReceiptUrl(null);
        setPaymentAttemptReviewError(null);
        setPaymentAttemptReceiptLoading(false);
        setPaymentAttemptVerified(false);
        setPaymentAttemptConfirming(false);
        setPaymentAttemptRejecting(false);
    }, []);

    const confirmPaymentAttempt = useCallback(async () => {
        if (!paymentAttemptReviewTarget?.paymentAttemptId || !paymentAttemptReceiptUrl || !paymentAttemptVerified) return;
        setPaymentAttemptConfirming(true);
        setPaymentAttemptReviewError(null);
        try {
            const response = await reconcilePaymentAttempt(paymentAttemptReviewTarget.paymentAttemptId, {
                decision: 'confirm',
                reason: 'Cashier verified GCash receipt before recording payment.',
            });
            const receipt = response.data?.receipt as ReceiptResponse | null | undefined;
            patchQueueEntry(paymentAttemptReviewTarget.id, {
                paid: true,
                paymentAttemptId: undefined,
                paymentAttemptStatus: undefined,
            });
            if (receipt?.html) setFinalizedReceipt(receipt);
            closePaymentAttemptReview();
            addToast({ type: 'success', title: 'Payment Confirmed', message: 'Customer marked as paid.' });
            void refetch();
        } catch (error: any) {
            setPaymentAttemptReviewError(error.response?.data?.error || 'Payment confirmation failed.');
        } finally {
            setPaymentAttemptConfirming(false);
        }
    }, [closePaymentAttemptReview, addToast, patchQueueEntry, paymentAttemptReceiptUrl, paymentAttemptReviewTarget, paymentAttemptVerified, refetch]);

    const rejectPaymentAttempt = useCallback(async () => {
        if (!paymentAttemptReviewTarget?.paymentAttemptId) return;
        setPaymentAttemptRejecting(true);
        setPaymentAttemptReviewError(null);
        try {
            await reconcilePaymentAttempt(paymentAttemptReviewTarget.paymentAttemptId, {
                decision: 'reject',
                reason: 'Cashier discarded payment attempt to collect anew.',
            });
            const customerId = paymentAttemptReviewTarget.id;
            patchQueueEntry(customerId, { paymentAttemptId: undefined, paymentAttemptStatus: undefined });
            closePaymentAttemptReview();
            addToast({ type: 'info', title: 'Payment Discarded', message: 'Collect payment anew.' });
            if (customerId) openPaymentModal(customerId);
        } catch (error: any) {
            setPaymentAttemptReviewError(error.response?.data?.error || 'Failed to discard payment attempt.');
        } finally {
            setPaymentAttemptRejecting(false);
        }
    }, [closePaymentAttemptReview, addToast, openPaymentModal, patchQueueEntry, paymentAttemptReviewTarget]);

    const saveInlineIdentity = async (customer: CustomerInfo, name: string, barberId: number) => {
        const nextName = name.trim();
        const nameChanged = nextName !== customer.name.trim();
        const barberChanged = String(barberId) !== String(customer.barberId);
        if (!nameChanged && !barberChanged) return;
        try {
            await updateQueueIdentity(customer.id, { customerName: nextName, barberId });
            addToast({ type: 'success', title: 'Queue Updated', message: 'Customer details updated.' });
            await refetch();
        } catch (error: any) {
            addToast({ type: 'error', title: 'Update Failed', message: error.response?.data?.error || 'Unable to update customer details.' });
        }
    };

    const renderLocalOfflineActions = (customer: CustomerInfo) => {
        const savedOffline = customer.offlineSyncStatus === 'synced'
            && getCashierConnectivityStatus() === 'offline';
        if (!customer.offlineLocal
            || (!['pending', 'retryable'].includes(customer.offlineSyncStatus || '') && !savedOffline)) return null;
        const canEditLocally = (customer.status === 'waiting' && !customer.paid)
            || (customer.status === 'completed' && customer.paid);
        return (
            <>
                <span className="text-[10px] text-amber-200/80">
                    {savedOffline ? 'Saved locally' : 'Offline · pending sync'}
                </span>
                {canEditLocally && (
                    <button type="button" onClick={() => void openOfflineWalkInEdit(customer)} className="rounded-sm border border-white/15 px-2 py-1 text-[10px] font-bold uppercase text-ivory hover:bg-white/5" title="Edit this offline walk-in">
                        Edit
                    </button>
                )}
                {customer.status === 'waiting' && !customer.paid && (
                    <button type="button" onClick={() => void handleOfflineServiceTransition(customer, 'cancelled')} className="rounded-sm border border-red-400/30 px-2 py-1 text-[10px] font-bold uppercase text-red-200 hover:bg-red-500/10" title="Cancel this offline walk-in">
                        Cancel
                    </button>
                )}
                {customer.status === 'waiting' && (
                    <button type="button" onClick={() => void handleOfflineServiceTransition(customer, 'in_service')} className="rounded-sm border border-gold/40 px-2 py-1 text-[10px] font-bold uppercase text-gold hover:bg-gold/10" title="Start this service offline">
                        Start
                    </button>
                )}
                {customer.status === 'serving' && (
                    <button type="button" onClick={() => void handleOfflineServiceTransition(customer, 'completed')} className="rounded-sm bg-gold px-2 py-1 text-[10px] font-bold uppercase text-charcoal hover:bg-gold-dim" title="Complete this service offline">
                        Complete
                    </button>
                )}
                {customer.status === 'completed' && !customer.paid && (
                    <button type="button" onClick={() => void openOfflineCashPayment(customer)} className="rounded-sm bg-gold px-2 py-1 text-[10px] font-bold uppercase text-charcoal hover:bg-gold-dim" title="Record cash payment offline">
                        Cash
                    </button>
                )}
                {customer.status === 'completed' && customer.paid && (
                    <button type="button" onClick={() => void openOfflineReceipt(customer)} className="rounded-sm border border-white/15 px-2 py-1 text-[10px] font-bold uppercase text-ivory hover:bg-white/5" title="Open or reprint provisional receipt">
                        Receipt
                    </button>
                )}
            </>
        );
    };

    const trimmedName = sanitizeCustomerName(customerName).trim();
    const hasSelectedOrderItem = Boolean(selectedServiceId || selectedRetailItems.length > 0);
    const isNameInvalid = (formTouched.name || formSubmitted) && !trimmedName;
    const isServiceInvalid = (formTouched.service || formSubmitted) && !selectedServiceId && selectedRetailItems.length === 0;
    const activeQueueEntryField = !trimmedName ? 'name' : !hasSelectedOrderItem ? 'service' : 'complete';
    const highlightQueuePrerequisites = () => {
        setFormTouched((previous) => ({
            ...previous,
            service: true,
            ...(!trimmedName ? { name: true } : {}),
        }));
    };

    return (
        <div className="space-y-6 text-ivory pb-20 md:pb-6">
            {/* Top Operations Header */}
            <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-4">
                <div>
                    <p className="text-[11px] uppercase tracking-[0.15em] text-ivory-dim">Floor Operations</p>
                    <h1 className="text-2xl font-serif font-bold text-ivory">Point of Sale</h1>
                </div>
                <div className="flex items-center gap-3 text-xs">
                    <div className="flex items-center gap-1.5 text-ivory-dim bg-white/[0.03] px-3 py-1.5 rounded-sm border border-white/10">
                        <Clock className="w-3.5 h-3.5 text-gold" />
                        <span>Walk-in Checkout & Queue Manager</span>
                    </div>
                </div>
            </header>

            {/* SECTION 1: Add to Queue or Retail Sale */}
            <section aria-labelledby="add-to-queue-heading" className="rounded-sm border border-white/10 bg-white/5 p-4 sm:p-5 card-gold-accent relative z-20">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/5 pb-3 mb-4">
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gold">
                            CASHIER • QUEUE ENTRY
                        </p>
                        <h2 id="add-to-queue-heading" className="text-lg sm:text-xl font-serif font-bold text-ivory mt-0.5">
                            Add to Queue
                        </h2>
                    </div>
                    <p className="text-xs text-ivory-dim">
                        Check in walk-in customers or assign directly to an available barber
                    </p>
                </div>

                <form onSubmit={handleAddToQueue} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.2fr_1.2fr_1fr_auto] gap-3.5 items-start">
                    {/* Customer Name */}
                    <div>
                        <p className="mb-1 h-3 text-[10px] font-bold leading-3 tracking-wide text-gold">{activeQueueEntryField === 'name' ? 'Fill this next' : ''}</p>
                        <div className="mb-1.5 flex items-center justify-between">
                            <label htmlFor="custName" className="block text-xs font-medium text-ivory-dim">
                                Customer Name <span className="text-red-400 font-semibold">*</span>
                            </label>
                            {draftStorageReady && (hasRestoredDraft || customerName || selectedServiceId || selectedBarberId) && (
                                <button type="button" onClick={() => void discardCashierDraft()} className="text-[11px] text-ivory-dim hover:text-gold cursor-pointer">
                                    Discard draft
                                </button>
                            )}
                        </div>
                        <input
                            type="text"
                            id="custName"
                            value={customerName}
                            onBlur={() => {
                                setFormTouched((prev) => ({ ...prev, name: true }));
                                setCustomerName((current) => normalizeCustomerNameCase(sanitizeCustomerName(current)));
                            }}
                            onChange={(e) => {
                                draftTouchedFieldsRef.current.add('customerName');
                                draftSubmissionCommittedRef.current = false;
                                setCustomerName(sanitizeCustomerName(e.target.value));
                            }}
                            onKeyDown={(e) => {
                                if (isInvalidCustomerNameKey(e.key, e.ctrlKey || e.metaKey)) {
                                    e.preventDefault();
                                }
                            }}
                            placeholder="Enter customer name"
                            className={`h-10 w-full bg-charcoal/80 border text-ivory px-3.5 py-2 rounded-sm text-sm outline-none transition-colors placeholder:text-ivory-dim/40 ${
                                isNameInvalid
                                    ? 'border-red-500/80 focus:border-red-500 focus:ring-1 focus:ring-red-500/50'
                                    : 'border-white/10 hover:border-white/20 focus:border-gold/60 focus:ring-1 focus:ring-gold/50'
                            }`}
                            autoComplete="off"
                        />
                        {isNameInvalid && (
                            <p role="alert" className="mt-1.5 text-[11px] text-red-400 flex items-center gap-1 font-medium">
                                <AlertCircle className="w-3 h-3 shrink-0" />
                                <span>Customer name is required</span>
                            </p>
                        )}
                    </div>

                    {/* Service & Retail */}
                    <div onFocusCapture={highlightQueuePrerequisites}>
                        <p className="mb-1 h-3 text-[10px] font-bold leading-3 tracking-wide text-gold">{activeQueueEntryField === 'service' ? 'Fill this next' : ''}</p>
                        <SearchableSelect
                            id="service"
                            label="Service & Retail"
                            labelClassName="block text-xs font-medium text-ivory-dim mb-1.5"
                            value={selectedOrderValue}
                            onChange={handleOrderItemChange}
                            disabled={servicesLoading}
                            placeholder={servicesLoading ? 'Loading services and products…' : 'Select a service or retail product'}
                            searchPlaceholder="Search services and products…"
                            emptyMessage="No matching services or products found"
                            buttonClassName={`h-10 w-full bg-charcoal/80 border text-ivory px-3.5 py-2 rounded-sm text-sm outline-none transition-colors ${
                                isServiceInvalid
                                    ? 'border-red-500/80 focus:border-red-500 focus:ring-1 focus:ring-red-500/50'
                                    : 'border-white/10 hover:border-white/20 focus:border-gold/60 focus:ring-1 focus:ring-gold/50'
                            }`}
                            options={serviceAndRetailOptions}
                        />
                        {isServiceInvalid && (
                            <p role="alert" className="mt-1.5 text-[11px] text-red-400 flex items-center gap-1 font-medium">
                                <AlertCircle className="w-3 h-3 shrink-0" />
                                <span>Please select a service or retail item</span>
                            </p>
                        )}
                        {catalogRecoveryMessage && (
                            <p role="status" className="mt-1.5 text-[11px] text-amber-200/90">
                                {catalogRecoveryMessage}
                            </p>
                        )}
                        {selectedRetailItems.length > 0 && (
                            <div className="mt-2 space-y-1">
                                {selectedRetailItems.map((item) => (
                                    <div key={item.id} className="flex items-center justify-between rounded-sm border border-emerald-500/20 bg-emerald-500/[0.06] px-2.5 py-1.5 text-[11px] text-ivory">
                                        <span>{item.name} × {item.quantity}</span>
                                        <button type="button" onClick={() => removeSelectedRetailItem(item.id)} className="text-ivory-dim hover:text-red-300 cursor-pointer" aria-label={`Remove ${item.name}`}>×</button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Barber */}
                    <div>
                        <p className="mb-1 h-3 text-[10px] font-bold leading-3 tracking-wide text-gold" aria-hidden="true">&nbsp;</p>
                        <SearchableSelect
                            id="barber"
                            label="Barber"
                            labelClassName="block text-xs font-medium text-ivory-dim mb-1.5"
                            value={selectedBarberId}
                            onChange={(value) => {
                                draftTouchedFieldsRef.current.add('barberId');
                                draftSubmissionCommittedRef.current = false;
                                setSelectedBarberId(value);
                            }}
                            placeholder="Any available barber (Auto-assign SECT)"
                            searchPlaceholder="Search barbers…"
                            emptyMessage="No matching barbers found"
                            buttonClassName="h-10 w-full bg-charcoal/80 border border-white/10 text-ivory px-3.5 py-2 rounded-sm text-sm outline-none hover:border-white/20 focus:border-gold/60 focus:ring-1 focus:ring-gold/50 transition-colors"
                            options={barberOptions}
                        />
                    </div>

                    {/* Submit Button & Missing Fields Helper */}
                    <div className="pt-0 sm:pt-9">
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="h-10 w-full sm:w-auto px-5 rounded-sm font-semibold tracking-wide text-xs uppercase bg-gold text-charcoal hover:bg-gold-dim transition-all cursor-pointer shadow-sm disabled:bg-white/10 disabled:text-ivory-dim/40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    <span>Adding…</span>
                                </>
                            ) : (
                                <>
                                    <UserPlus className="w-3.5 h-3.5" />
                                    <span>{selectedServiceId ? 'Add to Queue' : selectedRetailItems.length > 0 ? 'Complete Retail Sale' : 'Add to Queue'}</span>
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </section>

            {/* SECTION 2: Queue Table */}
            <section aria-labelledby="pos-queue-table-heading" className="rounded-sm border border-white/10 bg-white/5 p-4 sm:p-5 card-gold-accent flex flex-col min-h-[460px]">
                {/* Header with Title and Live Counter */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-4 mb-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gold">
                                {queueBarberFilter === 'all'
                                    ? 'CASHIER • WALK-IN'
                                    : `CASHIER • ${getBarberName(queueBarberFilter).toUpperCase()}'S QUEUE`}
                            </p>
                            <span
                                className={`relative inline-flex h-2 w-2 rounded-full ${
                                    queueDataStatus === 'online'
                                        ? 'bg-emerald-500'
                                        : queueDataStatus === 'cached' || queueDataStatus === 'stale'
                                            ? 'bg-amber-400'
                                            : 'bg-white/30'
                                }`}
                                title={queueFreshnessTitle}
                                aria-label={`Queue data ${queueFreshnessLabel.toLowerCase()}`}
                            />
                            <span className={`text-[9px] font-semibold uppercase tracking-wider ${
                                queueDataStatus === 'online' ? 'text-emerald-400'
                                    : queueDataStatus === 'cached' || queueDataStatus === 'stale' ? 'text-amber-300'
                                        : 'text-ivory/50'
                            }`}>
                                {queueFreshnessLabel}
                            </span>
                        </div>
                        <h2 id="pos-queue-table-heading" className="text-lg sm:text-xl font-serif font-bold text-ivory mt-0.5">
                            {queueBarberFilter === 'all'
                                ? 'Queue Table'
                                : `${getBarberName(queueBarberFilter)}'s Queue`}
                        </h2>
                    </div>

                    <div className="flex items-center gap-2">
                        <span role="status" aria-live="polite" className="inline-flex min-w-16 items-center justify-end gap-1 text-[10px] text-ivory-dim">
                            {queueRefreshing && queueDataStatus !== 'loading' && <><Loader2 className="h-3 w-3 motion-safe:animate-spin" aria-hidden="true" />Updating</>}
                        </span>
                        <div className="flex items-center gap-1.5 text-xs bg-charcoal/80 px-3 py-1.5 rounded-sm border border-white/10">
                            <Users className="w-3.5 h-3.5 text-gold" />
                            <span className="text-ivory-dim">In Queue:</span>
                            <span className="font-bold text-gold">{statusCounts.all}</span>
                            {visibleWalkIns.length !== statusCounts.all && (
                                <span className="text-ivory-dim font-normal text-[11px] ml-0.5">
                                    ({visibleWalkIns.length} shown)
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Cashier filters: search, status and source dropdowns, barber dropdown */}
                <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3 bg-charcoal/40 p-3 rounded-sm border border-white/5 mb-4">
                    <div className="flex flex-col sm:flex-row sm:items-end gap-3 flex-1 min-w-0">
                        {/* Customer Search */}
                        <div className="w-full sm:w-56 shrink-0">
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-ivory-dim mb-1">
                                Search Customer
                            </label>
                            <div className="relative">
                                <Search className="w-3.5 h-3.5 text-ivory-dim/60 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                <input
                                    type="text"
                                    value={customerSearchQuery}
                                    onChange={(e) => setCustomerSearchQuery(e.target.value)}
                                    placeholder="Search customer…"
                                    className="h-9 w-full bg-charcoal/80 border border-white/10 text-ivory pl-8 pr-7 py-1 rounded-sm text-xs outline-none hover:border-white/20 focus:border-gold/60 focus:ring-1 focus:ring-gold/50 transition-colors placeholder:text-ivory-dim/40"
                                />
                                {customerSearchQuery && (
                                    <button
                                        type="button"
                                        onClick={() => setCustomerSearchQuery('')}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-ivory-dim/60 hover:text-ivory transition-colors cursor-pointer"
                                        title="Clear search"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="grid w-full min-w-0 grid-cols-2 gap-2 sm:flex-1">
                            <SearchableSelect
                                id="queue-status-filter"
                                label="Status"
                                value={queueStatusFilter}
                                onChange={(value) => setQueueStatusFilter(value as typeof queueStatusFilter)}
                                searchPlaceholder="Search statuses…"
                                options={[
                                    { value: 'all', label: `All (${statusCounts.all})` },
                                    { value: 'serving', label: `Serving (${statusCounts.serving})` },
                                    { value: 'waiting', label: `Waiting (${statusCounts.waiting})` },
                                    { value: 'completed', label: `Done (${statusCounts.completed})` },
                                ]}
                                buttonClassName="h-9 w-full bg-charcoal/80 border border-white/10 hover:border-gold/40 text-ivory px-3 py-1 rounded-sm text-xs outline-none focus:border-gold/60 focus:ring-1 focus:ring-gold/40 transition-all cursor-pointer shadow-sm"
                            />
                            <SearchableSelect
                                id="queue-source-filter"
                                label="Type"
                                value={queueSourceFilter}
                                onChange={(value) => setQueueSourceFilter(value as typeof queueSourceFilter)}
                                searchPlaceholder="Search types…"
                                options={[
                                    { value: 'all', label: `All (${sourceCounts.all})` },
                                    { value: 'walk-in', label: `Walk-in (${sourceCounts['walk-in']})` },
                                    { value: 'reservation', label: `Reservation (${sourceCounts.reservation})` },
                                ]}
                                buttonClassName="h-9 w-full bg-charcoal/80 border border-white/10 hover:border-gold/40 text-ivory px-3 py-1 rounded-sm text-xs outline-none focus:border-gold/60 focus:ring-1 focus:ring-gold/40 transition-all cursor-pointer shadow-sm"
                            />
                        </div>
                    </div>

                    {/* Barber Filter Dropdown */}
                    <div className="w-full sm:w-56 md:w-60 shrink-0">
                        <label htmlFor="queue-barber-filter" className="block text-[10px] font-bold uppercase tracking-wider text-ivory mb-1">
                            Filter by Barber
                        </label>
                        <SearchableSelect
                            id="queue-barber-filter"
                            value={queueBarberFilter}
                            onChange={setQueueBarberFilter}
                            searchPlaceholder="Search barbers…"
                            emptyMessage="No barbers found"
                            buttonClassName="h-9 w-full bg-charcoal/80 border border-gold/30 hover:border-gold hover:bg-gold/[0.04] text-ivory px-3 py-1 rounded-sm text-xs outline-none focus:border-gold focus:ring-1 focus:ring-gold/40 transition-all cursor-pointer shadow-sm group"
                            options={queueBarberFilterOptions}
                            dropdownAlign="right"
                        />
                    </div>
                </div>

                {visibleWalkIns.length > 0 ? (
                    <>
                        {/* 1. MOBILE: Compact Stacked Records (< 768px) */}
                        <div className="block md:hidden space-y-3">
                            <AnimatePresence initial={false}>
                                {visibleWalkIns.map((customer) => {
                                    const normStatus = (customer.status || '').toLowerCase();
                                    const isServing = ['serving', 'in_service', 'in_chair'].includes(normStatus);
                                    const isDone = ['completed', 'done'].includes(normStatus);
                                    const checkInState = getReservationCheckInState(customer, queueClock);
                                    const isReviewNeeded = isOpenPaymentAttempt(customer.paymentAttemptStatus);
                                    const waitingPosition = !isServing && !isDone
                                        ? (waitingQueuePositions.get(customer.id) ?? 1)
                                        : undefined;
                                    const barberName = getBarberName(customer.barberId);
                                    const barberColor = getBarberColor(customer.barberId);
                                    const additionalServiceCount = Math.max((customer.serviceIds?.length || 1) - 1, 0);
                                    const retailItemCount = customer.retailItems?.length || 0;
                                    const hasOrderAdditions = additionalServiceCount > 0 || retailItemCount > 0;
                                    const timeIn = formatQueueTimeIn(customer);

                                    return (
                                        <motion.div
                                            layout={reduceMotion ? false : "position"}
                                            key={customer.id}
                                            initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, transition: { duration: reduceMotion ? 0 : 0.12 } }}
                                            transition={{ duration: reduceMotion ? 0 : 0.16 }}
                                            className={`rounded-sm border p-3.5 transition-colors card-gold-accent ${
                                            isServing
                                                ? 'bg-gold/[0.04]'
                                                : isDone
                                                ? 'border-white/10 bg-charcoal/40 opacity-80 hover:opacity-100'
                                                : 'border-white/10 bg-white/5'
                                        }`}
                                        style={{
                                            borderColor: isServing ? `${barberColor}60` : undefined,
                                        }}
                                    >
                                        {/* Top Header: Identity & Status */}
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex items-center gap-2 min-w-0">
                                                {isServing && (
                                                    <span
                                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider shrink-0"
                                                        style={{
                                                            color: barberColor,
                                                            borderColor: `${barberColor}60`,
                                                            backgroundColor: `${barberColor}18`,
                                                            borderWidth: '1px',
                                                            borderStyle: 'solid',
                                                        }}
                                                        title={`Currently being served by ${barberName}`}
                                                    >
                                                        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: barberColor }} />
                                                        NOW
                                                    </span>
                                                )}
                                                {waitingPosition !== undefined && (
                                                    <span
                                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono tracking-wide font-bold shrink-0"
                                                        style={{
                                                            color: barberColor,
                                                            borderColor: `${barberColor}55`,
                                                            backgroundColor: `${barberColor}14`,
                                                            borderWidth: '1px',
                                                            borderStyle: 'solid',
                                                        }}
                                                        title={`Queue #${waitingPosition} for ${barberName}`}
                                                    >
                                                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: barberColor }} />
                                                        #{waitingPosition}
                                                    </span>
                                                )}
                                                <h4 className="text-ivory font-bold text-sm truncate">
                                                    {customer.name || 'Walk-in customer'}
                                                </h4>
                                                {customer.offlineSyncStatus && <OfflinePendingBadge status={customer.offlineSyncStatus} error={customer.offlineSyncError} locallyCompleted={customer.offlineLocal && customer.status === 'completed'} />}
                                            </div>

                                            <div className="shrink-0">
                                                <QueueStatusPill status={customer.status} isReviewNeeded={isReviewNeeded} size="sm" />
                                            </div>
                                        </div>

                                        {/* Service & Barber Info */}
                                        <div className="mt-2.5 space-y-1.5 text-xs">
                                            <div className="font-medium text-ivory flex items-center justify-between gap-2">
                                                <span className="truncate">{formatServiceTitle(customer.service).replace(/\bHair Cut\b/g, 'Haircut').replace(/\bw\/\s*/g, 'with ')}</span>
                                                {isServing && hasOrderAdditions && (
                                                    <span className="shrink-0 inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/10 px-2 py-0.2 text-[9px] font-bold uppercase tracking-wide text-gold">
                                                        +{additionalServiceCount > 0 ? `${additionalServiceCount} add-on${additionalServiceCount === 1 ? '' : 's'}` : ''}
                                                        {additionalServiceCount > 0 && retailItemCount > 0 ? ' · ' : ''}
                                                        {retailItemCount > 0 ? `${retailItemCount} retail` : ''}
                                                    </span>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-1.5 text-ivory-dim text-xs">
                                                <BarberColorPicker
                                                    barberId={String(customer.barberId)}
                                                    barberName={barberName}
                                                    color={barberColor}
                                                    allBarbers={barbers}
                                                    getBarberColor={getBarberColor}
                                                    onChange={(color) => handleBarberColorChange(String(customer.barberId), color)}
                                                    onResetDefault={() => handleResetBarberColor(String(customer.barberId))}
                                                />
                                                <span>{barberName}</span>
                                                {['on_break', 'break'].includes(String(customer.barberStatus ?? barbers.find((barber) => barber.id === customer.barberId)?.status ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')) && (
                                                    <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-200">On Break</span>
                                                )}
                                            </div>

                                            <div className="text-[11px] text-ivory-dim/70 pt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                                <span>In: {timeIn.value}</span>
                                                <QueueSourceLabel isReservation={isReservationQueueEntry(customer)} />
                                                <span className="text-white/20">•</span>
                                                <span>Est: {formatEstimatedCompletion(estimatedCompletionByCustomer.get(customer.id)?.estimated_completion_time ?? null)}</span>
                                            </div>
                                        </div>

                                        {/* Touch-Friendly Action Buttons */}
                                        <div className="mt-3 pt-2.5 border-t border-white/5 flex flex-wrap items-center justify-end gap-1.5">
                                            {customer.offlineSyncStatus ? <>{!customer.offlineLocal && <span className="text-[10px] text-amber-200/80">Queue actions unlock after sync</span>}{renderLocalOfflineActions(customer)}</> : <>
                                            {isReservationQueueEntry(customer) && ['confirmed', 'accepted', 'late'].includes(normStatus) && (
                                                <button
                                                    type="button"
                                                    onClick={() => void handleReservationCheckIn(customer)}
                                                    disabled={checkingInQueueId === customer.id}
                                                    className={`inline-flex items-center justify-center text-xs px-2.5 py-1.5 rounded-sm border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-green-400 ${checkInState.eligible
                                                        ? 'border-green-500/30 text-green-300 hover:bg-green-500/10 hover:border-green-500/50'
                                                        : 'border-green-500/20 text-green-500/50'
                                                    } disabled:opacity-60`}
                                                    title={checkInState.eligible ? (checkInState.isEarly ? 'Early Check-In' : 'Check In') : 'Check In'}
                                                    aria-label={checkInState.eligible ? (checkInState.isEarly ? 'Early Check-In' : 'Check In') : 'Check In'}
                                                >
                                                    {checkingInQueueId === customer.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogIn className="w-3.5 h-3.5" aria-hidden="true" />}
                                                </button>
                                            )}
                                            {!isDone && (
                                                <button
                                                    type="button"
                                                    onClick={() => openEditOrder(customer)}
                                                    className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-sm border border-gold/40 text-gold font-medium hover:bg-gold/10 hover:border-gold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold"
                                                    title="Edit queue entry"
                                                    aria-label="Edit queue entry"
                                                >
                                                    <Pencil className="w-3 h-3" aria-hidden="true" />
                                                </button>
                                            )}
                                            {canCompleteCashierService(customer.status, bypassTimeRestrictions) && (
                                                <button
                                                    type="button"
                                                    onClick={() => setCustomerToComplete(customer)}
                                                    className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-sm bg-gold text-charcoal font-semibold hover:bg-gold-dim transition-colors cursor-pointer shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold"
                                                    title="Complete service and collect payment"
                                                    aria-label="Complete service and collect payment"
                                                >
                                                    <Check className="w-3.5 h-3.5 stroke-[2.5]" aria-hidden="true" />
                                                </button>
                                            )}
                                            {isDone && !customer.paid && (
                                                <button
                                                    type="button"
                                                    onClick={() => openPaymentModal(customer.id)}
                                                    className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-sm bg-gold text-charcoal font-semibold hover:bg-gold-dim transition-colors cursor-pointer shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold"
                                                    title="Collect payment"
                                                    aria-label="Collect payment"
                                                >
                                                    <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
                                                </button>
                                            )}
                                            {isReviewNeeded && (
                                                <button
                                                    type="button"
                                                    onClick={() => openPaymentAttemptReview(customer)}
                                                    className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-sm border border-sky-400/40 bg-sky-500/10 text-sky-300 font-semibold hover:bg-sky-500/20 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-400"
                                                    title="Review receipt attempt"
                                                    aria-label="Review receipt attempt"
                                                >
                                                    <ReceiptText className="h-3.5 w-3.5" aria-hidden="true" />
                                                </button>
                                            )}
                                            {(!isReservationQueueEntry(customer) || canMarkReservationNoShow(customer)) && <button
                                                type="button"
                                                onClick={() => setRemoveTarget(customer)}
                                                className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-sm border border-red-500/20 text-red-400/80 hover:text-red-300 hover:bg-red-500/10 hover:border-red-500/40 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-400"
                                                title={isReservationQueueEntry(customer) ? 'No Show' : 'Remove from queue'}
                                                aria-label={isReservationQueueEntry(customer) ? 'No Show' : 'Remove from queue'}
                                            >
                                                {isReservationQueueEntry(customer)
                                                    ? <CalendarX className="w-3.5 h-3.5" aria-hidden="true" />
                                                    : <UserMinus className="w-3.5 h-3.5" aria-hidden="true" />}
                                            </button>}
                                            </>}
                                        </div>
                                    </motion.div>
                                );
                            })}
                            </AnimatePresence>
                        </div>

                        {/* 2. TABLET: Compact Combined Table (768px – 1199px) */}
                        <div className="hidden md:block xl:hidden overflow-x-auto overflow-y-auto max-h-[32rem] custom-scrollbar rounded-sm border border-white/5 bg-charcoal/20 flex-1">
                            <table className="w-full border-collapse text-xs">
                                <thead className="sticky top-0 z-10 bg-charcoal border-b border-white/10">
                                    <tr>
                                        <th scope="col" className="text-left text-ivory-dim text-[11px] font-bold tracking-wider uppercase py-3 px-3">Customer</th>
                                        <th scope="col" className="text-left text-ivory-dim text-[11px] font-bold tracking-wider uppercase py-3 px-3">Service</th>
                                        <th scope="col" className="text-left text-ivory-dim text-[11px] font-bold tracking-wider uppercase py-3 px-3">Barber &amp; Schedule</th>
                                        <th scope="col" className="text-left text-ivory-dim text-[11px] font-bold tracking-wider uppercase py-3 px-3">Status</th>
                                        <th scope="col" className="text-right text-ivory-dim text-[11px] font-bold tracking-wider uppercase py-3 px-3">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    <AnimatePresence initial={false}>
                                        {visibleWalkIns.map((customer) => {
                                            const normStatus = (customer.status || '').toLowerCase();
                                            const isServing = ['serving', 'in_service', 'in_chair'].includes(normStatus);
                                            const isDone = ['completed', 'done'].includes(normStatus);
                                            const checkInState = getReservationCheckInState(customer, queueClock);
                                            const isReviewNeeded = isOpenPaymentAttempt(customer.paymentAttemptStatus);
                                            const waitingPosition = !isServing && !isDone
                                                ? (waitingQueuePositions.get(customer.id) ?? 1)
                                                : undefined;
                                            const barberName = getBarberName(customer.barberId);
                                            const barberColor = getBarberColor(customer.barberId);
                                            const additionalServiceCount = Math.max((customer.serviceIds?.length || 1) - 1, 0);
                                            const retailItemCount = customer.retailItems?.length || 0;
                                            const hasOrderAdditions = additionalServiceCount > 0 || retailItemCount > 0;
                                            const timeIn = formatQueueTimeIn(customer);

                                            return (
                                                <motion.tr
                                                    layout={reduceMotion ? false : "position"}
                                                    key={customer.id}
                                                    initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, transition: { duration: reduceMotion ? 0 : 0.12 } }}
                                                    transition={{ duration: reduceMotion ? 0 : 0.16 }}
                                                    className={`transition-colors ${
                                                    isServing
                                                        ? 'bg-gold/[0.04] hover:bg-gold/[0.08]'
                                                        : isDone
                                                        ? 'opacity-60 hover:opacity-100 bg-charcoal/20'
                                                        : 'hover:bg-white/[0.04]'
                                                }`}
                                            >
                                                <td
                                                    className="py-3 px-3 font-semibold text-ivory align-middle"
                                                    style={{
                                                        borderLeft: isServing ? `3px solid ${barberColor}` : '3px solid transparent',
                                                    }}
                                                >
                                                    <div className="flex items-center gap-1.5">
                                                        {isServing && (
                                                            <span
                                                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider shrink-0"
                                                                style={{
                                                                    color: barberColor,
                                                                    borderColor: `${barberColor}60`,
                                                                    backgroundColor: `${barberColor}18`,
                                                                    borderWidth: '1px',
                                                                    borderStyle: 'solid',
                                                                }}
                                                                title={`Currently being served by ${barberName}`}
                                                            >
                                                                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: barberColor }} />
                                                                NOW
                                                            </span>
                                                        )}
                                                        {waitingPosition !== undefined && (
                                                            <span
                                                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono tracking-wide font-bold shrink-0"
                                                                style={{
                                                                    color: barberColor,
                                                                    borderColor: `${barberColor}55`,
                                                                    backgroundColor: `${barberColor}14`,
                                                                    borderWidth: '1px',
                                                                    borderStyle: 'solid',
                                                                }}
                                                                title={`Queue #${waitingPosition} for ${barberName}`}
                                                            >
                                                                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: barberColor }} />
                                                                #{waitingPosition}
                                                            </span>
                                                        )}
                                                        <InlineIdentityCell customer={customer} field="name" barbers={barbers} currentValue={customer.name || 'Walk-in customer'} onSave={saveInlineIdentity} />
                                                        {customer.offlineSyncStatus && <OfflinePendingBadge status={customer.offlineSyncStatus} error={customer.offlineSyncError} locallyCompleted={customer.offlineLocal && customer.status === 'completed'} />}
                                                    </div>
                                                </td>
                                                <td className="py-3 px-3 text-ivory-dim text-xs align-middle">
                                                    <div className="font-medium text-ivory">{formatServiceTitle(customer.service).replace(/\bHair Cut\b/g, 'Haircut').replace(/\bw\/\s*/g, 'with ')}</div>
                                                    {isServing && hasOrderAdditions && (
                                                        <div className="mt-0.5 inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/10 px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wide text-gold">
                                                            +{additionalServiceCount > 0 ? `${additionalServiceCount} add-on${additionalServiceCount === 1 ? '' : 's'}` : ''}
                                                            {additionalServiceCount > 0 && retailItemCount > 0 ? ' · ' : ''}
                                                            {retailItemCount > 0 ? `${retailItemCount} retail` : ''}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="py-3 px-3 text-xs align-middle">
                                                    <div className="flex items-center gap-1.5">
                                                        <BarberColorPicker
                                                            barberId={String(customer.barberId)}
                                                            barberName={barberName}
                                                            color={barberColor}
                                                            allBarbers={barbers}
                                                            getBarberColor={getBarberColor}
                                                            onChange={(color) => handleBarberColorChange(String(customer.barberId), color)}
                                                            onResetDefault={() => handleResetBarberColor(String(customer.barberId))}
                                                        />
                                                        <InlineIdentityCell customer={customer} field="barber" barbers={barbers} currentValue={barberName} onSave={saveInlineIdentity} />
                                                        {['on_break', 'break'].includes(String(customer.barberStatus ?? barbers.find((barber) => barber.id === customer.barberId)?.status ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')) && (
                                                            <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-200">On Break</span>
                                                        )}
                                                    </div>
                                                    <div className="mt-0.5 text-[10px] text-ivory-dim/70">
                                                        <span>In: {timeIn.value}</span>
                                                        <span className="mx-1"><QueueSourceLabel isReservation={isReservationQueueEntry(customer)} /></span>
                                                        <span className="mx-1 text-white/20">•</span>
                                                        <span>Est: {formatEstimatedCompletion(estimatedCompletionByCustomer.get(customer.id)?.estimated_completion_time ?? null)}</span>
                                                    </div>
                                                </td>
                                                <td className="py-3 px-3 align-middle whitespace-nowrap">
                                                    <QueueStatusPill status={customer.status} isReviewNeeded={isReviewNeeded} size="sm" />
                                                </td>
                                                <td className="py-3 px-3 text-right align-middle whitespace-nowrap">
                                                    <div className="flex items-center justify-end gap-1">
                                                    {customer.offlineSyncStatus ? renderLocalOfflineActions(customer) : <>
                                                        {isReservationQueueEntry(customer) && ['confirmed', 'accepted', 'late'].includes(normStatus) && (
                                                            <button
                                                                type="button"
                                                                onClick={() => void handleReservationCheckIn(customer)}
                                                                disabled={checkingInQueueId === customer.id}
                                                                className={`inline-flex items-center justify-center text-[11px] px-2 py-1 rounded-sm border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-green-400 ${checkInState.eligible
                                                                    ? 'border-green-500/30 text-green-300 hover:bg-green-500/10 hover:border-green-500/50'
                                                                    : 'border-green-500/20 text-green-500/50'
                                                                } disabled:opacity-60`}
                                                                title={checkInState.eligible ? (checkInState.isEarly ? 'Early Check-In' : 'Check In') : 'Check In'}
                                                                aria-label={checkInState.eligible ? (checkInState.isEarly ? 'Early Check-In' : 'Check In') : 'Check In'}
                                                            >
                                                                {checkingInQueueId === customer.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogIn className="w-2.5 h-2.5" aria-hidden="true" />}
                                                            </button>
                                                        )}
                                                        {!isDone && (
                                                            <button
                                                                type="button"
                                                                onClick={() => openEditOrder(customer)}
                                                                className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-sm border border-gold/40 text-gold font-medium hover:bg-gold/10 hover:border-gold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold"
                                                                title="Edit queue entry"
                                                                aria-label="Edit queue entry"
                                                            >
                                                                <Pencil className="w-2.5 h-2.5" aria-hidden="true" />
                                                            </button>
                                                        )}
                                                        {canCompleteCashierService(customer.status, bypassTimeRestrictions) && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setCustomerToComplete(customer)}
                                                                className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-sm bg-gold text-charcoal font-semibold hover:bg-gold-dim transition-colors cursor-pointer shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold"
                                                                title="Complete service and collect payment"
                                                                aria-label="Complete service and collect payment"
                                                            >
                                                                <Check className="w-3 h-3 stroke-[2.5]" aria-hidden="true" />
                                                            </button>
                                                        )}
                                                        {isDone && !customer.paid && (
                                                            <button
                                                                type="button"
                                                                onClick={() => openPaymentModal(customer.id)}
                                                                className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-sm bg-gold text-charcoal font-semibold hover:bg-gold-dim transition-colors cursor-pointer shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold"
                                                                title="Collect payment"
                                                                aria-label="Collect payment"
                                                            >
                                                                <Wallet className="h-3 w-3" aria-hidden="true" />
                                                            </button>
                                                        )}
                                                        {isReviewNeeded && (
                                                            <button
                                                                type="button"
                                                                onClick={() => openPaymentAttemptReview(customer)}
                                                                className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-sm border border-sky-400/40 bg-sky-500/10 text-sky-300 font-semibold hover:bg-sky-500/20 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-400"
                                                                title="Review receipt attempt"
                                                                aria-label="Review receipt attempt"
                                                            >
                                                                <ReceiptText className="h-3.5 w-3.5" aria-hidden="true" />
                                                            </button>
                                                        )}
                                                        {(!isReservationQueueEntry(customer) || canMarkReservationNoShow(customer)) && <button
                                                            type="button"
                                                            onClick={() => setRemoveTarget(customer)}
                                                            className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-sm border border-red-500/20 text-red-400/80 hover:text-red-300 hover:bg-red-500/10 hover:border-red-500/40 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-400"
                                                            title={isReservationQueueEntry(customer) ? 'No Show' : 'Remove from queue'}
                                                            aria-label={isReservationQueueEntry(customer) ? 'No Show' : 'Remove from queue'}
                                                        >
                                                            {isReservationQueueEntry(customer)
                                                                ? <CalendarX className="w-3 h-3" aria-hidden="true" />
                                                                : <UserMinus className="w-3 h-3" aria-hidden="true" />}
                                                        </button>}
                                                    </>}
                                                    </div>
                                                </td>
                                            </motion.tr>
                                        );
                                    })}
                                    </AnimatePresence>
                                </tbody>
                            </table>
                        </div>

                        {/* 3. DESKTOP: Traditional Full 7-Column Table (>= 1200px) */}
                        <div className="hidden xl:block overflow-x-auto overflow-y-auto max-h-[32rem] custom-scrollbar rounded-sm border border-white/5 bg-charcoal/20 flex-1">
                            <table className="w-full border-collapse text-xs sm:text-sm">
                                <thead className="sticky top-0 z-10 bg-charcoal border-b border-white/10">
                                    <tr>
                                        <th scope="col" className="text-left text-ivory-dim text-[11px] font-bold tracking-wider uppercase py-3 px-3.5">Customer</th>
                                        <th scope="col" className="text-left text-ivory-dim text-[11px] font-bold tracking-wider uppercase py-3 px-3.5">Service</th>
                                        <th scope="col" className="text-left text-ivory-dim text-[11px] font-bold tracking-wider uppercase py-3 px-3.5">Barber</th>
                                        <th scope="col" className="text-left text-ivory-dim text-[11px] font-bold tracking-wider uppercase py-3 px-3.5 whitespace-nowrap">Time In</th>
                                        <th scope="col" className="text-left text-ivory-dim text-[11px] font-bold tracking-wider uppercase py-3 px-3.5 whitespace-nowrap">Est. Completion</th>
                                        <th scope="col" className="text-left text-ivory-dim text-[11px] font-bold tracking-wider uppercase py-3 px-3.5">Status</th>
                                        <th scope="col" className="text-right text-ivory-dim text-[11px] font-bold tracking-wider uppercase py-3 px-3.5">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    <AnimatePresence initial={false}>
                                        {visibleWalkIns.map((customer) => {
                                            const normStatus = (customer.status || '').toLowerCase();
                                            const isServing = ['serving', 'in_service', 'in_chair'].includes(normStatus);
                                            const isDone = ['completed', 'done'].includes(normStatus);
                                            const checkInState = getReservationCheckInState(customer, queueClock);
                                            const isReviewNeeded = isOpenPaymentAttempt(customer.paymentAttemptStatus);
                                            const waitingPosition = !isServing && !isDone
                                                ? (waitingQueuePositions.get(customer.id) ?? 1)
                                                : undefined;
                                            const barberName = getBarberName(customer.barberId);
                                            const barberColor = getBarberColor(customer.barberId);
                                            const additionalServiceCount = Math.max((customer.serviceIds?.length || 1) - 1, 0);
                                            const retailItemCount = customer.retailItems?.length || 0;
                                            const hasOrderAdditions = additionalServiceCount > 0 || retailItemCount > 0;
                                            const timeIn = formatQueueTimeIn(customer);

                                            return (
                                                <motion.tr
                                                    layout={reduceMotion ? false : "position"}
                                                    key={customer.id}
                                                    initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, transition: { duration: reduceMotion ? 0 : 0.12 } }}
                                                    transition={{ duration: reduceMotion ? 0 : 0.16 }}
                                                    className={`transition-colors ${
                                                    isServing
                                                        ? 'bg-gold/[0.04] hover:bg-gold/[0.08]'
                                                        : isDone
                                                        ? 'opacity-60 hover:opacity-100 bg-charcoal/20'
                                                        : 'hover:bg-white/[0.04]'
                                                }`}
                                            >
                                                <td
                                                    className="py-3 px-3.5 font-semibold text-ivory align-middle"
                                                    style={{
                                                        borderLeft: isServing ? `3px solid ${barberColor}` : '3px solid transparent',
                                                    }}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        {isServing && (
                                                            <span
                                                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider shrink-0"
                                                                style={{
                                                                    color: barberColor,
                                                                    borderColor: `${barberColor}60`,
                                                                    backgroundColor: `${barberColor}18`,
                                                                    borderWidth: '1px',
                                                                    borderStyle: 'solid',
                                                                }}
                                                                title={`Currently being served by ${barberName}`}
                                                            >
                                                                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: barberColor }} />
                                                                NOW
                                                            </span>
                                                        )}
                                                        {waitingPosition !== undefined && (
                                                            <span
                                                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono tracking-wide font-bold shrink-0"
                                                                style={{
                                                                    color: barberColor,
                                                                    borderColor: `${barberColor}55`,
                                                                    backgroundColor: `${barberColor}14`,
                                                                    borderWidth: '1px',
                                                                    borderStyle: 'solid',
                                                                }}
                                                                title={`Queue #${waitingPosition} for ${barberName}`}
                                                            >
                                                                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: barberColor }} />
                                                                #{waitingPosition}
                                                            </span>
                                                        )}
                                                        <InlineIdentityCell customer={customer} field="name" barbers={barbers} currentValue={customer.name || 'Walk-in customer'} onSave={saveInlineIdentity} />
                                                        {customer.offlineSyncStatus && <OfflinePendingBadge status={customer.offlineSyncStatus} error={customer.offlineSyncError} locallyCompleted={customer.offlineLocal && customer.status === 'completed'} />}
                                                    </div>
                                                </td>
                                                <td className="py-3 px-3.5 text-ivory-dim text-xs align-middle">
                                                    <div className="font-medium text-ivory">{formatServiceTitle(customer.service).replace(/\bHair Cut\b/g, 'Haircut').replace(/\bw\/\s*/g, 'with ')}</div>
                                                    {isServing && hasOrderAdditions && (
                                                        <div className="mt-1 inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gold" title="This order includes additional services or retail items">
                                                            +{additionalServiceCount > 0 ? `${additionalServiceCount} add-on${additionalServiceCount === 1 ? '' : 's'}` : ''}
                                                            {additionalServiceCount > 0 && retailItemCount > 0 ? ' · ' : ''}
                                                            {retailItemCount > 0 ? `${retailItemCount} retail` : ''}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="py-3 px-3.5 text-ivory text-xs align-middle">
                                                    <div className="flex items-center gap-1.5">
                                                        <BarberColorPicker
                                                            barberId={String(customer.barberId)}
                                                            barberName={barberName}
                                                            color={barberColor}
                                                            allBarbers={barbers}
                                                            getBarberColor={getBarberColor}
                                                            onChange={(color) => handleBarberColorChange(String(customer.barberId), color)}
                                                            onResetDefault={() => handleResetBarberColor(String(customer.barberId))}
                                                        />
                                                        <InlineIdentityCell customer={customer} field="barber" barbers={barbers} currentValue={barberName} onSave={saveInlineIdentity} />
                                                        {['on_break', 'break'].includes(String(customer.barberStatus ?? barbers.find((barber) => barber.id === customer.barberId)?.status ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')) && (
                                                            <span className="shrink-0 rounded-full border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-200">On Break</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="py-3 px-3.5 text-ivory-dim text-xs align-middle whitespace-nowrap">
                                                    <div className="font-medium text-ivory">{timeIn.value}</div>
                                                    <div className="mt-1"><QueueSourceLabel isReservation={isReservationQueueEntry(customer)} /></div>
                                                </td>
                                                <td className="py-3 px-3.5 text-ivory-dim text-xs align-middle whitespace-nowrap">
                                                    <span className="font-mono text-ivory-dim">
                                                        {formatEstimatedCompletion(estimatedCompletionByCustomer.get(customer.id)?.estimated_completion_time ?? null)}
                                                    </span>
                                                </td>
                                                <td className="py-3 px-3.5 align-middle whitespace-nowrap">
                                                    <QueueStatusPill status={customer.status} isReviewNeeded={isReviewNeeded} size="md" />
                                                </td>
                                                <td className="py-3 px-3.5 text-right align-middle whitespace-nowrap">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                    {customer.offlineSyncStatus ? renderLocalOfflineActions(customer) : <>
                                                        {isReservationQueueEntry(customer) && ['confirmed', 'accepted', 'late'].includes(normStatus) && (
                                                            <button
                                                                type="button"
                                                                onClick={() => void handleReservationCheckIn(customer)}
                                                                disabled={checkingInQueueId === customer.id}
                                                                className={`inline-flex items-center justify-center text-xs px-2 py-1 rounded-sm border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-green-400 ${checkInState.eligible
                                                                    ? 'border-green-500/30 text-green-300 hover:bg-green-500/10 hover:border-green-500/50'
                                                                    : 'border-green-500/20 text-green-500/50'
                                                                } disabled:opacity-60`}
                                                                title={checkInState.eligible ? (checkInState.isEarly ? 'Early Check-In' : 'Check In') : 'Check In'}
                                                                aria-label={checkInState.eligible ? (checkInState.isEarly ? 'Early Check-In' : 'Check In') : 'Check In'}
                                                            >
                                                                {checkingInQueueId === customer.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogIn className="w-3.5 h-3.5" aria-hidden="true" />}
                                                            </button>
                                                        )}
                                                        {!isDone && (
                                                            <button
                                                                type="button"
                                                                onClick={() => openEditOrder(customer)}
                                                                className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-sm border border-gold/40 text-gold font-medium hover:bg-gold/10 hover:border-gold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold"
                                                                title="Edit queue entry"
                                                                aria-label="Edit queue entry"
                                                            >
                                                                <Pencil className="w-3 h-3" aria-hidden="true" />
                                                            </button>
                                                        )}
                                                        {canCompleteCashierService(customer.status, bypassTimeRestrictions) && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setCustomerToComplete(customer)}
                                                                className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-sm bg-gold text-charcoal font-semibold hover:bg-gold-dim transition-colors cursor-pointer shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold"
                                                                aria-label="Complete service and collect payment"
                                                                title="Complete service and collect payment"
                                                            >
                                                                <Check className="w-3.5 h-3.5 stroke-[2.5]" aria-hidden="true" />
                                                            </button>
                                                        )}
                                                        {isDone && !customer.paid && (
                                                            <button
                                                                type="button"
                                                                onClick={() => openPaymentModal(customer.id)}
                                                                className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-sm bg-gold text-charcoal font-semibold hover:bg-gold-dim transition-colors cursor-pointer shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold"
                                                                title="Collect payment"
                                                                aria-label="Collect payment"
                                                            >
                                                                <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
                                                            </button>
                                                        )}
                                                        {isReviewNeeded && (
                                                            <button
                                                                type="button"
                                                                onClick={() => openPaymentAttemptReview(customer)}
                                                                className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-sm border border-sky-400/40 bg-sky-500/10 text-sky-300 font-semibold hover:bg-sky-500/20 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-400"
                                                                title="Review receipt attempt"
                                                                aria-label="Review receipt attempt"
                                                            >
                                                                <ReceiptText className="h-3.5 w-3.5" aria-hidden="true" />
                                                            </button>
                                                        )}
                                                        {(!isReservationQueueEntry(customer) || canMarkReservationNoShow(customer)) && <button
                                                            type="button"
                                                            onClick={() => setRemoveTarget(customer)}
                                                            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-sm border border-red-500/20 text-red-400/80 hover:text-red-300 hover:bg-red-500/10 hover:border-red-500/40 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-400"
                                                            title={isReservationQueueEntry(customer) ? 'No Show' : 'Remove from queue'}
                                                            aria-label={isReservationQueueEntry(customer) ? 'No Show' : 'Remove from queue'}
                                                        >
                                                            {isReservationQueueEntry(customer)
                                                                ? <CalendarX className="w-3.5 h-3.5" aria-hidden="true" />
                                                                : <UserMinus className="w-3.5 h-3.5" aria-hidden="true" />}
                                                        </button>}
                                                    </>}
                                                    </div>
                                                </td>
                                            </motion.tr>
                                        );
                                    })}
                                    </AnimatePresence>
                                </tbody>
                            </table>
                        </div>
                    </>
                ) : null}

                {visibleWalkIns.length === 0 && queueDataStatus === 'loading' && (
                    <div role="status" aria-label="Loading queue" className="space-y-2 py-4">
                        {[0, 1, 2, 3].map((row) => (
                            <div key={row} className="flex items-center justify-between gap-4 rounded-sm border border-white/5 bg-white/[0.02] p-4 motion-safe:animate-pulse">
                                <div className="flex-1 space-y-2"><div className="h-3 w-28 rounded-sm bg-white/10" /><div className="h-3 w-40 rounded-sm bg-white/5" /></div>
                                <div className="h-7 w-20 rounded-sm bg-white/10" />
                            </div>
                        ))}
                        <span className="sr-only">Loading queue…</span>
                    </div>
                )}
                {visibleWalkIns.length === 0 && queueDataStatus !== 'loading' && (
                    <div className="flex flex-col items-center justify-center py-14 px-4 text-center rounded-sm border border-dashed border-white/10 bg-white/[0.015] my-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5 border border-white/10 text-ivory-dim mb-3">
                            <Users className="h-6 w-6 text-gold/60" />
                        </div>
                        <p className="text-sm font-semibold text-ivory">
                            {customerSearchQuery
                                ? `No customers matching "${customerSearchQuery}"`
                                : queueSourceFilter !== 'all'
                                ? `No ${queueSourceFilter === 'walk-in' ? 'walk-in' : 'reservation'} entries match these filters`
                                : queueStatusFilter !== 'all'
                                ? `No customers with status "${queueStatusFilter === 'serving' ? 'In Chair' : queueStatusFilter === 'waiting' ? 'Waiting' : 'Done'}"`
                                : queueBarberFilter !== 'all'
                                ? `No customers assigned to ${getBarberName(queueBarberFilter)}`
                                : "No customers in today's queue"}
                        </p>
                        <p className="text-xs text-ivory-dim mt-1 max-w-sm">
                            {queueSourceFilter !== 'all'
                                ? 'Switch the type filter to All to view every queue entry.'
                                : customerSearchQuery
                                ? 'Try searching with a different name or clear the search query.'
                                : queueStatusFilter !== 'all'
                                ? 'Switch back to "All" to view everyone in the queue.'
                                : queueBarberFilter !== 'all'
                                ? 'Try selecting another barber or "All barbers" from the filter above.'
                                : "Today's queue entries and reservations will appear here. You can also add a walk-in using the form above."}
                        </p>
                        {(customerSearchQuery || queueStatusFilter !== 'all' || queueBarberFilter !== 'all' || queueSourceFilter !== 'all') && (
                            <button
                                type="button"
                                onClick={() => {
                                    setCustomerSearchQuery('');
                                    setQueueStatusFilter('all');
                                    setQueueBarberFilter('all');
                                    setQueueSourceFilter('all');
                                }}
                                className="mt-3.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-gold/10 hover:bg-gold/20 text-gold border border-gold/30 text-xs font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold"
                            >
                                <span>Reset all filters</span>
                            </button>
                        )}
                    </div>
                )}
            </section>

            {/* Confirm unusual customer name before continuing */}
            <Modal
                isOpen={Boolean(nameConfirmation)}
                onClose={() => !isSubmitting && setNameConfirmation(null)}
                title="Confirm Customer Name"
                size="sm"
                footer={
                    <>
                        <Button
                            variant="outline"
                            onClick={() => setNameConfirmation(null)}
                            disabled={isSubmitting}
                        >
                            Go Back
                        </Button>
                        <Button
                            variant="primary"
                            onClick={() => {
                                if (!nameConfirmation) return;
                                const confirmedName = nameConfirmation;
                                setNameConfirmation(null);
                                void handleAddToQueue(undefined, confirmedName);
                            }}
                            disabled={isSubmitting}
                        >
                            Continue with Name
                        </Button>
                    </>
                }
            >
                <p className="text-sm text-ivory">
                    Are you sure you want to enter <span className="break-all font-bold text-gold">{nameConfirmation}</span> as the customer name?
                </p>
            </Modal>

            {/* Remove Customer Confirmation Modal */}
            <Modal
                isOpen={Boolean(removeTarget)}
                onClose={() => !isRemoving && setRemoveTarget(null)}
                title={removeTarget && isReservationQueueEntry(removeTarget) ? 'Mark Reservation as No Show' : 'Remove Customer from Queue'}
                size="sm"
                footer={
                    <>
                        <Button
                            variant="outline"
                            onClick={() => setRemoveTarget(null)}
                            disabled={isRemoving}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            onClick={handleConfirmRemove}
                            disabled={isRemoving}
                            className="bg-red-600 hover:bg-red-500 border-red-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isRemoving
                                ? (removeTarget && isReservationQueueEntry(removeTarget) ? 'Marking…' : 'Removing…')
                                : (removeTarget && isReservationQueueEntry(removeTarget) ? 'Mark No Show' : 'Remove Customer')}
                        </Button>
                    </>
                }
            >
                {removeTarget && isReservationQueueEntry(removeTarget) ? (
                    <p className="text-ivory text-sm">
                        Mark <span className="font-bold text-gold">{removeTarget.name || 'this reservation'}</span> as No Show?
                    </p>
                ) : (
                    <p className="text-ivory text-sm">
                        Are you sure you want to remove <span className="font-bold text-gold">{removeTarget?.name || 'this customer'}</span> from the queue?
                    </p>
                )}
            </Modal>

            {/* Edit Queue Entry Modal */}
            <Modal
                isOpen={Boolean(editTarget)}
                onClose={handleAttemptCloseEdit}
                title={`${repairingPaymentTargetRef.current ? 'Select Performed Service' : 'Edit Queue Entry'}${editTarget?.name ? ` — ${editTarget.name}` : ''}`}
                size="xl"
                bodyClassName="min-h-0 overflow-hidden p-3 sm:p-5"
            >
                <div className="grid h-[calc(90vh-9rem)] min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)] lg:grid-rows-1">
                    <div className="min-h-0 min-w-0 overflow-y-auto pr-1 custom-scrollbar">
                        <ServiceSelection
                            orderStarted
                            isEditMode
                            originalItemKeys={originalEditItemKeys}
                            selectedItemKeys={editItems.map((item) => `${item.kind}:${item.id}`)}
                            selectedItems={editItems}
                            onToggleItem={toggleEditItem}
                        />
                    </div>
                    <div className="min-h-0 max-h-[22rem] overflow-y-auto rounded-sm border border-white/10 bg-charcoal custom-scrollbar lg:max-h-none lg:overflow-hidden flex flex-col">
                        <OrderPanel
                            isEditMode
                            hasChanges={hasEditChanges}
                            originalItemKeys={originalEditItemKeys}
                            activeOrder={{
                                customerName: editTarget?.name,
                                lineItems: editItems,
                                status: 'OPEN',
                                assignedBarber: editTarget ? { name: getBarberName(editTarget.barberId) } : null,
                            }}
                            onBarberClick={editTarget && !repairingPaymentTargetRef.current ? () => setBarberAssignmentTarget(editTarget) : undefined}
                            onRemoveItem={(index) => {
                                const item = editItems[index];
                                if (item?.kind === 'product' && (editTarget?.retailItems || []).some((line) => String(line.productId) === item.id)) {
                                    addToast({ type: 'info', title: 'Retail Item Kept', message: 'Existing retail quantities can only be increased.' });
                                    return;
                                }
                                setEditItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
                            }}
                            onCancel={handleAttemptCloseEdit}
                            onUpdateQueue={saveEditedOrder}
                            isSubmitting={isSavingEdit}
                        />
                    </div>
                </div>
            </Modal>

            {barberAssignmentTarget && (
                <CashierReassignmentModal
                    customer={barberAssignmentTarget}
                    onClose={() => setBarberAssignmentTarget(null)}
                    onSuccess={() => {
                        setBarberAssignmentTarget(null);
                        closeEditModal();
                        void refetch();
                        addToast({ type: 'success', title: 'Barber Updated', message: 'The customer was reassigned successfully.' });
                    }}
                />
            )}

            {/* Server-authoritative reservation impact preview before extending a walk-in order */}
            <Modal
                isOpen={showReservationImpactPreview}
                onClose={() => {
                    if (!isSavingEdit) setShowReservationImpactPreview(false);
                }}
                title="Reservation Impact Confirmation"
                size="md"
            >
                <div className="space-y-4 p-1">
                    <p className="text-sm text-ivory">
                        Extending {editTarget?.name || 'this walk-in'} by{' '}
                        <span className="font-bold text-gold">
                            {Math.max(0, editedServiceDuration - currentServiceDuration)} minutes
                        </span>{' '}
                        changes the projected service completion. Review the same-barber reservation impact before saving.
                    </p>

                    {reservationImpactPreviewError && (
                        <div role="alert" className="rounded-sm border border-amber-500/30 bg-amber-500/[0.07] p-3 text-xs leading-relaxed text-amber-200">
                            {reservationImpactPreviewError}
                        </div>
                    )}

                    <div className="rounded-sm border border-white/10 bg-white/[0.03] p-3 text-xs text-ivory">
                        <span className="text-ivory-dim">Projected walk-in completion: </span>
                        <span className="font-semibold text-gold">
                            {formatSchedulePreviewTimestamp(reservationImpactPreview?.projectedCompletionAt ?? null)}
                        </span>
                    </div>

                    {reservationImpactPreview && reservationImpactPreview.impacts.length > 0 ? (
                        <div className="max-h-64 space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                            {reservationImpactPreview.impacts.map((reservation) => (
                                <div key={reservation.queueEntryId} className="rounded-sm border border-amber-500/25 bg-amber-500/[0.06] p-3">
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                        <div>
                                            <p className="text-sm font-semibold text-ivory">{reservation.customerName}</p>
                                            <p className="mt-0.5 text-[11px] text-ivory-dim">
                                                Booked for {formatSchedulePreviewTimestamp(reservation.scheduledStartAt)}
                                            </p>
                                        </div>
                                        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-bold text-amber-200">
                                            {reservation.delayMinutes} min delay
                                        </span>
                                    </div>
                                    <p className="mt-2 text-xs text-amber-100">
                                        New estimated start: {formatSchedulePreviewTimestamp(reservation.estimatedStartAt)}
                                        <span className="text-amber-200/70"> · +{reservation.addedDelayMinutes} min additional delay</span>
                                    </p>
                                </div>
                            ))}
                        </div>
                    ) : reservationImpactPreview ? (
                        <div className="rounded-sm border border-emerald-500/25 bg-emerald-500/[0.06] p-3 text-xs leading-relaxed text-emerald-100">
                            The latest server preview shows no reservation ETA changes. Confirm the updated preview to continue.
                        </div>
                    ) : (
                        <div className="rounded-sm border border-red-500/25 bg-red-500/[0.06] p-3 text-xs leading-relaxed text-red-100">
                            A current server preview is unavailable. Keep editing and retry the order update to get a fresh preview.
                        </div>
                    )}

                    <p className="text-[11px] leading-relaxed text-ivory-dim">
                        The reservation's scheduled time and record stay unchanged. Confirming authorizes the server to save the updated operational ETAs.
                    </p>

                    <div className="flex flex-col-reverse justify-end gap-2 border-t border-white/10 pt-3 sm:flex-row">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => {
                                setShowReservationImpactPreview(false);
                                setReservationImpactPreviewError(null);
                            }}
                            disabled={isSavingEdit}
                            className="w-full sm:w-auto"
                        >
                            Keep Editing
                        </Button>
                        <Button
                            type="button"
                            variant="primary"
                            onClick={() => { void saveEditedOrder(true); }}
                            disabled={isSavingEdit || !reservationImpactPreview}
                            className="w-full sm:w-auto min-w-[140px]"
                        >
                            {isSavingEdit ? (
                                <span className="flex items-center gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Updating…
                                </span>
                            ) : 'Confirm & Update Order'}
                        </Button>
                    </div>
                </div>
            </Modal>
            {/* Discard Changes Confirmation Modal */}
            <Modal
                isOpen={showDiscardConfirm}
                onClose={() => setShowDiscardConfirm(false)}
                title="Discard changes?"
                size="sm"
            >
                <div className="p-4 space-y-4">
                    <p className="text-sm text-ivory">
                        Your changes to this queue entry have not been saved.
                    </p>
                    <div className="flex items-center justify-end gap-2 pt-2">
                        <button
                            type="button"
                            onClick={() => setShowDiscardConfirm(false)}
                            className="px-3 py-2 text-xs font-semibold rounded-sm border border-white/10 text-ivory hover:bg-white/10 transition-colors cursor-pointer"
                        >
                            Keep Editing
                        </button>
                        <button
                            type="button"
                            onClick={closeEditModal}
                            className="px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-sm bg-red-600 hover:bg-red-500 text-white transition-colors cursor-pointer shadow-sm"
                        >
                            Discard Changes
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Complete Service Confirmation Modal */}
            <Modal
                isOpen={Boolean(customerToComplete)}
                onClose={() => {
                    if (!isCompletingService) {
                        setCustomerToComplete(null);
                        setCustomSpecification('');
                    }
                }}
                title="Confirm Service Completion"
                size="sm"
                footer={
                    <div className="flex items-center justify-end gap-2.5 w-full">
                        <button
                            type="button"
                            disabled={isCompletingService}
                            onClick={() => setCustomerToComplete(null)}
                            className="px-3.5 py-2 text-xs font-semibold rounded-sm border border-white/10 text-ivory-dim hover:text-ivory hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            disabled={isCompletingService}
                            onClick={handleConfirmCompleteService}
                            className="px-4 py-2 text-xs font-semibold rounded-sm bg-gold text-charcoal hover:bg-gold-dim transition-colors cursor-pointer shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                        >
                            {isCompletingService ? (
                                <>
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    <span>Completing…</span>
                                </>
                            ) : (
                                <>
                                    <Check className="w-3.5 h-3.5 stroke-[2.5]" aria-hidden="true" />
                                    <span>Confirm Complete</span>
                                </>
                            )}
                        </button>
                    </div>
                }
            >
                {customerToComplete && (
                    <div className="p-4 space-y-4">
                        <p className="text-xs text-ivory-dim leading-relaxed">
                            Are you sure you want to mark this service as completed? This will finalize the barber session and move the customer to payment collection.
                        </p>

                        <div className="rounded-sm border border-white/10 bg-white/[0.03] p-3.5 space-y-2.5 text-xs">
                            <div className="flex justify-between items-center pb-2 border-b border-white/5">
                                <span className="text-ivory-dim">Customer:</span>
                                <span className="font-semibold text-ivory">{customerToComplete.name || 'Walk-in Customer'}</span>
                            </div>
                            <div className="flex justify-between items-center pb-2 border-b border-white/5">
                                <span className="text-ivory-dim">Assigned Barber:</span>
                                <span className="font-semibold text-gold">
                                    {barbers.find(b => String(b.id) === String(customerToComplete.barberId))?.name || customerToComplete.originalBarber || 'Assigned Barber'}
                                </span>
                            </div>
                            <div className="flex justify-between items-start pt-0.5">
                                <span className="text-ivory-dim shrink-0">Service:</span>
                                <span className="font-medium text-ivory text-right ml-4">
                                    {customerToComplete.service || 'Standard Service'}
                                </span>
                            </div>
                            {isHaircutStylingService(customerToComplete.service || '') && (
                                <div className="pt-1">
                                    <label htmlFor="cashier-haircut-specification" className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-gold">
                                        Haircut Style / Notes <span className="font-normal normal-case text-ivory-dim">(optional)</span>
                                    </label>
                                    <input
                                        id="cashier-haircut-specification"
                                        type="text"
                                        value={customSpecification}
                                        onChange={(event) => setCustomSpecification(event.target.value.slice(0, 100))}
                                        maxLength={100}
                                        placeholder="e.g. Faded sa gilid, Mid taper, Crop top"
                                        className="w-full rounded-sm border border-white/10 bg-black/20 px-3 py-2 text-xs italic text-ivory placeholder:text-ivory-dim/50 outline-none focus:border-gold/60"
                                    />
                                    <div className="mt-1 text-right text-[10px] text-ivory-dim/60">{customSpecification.length}/100</div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </Modal>

            {/* SECT Tie Resolution Modal */}
            <Modal
                isOpen={tieModal.isOpen}
                onClose={() => setTieModal(prev => ({ ...prev, isOpen: false }))}
                title="Choose a Barber (SECT Tie)"
                size="md"
            >
                <div className="p-4 space-y-4">
                    <p className="text-sm text-ivory">
                        Multiple barbers have the shortest estimated wait time. Select a barber to assign <span className="font-bold text-gold">{tieModal.customerName}</span>:
                    </p>
                    <div className="grid gap-2.5">
                        {tieModal.tiedBarbers.map((barber) => (
                            <button
                                key={barber.barberId ?? barber.id}
                                type="button"
                                onClick={() => handleSelectTiedBarber(barber)}
                                className="flex items-center justify-between p-3.5 rounded-sm border border-white/10 bg-white/5 hover:bg-gold/[0.06] hover:border-gold/40 transition-all text-left group cursor-pointer"
                            >
                                <div>
                                    <div className="flex items-center gap-2">
                                        <div className="text-sm font-semibold text-ivory group-hover:text-gold transition-colors">
                                            {barber.name}
                                        </div>
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                            Available for Walk-ins
                                        </span>
                                    </div>
                                    <div className="text-xs text-ivory-dim mt-0.5">
                                        Estimated wait: <span className="font-semibold text-ivory">{barber.etaMinutes ?? barber.eta_minutes ?? 0} mins</span>
                                    </div>
                                </div>
                                <span className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-sm bg-gold text-charcoal group-hover:bg-gold-dim transition-colors shadow-sm">
                                    Assign
                                </span>
                            </button>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={() => setTieModal(prev => ({ ...prev, isOpen: false }))}
                        className="w-full mt-2 py-2 text-xs font-medium uppercase tracking-wider rounded-sm border border-white/10 text-ivory-dim hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                    >
                        Cancel
                    </button>
                </div>
            </Modal>

            {/* Queue Payment Modal */}
            <QueuePaymentModal
                isOpen={paymentModalOpen}
                queueId={paymentTargetId}
                customerName={queue.find(customer => customer.id === paymentTargetId || customer.cloudId === paymentTargetId)?.name || null}
                quote={paymentQuote}
                quoteLoading={paymentQuoteLoading}
                quoteError={paymentQuoteError}
                onRepairServices={paymentServicesMissing && queue.some(customer => customer.id === paymentTargetId || customer.cloudId === paymentTargetId) ? () => {
                    const customer = queue.find(entry => entry.id === paymentTargetId || entry.cloudId === paymentTargetId);
                    if (!customer) return;
                    closePaymentModal();
                    openEditOrder(customer);
                    repairingPaymentTargetRef.current = customer.id;
                } : undefined}
                onRetryQuote={() => {
                    if (completionPaymentTargetRef.current) void handleCompleteService(completionPaymentTargetRef.current);
                    else if (paymentTargetId) void loadPaymentQuote(paymentTargetId);
                }}
                onClose={closePaymentModal}
                onSubmit={submitPayment}
            />

            <OfflineCashPaymentModal
                transaction={offlinePaymentTarget}
                onClose={() => setOfflinePaymentTarget(null)}
                onConfirm={saveOfflineCashPayment}
            />

            <OfflineWalkInEditModal
                transaction={offlineEditTarget}
                services={offlineEditCatalog?.scopeKey === offlineDraftKey ? offlineEditCatalog.services : services}
                barbers={offlineEditCatalog?.scopeKey === offlineDraftKey ? offlineEditCatalog.barbers : barbers}
                catalogReady={Boolean(offlineDraftKey && (
                    usableOfflineCatalogScopeKey === offlineDraftKey
                    || offlineEditCatalog?.scopeKey === offlineDraftKey
                ))}
                isSaving={isSavingOfflineEdit}
                onClose={() => setOfflineEditTarget(null)}
                onSave={saveOfflineWalkInEdit}
            />

            {/* Digital Payment Attempt Review Modal */}
            <Modal
                isOpen={Boolean(paymentAttemptReviewTarget)}
                onClose={closePaymentAttemptReview}
                title="Verify Customer Payment Receipt"
                size="md"
            >
                <div className="space-y-4 p-5 text-sm text-ivory">
                    <p className="text-xs text-ivory-dim">
                        Customer submitted a digital proof of payment. Confirm validity before marking paid.
                    </p>
                    {paymentAttemptReceiptLoading && (
                        <div className="flex min-h-[220px] items-center justify-center text-ivory-dim">
                            <Loader2 className="h-6 w-6 animate-spin text-gold" />
                        </div>
                    )}
                    {paymentAttemptReviewError && (
                        <div className="rounded-sm border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                            {paymentAttemptReviewError}
                        </div>
                    )}
                    {paymentAttemptReceiptUrl && !paymentAttemptReceiptLoading && (
                        <div className="space-y-3">
                            <div className="max-h-[300px] overflow-auto rounded-sm border border-white/10 bg-black/40 p-2 text-center">
                                <img
                                    src={paymentAttemptReceiptUrl}
                                    alt="Payment Receipt"
                                    className="mx-auto max-h-[280px] w-auto object-contain"
                                />
                            </div>
                            <label className="flex items-center gap-2 text-xs text-ivory cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={paymentAttemptVerified}
                                    onChange={(e) => setPaymentAttemptVerified(e.target.checked)}
                                    className="rounded border-white/20 bg-charcoal text-gold focus:ring-gold"
                                />
                                <span>I verified the transaction reference and amount.</span>
                            </label>
                        </div>
                    )}
                    <div className="flex justify-end gap-2 pt-2">
                        <button
                            type="button"
                            onClick={rejectPaymentAttempt}
                            disabled={paymentAttemptRejecting || paymentAttemptConfirming}
                            className="rounded-sm border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-300 hover:bg-red-500/20 cursor-pointer"
                        >
                            {paymentAttemptRejecting ? 'Discarding…' : 'Discard Attempt'}
                        </button>
                        <button
                            type="button"
                            onClick={confirmPaymentAttempt}
                            disabled={!paymentAttemptVerified || paymentAttemptConfirming || paymentAttemptRejecting}
                            className="rounded-sm bg-gold px-4 py-2 text-xs font-bold uppercase text-charcoal hover:bg-gold-dim disabled:opacity-40 cursor-pointer shadow-sm"
                        >
                            {paymentAttemptConfirming ? 'Confirming…' : 'Confirm Paid'}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Finalized Receipt Modal */}
            <FinalizedReceiptModal
                receipt={finalizedReceipt}
                localReceiptId={localReceiptId}
                provisional={Boolean(localReceiptId)}
                initialPrintAttemptCount={localReceiptPrintAttemptCount}
                offlineReceiptSnapshot={localReceiptSnapshot}
                initialPrintStatus={localReceiptPrintStatus}
                initialPrintError={localReceiptPrintError}
                onClose={() => {
                    setFinalizedReceipt(null);
                    setLocalReceiptId(null);
                    setLocalReceiptPrintAttemptCount(0);
                    setLocalReceiptSnapshot(null);
                    setLocalReceiptPrintStatus('ready');
                    setLocalReceiptPrintError(null);
                }}
            />
        </div>
    );
};

export default POSTab;
