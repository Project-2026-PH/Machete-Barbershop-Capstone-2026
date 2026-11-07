import React, { useState } from 'react';
import { Clock, ChevronRight, Scissors, Star, Eye, CheckCircle, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Link } from 'react-router';
import { useBookingPreview } from './useBookingPreview';
import { BookingBarber } from './booking.service';
import { PublicPortfolioPreviewModal } from '@/features/barber/components/modals/PublicPortfolioPreviewModal';

const RESERVATION_LEAD_TIME_MS = 2 * 60 * 60 * 1000;
const MANILA_TIME_ZONE = 'Asia/Manila';

const getManilaDateIso = (dateOffset = 0): string => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MANILA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const year = Number(parts.find(part => part.type === 'year')?.value);
  const month = Number(parts.find(part => part.type === 'month')?.value);
  const day = Number(parts.find(part => part.type === 'day')?.value);
  const date = new Date(Date.UTC(year, month - 1, day + dateOffset));

  return date.toISOString().split('T')[0];
};

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

const getSelectedDateIso = (selectedDate: string): string => (
  getManilaDateIso(selectedDate === 'Tomorrow' ? 1 : 0)
);


export const BookingPreview = () => {
  const {
    sectionRef,
    branches,
    selectedBranch,
    setSelectedBranch,
    selectedDate,
    setSelectedDate,
    barbers,
    availability,
    isLoading,
    isLoadingSlots,
    selectedBarber,
    setSelectedBarber,
    hasStartedLoading,
    handleBookNow,
    dates,
  } = useBookingPreview();

  const [portfolioBarber, setPortfolioBarber] = useState<BookingBarber | null>(null);

  return (
    <section ref={sectionRef} className="py-24 bg-charcoal border-y border-white/5 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 gap-6">
          <div>
            <span className="text-gold font-serif italic text-xl mb-2 block animate-fade-in">Secure Your Spot</span>
            <h2 className="text-3xl md:text-5xl font-serif font-bold text-ivory tracking-tight animate-fade-in">
              CHECK <span className="text-gold">AVAILABILITY</span>
            </h2>
            <p className="text-sm text-ivory-dim max-w-xl mt-1.5 animate-fade-in">
              Live chair status and available times today. Book a slot or explore the full calendar.
            </p>
          </div>

          {/* View Full Calendar Action */}
          <div className="shrink-0">
            <Link
              to="/booking"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-none bg-gold/10 hover:bg-gold text-gold hover:text-charcoal border border-gold/40 hover:border-gold text-xs font-serif font-bold uppercase tracking-widest transition-all duration-200 shadow-[0_0_15px_rgba(212,175,55,0.08)] group"
            >
              <span>View Full Calendar</span>
              <ChevronRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </div>


        {/* Barbers Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {!hasStartedLoading || isLoading ? (
            Array(3).fill(0).map((_, i) => (
              <div key={i} className="h-64 bg-charcoal-light/50 animate-pulse rounded-sm border border-white/5"></div>
            ))
          ) : barbers.length === 0 ? (
            <div className="col-span-full py-12 text-center border border-dashed border-white/10 rounded-lg">
              <p className="text-ivory-dim italic">No barbers currently active in this branch.</p>
            </div>
          ) : (
            barbers.slice(0, 3).map((barber, index) => {
              const isSelected = selectedBarber?.barber_id === barber.barber_id;
              const selectedDateIso = getSelectedDateIso(selectedDate);
              const selectedAvailability = availability[barber.barber_id];
              const selectableSlots = (selectedAvailability?.availableSlots || [])
                .filter(slot => isAtLeastTwoHoursAhead(selectedDateIso, slot.hour))
                .slice(0, 4);
              return (
                <div 
                  key={barber.barber_id}
                  className={`bg-charcoal-light border rounded-sm overflow-hidden group transition-colors duration-150 animate-fade-in ${
                    isSelected ? 'border-gold shadow-[0_0_15px_rgba(212,175,55,0.1)]' : 'border-white/5 hover:border-gold/30'
                  }`}
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  {/* Barber Header */}
                  <div 
                    className="p-5 flex items-start gap-4 border-b border-white/5 cursor-pointer"
                    onClick={() => setSelectedBarber(barber)}
                  >
                    <div className="h-14 w-14 rounded-full overflow-hidden border-2 border-gold/20 group-hover:border-gold transition-colors duration-150 bg-charcoal shrink-0">
                      <img 
                        src={barber.image || `https://ui-avatars.com/api/?name=${encodeURIComponent(barber.name)}&background=1a1a1a&color=d4af37`} 
                        alt={barber.name} 
                        className="w-full h-full object-cover" 
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg font-serif font-bold text-ivory truncate">{barber.name}</h3>
                      
                      {/* Rating & Review Count (Verified operational data) */}
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {barber.rating !== null && barber.rating !== undefined && (barber.review_count ?? 0) > 0 ? (
                          <span className="text-xs text-gold flex items-center gap-1 font-mono">
                            <Star className="w-3.5 h-3.5 fill-gold text-gold" />
                            {Number(barber.rating).toFixed(1)} <span className="text-ivory-dim/60 font-sans">({barber.review_count} {barber.review_count === 1 ? 'review' : 'reviews'})</span>
                          </span>
                        ) : (
                          <span className="text-[11px] text-ivory-dim/50 italic">No ratings yet</span>
                        )}
                      </div>

                      {/* Authoritative Barber Status Badge (Consistent with Customer Book) */}
                      <div className="mt-1">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          barber.statusType === 'available'
                            ? 'text-green-400 bg-green-500/10 border border-green-500/20'
                            : barber.statusType === 'walkin_only'
                              ? 'text-amber-400 bg-amber-500/15 border border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.2)]'
                              : barber.statusType === 'off_today'
                                ? 'text-ivory-dim/70 bg-white/5 border border-white/10'
                                : barber.statusType === 'serving'
                                  ? 'text-amber-400 bg-amber-500/10 border border-amber-500/20'
                                  : 'text-amber-300 bg-amber-500/15 border border-amber-500/30'
                        }`}>
                          {barber.statusType === 'available' && <CheckCircle className="w-2.5 h-2.5 text-green-400" />}
                          {(barber.statusType === 'walkin_only' || barber.statusType === 'off_today') && <Calendar className="w-2.5 h-2.5" />}
                          <span className="truncate">{barber.statusLabel || 'Available'}</span>
                        </span>
                      </div>

                      {/* Barber Specialties */}
                      {Array.isArray(barber.specialties) && barber.specialties.length > 0 ? (
                        <p className="text-[11px] text-ivory-dim/80 truncate mt-1">
                          {barber.specialties.slice(0, 3).join(' • ')}
                        </p>
                      ) : barber.specialty ? (
                        <p className="text-[11px] text-ivory-dim/80 truncate mt-1">
                          {barber.specialty}
                        </p>
                      ) : (
                        <p className="text-[11px] text-ivory-dim/40 italic mt-1">
                          No specialties listed yet
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Slots & Actions */}
                  <div className="p-5 flex flex-col justify-between flex-1">
                    <div>
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-xs text-ivory-dim flex items-center gap-1.5 font-medium">
                          <Clock className="w-3.5 h-3.5 text-gold" />
                          Available Slots
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2.5 mb-4">
                        {barber.statusType === 'walkin_only' ? (
                          <div className="col-span-2 text-center py-3 bg-amber-500/10 border border-amber-500/20 rounded-sm">
                            <p className="text-[10px] text-amber-400 uppercase font-bold tracking-wider">
                              Walk-in Only • Book Ahead
                            </p>
                          </div>
                        ) : barber.statusType === 'off_today' ? (
                          <div className="col-span-2 text-center py-3 bg-white/5 border border-white/10 rounded-sm">
                            <p className="text-[10px] text-ivory-dim uppercase font-bold tracking-wider">
                              Off Today • Book Ahead
                            </p>
                          </div>
                        ) : isLoadingSlots ? (
                          Array(4).fill(0).map((_, i) => (
                            <div key={i} className="h-9 bg-white/5 animate-pulse rounded-sm"></div>
                          ))
                        ) : selectableSlots.length > 0 ? (
                          selectableSlots.map((slot) => (
                            <button 
                              key={slot.hour}
                              onClick={() => handleBookNow(barber, slot.hour)}
                              className="py-2 px-2.5 border border-white/10 text-ivory text-xs hover:bg-gold hover:text-charcoal hover:border-gold transition-colors duration-150 rounded-sm text-center"
                            >
                              {slot.hour}
                            </button>
                          ))
                        ) : (
                          <div className="col-span-2 text-center py-3 bg-red-400/5 border border-red-400/10 rounded-sm">
                            <p className="text-[10px] text-red-400 uppercase font-bold tracking-tighter">
                              {selectedDate === 'Today' ? "No Slots Remaining Today" : "Fully Booked"}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-white/5">
                      {barber.statusType === 'available' ? (
                        <Button 
                          variant="primary" 
                          className="w-full text-xs py-2.5 flex justify-between items-center group/btn"
                          onClick={() => handleBookNow(barber, selectableSlots[0]?.hour || null)}
                        >
                          Book {barber.name.split(' ')[0]}
                          <ChevronRight className="w-4 h-4 transform group-hover/btn:translate-x-1 transition-transform" />
                        </Button>
                      ) : (
                        <Button 
                          variant="outline" 
                          className="w-full text-xs py-2.5 flex justify-between items-center group/btn border-gold/40 text-gold hover:bg-gold/10"
                          onClick={() => handleBookNow(barber, null)}
                        >
                          Book Ahead
                          <ChevronRight className="w-4 h-4 transform group-hover/btn:translate-x-1 transition-transform" />
                        </Button>
                      )}

                      <Button
                        type="button"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPortfolioBarber(barber);
                        }}
                        className="w-full text-xs py-2 border border-white/10 hover:border-gold/40 text-gold hover:text-gold flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        View Portfolio
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })

          )}
        </div>

        {/* Public Barber Portfolio Modal (Decision Support) */}
        <PublicPortfolioPreviewModal
          isOpen={portfolioBarber !== null}
          onClose={() => setPortfolioBarber(null)}
          barberId={portfolioBarber?.barber_id}
          barberName={portfolioBarber?.name}
          isBookingMode={true}
          onSelectBarber={() => {
            if (portfolioBarber) {
              handleBookNow(portfolioBarber, null);
            }
          }}
        />

        <div className="mt-12 text-center">
          <p className="text-ivory-dim text-sm">
            Don't see a time that works? <Link to="/booking" className="text-gold hover:underline decoration-gold/50 underline-offset-4">View Full Calendar</Link>
          </p>
        </div>

      </div>
    </section>
  );
};


