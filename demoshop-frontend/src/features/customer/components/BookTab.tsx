import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft, Clock, MapPin, Scissors, Loader2, Info, CheckCircle, XCircle,
  Lock, X, User, Shuffle, Sparkles, UserCheck, QrCode, ShieldCheck,
  AlertCircle, Upload, Check, FileText, Calendar,
  Eye, EyeOff, Maximize2, RotateCcw, Users, Plus, Trash2, Edit3, Star,
  ChevronUp, ChevronDown, ArrowRight, Crown
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/feedback/Modal';
import { PublicPortfolioPreviewModal } from '@/features/barber/components/modals/PublicPortfolioPreviewModal';
import { useToast } from '@/components/feedback/ToastContext';
import { Link } from 'react-router';
import { api } from '@/config/api';
import { bookingService } from '@/features/booking/booking.service';
import { addDaysToIsoDate, formatDuration, getManilaDateIso, possessesRemainingSlotsToday, timeToMinutes } from '@/utils/manila-date';
import { useShopSettings } from '@/hooks/useShopSettings';
import {
  getBookingCheckpoint,
  saveBookingCheckpoint,
  clearBookingCheckpoint,
} from '@/features/booking/booking-checkpoint';
import {
  validateServiceCombo,
  getServiceFamily,
  type AvailabilityResponse,
  type AvailabilitySlot,
  type BatchBarberAvailability,
  type ComboEligibleService,
  type PaymentMethodConfig,
  type GuestBooking,
  recipientMatchesConfiguredAccount,
  getPaymentProvider,
  DEFAULT_PAYMENT_PROVIDERS,
  type PaymentProviderId,
} from '@demoshop/shared-types';
import {
  PayTimerChip,
  PaymentMethodList,
  PaymentSummaryCard,
  QrPanel,
  ReceiptUploader,
  AgreementRow,
  TermsSheet,
  type EnrichedPaymentMethod,
} from './payment';
import { CapacityResolutionModal, type NextSlotRecommendation } from './CapacityResolutionModal';
import { DateTimeStep } from './DateTimeStep';
import { rankBarbersForServices } from '../utils/barber-recommendation';
import { BarberPerformanceBadge } from '@/features/barber/components/BarberPerformanceBadge';
import {
  calculateGroupSchedule,
  type ScheduledGuestCalculation,
  type RawGuestInput,
  type BarberChairPoolItem,
} from '../utils/group-booking-schedule.util';
import { customerCache, makeCacheKey } from '../services/customer-cache';
import { scanReceiptReference } from '@/utils/receipt-photo';
import { extractReferenceFromOcrText } from '@/utils/receipt-reference-ocr';
import { canSubmitCustomerReceiptsForAdminReview, getManualReceiptReferenceStatus, shouldPrefillCustomerReceiptReference } from '@/utils/receipt-reference-entry';

const toComboService = (service: any): ComboEligibleService => ({
  service_id: Number(service.id ?? service.service_id),
  title: String(service.name ?? service.title ?? ''),
  category: service.category ?? null,
  sub_category: service.sub_category ?? null,
});

const isHaircutService = (service: any): boolean => {
  const subCat = String(service?.sub_category || '').toLowerCase().trim();
  if (subCat === 'haircut') return true;
  return getServiceFamily(toComboService(service)) === 'haircut';
};

const getInitials = (name?: string): string => {
  if (!name) return '';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const getServiceDurationMinutes = (service: any): number => {
  const rawDuration = service?.duration_minutes ?? service?.duration;
  if (typeof rawDuration === 'number' && Number.isFinite(rawDuration)) return rawDuration;
  const durationText = String(rawDuration ?? '').trim();
  const hours = durationText.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i);
  const minutes = durationText.match(/(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|m)\b/i);
  if (hours || minutes) return Number(hours?.[1] || 0) * 60 + Number(minutes?.[1] || 0);
  const numeric = Number(durationText);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 30;
};

type TimePeriod = 'morning' | 'afternoon' | 'evening';

type ReceiptValidationStatus = 'checking' | 'needs-reference' | 'pending-review' | 'verified' | 'rejected';
interface ReceiptValidationResult {
  status: ReceiptValidationStatus;
  amount: number | null;
  reference: string | null;
  transactionDate: Date | null;
  imageHash: string | null;
  recipient: string | null;
  referenceEligible?: boolean;
  adminReviewOnly?: boolean;
  referenceSource?: 'ocr' | 'manual';
  message?: string;
  detail?: string;
  failureCode?: 'unreadable' | 'hash-used' | 'not-receipt' | 'missing-field' | 'reference-used' | 'wrong-recipient' | 'old' | 'future';
}

const inspectReceiptImage = (file: File): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image could not be read.')); };
    image.src = url;
  });

interface BarberAvatarProps {
  image?: string | null;
  name?: string;
  className?: string;
  isAvailable?: boolean;
}

const BarberAvatar: React.FC<BarberAvatarProps> = ({
  image,
  name,
  className = 'w-full h-full',
  isAvailable = true,
}) => {
  const [imgError, setImgError] = useState(false);
  const initials = getInitials(name);

  if (image && !imgError) {
    return (
      <img
        src={image}
        alt={name || 'Barber'}
        onError={() => setImgError(true)}
        className={`${className} object-cover transform transition-transform duration-700 ${isAvailable ? 'group-hover:scale-110' : 'grayscale opacity-75'
          }`}
      />
    );
  }

  return (
    <div
      className={`${className} flex items-center justify-center bg-white/5 text-ivory font-bold select-none ${isAvailable ? 'group-hover:bg-gold/15 group-hover:text-gold' : 'opacity-70'
        } transition-colors`}
    >
      {initials ? (
        <span className="text-xl font-serif font-bold tracking-wider">{initials}</span>
      ) : (
        <User className="w-8 h-8 text-ivory-dim" />
      )}
    </div>
  );
};

const RESERVATION_LEAD_TIME_MS = 2 * 60 * 60 * 1000;
const ONLINE_RESERVATION_BARBER_CAPACITY = 3;
const PARTY_SIZE_OPTIONS = [1, 2, 3] as const;
const PARTY_SIZE_WHEEL_CYCLES = 5;
const PARTY_SIZE_WHEEL_CENTER_START = Math.floor(PARTY_SIZE_WHEEL_CYCLES / 2) * PARTY_SIZE_OPTIONS.length;

const isAtLeastTwoHoursAhead = (dateIso: string, time: string): boolean => {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(time.trim());
  if (!match || !/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return false;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const modifier = match[3].toUpperCase();
  if (hours === 12) hours = 0;
  if (modifier === 'PM') hours += 12;

  const slotTime = new Date(
    `${dateIso}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00+08:00`
  ).getTime();

  return Number.isFinite(slotTime) && slotTime - Date.now() >= RESERVATION_LEAD_TIME_MS;
};

interface BookTabProps {
  bookingStep: number;
  setBookingStep: (step: number | ((prev: number) => number)) => void;
  selectedService: any;
  setSelectedService: (service: any) => void;
  selectedBarber: any;
  setSelectedBarber: (barber: any) => void;
  selectedDate: string | null;
  setSelectedDate: (date: string | null) => void;
  selectedTime: string | null;
  setSelectedTime: (time: string | null) => void;
  services: any[];
  barbers: any[];
  selectedBranch?: any;
  setSelectedBranch?: (branch: any) => void;
  branches?: any[];
  onJoinQueue?: (data: any) => void;
  handleBookReset?: () => void;
  timeSlots?: any[];
  userBranch?: string;
  historyData?: any[];
  isSidebarCollapsed?: boolean;
  isRebooking?: boolean;
  isManualRebooking?: boolean;
  rebookingQueueId?: number | null;
  onRebookingCompleted?: () => void;
}

export const BookTab: React.FC<BookTabProps> = ({
  bookingStep,
  setBookingStep,
  selectedService,
  setSelectedService,
  selectedBarber,
  setSelectedBarber,
  selectedDate,
  setSelectedDate,
  selectedTime,
  setSelectedTime,
  services,
  barbers: initialBarbers,
  selectedBranch,
  setSelectedBranch,
  branches = [],
  onJoinQueue,
  handleBookReset,
  historyData = [],
  isSidebarCollapsed = false,
  isRebooking = false,
  isManualRebooking = false,
  rebookingQueueId = null,
  onRebookingCompleted,
}) => {
  const { addToast } = useToast();
  const { settings } = useShopSettings();
  const [footerSlot, setFooterSlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setFooterSlot(document.getElementById('dashboard-docked-footer-slot'));
  }, []);
  const [adminBypassScreenshot, setAdminBypassScreenshot] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return (
        localStorage.getItem('admin_bypass_screenshot') === 'true' ||
        sessionStorage.getItem('admin_bypass_screenshot') === 'true'
      );
    }
    return false;
  });

  useEffect(() => {
    const handleSync = () => {
      if (typeof window !== 'undefined') {
        setAdminBypassScreenshot(
          localStorage.getItem('admin_bypass_screenshot') === 'true' ||
          sessionStorage.getItem('admin_bypass_screenshot') === 'true'
        );
      }
    };
    window.addEventListener('storage', handleSync);
    window.addEventListener('demoshop:shop-settings-updated', handleSync);
    return () => {
      window.removeEventListener('storage', handleSync);
      window.removeEventListener('demoshop:shop-settings-updated', handleSync);
    };
  }, []);

  const isBypassActive = Boolean(
    settings?.bypassReceiptOcr ||
    adminBypassScreenshot ||
    (typeof window !== 'undefined' && localStorage.getItem('admin_bypass_screenshot') === 'true')
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [reservationSubmissionState, setReservationSubmissionState] = useState<'idle' | 'submitting' | 'unknown'>('idle');
  const reservationIdempotencyKeyRef = useRef<string | null>(null);
  const [calendarDays, setCalendarDays] = useState<any[]>([]);
  const [availableSlots, setAvailableSlots] = useState<AvailabilitySlot[]>([]);
  const [selectedTimePeriod, setSelectedTimePeriod] = useState<TimePeriod | null>(null);
  const [busyPeriods, setBusyPeriods] = useState<AvailabilityResponse['busyPeriods']>([]);
  const [barberAvailabilityMap, setBarberAvailabilityMap] = useState<Record<string, BatchBarberAvailability>>({});
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [isBackgroundRefreshing, setIsBackgroundRefreshing] = useState(false);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [availabilityLoadedKey, setAvailabilityLoadedKey] = useState('');
  const [availabilityRetryToken, setAvailabilityRetryToken] = useState(0);
  const [currentMonthYear, setCurrentMonthYear] = useState('');
  const [dateBarbers, setDateBarbers] = useState<any[]>([]);
  const [barberSlotAvailabilityMap, setBarberSlotAvailabilityMap] = useState<Record<number, string[]>>({});
  const [barberSchedules, setBarberSchedules] = useState<Record<string, {
    barberId: number;
    barberName: string;
    offDutyDates: string[];
    onlineBookingDates?: string[];
    recurringRestDays: number[];
    dateDetails: Record<string, { isOff: boolean; isOnDuty?: boolean; isOnlineBookingEnabled?: boolean; reason: string }>;
  }>>({});
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(true);
  const activeFetchKeyRef = useRef<string>('');
  const inFlightAvailabilityKeyRef = useRef<string>('');
  const applyAvailabilityRef = useRef<((nextMap: Record<string, BatchBarberAvailability>) => void) | null>(null);

  useEffect(() => {
    const handleReservationSync = () => {
      customerCache.markDomainStale('slot-availability');
      setAvailabilityRetryToken((prev) => prev + 1);
    };

    window.addEventListener('demoshop:reservations-changed', handleReservationSync);
    window.addEventListener('demoshop:appointments-changed', handleReservationSync);

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('demoshop_reservations_channel');
      bc.addEventListener('message', handleReservationSync);
    } catch {
      // Ignore environments without BroadcastChannel
    }

    return () => {
      window.removeEventListener('demoshop:reservations-changed', handleReservationSync);
      window.removeEventListener('demoshop:appointments-changed', handleReservationSync);
      if (bc) {
        bc.removeEventListener('message', handleReservationSync);
        bc.close();
      }
    };
  }, []);

  // Shop dates are available across all 14 rolling calendar days.
  // Barber availability is evaluated for the customer's selected date & time.
  const visibleCalendarDays = calendarDays;
  const [bookingCheckpoint] = useState(() => getBookingCheckpoint());
  const [bookingMode, setBookingMode] = useState<'single' | 'group'>(() => bookingCheckpoint?.bookingMode || 'single');
  const [partySize, setPartySize] = useState<number>(() => {
    if (bookingCheckpoint?.bookingMode === 'group' && Array.isArray(bookingCheckpoint?.guests) && bookingCheckpoint.guests.length > 0) {
      return Math.min(3, Math.max(2, bookingCheckpoint.guests.length));
    }
    return bookingCheckpoint?.bookingMode === 'group' ? 2 : 1;
  });
  const partySizePickerRef = useRef<HTMLDivElement>(null);
  const partySizeScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [guests, setGuests] = useState<GuestBooking[]>(() => (bookingCheckpoint?.guests as GuestBooking[]) || []);
  const [activeGuestIndex, setActiveGuestIndex] = useState<number>(() => bookingCheckpoint?.activeGuestIndex || 1);
  const [editingGuestIndex, setEditingGuestIndex] = useState<number | null>(null);
  // Summary edit: the guest as it was when Edit was opened, so Discard can restore it.
  // Brief "Reviewing your payment" state between the barber step and the summary.
  const [isPreparingSummary, setIsPreparingSummary] = useState(false);
  const prepareSummaryTimerRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (prepareSummaryTimerRef.current) window.clearTimeout(prepareSummaryTimerRef.current);
  }, []);
  const [summaryEditSnapshot, setSummaryEditSnapshot] = useState<{ date: string | null; time: string | null; baseTime: string | null; services: any[]; barber: any } | null>(null);
  // Sections changed by a saved summary edit, keyed by card ('single' or guest index).
  const [updatedSummarySections, setUpdatedSummarySections] = useState<Record<string, Array<'schedule' | 'services' | 'barber'>>>({});
  const [baseTimeSlot, setBaseTimeSlot] = useState<string | null>(() => bookingCheckpoint?.baseTimeSlot || bookingCheckpoint?.selectedTime || null);
  const [isStaggeredGroupMode, setIsStaggeredGroupMode] = useState<boolean>(() => Boolean(bookingCheckpoint?.isStaggered));
  const [capacityModalData, setCapacityModalData] = useState<{
    isOpen: boolean;
    clickedSlot: string;
    availableBarbers: number;
    estimatedWaitMinutes: number;
    barbers: Array<{
      id: number | string;
      name?: string;
      image?: string;
      isAvailableAtSlot: boolean;
      statusLabel?: string;
    }>;
    nextSimultaneousSlot: NextSlotRecommendation | null;
  } | null>(null);
  const [alternativeBarberModal, setAlternativeBarberModal] = useState<{
    isOpen: boolean;
    blockedBarberName: string;
    occupiedUntil: string;
    slotHour: string;
    peerBarbers: Array<any>;
    barber?: any;
  } | null>(null);
  const [guestName, setGuestName] = useState<string>('');
  const [isReviewingGuests, setIsReviewingGuests] = useState<boolean>(false);
  const [isSummaryDrawerOpen, setIsSummaryDrawerOpen] = useState<boolean>(false);
  const [showStartOverConfirm, setShowStartOverConfirm] = useState(false);
  const [showSpecificBarbers, setShowSpecificBarbers] = useState(() => Boolean(bookingCheckpoint?.showSpecificBarbers));
  const [pendingBookAheadBarber, setPendingBookAheadBarber] = useState<any | null>(null);
  const [isBookAheadAvailabilityFlow, setIsBookAheadAvailabilityFlow] = useState(false);
  const [bookAheadReturnSelection, setBookAheadReturnSelection] = useState<{ date: string | null; time: string | null } | null>(null);

  const [selectedServices, setSelectedServices] = useState<any[]>(() => {
    if (bookingCheckpoint?.selectedServices && bookingCheckpoint.selectedServices.length > 0) {
      return bookingCheckpoint.selectedServices;
    }
    return selectedService ? [selectedService] : [];
  });
  const [pendingBarber, setPendingBarber] = useState<any | null>(null);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [guestToRemove, setGuestToRemove] = useState<GuestBooking | null>(null);
  const [viewingPortfolioBarber, setViewingPortfolioBarber] = useState<any | null>(null);
  // Payment proof and checkout states
  const [termsAgreed, setTermsAgreed] = useState(() => isRebooking || Boolean(bookingCheckpoint?.termsAgreed));
  const [referenceNumber, setReferenceNumber] = useState(() => bookingCheckpoint?.referenceNumber || '');
  const [ocrReferenceNumber, setOcrReferenceNumber] = useState<string | null>(null);
  const [recipientIdentifierDetected, setRecipientIdentifierDetected] = useState<string | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptFilePreview, setReceiptFilePreview] = useState<string | null>(null);
  const [receiptImageHash, setReceiptImageHash] = useState<string | null>(null);
  const [receiptFiles, setReceiptFiles] = useState<File[]>([]);
  const [receiptFilePreviews, setReceiptFilePreviews] = useState<string[]>([]);
  const [receiptImageHashes, setReceiptImageHashes] = useState<string[]>([]);
  const [receiptReferenceNumbers, setReceiptReferenceNumbers] = useState<string[]>([]);
  const receiptReferenceNumbersRef = useRef<string[]>(receiptReferenceNumbers);
  receiptReferenceNumbersRef.current = receiptReferenceNumbers;
  const [receiptReferenceManuallyEdited, setReceiptReferenceManuallyEdited] = useState<boolean[]>([]);
  const receiptReferenceManuallyEditedRef = useRef<boolean[]>(receiptReferenceManuallyEdited);
  receiptReferenceManuallyEditedRef.current = receiptReferenceManuallyEdited;
  const referenceNumberRef = useRef(referenceNumber);
  referenceNumberRef.current = referenceNumber;
  const manualReferenceRequestsRef = useRef(new WeakMap<File, number>());
  const currentReceiptFilesRef = useRef<File[]>([]);
  currentReceiptFilesRef.current = receiptFiles;
  const [receiptAmounts, setReceiptAmounts] = useState<Array<number | null>>([]);
  const [receiptOcrConfidence, setReceiptOcrConfidence] = useState<number | null>(null);
  const [receiptQualityError, setReceiptQualityError] = useState<string | null>(null);
  const [receiptImageQualityError, setReceiptImageQualityError] = useState<string | null>(null);
  const [receiptTransactionDate, setReceiptTransactionDate] = useState<Date | null>(null);
  const [receiptDateError, setReceiptDateError] = useState<string | null>(null);
  const [receiptValidationResults, setReceiptValidationResults] = useState<ReceiptValidationResult[]>([]);
  const currentReceiptResultsRef = useRef<ReceiptValidationResult[]>([]);
  currentReceiptResultsRef.current = receiptValidationResults;
  const manualReferenceTimersRef = useRef(new WeakMap<File, ReturnType<typeof setTimeout>>());
  const [replaceReceiptIndex, setReplaceReceiptIndex] = useState<number | null>(null);
  const [receiptLayoutValid, setReceiptLayoutValid] = useState(false);
  const [holdSecondsLeft, setHoldSecondsLeft] = useState(900);
  const [activePaymentMethod, setActivePaymentMethod] = useState<string>(() => bookingCheckpoint?.activePaymentMethod || 'GCash');
  const [paymentScreen, setPaymentScreen] = useState<'method' | 'pay'>('method');
  const [selectedProviderId, setSelectedProviderId] = useState<PaymentProviderId>(() => {
    const raw = (bookingCheckpoint?.activePaymentMethod || 'gcash').toLowerCase();
    if (raw.includes('maya')) return 'maya';
    if (raw.includes('maribank')) return 'maribank';
    if (raw.includes('gotyme')) return 'gotyme';
    return 'gcash';
  });
  const [isChangeMethodConfirmOpen, setIsChangeMethodConfirmOpen] = useState(false);
  const [pendingProviderId, setPendingProviderId] = useState<PaymentProviderId | null>(null);

  // Synchronize BookTab details back to checkpoint
  useEffect(() => {
    if (bookingStep > 0 || selectedServices.length > 0 || referenceNumber || termsAgreed || isRebooking) {
      saveBookingCheckpoint({
        step: bookingStep,
        bookingMode,
        guests,
        activeGuestIndex,
        selectedServices,
        referenceNumber,
        activePaymentMethod,
        termsAgreed,
        isRebooking,
        rebookingQueueId,
        baseTimeSlot,
        isStaggered: isStaggeredGroupMode,
        showSpecificBarbers,
      });
    }
  }, [bookingStep, bookingMode, guests, activeGuestIndex, selectedServices, referenceNumber, activePaymentMethod, termsAgreed, isRebooking, rebookingQueueId, baseTimeSlot, isStaggeredGroupMode, showSpecificBarbers]);

  const enrichedPaymentMethods = useMemo<EnrichedPaymentMethod[]>(() => {
    const shopMethods = settings?.paymentMethods || [];
    const providerIds: PaymentProviderId[] = ['gcash', 'maya', 'maribank', 'gotyme'];

    // Shared fallback: look for any configured method with an uploaded QR and account info (e.g. GCash or Maya)
    const sharedSource = shopMethods.find(m => m.enabled && m.qrImageUrl) ||
      shopMethods.find(m => m.qrImageUrl) ||
      shopMethods.find(m => m.enabled && m.accountNumber) ||
      shopMethods.find(m => m.accountNumber);

    const sharedQr = sharedSource?.qrImageUrl || null;
    const sharedName = sharedSource?.accountName || sharedSource?.merchantName || settings?.shopName || null;
    const sharedNumber = sharedSource?.accountNumber || null;

    return providerIds.map((pId) => {
      const def = DEFAULT_PAYMENT_PROVIDERS[pId];
      const shopConfig = shopMethods.find(
        m => (m.id && m.id.toLowerCase() === pId) ||
          (m.key && m.key.toLowerCase() === pId) ||
          (m.name && m.name.toLowerCase().includes(pId))
      );

      const isEnabled = shopConfig !== undefined ? Boolean(shopConfig.enabled) : def.enabled;
      const CANONICAL_PROVIDER_LABELS: Record<PaymentProviderId, string> = {
        gcash: 'Gcash',
        maya: 'Maya/ Paymaya',
        maribank: 'MariBank',
        gotyme: 'GoTyme',
      };

      return {
        id: pId,
        label: CANONICAL_PROVIDER_LABELS[pId] || def.label,
        category: def.category,
        enabled: isEnabled,
        receiving: {
          accountName: shopConfig?.accountName || shopConfig?.merchantName || sharedName || def.receiving.accountName,
          accountNumber: shopConfig?.accountNumber || sharedNumber || def.receiving.accountNumber,
          accountNumberLabel: def.receiving.accountNumberLabel,
          qrImageUrl: shopConfig?.qrImageUrl || sharedQr || def.receiving.qrImageUrl,
        },
        logo: def.logo,
      };
    });
  }, [settings?.paymentMethods, settings?.shopName]);

  const selectedEnrichedMethod = useMemo<EnrichedPaymentMethod>(() => {
    return enrichedPaymentMethods.find(m => m.id === selectedProviderId && m.enabled) ||
      enrichedPaymentMethods.find(m => m.enabled) ||
      enrichedPaymentMethods[0];
  }, [enrichedPaymentMethods, selectedProviderId]);

  const availablePaymentMethods = useMemo<PaymentMethodConfig[]>(() => {
    // Only saved, fully configured, and enabled non-cash payment methods for online reservation fee
    return (settings?.paymentMethods || []).filter((p) => {
      const isCash = (p.id || p.key || p.type || '').toLowerCase() === 'cash';
      return p.enabled && !isCash;
    });
  }, [settings?.paymentMethods]);

  useEffect(() => {
    if (selectedEnrichedMethod && selectedEnrichedMethod.label !== activePaymentMethod) {
      setActivePaymentMethod(selectedEnrichedMethod.label);
    }
  }, [selectedEnrichedMethod, activePaymentMethod]);

  const currentMethodObj = useMemo(() => {
    return {
      id: selectedEnrichedMethod.id,
      key: selectedEnrichedMethod.id,
      name: selectedEnrichedMethod.label,
      type: selectedEnrichedMethod.category,
      description: `Scan QR with your ${selectedEnrichedMethod.label} app`,
      enabled: selectedEnrichedMethod.enabled,
      accountName: selectedEnrichedMethod.receiving.accountName,
      accountNumber: selectedEnrichedMethod.receiving.accountNumber,
      qrImageUrl: selectedEnrichedMethod.receiving.qrImageUrl,
      merchantName: selectedEnrichedMethod.receiving.accountName,
    };
  }, [selectedEnrichedMethod]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );

  const isMobileRef = useRef<boolean>(typeof window !== 'undefined' ? window.innerWidth < 768 : false);

  useEffect(() => {
    const handleResize = () => {
      const nowMobile = window.innerWidth < 768;
      if (isMobileRef.current !== nowMobile) {
        const wasMobile = isMobileRef.current;
        isMobileRef.current = nowMobile;
        setIsMobile(nowMobile);
        setBookingStep((currentStep: number) => {
          if (nowMobile && !wasMobile) {
            // Desktop (4 steps) -> Mobile (5 steps)
            if (currentStep === 4) return 5;
            if (currentStep === 3) return 4;
            if (currentStep === 2) return 3;
            if (currentStep === 1) return selectedDate ? 2 : 1;
            return currentStep;
          } else if (!nowMobile && wasMobile) {
            // Mobile (5 steps) -> Desktop (4 steps)
            if (currentStep >= 5) return 4;
            if (currentStep === 4) return 3;
            if (currentStep === 3) return 2;
            if (currentStep === 2 || currentStep === 1) return 1;
            return currentStep;
          }
          return currentStep;
        });
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [setBookingStep, selectedTime]);

  useEffect(() => {
    const picker = partySizePickerRef.current;
    if (!picker || picker.clientWidth === 0) return;

    const selectedWheelIndex = PARTY_SIZE_WHEEL_CENTER_START + partySize - 1;
    const selectedItem = picker.querySelector<HTMLElement>(`[data-wheel-index="${selectedWheelIndex}"]`);
    if (selectedItem) {
      const pickerRect = picker.getBoundingClientRect();
      const itemRect = selectedItem.getBoundingClientRect();
      const centeredLeft = picker.scrollLeft + itemRect.left - pickerRect.left + itemRect.width / 2 - picker.clientWidth / 2;
      picker.scrollTo({ left: centeredLeft, behavior: 'smooth' });
    }
  }, [bookingStep, isMobile, partySize]);

  useEffect(() => () => {
    if (partySizeScrollTimeoutRef.current) clearTimeout(partySizeScrollTimeoutRef.current);
  }, []);

  // Receipt status tracks manual reference entry and Admin-review readiness.
  const [ocrStatus, setOcrStatus] = useState<'idle' | 'extracting' | 'succeeded' | 'failed' | 'no-match'>('idle');
  const [ocrError, setOcrError] = useState<string | null>(null);

  // Reused reference detection states
  const [isDuplicateRef, setIsDuplicateRef] = useState(false);
  const [duplicateRefMessage, setDuplicateRefMessage] = useState<string | null>(null);
  const [isValidatingRef, setIsValidatingRef] = useState(false);

  // Terms modal open & agreement states
  const [hasReadTerms, setHasReadTerms] = useState(() => isRebooking || false);
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);

  useEffect(() => {
    if (isRebooking && !isManualRebooking) {
      setHasReadTerms(true);
      setTermsAgreed(true);
      const expectedCheckoutStep = isMobile ? 5 : 4;
      if (bookingStep !== expectedCheckoutStep) {
        setBookingStep(expectedCheckoutStep);
      }
    }
  }, [isRebooking, isManualRebooking, isMobile, bookingStep, setBookingStep]);

  const computeFileSha256 = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  };

  useEffect(() => {
    if (isTermsModalOpen) {
      setHasReadTerms(true);
    }
  }, [isTermsModalOpen]);

  const cancelOcr = useCallback(() => {
    setOcrStatus('idle');
    setOcrError(null);
  }, []);

  const resetPaymentState = useCallback(() => {
    void cancelOcr();
    for (const file of currentReceiptFilesRef.current) {
      manualReferenceRequestsRef.current.set(file, (manualReferenceRequestsRef.current.get(file) || 0) + 1);
      const timer = manualReferenceTimersRef.current.get(file);
      if (timer) clearTimeout(timer);
    }
    currentReceiptFilesRef.current = [];
    currentReceiptResultsRef.current = [];
    referenceNumberRef.current = '';
    setReferenceNumber('');
    setOcrReferenceNumber(null);
    setRecipientIdentifierDetected(null);
    setReceiptFile(null);
    setReceiptFilePreview(null);
    setReceiptImageHash(null);
    setReceiptFiles([]);
    setReceiptFilePreviews([]);
    setReceiptImageHashes([]);
    setReceiptReferenceNumbers([]);
    receiptReferenceNumbersRef.current = [];
    setReceiptReferenceManuallyEdited([]);
    receiptReferenceManuallyEditedRef.current = [];
    setReceiptAmounts([]);
    setReceiptOcrConfidence(null);
    setReceiptQualityError(null);
    setReceiptImageQualityError(null);
    setReceiptTransactionDate(null);
    setReceiptDateError(null);
    setReceiptValidationResults([]);
    setReplaceReceiptIndex(null);
    setReceiptLayoutValid(false);
    setIsDuplicateRef(false);
    setDuplicateRefMessage(null);
    setIsValidatingRef(false);
    setOcrStatus('idle');
    setOcrError(null);
    setHasReadTerms(false);
    setTermsAgreed(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [cancelOcr]);

  const resetLocalBookingState = useCallback(() => {
    // Clear BookTab-owned state before the parent navigates away. Otherwise the
    // checkpoint effect can persist the old draft during the unmount render.
    clearBookingCheckpoint();
    setUpdatedSummarySections({});
    setSummaryEditSnapshot(null);
    setIsPreparingSummary(false);
    setBookingMode('single');
    setPartySize(1);
    setGuests([]);
    setActiveGuestIndex(1);
    setEditingGuestIndex(null);
    setGuestName('');
    setIsReviewingGuests(false);
    setIsSummaryDrawerOpen(false);
    setSelectedServices([]);
    setPendingBarber(null);
    setPendingBookAheadBarber(null);
    setIsBookAheadAvailabilityFlow(false);
    setBookAheadReturnSelection(null);
    setShowSpecificBarbers(false);
    setSelectedBarber(null);
    setSelectedDate(null);
    setSelectedTime(null);
    setBaseTimeSlot(null);
    setIsStaggeredGroupMode(false);
    setCapacityModalData(null);
    resetPaymentState();
    handleBookReset?.();
  }, [handleBookReset, resetPaymentState, setSelectedBarber, setSelectedDate, setSelectedTime]);

  const runReceiptValidation = (file: File, receiptIndex: number): void => {
    const updateResult = (result: ReceiptValidationResult) => {
      const next = [...currentReceiptResultsRef.current];
      next[receiptIndex] = result;
      currentReceiptResultsRef.current = next;
      setReceiptValidationResults(next);
      if (result.status === 'rejected' && result.message) {
        addToast({
          id: `receipt-validation-${receiptIndex}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          type: 'error',
          title: result.failureCode === 'hash-used' ? 'Receipt Already Used' : 'Reference Already Used',
          message: result.message,
          duration: 7000,
        });
      }
      if (receiptIndex === 0) {
        const nextReference = result.reference || '';
        referenceNumberRef.current = nextReference;
        setReferenceNumber(nextReference);
        setOcrReferenceNumber(null);
        setRecipientIdentifierDetected(null);
        setReceiptImageHash(result.imageHash);
        setReceiptTransactionDate(null);
        setReceiptOcrConfidence(0);
        setReceiptLayoutValid(false);
        setOcrStatus(result.status === 'checking' ? 'extracting' : result.status === 'rejected' ? 'failed' : 'no-match');
        setOcrError(null);
      }
      setReceiptAmounts(prev => {
        const next = [...prev];
        next[receiptIndex] = null;
        return next;
      });
      setReceiptImageHashes(prev => {
        const next = [...prev];
        next[receiptIndex] = result.imageHash || '';
        return next;
      });
    };

    updateResult({
      status: 'needs-reference',
      amount: null,
      reference: null,
      transactionDate: null,
      imageHash: null,
      recipient: null,
      referenceEligible: true,
      adminReviewOnly: true,
      message: 'Enter the full payment reference. Admin will review the uploaded receipt.',
    });
    if (isBypassActive) return;

    // Image hashing is review metadata. It must not delay OCR or manual reference entry.
    void computeFileSha256(file).then(imageHash => {
      const currentIndex = currentReceiptFilesRef.current.indexOf(file);
      if (currentIndex < 0) return;
      const current = currentReceiptResultsRef.current[currentIndex];
      if (!current) return;
      const next = [...currentReceiptResultsRef.current];
      next[currentIndex] = { ...current, imageHash };
      currentReceiptResultsRef.current = next;
      setReceiptValidationResults(next);
      setReceiptImageHashes(prev => {
        const hashes = [...prev];
        hashes[currentIndex] = imageHash;
        return hashes;
      });
      if (currentIndex === 0) setReceiptImageHash(imageHash);
    }).catch(() => {
      // A hash failure does not affect reference uniqueness or Admin review.
    });
  };
  const requiredReservationFee = bookingMode === 'group' ? guests.length * 50 : 50;
  const verifiedReceiptResults = receiptValidationResults.filter(result => result.status === 'verified');
  const pendingAdminReviewReceipts = receiptValidationResults.filter(result => result.status === 'pending-review' && Boolean(result.reference));
  const hasPendingAdminReviewReceipt = pendingAdminReviewReceipts.length > 0;
  const allReceiptProofsReadyForAdminReview = canSubmitCustomerReceiptsForAdminReview(receiptFiles.map((file, index) => {
    const result = receiptValidationResults[index];
    return {
      receiptUploaded: Boolean(file),
      referenceEntered: Boolean(result?.reference?.trim()),
      referenceUnique: result?.status === 'pending-review',
    };
  }));
  const primaryVerifiedReceipt = verifiedReceiptResults[0];
  const detectedReservationFee = verifiedReceiptResults.reduce((total, result) => total + (result.amount || 0), 0);
  const isReceiptChecking = receiptValidationResults.some(result => result.status === 'checking');
  const detectedReference = primaryVerifiedReceipt?.reference || ocrReferenceNumber;
  const firstVerifiedIndex = receiptValidationResults.findIndex(result => result.status === 'verified');
  const primaryReceiptPreview = firstVerifiedIndex >= 0 ? (receiptFilePreviews[firstVerifiedIndex] || receiptFilePreview) : receiptFilePreview;
  const primaryReceiptHash = firstVerifiedIndex >= 0 ? (receiptValidationResults[firstVerifiedIndex]?.imageHash || receiptImageHash) : receiptImageHash;
  const receiptContinueCaption = hasPendingAdminReviewReceipt
    ? 'Receipt is ready for Admin review after submission. Payment is not confirmed until approved.'
    : detectedReservationFee >= requiredReservationFee
    ? 'Reservation fee complete. You can continue to review the agreement.'
    : receiptFiles.length === 0
      ? 'Pay the QR code above, then upload your GCash receipt.'
      : receiptFiles.length >= 3
        ? "You've reached the 3-receipt limit. Replace a receipt with a larger payment."
        : 'Enter the full reference number for each receipt. Admin will review the uploaded proof before confirming payment.';
  const isReceiptAmountInsufficient = !isBypassActive && !allReceiptProofsReadyForAdminReview && (
    verifiedReceiptResults.length === 0 || detectedReservationFee < requiredReservationFee
  );
  const receiptValidationNotice = !isBypassActive
    ? (recipientIdentifierDetected &&
      (currentMethodObj?.accountNumber || currentMethodObj?.accountName || currentMethodObj?.merchantName) &&
      !recipientMatchesConfiguredAccount(recipientIdentifierDetected, currentMethodObj?.accountNumber || null, currentMethodObj?.accountName || currentMethodObj?.merchantName || null))
      ? { tone: 'error', message: "Invalid receipt: The recipient account does not match the shop's official payment account." }
      : hasPendingAdminReviewReceipt
        ? { tone: 'warning', message: 'Receipt and reference are ready for Admin review after submission. Payment is not confirmed until approved.' }
        : receiptImageQualityError || receiptQualityError
        ? { tone: 'error', message: receiptImageQualityError || receiptQualityError || '' }
        : ocrStatus === 'no-match'
          ? { tone: 'warning', message: 'Enter the full reference number. Admin will review the uploaded receipt.' }
          : ocrStatus === 'failed'
            ? { tone: 'error', message: ocrError || 'Could not verify this receipt screenshot.' }
            : receiptFiles.length > 0 && receiptAmounts.length > 0 && detectedReservationFee < requiredReservationFee
              ? { tone: 'warning', message: `Verified receipt total: ₱${detectedReservationFee.toFixed(2)}. Required: ₱${requiredReservationFee.toFixed(2)}. Add another receipt screenshot.` }
              : null
    : null;
  const [dismissedReceiptNotice, setDismissedReceiptNotice] = useState<string | null>(null);
  const receiptNoticeKey = receiptValidationNotice ? `${receiptValidationNotice.tone}:${receiptValidationNotice.message}` : null;

  // Flag when uploaded image is unreadable or not recognized as a valid receipt by OCR
  const isReceiptNotRecognized = !isBypassActive && Boolean(
    receiptFile && (ocrStatus === 'no-match' || ocrStatus === 'failed')
  );

  // Check if manual reference mismatches the recognized OCR reference number or if image is invalid
  const isOcrMismatch = !isBypassActive && Boolean(
    (ocrReferenceNumber && referenceNumber.trim().replace(/\s+/g, '') !== ocrReferenceNumber) ||
    (isReceiptNotRecognized && Boolean(referenceNumber.trim()))
  );

  // Reference is only verified if OCR successfully extracted it and the input matches
  const isOcrVerified = isBypassActive
    ? Boolean(receiptFile)
    : Boolean(
      ocrStatus === 'succeeded' &&
      ocrReferenceNumber &&
      referenceNumber.trim().replace(/\s+/g, '') === ocrReferenceNumber
    );

  const configuredRecipientNumber = currentMethodObj?.accountNumber || null;
  const configuredRecipientName = currentMethodObj?.accountName || currentMethodObj?.merchantName || null;
  const recipientMismatch = !isBypassActive && Boolean(
    recipientIdentifierDetected &&
    (configuredRecipientNumber || configuredRecipientName) &&
    !recipientMatchesConfiguredAccount(recipientIdentifierDetected, configuredRecipientNumber, configuredRecipientName)
  );

  // Customer reservations enforce payment-reference uniqueness. Image hashes are retained for review metadata.
  useEffect(() => {
    const cleanRef = (detectedReference || referenceNumber).trim().replace(/\s+/g, '');
    if (!cleanRef || !/^\d{9,13}$/.test(cleanRef)) {
      setIsDuplicateRef(false);
      setDuplicateRefMessage(null);
      return;
    }

    if (isBypassActive) {
      setIsDuplicateRef(false);
      setDuplicateRefMessage(null);
      return;
    }

    let isCancelled = false;
    const checkTimer = setTimeout(async () => {
      try {
        setIsValidatingRef(true);
        const params = new URLSearchParams();
        params.set('referenceNumber', cleanRef);

        const res = await api.get(`/api/queue/check-reference?${params.toString()}`);
        if (!isCancelled && res.data) {
          if (res.data.isDuplicate) {
            setIsDuplicateRef(true);
            setDuplicateRefMessage(res.data.message || 'This reference number or receipt image has already been submitted for a booking.');
          } else {
            setIsDuplicateRef(false);
            setDuplicateRefMessage(null);
          }
        }
      } catch {
        // fail open during transient errors
      } finally {
        if (!isCancelled) setIsValidatingRef(false);
      }
    }, 350);

    return () => {
      isCancelled = true;
      clearTimeout(checkTimer);
    };
  }, [referenceNumber, isBypassActive]);

  const effectiveBranch = selectedBranch || (branches && branches.length > 0 ? branches[0] : { id: 1, name: 'DemoShop Barbershop' });

  const handleHoldExpired = useCallback(() => {
    addToast({
      type: 'warning',
      title: 'Slot Hold Expired',
      message: 'Your 15-minute slot hold has expired. Please select a time slot again.',
      duration: 6000,
    });
    setSelectedTime(null);
    setBookingStep(isMobile ? 2 : 1);
  }, [addToast, isMobile, setSelectedTime, setBookingStep]);

  const handleSelectPaymentMethod = useCallback((methodId: PaymentProviderId) => {
    if (methodId === selectedProviderId) return;
    if (receiptFiles.length > 0) {
      setPendingProviderId(methodId);
      setIsChangeMethodConfirmOpen(true);
    } else {
      setSelectedProviderId(methodId);
    }
  }, [selectedProviderId, receiptFiles.length]);

  const handleChangeMethodFromSummary = useCallback(() => {
    if (receiptFiles.length > 0) {
      setPendingProviderId(null);
      setIsChangeMethodConfirmOpen(true);
    } else {
      setPaymentScreen('method');
    }
  }, [receiptFiles.length]);

  const handleReceiptReferenceChange = useCallback((index: number, value: string, source: 'ocr' | 'manual' = 'manual') => {
    const file = currentReceiptFilesRef.current[index] || receiptFiles[index];
    if (!file) return;
    if (source === 'manual') {
      const nextEdited = [...receiptReferenceManuallyEditedRef.current];
      nextEdited[index] = true;
      receiptReferenceManuallyEditedRef.current = nextEdited;
      setReceiptReferenceManuallyEdited(nextEdited);
    }
    const nextReferences = [...receiptReferenceNumbersRef.current];
    nextReferences[index] = value;
    receiptReferenceNumbersRef.current = nextReferences;
    setReceiptReferenceNumbers(nextReferences);
    const previousTimer = manualReferenceTimersRef.current.get(file);
    if (previousTimer) clearTimeout(previousTimer);
    const requestId = (manualReferenceRequestsRef.current.get(file) || 0) + 1;
    manualReferenceRequestsRef.current.set(file, requestId);
    const result = currentReceiptResultsRef.current[index] || receiptValidationResults[index];
    if (!result?.referenceEligible) return;
    const clean = value.trim().replace(/\s+/g, '');
    const provider = getPaymentProvider(selectedEnrichedMethod.id);
    const valid = provider.category === 'bank' ? /^[A-Za-z0-9-]{8,32}$/.test(clean) : /^\d{9,13}$/.test(clean);
    if (!valid) {
      setReceiptValidationResults(prev => {
        const next = [...prev];
        next[index] = { ...result, status: 'needs-reference', reference: null, referenceSource: source, failureCode: undefined, message: 'Enter the complete payment reference number.' };
        return next;
      });
      if (index === 0) { setReferenceNumber(''); setOcrReferenceNumber(null); }
      return;
    }
    setReceiptValidationResults(prev => {
      const next = [...prev];
      next[index] = { ...result, status: 'checking', reference: clean, referenceSource: source, failureCode: undefined, message: 'Checking reference number…' };
      return next;
    });
    const timer = setTimeout(async () => {
      const currentIndex = currentReceiptFilesRef.current.indexOf(file);
      if (currentIndex < 0 || manualReferenceRequestsRef.current.get(file) !== requestId) return;
      const alreadyAttached = currentReceiptResultsRef.current.some((other, otherIndex) =>
        otherIndex !== currentIndex && (other?.status === 'verified' || other?.status === 'pending-review' || other?.status === 'checking') && other.reference === clean);
      try {
        const response = alreadyAttached ? { data: { isDuplicate: true } } :
          await api.get(`/api/queue/check-reference?referenceNumber=${encodeURIComponent(clean)}`);
        if (manualReferenceRequestsRef.current.get(file) !== requestId) return;
        const latestIndex = currentReceiptFilesRef.current.indexOf(file);
        if (latestIndex < 0) return;
        const duplicate = Boolean(response.data?.isDuplicate);
        setReceiptValidationResults(prev => {
          const current = prev[latestIndex];
          if (!current?.referenceEligible) return prev;
        const next = [...prev];
        const nextStatus = getManualReceiptReferenceStatus({ duplicate, adminReviewOnly: current.adminReviewOnly });
        next[latestIndex] = { ...current, status: nextStatus, reference: clean, referenceSource: 'manual', failureCode: duplicate ? 'reference-used' : undefined, message: duplicate ? 'This reference number has already been used.' : current.adminReviewOnly ? 'Ready for Admin review after you submit. Payment is not confirmed yet.' : undefined };
          return next;
        });
      const reviewOnly = currentReceiptResultsRef.current[latestIndex]?.adminReviewOnly === true;
      if (latestIndex === 0 || !referenceNumberRef.current.trim()) {
          const nextReferenceNumber = duplicate ? '' : clean;
          referenceNumberRef.current = nextReferenceNumber;
          setReferenceNumber(nextReferenceNumber);
        if (latestIndex === 0) {
          setOcrReferenceNumber(source === 'ocr' && !duplicate ? clean : null);
          setOcrStatus(duplicate ? 'failed' : source === 'ocr' ? 'succeeded' : reviewOnly ? 'no-match' : 'succeeded');
          setOcrError(duplicate ? 'This reference number has already been used.' : null);
        }
        }
      } catch {
        if (manualReferenceRequestsRef.current.get(file) !== requestId) return;
        const latestIndex = currentReceiptFilesRef.current.indexOf(file);
        if (latestIndex < 0) return;
        setReceiptValidationResults(prev => {
          const next = [...prev];
          next[latestIndex] = { ...prev[latestIndex], status: 'needs-reference', reference: null, referenceSource: source, message: 'Could not check this reference. Tap the field and retry.' };
          return next;
        });
      }
    }, 350);
    manualReferenceTimersRef.current.set(file, timer);
  }, [receiptFiles, receiptValidationResults, selectedEnrichedMethod]);

  useEffect(() => {
    receiptValidationResults.forEach((result, index) => {
      if (!result?.referenceEligible || result.referenceSource === 'manual' || !receiptReferenceManuallyEdited[index]) return;
      const value = receiptReferenceNumbers[index]?.trim();
      if (value) handleReceiptReferenceChange(index, value);
    });
  }, [handleReceiptReferenceChange, receiptFiles, receiptReferenceManuallyEdited, receiptReferenceNumbers, receiptValidationResults]);

  const handleAttachReceiptFile = useCallback((file: File) => {
    if (receiptFiles.length >= 3) return;
    const nextFiles = [...receiptFiles, file];
    const nextIndex = receiptFiles.length;

    currentReceiptFilesRef.current = nextFiles;
    setReceiptFiles(nextFiles);
    const nextReferences = [...receiptReferenceNumbersRef.current, ''];
    receiptReferenceNumbersRef.current = nextReferences;
    setReceiptReferenceNumbers(nextReferences);
    const nextEdited = [...receiptReferenceManuallyEditedRef.current, false];
    receiptReferenceManuallyEditedRef.current = nextEdited;
    setReceiptReferenceManuallyEdited(nextEdited);
    if (receiptFiles.length === 0) {
      setReceiptFile(file);
    }

    const reader = new FileReader();
    reader.onload = () => {
      const preview = String(reader.result || '');
      setReceiptFilePreviews(prev => [...prev, preview]);
      if (receiptFiles.length === 0) {
        setReceiptFilePreview(preview);
      }
    };
    reader.readAsDataURL(file);

    // Start OCR as soon as the file is selected, like the Cashier flow.
    runReceiptValidation(file, nextIndex);
    const referenceEditVersion = manualReferenceRequestsRef.current.get(file) || 0;
    void scanReceiptReference(file, extractReferenceFromOcrText)
      .then(candidate => {
        const currentIndex = currentReceiptFilesRef.current.indexOf(file);
        if (currentIndex < 0 || (manualReferenceRequestsRef.current.get(file) || 0) !== referenceEditVersion) return;
        const currentReference = receiptReferenceNumbersRef.current[currentIndex]
          || (currentIndex === 0 ? referenceNumberRef.current : '');
        if (!shouldPrefillCustomerReceiptReference({
          candidate,
          currentReference,
          manuallyEdited: receiptReferenceManuallyEditedRef.current[currentIndex] === true,
        })) return;
        handleReceiptReferenceChange(currentIndex, candidate!, 'ocr');
      })
      .catch(() => {
        // OCR is only a prefill convenience. Manual reference entry and Admin review remain available.
      });
  }, [receiptFiles, runReceiptValidation, handleReceiptReferenceChange]);

  const handleRemoveReceiptFile = useCallback((index: number) => {
    const removedFile = receiptFiles[index];
    if (removedFile) {
      const timer = manualReferenceTimersRef.current.get(removedFile);
      if (timer) clearTimeout(timer);
      manualReferenceRequestsRef.current.delete(removedFile);
    }
    const nextFiles = receiptFiles.filter((_, i) => i !== index);
    currentReceiptFilesRef.current = nextFiles;
    setReceiptFiles(nextFiles);
    setReceiptFile(nextFiles[0] || null);
    setReceiptFilePreviews(prev => prev.filter((_, i) => i !== index));
    setReceiptFilePreview(receiptFilePreviews.filter((_, i) => i !== index)[0] || null);
    setReceiptImageHashes(prev => prev.filter((_, i) => i !== index));
    setReceiptAmounts(prev => prev.filter((_, i) => i !== index));
    const nextReferences = receiptReferenceNumbersRef.current.filter((_, i) => i !== index);
    receiptReferenceNumbersRef.current = nextReferences;
    setReceiptReferenceNumbers(nextReferences);
    const nextEdited = receiptReferenceManuallyEditedRef.current.filter((_, i) => i !== index);
    receiptReferenceManuallyEditedRef.current = nextEdited;
    setReceiptReferenceManuallyEdited(nextEdited);
    const nextValidationResults = currentReceiptResultsRef.current.filter((_, i) => i !== index);
    currentReceiptResultsRef.current = nextValidationResults;
    setReceiptValidationResults(nextValidationResults);
    if (index === 0) {
      const nextFirst = receiptValidationResults.find((_, i) => i !== 0 && (_.status === 'verified' || _.status === 'pending-review'));
      if (nextFirst) {
        const nextReference = nextFirst.reference || '';
        referenceNumberRef.current = nextReference;
        setReferenceNumber(nextReference);
        setOcrReferenceNumber(nextFirst.referenceSource === 'manual' ? null : nextFirst.reference);
        setRecipientIdentifierDetected(nextFirst.recipient);
        setReceiptImageHash(nextFirst.imageHash);
        setReceiptTransactionDate(nextFirst.transactionDate);
        setOcrStatus(nextFirst.status === 'pending-review' ? 'no-match' : 'succeeded');
      } else {
        setReceiptImageHash(null);
        setOcrReferenceNumber(null);
        referenceNumberRef.current = '';
        setReferenceNumber('');
        setRecipientIdentifierDetected(null);
        setReceiptTransactionDate(null);
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [receiptFiles, receiptFilePreviews, receiptValidationResults]);

  // Reset payment state when exiting checkout step
  useEffect(() => {
    const isCheckout = isMobile ? bookingStep === 5 : bookingStep === 4;
    if (!isCheckout) {
      resetPaymentState();
      setPaymentScreen('method');
    }
  }, [bookingStep, isMobile, resetPaymentState]);

  // Clean teardown on unmount
  useEffect(() => {
    return () => {
      resetPaymentState();
    };
  }, [resetPaymentState]);

  const selectedServiceIds = useMemo(() => selectedServices
    .map(service => Number(service.id ?? service.service_id))
    .filter(Number.isInteger), [selectedServices]);
  const serviceKey = useMemo(
    () => [...selectedServiceIds].sort((a, b) => a - b).join('-'),
    [selectedServiceIds],
  );
  const effectiveBranchId = Number(effectiveBranch?.id || effectiveBranch?.branch_id || 0);
  const selectedBarberId = Number(selectedBarber?.id || selectedBarber?.barber_id || 0);
  const barberSchedule = barberSchedules[String(selectedBarberId)] || null;
  const isAutoAssign = Boolean(selectedBarber?.is_auto_assigned);
  const barberIdsKey = useMemo(() => {
    const ids = initialBarbers
      .map((barber) => Number(barber.id || barber.barber_id || 0))
      .filter((id) => Number.isInteger(id) && id > 0);
    if (selectedBarberId > 0) ids.push(selectedBarberId);
    return [...new Set(ids)].sort((a, b) => a - b).join(',');
  }, [initialBarbers, selectedBarberId]);
  const initialBarbersById = useMemo(() => new Map(
    initialBarbers.map((barber) => [Number(barber.id || barber.barber_id || 0), barber]),
  ), [barberIdsKey]);
  const effectiveSingleServices = useMemo(() => {
    if (selectedServices.length > 0) return selectedServices;
    if (guests[0]?.services && guests[0].services.length > 0) return guests[0].services;
    return [];
  }, [selectedServices, guests]);
  const combinedDuration = effectiveSingleServices.reduce(
    (total, service) => total + (Number.parseInt(String(service.duration ?? service.duration_minutes ?? ''), 10) || 0),
    0
  );
  const combinedPrice = effectiveSingleServices.reduce(
    (total, service) => total + (Number(String(service.price ?? '').replace(/[^\d.]/g, '')) || 0),
    0
  );
  const combinedPriceLabel = `₱${combinedPrice.toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;
  const totalAmount = combinedPrice + 50;
  const totalAmountLabel = `₱${totalAmount.toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;
  const balancePayable = combinedPrice;
  const balancePayableLabel = `₱${balancePayable.toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;
  const selectedDateIso = useMemo(() => {
    const value = String(selectedDate || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    return calendarDays.find((day: any) => day.fullDate === value)?.isoDate || '';
  }, [selectedDate, calendarDays]);
  const availabilityKey = makeCacheKey('slot-availability', effectiveBranchId, selectedDateIso, serviceKey || 'all', barberIdsKey || 'all');
  const scheduleLabel = selectedDateIso && selectedTime
    ? `${new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' }).format(new Date(`${selectedDateIso}T12:00:00+08:00`))} • ${selectedTime}`
    : 'Select a date and time';
  const isSpecificBarberMode = showSpecificBarbers || Boolean(selectedBarber && !selectedBarber.is_auto_assigned);
  const selectedAutoAssignedBarberName = selectedBarber?.is_auto_assigned
    ? selectedBarber.assigned_barber_name || selectedBarber.assignedBarberName
    : null;

  const groupTotalServicesPrice = useMemo(() => {
    const currentGuestIndex = editingGuestIndex !== null ? editingGuestIndex : activeGuestIndex;
    const guestServices = guests.map(guest => guest.guestIndex === currentGuestIndex
      ? selectedServices
      : guest.services || []
    );
    if (!guests.some(guest => guest.guestIndex === currentGuestIndex)) {
      guestServices.push(selectedServices);
    }

    return guestServices.reduce((total, servicesForGuest) => {
      const guestSum = servicesForGuest.reduce((sum, service) => {
        const price = Number(String(service.price ?? '').replace(/[^\d.]/g, '')) || 0;
        return sum + price;
      }, 0);
      return total + guestSum;
    }, 0);
  }, [guests, editingGuestIndex, activeGuestIndex, selectedServices]);

  const groupTotalDeposit = useMemo(() => {
    return Math.max(guests.length * 50, 50);
  }, [guests.length]);

  const groupTotalDuration = useMemo(() => {
    return guests.reduce((total, guest) => {
      const guestMinutes = (guest.services || []).reduce((sum, s) => {
        return sum + (getServiceDurationMinutes(s));
      }, 0);
      return total + guestMinutes;
    }, 0);
  }, [guests]);

  const isSlotClaimedByOtherGuest = useCallback((_slotTime: string): { claimed: boolean; guestLabel?: string; reason?: string } => {
    // Companion slot conflicts are resolved at barber selection, allowing guests to pick the same time slot
    return { claimed: false };
  }, []);

  const getDraftGuestCountForSlot = useCallback((slotTime: string, dateIso: string): number => {
    if (bookingMode !== 'group') return 0;

    const targetIdx = editingGuestIndex !== null ? editingGuestIndex : activeGuestIndex;
    const slotStart = timeToMinutes(slotTime);
    const requestedDuration = Math.max(1, combinedDuration || 30);
    const slotEnd = slotStart + requestedDuration;

    return guests.filter((guest) => {
      if (guest.guestIndex === targetIdx) return false;
      const guestDate = String(guest.scheduledDate || '').trim();
      const guestDateIso = /^\d{4}-\d{2}-\d{2}$/.test(guestDate)
        ? guestDate
        : calendarDays.find((day: any) => day.fullDate === guestDate)?.isoDate;
      if (guestDateIso !== dateIso || !guest.scheduledTime) return false;

      const guestStart = timeToMinutes(guest.scheduledTime);
      const guestDuration = Math.max(
        1,
        (guest.services || []).reduce((total: number, service: any) => total + getServiceDurationMinutes(service), 0) || 30
      );
      const guestEnd = guestStart + guestDuration;

      // A draft companion occupies reservation capacity for its whole service
      // interval, not only at its selected starting time.
      return slotStart < guestEnd && guestStart < slotEnd;
    }).length;
  }, [activeGuestIndex, bookingMode, calendarDays, combinedDuration, editingGuestIndex, guests]);

  const isReservationSlotAvailable = useCallback((slotTime: string): boolean => {
    if (!selectedDateIso) return false;

    const availableBarberCount = Object.values(barberSlotAvailabilityMap)
      .filter((slots) => slots.includes(slotTime)).length;
    const reservationCapacity = Math.min(ONLINE_RESERVATION_BARBER_CAPACITY, availableBarberCount);
    const draftGuestCount = getDraftGuestCountForSlot(slotTime, selectedDateIso);
    return reservationCapacity - draftGuestCount > 0;
  }, [barberSlotAvailabilityMap, getDraftGuestCountForSlot, selectedDateIso]);

  const groupSchedule = useMemo<ScheduledGuestCalculation[]>(() => {
    if (bookingMode !== 'group' || (!baseTimeSlot && !selectedTime)) return [];
    const effectiveBase = baseTimeSlot || selectedTime || '';
    const currentIdx = editingGuestIndex !== null ? editingGuestIndex : activeGuestIndex;
    const currentServices = selectedServices;
    const currentBarber = selectedBarber;
    const currentName = guestName.trim() || (currentIdx === 1 ? 'Guest 1 (You)' : `Guest ${currentIdx}`);

    const rawList: RawGuestInput[] = [];
    for (let i = 1; i <= partySize; i++) {
      if (i === currentIdx) {
        rawList.push({
          guestIndex: i,
          guestName: currentName,
          services: currentServices,
          barberId: currentBarber?.id || currentBarber?.barber_id || '',
          barberName: currentBarber?.name,
          barber: currentBarber,
        });
      } else {
        const existing = guests.find(g => g.guestIndex === i);
        rawList.push({
          guestIndex: i,
          guestName: existing?.guestName || (i === 1 ? 'Guest 1 (You)' : `Guest ${i}`),
          services: existing?.services || [],
          barberId: existing?.barberId || '',
          barberName: existing?.barberName,
          barber: existing?.barber,
        });
      }
    }

    const baseMinutes = effectiveBase ? timeToMinutes(effectiveBase) : Number.NaN;
    const availableBarbersAtBase = Object.keys(barberSlotAvailabilityMap).filter((bId) => {
      return (barberSlotAvailabilityMap[Number(bId)] || []).some((s) => timeToMinutes(s) === baseMinutes);
    }).length;

    const barberPool: BarberChairPoolItem[] = [];
    if (Number.isFinite(baseMinutes) && Array.isArray(initialBarbers) && initialBarbers.length > 0) {
      for (const b of initialBarbers) {
        const bId = Number(b.id || b.barber_id);
        const schedule = barberSchedules[String(bId)];
        const isOff = schedule?.offDutyDates?.includes(selectedDateIso) || schedule?.dateDetails?.[selectedDateIso]?.isOff;
        const isWalkInOnly = schedule?.dateDetails?.[selectedDateIso]?.isOnDuty === true && schedule?.dateDetails?.[selectedDateIso]?.isOnlineBookingEnabled === false;
        if (isOff || isWalkInOnly) continue;

        const avail = barberAvailabilityMap[String(bId)];
        if (avail && (avail.isOnDuty === false || avail.isOnlineBookingEnabled === false)) continue;

        const slots = barberSlotAvailabilityMap[bId] || avail?.availableSlots || [];
        const isFreeAtBase = slots.some((s) => timeToMinutes(s) === baseMinutes);

        let initialFreeMinutes = baseMinutes;
        if (!isFreeAtBase) {
          const busyPeriods = avail?.busyPeriods || [];
          const overlappingBp = busyPeriods.find((bp) => {
            const start = timeToMinutes(bp.startTime);
            const end = timeToMinutes(bp.endTime);
            return baseMinutes >= start && baseMinutes < end;
          });

          if (overlappingBp) {
            const bpEndMinutes = timeToMinutes(overlappingBp.endTime);
            const futureSlots = slots
              .map((s) => timeToMinutes(s))
              .filter((m) => m >= bpEndMinutes)
              .sort((a, b) => a - b);
            if (futureSlots.length > 0) {
              initialFreeMinutes = futureSlots[0];
            } else if (slots.length > 0) {
              // Barber has no remaining availability slots after busy period
              continue;
            } else {
              // Grid fallback: snap to next 15-minute interval
              initialFreeMinutes = Math.ceil(bpEndMinutes / 15) * 15;
            }
          } else {
            const futureSlots = slots
              .map((s) => timeToMinutes(s))
              .filter((m) => m >= baseMinutes)
              .sort((a, b) => a - b);
            if (futureSlots.length > 0) {
              initialFreeMinutes = futureSlots[0];
            } else {
              continue;
            }
          }
        }

        if (Number.isFinite(initialFreeMinutes) && initialFreeMinutes < Number.MAX_SAFE_INTEGER) {
          barberPool.push({
            id: bId,
            name: b.name || `Barber ${bId}`,
            initialFreeMinutes,
          });
        }
      }
    }

    return calculateGroupSchedule(effectiveBase, rawList, {
      isStaggeredMode: isStaggeredGroupMode,
      availableChairsCount: availableBarbersAtBase || 2,
      barberPool: barberPool.length > 0 ? barberPool : undefined,
    });
  }, [
    bookingMode,
    baseTimeSlot,
    selectedTime,
    editingGuestIndex,
    activeGuestIndex,
    selectedServices,
    selectedBarber,
    guestName,
    partySize,
    guests,
    initialBarbers,
    barberSchedules,
    barberAvailabilityMap,
    barberSlotAvailabilityMap,
    selectedDateIso,
    isStaggeredGroupMode,
  ]);

  const saveCurrentGuest = useCallback((timeToSave?: string, barberToSave?: any) => {
    const chosenBarber = barberToSave || selectedBarber;
    const targetIdx = editingGuestIndex !== null ? editingGuestIndex : activeGuestIndex;
    const defaultName = targetIdx === 1 ? 'Guest 1 (You)' : `Guest ${targetIdx}`;
    const name = guestName.trim() || defaultName;

    const scheduleItem = groupSchedule.find(s => s.guestIndex === targetIdx);
    const effectiveTime = timeToSave || scheduleItem?.scheduledTime12h || scheduleItem?.scheduledTime24h || selectedTime || baseTimeSlot || '';

    const isAuto = Boolean(chosenBarber?.is_auto_assigned);
    const effectiveBarberId = isAuto && scheduleItem?.barberId
      ? String(scheduleItem.barberId)
      : String(chosenBarber?.id || chosenBarber?.barber_id || '');
    const effectiveBarberName = isAuto && scheduleItem?.barberName
      ? scheduleItem.barberName
      : (chosenBarber?.name || 'Selected Barber');

    const resolvedBarber = isAuto
      ? {
          ...(chosenBarber || {}),
          id: effectiveBarberId,
          barber_id: effectiveBarberId,
          is_auto_assigned: true,
          assigned_barber_name: effectiveBarberName,
          name: 'Any Available Barber',
        }
      : chosenBarber;

    const guestData: GuestBooking = {
      guestIndex: targetIdx,
      guestName: name,
      services: [...selectedServices],
      barberId: effectiveBarberId,
      barberName: isAuto ? effectiveBarberName : (chosenBarber?.name || 'Selected Barber'),
      barber: resolvedBarber,
      scheduledDate: selectedDateIso || selectedDate || '',
      scheduledTime: effectiveTime,
      estimatedEndTime: scheduleItem?.estimatedEndTime12h || scheduleItem?.estimatedEndTime24h,
      durationMinutes: scheduleItem?.durationMinutes || combinedDuration || 30,
      isSequential: scheduleItem?.isSequential,
      sequentialReason: scheduleItem?.precedingGuestName,
      badgeLabel: scheduleItem?.badgeLabel,
    };

    setGuests((prev) => {
      const existingIdx = prev.findIndex((g) => g.guestIndex === targetIdx);
      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = guestData;
        return updated;
      }
      return [...prev, guestData].sort((a, b) => a.guestIndex - b.guestIndex);
    });
  }, [selectedBarber, groupSchedule, editingGuestIndex, activeGuestIndex, guestName, selectedServices, selectedDateIso, selectedDate, selectedTime, baseTimeSlot, combinedDuration]);

  const findGroupBarberConflict = (_chosenBarber: any): GuestBooking | null => {
    // In sequential group booking, same barber selection is automatically staggered
    return null;
  };

  // Summary edits open only the section the customer picked, then return to the summary.
  const [summaryEditMode, setSummaryEditMode] = useState(false);
  const [summaryEditSection, setSummaryEditSection] = useState<'schedule' | 'services' | 'barber' | null>(null);
  const [openEditMenuKey, setOpenEditMenuKey] = useState<string | null>(null);

  // The Edit menu closes when the step changes, on an outside click, or on Escape.
  useEffect(() => {
    setOpenEditMenuKey(null);
  }, [bookingStep]);

  useEffect(() => {
    if (openEditMenuKey === null) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target?.closest?.('[data-edit-menu]')) setOpenEditMenuKey(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenEditMenuKey(null);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openEditMenuKey]);

  const startSummaryEdit = (guest: GuestBooking | null, section: 'schedule' | 'services' | 'barber') => {
    setOpenEditMenuKey(null);
    setSummaryEditSnapshot(guest
      ? {
          date: guest.scheduledDate || null,
          time: guest.scheduledTime || null,
          baseTime: baseTimeSlot,
          services: guest.services || [],
          barber: guest.barber || null,
        }
      : { date: selectedDate, time: selectedTime, baseTime: baseTimeSlot, services: selectedServices, barber: selectedBarber });
    if (guest) {
      handleEditGuest(guest);
    } else {
      setIsReviewingGuests(false);
    }
    setSummaryEditMode(true);
    setSummaryEditSection(section);
    const targetStep = section === 'schedule'
      ? 1
      : section === 'services'
        ? (isMobile ? 3 : 2)
        : (isMobile ? 4 : 3);
    setBookingStep(targetStep);
  };

  const saveSummaryEdit = () => {
    if (!selectedDateIso || !selectedTime || selectedServices.length === 0 || !selectedBarber) {
      addToast({
        type: 'warning',
        title: 'Finish this step',
        message: 'Choose a date, time, service, and barber before going back to the summary.',
        duration: 4000,
      });
      return;
    }
    const snapshot = summaryEditSnapshot;
    if (snapshot) {
      const serviceIds = (list: any[]) => list.map((s) => String(s.id ?? s.service_id)).sort().join(',');
      const changed: Array<'schedule' | 'services' | 'barber'> = [];
      if (snapshot.date !== selectedDateIso || snapshot.time !== selectedTime) changed.push('schedule');
      if (serviceIds(snapshot.services) !== serviceIds(selectedServices)) changed.push('services');
      if (String(snapshot.barber?.barber_id ?? snapshot.barber?.id ?? '') !== String(selectedBarber?.barber_id ?? selectedBarber?.id ?? '')) changed.push('barber');
      const cardKey = bookingMode === 'group' && guests.length > 1 ? String(editingGuestIndex ?? activeGuestIndex) : 'single';
      if (changed.length > 0) {
        setUpdatedSummarySections((prev) => ({
          ...prev,
          [cardKey]: Array.from(new Set([...(prev[cardKey] || []), ...changed])),
        }));
      }
    }
    setSummaryEditSnapshot(null);
    setSummaryEditMode(false);
    completeGroupGuest(selectedBarber);
  };

  // Restores the guest as it was when Edit was opened. Nothing is saved until Back to summary.
  const discardSummaryEdit = () => {
    const snapshot = summaryEditSnapshot;
    if (snapshot) {
      setSelectedDate(snapshot.date);
      setSelectedTime(snapshot.time);
      setBaseTimeSlot(snapshot.baseTime);
      setSelectedServices(snapshot.services);
      setSelectedService(snapshot.services[0] || null);
      setSelectedBarber(snapshot.barber);
      setShowSpecificBarbers(Boolean(snapshot.barber && !snapshot.barber.is_auto_assigned));
    }
    setSummaryEditSnapshot(null);
    setSummaryEditMode(false);
    setEditingGuestIndex(null);
    setOpenEditMenuKey(null);
    setIsReviewingGuests(true);
  };

  const handleEditGuest = (guest: GuestBooking) => {
    setEditingGuestIndex(guest.guestIndex);
    setGuestName(guest.guestName || '');
    setSelectedServices(guest.services || []);
    setSelectedService(guest.services?.[0] || null);
    setSelectedBarber(guest.barber || null);
    setShowSpecificBarbers(Boolean(guest.barber && !guest.barber.is_auto_assigned));
    setSelectedDate(guest.scheduledDate || null);
    setSelectedTime(guest.scheduledTime || null);
    setIsReviewingGuests(false);
    setBookingStep(isMobile ? 3 : 2);
  };

  const handleRemoveGuest = (guest: GuestBooking) => {
    if (guests.length <= 1 && partySize <= 1) {
      addToast({
        type: 'warning',
        title: 'Minimum 1 Guest',
        message: 'A group booking must contain at least one guest.',
      });
      return;
    }
    setGuestToRemove(guest);
  };

  const confirmRemoveGuest = () => {
    if (!guestToRemove) return;
    const targetIdx = guestToRemove.guestIndex;
    const removedLabel = guestToRemove.guestName || `Guest ${targetIdx}`;
    const filtered = guests.filter(g => g.guestIndex !== targetIdx);
    const reindexed = filtered.map((g, idx) => ({
      ...g,
      guestIndex: idx + 1,
      guestName: g.guestName?.startsWith('Guest ') ? (idx === 0 ? 'Guest 1 (You)' : `Guest ${idx + 1}`) : g.guestName,
    }));
    setGuests(reindexed);
    setPartySize(Math.max(1, reindexed.length));

    if (reindexed.length <= 1) {
      setBookingMode('single');
      setPartySize(1);
      const remainingGuest = reindexed[0];
      if (remainingGuest) {
        setEditingGuestIndex(null);
        setActiveGuestIndex(1);
        setGuestName(remainingGuest.guestName || 'Guest 1 (You)');
        setSelectedServices(remainingGuest.services || []);
        setSelectedService(remainingGuest.services?.[0] || null);
        setSelectedBarber(remainingGuest.barber || null);
        setShowSpecificBarbers(Boolean(remainingGuest.barber && !remainingGuest.barber.is_auto_assigned));
        setSelectedDate(remainingGuest.scheduledDate || null);
        setSelectedTime(remainingGuest.scheduledTime || null);
      } else {
        setEditingGuestIndex(null);
        setActiveGuestIndex(1);
        setGuestName('Guest 1 (You)');
        setSelectedServices([]);
        setSelectedService(null);
        setSelectedBarber(null);
        setSelectedDate(null);
        setSelectedTime(null);
      }
    } else {
      const currentIdx = editingGuestIndex !== null ? editingGuestIndex : activeGuestIndex;
      let nextActiveIdx = 1;
      if (currentIdx === targetIdx) {
        nextActiveIdx = Math.min(targetIdx, reindexed.length);
      } else if (currentIdx > targetIdx) {
        nextActiveIdx = currentIdx - 1;
      } else {
        nextActiveIdx = currentIdx;
      }
      setEditingGuestIndex(nextActiveIdx);
      setActiveGuestIndex(nextActiveIdx);
      const activeG = reindexed.find(g => g.guestIndex === nextActiveIdx) || reindexed[0];
      if (activeG) {
        setGuestName(activeG.guestName || (nextActiveIdx === 1 ? 'Guest 1 (You)' : `Guest ${nextActiveIdx}`));
        setSelectedServices(activeG.services || []);
        setSelectedService(activeG.services?.[0] || null);
        setSelectedBarber(activeG.barber || null);
        setShowSpecificBarbers(Boolean(activeG.barber && !activeG.barber.is_auto_assigned));
        setSelectedDate(activeG.scheduledDate || selectedDate || null);
        setSelectedTime(activeG.scheduledTime || baseTimeSlot || null);
      }
    }

    setGuestToRemove(null);
    addToast({
      type: 'info',
      title: 'Guest Removed',
      message: `${removedLabel} removed from reservation.`,
    });
  };

  const handleUpdateGuestName = (guestIndex: number, newName: string) => {
    setGuests(prev => prev.map(g => g.guestIndex === guestIndex ? { ...g, guestName: newName } : g));
  };

  const switchToGuest = (targetIdx: number) => {
    // Persist the current guest and derive the target from the same snapshot.
    // React batches saveCurrentGuest(), so reading guests immediately after it can be stale.
    const currentIdx = editingGuestIndex !== null ? editingGuestIndex : activeGuestIndex;
    const savedCurrentGuest = guests.find(g => g.guestIndex === currentIdx);
    const currentBarber = selectedBarber || savedCurrentGuest?.barber;
    const currentGuestExists = Boolean(savedCurrentGuest);
    const shouldSaveCurrent = currentGuestExists || selectedServices.length > 0 || selectedBarber || selectedDate || selectedTime;
    const lockedGroupDate = selectedDateIso || selectedDate || savedCurrentGuest?.scheduledDate || '';
    const currentScheduleItem = groupSchedule.find(s => s.guestIndex === currentIdx);
    const calculatedTime = currentScheduleItem?.scheduledTime12h || currentScheduleItem?.scheduledTime24h || selectedTime || baseTimeSlot || '';

    const currentGuest: GuestBooking = {
      guestIndex: currentIdx,
      guestName: guestName.trim() || (currentIdx === 1 ? 'Guest 1 (You)' : 'Guest ' + currentIdx),
      services: [...selectedServices],
      barberId: String(currentBarber?.id || currentBarber?.barber_id || savedCurrentGuest?.barberId || ''),
      barberName: currentBarber?.is_auto_assigned
        ? (currentBarber?.name || 'Any Available Barber')
        : (currentBarber?.name || savedCurrentGuest?.barberName || 'Selected Barber'),
      barber: currentBarber,
      scheduledDate: lockedGroupDate,
      scheduledTime: calculatedTime,
      estimatedEndTime: currentScheduleItem?.estimatedEndTime12h || currentScheduleItem?.estimatedEndTime24h,
      durationMinutes: currentScheduleItem?.durationMinutes || combinedDuration || 30,
      isSequential: currentScheduleItem?.isSequential,
      sequentialReason: currentScheduleItem?.precedingGuestName,
      badgeLabel: currentScheduleItem?.badgeLabel,
    };
    const nextGuests = shouldSaveCurrent
      ? [...guests.filter(g => g.guestIndex !== currentIdx), currentGuest].sort((a, b) => a.guestIndex - b.guestIndex)
      : guests;
    if (shouldSaveCurrent) setGuests(nextGuests);

    const targetGuest = nextGuests.find(g => g.guestIndex === targetIdx);
    setEditingGuestIndex(targetIdx);
    setActiveGuestIndex(targetIdx);
    setGuestName(targetGuest?.guestName || (targetIdx === 1 ? 'Guest 1 (You)' : `Guest ${targetIdx}`));
    setSelectedServices(targetGuest?.services || []);
    setSelectedService(targetGuest?.services?.[0] || null);
    setSelectedBarber(targetGuest?.barber || null);
    setShowSpecificBarbers(Boolean(targetGuest?.barber && !targetGuest.barber.is_auto_assigned));
    setSelectedDate(lockedGroupDate || targetGuest?.scheduledDate || null);
    setSelectedTime(targetGuest?.scheduledTime || baseTimeSlot || null);
    setBookingStep(isMobile ? 3 : 2);
  };

  const completeGroupGuest = (chosenBarber: any) => {
    const currentIdx = editingGuestIndex !== null ? editingGuestIndex : activeGuestIndex;
    const savedGuest = guests.find(g => g.guestIndex === currentIdx);
    const effectiveDate = selectedDateIso || selectedDate || savedGuest?.scheduledDate || '';
    const scheduleItem = groupSchedule.find(s => s.guestIndex === currentIdx);
    // Existing guests keep the time chosen while editing. New guests also have an
    // editingGuestIndex, so identify edits by the presence of an already-saved guest.
    const isEditingExistingGuest = editingGuestIndex !== null && Boolean(savedGuest);
    const calculatedTime = isEditingExistingGuest && selectedTime
      ? selectedTime
      : scheduleItem?.scheduledTime12h || scheduleItem?.scheduledTime24h || baseTimeSlot || selectedTime || '';

    const isAuto = Boolean(chosenBarber?.is_auto_assigned);
    const effectiveBarberId = isAuto && scheduleItem?.barberId
      ? String(scheduleItem.barberId)
      : String(chosenBarber?.id || chosenBarber?.barber_id || '');
    const effectiveBarberName = isAuto && scheduleItem?.barberName
      ? scheduleItem.barberName
      : (chosenBarber?.name || 'Selected Barber');

    const resolvedBarber = isAuto
      ? {
          ...(chosenBarber || {}),
          id: effectiveBarberId,
          barber_id: effectiveBarberId,
          is_auto_assigned: true,
          assigned_barber_name: effectiveBarberName,
          name: 'Any Available Barber',
        }
      : chosenBarber;

    const currentGuest: GuestBooking = {
      guestIndex: currentIdx,
      guestName: guestName.trim() || (currentIdx === 1 ? 'Guest 1 (You)' : 'Guest ' + currentIdx),
      services: [...selectedServices],
      barberId: effectiveBarberId,
      barberName: isAuto ? effectiveBarberName : (chosenBarber?.name || 'Selected Barber'),
      barber: resolvedBarber,
      scheduledDate: effectiveDate,
      scheduledTime: calculatedTime,
      estimatedEndTime: scheduleItem?.estimatedEndTime12h || scheduleItem?.estimatedEndTime24h,
      durationMinutes: scheduleItem?.durationMinutes || combinedDuration || 30,
      isSequential: scheduleItem?.isSequential,
      sequentialReason: scheduleItem?.precedingGuestName,
      badgeLabel: scheduleItem?.badgeLabel,
    };
    const nextGuests = [
      ...guests.filter(g => g.guestIndex !== currentIdx),
      currentGuest,
    ].sort((a, b) => a.guestIndex - b.guestIndex);
    setGuests(nextGuests);
    setSelectedBarber(chosenBarber);
    setShowSpecificBarbers(false);

    const nextGuestIndex = Array.from({ length: partySize }, (_, i) => i + 1)
      .filter(idx => idx !== currentIdx)
      .find(idx => {
        const guest = nextGuests.find(g => g.guestIndex === idx);
        return !guest || !(guest.services || []).length || !guest.barberId;
      });

    if (nextGuestIndex !== undefined) {
      const nextGuest = nextGuests.find(g => g.guestIndex === nextGuestIndex);
      const nextScheduleItem = groupSchedule.find(s => s.guestIndex === nextGuestIndex);
      setEditingGuestIndex(nextGuestIndex);
      setActiveGuestIndex(nextGuestIndex);
      setGuestName(nextGuest?.guestName || (nextGuestIndex === 1 ? 'Guest 1 (You)' : 'Guest ' + nextGuestIndex));
      setSelectedServices(nextGuest?.services || []);
      setSelectedService(nextGuest?.services?.[0] || null);
      setSelectedBarber(nextGuest?.barber || null);
      setShowSpecificBarbers(Boolean(nextGuest?.barber && !nextGuest.barber.is_auto_assigned));
      setSelectedDate(effectiveDate);
      setSelectedTime(nextGuest?.scheduledTime || nextScheduleItem?.scheduledTime12h || baseTimeSlot || null);
      setIsReviewingGuests(false);
      setBookingStep(isMobile ? 3 : 2);
      return;
    }

    setShowSpecificBarbers(false);
    setSummaryEditMode(false);
    setIsReviewingGuests(true);
    if (!summaryEditMode) {
      // First-time booking: hold the review for a moment before showing the summary.
      setIsPreparingSummary(true);
      if (prepareSummaryTimerRef.current) window.clearTimeout(prepareSummaryTimerRef.current);
      prepareSummaryTimerRef.current = window.setTimeout(() => setIsPreparingSummary(false), 2500);
    }
  };

  const handleAddAnotherGuest = () => {
    if (partySize >= 3 || guests.length >= 3) {
      addToast({
        type: 'warning',
        title: 'Maximum Group Size Reached',
        message: 'Group bookings are limited to a maximum of 3 guests per reservation.',
      });
      return;
    }
    // A single booking becomes a group booking only after the customer opts
    // into adding another guest from the reservation summary.
    setBookingMode('group');
    // The reservation summary already contains every saved guest. Do not
    // persist the stale editor snapshot here, or a recently removed guest can
    // be reinserted before the new guest is created.
    const nextIdx = guests.length + 1;
    setPartySize(nextIdx);
    setEditingGuestIndex(nextIdx);
    setActiveGuestIndex(nextIdx);
    setGuestName(`Guest ${nextIdx}`);
    setSelectedServices([]);
    setSelectedService(null);
    setSelectedBarber(null);
    setSelectedDate(selectedDateIso || selectedDate || guests[0]?.scheduledDate || null);
    setSelectedTime(baseTimeSlot || guests[0]?.scheduledTime || null);
    setBookingStep(isMobile ? 3 : 2);
    setIsReviewingGuests(false);
  };

  const handleProceedToCheckout = () => {
    setIsReviewingGuests(false);
    setBookingStep(isMobile ? 5 : 4);
  };

  const recentBarberId = useMemo(() => {
    if (!Array.isArray(historyData) || historyData.length === 0) return null;
    const latest = historyData[0];
    if (!latest) return null;
    return latest.barber_id ?? latest.barberId ?? null;
  }, [historyData]);

  const recentBarberName = useMemo(() => {
    if (!Array.isArray(historyData) || historyData.length === 0) return null;
    const latest = historyData[0];
    if (!latest) return null;
    return (latest.barber_name || latest.barber || '').trim().toLowerCase();
  }, [historyData]);

  useEffect(() => {
    if (!selectedService) return;

    const selectedId = Number(selectedService.id ?? selectedService.service_id);
    setSelectedServices(current => current.some(service => Number(service.id ?? service.service_id) === selectedId)
      ? current
      : current.length === 0 ? [selectedService] : current
    );
  }, [selectedService]);

  const checkConflictFor = (candidate: any[]) => validateServiceCombo(candidate.map(toComboService));

  const isCutoffHours = useMemo(() => {
    // Scenario 1: Real-time trigger - Booking for today & Manila current time >= 6:30 PM (18:30 = 1110 min)
    const todayIso = getManilaDateIso();
    const isTodayBooking = selectedDateIso === todayIso;

    if (isTodayBooking) {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Manila',
        hour: 'numeric',
        minute: 'numeric',
        hour12: false,
      }).formatToParts(new Date());

      let currentHour = Number(parts.find((p) => p.type === 'hour')?.value || '0');
      if (currentHour === 24) currentHour = 0;
      const currentMinutes = currentHour * 60 + Number(parts.find((p) => p.type === 'minute')?.value || '0');

      if (currentMinutes >= 18 * 60 + 30) return true; // 6:30 PM or later
    }

    // Scenario 2: Pre-booking trigger - Evening timeslot (8:00 PM or later)
    if (selectedTime) {
      const slotMinutes = timeToMinutes(selectedTime);
      if (slotMinutes >= 20 * 60) return true; // 8:00 PM or later
    }

    return false;
  }, [selectedDateIso, selectedTime]);

  const toggleService = (service: any) => {
    const serviceId = Number(service.id ?? service.service_id);
    const alreadySelected = selectedServices.some(selected => Number(selected.id ?? selected.service_id) === serviceId);

    const serviceDuration = Number.parseInt(String(service.duration ?? service.duration_minutes ?? ''), 10) || 0;
    const selectedTimeMinutes = selectedTime ? timeToMinutes(selectedTime) : null;
    const CUTOFF_LIMIT = 20 * 60 + 30; // 8:30 PM cutoff

    if (!alreadySelected) {
      if (selectedTimeMinutes !== null && (selectedTimeMinutes + serviceDuration > CUTOFF_LIMIT)) {
        addToast({
          type: 'warning',
          title: 'Cutoff Hour Limitation',
          message: `This service exceeds the 8:30 PM cutoff for your selected time (${selectedTime}).`,
          duration: 5000,
        });
        return;
      }

      if (isCutoffHours && serviceDuration > 30) {
        addToast({
          type: 'warning',
          title: 'Cutoff Hour Limitation',
          message: 'Only short-time services (30 minutes or less) are available during cutoff hours.',
          duration: 5000,
        });
        return;
      }

      const candidateCombo = [...selectedServices, service];
      const candidateDuration = candidateCombo.reduce(
        (total, s) => total + (Number.parseInt(String(s.duration ?? s.duration_minutes ?? ''), 10) || 0),
        0
      );

      if (selectedTimeMinutes !== null && (selectedTimeMinutes + candidateDuration > CUTOFF_LIMIT)) {
        addToast({
          type: 'warning',
          title: 'Cutoff Hour Limitation',
          message: `Total combined duration exceeds the 8:30 PM cutoff for your selected time (${selectedTime}).`,
          duration: 5000,
        });
        return;
      }

      if (isCutoffHours && candidateDuration > 30) {
        addToast({
          type: 'warning',
          title: 'Cutoff Hour Limitation',
          message: 'Total combined duration cannot exceed 30 minutes during cutoff hours.',
          duration: 5000,
        });
        return;
      }

      const conflict = checkConflictFor(candidateCombo);
      if (conflict) {
        addToast({
          type: 'warning',
          title: 'Combination not allowed',
          message: conflict.reason,
          duration: 4500,
        });
        return;
      }
    }

    const next = alreadySelected
      ? selectedServices.filter(selected => Number(selected.id ?? selected.service_id) !== serviceId)
      : [...selectedServices, service];

    setSelectedServices(next);
    setSelectedService(next[0] ?? null); // Retain primary service for dashboard consumers
  };

  const clearServiceSelection = () => {
    setSelectedServices([]);
    setSelectedService(null);
  };

  // Generate next 14 available days for calendar strip
  // If operating hours for today have already passed, today is omitted
  useEffect(() => {
    const days = [];
    const todayIso = getManilaDateIso();
    const startOffset = possessesRemainingSlotsToday() ? 0 : 1;

    for (let i = startOffset; i < startOffset + 14; i++) {
      const isoDate = addDaysToIsoDate(todayIso, i);
      const date = new Date(`${isoDate}T12:00:00Z`);
      const format = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', {
        ...options,
        timeZone: 'Asia/Manila',
      }).format(date);

      days.push({
        date,
        dayName: format({ weekday: 'short' }),
        dayNumber: Number(format({ day: 'numeric' })),
        fullDate: format({ month: 'short', day: 'numeric' }),
        isoDate,
        monthYear: format({ month: 'long', year: 'numeric' })
      });
    }

    setCurrentMonthYear(days[0]?.monthYear || '');
    setCalendarDays(days);
  }, []);

  // Update Month/Year header when date selection or visible days change
  useEffect(() => {
    if (selectedDateIso) {
      const selectedDayObj = visibleCalendarDays.find((day: any) => day.isoDate === selectedDateIso) || calendarDays.find((day: any) => day.isoDate === selectedDateIso);
      if (selectedDayObj) {
        setCurrentMonthYear(selectedDayObj.monthYear);
      }
    } else if (visibleCalendarDays[0]?.monthYear) {
      setCurrentMonthYear(visibleCalendarDays[0].monthYear);
    }
  }, [selectedDateIso, visibleCalendarDays, calendarDays]);

  // Fetch schedules for the branch roster once so selecting a barber does not
  // trigger a separate 30-day schedule request for that barber.
  // Keyed by branch, roster, and date window so re-renders with a new array
  // identity (or a same-day mode switch) do not show "Checking..." again.
  const loadedScheduleKeyRef = useRef('');
  useEffect(() => {
    if (!effectiveBranchId || initialBarbers.length === 0) {
      setBarberSchedules({});
      setIsLoadingSchedule(false);
      loadedScheduleKeyRef.current = '';
      return;
    }

    const todayIso = getManilaDateIso();
    const scheduleKey = `${effectiveBranchId}|${todayIso}|${barberIdsKey}`;
    if (loadedScheduleKeyRef.current === scheduleKey) {
      setIsLoadingSchedule(false);
      return;
    }

    const controller = new AbortController();
    const fetchSchedule = async () => {
      setIsLoadingSchedule(true);
      try {
        const endIso = addDaysToIsoDate(todayIso, 30);
        const schedules = await bookingService.fetchBarberSchedules(
          effectiveBranchId,
          todayIso,
          endIso,
          controller.signal,
        );
        if (!controller.signal.aborted) {
          setBarberSchedules(schedules);
          loadedScheduleKeyRef.current = scheduleKey;
        }
      } catch (err: any) {
        if (err?.code !== 'ERR_CANCELED' && err?.name !== 'CanceledError' && !controller.signal.aborted) {
          console.warn('[BookTab] Error fetching barber schedule:', err);
        }
      } finally {
        if (!controller.signal.aborted) setIsLoadingSchedule(false);
      }
    };
    void fetchSchedule();
    return () => controller.abort();
  }, [effectiveBranchId, barberIdsKey, initialBarbers.length]);

  // Reset selected barber if they are off duty on newly chosen date
  useEffect(() => {
    if (barberSchedule && selectedDateIso && barberSchedule.offDutyDates.includes(selectedDateIso)) {
      if (isAutoAssign || isRebooking) {
        const alternative = initialBarbers.find((b: any) => {
          const bId = Number(b.id || b.barber_id || 0);
          if (!bId || bId === selectedBarberId) return false;
          const s = barberSchedules[String(bId)];
          return s && !s.offDutyDates?.includes(selectedDateIso) && s.dateDetails?.[selectedDateIso]?.isOnlineBookingEnabled === true;
        });
        if (alternative) {
          setSelectedBarber({
            ...alternative,
            id: alternative.barber_id ?? alternative.id,
            barber_id: alternative.barber_id ?? alternative.id,
            name: alternative.name,
            image: alternative.image || alternative.profile_picture || null,
            is_auto_assigned: true,
            assigned_barber_name: alternative.name,
          });
          return;
        }
      }
      if (!isBookAheadAvailabilityFlow) {
        setSelectedBarber(null);
      }
    }
  }, [barberSchedule, selectedDateIso, isAutoAssign, isRebooking, isBookAheadAvailabilityFlow, initialBarbers, barberSchedules, selectedBarberId, setSelectedBarber]);

  // Fetch availability once for all candidate barbers, then derive the selected
  // barber's/group's slots locally. This avoids refetching when only the barber changes.
  useEffect(() => {
    if (!effectiveBranchId || !selectedDateIso || !barberIdsKey) {
      setBarberAvailabilityMap({});
      setDateBarbers([]);
      setBarberSlotAvailabilityMap({});
      setAvailableSlots([]);
      setBusyPeriods([]);
      setAvailabilityError(null);
      setAvailabilityLoadedKey('');
      setIsLoadingSlots(false);
      setIsBackgroundRefreshing(false);
      // Drop any response still in flight so it cannot repopulate the cleared state.
      activeFetchKeyRef.current = '';
      return;
    }

    const sKey = serviceKey || 'all';
    const bKey = barberIdsKey || 'all';
    const cacheKey = makeCacheKey('slot-availability', effectiveBranchId, selectedDateIso, sKey, bKey);
    activeFetchKeyRef.current = cacheKey;

    const applyAvailabilityMap = (nextMap: Record<string, BatchBarberAvailability>) => {
      setBarberAvailabilityMap(nextMap);
      setAvailabilityLoadedKey(cacheKey);

      const dateRoster = [...initialBarbersById.values()].filter((barber) => (
        nextMap[String(Number(barber.id || barber.barber_id || 0))] !== undefined
      ));
      setDateBarbers(dateRoster);

      const slotMap = new Map<string, AvailabilitySlot>();
      const allBusy: AvailabilityResponse['busyPeriods'] = [];
      const barberSlotsMap: Record<number, string[]> = {};
      for (const [barberId, availability] of Object.entries(nextMap)) {
        const isOnlineBookable = availability.isOnDuty !== false
          && availability.isOnlineBookingEnabled !== false;
        const slots = isOnlineBookable ? (availability.availableSlots || []) : [];
        barberSlotsMap[Number(barberId)] = slots.map((slot) => slot.hour);
        if (!isOnlineBookable) continue;
        for (const slot of slots) {
          if (!slotMap.has(slot.hour)) slotMap.set(slot.hour, slot);
        }
        allBusy.push(...(availability.busyPeriods || []));
      }

      setBarberSlotAvailabilityMap(barberSlotsMap);

      // Scoping to a specific barber is only active during explicit book-ahead flow.
      // In the standard customer flow, date and time slots reflect the union of all
      // online barbers so customers can freely choose their desired appointment time.
      const shouldScopeToSpecificBarber = Boolean(
        isBookAheadAvailabilityFlow && !isAutoAssign && selectedBarberId > 0
      );
      const selectedAvailability = shouldScopeToSpecificBarber
        ? nextMap[String(selectedBarberId)]
        : undefined;
      const selectedBarberIsOnlineBookable = selectedAvailability
        ? selectedAvailability.isOnDuty !== false && selectedAvailability.isOnlineBookingEnabled !== false
        : false;

      if (selectedAvailability) {
        setAvailableSlots(
          [...(selectedBarberIsOnlineBookable ? (selectedAvailability.availableSlots || []) : [])]
            .sort((a, b) => timeToMinutes(a.hour) - timeToMinutes(b.hour)),
        );
        setBusyPeriods(selectedAvailability.busyPeriods || []);
      } else {
        setAvailableSlots(Array.from(slotMap.values()).sort((a, b) => timeToMinutes(a.hour) - timeToMinutes(b.hour)));
        setBusyPeriods(allBusy);
      }
    };

    // A request for this key is already in flight (e.g. the selected barber changed
    // while it loads). Reuse it: it applies the latest selection via the ref below.
    applyAvailabilityRef.current = applyAvailabilityMap;
    if (inFlightAvailabilityKeyRef.current === cacheKey) return;

    const cachedEntry = customerCache.get<{ barbers?: Record<string, BatchBarberAvailability> }>(cacheKey);
    const hasCachedData = Boolean(cachedEntry?.data?.barbers || cachedEntry?.data);

    if (hasCachedData) {
      const nextMap = (cachedEntry!.data.barbers || cachedEntry!.data) as Record<string, BatchBarberAvailability>;
      applyAvailabilityMap(nextMap);
      setAvailabilityError(null);
      if (!cachedEntry!.isStale && availabilityRetryToken === 0) {
        setIsLoadingSlots(false);
        setIsBackgroundRefreshing(false);
        return;
      }
      // Stale data exists: keep rendered slots and silently revalidate in the background
      setIsLoadingSlots(false);
      setIsBackgroundRefreshing(true);
    } else {
      // Cold load: no cached slots exist for this date
      setIsLoadingSlots(true);
      setIsBackgroundRefreshing(false);
    }

    const barberIds = barberIdsKey.split(',').map(Number).filter(Boolean);
    inFlightAvailabilityKeyRef.current = cacheKey;

    // Deliberately not aborted on cleanup: a selection change must not cancel and
    // restart the same cache-keyed request. Stale results are dropped by key below.
    void bookingService.fetchBatchAvailability(
      effectiveBranchId,
      selectedDateIso,
      selectedServiceIds,
      barberIds,
      undefined,
      { throwOnError: true, forceRevalidate: availabilityRetryToken > 0 },
    ).then((data) => {
      if (activeFetchKeyRef.current !== cacheKey) return;
      applyAvailabilityRef.current?.(data.barbers || {});
      setAvailabilityError(null);
    }).catch((err: any) => {
      if (activeFetchKeyRef.current !== cacheKey || err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') return;
      console.error('[BookTab] Failed to fetch batch slots:', err);
      // If we already had cached data rendered, do NOT wipe it out!
      if (!hasCachedData) {
        setBarberAvailabilityMap({});
        setDateBarbers([]);
        setBarberSlotAvailabilityMap({});
        setAvailableSlots([]);
        setBusyPeriods([]);
      }
      setAvailabilityError('Could not load barber availability. Check your connection and try again.');
    }).finally(() => {
      if (inFlightAvailabilityKeyRef.current === cacheKey) inFlightAvailabilityKeyRef.current = '';
      if (activeFetchKeyRef.current === cacheKey) {
        setIsLoadingSlots(false);
        setIsBackgroundRefreshing(false);
      }
    });
  }, [effectiveBranchId, selectedDateIso, serviceKey, barberIdsKey, selectedServiceIds, initialBarbersById, selectedBarberId, isAutoAssign, isBookAheadAvailabilityFlow, availabilityRetryToken]);

  // Prefetch Step 2: 14-day schedule and first available day slots when services are selected
  useEffect(() => {
    if (!effectiveBranchId || initialBarbers.length === 0) return;
    if (selectedServices.length > 0) {
      const todayIso = getManilaDateIso();
      const next14Iso = addDaysToIsoDate(todayIso, 14);
      void bookingService.fetchBarberSchedules(effectiveBranchId, todayIso, next14Iso);

      const firstDateIso = visibleCalendarDays[0]?.isoDate || todayIso;
      const activeBarberIds = initialBarbers
        .filter((b: any) => {
          const isOff = b.is_off_today === true;
          const isWalkIn = b.is_online_booking_enabled_today === false || b.isOnlineBookingEnabledToday === false;
          return !isOff && !isWalkIn;
        })
        .map((b: any) => Number(b.id || b.barber_id))
        .filter(Boolean);

      if (activeBarberIds.length > 0) {
        void bookingService.fetchBatchAvailability(
          effectiveBranchId,
          firstDateIso,
          selectedServiceIds,
          activeBarberIds,
        ).catch(() => {});
      }
    }
  }, [effectiveBranchId, selectedServices.length, initialBarbers, visibleCalendarDays, selectedServiceIds]);

  // Prefetch detailed slots for the adjacent next date when a calendar date is picked
  useEffect(() => {
    if (!effectiveBranchId || !selectedDateIso || initialBarbers.length === 0) return;
    const nextDateIso = addDaysToIsoDate(selectedDateIso, 1);
    const activeBarberIds = initialBarbers
      .filter((b: any) => {
        const isOff = b.is_off_today === true;
        const isWalkIn = b.is_online_booking_enabled_today === false || b.isOnlineBookingEnabledToday === false;
        return !isOff && !isWalkIn;
      })
      .map((b: any) => Number(b.id || b.barber_id))
      .filter(Boolean);

    if (activeBarberIds.length > 0) {
      void bookingService.fetchBatchAvailability(
        effectiveBranchId,
        nextDateIso,
        selectedServiceIds,
        activeBarberIds,
      ).catch(() => {});
    }
  }, [effectiveBranchId, selectedDateIso, initialBarbers, selectedServiceIds]);


  const handleBook = async (confirmed = false) => {
    const branchId = effectiveBranch?.id || effectiveBranch?.branch_id;
    let activeBarber = selectedBarber;
    if (isRebooking && (!activeBarber || !activeBarber.id)) {
      const fallbackBarber = initialBarbers.find((b: any) => {
        const bId = Number(b.id || b.barber_id || 0);
        const s = barberSchedules[String(bId)];
        if (!s) return false;
        const isOff = s.offDutyDates?.includes(selectedDateIso) || s.dateDetails?.[selectedDateIso]?.isOff;
        const isOnline = s.dateDetails?.[selectedDateIso]?.isOnlineBookingEnabled;
        return !isOff && isOnline === true;
      });

      if (fallbackBarber) {
        activeBarber = {
          ...fallbackBarber,
          id: fallbackBarber.barber_id ?? fallbackBarber.id,
          barber_id: fallbackBarber.barber_id ?? fallbackBarber.id,
          name: fallbackBarber.name,
          is_auto_assigned: true,
          assigned_barber_name: fallbackBarber.name,
        };
        setSelectedBarber(activeBarber);
      }
    }

    // Guard against assigning a walk-in-only barber to an online booking
    if (activeBarber && activeBarber.id && selectedDateIso) {
      const bId = Number(activeBarber.id || activeBarber.barber_id || 0);
      const s = barberSchedules[String(bId)];
      if (s) {
        const isOff = s.offDutyDates?.includes(selectedDateIso) || s.dateDetails?.[selectedDateIso]?.isOff;
        const isOnline = s.dateDetails?.[selectedDateIso]?.isOnlineBookingEnabled;
        if (isOff || isOnline === false) {
          addToast({
            type: 'error',
            title: 'Barber Unavailable for Online Booking',
            message: `${activeBarber.name || 'The selected barber'} is assigned for walk-ins only on this date. Please select an online-eligible barber.`,
          });
          setBookingStep(isMobile ? 4 : 3);
          return;
        }
      }
    }

    if (selectedServiceIds.length === 0 || !activeBarber || !selectedDate || !selectedTime || !branchId) {
      if (!activeBarber && isRebooking) {
        addToast({
          type: 'error',
          title: 'Barber Unavailable',
          message: 'No available barber was found for this date. Please choose another date or barber.',
        });
        setBookingStep(isMobile ? 4 : 3);
        return;
      }
      addToast({
        type: 'error',
        title: 'Selection Missing',
        message: 'Please select at least one service, barber, date and time slot.',
      });
      return;
    }

    if (isRebooking) {
      if (!rebookingQueueId) {
        addToast({ type: 'error', title: 'Rebooking Unavailable', message: 'The cancelled appointment could not be identified. Please reopen the cancellation notice.' });
        return;
      }

      const rebookingBarberId = Number(
        activeBarber.id ||
        activeBarber.barber_id ||
        activeBarber.assigned_barber_id ||
        0
      );
      const rebookingBarberName = activeBarber?.is_auto_assigned
        ? (activeBarber?.assigned_barber_name || activeBarber?.name || 'Replacement Barber')
        : (activeBarber?.name || 'Replacement Barber');

      const rebookingDate = /^\d{4}-\d{2}-\d{2}$/.test(String(selectedDate))
        ? String(selectedDate)
        : calendarDays.find((day: any) => day.fullDate === selectedDate)?.isoDate || String(selectedDate);
      if (!rebookingBarberId || !rebookingDate) {
        addToast({ type: 'error', title: 'Rebooking Selection Missing', message: 'Choose an active barber, date, and time before confirming.' });
        return;
      }

      setIsProcessing(true);
      try {
        const response = await api.post('/api/queue/emergency-rebook', {
          queueId: rebookingQueueId,
          selectedSlot: {
            barberId: rebookingBarberId,
            barberName: rebookingBarberName,
            date: rebookingDate,
            time: selectedTime,
          },
        });
        addToast({ type: 'success', title: 'Appointment Rebooked', message: 'Your appointment was transferred successfully. Your ₱50 reservation deposit remains credited.' });
        onRebookingCompleted?.();
        onJoinQueue?.({ ...response.data, barber_id: rebookingBarberId, barber_name: rebookingBarberName });
      } catch (err: any) {
        addToast({ type: 'error', title: 'Rebooking Failed', message: err.response?.data?.error || err.response?.data?.message || 'Unable to confirm the replacement appointment. Please try again.' });
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    if (!hasReadTerms) {
      addToast({
        type: 'warning',
        title: 'Terms Review Required',
        message: 'Please review and scroll to the bottom of the Terms of Service & Booking Policy before proceeding.',
        duration: 5000,
      });
      setIsTermsModalOpen(true);
      return;
    }

    if (!termsAgreed) {
      addToast({
        type: 'warning',
        title: 'Terms Agreement Required',
        message: 'Please agree to the Terms of Service and Booking Policy to proceed.',
        duration: 5000,
      });
      setIsTermsModalOpen(true);
      return;
    }

    if (!receiptFile || !receiptFilePreview) {
      addToast({
        type: 'warning',
        title: 'Payment Proof Required',
        message: 'Please pay the ₱50.00 reservation fee and upload your payment receipt screenshot to proceed.',
        duration: 5000,
      });
      return;
    }

    if (false && !isBypassActive && (receiptQualityError || receiptImageQualityError || receiptDateError || !receiptLayoutValid || Number(receiptOcrConfidence) < 60)) {
      addToast({
        type: 'error',
        title: 'Invalid Receipt Screenshot',
        message: receiptDateError || receiptImageQualityError || receiptQualityError || 'Please upload an official, clear GCash or Maya payment confirmation screen.',
        duration: 6000,
      });
      return;
    }

    if (!isBypassActive && isReceiptAmountInsufficient) {
      addToast({
        type: 'warning',
        title: 'Reservation Fee Incomplete',
        message: `You booked ${bookingMode === 'group' ? guests.length : 1} guest(s) (Required: ₱${requiredReservationFee.toFixed(2)}), but verified payment is only ₱${detectedReservationFee.toFixed(2)}. Add another payment screenshot.`,
        duration: 6000,
      });
      fileInputRef.current?.click();
      return;
    }

    if (availablePaymentMethods.length === 0 || !currentMethodObj) {
      addToast({
        type: 'error',
        title: 'Payment Unavailable',
        message: 'No payment methods are currently available. Please contact the shop for assistance.',
      });
      return;
    }

    const activeProvider = getPaymentProvider(selectedEnrichedMethod.id);
    const cleanRef = (detectedReference || referenceNumber).trim().replace(/\s+/g, '');
    const isRefValid = activeProvider.category === 'bank'
      ? /^[A-Za-z0-9-]{8,32}$/.test(cleanRef)
      : /^\d{9,13}$/.test(cleanRef);

    if (!cleanRef || !isRefValid) {
      addToast({
        type: 'warning',
        message: activeProvider.category === 'bank'
          ? `Please enter a valid reference number for ${currentMethodObj.name}.`
          : `Please enter a valid 9 to 13-digit ${currentMethodObj.name} reference number.`,
      });
      return;
    }

    if (false && !isBypassActive && isOcrMismatch) {
      addToast({
        type: 'error',
        title: isReceiptNotRecognized ? 'Invalid Receipt Screenshot' : 'Reference Number Mismatch',
        message: isReceiptNotRecognized
          ? 'The uploaded picture is not a receipt and does not match the manual entry of reference number.'
          : 'Entered reference number does not match the uploaded receipt screenshot.',
        duration: 6000,
      });
      return;
    }

    if (false && !isBypassActive && isDuplicateRef) {
      addToast({
        type: 'error',
        title: 'Duplicate Reference Number',
        message: duplicateRefMessage || 'This reference number or receipt image has already been submitted for another booking.',
        duration: 6000,
      });
      return;
    }

    if (false && !isBypassActive && !isOcrVerified) {
      addToast({
        type: 'warning',
        title: 'Receipt Verification Required',
        message: 'Please wait for the uploaded receipt to be verified before confirming your booking.',
        duration: 5000,
      });
      return;
    }

    if (!confirmed) {
      setIsConfirmModalOpen(true);
      return;
    }

    if (bookingMode === 'group') {
      if (guests.length === 0) {
        addToast({
          type: 'error',
          title: 'No Guests Scheduled',
          message: 'Please schedule at least one guest before confirming your reservation.',
        });
        return;
      }

      setIsProcessing(true);

      try {
        const unifiedDate = selectedDateIso || selectedDate || guests[0]?.scheduledDate || '';
        const response = await api.post('/api/queue/group-join', {
          branchId,
          isGroup: true,
          preferredDate: unifiedDate,
          baseTimeSlot: baseTimeSlot || selectedTime || guests[0]?.scheduledTime,
          isStaggered: isStaggeredGroupMode,
          guests: guests.map(g => ({
            guestName: g.guestName,
            barberId: Number(g.barberId),
            serviceIds: g.services.map(s => Number(s.id ?? s.service_id)),
            preferredDate: unifiedDate,
            preferredTime: g.scheduledTime,
            scheduledStartTime: g.scheduledTime,
            estimatedEndTime: g.estimatedEndTime,
            durationMinutes: g.durationMinutes,
          })),
          referenceNumber: cleanRef,
          imageHash: isBypassActive ? undefined : (primaryReceiptHash || undefined),
          imageHashes: isBypassActive ? undefined : receiptImageHashes,
          proofImageUrls: isBypassActive ? undefined : receiptFilePreviews,
          proofImageUrl: primaryReceiptPreview || undefined,
          agreedToTerms: true,
          paymentMethod: currentMethodObj.name,
          paymentMethodId: currentMethodObj.id || currentMethodObj.key,
          paymentProvider: selectedEnrichedMethod.id,
        });

        if (response.data) {
          customerCache.markDomainStale('slot-availability');
          customerCache.markDomainStale('reservation-history');
          customerCache.markDomainStale('queue-position');
          window.dispatchEvent(new CustomEvent('demoshop:reservations-changed', {
            detail: { branchId: Number(branchId), date: selectedDateIso },
          }));

          addToast({
            type: 'success',
            title: 'Group Booking Submitted!',
            message: `Group booking for ${guests.length} guests submitted! Awaiting cashier verification.`,
            duration: 6000,
          });
          if (onJoinQueue) {
            const firstEntry = response.data?.entries?.[0];
            onJoinQueue({
              ...(firstEntry || {}),
              ...response.data,
              id: firstEntry?.id,
              isGroup: true,
              is_group: true,
              total_guests: guests.length,
              total_deposit: groupTotalDeposit,
              group_booking_id: response.data?.groupBookingId,
              branch_id: branchId,
              reference_number: cleanRef,
              group_entries: response.data?.entries,
            });
          }
        }
      } catch (err: any) {
        const responseData = err.response?.data;
        if (responseData?.errorType === 'RaceCondition' || responseData?.errorType === 'SlotConflict') {
          addToast({
            type: 'warning',
            title: 'Slot Busy',
            message: responseData.message || responseData.error || 'A selected slot was just taken. Please adjust.',
            duration: 6000,
          });
          return;
        }
        const errorMsg = responseData?.error || responseData?.message || 'Failed to submit group booking. Please try again.';
        if (/receipt|reference|recipient|payment|transaction date/i.test(errorMsg)) {
          setReceiptValidationResults(prev => {
            const index = prev.findIndex(result => result.status === 'verified' || result.status === 'checking' || result.status === 'pending-review');
            if (index < 0) return prev;
            const next = [...prev];
            next[index] = { ...next[index], status: 'rejected', failureCode: /reference/i.test(errorMsg) ? 'reference-used' : 'unreadable', message: errorMsg };
            return next;
          });
          return;
        }
        addToast({
          type: 'error',
          title: 'Booking Failed',
          message: errorMsg,
          duration: 6000,
        });
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    const barberId = selectedBarber.id || selectedBarber.barber_id;

    // Find full ISO date and enforce the two-hour reservation lead time again
    // at confirmation in case availability became stale after the slot was selected.
    const bookingDate = selectedDateIso;
    if (!bookingDate || !isAtLeastTwoHoursAhead(bookingDate, selectedTime)) {
      addToast({
        type: 'warning',
        title: 'Reservation Too Soon',
        message: 'Bookings must be made at least 2 hours before the selected time.',
        duration: 5000,
      });
      return;
    }

    setIsProcessing(true);
    setReservationSubmissionState('submitting');

    try {
      const idempotencyKey = reservationIdempotencyKeyRef.current || crypto.randomUUID();
      reservationIdempotencyKeyRef.current = idempotencyKey;
      const response = await api.post('/api/queue/join', {
        branchId,
        barberId,
        serviceIds: selectedServiceIds,
        preferredTime: selectedTime,
        preferredDate: bookingDate,
        referenceNumber: cleanRef,
        imageHash: isBypassActive ? undefined : (primaryReceiptHash || undefined),
        imageHashes: isBypassActive ? undefined : receiptImageHashes,
        proofImageUrls: isBypassActive ? undefined : receiptFilePreviews,
        proofImageUrl: primaryReceiptPreview || undefined,
        agreedToTerms: true,
        paymentMethod: currentMethodObj.name,
        paymentMethodId: currentMethodObj.id || currentMethodObj.key,
        paymentProvider: selectedEnrichedMethod.id,
        idempotencyKey,
      });

      if (response.data) {
        reservationIdempotencyKeyRef.current = null;
        setReservationSubmissionState('idle');

        customerCache.markDomainStale('slot-availability');
        customerCache.markDomainStale('reservation-history');
        customerCache.markDomainStale('queue-position');
        window.dispatchEvent(new CustomEvent('demoshop:reservations-changed', {
          detail: { branchId: Number(branchId), date: selectedDateIso },
        }));

        addToast({
          type: 'success',
          title: 'Payment Proof Submitted!',
          message: 'Payment details submitted! Awaiting cashier verification.',
          duration: 6000,
        });
        if (onJoinQueue) {
          onJoinQueue({
            ...response.data,
            barber_id: selectedBarber.id || selectedBarber.barber_id,
            barber_name: selectedBarber.name || response.data?.barber_name,
            barber: selectedBarber,
            branch_id: branchId,
            service_id: selectedServiceIds[0],
            service_ids: selectedServiceIds,
            reference_number: cleanRef,
          });
        }
      }
    } catch (err: any) {
      const responseData = err.response?.data;
      if (!err.response) {
        setReservationSubmissionState('unknown');
        addToast({
          type: 'warning',
          title: 'Checking Reservation Submission',
          message: 'We could not confirm the server response. Your reservation may still be pending. Submit again to safely check the same request.',
          duration: 8000,
        });
        return;
      }
      reservationIdempotencyKeyRef.current = null;
      setReservationSubmissionState('idle');

      if (responseData?.errorType === 'RaceCondition') {
        addToast({
          type: 'warning',
          title: 'Slot Busy',
          message: responseData.message || 'This barber just got busy! Please try clicking again.',
          duration: 6000
        });
        return;
      }

      const errorMsg = responseData?.error || responseData?.message || 'Failed to join queue. Please try again.';
      if (/receipt|reference|recipient|payment|transaction date/i.test(errorMsg)) {
        setReceiptValidationResults(prev => {
          const index = prev.findIndex(result => result.status === 'verified' || result.status === 'checking' || result.status === 'pending-review');
          if (index < 0) return prev;
          const next = [...prev];
          next[index] = { ...next[index], status: 'rejected', failureCode: /reference/i.test(errorMsg) ? 'reference-used' : 'unreadable', message: errorMsg };
          return next;
        });
        return;
      }
      addToast({
        type: 'error',
        title: 'Booking Failed',
        message: errorMsg,
        duration: 6000
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Barber Status Calculation:
  // - 'available': Active and free (Clickable)
  // - 'serving' / 'busy': In service with a client right now, but fully bookable for future appointment slots (Clickable)
  // - 'day_off' / 'off duty' / 'leave': Off roster, on leave, or off duty (Disabled / Unclickable)
  const selectedDateLabel = useMemo(() => {
    if (!selectedDateIso) return 'selected date';
    const date = new Date(`${selectedDateIso}T12:00:00Z`);
    return Number.isNaN(date.getTime())
      ? selectedDateIso
      : new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'Asia/Manila',
      }).format(date);
  }, [selectedDateIso]);

  const isBarberAvailable = (barber: any): boolean => {
    const raw = (barber.status || '').toString().toLowerCase().trim();
    if (
      raw === 'day off' ||
      raw === 'day_off' ||
      raw === 'off duty' ||
      raw === 'off_duty' ||
      raw === 'offduty' ||
      raw === 'leave' ||
      raw === 'on leave' ||
      raw === 'on_leave' ||
      raw === 'break' ||
      raw === 'on break' ||
      raw === 'on_break' ||
      raw === 'unavailable' ||
      raw === 'inactive'
    ) {
      return false;
    }
    return true;
  };

  const barbersWithStatus = useMemo(() => {
    const listToUse = selectedDateIso && availabilityLoadedKey === availabilityKey ? dateBarbers : initialBarbers;
    const mapped = listToUse.map(barber => {
      const barberId = Number(barber.id || barber.barber_id);
      const status = barber.status !== undefined ? barber.status : 'Available';
      const available = isBarberAvailable({ ...barber, status });
      const s = (status || '').toString().trim();
      const raw = s.toLowerCase();
      const isServingNow = Number(barber.serving_count || 0) > 0 || raw === 'serving' || raw === 'busy' || raw === 'in service' || raw === 'in_service';

      const isOnDutyToday = barber.isOnDutyToday !== undefined
        ? Boolean(barber.isOnDutyToday)
        : (barber.is_on_duty_today !== undefined ? Boolean(barber.is_on_duty_today) : !barber.is_off_today);

      const isOnlineBookingEnabledToday = barber.isOnlineBookingEnabledToday !== undefined
        ? Boolean(barber.isOnlineBookingEnabledToday)
        : (barber.is_online_booking_enabled_today !== undefined ? Boolean(barber.is_online_booking_enabled_today) : Boolean(barber.is_online_booking_enabled));

      const isExplicitOffDuty = raw === 'day off' || raw === 'day_off' || raw === 'off duty' || raw === 'off_duty' || raw === 'offduty';
      const isOffScheduleToday = !isOnDutyToday || barber.is_off_today === true || isExplicitOffDuty;

      // The roster fields above describe the barber's current day. Once a
      // customer has selected a date, the batch availability response is the
      // source of truth for that requested date. This prevents a Sunday day-off
      // status from incorrectly disabling a barber for Monday's booking.
      const selectedDateAvailability = selectedDateIso
        ? barberAvailabilityMap[String(barberId)]
        : undefined;
      const hasSelectedDateAvailability = Boolean(selectedDateAvailability);
      const hasSelectedDateSchedule = selectedDateAvailability?.isOnDuty !== undefined
        || selectedDateAvailability?.isOnlineBookingEnabled !== undefined;
      const isUnavailableOnSelectedDate = selectedDateAvailability?.isUnavailable === true;
      const isWalkInOnlyOnSelectedDate = hasSelectedDateSchedule
        && selectedDateAvailability?.isOnDuty === true
        && selectedDateAvailability?.isOnlineBookingEnabled === false;

      // Slot-specific availability check
      const hasSlotAvailabilityInfo = barberSlotAvailabilityMap[barberId] !== undefined;
      const selectedTimeMinutes = selectedTime ? timeToMinutes(selectedTime) : Number.NaN;
      const isAvailableAtSelectedTime = selectedTime
        ? (hasSlotAvailabilityInfo
            ? barberSlotAvailabilityMap[barberId].some((slot) => timeToMinutes(slot) === selectedTimeMinutes)
            : true)
        : true;
      const selectedServiceEndMinutes = Number.isFinite(selectedTimeMinutes)
        ? selectedTimeMinutes + Math.max(1, combinedDuration || 30)
        : Number.NaN;
      const blockingPeriod = selectedDateAvailability?.busyPeriods?.find((period) => {
        if (!Number.isFinite(selectedTimeMinutes) || !Number.isFinite(selectedServiceEndMinutes)) return false;
        const periodStart = timeToMinutes(period.startTime);
        const periodEnd = timeToMinutes(period.endTime);
        return selectedTimeMinutes < periodEnd && periodStart < selectedServiceEndMinutes;
      });

      // Companion guest claim check for this specific barber at the selected time & date
      let isClaimedByOtherCompanion = false;
      let companionClaimLabel = '';
      if (bookingMode === 'group' && selectedTime) {
        const targetIdx = editingGuestIndex !== null ? editingGuestIndex : activeGuestIndex;
        const effectiveDate = selectedDateIso || selectedDate;
        const candidateStart = timeToMinutes(selectedTime);
        const candidateDuration = combinedDuration || (selectedServices || []).reduce((acc: number, s: any) => {
          return acc + (getServiceDurationMinutes(s));
        }, 0) || 30;
        const candidateEnd = candidateStart + candidateDuration;

        for (const g of guests) {
          if (g.guestIndex === targetIdx) continue;
          if (!g.barberId || !g.scheduledTime) continue;
          if (String(g.barberId) !== String(barberId)) continue;
          if (effectiveDate && g.scheduledDate && g.scheduledDate !== effectiveDate) continue;

          const otherStart = timeToMinutes(g.scheduledTime);
          if (!Number.isFinite(otherStart) || otherStart === Number.MAX_SAFE_INTEGER) continue;
          const otherDuration = (g.services || []).reduce((acc: number, s: any) => {
            return acc + (getServiceDurationMinutes(s));
          }, 0) || 30;
          const otherEnd = otherStart + otherDuration;

          if (candidateStart < otherEnd && otherStart < candidateEnd) {
            isClaimedByOtherCompanion = true;
            companionClaimLabel = g.guestName || `Guest ${g.guestIndex}`;
            break;
          }
        }
      }

      let statusType: 'available' | 'walkin_only' | 'serving' | 'day_off' | 'off_today' | 'busy_at_time' = 'available';
      let label = 'Available';

      if (hasSelectedDateSchedule && selectedDateAvailability?.isOnDuty === false) {
        statusType = 'off_today';
        label = 'Off on this date';
      } else if (isWalkInOnlyOnSelectedDate) {
        statusType = 'walkin_only';
        label = `Walk-in Only for ${selectedDateLabel}`;
      } else if (hasSelectedDateAvailability && isUnavailableOnSelectedDate) {
        statusType = 'off_today';
        label = 'Off on this date';
      } else if (isClaimedByOtherCompanion) {
        statusType = 'available';
        label = `Sequential (After ${companionClaimLabel})`;
      } else if (selectedTime && hasSlotAvailabilityInfo && !isAvailableAtSelectedTime) {
        statusType = 'busy_at_time';
        label = blockingPeriod
          ? `Occupied until ${blockingPeriod.endTime}`
          : `Unavailable at ${selectedTime}`;
      } else if (hasSelectedDateAvailability) {
        // The requested date is on the barber's online roster. Current-day
        // leave/rest/walk-in flags must not override this future-date result.
        statusType = 'available';
        label = 'Available';
      } else if (raw === 'leave' || raw.includes('leave')) {
        statusType = 'off_today';
        label = 'Off on this date';
      } else if (raw === 'break' || raw.includes('break')) {
        statusType = 'day_off';
        label = 'On Break';
      } else if (isOffScheduleToday) {
        statusType = 'off_today';
        label = 'Off on this date';
      } else if (isOnDutyToday && !isOnlineBookingEnabledToday) {
        statusType = 'walkin_only';
        label = 'Walk-in Today';
      } else if (!available) {
        statusType = 'day_off';
        label = 'Unavailable';
      } else {
        statusType = 'available';
        label = 'Available';
      }

      const isSlotSelectable = statusType === 'available';

      return {
        ...barber,
        isOnDutyToday,
        isOnlineBookingEnabledToday,
        isAvailable: isSlotSelectable,
        isOffDutyToday: isOffScheduleToday,
        statusType,
        statusLabel: label,
        status: label,
        blockingPeriod,
      };
    });

    return mapped.sort((a: any, b: any) => {
      // 1. Prioritize barbers available for online reservation
      const aAvailable = a.isAvailable && a.statusType === 'available';
      const bAvailable = b.isAvailable && b.statusType === 'available';
      if (aAvailable && !bAvailable) return -1;
      if (!aAvailable && bAvailable) return 1;

      // 2. Prioritize customer's recent barber among available
      const aRecent = Boolean(
        (recentBarberId && Number(a.id || a.barber_id) === Number(recentBarberId)) ||
        (recentBarberName && a.name && a.name.trim().toLowerCase() === recentBarberName)
      );
      const bRecent = Boolean(
        (recentBarberId && Number(b.id || b.barber_id) === Number(recentBarberId)) ||
        (recentBarberName && b.name && b.name.trim().toLowerCase() === recentBarberName)
      );
      if (aRecent && !bRecent) return -1;
      if (!aRecent && bRecent) return 1;

      // 3. Walk-in only before off-duty
      if (a.statusType === 'walkin_only' && b.statusType !== 'walkin_only') return -1;
      if (a.statusType !== 'walkin_only' && b.statusType === 'walkin_only') return 1;

      return 0;
    });
  }, [
    dateBarbers,
    initialBarbers,
    serviceKey,
    barberAvailabilityMap,
    barberSlotAvailabilityMap,
    selectedTime,
    bookingMode,
    editingGuestIndex,
    activeGuestIndex,
    selectedDateIso,
    selectedDate,
    combinedDuration,
    selectedServices,
    guests,
    recentBarberId,
    recentBarberName,
  ]);

  // Auto-assignment must use the selected date/time availability returned by
  // the batch endpoint. The roster status above is primarily a display status
  // and may describe today even when the customer is booking a future date.
  // One busy barber must not make the whole "Any Available Barber" option fail.
  const autoAssignableBarbers = useMemo(() => {
    const selectedSlotMinutes = selectedTime ? timeToMinutes(selectedTime) : Number.NaN;
    const targetGuestIndex = editingGuestIndex !== null ? editingGuestIndex : activeGuestIndex;
    const requestedDuration = Math.max(1, combinedDuration || 30);
    const requestedEnd = selectedTime ? selectedSlotMinutes + requestedDuration : Number.NaN;

    const isClaimedByAnotherGroupGuest = (barberId: number): boolean => {
      if (bookingMode !== 'group' || !selectedTime || !Number.isFinite(selectedSlotMinutes)) return false;

      return guests.some((guest) => {
        if (guest.guestIndex === targetGuestIndex || String(guest.barberId) !== String(barberId)) return false;

        const guestDate = String(guest.scheduledDate || '').trim();
        const guestDateIso = /^\d{4}-\d{2}-\d{2}$/.test(guestDate)
          ? guestDate
          : calendarDays.find((day: any) => day.fullDate === guestDate)?.isoDate;
        if (guestDateIso !== selectedDateIso || !guest.scheduledTime) return false;

        const guestStart = timeToMinutes(guest.scheduledTime);
        const guestDuration = Math.max(
          1,
          (guest.services || []).reduce((total: number, service: any) => total + getServiceDurationMinutes(service), 0) || 30,
        );
        const guestEnd = guestStart + guestDuration;
        return selectedSlotMinutes < guestEnd && guestStart < requestedEnd;
      });
    };

    return barbersWithStatus.filter((barber) => {
      const barberId = Number(barber.id || barber.barber_id);
      const availableSlots = barberSlotAvailabilityMap[barberId];

      if (selectedTime) {
        if (!Array.isArray(availableSlots) || !Number.isFinite(selectedSlotMinutes)) return false;
        const hasSelectedSlot = availableSlots.some((slot) => timeToMinutes(slot) === selectedSlotMinutes);
        if (!hasSelectedSlot) return false;
      } else if (!barber.isAvailable) {
        return false;
      }

      // Do not assign the same physical barber to overlapping guests in the
      // current group, even if the roster/status projection is stale.
      if (isClaimedByAnotherGroupGuest(barberId)) return false;

      // This status means another guest in the same group already claimed
      // this barber at the selected time. A normal occupied barber is already
      // excluded by the selected-slot availability check above.
      if (barber.statusType === 'busy_at_time') return false;

      // Rotation metadata now describes the selected date, so walk-in-only
      // barbers must never be auto-assigned for an online reservation.
      if (barber.statusType === 'walkin_only') return false;

      return true;
    });
  }, [
    activeGuestIndex,
    barberSlotAvailabilityMap,
    barbersWithStatus,
    bookingMode,
    calendarDays,
    combinedDuration,
    editingGuestIndex,
    guests,
    selectedDateIso,
    selectedTime,
  ]);

  const selectedDay = visibleCalendarDays.find((day: any) => day.isoDate === selectedDateIso) || calendarDays.find((day: any) => day.isoDate === selectedDateIso);
  const shouldScopeToSpecificBarber = Boolean(
    isBookAheadAvailabilityFlow && !isAutoAssign && selectedBarberId > 0
  );
  const selectedBarberAvailability = shouldScopeToSpecificBarber
    ? barberAvailabilityMap[String(selectedBarberId)]
    : undefined;
  const calendarSlots = selectedBarberAvailability
    ? (selectedBarberAvailability.isOnDuty !== false && selectedBarberAvailability.isOnlineBookingEnabled !== false
      ? (selectedBarberAvailability.availableSlots || [])
      : [])
    : availableSlots;
  const requestedDuration = Math.max(1, combinedDuration || 30);
  const visibleSlots = calendarSlots.filter((slot) => {
    if (!selectedDay?.isoDate || !isAtLeastTwoHoursAhead(selectedDay.isoDate, slot.hour)) {
      return false;
    }
    const slotMinutes = timeToMinutes(slot.hour);
    // Evening slots until 8:00 PM only (don't include 8:15 - 8:30)
    if (slotMinutes > 20 * 60) return false;
    // Must finish by 8:30 PM cutoff
    if (slotMinutes + requestedDuration > 20 * 60 + 30) return false;
    return true;
  });
  const allCandidateHours = useMemo(() => {
    const set = new Set<string>();
    const maxSlotMin = Math.min(20 * 60, (20 * 60 + 30) - requestedDuration);
    for (let m = 9 * 60; m <= maxSlotMin; m += 30) {
      const h24 = Math.floor(m / 60);
      const min = m % 60;
      const period = h24 >= 12 ? 'PM' : 'AM';
      const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
      set.add(`${h12}:${String(min).padStart(2, '0')} ${period}`);
    }
    visibleSlots.forEach((s) => {
      const sMin = timeToMinutes(s.hour);
      if (sMin <= 20 * 60 && sMin + requestedDuration <= 20 * 60 + 30) {
        set.add(s.hour);
      }
    });
    return Array.from(set).sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
  }, [visibleSlots, requestedDuration]);

  const candidateSlotsByPeriod = useMemo(() => {
    const groups: Record<TimePeriod, Array<{
      hour: string;
      availableBarberCount: number;
      isCapacityExhausted: boolean;
      isPartialGroupCapacity: boolean;
      isUnavailable: boolean;
      isBarberBlocked?: boolean;
      barberOccupiedUntil?: string;
      peerAvailableBarbers?: Array<any>;
    }>> = {
      morning: [],
      afternoon: [],
      evening: [],
    };

    const targetBarber = (selectedBarber && !selectedBarber.is_auto_assigned) ? selectedBarber : null;
    const targetBarberId = targetBarber ? Number(targetBarber.id || targetBarber.barber_id) : 0;
    const targetBarberAvail = targetBarberId > 0 ? barberAvailabilityMap[String(targetBarberId)] : undefined;
    const targetBarberBusy = targetBarberAvail?.busyPeriods || [];

    allCandidateHours.forEach((hour) => {
      if (selectedDay?.isoDate && !isAtLeastTwoHoursAhead(selectedDay.isoDate, hour)) {
        return;
      }

      const hourMinutes = timeToMinutes(hour);
      const slotEndMinutes = hourMinutes + requestedDuration;
      const availableBarberCount = Object.values(barberSlotAvailabilityMap)
        .filter((slots) => slots.some((s) => timeToMinutes(s) === hourMinutes)).length;
      const isGroup = bookingMode === 'group';
      const isCapacityExhausted = isGroup
        ? availableBarberCount === 0
        : !isReservationSlotAvailable(hour);
      const isPartialGroupCapacity = isGroup && availableBarberCount > 0 && availableBarberCount < partySize;

      const blockingBusyPeriod = targetBarberBusy.find((bp) => {
        const bpStart = timeToMinutes(bp.startTime);
        const bpEnd = timeToMinutes(bp.endTime);
        return hourMinutes < bpEnd && bpStart < slotEndMinutes;
      });

      const isBarberBlocked = Boolean(targetBarber && blockingBusyPeriod);
      const barberOccupiedUntil = blockingBusyPeriod?.endTime;

      const peerAvailableBarbers = isBarberBlocked
        ? barbersWithStatus.filter((b) => {
            const bId = Number(b.id || b.barber_id);
            if (bId === targetBarberId) return false;
            const bSlots = barberSlotAvailabilityMap[bId] || [];
            return b.isAvailable && bSlots.some((s) => timeToMinutes(s) === hourMinutes);
          })
        : [];

      const effectiveExhausted = isBarberBlocked ? true : isCapacityExhausted;
      const isUnavailable = effectiveExhausted;

      const minutes = timeToMinutes(hour);
      const periodKey: TimePeriod = minutes < 12 * 60
        ? 'morning'
        : minutes < 17 * 60
          ? 'afternoon'
          : 'evening';

      groups[periodKey].push({
        hour,
        availableBarberCount,
        isCapacityExhausted: effectiveExhausted,
        isPartialGroupCapacity,
        isUnavailable,
        isBarberBlocked,
        barberOccupiedUntil,
        peerAvailableBarbers,
      });
    });

    return groups;
  }, [allCandidateHours, barberAvailabilityMap, barberSlotAvailabilityMap, barbersWithStatus, bookingMode, combinedDuration, isReservationSlotAvailable, partySize, selectedBarber, selectedDay?.isoDate]);

  const isSpecificBarberDateFlow = Boolean(isBookAheadAvailabilityFlow && selectedBarber && !selectedBarber.is_auto_assigned);
  const getBarberDateStatus = (isoDate: string): { label: string; reason: string; canBook: boolean; kind: 'bookable' | 'walk-in' | 'off-duty' } => {
    if (!isSpecificBarberDateFlow) return { label: '', reason: '', canBook: true, kind: 'bookable' as const };
    if (isLoadingSchedule) return { label: 'Checking...', reason: 'Checking this barber schedule', canBook: false, kind: 'off-duty' };

    const detail = barberSchedule?.dateDetails?.[isoDate];
    if (!detail) {
      if (barberSchedule?.offDutyDates.includes(isoDate)) {
        return { label: 'Off duty', reason: 'Barber is off duty on this date', canBook: false, kind: 'off-duty' as const };
      }
      if ((barberSchedule?.onlineBookingDates || []).includes(isoDate)) {
        return { label: 'Bookable', reason: 'Available for online booking', canBook: true, kind: 'bookable' as const };
      }
      return { label: 'Unavailable', reason: 'No schedule listed for this date', canBook: false, kind: 'off-duty' as const };
    }

    if (detail.isOnDuty === false || (detail.isOff && detail.reason !== 'Online Booking Disabled' && detail.isOnDuty !== true)) {
      return { label: 'Off duty', reason: detail.reason || 'Barber is off duty', canBook: false, kind: 'off-duty' as const };
    }
    if (detail.isOnDuty === true && (detail.isOnlineBookingEnabled === false || detail.reason === 'Online Booking Disabled')) {
      return { label: 'Walk-in', reason: 'Barber is walk-in only on this date', canBook: false, kind: 'walk-in' as const };
    }
    if (detail.isOnDuty === true && detail.isOnlineBookingEnabled === true && !detail.isOff) {
      return { label: 'Bookable', reason: 'Available for online booking', canBook: true, kind: 'bookable' as const };
    }
    return { label: 'Unavailable', reason: detail.reason || 'No appointment availability listed for this date', canBook: false, kind: 'off-duty' as const };
  };

  const handleSelectTime = (time: string) => {
    if (!selectedDay?.isoDate || !isAtLeastTwoHoursAhead(selectedDay.isoDate, time)) {
      addToast({
        type: 'warning',
        title: 'Reservation Too Soon',
        message: 'Bookings must be made at least 2 hours before the selected time.',
        duration: 5000,
      });
      return;
    }

    const timeMinutes = timeToMinutes(time);
    const targetBarber = (selectedBarber && !selectedBarber.is_auto_assigned) ? selectedBarber : null;
    const targetBarberId = targetBarber ? Number(targetBarber.id || targetBarber.barber_id) : 0;
    const targetBarberAvail = targetBarberId > 0 ? barberAvailabilityMap[String(targetBarberId)] : undefined;
    const targetBarberBusy = targetBarberAvail?.busyPeriods || [];
    const requestedDuration = Math.max(1, combinedDuration || 30);
    const slotEndMinutes = timeMinutes + requestedDuration;

    const blockingBusyPeriod = targetBarberBusy.find((bp) => {
      const bpStart = timeToMinutes(bp.startTime);
      const bpEnd = timeToMinutes(bp.endTime);
      return timeMinutes < bpEnd && bpStart < slotEndMinutes;
    });

    if (targetBarber && blockingBusyPeriod) {
      const peerBarbers = barbersWithStatus.filter((b) => {
        const bId = Number(b.id || b.barber_id);
        if (bId === targetBarberId) return false;
        const bSlots = barberSlotAvailabilityMap[bId] || [];
        return b.isAvailable && bSlots.some((s) => timeToMinutes(s) === timeMinutes);
      });

      if (peerBarbers.length > 0) {
        setAlternativeBarberModal({
          isOpen: true,
          blockedBarberName: targetBarber.name,
          occupiedUntil: blockingBusyPeriod.endTime,
          slotHour: time,
          peerBarbers,
          barber: targetBarber,
        });
        return;
      }

      addToast({
        type: 'warning',
        title: 'Barber Occupied',
        message: `${targetBarber.name} is occupied until ${blockingBusyPeriod.endTime}. Please choose another time.`,
        duration: 5000,
      });
      return;
    }

    const availableBarbersCount = Object.keys(barberSlotAvailabilityMap).filter((bId) => {
      return (barberSlotAvailabilityMap[Number(bId)] || []).some((s) => timeToMinutes(s) === timeMinutes);
    }).length;

    if (availableBarbersCount === 0) {
      addToast({
        type: 'warning',
        title: 'Time Slot Unavailable',
        message: 'All reservation barbers are already booked for this time. Please choose another slot.',
        duration: 5000,
      });
      return;
    }

    if (bookingMode === 'group' && partySize > availableBarbersCount) {
      // Group size N exceeds concurrent capacity M!
      // Intercept Click: trigger CapacityResolutionModal
      const clickedMinutes = timeToMinutes(time);
      const waitCandidates = Object.entries(barberSlotAvailabilityMap)
        .filter(([, slots]) => !slots.some((slot) => timeToMinutes(slot) === clickedMinutes))
        .map(([barberId, slots]) => {
          const nextAvailableSlot = slots
            .map((slot) => timeToMinutes(slot))
            .filter((minutes) => minutes >= clickedMinutes)
            .sort((a, b) => a - b)[0];
          if (Number.isFinite(nextAvailableSlot)) return nextAvailableSlot - clickedMinutes;

          const availability = barberAvailabilityMap[barberId];
          const blockingEnd = (availability?.busyPeriods || [])
            .filter((period) => {
              const periodStart = timeToMinutes(period.startTime);
              const periodEnd = timeToMinutes(period.endTime);
              return clickedMinutes < periodEnd && periodStart < slotEndMinutes;
            })
            .map((period) => timeToMinutes(period.endTime))
            .filter((end) => end > clickedMinutes)
            .sort((a, b) => a - b)[0];
          return Number.isFinite(blockingEnd) ? blockingEnd - clickedMinutes : requestedDuration;
        });
      const estimatedWaitMinutes = waitCandidates.length > 0
        ? Math.max(0, Math.min(...waitCandidates))
        : requestedDuration;

      let nextSimultaneousSlot: NextSlotRecommendation | null = null;
      const allUniqueSlots = Array.from(
        new Set(Object.values(barberSlotAvailabilityMap).flat())
      ).sort((a, b) => timeToMinutes(a) - timeToMinutes(b));

      for (const candidate of allUniqueSlots) {
        if (timeToMinutes(candidate) <= clickedMinutes) continue;
        const candMinutes = timeToMinutes(candidate);
        const candidateCount = Object.keys(barberSlotAvailabilityMap).filter((bId) => {
          return (barberSlotAvailabilityMap[Number(bId)] || []).some((s) => timeToMinutes(s) === candMinutes);
        }).length;
        if (candidateCount >= partySize) {
          nextSimultaneousSlot = {
            time: candidate,
            availableChairs: candidateCount,
          };
          break;
        }
      }

      setCapacityModalData({
        isOpen: true,
        clickedSlot: time,
        availableBarbers: availableBarbersCount,
        estimatedWaitMinutes,
        barbers: barbersWithStatus
          .filter((barber: any) => {
            const barberId = Number(barber.id || barber.barber_id);
            const dateAvailability = barberAvailabilityMap[String(barberId)];
            const dateSchedule = barberSchedules[String(barberId)]?.dateDetails?.[selectedDateIso];
            // The public date schedule is the rotation source of truth:
            // only barbers explicitly assigned to online reservations for
            // this selected date belong in this modal.
            const isReservationAssigned = dateSchedule?.isOnlineBookingEnabled === true;
            return Boolean(dateAvailability)
              && dateAvailability.isOnDuty !== false
              && isReservationAssigned
              && barber.statusType !== 'walkin_only'
              && !String(barber.statusLabel || '').toLowerCase().includes('walk-in');
          })
          .map((barber: any) => {
            const barberId = Number(barber.id || barber.barber_id);
            const slotIsAvailable = (barberSlotAvailabilityMap[barberId] || []).some(
              (slot) => timeToMinutes(slot) === timeMinutes
            );
            return {
              id: barberId,
              name: barber.name,
              image: barber.image || barber.profile_picture,
              isAvailableAtSlot: Boolean(slotIsAvailable),
              statusLabel: barber.statusLabel,
            };
          }),
        nextSimultaneousSlot,
      });
      return;
    }

    setIsStaggeredGroupMode(false);
    setBaseTimeSlot(time);
    setSelectedTime(time);
    if (selectedBarberId > 0 && !isAutoAssign && !isBookAheadAvailabilityFlow) {
      const barberSlots = barberSlotAvailabilityMap[selectedBarberId];
      const slotMinutes = timeToMinutes(time);
      const isBarberAvailableAtTime = Array.isArray(barberSlots) && barberSlots.some((s) => timeToMinutes(s) === slotMinutes);
      if (!isBarberAvailableAtTime) {
        setSelectedBarber(null);
      }
    }
  };

  const barberRanking = rankBarbersForServices(
    barbersWithStatus,
    selectedServices.map((service) => Number(service.id ?? service.service_id)),
    (barber) => Boolean(barber.isAvailable && barber.statusType === 'available'),
  );

  const barberTopPerformanceRankMap = useMemo(() => {
    const sorted = [...barbersWithStatus].sort((a, b) => {
      const aRank = typeof a.rank === 'number' ? a.rank : null;
      const bRank = typeof b.rank === 'number' ? b.rank : null;
      if (aRank !== null && bRank !== null) return aRank - bRank;
      if (aRank !== null) return -1;
      if (bRank !== null) return 1;

      const aCuts = Number(a.completed_services_count || 0);
      const bCuts = Number(b.completed_services_count || 0);
      if (bCuts !== aCuts) return bCuts - aCuts;

      const aRating = Number(a.rating || 0);
      const bRating = Number(b.rating || 0);
      if (bRating !== aRating) return bRating - aRating;

      const aReviews = Number(a.review_count || 0);
      const bReviews = Number(b.review_count || 0);
      if (bReviews !== aReviews) return bReviews - aReviews;

      return Number(a.id || a.barber_id || 0) - Number(b.id || b.barber_id || 0);
    });

    const rankMap = new Map<number, number>();
    sorted.forEach((b, idx) => {
      const id = Number(b.id || b.barber_id);
      rankMap.set(id, typeof b.rank === 'number' ? b.rank : idx + 1);
    });
    return rankMap;
  }, [barbersWithStatus]);

  const isTimeSlotStep = !isReviewingGuests && (
    (isMobile && bookingStep === 2) ||
    (!isMobile && bookingStep === 1)
  );

  return (
    <div className={`animate-fade-in w-full ${isTimeSlotStep ? 'h-full flex flex-col pb-0 overflow-hidden' : 'space-y-4 sm:space-y-6 pb-32 sm:pb-2'}`}>
      <Modal
        isOpen={showStartOverConfirm}
        onClose={() => setShowStartOverConfirm(false)}
        title="Start Over?"
        size="sm"
        footer={
          <div className="flex flex-col-reverse sm:flex-row gap-3 w-full justify-end">
            <Button variant="outline" onClick={() => setShowStartOverConfirm(false)} className="text-xs py-3 px-6 border-white/20 text-ivory-dim">
              Keep Booking
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setShowStartOverConfirm(false);
                resetLocalBookingState();
              }}
              className="text-xs py-3 px-6 border-red-500/40 text-red-400 hover:border-red-500 hover:text-white hover:bg-red-500/20 transition-all font-semibold"
            >
              Start Over
            </Button>
          </div>
        }
      >
        <div className="py-2">
          <div className="flex items-start gap-3 p-3.5 bg-red-500/10 border border-red-500/25 rounded-sm">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <p className="text-sm text-ivory leading-relaxed">
              Starting over will clear your current booking selections. Do you want to continue?
            </p>
          </div>
        </div>
      </Modal>
      <Modal
        isOpen={Boolean(pendingBookAheadBarber)}
        onClose={() => setPendingBookAheadBarber(null)}
        title="Check Upcoming Availability"
        size="sm"
        footer={
          <div className="flex flex-col-reverse sm:flex-row gap-3 w-full justify-end">
            <Button variant="outline" onClick={() => setPendingBookAheadBarber(null)} className="text-xs border-white/20 text-ivory-dim">
              Choose Another Barber
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!pendingBookAheadBarber) return;
                setBookAheadReturnSelection({ date: selectedDate, time: selectedTime });
                setSelectedDate(null);
                setSelectedTime(null);
                setSelectedBarber(pendingBookAheadBarber);
                setIsBookAheadAvailabilityFlow(true);
                setShowSpecificBarbers(true);
                setPendingBookAheadBarber(null);
                setBookingStep(1);
              }}
              className="text-xs"
            >
              See Available Dates
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-ivory leading-relaxed">
            <span className="font-semibold text-gold">{pendingBookAheadBarber?.name}</span>{' '}
            {pendingBookAheadBarber?.statusType === 'busy_at_time'
              ? `is booked at ${String(pendingBookAheadBarber?.statusLabel || '').replace(/^Booked at\s*/i, '')} on ${selectedDate || 'this date'}.`
              : `isn't available for online booking on ${selectedDate || 'this date'}.`}
          </p>
          <p className="text-sm text-ivory-dim leading-relaxed">
            Would you like to check their upcoming dates and times? Availability will be confirmed for the date you choose.
          </p>
        </div>
      </Modal>
      <Modal
        isOpen={Boolean(alternativeBarberModal?.isOpen)}
        onClose={() => setAlternativeBarberModal(null)}
        title="Barber Unavailable at Selected Time"
        size="md"
        footer={
          <div className="flex flex-col sm:flex-row gap-2 w-full justify-between items-center">
            <Button
              variant="outline"
              onClick={() => {
                const targetBarber = alternativeBarberModal?.barber;
                if (targetBarber) {
                  setSelectedBarber(targetBarber);
                }
                setAlternativeBarberModal(null);
                const timeSlotStep = isMobile ? 2 : 1;
                setBookingStep(timeSlotStep);
              }}
              className="text-xs border-white/20 text-ivory-dim w-full sm:w-auto"
            >
              Select an Alternative Time
            </Button>
            <Button
              variant="ghost"
              onClick={() => setAlternativeBarberModal(null)}
              className="text-xs text-ivory-dim/70 hover:text-ivory w-full sm:w-auto"
            >
              Close
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="p-3.5 bg-amber-500/10 border border-amber-500/25 rounded-sm flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-sm text-ivory leading-relaxed">
              <span className="font-semibold text-gold">{alternativeBarberModal?.blockedBarberName}</span> is occupied until{' '}
              <span className="font-semibold text-ivory">{alternativeBarberModal?.occupiedUntil}</span>.
              {alternativeBarberModal && alternativeBarberModal.peerBarbers.length > 0 ? (
                <> Would you like to book {alternativeBarberModal.peerBarbers.map((b) => b.name).join(', ')}, or select an alternative time?</>
              ) : (
                <> Please select an alternative time.</>
              )}
            </p>
          </div>

          {alternativeBarberModal && alternativeBarberModal.peerBarbers.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-ivory-dim">
                Available Barbers for {alternativeBarberModal.slotHour}:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto">
                {alternativeBarberModal.peerBarbers.map((peer) => (
                  <button
                    key={peer.id || peer.barber_id}
                    type="button"
                    onClick={() => {
                      setSelectedBarber(peer);
                      if (alternativeBarberModal.slotHour) {
                        setSelectedTime(alternativeBarberModal.slotHour);
                      }
                      setAlternativeBarberModal(null);
                      addToast({
                        type: 'info',
                        title: 'Barber Selected',
                        message: `Switched to ${peer.name} for ${alternativeBarberModal.slotHour}.`,
                        duration: 3500,
                      });
                    }}
                    className="flex items-center justify-between p-3 rounded border border-white/10 bg-white/[0.03] hover:border-gold hover:bg-gold/[0.05] transition-all text-left group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full overflow-hidden border border-white/10 shrink-0">
                        <BarberAvatar image={peer.image} name={peer.name} isAvailable={true} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-ivory group-hover:text-gold truncate">{peer.name}</p>
                        <p className="text-[10px] text-green-400 font-medium">Available</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-gold uppercase tracking-wider px-2 py-0.5 rounded bg-gold/10 border border-gold/20 shrink-0 ml-2">
                      Select
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>
      <CapacityResolutionModal
        isOpen={Boolean(capacityModalData?.isOpen)}
        groupSize={partySize}
        availableBarbersCount={capacityModalData?.availableBarbers || 0}
        estimatedWaitMinutes={capacityModalData?.estimatedWaitMinutes || 0}
        selectedSlot={capacityModalData?.clickedSlot || ''}
        barbers={capacityModalData?.barbers || []}
        nextSimultaneousSlot={capacityModalData?.nextSimultaneousSlot || null}
        onSelectStagger={() => {
          if (!capacityModalData) return;
          setIsStaggeredGroupMode(true);
          setBaseTimeSlot(capacityModalData.clickedSlot);
          setSelectedTime(capacityModalData.clickedSlot);
          setCapacityModalData(null);
        }}
        onSelectSimultaneous={(newTime: string) => {
          setIsStaggeredGroupMode(false);
          setBaseTimeSlot(newTime);
          setSelectedTime(newTime);
          setCapacityModalData(null);
        }}
        onClose={() => {
          setCapacityModalData(null);
        }}
      />
      <div
        className={`bg-charcoal-light/50 backdrop-blur-sm border border-white/5 p-3 sm:p-5 md:p-6 rounded-sm shadow-xl ${isTimeSlotStep ? 'flex-1 min-h-0 flex flex-col overflow-y-auto overscroll-contain custom-scrollbar' : ''}`}
      >
        {/* Progress Header */}
        <div className="mb-3 sm:mb-5 md:mb-6 border-b border-white/5 pb-3 sm:pb-4 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4 md:mb-6">
            <span className="text-gold text-[10px] uppercase tracking-[0.2em] font-bold">
              {bookingStep === 0
                ? "Reservation Type"
                : isReviewingGuests
                  ? (bookingMode === 'group' ? "Group Reservation • Reservation Summary" : "Reservation Summary")
                  : bookingMode === 'group'
                    ? `Group Reservation • Step ${bookingStep} of ${isMobile ? 5 : 4}`
                    : `Step ${bookingStep} of ${isMobile ? 5 : 4}`}
            </span>
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              {(bookingStep > 0 || isReviewingGuests) && handleBookReset && !summaryEditMode && (
                <button
                  type="button"
                  onClick={() => setShowStartOverConfirm(true)}
                  title="Start over and clear this booking"
                  aria-label="Start over booking"
                  className="inline-flex items-center gap-1.5 rounded-sm border border-gold/40 bg-gold/10 px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-gold transition-all hover:border-gold hover:bg-gold/20 cursor-pointer shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Start over</span>
                </button>
              )}
              {bookingStep > 0 && (
                <div className="flex gap-1.5 md:gap-2 shrink-0">
                  {(isMobile ? [1, 2, 3, 4, 5] : [1, 2, 3, 4]).map(step => (
                    <div
                      key={step}
                      className={`h-1 w-5 sm:w-6 md:w-8 rounded-full transition-all duration-500 ${isReviewingGuests || step <= bookingStep ? 'bg-gold' : 'bg-white/10'}`}
                    ></div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 md:gap-4">
            {(bookingStep > 0 || isReviewingGuests) && (
              <button
                onClick={() => {
                  if (isReviewingGuests) {
                    setIsReviewingGuests(false);
                    setBookingStep(isMobile ? 4 : 3);
                    return;
                  }
                  if (isBookAheadAvailabilityFlow && (bookingStep === 1 || (isMobile && bookingStep === 2))) {
                    if (!selectedDate && !selectedTime && bookAheadReturnSelection) {
                      setSelectedDate(bookAheadReturnSelection.date);
                      setSelectedTime(bookAheadReturnSelection.time);
                    }
                    setBookAheadReturnSelection(null);
                    setIsBookAheadAvailabilityFlow(false);
                    setBookingStep(isMobile ? 4 : 3);
                    return;
                  }
                  const isCheckout = isMobile ? bookingStep === 5 : bookingStep === 4;
                  if (isCheckout) {
                    if (paymentScreen === 'pay') {
                      setPaymentScreen('method');
                      return;
                    }
                    resetPaymentState();
                    setIsReviewingGuests(true);
                    return;
                  }
                  const isBarberStep = (!isMobile && bookingStep === 3) || (isMobile && bookingStep === 4);
                  if (isBarberStep) {
                    setBookingStep(isMobile ? 3 : 2);
                    return;
                  }
                  const isServiceStep = (!isMobile && bookingStep === 2) || (isMobile && bookingStep === 3);
                  if (isServiceStep) {
                    if (bookingMode === 'group') {
                      const currentIdx = editingGuestIndex !== null ? editingGuestIndex : activeGuestIndex;
                      if (currentIdx > 1) {
                        const previousGuest = guests.filter(g => g.guestIndex < currentIdx).sort((a, b) => b.guestIndex - a.guestIndex)[0];
                        if (previousGuest) {
                          switchToGuest(previousGuest.guestIndex);
                          setBookingStep(isMobile ? 4 : 3);
                          return;
                        }
                      }
                      setBookingStep(isMobile ? 2 : 1);
                      return;
                    }
                    setBookingStep(isMobile ? 2 : 1);
                    return;
                  }
                  if (isMobile && bookingStep === 2) {
                    setBookingStep(1);
                    return;
                  }
                  if (bookingStep === 1) {
                    setBookingStep(0);
                    return;
                  }
                  setBookingStep(bookingStep - 1);
                }}
                className="p-2 -ml-2 rounded-full hover:bg-white/5 text-ivory-dim hover:text-gold transition-all shrink-0"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <h3 className="break-words text-lg sm:text-2xl md:text-3xl font-serif font-bold text-ivory leading-tight min-w-0">
              {bookingStep === 0 && "How Many Are You Booking For?"}
              {isReviewingGuests && "Reservation Summary"}
              {!isReviewingGuests && !isMobile && bookingStep === 1 && (
                bookingMode === 'group'
                  ? "Select Group Date & Time"
                  : "Select Date & Time"
              )}
              {!isReviewingGuests && isMobile && bookingStep === 1 && (
                bookingMode === 'group'
                  ? "Select Group Date"
                  : "Select Date"
              )}
              {!isReviewingGuests && isMobile && bookingStep === 2 && (
                bookingMode === 'group'
                  ? "Select Group Time Slot"
                  : "Select Time Slot"
              )}
              {!isReviewingGuests && ((!isMobile && bookingStep === 2) || (isMobile && bookingStep === 3)) && (
                bookingMode === 'group'
                  ? `[${guestName || `Guest ${editingGuestIndex !== null ? editingGuestIndex : activeGuestIndex}`}] Select Services`
                  : "Select Service"
              )}
              {!isReviewingGuests && ((!isMobile && bookingStep === 3) || (isMobile && bookingStep === 4)) && (
                bookingMode === 'group'
                  ? `[${guestName || `Guest ${editingGuestIndex !== null ? editingGuestIndex : activeGuestIndex}`}] Choose Your Barber`
                  : "Choose Your Barber"
              )}
              {!isReviewingGuests && ((!isMobile && bookingStep === 4) || (isMobile && bookingStep === 5)) && (
                isRebooking ? "Confirm Rebooking" : paymentScreen === 'method' ? "Payment Method" : "Pay & Confirm"
              )}
            </h3>
          </div>
        </div>

        {/* Consistent Group Guest Selector Tabs across Service & Barber steps */}
        {bookingMode === 'group' && ((!isMobile && (bookingStep === 2 || bookingStep === 3)) || (isMobile && (bookingStep === 3 || bookingStep === 4))) && !isReviewingGuests && (
          <div className="mb-8 -mt-4 pb-4 border-b border-white/5 animate-fade-in">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[10px] uppercase tracking-[0.2em] text-gold font-bold">
                Guest {editingGuestIndex !== null ? editingGuestIndex : activeGuestIndex} of {partySize}
              </span>
              <span className="text-xs text-ivory-dim font-light hidden sm:inline">
                Switch guest tab to configure service &amp; barber
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              {Array.from({ length: partySize }, (_, i) => i + 1).map((gIdx) => {
                const currentIdx = editingGuestIndex !== null ? editingGuestIndex : activeGuestIndex;
                const isSelected = currentIdx === gIdx;
                const guestObj = guests.find(g => g.guestIndex === gIdx);
                const isCompleted = Boolean(
                  guestObj && (guestObj.services || []).length > 0 && guestObj.barberId && guestObj.scheduledDate && guestObj.scheduledTime
                );

                return (
                  <button
                    key={gIdx}
                    type="button"
                    onClick={() => switchToGuest(gIdx)}
                    className={`flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-md text-xs sm:text-sm font-semibold tracking-wide transition-all cursor-pointer ${isSelected
                      ? 'bg-gold text-charcoal font-bold shadow-[0_0_20px_rgba(212,175,55,0.35)]'
                      : 'bg-white/[0.03] text-ivory-dim border border-white/10 hover:border-gold/40 hover:text-gold hover:bg-white/[0.06]'
                      }`}
                  >
                    <span
                      className={`w-2.5 h-2.5 rounded-full border ${isSelected
                        ? 'border-charcoal bg-charcoal'
                        : isCompleted
                          ? 'border-green-400 bg-green-400'
                          : 'border-gold/60 bg-transparent'
                        }`}
                    />
                    <span>{guestObj?.guestName || (gIdx === 1 ? 'Guest 1 (You)' : `Guest ${gIdx}`)}</span>
                    {isCompleted && (
                      <span className="text-[10px] text-green-400 font-mono font-bold ml-0.5">✓</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 0: Mode Selection & Party Size */}
        {bookingStep === 0 && (
          <div className="space-y-6 sm:space-y-8 animate-fade-in max-w-xl mx-auto py-4">
            <div className="text-center space-y-3">
              <span className="text-gold text-[10px] uppercase tracking-[0.25em] font-bold bg-gold/10 px-3.5 py-1 rounded-full border border-gold/20 inline-block">
                RESERVATION TYPE
              </span>
              <h2 className="break-words text-xl sm:text-2xl md:text-3xl font-serif font-bold text-ivory">
                SELECT THE NUMBER OF GUESTS
              </h2>
              <p className="text-ivory-dim text-sm max-w-md mx-auto leading-relaxed">
                Whether it's just you or the whole barkada, we'll set it up in one step.
              </p>
            </div>

            {/* Mobile-only snap picker */}
            <div className="space-y-4 pt-2 md:hidden">
              <div
                ref={partySizePickerRef}
                onScroll={() => {
                  if (partySizeScrollTimeoutRef.current) clearTimeout(partySizeScrollTimeoutRef.current);
                  partySizeScrollTimeoutRef.current = setTimeout(() => {
                    const picker = partySizePickerRef.current;
                    if (!picker) return;
                    const pickerCenter = picker.getBoundingClientRect().left + picker.clientWidth / 2;
                    const nearestItem = Array.from(picker.querySelectorAll<HTMLElement>('[data-party-size]'))
                      .sort((a, b) => {
                        const aCenter = a.getBoundingClientRect().left + a.getBoundingClientRect().width / 2;
                        const bCenter = b.getBoundingClientRect().left + b.getBoundingClientRect().width / 2;
                        return Math.abs(aCenter - pickerCenter) - Math.abs(bCenter - pickerCenter);
                      })[0];
                    if (!nearestItem) return;
                    const nextSize = Number(nearestItem.dataset.partySize);
                    const nearestWheelIndex = Number(nearestItem.dataset.wheelIndex);
                    const centerWheelIndex = PARTY_SIZE_WHEEL_CENTER_START + nextSize - 1;
                    const wheelOffset = nearestWheelIndex < PARTY_SIZE_WHEEL_CENTER_START
                      || nearestWheelIndex >= PARTY_SIZE_WHEEL_CENTER_START + PARTY_SIZE_OPTIONS.length
                      ? centerWheelIndex - nearestWheelIndex
                      : 0;
                    if (wheelOffset !== 0) {
                      picker.scrollBy({ left: wheelOffset * (picker.clientWidth / 3), behavior: 'auto' });
                    }
                    setPartySize(nextSize);
                    setBookingMode(nextSize === 1 ? 'single' : 'group');
                  }, 90);
                }}
                className="w-full overflow-x-auto snap-x snap-mandatory overscroll-x-contain [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                aria-label="Choose number of guests. Swipe horizontally to change the selection."
                role="group"
              >
                <div className="flex w-[566.6667%] items-center">
                  <div aria-hidden="true" className="w-[5.88235%] shrink-0" />
                  {Array.from({ length: PARTY_SIZE_WHEEL_CYCLES * PARTY_SIZE_OPTIONS.length }, (_, wheelIndex) => {
                    const size = PARTY_SIZE_OPTIONS[wheelIndex % PARTY_SIZE_OPTIONS.length];
                    const isSelected = wheelIndex === PARTY_SIZE_WHEEL_CENTER_START + partySize - 1;
                    return (
                      <button
                        key={wheelIndex}
                        type="button"
                        data-wheel-index={wheelIndex}
                        data-party-size={size}
                        aria-label={`${size} ${size === 1 ? 'guest' : 'guests'}`}
                        aria-pressed={isSelected}
                        onClick={() => {
                          setPartySize(size);
                          setBookingMode(size === 1 ? 'single' : 'group');
                        }}
                        className={`w-[5.88235%] shrink-0 snap-center py-2 text-center font-serif font-semibold tabular-nums transition-all duration-300 ease-out focus-visible:outline-none focus-visible:text-gold ${isSelected
                          ? 'scale-125 text-5xl text-gold opacity-100 drop-shadow-[0_0_12px_rgba(212,175,55,0.45)]'
                          : 'scale-90 text-3xl text-ivory opacity-35'
                          }`}
                      >
                        {size}
                      </button>
                    );
                  })}
                  <div aria-hidden="true" className="w-[5.88235%] shrink-0" />
                </div>
              </div>

              <div
                className="relative mx-auto h-px w-3/5 overflow-hidden bg-white/15"
                role="img"
                aria-label={`Guest count selection: ${partySize} ${partySize === 1 ? 'guest' : 'guests'}`}
              >
                <div
                  className="h-full w-1/3 bg-gold shadow-[0_0_8px_rgba(212,175,55,0.75)] transition-transform duration-300 ease-out"
                  style={{ transform: 'translateX(100%)' }}
                />
              </div>
              <p className="text-center text-[10px] uppercase tracking-[0.2em] text-ivory-dim">
                {partySize} {partySize === 1 ? 'Guest' : 'Guests'} <span className="mx-1 text-gold/60">·</span> Swipe to choose
              </p>
            </div>

            {/* Keep the existing quick selector and stepper on desktop */}
            <div className="hidden items-center justify-center gap-3 pt-2 md:flex">
              {[1, 2, 3].map((size) => {
                const isSelected = partySize === size;
                return (
                  <button
                    key={size}
                    type="button"
                    onClick={() => {
                      setPartySize(size);
                      setBookingMode(size === 1 ? 'single' : 'group');
                    }}
                    className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full font-serif font-bold text-sm sm:text-base flex items-center justify-center transition-all duration-300 cursor-pointer ${isSelected
                      ? 'bg-gold text-charcoal font-bold shadow-[0_0_20px_rgba(212,175,55,0.4)] scale-105'
                      : 'bg-white/[0.04] text-ivory-dim border border-white/10 hover:border-gold/50 hover:text-gold hover:bg-white/[0.08]'
                      }`}
                  >
                    {size}
                  </button>
                );
              })}
            </div>

            <div className="hidden items-center justify-center gap-8 py-4 sm:gap-12 md:flex">
              <button
                type="button"
                disabled={partySize <= 1}
                onClick={() => {
                  const next = Math.max(1, partySize - 1);
                  setPartySize(next);
                  setBookingMode(next === 1 ? 'single' : 'group');
                }}
                className={`w-12 h-12 rounded-full border flex items-center justify-center transition-all duration-200 cursor-pointer ${partySize <= 1
                  ? 'border-white/10 text-white/20 cursor-not-allowed'
                  : 'border-white/20 text-ivory hover:border-gold hover:text-gold hover:bg-white/5 active:scale-95'
                  }`}
                aria-label="Decrease party size"
              >
                <span className="text-xl leading-none font-bold">&minus;</span>
              </button>

              <div className="text-center min-w-[100px]">
                <div className="text-5xl sm:text-6xl font-serif font-bold text-ivory tracking-tight">
                  {partySize}
                </div>
                <div className="text-[11px] uppercase tracking-[0.2em] font-bold text-ivory-dim mt-1">
                  {partySize === 1 ? 'GUEST' : 'GUESTS'}
                </div>
              </div>

              <button
                type="button"
                disabled={partySize >= 3}
                onClick={() => {
                  const next = Math.min(3, partySize + 1);
                  setPartySize(next);
                  setBookingMode(next === 1 ? 'single' : 'group');
                }}
                className={`w-12 h-12 rounded-full border flex items-center justify-center transition-all duration-200 cursor-pointer ${partySize >= 3
                  ? 'border-white/10 text-white/20 cursor-not-allowed'
                  : 'border-white/20 text-ivory hover:border-gold hover:text-gold hover:bg-white/5 active:scale-95'
                  }`}
                aria-label="Increase party size"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>

            {/* Summary Details Box */}
            <div className="bg-black/30 border border-white/10 rounded-sm p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-ivory-dim">Booking for</span>
                <span className="text-ivory font-bold font-serif">
                  {partySize} {partySize === 1 ? 'guest' : 'guests'}
                </span>
              </div>

              <div className="flex items-center justify-between text-sm pt-2 border-t border-white/5">
                <span className="text-ivory-dim">Reservation fee required</span>
                <span className="text-gold font-bold font-mono">
                  {partySize > 1 ? `₱50 × ${partySize} = ₱${partySize * 50}` : '₱50 per head'}
                </span>
              </div>

              {partySize > 1 ? (
                <div className="flex items-start gap-2 pt-2 border-t border-white/5 text-xs text-ivory-dim">
                  <Check className="w-4 h-4 text-gold shrink-0 mt-0.5" />
                  <span>
                    Group bookings require a ₱50 reservation fee per head (₱{partySize * 50} total) to secure all seats. Maximum 3 guests.
                  </span>
                </div>
              ) : (
                <div className="flex items-start gap-2 pt-2 border-t border-white/5 text-xs text-ivory-dim">
                  <Check className="w-4 h-4 text-gold shrink-0 mt-0.5" />
                  <span>
                    Single bookings require a ₱50 reservation fee to secure your slot, deductible from your final service bill.
                  </span>
                </div>
              )}
            </div>

            {/* Action CTA Button */}
            <div className="pt-2">
              <Button
                variant="primary"
                onClick={() => {
                  if (partySize === 1) {
                    setBookingMode('single');
                    setBookingStep(1);
                  } else {
                    setBookingMode('group');
                    if (guests.length === 0) {
                      setGuests([]);
                      setActiveGuestIndex(1);
                      setGuestName('Guest 1 (You)');
                    }
                    setBookingStep(1);
                  }
                }}
                className="w-full text-xs uppercase tracking-wider font-bold py-3.5 shadow-xl shadow-gold/10"
              >
                CONTINUE TO DATE &amp; TIME
              </Button>
            </div>
          </div>
        )}

        {/* Reservation Summary Screen */}
        {isReviewingGuests && (() => {
          const isGroupSummary = bookingMode === 'group' && guests.length > 1;
          const singleGuest = guests[0] ?? null;
          const singleServices: any[] = singleGuest?.services?.length ? singleGuest.services : selectedServices;

          const priceOf = (service: any) => Number(String(service?.price ?? '').replace(/[^\d.]/g, '')) || 0;
          const formatPeso = (amount: number) => `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

          const renderGuestCard = (guest: any | null, index: number) => {
            const cardKey = isGroupSummary ? String(guest?.guestIndex ?? index) : 'single';
            const updatedList = updatedSummarySections[cardKey] || [];
            const isUpdated = (section: 'schedule' | 'services' | 'barber') => updatedList.includes(section);
            const updatedBadge = (
              <span className="inline-flex rounded-sm border border-gold/50 bg-gold/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gold">
                Updated
              </span>
            );
            const services: any[] = isGroupSummary ? (guest?.services || []) : singleServices;
            const barber: any = isGroupSummary ? guest?.barber : (singleGuest?.barber || selectedBarber);
            const isAuto = Boolean(barber?.is_auto_assigned);
            const assignedBarberId = String(barber?.barber_id ?? barber?.id ?? '');

            const barberName = isAuto
              ? (isGroupSummary
                  ? (barber?.assigned_barber_name || guest?.barberName || 'Any Available Barber')
                  : (selectedAutoAssignedBarberName || barber?.assigned_barber_name || guest?.barberName || 'Any Available Barber'))
              : (barber?.name || guest?.barberName || 'Selected Barber');
            const barberImage = isAuto
              ? (barbersWithStatus.find((b) => String(b.barber_id ?? b.id) === assignedBarberId)?.image ?? barber?.image ?? null)
              : (barber?.image ?? null);

            const rawDate = guest?.scheduledDate || selectedDateIso || '';
            const isoDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : selectedDateIso;
            const time = guest?.scheduledTime || selectedTime || '';
            const endTime = guest?.estimatedEndTime || '';
            const scheduleText = isoDate && time
              ? new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' }).format(new Date(`${isoDate}T12:00:00+08:00`))
              : scheduleLabel;
            const durationMinutes = services.reduce((acc, s) => acc + getServiceDurationMinutes(s), 0);
            const servicesPrice = services.reduce((acc, s) => acc + priceOf(s), 0);

            return (
              <article className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.02]">
                <div className="flex items-start gap-4 border-b border-white/10 p-4 sm:p-5">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full border-2 border-gold/60">
                    <BarberAvatar image={barberImage} name={barberName} isAvailable={true} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold">
                      {isGroupSummary ? (guest?.guestName || `Guest ${index + 1}`) : 'Your barber'}
                    </p>
                    <h4 className="mt-0.5 truncate font-serif text-lg font-bold text-ivory">{barberName}</h4>
                    {isUpdated('barber') && <div className="mt-1">{updatedBadge}</div>}
                    <span className={`mt-1.5 inline-flex rounded-sm border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${isAuto ? 'border-white/15 text-ivory-dim' : 'border-gold/30 bg-gold/10 text-gold'}`}>
                      {isAuto ? 'Assigned for you' : 'Your choice'}
                    </span>
                  </div>
                  <div className="relative z-10 flex shrink-0 items-center gap-1.5">
                    <div className="relative" data-edit-menu>
                      <button
                        type="button"
                        aria-haspopup="menu"
                        aria-expanded={openEditMenuKey === cardKey}
                        onClick={() => setOpenEditMenuKey(openEditMenuKey === cardKey ? null : cardKey)}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm border border-white/15 px-2.5 py-1.5 text-xs font-semibold text-ivory-dim transition-colors hover:border-gold/50 hover:text-gold"
                      >
                        <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                        Edit
                        <ChevronDown className="h-3 w-3" aria-hidden="true" />
                      </button>
                      {openEditMenuKey === cardKey && (
                        <div role="menu" className="absolute right-0 top-full z-20 mt-1 w-44 rounded-md border border-white/15 bg-charcoal-light p-1 shadow-xl">
                          {([
                            { key: 'schedule', label: 'Date & time' },
                            { key: 'services', label: 'Services' },
                            { key: 'barber', label: 'Barber' },
                          ] as const).map((item) => (
                            <button
                              key={item.key}
                              type="button"
                              role="menuitem"
                              onClick={() => startSummaryEdit(guest, item.key)}
                              className="block w-full cursor-pointer rounded-sm px-3 py-2 text-left text-xs text-ivory transition-colors hover:bg-gold/10 hover:text-gold"
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {isGroupSummary && guest && guests.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveGuest(guest)}
                        title="Remove this guest"
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm border border-red-500/20 px-2.5 py-1.5 text-xs font-semibold text-red-400 transition-colors hover:bg-red-500/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        Remove
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 border-b border-white/10 p-4 sm:grid-cols-2 sm:p-5">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold">Schedule</p>
                      {isUpdated('schedule') && updatedBadge}
                    </div>
                    <p className="mt-1 text-sm font-semibold text-ivory">{scheduleText}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold">Time</p>
                    <p className="mt-1 text-sm font-semibold text-ivory">
                      {time ? `${time}${endTime ? ` – ${endTime}` : ''}` : 'Not set'}
                      {durationMinutes > 0 && <span className="ml-2 text-xs font-normal text-ivory-dim">({formatDuration(durationMinutes)})</span>}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between px-4 pt-3 sm:px-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold">Services</p>
                  {isUpdated('services') && updatedBadge}
                </div>
                <ul className="divide-y divide-white/5 px-4 sm:px-5">
                  {services.length > 0 ? services.map((service) => (
                    <li key={service.id ?? service.service_id ?? service.name} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <span className="min-w-0 truncate font-medium text-ivory">{service.name || service.title}</span>
                      <span className="shrink-0 font-mono text-ivory">{formatPeso(priceOf(service))}</span>
                    </li>
                  )) : (
                    <li className="py-3 text-sm text-ivory-dim">No service selected</li>
                  )}
                </ul>

                <div className="flex items-center justify-between gap-3 border-t border-white/10 bg-white/[0.02] px-4 py-3 text-sm sm:px-5">
                  <span className="text-ivory-dim">{services.length} {services.length === 1 ? 'service' : 'services'}</span>
                  <span className="font-mono font-semibold text-ivory">{formatPeso(servicesPrice)}</span>
                </div>
              </article>
            );
          };

          const groupServicesTotal = groupTotalServicesPrice;
          const singleServicesTotal = singleServices.reduce((acc, s) => acc + priceOf(s), 0);
          const panelServicesTotal = isGroupSummary ? groupServicesTotal : singleServicesTotal;
          const panelFeeTotal = isGroupSummary ? groupTotalDeposit : 50;
          const panelTotal = panelServicesTotal + panelFeeTotal;
          const panelBalance = panelServicesTotal;

          return (
            <div className="relative mx-auto max-w-2xl space-y-6 animate-fade-in">
              {isPreparingSummary && (
                <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 rounded-lg bg-charcoal/95 px-6 text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-gold" aria-hidden="true" />
                  <p className="font-serif text-xl font-bold text-ivory">Reviewing your payment</p>
                  <p className="max-w-xs text-xs text-ivory-dim">Checking your services, barber, and time before payment.</p>
                </div>
              )}
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold">Reservation Summary</span>
                  <h3 className="mt-1 font-serif text-2xl font-bold text-ivory sm:text-3xl">
                    {isGroupSummary ? guests.length : 1} {(isGroupSummary ? guests.length : 1) === 1 ? 'Guest' : 'Guests'} Scheduled
                  </h3>
                  <p className="mt-1 text-xs text-ivory-dim">Check the details below, then continue to payment.</p>
                </div>
                {guests.length < 3 && (
                  <Button
                    onClick={handleAddAnotherGuest}
                    variant="primary"
                    className="flex items-center gap-2 self-start bg-gold text-xs font-bold uppercase tracking-wider text-charcoal hover:bg-gold-dim hover:text-charcoal sm:self-auto"
                  >
                    <Plus className="h-4 w-4" /> Add Another Guest
                  </Button>
                )}
              </div>

              {isGroupSummary ? (
                <div className="space-y-4">
                  {guests.map((guest, index) => (
                    <React.Fragment key={guest.guestIndex ?? index}>
                      {renderGuestCard(guest, index)}
                    </React.Fragment>
                  ))}
                </div>
              ) : (
                renderGuestCard(singleGuest, 0)
              )}

              <section className="space-y-3 text-sm">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gold">Payment</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className={`rounded-xl border p-4 ${isRebooking ? 'border-sky-400/50 bg-sky-500/10' : 'border-gold bg-gold/[0.08]'}`}>
                    <div className="mb-3.5 flex items-center justify-between gap-2">
                      <span className="text-xs text-ivory-dim">{isRebooking ? 'Already paid' : 'Pay now'}</span>
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${isRebooking ? 'border border-sky-400/40 bg-sky-400/20 text-sky-200' : 'bg-gold text-charcoal'}`}>
                        {isRebooking ? 'Paid' : 'Due now'}
                      </span>
                    </div>
                    <p className={`font-mono text-2xl font-medium tabular-nums ${isRebooking ? 'text-sky-200' : 'text-gold'}`}>{formatPeso(panelFeeTotal)}</p>
                    <p className="mt-2 text-xs leading-relaxed text-ivory-dim">
                      {isRebooking ? 'Credited from your cancelled booking.' : 'Reservation fee, secures your slot.'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="mb-3.5 flex items-center justify-between gap-2">
                      <span className="text-xs text-ivory-dim">Pay at the shop</span>
                      <span className="rounded-full border border-white/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ivory-dim">On the day</span>
                    </div>
                    <p className="font-mono text-2xl font-medium tabular-nums text-ivory">{formatPeso(panelBalance)}</p>
                    <p className="mt-2 text-xs leading-relaxed text-ivory-dim">Remaining balance for your services.</p>
                  </div>
                </div>
                <div className="flex items-center justify-between px-1 pt-1">
                  <span className="text-xs text-ivory-dim">Total</span>
                  <span className="font-mono text-sm font-medium tabular-nums text-ivory">{formatPeso(panelTotal)}</span>
                </div>
              </section>
            </div>
          );
        })()}

        {/* Step 2 (Desktop) / Step 3 (Mobile): Services */}
        {((!isMobile && bookingStep === 2) || (isMobile && bookingStep === 3)) && !isReviewingGuests && (
          <div className="space-y-6">
            <ServicesStep
              services={services}
              selectedServices={selectedServices}
              selectedServiceIds={selectedServiceIds}
              combinedDuration={combinedDuration}
              combinedPriceLabel={combinedPriceLabel}
              onToggleService={toggleService}
              onClear={clearServiceSelection}
              onContinue={() => setBookingStep(isMobile ? 4 : 3)}
              checkConflictFor={checkConflictFor}
              isCutoffHours={isCutoffHours}
              selectedTime={selectedTime}
            />
          </div>
        )}

        {summaryEditMode && !isReviewingGuests && (
          <div className="sticky top-2 z-30 mb-4 flex flex-col gap-3 rounded-md border border-gold/40 bg-charcoal-light p-3 shadow-lg sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold">
                Editing {summaryEditSection === 'schedule' ? 'date & time' : summaryEditSection === 'services' ? 'services' : 'barber'}
              </p>
              <p className="mt-0.5 truncate text-xs text-ivory">
                {summaryEditSection === 'schedule' && (
                  <>{selectedDate || 'No date chosen'}{selectedTime ? ` · ${selectedTime}` : ' · No time chosen'}</>
                )}
                {summaryEditSection === 'services' && (
                  <>{selectedServices.map((service) => service.name || service.title).join(' + ') || 'No services chosen'}</>
                )}
                {summaryEditSection === 'barber' && (
                  <>{selectedBarber?.is_auto_assigned ? 'Any available barber' : (selectedBarber?.name || 'No barber chosen')}</>
                )}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="outline" onClick={discardSummaryEdit} className="whitespace-nowrap text-xs">
                Discard changes
              </Button>
              <Button variant="outline" onClick={() => setShowStartOverConfirm(true)} className="whitespace-nowrap text-xs">
                Start over
              </Button>
              <Button variant="primary" onClick={saveSummaryEdit} className="whitespace-nowrap text-xs">
                Back to summary
              </Button>
            </div>
          </div>
        )}

        {/* Step 1 (Desktop) / Steps 1-2 (Mobile): Select Date & Time */}
        {!isReviewingGuests && (isMobile ? bookingStep === 1 || bookingStep === 2 : bookingStep === 1) && (
          <DateTimeStep
            variant={!isMobile ? 'desktop' : bookingStep === 1 ? 'mobile-date' : 'mobile-time'}
            days={calendarDays}
            todayIso={getManilaDateIso()}
            selectedDateIso={selectedDateIso}
            selectedDate={selectedDate}
            selectedTime={selectedTime}
            partySizeNote={bookingMode === 'group' ? `group of ${partySize}` : null}
            isSpecificBarberFlow={isSpecificBarberDateFlow}
            getDateStatus={getBarberDateStatus}
            timeOptions={candidateSlotsByPeriod}
            loadState={!selectedDate ? 'idle' : availabilityError && visibleSlots.length === 0 ? 'error' : isLoadingSlots && visibleSlots.length === 0 ? 'loading' : 'ready'}
            availabilityError={availabilityError ?? null}
            showCachedNotice={Boolean(availabilityError) && visibleSlots.length > 0}
            isRefreshing={Boolean(isBackgroundRefreshing)}
            onSelectDate={(day) => {
              setSelectedDate(day.fullDate);
              setSelectedTime(null);
            }}
            onSelectTime={handleSelectTime}
            onRetry={() => setAvailabilityRetryToken((token) => token + 1)}
            onChangeDate={() => setBookingStep(1)}
          />
        )}

        {/* Step 3 (Desktop) / Step 4 (Mobile): Choose Your Barber */}
        {((!isMobile && bookingStep === 3) || (isMobile && bookingStep === 4)) && !isReviewingGuests && (
          <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
            {/* Top Selected Summary Pill Chip (Icons only, no emojis) */}
            <div className="flex flex-wrap items-center gap-2.5 px-4 py-2.5 bg-charcoal-dark/80 border border-white/10 rounded-full text-xs text-ivory-dim">
              <span className="flex items-center gap-1.5 text-ivory font-medium">
                <Calendar className="w-3.5 h-3.5 text-gold shrink-0" />
                <span>{selectedDate || 'Selected Date'}</span>
              </span>
              <span className="text-white/20">&bull;</span>
              <span className="flex items-center gap-1.5 text-ivory font-medium">
                <Clock className="w-3.5 h-3.5 text-gold shrink-0" />
                <span>{selectedTime || 'Selected Time'}</span>
              </span>
              <span className="text-white/20">&bull;</span>
              <span className="flex items-center gap-1.5 text-gold font-medium truncate max-w-xs sm:max-w-md">
                <Scissors className="w-3.5 h-3.5 text-gold shrink-0" />
                <span>{selectedServices.map(s => s.name || s.title).join(', ') || 'Selected Services'}</span>
              </span>
            </div>


            <div role="radiogroup" aria-label="Barber preference" className="space-y-4">
              {/* Any Available Barber Hero Card */}
              {(() => {
                const isSelectedAny = selectedBarber?.is_auto_assigned === true && !isSpecificBarberMode;
                return (
                  <div
                    role="radio"
                    aria-checked={isSelectedAny}
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        event.currentTarget.click();
                      }
                    }}
                    onClick={() => {
                      const currentIdx = editingGuestIndex !== null ? editingGuestIndex : activeGuestIndex;
                      const scheduleItem = groupSchedule.find((s) => s.guestIndex === currentIdx);
                      const secaBarber = scheduleItem?.barberId
                        ? (initialBarbers.find((b) => String(b.id || b.barber_id) === String(scheduleItem.barberId)) ||
                           barbersWithStatus.find((b) => String(b.id || b.barber_id) === String(scheduleItem.barberId)))
                        : null;
                      const chosen = secaBarber || autoAssignableBarbers[0] || initialBarbers[0];
                      if (!chosen && autoAssignableBarbers.length === 0) {
                        addToast({
                          type: 'warning',
                          title: 'No Barbers Available',
                          message: `No barbers are currently available at ${selectedTime || 'the selected time'}. Please choose a different time slot.`,
                        });
                        return;
                      }
                      const autoBarber = {
                        ...chosen,
                        id: chosen?.id || chosen?.barber_id || scheduleItem?.barberId || 'auto',
                        barber_id: chosen?.barber_id || chosen?.id || scheduleItem?.barberId || 'auto',
                        is_auto_assigned: true,
                        assigned_barber_name: scheduleItem?.barberName || chosen?.name || 'Any Available Barber',
                        name: 'Any Available Barber',
                        display_title: 'Any Available Barber',
                        specialty: 'NEXT OPEN CHAIR',
                      };

                      setShowSpecificBarbers(false);
                      setSelectedBarber(autoBarber);
                    }}
                    className={`relative p-4 sm:p-6 rounded-md border-2 transition-all duration-300 cursor-pointer flex items-center justify-between gap-3 sm:gap-4 ${isSelectedAny
                      ? 'border-gold bg-gold/[0.08] shadow-[0_0_30px_rgba(212,175,55,0.25)]'
                      : 'border-gold/50 bg-gradient-to-r from-gold/[0.04] to-transparent hover:border-gold hover:bg-gold/[0.08] shadow-lg'
                      }`}
                  >
                    <div className="flex items-center gap-3 sm:gap-5 min-w-0">
                      {/* Gold Shuffle Icon Circle */}
                      <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-full bg-gold flex items-center justify-center shrink-0 shadow-md">
                        <Shuffle className="w-5 h-5 sm:w-6 sm:h-6 text-charcoal stroke-[2.5]" />
                      </div>

                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                          <h4 className="text-sm sm:text-lg font-serif font-bold text-ivory tracking-wide break-words">
                            Any Available Barber
                          </h4>
                          <span className="inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded-full text-[8px] sm:text-[10px] font-bold uppercase tracking-wider bg-gold text-charcoal shadow-sm shrink-0">
                            RECOMMENDED FOR NEW CUSTOMERS
                          </span>
                        </div>
                        <p className="text-xs text-ivory-dim leading-relaxed">
                          We'll match you with a skilled barber who's free at your selected time. Fastest way to book — no need to pick a name.
                        </p>
                      </div>
                    </div>

                    {/* Radio Selection Indicator */}
                    <div className="shrink-0 pl-1 sm:pl-2">
                      <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 flex items-center justify-center transition-all ${isSelectedAny ? 'border-gold bg-gold' : 'border-white/30 bg-white/5'
                        }`}>
                        {isSelectedAny && <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-charcoal" />}
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div
                role="radio"
                tabIndex={0}
                aria-checked={isSpecificBarberMode}
                aria-expanded={showSpecificBarbers}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setShowSpecificBarbers(true);
                    if (selectedBarber?.is_auto_assigned) setSelectedBarber(null);
                  }
                }}
                onClick={() => {
                  setShowSpecificBarbers(true);
                  if (selectedBarber?.is_auto_assigned) setSelectedBarber(null);
                }}
                className={`w-full relative p-4 sm:p-6 rounded-md border-2 transition-all duration-300 cursor-pointer flex items-center justify-between gap-3 sm:gap-4 text-left ${isSpecificBarberMode
                  ? 'border-gold bg-gold/[0.08] shadow-[0_0_30px_rgba(212,175,55,0.25)]'
                  : 'border-gold/50 bg-gradient-to-r from-gold/[0.04] to-transparent hover:border-gold hover:bg-gold/[0.08] shadow-lg'
                  }`}
              >
                <div className="flex items-center gap-3 sm:gap-5 min-w-0">
                  <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-full bg-gold flex items-center justify-center shrink-0 shadow-md">
                    <UserCheck className="w-5 h-5 sm:w-6 sm:h-6 text-charcoal stroke-[2.5]" />
                  </div>
                  <div className="space-y-1 min-w-0">
                    <h4 className="text-sm sm:text-lg font-serif font-bold text-ivory tracking-wide break-words">Request a specific barber</h4>
                    <p className="text-xs text-ivory-dim leading-relaxed">Choose a preferred barber and check availability for your selected time.</p>
                  </div>
                </div>
                <div className="shrink-0 pl-1 sm:pl-2">
                  <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 flex items-center justify-center transition-all ${isSpecificBarberMode ? 'border-gold bg-gold' : 'border-white/30 bg-white/5'}`}>
                    {isSpecificBarberMode && <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-charcoal" />}
                  </div>
                </div>
              </div>
            </div>
            {showSpecificBarbers && (
              <div className="space-y-4">
                <p className="text-xs text-ivory-dim">Available barbers can be selected. Walk-in-only and currently booked barbers remain clickable so you can check their upcoming appointment availability.</p>
                {isLoadingSlots || (Boolean(selectedDateIso) && availabilityLoadedKey !== availabilityKey && !availabilityError) ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4" aria-busy="true">
                    <span className="sr-only">Checking online barber availability</span>
                    {[0, 1, 2, 3].map((index) => (
                      <div key={index} aria-hidden="true" className="p-5 rounded-md border border-white/10 bg-charcoal-light/40 animate-pulse motion-reduce:animate-none space-y-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-full bg-white/10 shrink-0" />
                          <div className="flex-1 space-y-2">
                            <div className="h-4 w-32 rounded bg-white/10" />
                            <div className="h-3 w-20 rounded bg-white/5" />
                          </div>
                        </div>
                        <div className="h-5 w-24 rounded bg-white/5" />
                        <div className="h-3 w-28 rounded bg-white/5" />
                      </div>
                    ))}
                  </div>
                ) : availabilityError ? (
                  <div className="rounded-md border border-amber-500/20 bg-amber-500/[0.04] p-5 text-center">
                    <p className="text-sm text-amber-200">{availabilityError}</p>
                    <Button variant="outline" onClick={() => setAvailabilityRetryToken((token) => token + 1)} className="mt-3 text-xs">
                      Retry availability
                    </Button>
                  </div>
                ) : barbersWithStatus.length === 0 ? (
                  <p className="rounded-md border border-white/10 p-5 text-center text-sm text-ivory-dim">
                    No barbers are available for online booking on this date.
                  </p>
                ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {barberRanking.ordered.map((barber) => {
                    const barberId = Number(barber.id || barber.barber_id);
                    const recommendation = barberRanking.recommendations.get(String(barber.barber_id ?? barber.id));
                    const isSelected = !selectedBarber?.is_auto_assigned && (
                      Number(selectedBarber?.id || selectedBarber?.barber_id) === barberId
                    );
                    const isRecent = Boolean(
                      (recentBarberId && barberId === Number(recentBarberId)) ||
                      (recentBarberName && barber.name && barber.name.trim().toLowerCase() === recentBarberName)
                    );
                    const isSelectable = barber.isAvailable && barber.statusType === 'available';

                    // Rating calculation
                    const ratingValue = barber.rating !== null && barber.rating !== undefined
                      ? Number(barber.rating)
                      : 4.8;
                    const ratingFormatted = ratingValue.toFixed(1);

                    // Top performer (most completed cuts, from the backend) and tags:
                    // automated signature service first, then the barber's own specialties.
                    const barberRank = typeof barber.rank === 'number'
                      ? barber.rank
                      : barberTopPerformanceRankMap.get(barberId);
                    const isTopPerformer = Boolean(barber.is_top_performer ?? barber.isTopPerformer ?? false);
                    const userSpecialties: string[] = Array.isArray(barber.specialties)
                      ? barber.specialties
                      : (barber.specialty ? barber.specialty.split(/[,&•]+/).map((s: string) => s.trim()).filter(Boolean) : []);
                    const signatureService: string | null = barber.signature_service || null;

                    // Experience Subtitle
                    const experienceYears = barber.experience_years || (barberId % 5 + 3);

                    return (
                      <div
                        role="radio"
                        aria-checked={isSelected}
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            event.currentTarget.click();
                          }
                        }}
                        key={barber.id || barber.barber_id}
                        onClick={() => {
                          if (barber.statusType === 'walkin_only' || barber.statusType === 'busy_at_time') {
                            if (barber.statusType === 'busy_at_time' && selectedTime) {
                              const bId = Number(barber.id || barber.barber_id);
                              const timeMinutes = timeToMinutes(selectedTime);
                              const peerBarbers = barbersWithStatus.filter((b) => {
                                const otherId = Number(b.id || b.barber_id);
                                if (otherId === bId) return false;
                                const bSlots = barberSlotAvailabilityMap[otherId] || [];
                                return b.isAvailable && bSlots.some((s) => timeToMinutes(s) === timeMinutes);
                              });
                              if (peerBarbers.length > 0) {
                                setAlternativeBarberModal({
                                  isOpen: true,
                                  blockedBarberName: barber.name,
                                  occupiedUntil: barber.blockingPeriod?.endTime || 'later',
                                  slotHour: selectedTime,
                                  peerBarbers,
                                  barber,
                                });
                                return;
                              }
                            }
                            setPendingBookAheadBarber(barber);
                            return;
                          }
                          if (!isSelectable) {
                            addToast({
                              type: 'warning',
                              title: 'Barber Unavailable',
                              message: `${barber.name} is not available for online booking at ${selectedTime || 'the selected time'}. Please select an available barber.`,
                            });
                            return;
                          }
                          const needsDateForBookAhead = isBookAheadAvailabilityFlow && (!selectedDate || !selectedTime);
                          setSelectedBarber(barber);
                          if (needsDateForBookAhead) {
                            setSelectedDate(null);
                            setSelectedTime(null);
                            setBookingStep(1);
                            return;
                          }
                          setIsBookAheadAvailabilityFlow(false);
                          setSelectedBarber(barber);
                        }}
                        className={`p-5 rounded-md border transition-all duration-300 flex flex-col justify-between ${!isSelectable
                          ? (barber.statusType === 'walkin_only' || barber.statusType === 'busy_at_time'
                            ? 'opacity-60 cursor-pointer border-amber-500/20 bg-black/20 hover:border-amber-400/50 hover:bg-amber-500/[0.04]'
                            : 'opacity-40 cursor-not-allowed border-white/5 bg-black/20')
                          : isSelected
                            ? 'border-gold bg-gold/[0.08] shadow-[0_0_25px_rgba(212,175,55,0.2)] cursor-pointer'
                            : isTopPerformer
                              ? 'border-gold/60 bg-gold/[0.05] ring-1 ring-gold/25 hover:border-gold hover:bg-gold/[0.08] cursor-pointer group'
                              : 'border-white/10 bg-charcoal-light/40 hover:border-gold/50 hover:bg-white/[0.04] cursor-pointer group'
                          }`}
                      >
                        <div>
                          {/* Top Header Row: Avatar + Name + Rating on Left, Available Badge on Right */}
                          <div className="flex flex-wrap items-start justify-between gap-2.5 mb-3.5">
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              {/* Barber Avatar Initial Circle */}
                              <div className="w-12 h-12 rounded-full overflow-hidden border border-white/10 group-hover:border-gold/60 shrink-0 bg-white/5 shadow-md">
                                <BarberAvatar
                                  image={barber.image}
                                  name={barber.name}
                                  isAvailable={isSelectable}
                                />
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <h4 className="text-base font-serif font-bold text-ivory group-hover:text-gold transition-colors break-words leading-snug">
                                    {barber.name}
                                  </h4>
                                  {isRecent && (
                                    <span className="text-[9px] uppercase font-bold tracking-wider text-gold bg-gold/15 px-1.5 py-0.5 rounded border border-gold/30 shrink-0">
                                      Recent
                                    </span>
                                  )}
                                  {recommendation?.recommended && (
                                    <span className="inline-flex items-center gap-1 text-[9px] uppercase font-bold tracking-wider text-gold border border-gold/40 bg-gold/10 px-1.5 py-0.5 rounded shrink-0">
                                      Recommended
                                    </span>
                                  )}
                                  <BarberPerformanceBadge isTopPerformer={isTopPerformer} rank={barberRank} />
                                </div>

                                {/* Stars Rating and Reviews */}
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <div className="flex items-center text-gold">
                                    {[1, 2, 3, 4, 5].map((star) => {
                                      const fillLevel = Math.max(0, Math.min(1, ratingValue - (star - 1)));
                                      return (
                                        <Star
                                          key={star}
                                          className={`w-3.5 h-3.5 ${fillLevel >= 0.8
                                            ? 'fill-gold text-gold'
                                            : fillLevel >= 0.3
                                              ? 'fill-gold/50 text-gold'
                                              : 'text-white/20'
                                            }`}
                                        />
                                      );
                                    })}
                                  </div>
                                  <span className="text-xs font-bold text-ivory">{ratingFormatted}</span>
                                </div>
                              </div>
                            </div>

                            {/* Available Tag Badge */}
                            <div className="shrink-0">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${barber.statusType === 'available'
                                ? 'text-green-400 bg-green-500/10 border border-green-500/30'
                                : barber.statusType === 'walkin_only'
                                  ? 'text-amber-400 bg-amber-500/15 border border-amber-500/40'
                                  : barber.statusType === 'busy_at_time'
                                    ? 'text-red-300 bg-red-500/10 border border-red-500/30'
                                    : barber.statusType === 'off_today'
                                      ? 'text-ivory-dim/70 bg-white/5 border border-white/10'
                                      : 'text-amber-300 bg-amber-500/15 border border-amber-500/30'
                                }`}>
                                {barber.statusLabel || 'Available'}
                              </span>
                            </div>
                          </div>

                          {/* Specialty Pill Tags */}
                          {signatureService && (
                            <div className="mt-3">
                              <span className="inline-flex max-w-full items-center gap-1.5 rounded-sm border border-gold/30 bg-gold/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-gold">
                                <Scissors aria-hidden="true" className="w-3 h-3 shrink-0" />
                                <span className="truncate">Usual service · {signatureService}</span>
                              </span>
                            </div>
                          )}
                          {recommendation?.reason && (
                            <p className="mt-2 text-[11px] text-ivory-dim">{recommendation.reason}</p>
                          )}
                          {userSpecialties.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 my-3">
                              {userSpecialties.slice(0, 3).map((spec) => (
                                <span
                                  key={spec}
                                  className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-white/[0.04] text-ivory-dim border border-white/10 group-hover:border-gold/30 transition-colors"
                                >
                                  {spec}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Footer: Experience Subtitle & Actions */}
                        <div className="pt-2.5 border-t border-white/5 flex items-center justify-between text-xs text-ivory-dim">
                          <span>{experienceYears} yrs experience</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setViewingPortfolioBarber(barber);
                            }}
                            className="text-gold hover:underline text-[11px] font-medium flex items-center gap-1"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Portfolio</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                )}
              </div>
            )}

            {/* Public Barber Portfolio Modal */}
            <PublicPortfolioPreviewModal
              isOpen={viewingPortfolioBarber !== null}
              onClose={() => setViewingPortfolioBarber(null)}
              barberId={viewingPortfolioBarber?.id || viewingPortfolioBarber?.barber_id}
              barberName={viewingPortfolioBarber?.name}
              highlightServiceName={selectedService?.name || selectedServices[0]?.name}
              isBookingMode={true}
              onSelectBarber={() => {
                if (viewingPortfolioBarber) {
                  setSelectedBarber(viewingPortfolioBarber);
                  setViewingPortfolioBarber(null);
                }
              }}
            />
          </div>
        )}

        {/* Step 4 (Desktop) / Step 5 (Mobile): Checkout & Payment Verification */}
        {((!isMobile && bookingStep === 4) || (isMobile && bookingStep === 5)) && !isReviewingGuests && (
          <div className="space-y-6 max-w-2xl mx-auto animate-fade-in">
            {!isRebooking && (
              <PayTimerChip initialSeconds={900} onExpire={handleHoldExpired} />
            )}

            {isRebooking ? (
              <div className="space-y-6">
                {/* 1. Credit Notification Banner */}
                <div className="flex items-start gap-3 rounded-sm border border-emerald-500/30 bg-emerald-500/[0.08] p-4 text-sm text-emerald-100 shadow-lg">
                  <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
                  <div>
                    <p className="font-bold text-emerald-300">Reservation Fee Covered</p>
                    <p className="mt-1 text-xs leading-relaxed">Your ₱50.00 reservation fee was credited from your cancelled booking. No additional payment is required now.</p>
                  </div>
                </div>

                {/* 2. Rebooking Summary Card */}
                <div className="bg-white/[0.02] border border-white/10 rounded-sm p-6 space-y-4 shadow-xl">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.2em] text-gold font-bold">Transfer Summary</p>
                      <h4 className="text-lg font-serif font-bold text-ivory mt-0.5">
                        {effectiveBranch?.name || 'DemoShop Barbershop'}
                      </h4>
                    </div>
                    <span className="text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-1 rounded-full font-bold uppercase tracking-wider">
                      Deposit Transferred
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-4 border-b border-white/10 text-xs">
                    <div>
                      <span className="text-ivory-dim block">Assigned Barber</span>
                      <span className="text-ivory font-semibold text-sm mt-0.5 block">
                        {selectedBarber?.is_auto_assigned
                          ? (selectedAutoAssignedBarberName || selectedBarber?.assigned_barber_name || 'Any Available Barber')
                          : (selectedBarber?.name || 'Selected Barber')}
                      </span>
                    </div>
                    <div>
                      <span className="text-ivory-dim block">Schedule</span>
                      <span className="text-ivory font-semibold text-sm mt-0.5 block">
                        {selectedDate}, {selectedTime}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2 pb-4 border-b border-white/10 text-xs">
                    <span className="text-ivory-dim block">Selected Services</span>
                    {selectedServices.map((s) => (
                      <div key={s.id ?? s.service_id} className="flex justify-between items-center text-ivory">
                        <span>{s.name || s.title}</span>
                        <span className="font-mono">
                          ₱{Number(String(s.price ?? '').replace(/[^\d.]/g, '') || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between items-center text-ivory-dim">
                      <span>Service Subtotal</span>
                      <span className="font-mono text-ivory">{combinedPriceLabel}</span>
                    </div>
                    <div className="flex justify-between items-center text-emerald-400 font-semibold">
                      <span>Reservation Deposit (Credit Applied)</span>
                      <span className="font-mono font-bold">-₱50.00 (PAID)</span>
                    </div>
                    <div className="flex justify-between items-center text-gold pt-3 border-t border-white/10 text-sm font-bold">
                      <span>Remaining Balance Due at Shop</span>
                      <span className="font-mono text-xl">{balancePayableLabel}</span>
                    </div>
                  </div>
                </div>

                {/* 3. Agreement / Policy Row */}
                <AgreementRow
                  agreed={termsAgreed}
                  disabled={!hasReadTerms}
                  depositAmount={50}
                  onToggle={setTermsAgreed}
                  onOpenTerms={() => setIsTermsModalOpen(true)}
                />

                {/* 4. Confirm Rebooking Button */}
                <div className="space-y-2 pt-2">
                  <Button
                    onClick={() => void handleBook()}
                    variant="primary"
                    className="w-full justify-center py-4 text-xs tracking-[0.2em] font-bold uppercase"
                    disabled={isProcessing || !termsAgreed}
                  >
                    {isProcessing ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Transferring Booking...
                      </span>
                    ) : (
                      'Confirm Transferred Reservation \u2192'
                    )}
                  </Button>
                </div>
              </div>
            ) : paymentScreen === 'method' ? (
              /* Screen A: Payment Method Selection */
              <div className="space-y-6">
                <PaymentMethodList
                  methods={enrichedPaymentMethods}
                  selectedMethodId={selectedEnrichedMethod.id}
                  onSelectMethod={handleSelectPaymentMethod}
                  depositAmount={requiredReservationFee}
                />

                <div className="pt-2">
                  <Button
                    onClick={() => setPaymentScreen('pay')}
                    variant="primary"
                    className="w-full justify-center py-4 text-xs font-bold uppercase tracking-[0.2em]"
                    disabled={!selectedEnrichedMethod.enabled}
                  >
                    Continue with {selectedEnrichedMethod.label} &rarr;
                  </Button>
                </div>
              </div>
            ) : (
              /* Screen B: Pay & Confirm */
              <div className="space-y-6">
                {/* 1. Summary Card */}
                <PaymentSummaryCard
                  method={selectedEnrichedMethod}
                  guestCount={bookingMode === 'group' ? guests.length : 1}
                  depositTotal={requiredReservationFee}
                  servicesTotal={bookingMode === 'group' ? groupTotalServicesPrice : balancePayable}
                  onChangeMethod={handleChangeMethodFromSummary}
                />

                {/* 2. Step 1: Scan & Pay */}
                <QrPanel
                  method={selectedEnrichedMethod}
                  depositAmount={requiredReservationFee}
                />

                {/* 3. Step 2: Upload Receipt */}
                <ReceiptUploader
                  receiptFiles={receiptFiles}
                  receiptValidationResults={receiptValidationResults}
                  depositRequired={requiredReservationFee}
                  totalVerifiedAmount={detectedReservationFee}
                  isProcessingOcr={isReceiptChecking}
                  onAttachFile={handleAttachReceiptFile}
                  onRemoveReceipt={handleRemoveReceiptFile}
                  receiptReferences={receiptReferenceNumbers}
                  onReferenceChange={handleReceiptReferenceChange}
                />

                {/* 4. Agreement (Always Rendered) */}
                <AgreementRow
                  agreed={termsAgreed}
                  disabled={!hasReadTerms}
                  depositAmount={requiredReservationFee}
                  onToggle={setTermsAgreed}
                  onOpenTerms={() => setIsTermsModalOpen(true)}
                />

                {/* 5. Submit Button with Action Hint & Toast Alerts */}
                {(() => {
                  const deficitAmount = Math.max(0, requiredReservationFee - (detectedReservationFee || 0));
                  const hasPaymentDeficit = !isBypassActive && !allReceiptProofsReadyForAdminReview && (isReceiptChecking || detectedReservationFee < requiredReservationFee || receiptFiles.length === 0);
                  const hasUncheckedAgreement = !termsAgreed;
                  const isSubmitDisabled = isProcessing || hasPaymentDeficit || hasUncheckedAgreement;
                  const paymentProofMessage = receiptFiles.length === 0
                    ? `Please attach payment proof and enter the full reference number (₱${deficitAmount.toFixed(2)} reservation fee).`
                    : isReceiptChecking
                      ? 'Please wait while the receipt and reference checks finish.'
                      : receiptValidationResults.find(result => result.status === 'rejected')?.message ||
                        'Enter a full reference number for every receipt. Each reference is checked for duplicates.';

                  const handleDisabledSubmitClick = () => {
                    if (isProcessing) return;
                    if (hasPaymentDeficit) {
                      addToast({
                        type: 'warning',
                        title: 'Payment Proof Required',
                        message: paymentProofMessage,
                        duration: 5000,
                      });
                      return;
                    }
                    if (hasUncheckedAgreement) {
                      addToast({
                        type: 'warning',
                        title: 'Agreement Required',
                        message: 'Please review and agree to the Terms of Service & Booking Policy to continue.',
                        duration: 5000,
                      });
                      return;
                    }
                  };

                  return (
                    <div className="space-y-2 pt-2">
                      {reservationSubmissionState !== 'idle' && (
                        <div role="status" className="rounded-sm border border-gold/30 bg-gold/10 px-3 py-2 text-xs text-ivory-dim text-center">
                          {reservationSubmissionState === 'submitting'
                            ? 'Sending your reservation details. Cashier review begins after the server confirms submission.'
                            : 'Submission status is not confirmed yet. Retry safely to check the same request; do not submit a new payment.'}
                        </div>
                      )}

                      <div
                        className="w-full"
                        onClick={isSubmitDisabled && !isProcessing ? handleDisabledSubmitClick : undefined}
                      >
                        <Button
                          onClick={() => void handleBook()}
                          variant="primary"
                          className={`w-full justify-center py-4 text-xs tracking-[0.2em] font-bold uppercase ${
                            isSubmitDisabled ? 'pointer-events-none opacity-50 cursor-not-allowed' : ''
                          }`}
                          disabled={isSubmitDisabled}
                        >
                          {isProcessing ? (
                            <span className="flex items-center gap-2">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Sending Reservation Details...
                            </span>
                          ) : (
                            bookingMode === 'group'
                              ? `Submit Payment Proof & Confirm Group (${guests.length} Guests)`
                              : 'Submit Payment Proof & Confirm'
                          )}
                        </Button>
                      </div>

                      {/* Dynamic helper/hint text placed directly beneath the submit button */}
                      <div className="text-center text-xs font-medium pt-1 min-h-[1.25rem]">
                        {hasPaymentDeficit ? (
                          <span className="text-amber-400/90">
                            {paymentProofMessage}
                          </span>
                        ) : hasUncheckedAgreement ? (
                          <span className="text-amber-400/90">
                            Please review and agree to the Terms of Service &amp; Booking Policy to continue.
                          </span>
                        ) : (
                          <span className="text-emerald-400/90">
                            All set — ready to submit your reservation.
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Terms Sheet Bottom Sheet / Modal */}
            <TermsSheet
              isOpen={isTermsModalOpen}
              depositAmount={requiredReservationFee}
              onClose={() => setIsTermsModalOpen(false)}
            />

            {/* Change Payment Method Confirmation Modal */}
            <Modal
              isOpen={isChangeMethodConfirmOpen}
              onClose={() => {
                setIsChangeMethodConfirmOpen(false)
                setPendingProviderId(null);
              }}
              title="Change Payment Method"
              size="sm"
              footer={
                <div className="flex gap-3 w-full justify-end">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsChangeMethodConfirmOpen(false);
                      setPendingProviderId(null);
                    }}
                    className="text-xs py-2.5 px-4 text-ivory-dim hover:text-white"
                  >
                    Keep Receipts
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => {
                      setIsChangeMethodConfirmOpen(false);
                      resetPaymentState();
                      if (pendingProviderId) {
                        setSelectedProviderId(pendingProviderId);
                        setPendingProviderId(null);
                      }
                      setPaymentScreen('method');
                    }}
                    className="text-xs py-2.5 px-4 font-bold"
                  >
                    Clear Receipts &amp; Change
                  </Button>
                </div>
              }
            >
              <div className="py-2 text-sm text-ivory-dim leading-relaxed space-y-2">
                <p>
                  Changing your payment method will clear your uploaded receipt(s) to ensure they match the selected account.
                </p>
                <p className="text-xs text-amber-300">
                  Do you want to proceed and clear the uploaded receipt(s)?
                </p>
              </div>
            </Modal>

            {/* Final Confirmation Modal */}
            <Modal
              isOpen={isConfirmModalOpen}
              onClose={() => setIsConfirmModalOpen(false)}
              title="Confirm Booking"
              size="sm"
              footer={
                <div className="flex flex-col-reverse sm:flex-row gap-3 w-full justify-end">
                  <Button
                    variant="outline"
                    onClick={() => setIsConfirmModalOpen(false)}
                    className="text-xs py-2.5 px-5 border-white/20 text-ivory-dim hover:text-white"
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => {
                      setIsConfirmModalOpen(false);
                      void handleBook(true);
                    }}
                    className="text-xs py-2.5 px-5 font-bold uppercase tracking-wider"
                  >
                    Confirm &amp; Submit
                  </Button>
                </div>
              }
            >
              <div className="space-y-4 py-2">
                <div className="flex items-start gap-3 p-3.5 bg-gold/10 border border-gold/30 rounded-sm">
                  <CheckCircle className="w-5 h-5 text-gold shrink-0 mt-0.5" />
                  <p className="text-sm text-ivory leading-relaxed">
                    Your terms agreement and payment receipt have been checked.
                  </p>
                </div>
                <p className="text-sm text-ivory-dim leading-relaxed">
                  Submit this booking now? The ₱{requiredReservationFee.toFixed(2)} reservation fee is strictly non-refundable.
                </p>
              </div>
            </Modal>
          </div>
        )}

        {/* Persistent Docked Footer with Expandable Details Drawer */}
        {(bookingStep > 0 || isReviewingGuests) && (isReviewingGuests || !((!isMobile && bookingStep === 4) || (isMobile && bookingStep === 5))) && (() => {
          const currentGuestIdx = editingGuestIndex !== null ? editingGuestIndex : activeGuestIndex;
          const currentGuestName = guestName.trim() || (currentGuestIdx === 1 ? 'Guest 1 (You)' : `Guest ${currentGuestIdx}`);
          const currentGuestServices = selectedServices;
          const currentGuestPrice = currentGuestServices.reduce((acc, s) => acc + (Number(String(s.price ?? '').replace(/[^\d.]/g, '')) || 0), 0);
          const currentGuestDuration = currentGuestServices.reduce((acc, s) => acc + getServiceDurationMinutes(s), 0);

          const isGroup = bookingMode === 'group';
          const count = isGroup ? currentGuestServices.length : selectedServices.length;
          const isDateTimeStep = (!isMobile && bookingStep === 1) || (isMobile && (bookingStep === 1 || bookingStep === 2));
          const dateTimeSummary = selectedDate && selectedTime
            ? `${selectedDate} · ${selectedTime}`
            : selectedDate
              ? `${selectedDate} · pick a time`
              : 'Pick a date and time';
          const summaryLabel = isDateTimeStep ? dateTimeSummary : isGroup
            ? (isReviewingGuests
                ? `${guests.length} ${guests.length === 1 ? 'guest' : 'guests'} scheduled · tap for details`
                : `Guest ${currentGuestIdx} (${currentGuestName}) · ${count} ${count === 1 ? 'service' : 'services'} · tap for details`)
            : `${count} ${count === 1 ? 'service' : 'services'} · tap for details`;

          const displayedPrice = isGroup
            ? (isReviewingGuests
                ? Math.round(groupTotalServicesPrice).toLocaleString('en-PH')
                : Math.round(currentGuestPrice).toLocaleString('en-PH'))
            : Math.round(combinedPrice).toLocaleString('en-PH');
          const displayedDuration = isGroup ? currentGuestDuration : combinedDuration;
          const partyTotalBadge = isGroup && partySize > 1
            ? `Party: ₱${Math.round(groupTotalServicesPrice).toLocaleString('en-PH')}`
            : null;

          const readyGuestsCount = isGroup
            ? Array.from({ length: partySize }, (_, i) => i + 1).filter((gIdx) => {
                if (gIdx === currentGuestIdx) {
                  return selectedServices.length > 0 && Boolean(selectedBarber);
                }
                const guest = guests.find((g) => g.guestIndex === gIdx);
                return (guest?.services || []).length > 0 && Boolean(guest?.barberId);
              }).length
            : 0;

          const isServiceStep = (!isMobile && bookingStep === 2) || (isMobile && bookingStep === 3);
          const isBarberStep = (!isMobile && bookingStep === 3) || (isMobile && bookingStep === 4);

          let canContinue = false;
          let continueButtonText = 'CONTINUE →';

          if (isReviewingGuests) {
            canContinue = guests.length >= 1 && guests.every(g => (g.services || []).length > 0 && g.barberId && g.scheduledDate && g.scheduledTime);
            continueButtonText = 'PROCEED TO PAYMENT →';
          } else if (!isMobile && bookingStep === 1) {
            canContinue = Boolean(selectedDate && selectedTime);
            continueButtonText = 'CONTINUE TO SERVICES →';
          } else if (isMobile && bookingStep === 1) {
            canContinue = Boolean(selectedDate);
            continueButtonText = 'SELECT TIME SLOT →';
          } else if (isMobile && bookingStep === 2) {
            canContinue = Boolean(selectedTime);
            continueButtonText = 'CONTINUE TO SERVICES →';
          } else if (isServiceStep) {
            canContinue = selectedServices.length > 0;
            continueButtonText = 'CONTINUE TO BARBER →';
          } else if (isBarberStep) {
            canContinue = Boolean(selectedBarber);
            if (isGroup) {
              const remainingGuests = Array.from({ length: partySize }, (_, i) => i + 1)
                .filter(idx => idx !== currentGuestIdx)
                .some(idx => {
                  const g = guests.find(guest => guest.guestIndex === idx);
                  return !g || !(g.services || []).length || !g.barberId;
                });
              continueButtonText = remainingGuests ? 'NEXT GUEST →' : 'REVIEW GROUP →';
            } else {
              continueButtonText = 'REVIEW RESERVATION →';
            }
          }

          // On mobile the date step continues to the time step, so only the other steps save from the edit.
          const isSummaryEditSave = summaryEditMode && !isReviewingGuests && !(isMobile && bookingStep === 1);
          if (isSummaryEditSave) {
            continueButtonText = 'SAVE & BACK TO SUMMARY →';
          }

          const handleBottomContinue = () => {
            if (!canContinue || isPreparingSummary) return;
            if (isSummaryEditSave) {
              saveSummaryEdit();
              return;
            }
            setIsSummaryDrawerOpen(false);

            if (isReviewingGuests) {
              handleProceedToCheckout();
              return;
            }

            if (!isMobile && bookingStep === 1) {
              setBookingStep(2);
            } else if (isMobile && bookingStep === 1) {
              setBookingStep(2);
            } else if (isMobile && bookingStep === 2) {
              setBookingStep(3);
            } else if (isServiceStep) {
              setBookingStep(isMobile ? 4 : 3);
            } else if (isBarberStep) {
              completeGroupGuest(selectedBarber);
            }
          };

          const footerContent = (
            <div className="relative w-full">
              {/* Expandable Accordion Drawer Backdrop */}
              {isSummaryDrawerOpen && (
                <div
                  className="fixed inset-0 bg-black/60 z-20 backdrop-blur-xs transition-opacity animate-fade-in"
                  onClick={() => setIsSummaryDrawerOpen(false)}
                />
              )}

              {/* Expandable Accordion Drawer Content */}
              {isSummaryDrawerOpen && (
                <div className="relative z-30 w-full bg-[#181818] border-t border-gold/30 shadow-[0_-12px_30px_rgba(0,0,0,0.85)] max-h-[60vh] overflow-y-auto animate-fade-in">
                  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
                    {isGroup ? (
                      <div className="space-y-4">
                        <h3 className="font-serif font-bold text-base sm:text-lg text-ivory">Your party</h3>
                        {Array.from({ length: partySize }, (_, i) => i + 1).map((gIdx) => {
                          const guestData = guests.find(g => g.guestIndex === gIdx);
                          const isCurrent = currentGuestIdx === gIdx;
                          const effectiveServices = isCurrent ? selectedServices : (guestData?.services || []);
                          const guestMinutes = effectiveServices.reduce((acc, s) => acc + getServiceDurationMinutes(s), 0);
                          const guestSubtotal = effectiveServices.reduce((acc, s) => acc + (Number(String(s.price ?? '').replace(/[^\d.]/g, '')) || 0), 0);
                          const hasServices = effectiveServices.length > 0;

                          return (
                            <div
                              key={gIdx}
                              className={`p-3.5 rounded-lg border transition-all ${
                                isCurrent
                                  ? 'bg-gold/[0.06] border-gold/40 shadow-sm'
                                  : 'bg-white/[0.02] border-white/10'
                              }`}
                            >
                              <div className="flex items-center justify-between pb-2 border-b border-white/5 mb-2">
                                <span className="text-xs sm:text-sm font-serif font-bold text-ivory">
                                  {guestData?.guestName || (gIdx === 1 ? 'Guest 1 (You)' : `Guest ${gIdx}`)}
                                </span>
                                {hasServices ? (
                                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                    READY
                                  </span>
                                ) : (
                                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                    NEEDS SERVICE
                                  </span>
                                )}
                              </div>

                              {hasServices ? (
                                <div className="space-y-1.5">
                                  {effectiveServices.map(s => {
                                    const p = Number(String(s.price ?? '').replace(/[^\d.]/g, '')) || 0;
                                    return (
                                      <div key={s.id ?? s.service_id} className="flex justify-between text-xs text-ivory-dim">
                                        <span>{s.name || s.title}</span>
                                        <span className="font-mono text-ivory font-medium">₱{p.toLocaleString('en-PH')}</span>
                                      </div>
                                    );
                                  })}
                                  <div className="flex justify-between text-xs pt-2 border-t border-white/5 text-ivory font-bold">
                                    <span>Subtotal · {guestMinutes} mins</span>
                                    <span className="font-mono">₱{guestSubtotal.toLocaleString('en-PH')}</span>
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-1">
                                  <p className="text-xs text-ivory-dim/70">No services yet.</p>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      switchToGuest(gIdx);
                                      setIsSummaryDrawerOpen(false);
                                    }}
                                    className="text-xs text-gold hover:underline font-bold inline-block cursor-pointer"
                                  >
                                    + Add services
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {/* Overall Party Summary */}
                        <div className="pt-3 border-t border-white/10 space-y-2 text-xs sm:text-sm">
                          <div className="flex justify-between items-center text-ivory-dim">
                            <span>Services total · pay at shop</span>
                            <span className="font-mono text-ivory font-medium">₱{Math.round(groupTotalServicesPrice).toLocaleString('en-PH')}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <div>
                              <span className="text-ivory font-bold block">Reservation fee · due now</span>
                              <span className="text-[11px] text-ivory-dim">₱50 × {partySize} guests</span>
                            </div>
                            <span className="font-serif font-bold text-gold text-lg">₱{requiredReservationFee.toLocaleString('en-PH')}</span>
                          </div>
                          <p className="text-[11px] text-ivory-dim/70 leading-relaxed pt-1">
                            The reservation fee is paid online in the last step. The service total is paid at the shop after your visit.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {selectedServices.length > 0 ? (
                          selectedServices.map(s => {
                            const price = Number(String(s.price ?? '').replace(/[^\d.]/g, '')) || 0;
                            const dur = getServiceDurationMinutes(s);
                            return (
                              <div key={s.id ?? s.service_id} className="flex items-center justify-between text-xs sm:text-sm text-ivory">
                                <div>
                                  <span className="font-medium">{s.name || s.title}</span>
                                  {dur > 0 && <span className="text-ivory-dim text-xs ml-2">({formatDuration(dur)})</span>}
                                </div>
                                <span className="font-mono font-medium">₱{price.toLocaleString('en-PH')}</span>
                              </div>
                            );
                          })
                        ) : (
                          <p className="text-xs text-ivory-dim italic">No services selected yet.</p>
                        )}
                        <div className="border-t border-white/10 pt-2.5 flex items-center justify-between text-xs sm:text-sm font-bold text-ivory">
                          <span>Services total</span>
                          <span className="font-mono text-gold font-bold">₱{Math.round(combinedPrice).toLocaleString('en-PH')}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Bottom Sticky Action Bar */}
              <div className="relative z-30 w-full bg-charcoal border-t border-gold/40 shadow-[0_-12px_40px_rgba(0,0,0,0.95)]">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 sm:py-3.5 flex items-center justify-between gap-3">
                  {/* Left column */}
                  <div className="flex flex-col min-w-0 pr-1">
                    {isGroup && (
                      <p className={`text-[11px] sm:text-xs font-semibold leading-tight truncate ${readyGuestsCount === partySize ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {readyGuestsCount === partySize
                          ? `All ${partySize} guests ready`
                          : ((!isMobile && bookingStep === 1) || (isMobile && (bookingStep === 1 || bookingStep === 2)))
                            ? `${partySize} guests party booking`
                            : `Guest ${currentGuestIdx} of ${partySize} · ${isBarberStep ? 'Choose barber' : 'Choose service'}`}
                      </p>
                    )}

                    <button
                      type="button"
                      onClick={() => setIsSummaryDrawerOpen((prev) => !prev)}
                      className="flex items-center gap-1 text-[11px] sm:text-xs text-ivory-dim hover:text-gold transition-colors text-left cursor-pointer mt-0.5"
                    >
                      <span>
                        {isGroup && !isDateTimeStep
                          ? (isReviewingGuests
                              ? `${partySize} guests scheduled`
                              : `${partySize} guests · ${readyGuestsCount} of ${partySize} ready`)
                          : summaryLabel}
                      </span>
                      <span className="text-[10px] text-gold font-bold">
                        {isSummaryDrawerOpen ? 'v' : '^'}
                      </span>
                    </button>

                    {!isDateTimeStep && (
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <span className="font-serif font-bold text-lg sm:text-xl text-ivory leading-none">
                          ₱{displayedPrice}
                        </span>
                        <span className="text-[11px] text-ivory-dim font-normal leading-none">
                          services
                        </span>
                        {displayedDuration > 0 && !isGroup && (
                          <span className="text-xs text-ivory-dim font-normal ml-1">
                            · {formatDuration(displayedDuration)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right: Continue button */}
                  <Button
                    variant="primary"
                    disabled={!canContinue || isPreparingSummary}
                    onClick={handleBottomContinue}
                    className={`shrink-0 font-bold text-xs sm:text-sm tracking-wider uppercase px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl transition-all shadow-md ${
                      !canContinue || isPreparingSummary
                        ? 'opacity-40 cursor-not-allowed bg-gold/50 text-charcoal'
                        : isReviewingGuests
                          ? 'border border-gold bg-gold text-charcoal shadow-[0_0_24px_rgba(212,175,55,0.6)] hover:bg-gold-light active:scale-95 cursor-pointer'
                          : 'bg-gold hover:bg-gold-light text-charcoal shadow-[0_0_15px_rgba(212,175,55,0.25)] active:scale-95 cursor-pointer'
                    }`}
                  >
                    <span>{continueButtonText}</span>
                  </Button>
                </div>
              </div>
            </div>
          );

          return footerSlot ? createPortal(footerContent, footerSlot) : footerContent;
        })()}

        {/* Remove Guest Confirmation Modal */}
        <Modal
          isOpen={Boolean(guestToRemove)}
          onClose={() => setGuestToRemove(null)}
          title="Remove Guest"
          size="sm"
          footer={
            <div className="flex gap-3 w-full justify-end">
              <Button
                variant="outline"
                onClick={() => setGuestToRemove(null)}
                className="text-xs py-3 px-6 border-white/20 text-ivory-dim hover:text-white"
              >
                Cancel
              </Button>
              <Button
                variant="outline"
                onClick={confirmRemoveGuest}
                className="text-xs py-3 px-6 border-red-500/40 text-red-400 hover:border-red-500 hover:text-white hover:bg-red-500/20 transition-all font-semibold"
              >
                Remove
              </Button>
            </div>
          }
        >
          <div className="py-2">
            <div className="flex items-start gap-3 p-3.5 bg-red-500/10 border border-red-500/25 rounded-sm">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <p className="text-sm text-ivory leading-relaxed">
                Are you sure you want to remove <strong className="text-white font-semibold">{guestToRemove?.guestName || `Guest ${guestToRemove?.guestIndex}`}</strong> from your group reservation?
              </p>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  );
};

/**
 * Barbershop-menu-styled multi-service selection with:
 * - Featured Signature Packages strip so common combos are one click, not several.
 * - Category filter pills to reduce cognitive load.
 * - Compact menu-row list (thin gold hairlines, uppercase tracking) as an alternative
 *   to full card grids while preserving the palette.
 * - Conflict-aware toggling: services that would collide are shown as locked with reason.
 */
interface ServicesStepProps {
  services: any[];
  selectedServices: any[];
  selectedServiceIds: number[];
  combinedDuration: number;
  combinedPriceLabel: string;
  onToggleService: (service: any) => void;
  onClear: () => void;
  onContinue: () => void;
  checkConflictFor: (candidate: any[]) => { reason: string; conflictingIds: number[] } | null;
  isCutoffHours?: boolean;
  selectedTime?: string | null;
}

const CATEGORY_ORDER = ["MEN'S GROOMING", "TREATMENT SERVICES", "SPECIAL PROMOS"];

const normalizeCategory = (service: any) => String(service.category ?? 'OTHER').toUpperCase();

const formatPrice = (value: any) => {
  if (typeof value === 'string' && value.trim().startsWith('₱')) return value;
  const numeric = Number(String(value ?? '').replace(/[^\d.]/g, ''));
  if (!Number.isFinite(numeric) || numeric === 0) {
    return typeof value === 'string' && value ? value : '₱0';
  }
  return `₱${numeric.toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;
};

const ServicesStep: React.FC<ServicesStepProps> = ({
  services,
  selectedServices,
  selectedServiceIds,
  combinedDuration,
  combinedPriceLabel,
  onToggleService,
  onClear,
  onContinue,
  checkConflictFor,
  isCutoffHours = false,
  selectedTime,
}) => {
  const [showLocked, setShowLocked] = useState(false);

  // Auto-hide locked services whenever service selection changes
  useEffect(() => {
    setShowLocked(false);
  }, [selectedServices]);

  const evaluatedServices = useMemo(() => {
    const selectedTimeMinutes = selectedTime ? timeToMinutes(selectedTime) : null;
    const CUTOFF_LIMIT = 20 * 60 + 30; // 8:30 PM cutoff

    return services.map(service => {
      const id = Number(service.id ?? service.service_id);
      const isSelected = selectedServiceIds.includes(id);
      const serviceDuration = Number.parseInt(String(service.duration ?? service.duration_minutes ?? ''), 10) || 0;

      const otherServicesDuration = selectedServices
        .filter(s => Number(s.id ?? s.service_id) !== id)
        .reduce((acc, s) => acc + (Number.parseInt(String(s.duration ?? s.duration_minutes ?? ''), 10) || 0), 0);
      const candidateDuration = otherServicesDuration + serviceDuration;

      let isExceedingCutoff = false;
      let cutoffReason: string | undefined;

      if (selectedTimeMinutes !== null) {
        if (selectedTimeMinutes + serviceDuration > CUTOFF_LIMIT) {
          isExceedingCutoff = true;
          cutoffReason = `Exceeds 8:30 PM cutoff for selected time (${selectedTime})`;
        } else if (!isSelected && selectedTimeMinutes + candidateDuration > CUTOFF_LIMIT) {
          isExceedingCutoff = true;
          cutoffReason = `Combined duration exceeds 8:30 PM cutoff for selected time (${selectedTime})`;
        }
      } else if (isCutoffHours && !isSelected && serviceDuration > 30) {
        isExceedingCutoff = true;
        cutoffReason = 'Exceeds 30-min cutoff limit';
      }

      const comboConflict = !isSelected && !isExceedingCutoff && checkConflictFor([...selectedServices, service]);

      const isLocked = isExceedingCutoff || !!comboConflict;
      const conflictReason = isExceedingCutoff
        ? cutoffReason
        : comboConflict ? comboConflict.reason : undefined;

      return {
        service,
        id,
        isSelected,
        isLocked,
        isExceedingCutoff,
        conflictReason,
      };
    });
  }, [services, selectedServices, selectedServiceIds, isCutoffHours, checkConflictFor, selectedTime]);

  const totalLockedCount = useMemo(() => {
    return evaluatedServices.filter(item => item.isLocked && !item.isSelected).length;
  }, [evaluatedServices]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof evaluatedServices>();
    for (const item of evaluatedServices) {
      const category = normalizeCategory(item.service);
      if (!map.has(category)) map.set(category, []);
      map.get(category)!.push(item);
    }
    const sortedKeys = Array.from(map.keys()).sort((a, b) => {
      const ai = CATEGORY_ORDER.indexOf(a);
      const bi = CATEGORY_ORDER.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });

    return sortedKeys.map(key => {
      const allItems = map.get(key)!;
      const lockedCount = allItems.filter(item => item.isLocked && !item.isSelected).length;
      const displayItems = showLocked ? allItems : allItems.filter(item => !item.isLocked || item.isSelected);

      return {
        category: key,
        allItems,
        displayItems,
        lockedCount,
      };
    });
  }, [evaluatedServices, showLocked]);

  const [activeCategory, setActiveCategory] = useState<string>('ALL');
  const categoryTabs = useMemo(() => ['ALL', ...grouped.map(g => g.category)], [grouped]);

  const visibleGroups = activeCategory === 'ALL'
    ? grouped
    : grouped.filter(group => group.category === activeCategory);

  return (
    <div className="space-y-6">
      {/* Prominent Cutoff Notice Banner */}
      {isCutoffHours && (
        <div className="p-4 bg-amber-950/50 border-2 border-amber-500/60 rounded-sm flex items-start gap-3 shadow-lg animate-fade-in">
          <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <h5 className="font-bold text-amber-300 text-sm tracking-wide">Cutoff Hours Notice</h5>
            <p className="text-xs text-amber-200/90 font-light mt-0.5">
              Only short-time services are available during cutoff hours. (Services over 30 minutes are restricted to ensure timely shop closing).
            </p>
          </div>
        </div>
      )}


      {/* Category filter pills & Auto-hide toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-white/5 py-3">
        <div className="flex flex-wrap gap-2">
          {categoryTabs.map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveCategory(tab)}
              className={`px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] rounded-full border transition-all ${activeCategory === tab
                ? 'bg-gold text-charcoal border-gold'
                : 'border-white/10 text-ivory-dim hover:border-gold/50 hover:text-gold'
                }`}
            >
              {tab === 'ALL' ? 'All Services' : tab}
            </button>
          ))}
        </div>

        {/* Global Auto-Hide / Show Unavailable Toggle Button */}
        {totalLockedCount > 0 && (
          <button
            type="button"
            onClick={() => setShowLocked(prev => !prev)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-full border transition-all ${showLocked
              ? 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
              : 'bg-white/5 text-ivory-dim border-white/10 hover:border-gold/50 hover:text-gold'
              }`}
          >
            {showLocked ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span>{showLocked ? 'Hide Unavailable' : `Show Unavailable (${totalLockedCount})`}</span>
          </button>
        )}
      </div>

      {/* Compact menu-row selection grouped by category. */}
      <div className="space-y-8">
        {visibleGroups.map(group => {
          if (group.displayItems.length === 0 && group.lockedCount > 0) {
            return (
              <section key={group.category} className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="h-px flex-1 bg-white/5" aria-hidden />
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.3em] text-gold">
                    {group.category}
                  </h4>
                  <span className="h-px flex-1 bg-white/5" aria-hidden />
                </div>
                <div className="p-4 border border-white/5 rounded-sm bg-white/[0.02] flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs text-ivory-dim">
                    <Lock className="w-3.5 h-3.5 text-gold/60" />
                    <span>{group.lockedCount} {group.lockedCount === 1 ? 'service is' : 'services are'} unavailable with current selection</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowLocked(true)}
                    className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-gold hover:text-gold-light transition-colors"
                  >
                    <Eye className="w-3 h-3" /> Show
                  </button>
                </div>
              </section>
            );
          }

          if (group.displayItems.length === 0) return null;

          return (
            <section key={group.category} className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-white/5" aria-hidden />
                <h4 className="text-[10px] font-bold uppercase tracking-[0.3em] text-gold">
                  {group.category}
                </h4>
                <span className="h-px flex-1 bg-white/5" aria-hidden />
              </div>

              <div className="border border-white/5 rounded-sm bg-white/[0.02] overflow-hidden">
                <ul className="divide-y divide-white/5">
                  {group.displayItems.map(({ service, id, isSelected, isLocked, isExceedingCutoff, conflictReason }) => {
                    return (
                      <li key={id}>
                        <button
                          type="button"
                          disabled={isLocked}
                          onClick={() => onToggleService(service)}
                          aria-pressed={isSelected}
                          aria-disabled={isLocked}
                          title={conflictReason}
                          className={`w-full flex items-center gap-4 px-4 py-3 text-left transition-colors ${isSelected
                            ? 'bg-gold/10'
                            : isLocked
                              ? 'opacity-50 hover:bg-white/[0.02] cursor-not-allowed'
                              : 'hover:bg-white/[0.04]'
                            }`}
                        >
                          {/* Selection indicator: gold ring / check when selected, lock when conflicting. */}
                          <span
                            className={`shrink-0 flex items-center justify-center w-6 h-6 rounded-full border transition-colors ${isSelected
                              ? 'bg-gold border-gold text-charcoal'
                              : isLocked
                                ? 'border-white/10 text-ivory-dim/60'
                                : 'border-white/20 text-transparent'
                              }`}
                            aria-hidden
                          >
                            {isSelected ? (
                              <CheckCircle className="w-4 h-4" />
                            ) : isLocked ? (
                              <Lock className="w-3.5 h-3.5" />
                            ) : null}
                          </span>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <span className={`font-serif text-base font-bold break-words ${isSelected ? 'text-gold' : 'text-ivory'}`}>
                                {service.name || service.title}
                              </span>
                              {service.sub_category && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider bg-gold/10 text-gold/80 border border-gold/20">
                                  {service.sub_category}
                                </span>
                              )}
                              {isLocked && (
                                <span className="text-[9px] uppercase tracking-widest text-red-300/80 bg-red-900/20 px-1.5 py-0.5 rounded border border-red-500/20">
                                  {isExceedingCutoff ? 'Cutoff limit' : 'Locked'}
                                </span>
                              )}
                            </div>
                            {service.description && (
                              <p className="text-[11px] text-ivory-dim leading-relaxed mt-0.5">
                                {service.description}
                              </p>
                            )}
                            {isLocked && conflictReason && (
                              <p className="text-[10px] text-red-300/80 mt-1">
                                {conflictReason}
                              </p>
                            )}
                          </div>

                          <div className="flex flex-col items-end shrink-0 ml-2">
                            <span className="font-serif text-sm font-bold text-gold">
                              {formatPrice(service.price)}
                            </span>
                            <span className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-ivory-dim">
                              <Clock className="w-3 h-3" />
                              {formatDuration(service.duration ?? service.duration_minutes)}
                            </span>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>

                {/* Section-level toggle hint when there are locked items in this category */}
                {group.lockedCount > 0 && (
                  <div className="px-4 py-2 border-t border-white/5 bg-white/[0.01] flex items-center justify-between text-xs text-ivory-dim/70">
                    <span className="flex items-center gap-1.5 text-[11px]">
                      <Lock className="w-3 h-3 text-gold/60" />
                      {showLocked
                        ? `Showing ${group.lockedCount} unavailable ${group.lockedCount === 1 ? 'service' : 'services'}`
                        : `${group.lockedCount} ${group.lockedCount === 1 ? 'service' : 'services'} unavailable with current selection`}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowLocked(prev => !prev)}
                      className="text-[10px] font-bold uppercase tracking-wider text-gold hover:text-gold-light transition-colors flex items-center gap-1 py-0.5"
                    >
                      {showLocked ? (
                        <>
                          <EyeOff className="w-3 h-3" /> Hide
                        </>
                      ) : (
                        <>
                          <Eye className="w-3 h-3" /> Show
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <p className="text-[11px] text-ivory-dim italic">
        Tip: Signature Packages are ready-made combos. To customize instead, pick individual services below.
      </p>
    </div>
  );
};
