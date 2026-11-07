export interface BookingCheckpointData {
  step: number;
  bookingMode?: 'single' | 'group';
  guests?: any[];
  activeGuestIndex?: number;
  selectedServices?: any[];
  selectedService?: any;
  selectedBarber?: any;
  showSpecificBarbers?: boolean;
  selectedDate?: string | null;
  selectedTime?: string | null;
  baseTimeSlot?: string | null;
  isStaggered?: boolean;
  selectedBranch?: any;
  activePaymentMethod?: string;
  referenceNumber?: string;
  termsAgreed?: boolean;
  isRebooking?: boolean;
  rebookingQueueId?: number | null;
  savedAt: number;
}

const CHECKPOINT_STORAGE_KEY = 'demoshop_booking_checkpoint';
const CHECKPOINT_MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours

export const getBookingCheckpoint = (): BookingCheckpointData | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CHECKPOINT_STORAGE_KEY);
    if (!raw) return null;
    const data: BookingCheckpointData = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;

    // Expire checkpoints older than 2 hours
    if (Date.now() - (data.savedAt || 0) > CHECKPOINT_MAX_AGE_MS) {
      clearBookingCheckpoint();
      return null;
    }

    // Check if the selected date has already passed in Manila time
    if (data.selectedDate) {
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
      if (data.selectedDate < today) {
        clearBookingCheckpoint();
        return null;
      }
    }

    return data;
  } catch (err) {
    console.warn('[BookingCheckpoint] Error reading checkpoint:', err);
    return null;
  }
};

export const saveBookingCheckpoint = (partial: Partial<BookingCheckpointData>) => {
  if (typeof window === 'undefined') return;
  try {
    const existing = getBookingCheckpoint() || { step: 0, savedAt: Date.now() };
    const merged: BookingCheckpointData = {
      ...existing,
      ...partial,
      savedAt: Date.now(),
    };
    localStorage.setItem(CHECKPOINT_STORAGE_KEY, JSON.stringify(merged));
  } catch (err) {
    console.warn('[BookingCheckpoint] Error saving checkpoint:', err);
  }
};

export const clearBookingCheckpoint = () => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(CHECKPOINT_STORAGE_KEY);
    localStorage.removeItem('demoshop_rebooking_context');
  } catch {}
};
