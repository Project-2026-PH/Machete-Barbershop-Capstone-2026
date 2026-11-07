import React, { useState, useMemo, useRef, useEffect } from 'react';
import { History, Search, ChevronLeft, ChevronRight, X, Scissors, Camera, Upload, Loader2, Trash2, AlertCircle, ShieldCheck, Clock } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { api } from '@/config/api';
import { useToast } from '@/components/feedback/ToastContext';
import { ReservationCard } from './ReservationCard';
import { RecentHistoryDetailsModal } from './RecentHistoryDetailsModal';
import { groupHistoryItems } from '../utils/group-history.util';

interface HistoryTabProps {
  historyData: any[];
  setActiveTab: (tab: string) => void;
  isLoading?: boolean;
  onPhotoUploaded?: () => void;
}

const ITEMS_PER_PAGE = 5;

export const HistoryTab: React.FC<HistoryTabProps> = ({ historyData, setActiveTab, isLoading = false, onPhotoUploaded }) => {
  const [searchInput, setSearchInput] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput);
      setCurrentPage(1);
    }, 150);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Selected history item for detailed modal breakdown
  const [selectedDetailsItem, setSelectedDetailsItem] = useState<any | null>(null);

  // Photo modal & upload states
  const [selectedPhotoItem, setSelectedPhotoItem] = useState<any | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [viewingPhotoUrl, setViewingPhotoUrl] = useState<string | null>(null);
  const [photoToDelete, setPhotoToDelete] = useState<any | null>(null);
  const [isDeletingPhoto, setIsDeletingPhoto] = useState<boolean>(false);

  const { addToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectedPhotoItem || viewingPhotoUrl || photoToDelete) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = 'unset';
      };
    }
  }, [selectedPhotoItem, viewingPhotoUrl, photoToDelete]);

  // Normalize status into reservation history states
  const formatStatus = (rawStatus: string, paymentStatus: string = '') => {
    const status = (rawStatus || '').toLowerCase();
    const isPaid = paymentStatus.toLowerCase().trim() === 'paid';
    if (status === 'no_show' || status === 'no show' || status === 'noshow') return 'NO_SHOW';
    if (status === 'completed' || status === 'done' || status === 'completed_paid') {
      return isPaid ? 'Completed' : 'Upcoming';
    }
    if (status === 'expired' || status === 'cancelled') return 'Cancelled';
    if (status === 'pending') return 'Pending';
    if (status === 'accepted' || status === 'waiting' || status === 'serving') return 'Upcoming';
    return isPaid ? 'Completed' : 'Upcoming';
  };

  const openUploadModal = (item: any) => {
    setSelectedPhotoItem(item);
    setPreviewFile(null);
    setPreviewUrl(null);
    setUploadError(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setUploadError('Only JPEG and PNG images are allowed.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('Image size must be under 5 MB.');
      return;
    }

    setUploadError(null);
    setPreviewFile(file);
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
  };

  const handleUploadSubmit = async () => {
    if (!selectedPhotoItem || !previewFile) return;

    setIsUploading(true);
    setUploadError(null);

    const formData = new FormData();
    formData.append('haircut_photo', previewFile);

    try {
      const res = await api.post(`/api/customers/history/${selectedPhotoItem.id}/haircut-photo`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const newUrl = res.data?.haircut_photo_url;
      if (newUrl) {
        selectedPhotoItem.haircut_photo_url = newUrl;
      }
      
      addToast({
        type: 'success',
        title: 'Photo Uploaded',
        message: 'Haircut photo uploaded successfully!',
      });

      setSelectedPhotoItem(null);
      setPreviewFile(null);
      setPreviewUrl(null);

      if (onPhotoUploaded) {
        onPhotoUploaded();
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || err.response?.data?.error || 'Failed to upload photo. Please try again.';
      setUploadError(msg);
    } finally {
      setIsUploading(false);
    }
  };

  // Generate searchable date formats
  const getSearchableDateVariants = (rawDate: any): string[] => {
    if (!rawDate) return [];
    const dateObj = new Date(rawDate);
    if (isNaN(dateObj.getTime())) return [String(rawDate).toLowerCase()];

    const monthFull = dateObj.toLocaleDateString('en-US', { month: 'long' }).toLowerCase();
    const monthShort = dateObj.toLocaleDateString('en-US', { month: 'short' }).toLowerCase();
    const day = dateObj.getDate();
    const dayPad = String(day).padStart(2, '0');
    const monthNum = dateObj.getMonth() + 1;
    const monthNumPad = String(monthNum).padStart(2, '0');
    const year = String(dateObj.getFullYear());

    return [
      String(rawDate).toLowerCase(),
      `${monthFull} ${day}`,
      `${monthFull} ${dayPad}`,
      `${monthFull} ${day} ${year}`,
      `${monthFull} ${dayPad} ${year}`,
      `${monthShort} ${day}`,
      `${monthShort} ${dayPad}`,
      `${monthShort} ${day} ${year}`,
      `${monthShort} ${dayPad} ${year}`,
      `${monthNumPad} ${dayPad} ${year}`,
      `${dayPad} ${monthNumPad} ${year}`,
      `${monthNumPad}/${dayPad}/${year}`,
      `${dayPad}/${monthNumPad}/${year}`,
      `${monthNumPad}-${dayPad}-${year}`,
      `${dayPad}-${monthNumPad}-${year}`,
      `${monthNumPad} ${year}`,
      `${monthFull} ${year}`,
      year
    ];
  };

  // Group raw entries by group_booking_id
  const groupedData = useMemo(() => groupHistoryItems(historyData || []), [historyData]);

  // Filter Data by Search Query
  const filteredData = useMemo(() => {
    if (!Array.isArray(groupedData)) return [];
    if (!searchQuery.trim()) return groupedData;

    const term = searchQuery.toLowerCase().trim();

    return groupedData.filter((item) => {
      const barberName = (item.barber_name || item.barber || '').toLowerCase();
      const guestInfo = Array.isArray(item.guests)
        ? item.guests.map((g: any) => `${g.guest_name || ''} ${g.barber_name || ''} ${g.service_name || ''}`).join(' ').toLowerCase()
        : '';
      const serviceName = (item.service_name || item.service || '').toLowerCase();
      const cancellationReason = (item.cancellation_reason || item.cancel_reason || '').toLowerCase();

      const rawDate = item.date || item.appointment_date || item.created_at;
      const dateVariants = getSearchableDateVariants(rawDate);

      const matchesBarber = barberName.includes(term) || guestInfo.includes(term);
      const matchesService = serviceName.includes(term);
      const matchesReason = cancellationReason.includes(term);
      const matchesDate = dateVariants.some((variant) => variant.includes(term));

      return matchesBarber || matchesService || matchesReason || matchesDate;
    });
  }, [groupedData, searchQuery]);

  // Reset to page 1 on search change
  const handleSearchChange = (val: string) => {
    setSearchInput(val);
  };

  // Pagination logic (5 items per page)
  const totalPages = Math.max(1, Math.ceil(filteredData.length / ITEMS_PER_PAGE));
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedData = filteredData.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  // Render Reservation Status Stamp
  const renderStatusStamp = (statusText: string) => {
    if (statusText === 'NO_SHOW') {
      return (
        <div className="flex items-center gap-1.5 px-3 py-1 bg-red-950/40 border border-red-500/50 text-red-400 text-[10px] font-bold uppercase tracking-[0.2em] rounded-xs shadow-sm">
          <AlertCircle className="w-3 h-3" />
          <span>No Show</span>
        </div>
      );
    }
    if (statusText === 'Cancelled') {
      return (
        <div className="flex items-center gap-1.5 px-3 py-1 bg-red-950/40 border border-red-800/40 text-red-400 text-[10px] font-bold uppercase tracking-[0.2em] rounded-xs shadow-sm">
          <AlertCircle className="w-3 h-3" />
          <span>Cancelled</span>
        </div>
      );
    }
    if (statusText === 'Pending') {
      return (
        <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-950/40 border border-amber-500/40 text-amber-300 text-[10px] font-bold uppercase tracking-[0.2em] rounded-xs shadow-sm">
          <Clock className="w-3 h-3 animate-spin" style={{ animationDuration: '4s' }} />
          <span>Pending Confirmation</span>
        </div>
      );
    }
    if (statusText === 'Upcoming') {
      return (
        <div className="flex items-center gap-1.5 px-3 py-1 bg-gold/10 border border-gold/60 text-gold text-[10px] font-bold uppercase tracking-[0.2em] rounded-xs shadow-[0_0_12px_rgba(212,175,55,0.25)]">
          <span className="w-1.5 h-1.5 rounded-full bg-gold animate-ping"></span>
          <span>Upcoming Reservation</span>
        </div>
      );
    }
    // Completed
    return (
      <div className="flex items-center gap-1.5 px-3 py-1 bg-gold/10 border border-gold/30 text-gold text-[10px] font-bold uppercase tracking-[0.2em] rounded-xs shadow-[0_0_10px_rgba(212,175,55,0.12)]">
        <ShieldCheck className="w-3.5 h-3.5 text-gold" />
        <span>Completed</span>
      </div>
    );
  };

  return (
    <div className="space-y-8 animate-fade-in w-full pb-8">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-white/5 pb-6">
        <div>
          <div className="flex items-center gap-2 text-gold text-xs font-bold uppercase tracking-[0.25em] mb-1">
            <Scissors className="w-4 h-4 text-gold" />
            <span>Grooming Reservations & History</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-serif font-bold text-ivory tracking-wide">
            Reservation History
          </h2>
          <p className="text-ivory-dim text-xs font-light mt-1">
            View all your past haircuts and grooming reservations.
          </p>
        </div>

        {/* Search Bar */}
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-gold/70 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            disabled={isLoading}
            placeholder="Search by barber, service, or date (e.g. July 4, 04 2024)..."
            className="w-full bg-charcoal/90 border border-gold/30 focus:border-gold text-ivory placeholder:text-ivory-dim/40 text-xs pl-11 pr-10 py-3 rounded-xs transition-all shadow-[0_0_15px_rgba(0,0,0,0.5)] disabled:opacity-50"
          />
          {searchInput && !isLoading && (
            <button
              onClick={() => handleSearchChange('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ivory-dim hover:text-gold transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Main Reservations Content */}
      <div className="space-y-4">
        {isLoading ? (
          /* Skeletal Loading Cards */
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, idx) => (
              <div key={idx} className="bg-charcoal-light/40 border border-white/5 p-6 rounded-sm space-y-4 animate-pulse">
                <div className="flex justify-between items-center">
                  <Skeleton variant="text" className="w-48 h-6" />
                  <Skeleton variant="text" className="w-24 h-6 rounded-xs" />
                </div>
                <div className="flex gap-6">
                  <Skeleton variant="text" className="w-32 h-4" />
                  <Skeleton variant="text" className="w-24 h-4" />
                  <Skeleton variant="text" className="w-20 h-4" />
                </div>
              </div>
            ))}
          </div>
        ) : paginatedData.length > 0 ? (
          <div className="space-y-4">
            {/* List of Reservation Cards */}
            {paginatedData.map((item, idx) => (
              <ReservationCard
                key={item.id || idx}
                item={item}
                onClick={(cardItem) => setSelectedDetailsItem(cardItem)}
                onViewPhoto={(url) => setViewingPhotoUrl(url)}
                onDeletePhoto={(cardItem) => setPhotoToDelete(cardItem)}
                onUploadPhoto={(cardItem) => openUploadModal(cardItem)}
              />
            ))}

            {/* Pagination Toolbar */}
            <div className="p-5 bg-charcoal-light/40 border border-white/5 rounded-sm flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-xs text-ivory-dim">
                Showing <span className="font-bold text-gold">{startIndex + 1}</span> to{' '}
                <span className="font-bold text-gold">{Math.min(startIndex + ITEMS_PER_PAGE, filteredData.length)}</span> of{' '}
                <span className="font-bold text-ivory">{filteredData.length}</span> reservations
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="flex items-center gap-1.5 px-3 py-2 border border-white/10 rounded-xs text-xs text-ivory hover:border-gold hover:text-gold disabled:opacity-30 disabled:hover:border-white/10 disabled:hover:text-ivory transition-all cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Previous</span>
                </button>

                <span className="text-xs text-ivory-dim px-2 font-mono">
                  <span className="text-gold font-bold">{currentPage}</span> / {totalPages}
                </span>

                <button
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage >= totalPages}
                  className="flex items-center gap-1.5 px-3 py-2 border border-white/10 rounded-xs text-xs text-ivory hover:border-gold hover:text-gold disabled:opacity-30 disabled:hover:border-white/10 disabled:hover:text-ivory transition-all cursor-pointer"
                >
                  <span>Next</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Empty State */
          <div className="p-16 bg-charcoal-light/30 border border-white/5 border-dashed rounded-sm text-center flex flex-col items-center justify-center text-ivory-dim">
            <div className="p-4 bg-gold/10 rounded-full mb-4 border border-gold/20">
              <History className="w-10 h-10 text-gold" />
            </div>
            <p className="text-2xl font-serif font-bold text-ivory mb-2">No Reservation History Found</p>
            <p className="text-sm font-light opacity-75 max-w-md mb-6">
              {searchQuery ? `No reservations match "${searchQuery}".` : 'Your reservation history will appear here once you make your first booking.'}
            </p>
            {searchQuery ? (
              <Button onClick={() => handleSearchChange('')} variant="outline" className="text-xs py-2.5 px-6 border-gold/30 text-gold hover:bg-gold/10">
                Clear Search Filter
              </Button>
            ) : (
              <Button onClick={() => setActiveTab('book')} variant="primary" className="text-xs py-3 px-8">
                Book a Reservation Now
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Upload Haircut Photo Modal */}
      {selectedPhotoItem && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 animate-fade-in transform-gpu will-change-transform">
          <div className="bg-charcoal border border-gold/40 p-6 rounded-sm w-full max-w-md shadow-2xl relative space-y-5 transform-gpu will-change-transform">
            <button
              onClick={() => setSelectedPhotoItem(null)}
              disabled={isUploading}
              className="absolute top-4 right-4 text-ivory-dim hover:text-gold transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <div className="flex items-center gap-2 text-gold text-xs font-bold uppercase tracking-widest mb-1">
                <Camera className="w-4 h-4 text-gold" />
                <span>Barber Visual Reference</span>
              </div>
              <h3 className="text-xl font-serif font-bold text-ivory">
                Upload Haircut Photo
              </h3>
              <p className="text-xs text-ivory-dim mt-1">
                Upload a photo of your fresh cut for service dated <strong className="text-gold">{selectedPhotoItem.date}</strong>.
              </p>
            </div>

            {/* Error banner */}
            {uploadError && (
              <div className="p-3 bg-red-950/60 border border-red-800/60 rounded-xs text-xs text-red-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{uploadError}</span>
              </div>
            )}

            {/* Preview Box */}
            <div className="border-2 border-dashed border-white/20 hover:border-gold/60 rounded-sm p-4 text-center bg-black/20 relative min-h-[180px] flex flex-col items-center justify-center gap-3 transition-colors">
              {previewUrl ? (
                <div className="relative w-full max-h-56 overflow-hidden rounded-xs">
                  <img src={previewUrl} alt="Preview" className="w-full h-auto max-h-56 object-contain rounded-xs" />
                  <button
                    onClick={() => { setPreviewFile(null); setPreviewUrl(null); }}
                    className="absolute top-2 right-2 bg-black/70 hover:bg-black p-1.5 rounded-full text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <Upload className="w-8 h-8 text-gold/70" />
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-ivory">Select a photo from your device</p>
                    <p className="text-[10px] text-ivory-dim">PNG or JPG up to 5 MB</p>
                  </div>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    type="button"
                    className="mt-2 px-4 py-2 bg-gold/10 hover:bg-gold/20 border border-gold/40 text-gold text-xs font-semibold rounded-xs transition-colors"
                  >
                    Browse Image
                  </button>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            {/* Submit buttons */}
            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setSelectedPhotoItem(null)}
                disabled={isUploading}
                className="text-xs border-white/20 text-ivory"
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleUploadSubmit}
                disabled={!previewFile || isUploading}
                className="text-xs flex items-center gap-2"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-charcoal" />
                    <span>Uploading...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 text-charcoal" />
                    <span>Confirm & Upload</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

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
                disabled={isDeletingPhoto}
                onClick={() => setPhotoToDelete(null)}
                className="text-xs border-white/20 text-ivory"
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={isDeletingPhoto}
                onClick={async () => {
                  if (!photoToDelete) return;
                  setIsDeletingPhoto(true);
                  try {
                    await api.delete(`/api/customers/history/${photoToDelete.id}/haircut-photo`);
                    photoToDelete.haircut_photo_url = null;
                    addToast({
                      type: 'success',
                      title: 'Photo Removed',
                      message: 'Haircut photo removed successfully!',
                    });
                    if (onPhotoUploaded) onPhotoUploaded();
                  } catch (err) {
                    console.error('Failed to remove haircut photo', err);
                    photoToDelete.haircut_photo_url = null;
                    if (onPhotoUploaded) onPhotoUploaded();
                  } finally {
                    setIsDeletingPhoto(false);
                    setPhotoToDelete(null);
                  }
                }}
                className="text-xs bg-red-600 hover:bg-red-700 border-red-600 text-white font-semibold"
              >
                {isDeletingPhoto ? 'Removing...' : 'Confirm Remove'}
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
            if (onPhotoUploaded) onPhotoUploaded();
          }}
        />
      )}
    </div>
  );
};

