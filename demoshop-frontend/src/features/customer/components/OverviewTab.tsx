import React, { useState, useEffect } from 'react';
import { Calendar, Scissors, Star, Clock, User, MapPin, History, ShoppingBag, ArrowRight, Camera, RefreshCw, X, Trash2, AlertCircle, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { api } from '@/config/api';
import { useToast } from '@/components/feedback/ToastContext';
import { quotes } from '../data';
import { Link } from 'react-router';
import { ReservationCard } from './ReservationCard';
import { RecentHistoryDetailsModal } from './RecentHistoryDetailsModal';
import { RescheduleAppointmentModal } from './RescheduleAppointmentModal';
import { formatManilaAuditTimestamp, reservationTimeToEpoch } from '@/utils/manila-date';
import { groupHistoryItems } from '../utils/group-history.util';
import { countCompletedReservationCards } from '../utils/completed-reservation-count';

const CANCELLATION_NOTICE_MS = 24 * 60 * 60 * 1000;

interface OverviewTabProps {
  userData: any;
  historyData: any[];
  upcomingAppointmentData: any;
  setActiveTab: (tab: string) => void;
  userBranch?: string;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({ userData, historyData, upcomingAppointmentData, setActiveTab, userBranch }) => {
  const [quote, setQuote] = useState('');
  const [, setPhotoSuccessNonce] = useState<number>(0);
  const [selectedDetailsItem, setSelectedDetailsItem] = useState<any | null>(null);
  const [viewingPhotoUrl, setViewingPhotoUrl] = useState<string | null>(null);
  const [photoToDelete, setPhotoToDelete] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [isRescheduleModalOpen, setIsRescheduleModalOpen] = useState(false);
  const [rescheduleSnapshot, setRescheduleSnapshot] = useState<any | null>(null);
  const [hasRescheduled, setHasRescheduled] = useState(() => Boolean(upcomingAppointmentData?.id && localStorage.getItem(`appointment-rescheduled:${upcomingAppointmentData.id}`)));

  const groupedHistory = React.useMemo(() => groupHistoryItems(historyData || []), [historyData]);
  const completedReservationCount = countCompletedReservationCards(groupedHistory);
  const [cancellationClockMs, setCancellationClockMs] = useState(() => Date.now());
  const { addToast } = useToast();

  const scheduledStartMs = upcomingAppointmentData?.scheduled_start_at
    ? new Date(upcomingAppointmentData.scheduled_start_at).getTime()
    : reservationTimeToEpoch(
        upcomingAppointmentData?.appointment_date,
        upcomingAppointmentData?.appointment_time,
      );
  const canCancelReservation = scheduledStartMs !== null
    && Number.isFinite(scheduledStartMs)
    && scheduledStartMs - cancellationClockMs >= CANCELLATION_NOTICE_MS;
  const isConfirmedUpcoming = !upcomingAppointmentData?.status
    || ['pending', 'accepted', 'confirmed'].includes(String(upcomingAppointmentData.status).toLowerCase());
  const canRescheduleAppointment = isConfirmedUpcoming
    && scheduledStartMs !== null
    && Number.isFinite(scheduledStartMs)
    && scheduledStartMs - cancellationClockMs >= CANCELLATION_NOTICE_MS;
  const rescheduleAppointment = {
    ...upcomingAppointmentData,
    queue_entry_id: upcomingAppointmentData?.appointment_id || upcomingAppointmentData?.id,
    id: upcomingAppointmentData?.appointment_id || upcomingAppointmentData?.id,
    services: (upcomingAppointmentData?.services || []).map((service: any) => ({
      service_id: service.service_id ?? service.id,
    })),
  };
  const scheduleDelayMinutes = Number(upcomingAppointmentData?.schedule_delay_minutes) || 0;
  const estimatedAppointmentTime = scheduleDelayMinutes > 0 && upcomingAppointmentData?.estimated_start_at
    ? formatManilaAuditTimestamp(upcomingAppointmentData.estimated_start_at, 'time-only')
    : null;

  useEffect(() => {
    // Select a random quote on mount
    const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
    setQuote(randomQuote);
  }, []);

  useEffect(() => {
    const updateCancellationClock = () => setCancellationClockMs(Date.now());
    updateCancellationClock();
    const clock = window.setInterval(updateCancellationClock, 30_000);
    return () => window.clearInterval(clock);
  }, [
    upcomingAppointmentData?.id,
    upcomingAppointmentData?.scheduled_start_at,
    upcomingAppointmentData?.appointment_date,
    upcomingAppointmentData?.appointment_time,
  ]);

  useEffect(() => {
    if (viewingPhotoUrl || photoToDelete) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = 'unset';
      };
    }
  }, [viewingPhotoUrl, photoToDelete]);

  const recommendedProducts = [
    { id: 1, name: "DemoShop Matte Clay", price: "₱850", image: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?q=80&w=1887&auto=format&fit=crop" },
    { id: 2, name: "Sandalwood Beard Oil", price: "₱650", image: "https://images.unsplash.com/photo-1626285861696-9f0bf5a49c6d?q=80&w=2070&auto=format&fit=crop" },
    { id: 3, name: "Daily Face Wash", price: "₱450", image: "https://images.unsplash.com/photo-1608248597279-f99d160bfbc8?q=80&w=1926&auto=format&fit=crop" },
  ];

  return (
    <div className="space-y-8 animate-fade-in w-full">

      {/* Greeting & Quote */}
      <div className="mb-8">
        <h2 className="text-3xl font-serif font-bold text-ivory mb-2 flex items-center gap-2">
          Good {new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 18 ? 'Afternoon' : 'Evening'},
          <span className="text-gold">
            {userData ? userData.first_name : <Skeleton variant="text" className="w-32 h-8 inline-block" />}
          </span>
        </h2>
        <p className="text-ivory-dim text-sm italic font-light border-l-2 border-gold/50 pl-4 py-1">
          "{quote}"
        </p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-charcoal-light/50 backdrop-blur-sm border border-white/5 p-6 rounded-sm relative overflow-hidden group hover:border-gold/30 transition-all duration-500 hover:-translate-y-1 hover:shadow-lg card-gold-accent">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity duration-500">
            <Scissors size={80} />
          </div>
          <span className="text-gold text-[10px] uppercase tracking-[0.2em] font-bold">Completed Reservations</span>
          <h3 className="text-4xl font-serif font-bold text-ivory mt-2">
            {Array.isArray(historyData) ? completedReservationCount : <Skeleton variant="text" className="w-12 h-10" />}
          </h3>
        </div>

        <div className="bg-charcoal-light/50 backdrop-blur-sm border border-white/5 p-6 rounded-sm relative overflow-hidden group hover:border-gold/30 transition-all duration-500 hover:-translate-y-1 hover:shadow-lg card-gold-accent">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity duration-500">
            <Calendar size={80} />
          </div>
          <span className="text-gold text-[10px] uppercase tracking-[0.2em] font-bold">Next Visit</span>
          <h3 className="text-4xl font-serif font-bold text-ivory mt-2">
            {upcomingAppointmentData ? new Date(upcomingAppointmentData.appointment_date).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }) : 'N/A'}
          </h3>
        </div>
      </div>
      
      <div className="w-full space-y-8">
        {/* Upcoming Appointment */}
        {upcomingAppointmentData ? (
          <div className="bg-gradient-to-r from-charcoal-light to-charcoal border border-gold/30 p-8 rounded-sm relative overflow-hidden shadow-2xl group card-gold-accent">
            <div className="absolute top-0 right-0 w-96 h-96 bg-gold/5 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5 pointer-events-none"></div>

            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 relative z-10">
              <div className="space-y-3.5 flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <span className="inline-block w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                  <span className="text-gold text-xs font-bold uppercase tracking-[0.2em]">Upcoming Appointment</span>
                  {upcomingAppointmentData.is_group && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gold/15 text-gold border border-gold/40 shadow-[0_0_8px_rgba(212,175,55,0.15)]">
                      <Users className="w-3 h-3 text-gold" /> Group Booking ({upcomingAppointmentData.total_guests || upcomingAppointmentData.guests?.length || 2} Guests)
                    </span>
                  )}
                </div>

                <h3 className="text-xl sm:text-2xl md:text-3xl font-serif font-bold text-ivory tracking-wide leading-snug break-words">
                  {upcomingAppointmentData.service_name}
                </h3>

                <div className="flex flex-wrap gap-3 sm:gap-5 text-ivory-dim text-xs sm:text-sm">
                  <div className="flex items-center gap-2 group/item">
                    <div className="p-1.5 sm:p-2 bg-white/5 rounded-full group-hover/item:bg-gold/10 transition-colors">
                      <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gold" />
                    </div>
                    <span className="font-light">{new Date(upcomingAppointmentData.appointment_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                  </div>
                  <div className="flex items-center gap-2 group/item">
                    <div className="p-1.5 sm:p-2 bg-white/5 rounded-full group-hover/item:bg-gold/10 transition-colors">
                      <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gold" />
                    </div>
                    <span className="font-light">{upcomingAppointmentData.appointment_time}</span>
                    {estimatedAppointmentTime && (
                      <span className="font-semibold text-amber-300">
                        Est. {estimatedAppointmentTime} (+{scheduleDelayMinutes}m)
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 group/item">
                    <div className="p-1.5 sm:p-2 bg-white/5 rounded-full group-hover/item:bg-gold/10 transition-colors">
                      <User className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gold" />
                    </div>
                    <span className="font-light">{upcomingAppointmentData.barber_name}</span>
                  </div>
                  <div className="flex items-center gap-2 group/item">
                    <div className="p-1.5 sm:p-2 bg-white/5 rounded-full group-hover/item:bg-gold/10 transition-colors">
                      <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gold" />
                    </div>
                    <span className="font-light">{upcomingAppointmentData.branch_name}</span>
                  </div>
                </div>
              </div>

              <div className="flex w-full lg:max-w-xs flex-col gap-2 shrink-0">
                {canRescheduleAppointment && !hasRescheduled && !upcomingAppointmentData?.has_used_reschedule && String(upcomingAppointmentData?.schedule_adjustment_status || '').toLowerCase() !== 'rescheduled' && (
                  <Button
                    onClick={() => {
                      if (!canRescheduleAppointment) {
                        addToast({
                          type: 'warning',
                          title: 'Rescheduling unavailable',
                          message: 'Rescheduling is only allowed at least 1 day before your scheduled appointment. For same-day concerns, please contact the shop directly.',
                          duration: 5000,
                        });
                        return;
                      }
                      setRescheduleSnapshot(rescheduleAppointment);
                      setIsRescheduleModalOpen(true);
                    }}
                    variant="outline"
                    aria-disabled={!canRescheduleAppointment}
                    className={`text-xs py-3 px-6 tracking-normal hover:tracking-normal whitespace-nowrap transition-all font-semibold w-full ${canRescheduleAppointment ? 'border-gold/50 text-gold hover:bg-gold/10' : 'border-white/10 text-ivory-dim/50'}`}
                  >
                    Reschedule Appointment
                  </Button>
                )}
                {canCancelReservation ? (
                  <>
                    <Button
                      onClick={() => setActiveTab('queue')}
                      variant="outline"
                      className="text-xs py-3 px-6 border-red-500/40 text-red-400 hover:border-red-500 hover:text-white hover:bg-red-500/20 transition-all font-semibold w-full"
                    >
                      Cancel Reservation
                    </Button>
                    <p className="text-center text-[10px] italic text-ivory-dim/70">
                      The ₱50 reservation fee is strictly non-refundable.
                    </p>
                  </>
                ) : (
                  <p className="rounded-sm border border-white/10 bg-white/5 p-3 text-center text-[11px] text-ivory-dim">
                    Cancellations are only allowed at least 24 hours in advance. The ₱50 fee is non-refundable.
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-charcoal-light/50 backdrop-blur-sm border border-white/5 border-dashed p-12 rounded-sm text-center">
            <p className="text-ivory-dim font-light text-lg mb-4">You have no upcoming reservations.</p>
            <Button onClick={() => setActiveTab('book')} variant="primary">Book Your Next Cut</Button>
          </div>
        )}

        <RescheduleAppointmentModal
          appointment={isRescheduleModalOpen ? rescheduleSnapshot : null}
          onClose={() => { setIsRescheduleModalOpen(false); setRescheduleSnapshot(null); }}
          onCompleted={() => {
            setIsRescheduleModalOpen(false);
            setRescheduleSnapshot(null);
            setHasRescheduled(true);
            window.location.reload();
          }}
        />

        {/* Recent History */}
        <div className="bg-charcoal-light/50 backdrop-blur-sm border border-white/5 rounded-sm overflow-hidden">
          <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
            <h3 className="font-serif font-bold text-ivory text-lg">Recent History</h3>
          {Array.isArray(historyData) && historyData.length > 0 && (
              <button onClick={() => setActiveTab('history')} className="text-xs text-gold hover:text-white transition-colors uppercase tracking-[0.15em] font-bold">View All</button>
            )}
          </div>

          {Array.isArray(groupedHistory) && groupedHistory.length > 0 ? (
            <div className="p-6 space-y-4">
              {groupedHistory.slice(0, 5).map((item, idx) => (
                <ReservationCard
                  key={item.id || idx}
                  item={item}
                  onClick={(cardItem) => setSelectedDetailsItem(cardItem)}
                  onViewPhoto={(url) => setViewingPhotoUrl(url)}
                  onDeletePhoto={(cardItem) => setPhotoToDelete(cardItem)}
                  onUploadPhoto={(cardItem) => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/jpeg,image/png';
                    input.onchange = async (e: any) => {
                      const file = e.target?.files?.[0];
                      if (!file) return;

                      if (!['image/jpeg', 'image/png'].includes(file.type)) {
                        addToast({
                          type: 'error',
                          title: 'Invalid File',
                          message: 'Only JPEG and PNG images are allowed.',
                        });
                        return;
                      }

                      if (file.size > 5 * 1024 * 1024) {
                        addToast({
                          type: 'error',
                          title: 'File Too Large',
                          message: 'Image size must be under 5 MB.',
                        });
                        return;
                      }

                      const formData = new FormData();
                      formData.append('haircut_photo', file);
                      try {
                        const res = await api.post(`/api/customers/history/${cardItem.id}/haircut-photo`, formData, {
                          headers: { 'Content-Type': 'multipart/form-data' }
                        });
                        if (res.data?.haircut_photo_url) {
                          cardItem.haircut_photo_url = res.data.haircut_photo_url;
                          setPhotoSuccessNonce(Date.now());
                          addToast({
                            type: 'success',
                            title: 'Photo Uploaded',
                            message: 'Haircut photo uploaded successfully!',
                          });
                        }
                      } catch (err: any) {
                        console.error('Failed to upload haircut photo', err);
                        const msg = err.response?.data?.message || err.response?.data?.error || 'Failed to upload haircut photo.';
                        addToast({
                          type: 'error',
                          title: 'Upload Failed',
                          message: msg,
                        });
                      }
                    };
                    input.click();
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="p-12 text-center flex flex-col items-center justify-center text-ivory-dim">
              <div className="p-4 bg-white/5 rounded-full mb-4">
                <History className="w-8 h-8 opacity-50" />
              </div>
              <p className="text-lg font-light">No history yet.</p>
              <p className="text-xs mt-2 opacity-50 mb-6">Your grooming journey starts with your first cut.</p>
              <Button onClick={() => setActiveTab('book')} variant="outline" className="text-xs">Book Now</Button>
            </div>
          )}
        </div>
      </div>

      {/* View Fullscreen Photo Modal */}
      {viewingPhotoUrl && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 md:p-8 animate-fade-in overflow-hidden transform-gpu will-change-transform" onClick={() => setViewingPhotoUrl(null)}>
          <div className="relative max-w-3xl w-auto max-h-[85vh] flex flex-col items-center justify-center mx-auto my-auto transform-gpu will-change-transform" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setViewingPhotoUrl(null)}
              className="absolute -top-12 right-0 bg-charcoal/90 hover:bg-black border border-gold/40 text-white hover:text-gold px-3.5 py-1.5 rounded-full transition-all flex items-center gap-1.5 text-xs shadow-xl z-20 cursor-pointer"
            >
              <X className="w-4 h-4" />
              <span>Close</span>
            </button>
            <div className="flex items-center justify-center overflow-hidden rounded-sm border border-gold/40 shadow-2xl bg-black/60">
              <img src={viewingPhotoUrl} alt="Haircut Reference" className="max-w-[85vw] max-h-[80vh] w-auto h-auto object-contain block mx-auto" />
            </div>
          </div>
        </div>
      )}

      {/* Delete Photo Confirmation Modal */}
      {photoToDelete && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 animate-fade-in transform-gpu will-change-transform">
          <div className="bg-charcoal border border-red-500/40 p-6 rounded-sm w-full max-w-sm shadow-2xl space-y-4 relative transform-gpu will-change-transform">
            <div className="flex items-center gap-3 text-red-400">
              <div className="p-2 bg-red-950/60 border border-red-500/30 rounded-full">
                <Trash2 className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-serif font-bold text-ivory">Remove Haircut Photo</h3>
            </div>

            <p className="text-xs text-ivory-dim leading-relaxed">
              Are you sure you want to remove this haircut photo? This action cannot be undone.
            </p>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline"
                disabled={isDeleting}
                onClick={() => setPhotoToDelete(null)}
                className="text-xs border-white/20 text-ivory"
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={isDeleting}
                onClick={async () => {
                  if (!photoToDelete) return;
                  setIsDeleting(true);
                  try {
                    await api.delete(`/api/customers/history/${photoToDelete.id}/haircut-photo`);
                    photoToDelete.haircut_photo_url = null;
                    setPhotoSuccessNonce(Date.now());
                    addToast({
                      type: 'success',
                      title: 'Photo Removed',
                      message: 'Haircut photo removed successfully!',
                    });
                  } catch (err) {
                    console.error('Failed to remove haircut photo', err);
                    photoToDelete.haircut_photo_url = null;
                    setPhotoSuccessNonce(Date.now());
                  } finally {
                    setIsDeleting(false);
                    setPhotoToDelete(null);
                  }
                }}
                className="text-xs bg-red-600 hover:bg-red-700 border-red-600 text-white font-semibold"
              >
                {isDeleting ? 'Removing...' : 'Confirm Remove'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Interactive History Details Modal */}
      {selectedDetailsItem && (
        <RecentHistoryDetailsModal
          item={selectedDetailsItem}
          onClose={() => setSelectedDetailsItem(null)}
          onRebook={(item) => {
            if (item) {
              const svc = item.services?.[0] || { name: item.service_name || item.service, price: item.price };
              localStorage.setItem('preSelectedBooking', JSON.stringify({
                service: svc,
                barber: item.barber_id ? { id: item.barber_id, name: item.barber_name } : undefined
              }));
            }
            setActiveTab('book');
          }}
          onPhotoUpdated={(updatedItem, newUrl) => {
            updatedItem.haircut_photo_url = newUrl;
            setPhotoSuccessNonce(Date.now());
          }}
        />
      )}
    </div>
  );
};
