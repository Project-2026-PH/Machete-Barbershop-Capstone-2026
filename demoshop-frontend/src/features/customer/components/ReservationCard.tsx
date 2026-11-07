import React from 'react';
import { Scissors, Calendar, Clock, UserCheck, AlertCircle, Users, CheckCircle } from 'lucide-react';

export interface ReservationGuestItem {
  id?: string | number;
  guest_name?: string | null;
  barber_name?: string | null;
  barber_image?: string | null;
  service_name?: string | null;
  price?: number | string;
  haircut_photo_url?: string | null;
}

export interface ReservationCardItem {
  id: string | number;
  status?: string;
  payment_status?: string;
  date?: string;
  appointment_date?: string;
  time?: string;
  appointment_time?: string;
  estimated_start_at?: string | null;
  schedule_delay_minutes?: number | null;
  barber_name?: string;
  barber?: string;
  barber_user_id?: string;
  barber_image?: string | null;
  service_name?: string;
  service?: string;
  price?: number | string;
  total_amount?: number | string;
  reservation_fee?: number | string;
  haircut_photo_url?: string | null;
  source?: 'guest' | string;
  guest_reference?: string | null;
  cancellation_reason?: string;
  cancel_reason?: string;
  created_at?: string;
  sort_time?: string;
  is_group?: boolean;
  isGroup?: boolean;
  group_booking_id?: string | null;
  total_guests?: number;
  guests?: ReservationGuestItem[];
  group_entries?: any[];
}

interface ReservationCardProps {
  item: ReservationCardItem;
  onClick?: (item: ReservationCardItem) => void;
  onViewPhoto?: (url: string) => void;
  onDeletePhoto?: (item: ReservationCardItem) => void;
  onUploadPhoto?: (item: ReservationCardItem) => void;
}

export const formatReservationStatus = (rawStatus: string = '', paymentStatus: string = ''): 'Completed' | 'Cancelled' | 'Pending' | 'Upcoming' | 'NO_SHOW' => {
  const status = rawStatus.toLowerCase().trim();
  const isPaid = paymentStatus.toLowerCase().trim() === 'paid';
  if (status === 'no_show' || status === 'no show' || status === 'noshow') return 'NO_SHOW';
  if (status === 'completed' || status === 'done' || status === 'completed_paid') {
    return isPaid ? 'Completed' : 'Upcoming';
  }
  if (status === 'expired' || status === 'cancelled' || status === 'canceled' || status === 'declined') return 'Cancelled';
  if (status === 'pending') return 'Pending';
  if (status === 'accepted' || status === 'waiting' || status === 'serving') return 'Upcoming';
  return isPaid ? 'Completed' : 'Upcoming';
};

const formatEstimatedTime = (value?: string | null): string | null => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
};

export const renderReservationStatusStamp = (statusText: string) => {
  if (statusText === 'NO_SHOW') {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-red-950/40 border border-red-500/50 text-red-400 text-[10px] font-bold uppercase tracking-[0.15em] rounded-full shadow-sm">
        <AlertCircle className="w-3 h-3" />
        <span>No Show</span>
      </div>
    );
  }
  if (statusText === 'Cancelled') {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-red-950/40 border border-red-800/40 text-red-400 text-[10px] font-bold uppercase tracking-[0.15em] rounded-full shadow-sm">
        <AlertCircle className="w-3 h-3" />
        <span>Cancelled</span>
      </div>
    );
  }
  if (statusText === 'Pending') {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-amber-950/40 border border-amber-500/40 text-amber-300 text-[10px] font-bold uppercase tracking-[0.15em] rounded-full shadow-sm">
        <Clock className="w-3 h-3 animate-spin" style={{ animationDuration: '4s' }} />
        <span>Pending Confirmation</span>
      </div>
    );
  }
  if (statusText === 'Upcoming') {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-gold/10 border border-gold/60 text-gold text-[10px] font-bold uppercase tracking-[0.15em] rounded-full shadow-[0_0_12px_rgba(212,175,55,0.25)]">
        <span className="w-1.5 h-1.5 rounded-full bg-gold animate-ping"></span>
        <span>In Service / Confirmed</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-green-950/40 border border-green-500/40 text-green-400 text-[10px] font-bold uppercase tracking-[0.15em] rounded-full shadow-[0_0_10px_rgba(34,197,94,0.15)]">
      <CheckCircle className="w-3 h-3 text-green-400" />
      <span>Completed</span>
    </div>
  );
};

export const ReservationCard: React.FC<ReservationCardProps> = ({
  item,
  onClick,
  onViewPhoto,
  onDeletePhoto,
  onUploadPhoto,
}) => {
  const isGroup = Boolean(item.is_group || item.isGroup || (item.guests && item.guests.length > 1));
  const guests = item.guests || [];
  const guestCount = item.total_guests || (guests.length > 0 ? guests.length : 1);

  const statusText = formatReservationStatus(item.status || '', item.payment_status || '');
  const formattedDate = item.date || (item.appointment_date ? new Date(item.appointment_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A');
  const formattedTime = item.time || item.appointment_time || '10:00 AM';
  const delayMinutes = Number(item.schedule_delay_minutes) || 0;
  const estimatedTime = delayMinutes > 0 ? formatEstimatedTime(item.estimated_start_at) : null;
  const barberName = item.barber_name || item.barber || item.barber_user_id || 'Any Barber';

  const isCompleted = statusText === 'Completed';
  const isPaid = (item.payment_status || '').toLowerCase() === 'paid';
  const canUploadPhoto = isCompleted && isPaid && item.source !== 'guest' && !isGroup;

  const statusBorderClass =
    statusText === 'NO_SHOW' || statusText === 'Cancelled'
      ? 'status-border-red'
      : statusText === 'Completed'
        ? 'status-border-green'
        : statusText === 'Pending'
          ? 'status-border-amber'
          : 'status-border-gold';

  // Group Booking Card Layout (Unified Layout)
  if (isGroup) {
    return (
      <div
        onClick={() => onClick?.(item)}
        className={`group bg-gradient-to-r from-charcoal-light/95 via-charcoal to-charcoal-light/95 border border-white/10 hover:border-gold/60 p-5 sm:p-6 rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 relative overflow-hidden ${statusBorderClass} flex flex-col gap-4 cursor-pointer hover:-translate-y-0.5 select-none`}
      >
        {/* Subtle Background Scissors Watermark */}
        <div className="absolute top-1/2 -translate-y-1/2 right-4 opacity-[0.03] dark:opacity-[0.05] group-hover:opacity-[0.08] transition-opacity pointer-events-none hidden sm:block">
          <Scissors size={75} className="text-gold" />
        </div>

        {/* Top Header Row: Date & Status Badge on Left, Total Price on Right */}
        <div className="flex items-center justify-between gap-3 relative z-10">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <span className="text-xs font-mono text-ivory-dim/80 font-medium tracking-wide">
              {formattedDate}
            </span>
            {renderReservationStatusStamp(statusText)}
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-gold/15 text-gold border border-gold/30 shadow-[0_0_8px_rgba(212,175,55,0.15)]">
              <Users className="w-2.5 h-2.5 text-gold" /> Group
            </span>
          </div>

          <div className="text-right shrink-0">
            <span className="text-xl sm:text-2xl font-serif font-bold text-gold tracking-tight">
              ₱{Number(item.price || item.total_amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Middle Main Content: Service Name & Time */}
        <div className="space-y-1.5 relative z-10">
          <h3 className="text-lg sm:text-xl font-serif font-bold text-ivory group-hover:text-gold transition-colors tracking-wide truncate">
            {item.service_name || 'Group Grooming Experience'}
          </h3>
          <div className="flex items-center gap-2 text-xs text-ivory-dim font-light">
            <div className="inline-flex items-center gap-1.5 bg-white/5 px-2.5 py-1 rounded-sm border border-white/5">
              <Clock className="w-3.5 h-3.5 text-gold" />
              <span>{formattedTime}</span>
              {estimatedTime && (
                <span className="text-amber-300">Est. {estimatedTime} (+{delayMinutes}m)</span>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Row: Barber Avatar(s) & Name matching single booking format */}
        <div className="flex items-center justify-between pt-2 border-t border-white/5 relative z-10 mt-1">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center -space-x-2">
              {(guests.length > 0 ? guests : Array.from({ length: guestCount })).slice(0, 6).map((g: any, i) => {
                const bName = g?.barber_name || `Barber ${i + 1}`;
                const bImg = g?.barber_image;
                return (
                  <div
                    key={i}
                    title={g?.guest_name ? `${g.guest_name} (${bName})` : bName}
                    className="relative w-8 h-8 rounded-full border-2 border-charcoal bg-charcoal-light overflow-hidden shadow-md flex items-center justify-center shrink-0 ring-1 ring-gold/30 group-hover:ring-gold/60 transition-all"
                  >
                    {bImg ? (
                      <img src={bImg} alt={bName} width={32} height={32} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gold/25 via-charcoal to-charcoal-light text-gold font-serif font-bold text-xs">
                        {bName.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <span className="text-xs text-ivory-dim font-light truncate max-w-[200px] sm:max-w-xs">
              {guests.length > 0 ? Array.from(new Set(guests.map((g) => g.barber_name))).filter(Boolean).join(' & ') : barberName}
            </span>
          </div>

          {/* Cancellation Notice Pill if cancelled */}
          {(item.cancellation_reason || item.cancel_reason) && statusText === 'Cancelled' && (
            <div className="flex items-center gap-1.5 text-[11px] text-red-300/90 truncate max-w-[200px] sm:max-w-xs">
              <AlertCircle className="w-3 h-3 text-red-400 shrink-0" />
              <span className="truncate">{item.cancellation_reason || item.cancel_reason}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Single Reservation Card Layout (Matching Sample Layout)
  return (
    <div
      onClick={() => onClick?.(item)}
      className={`group bg-gradient-to-r from-charcoal-light/95 via-charcoal to-charcoal-light/95 border border-white/10 hover:border-gold/60 p-5 sm:p-6 rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 relative overflow-hidden ${statusBorderClass} flex flex-col gap-4 cursor-pointer hover:-translate-y-0.5 select-none`}
    >
      {/* Subtle Background Scissors Watermark */}
      <div className="absolute top-1/2 -translate-y-1/2 right-4 opacity-[0.03] dark:opacity-[0.05] group-hover:opacity-[0.08] transition-opacity pointer-events-none hidden sm:block">
        <Scissors size={75} className="text-gold" />
      </div>

      {/* Top Header Row: Date & Status Badge on Left, Total Price on Right */}
      <div className="flex items-center justify-between gap-3 relative z-10">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <span className="text-xs font-mono text-ivory-dim/80 font-medium tracking-wide">
            {formattedDate}
          </span>
          {renderReservationStatusStamp(statusText)}
          {item.source === 'guest' && item.guest_reference && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-white/5 text-gold/80 border border-gold/20">
              Walk-in
            </span>
          )}
        </div>

        <div className="text-right shrink-0">
          <span className="text-xl sm:text-2xl font-serif font-bold text-gold tracking-tight">
            ₱{Number(item.price || item.total_amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {/* Middle Main Content: Service Name & Time */}
      <div className="space-y-1.5 relative z-10">
        <h3 className="text-lg sm:text-xl font-serif font-bold text-ivory group-hover:text-gold transition-colors tracking-wide truncate">
          {item.service_name || item.service || 'Classic Grooming Service'}
        </h3>
        <div className="flex items-center gap-2 text-xs text-ivory-dim font-light">
          <div className="inline-flex items-center gap-1.5 bg-white/5 px-2.5 py-1 rounded-sm border border-white/5">
            <Clock className="w-3.5 h-3.5 text-gold" />
              <span>{formattedTime}</span>
              {estimatedTime && (
                <span className="text-amber-300">Est. {estimatedTime} (+{delayMinutes}m)</span>
              )}
          </div>
        </div>
      </div>

      {/* Bottom Row: Barber Avatar and Cancellation Notice if any */}
      <div className="flex items-center justify-between pt-2 border-t border-white/5 relative z-10 mt-1">
        <div className="flex items-center gap-2.5">
          <div
            title={`Assigned Barber: ${barberName}`}
            className="relative w-8 h-8 rounded-full border-2 border-charcoal bg-charcoal-light overflow-hidden shadow-md flex items-center justify-center shrink-0 ring-1 ring-gold/30 group-hover:ring-gold/60 transition-all"
          >
            {item.barber_image ? (
              <img src={item.barber_image} alt={barberName} width={32} height={32} loading="lazy" decoding="async" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gold/25 via-charcoal to-charcoal-light text-gold font-serif font-bold text-xs">
                {barberName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <span className="text-xs text-ivory-dim font-light">{barberName}</span>
        </div>

        {/* Cancellation Notice Pill if cancelled */}
        {(item.cancellation_reason || item.cancel_reason) && statusText === 'Cancelled' && (
          <div className="flex items-center gap-1.5 text-[11px] text-red-300/90 truncate max-w-[200px] sm:max-w-xs">
            <AlertCircle className="w-3 h-3 text-red-400 shrink-0" />
            <span className="truncate">{item.cancellation_reason || item.cancel_reason}</span>
          </div>
        )}
      </div>
    </div>
  );
};
