import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Clock, User, Check, Scissors, Plus, X, ChevronDown, Star, Camera, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Link } from 'react-router';
import { useFullCalendar, monthNames } from '@/hooks/useFullCalendar';
import { isPastDate, isBeyondMaxDate } from '@/hooks/calendar.utils';
import { Skeleton } from '@/components/ui/Skeleton';
import { Modal } from '@/components/feedback/Modal';
import { PublicPortfolioPreviewModal } from '@/features/barber/components/modals/PublicPortfolioPreviewModal';
import { BarberPerformanceBadge } from '@/features/barber/components/BarberPerformanceBadge';
import { BarberRatingStars } from '@/features/barber/components/BarberRatingStars';

export const FullCalendar = () => {
    const {
        branches,
        selectedBranch,
        setSelectedBranch,
        barbers,
        barberDutyByDate,
        selectedBarber,
        setSelectedBarber,
        serviceCategories,
        selectedService,
        currentDate,
        selectedDay,
        setSelectedDay,
        availableSlots,
        recentlyTakenSlots,
        busyPeriods,
        selectedSlot,
        setSelectedSlot,
        isLoadingSlots,
        showServiceDropdown,
        setShowServiceDropdown,
        selectedCategory,
        setSelectedCategory,
        isLoading,
        handlePrevMonth,
        handleNextMonth,
        isPrevDisabled,
        isNextDisabled,
        todayDate,
        todayMidnight,
        maxBookingDate,
        handleClearService,
        handleServiceSelect,
        handleProceed,
        isAuthenticated
    } = useFullCalendar();

    const [isPortfolioOpen, setIsPortfolioOpen] = useState(false);
    const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
    const [isCanvasingModalOpen, setIsCanvasingModalOpen] = useState(false);

    const daysInMonth = useMemo(
        () => new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate(),
        [currentDate]
    );

    const firstDayOfMonth = useMemo(
        () => new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay(),
        [currentDate]
    );

    if (isLoading) {
        return (
            <div className="min-h-screen bg-charcoal pt-32 pb-20 px-4 sm:px-6 lg:px-8 relative">
                <div className="absolute inset-0 bg-texture opacity-50 pointer-events-none"></div>

                <div className="max-w-6xl mx-auto relative z-10 animate-pulse">
                    {/* Header Skeleton */}
                    <div className="text-center mb-12">
                        <Skeleton variant="text" className="w-24 h-5 mb-2 mx-auto" />
                        <Skeleton variant="text" className="w-96 h-12 mb-6 mx-auto" />
                        <div className="h-[1px] w-24 bg-white/10 mx-auto"></div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Left Column (Calendar) */}
                        <div className="lg:col-span-2 bg-charcoal-light border border-white/5 p-8 rounded-sm space-y-8">
                            <div className="flex justify-between items-center">
                                <Skeleton variant="text" className="w-48 h-8" />
                                <div className="flex gap-2">
                                    <Skeleton variant="circle" className="w-9 h-9" />
                                    <Skeleton variant="circle" className="w-9 h-9" />
                                </div>
                            </div>

                            {/* Calendar Days Header */}
                            <div className="grid grid-cols-7 gap-2">
                                {Array(7).fill(0).map((_, i) => (
                                    <Skeleton key={i} variant="text" className="h-6 w-full" />
                                ))}
                            </div>

                            {/* Calendar Days Grid */}
                            <div className="grid grid-cols-7 gap-2">
                                {Array(35).fill(0).map((_, i) => (
                                    <Skeleton key={i} variant="rect" className="aspect-square w-full rounded-sm" />
                                ))}
                            </div>

                            {/* Service Selector skeleton */}
                            <div className="pt-8 border-t border-white/10 space-y-4">
                                <Skeleton variant="text" className="w-32 h-6" />
                                <Skeleton variant="rect" className="w-full h-12 rounded-sm" />
                            </div>
                        </div>

                        {/* Right Column (Sidebar) */}
                        <div className="bg-charcoal-light border border-white/5 p-8 rounded-sm space-y-8">
                            <Skeleton variant="text" className="w-48 h-6" />
                            <div className="space-y-4">
                                <Skeleton variant="rect" className="w-full h-16 rounded-sm" />
                                <Skeleton variant="rect" className="w-full h-16 rounded-sm" />
                                <Skeleton variant="rect" className="w-full h-16 rounded-sm" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-charcoal pt-32 pb-20 px-4 sm:px-6 lg:px-8 relative">
            <div className="absolute inset-0 bg-texture opacity-50 pointer-events-none"></div>

            <div className="max-w-6xl mx-auto relative z-10">
                <div className="text-center mb-12 animate-fade-in">
                    <span className="text-gold font-serif italic text-xl mb-2 block">Reservations</span>
                    <h1 className="text-4xl md:text-5xl font-serif font-bold text-ivory mb-6">
                        BOOK YOUR <span className="text-gold">APPOINTMENT</span>
                    </h1>
                    <div className="h-[1px] w-24 bg-gold mx-auto"></div>
                </div>

                {/* 1. Compact Selected Service Bar */}
                <div className="bg-charcoal-light border border-white/5 p-4 sm:p-5 rounded-sm mb-8">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <span className="text-[10px] uppercase font-bold text-gold tracking-widest block mb-1">
                                Selected Service
                            </span>
                            {selectedService ? (
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center shrink-0">
                                        <Scissors className="w-4 h-4 text-gold" />
                                    </div>
                                    <div>
                                        <h3 className="text-base sm:text-lg font-serif font-bold text-ivory">
                                            {selectedService.serviceName}
                                        </h3>
                                        <div className="flex items-center gap-2 text-xs text-ivory-dim">
                                            <span className="font-mono text-gold font-bold">₱{selectedService.servicePrice}</span>
                                            {selectedService.serviceDuration && (
                                                <>
                                                    <span>•</span>
                                                    <span>{selectedService.serviceDuration}</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-sm text-ivory-dim italic">Please choose a service to view availability.</p>
                            )}
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setShowServiceDropdown(!showServiceDropdown)}
                                className="px-4 py-2 bg-gold/10 hover:bg-gold text-gold hover:text-charcoal border border-gold/40 hover:border-gold text-xs font-serif font-bold uppercase tracking-wider rounded-sm transition-all"
                            >
                                {selectedService ? 'Change Service' : 'Select Service'}
                            </button>
                            {selectedService && (
                                <button
                                    onClick={handleClearService}
                                    className="p-2 border border-white/10 hover:border-red-400 text-ivory-dim hover:text-red-400 rounded-sm transition-colors"
                                    title="Remove service"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Collapsible Service Category Dropdown */}
                    {showServiceDropdown && (
                        <div className="mt-4 pt-4 border-t border-white/10 border-dashed animate-fade-in">
                            <div className="border border-gold/30 rounded-sm bg-charcoal max-h-80 overflow-y-auto custom-scrollbar">
                                {serviceCategories.map((categoryGroup, idx) => (
                                    <div key={idx}>
                                        <button
                                            onClick={() => setSelectedCategory(selectedCategory === idx ? null : idx)}
                                            className="w-full px-4 py-3 flex justify-between items-center text-gold hover:bg-white/5 transition-colors duration-150 border-b border-white/5"
                                        >
                                            <span className="font-serif font-bold text-xs uppercase tracking-wider">{categoryGroup.category}</span>
                                            <ChevronDown className={`w-4 h-4 transition-transform duration-150 ${selectedCategory === idx ? 'rotate-180' : ''}`} />
                                        </button>

                                        {selectedCategory === idx && (
                                            <div className="bg-white/[0.02]">
                                                {categoryGroup.services.map((service) => (
                                                    <button
                                                        key={service.id}
                                                        onClick={() => handleServiceSelect(service)}
                                                        className="w-full px-6 py-3 text-left hover:bg-gold/10 transition-colors duration-150 border-b border-white/5 last:border-b-0 group"
                                                    >
                                                        <div className="flex justify-between items-start mb-1">
                                                            <span className="text-ivory text-sm group-hover:text-gold transition-colors duration-150 font-medium">{service.title}</span>
                                                            <span className="text-gold font-serif font-bold text-sm">₱{service.price}</span>
                                                        </div>
                                                        <p className="text-xs text-ivory-dim line-clamp-1">{service.description}</p>
                                                        {service.duration && (
                                                            <div className="flex items-center gap-1 text-[11px] text-ivory-dim/70 mt-1">
                                                                <Clock className="w-3 h-3 text-gold" />
                                                                <span>{service.duration}</span>
                                                            </div>
                                                        )}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-fade-in items-start">
                    {/* Calendar Section */}
                    <div className="lg:col-span-7 bg-charcoal-light border border-white/5 p-4 sm:p-8 rounded-sm">
                        {/* 1. Favorite Barber Filter Carousel (Mobile & Desktop) */}
                        <div className="mb-6 pb-4 border-b border-white/5">
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-[10px] uppercase font-bold text-gold tracking-widest flex items-center gap-1.5">
                                    <User className="w-3.5 h-3.5 text-gold" />
                                    Check Your Barber's Schedule
                                </label>
                                {selectedBarber && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSelectedBarber(null);
                                            setSelectedSlot(null);
                                        }}
                                        className="text-[10px] text-gold/80 hover:text-gold underline transition-colors"
                                    >
                                        Show all barbers
                                    </button>
                                )}
                            </div>

                            {/* Horizontal scrollable pills */}
                            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedBarber(null);
                                        setSelectedSlot(null);
                                    }}
                                    className={`px-3 py-1.5 rounded-full border text-xs font-medium whitespace-nowrap transition-all shrink-0 ${
                                        !selectedBarber
                                            ? 'border-gold bg-gold text-charcoal font-bold shadow-[0_0_10px_rgba(212,175,55,0.25)]'
                                            : 'border-white/10 bg-white/5 text-ivory-dim hover:border-gold/40 hover:text-ivory'
                                    }`}
                                >
                                    All Barbers
                                </button>

                                {barbers.map((b: any) => {
                                    const bId = b.barber_id || b.id;
                                    const isSel = (selectedBarber?.barber_id || (selectedBarber as any)?.id) === bId;
                                    return (
                                        <button
                                            key={bId}
                                            type="button"
                                            onClick={() => {
                                                setSelectedBarber(b);
                                                setSelectedSlot(null);
                                            }}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium whitespace-nowrap transition-all shrink-0 ${
                                                isSel
                                                    ? 'border-gold bg-gold text-charcoal font-bold shadow-[0_0_10px_rgba(212,175,55,0.25)]'
                                                    : 'border-white/10 bg-white/5 text-ivory hover:border-gold/40 hover:bg-white/10'
                                            }`}
                                        >
                                            <div className="w-4 h-4 rounded-full overflow-hidden shrink-0 border border-charcoal bg-charcoal">
                                                <img
                                                    src={b.profile_picture || b.image || `https://ui-avatars.com/api/?name=${encodeURIComponent(b.name)}&background=1a1a1a&color=d4af37`}
                                                    alt={b.name}
                                                    className="w-full h-full object-cover"
                                                />
                                            </div>
                                            <span>{b.name.split(' ')[0]}</span>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Informative Schedule State Notice */}
                            {selectedBarber ? (
                                <p className="mt-2 text-[11px] text-ivory-dim/80">
                                    Highlighting <strong className="text-gold">{selectedBarber.name}</strong>'s schedule · Days marked with <span className="text-emerald-400 font-bold">●</span> are available
                                </p>
                            ) : (
                                <p className="mt-2 text-[11px] text-ivory-dim/60">
                                    Tap your favorite barber above to see their working days, or tap any date to browse all.
                                </p>
                            )}
                        </div>

                        {/* Month Navigation */}
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl sm:text-2xl font-serif font-bold text-ivory">
                                {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
                            </h2>
                            <div className="flex gap-2">
                                <button 
                                    onClick={handlePrevMonth} 
                                    disabled={isPrevDisabled}
                                    className={`p-2 border rounded-full transition-all ${
                                        isPrevDisabled 
                                            ? 'border-white/5 text-white/20 cursor-not-allowed opacity-30' 
                                            : 'border-white/10 hover:border-gold hover:text-gold text-ivory'
                                    }`}
                                    aria-label="Previous month"
                                >
                                    <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
                                </button>
                                <button 
                                    onClick={handleNextMonth} 
                                    disabled={isNextDisabled}
                                    className={`p-2 border rounded-full transition-all ${
                                        isNextDisabled 
                                            ? 'border-white/5 text-white/20 cursor-not-allowed opacity-30' 
                                            : 'border-white/10 hover:border-gold hover:text-gold text-ivory'
                                    }`}
                                    aria-label="Next month"
                                >
                                    <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-7 gap-1.5 sm:gap-2 mb-3 text-center">
                            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                                <div key={day} className="text-[10px] sm:text-xs font-bold text-gold uppercase tracking-widest py-1.5">
                                    {day}
                                </div>
                            ))}
                        </div>

                        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                            {[...Array(firstDayOfMonth)].map((_, i) => (
                                <div key={`empty-${i}`} className="aspect-square"></div>
                            ))}
                            {[...Array(daysInMonth)].map((_, i) => {
                                const day = i + 1;
                                const isSelected = selectedDay === day;
                                const isToday = day === todayDate.getDate() && currentDate.getMonth() === todayDate.getMonth() && currentDate.getFullYear() === todayDate.getFullYear();
                                const isPast = isPastDate(day, currentDate, todayMidnight);
                                const isBeyondMax = isBeyondMaxDate(day, currentDate, maxBookingDate);
                                const isDisabled = isPast || isBeyondMax;

                                const monthStr = String(currentDate.getMonth() + 1).padStart(2, '0');
                                const dayStr = String(day).padStart(2, '0');
                                const dayDateIso = `${currentDate.getFullYear()}-${monthStr}-${dayStr}`;
                                const onDutyBarbers = barberDutyByDate[dayDateIso] || [];

                                const isSelectedBarberOnDuty = selectedBarber
                                    ? onDutyBarbers.some(b => (b.barber_id || b.id) === (selectedBarber.barber_id || (selectedBarber as any).id))
                                    : onDutyBarbers.length > 0;

                                return (
                                    <div key={day} className="relative group">
                                        <button
                                            disabled={isDisabled}
                                            onClick={() => {
                                                setSelectedDay(day);
                                                setSelectedSlot(null);
                                            }}
                                            className={`w-full aspect-square flex flex-col items-center justify-between p-1 sm:p-2 rounded-sm transition-all relative
                                                ${isSelected 
                                                    ? 'bg-gold text-charcoal font-bold shadow-[0_0_15px_rgba(212,175,55,0.35)]' 
                                                    : isDisabled 
                                                        ? 'opacity-20 cursor-not-allowed bg-white/[0.01]' 
                                                        : selectedBarber && !isSelectedBarberOnDuty
                                                            ? 'opacity-40 bg-white/[0.02] text-ivory-dim/50 border border-white/5'
                                                            : 'bg-white/5 text-ivory hover:bg-white/10 hover:border-gold/30 border border-transparent'}
                                                ${isToday && !isSelected ? 'border border-gold text-gold font-bold' : ''}
                                            `}
                                        >
                                            <div className="w-full flex items-center justify-between">
                                                <span className={`text-xs sm:text-sm font-medium ${isSelected ? 'text-charcoal font-bold' : ''}`}>
                                                    {day}
                                                </span>
                                                {isToday && (
                                                    <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-charcoal' : 'bg-gold'}`} />
                                                )}
                                            </div>

                                            {/* Mobile Indicator: Clean & Uncluttered */}
                                            {!isDisabled && (
                                                <div className="sm:hidden flex items-center justify-center mt-auto pb-0.5 pointer-events-none">
                                                    {selectedBarber ? (
                                                        isSelectedBarberOnDuty ? (
                                                            <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-charcoal' : 'bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.8)]'}`} />
                                                        ) : (
                                                            <span className={`text-[8px] font-mono leading-none ${isSelected ? 'text-charcoal' : 'text-ivory-dim/40'}`}>Off</span>
                                                        )
                                                    ) : onDutyBarbers.length > 0 ? (
                                                        <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-charcoal' : 'bg-gold/70'}`} />
                                                    ) : null}
                                                </div>
                                            )}

                                            {/* Desktop Indicator: Rich Barber Bubbles with Hover Tooltip */}
                                            {!isDisabled && onDutyBarbers.length > 0 && (
                                                <div className="hidden sm:flex items-center justify-center -space-x-1.5 pointer-events-none mt-auto">
                                                    {selectedBarber ? (
                                                        isSelectedBarberOnDuty ? (
                                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isSelected ? 'text-charcoal' : 'text-emerald-400 bg-emerald-500/10'}`}>
                                                                Available
                                                            </span>
                                                        ) : (
                                                            <span className={`text-[10px] font-mono ${isSelected ? 'text-charcoal' : 'text-ivory-dim/40'}`}>
                                                                Off Duty
                                                            </span>
                                                        )
                                                    ) : (
                                                        <>
                                                            {onDutyBarbers.slice(0, 3).map((b) => (
                                                                <div
                                                                    key={b.barber_id || b.id}
                                                                    className={`w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full overflow-hidden shrink-0 shadow-sm border ${
                                                                        isSelected ? 'border-charcoal bg-charcoal' : 'border-charcoal bg-charcoal-light'
                                                                    }`}
                                                                    title={b.name}
                                                                >
                                                                    <img
                                                                        src={(b as any).profile_picture || (b as any).image || `https://ui-avatars.com/api/?name=${encodeURIComponent(b.name)}&background=1a1a1a&color=d4af37`}
                                                                        alt={b.name}
                                                                        className="w-full h-full object-cover"
                                                                    />
                                                                </div>
                                                            ))}
                                                            {onDutyBarbers.length > 3 && (
                                                                <span className={`text-[8px] font-bold pl-0.5 ${isSelected ? 'text-charcoal' : 'text-gold'}`}>
                                                                    +{onDutyBarbers.length - 3}
                                                                </span>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </button>

                                        {/* Hover Tooltip (Desktop) */}
                                        {!isDisabled && onDutyBarbers.length > 0 && (
                                            <div className="absolute -top-11 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col items-center z-30 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                                                <div className="bg-charcoal border border-gold/40 text-[10px] text-ivory px-2 py-1 rounded shadow-xl whitespace-nowrap flex items-center gap-1.5">
                                                    {selectedBarber ? (
                                                        <span className={isSelectedBarberOnDuty ? 'text-emerald-400 font-bold' : 'text-ivory-dim'}>
                                                            {selectedBarber.name}: {isSelectedBarberOnDuty ? 'Available' : 'Off Duty'}
                                                        </span>
                                                    ) : (
                                                        <>
                                                            <span className="text-gold font-bold">{onDutyBarbers.length} Available:</span>
                                                            <span className="text-ivory-dim">
                                                                {onDutyBarbers.map(b => b.name.split(' ')[0]).slice(0, 3).join(', ')}
                                                                {onDutyBarbers.length > 3 ? '...' : ''}
                                                            </span>
                                                        </>
                                                    )}
                                                </div>
                                                <div className="w-1.5 h-1.5 bg-charcoal border-r border-b border-gold/40 rotate-45 -mt-1" />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Booking Side Panel: Barbers & Available Times */}
                    <div className="lg:col-span-5 bg-charcoal-light border border-white/5 p-6 sm:p-8 rounded-sm flex flex-col justify-between">
                        <div>
                            {/* Panel Header: Date & Subtle Branch */}
                            <div className="mb-6 pb-4 border-b border-white/5 space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                    <div>
                                        <span className="text-[10px] uppercase font-bold text-gold tracking-widest block">Date</span>
                                        <h3 className="text-xl font-serif font-bold text-ivory">
                                            {monthNames[currentDate.getMonth()]} {selectedDay}, {currentDate.getFullYear()}
                                        </h3>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-[10px] text-ivory-dim/60 uppercase tracking-widest block">Branch</span>
                                        <span className="text-xs text-gold/90 font-medium">
                                            {selectedBranch?.name || 'SampleBranch Branch'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* 2. Compact Availability-Aware Barber Selector */}
                            <div className="space-y-3 mb-6">
                                <div className="flex items-center justify-between">
                                    <label className="text-[10px] uppercase font-bold text-gold tracking-widest">
                                        Available Barbers · {monthNames[currentDate.getMonth()].slice(0, 3)} {selectedDay}
                                    </label>
                                    <span className="text-[10px] text-ivory-dim/60 font-mono">
                                        {barbers.filter((b: any) => b.statusType === 'available').length} Available to Book
                                    </span>
                                </div>

                                <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                                    {barbers.length === 0 ? (
                                        <div className="py-6 text-center border border-dashed border-white/10 rounded-sm">
                                            <p className="text-xs text-ivory-dim italic">No barbers available for this date.</p>
                                            <p className="text-[10px] text-gold mt-1">Try another date.</p>
                                        </div>
                                    ) : (
                                        barbers.map((b: any) => {
                                            const bId = b.barber_id || b.id;
                                            const isSelected = (selectedBarber?.barber_id || (selectedBarber as any)?.id) === bId;
                                            const statusType = b.statusType || 'available';
                                            const statusLabel = b.statusLabel || 'Available';
                                            const slotCount = b.availableSlotCount;

                                            return (
                                                <div
                                                    key={bId}
                                                    onClick={() => {
                                                        setSelectedBarber(b);
                                                        setSelectedSlot(null);
                                                    }}
                                                    className={`p-2.5 border rounded-sm transition-all cursor-pointer flex items-center justify-between gap-3 ${
                                                        isSelected
                                                            ? 'border-gold bg-gold/15 shadow-[0_0_12px_rgba(212,175,55,0.18)]'
                                                            : 'border-white/10 bg-white/[0.02] hover:border-gold/40 hover:bg-white/5'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                                        <div className="relative w-10 h-10 rounded-full overflow-hidden border border-gold/30 shrink-0 bg-charcoal">
                                                            <img
                                                                src={b.profile_picture || b.image || `https://ui-avatars.com/api/?name=${encodeURIComponent(b.name)}&background=1a1a1a&color=d4af37`}
                                                                alt={b.name}
                                                                className="w-full h-full object-cover"
                                                            />
                                                            <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border border-charcoal ${
                                                                statusType === 'available'
                                                                    ? 'bg-green-500'
                                                                    : statusType === 'walkin_only'
                                                                        ? 'bg-amber-500'
                                                                        : 'bg-slate-600'
                                                            }`} />
                                                        </div>

                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex flex-wrap items-center gap-1.5 leading-snug">
                                                                <h4 className={`text-xs font-serif font-bold truncate ${isSelected ? 'text-gold' : 'text-ivory'}`}>
                                                                    {b.name}
                                                                </h4>
                                                                {isSelected && <Check className="w-3 h-3 text-gold shrink-0 stroke-[3]" />}
                                                                <BarberPerformanceBadge isTopPerformer={b.is_top_performer ?? b.isTopPerformer} rank={b.rank} />
                                                            </div>
                                                            <div className="mt-1">
                                                                <BarberRatingStars
                                                                    rating={b.rating}
                                                                    reviewCount={b.review_count ?? b.reviewCount}
                                                                    size="sm"
                                                                    showCount={Boolean((b.review_count ?? b.reviewCount) && (b.review_count ?? b.reviewCount) > 0)}
                                                                />
                                                            </div>
                                                            <div className="flex items-center gap-1.5 mt-1">
                                                                <span className={`text-[10px] font-bold ${
                                                                    statusType === 'available'
                                                                        ? 'text-green-400'
                                                                        : statusType === 'walkin_only'
                                                                            ? 'text-amber-400'
                                                                            : 'text-ivory-dim/60'
                                                                }`}>
                                                                    {statusType === 'available' ? 'Available' : statusLabel}
                                                                </span>
                                                                {statusType === 'available' && typeof slotCount === 'number' && slotCount > 0 && (
                                                                    <span className="text-[10px] text-ivory-dim/60">
                                                                        · {slotCount} {slotCount === 1 ? 'slot open' : 'slots open'}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedBarber(b);
                                                            setIsPortfolioOpen(true);
                                                        }}
                                                        className="px-2.5 py-1 text-[11px] font-medium text-gold hover:text-charcoal bg-gold/10 hover:bg-gold border border-gold/30 rounded transition-all shrink-0 flex items-center gap-1.5 group/btn"
                                                        title={`View haircuts & portfolio for ${b.name}`}
                                                    >
                                                        <Camera className="w-3 h-3 text-gold group-hover/btn:text-charcoal transition-colors" />
                                                        <span>View Portfolio</span>
                                                    </button>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>

                            {/* 3. Available Times */}
                            <div className="space-y-3 mb-6">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] uppercase font-bold text-gold tracking-widest flex items-center gap-1.5">
                                        <Clock className="w-3.5 h-3.5 text-gold" />
                                        Available Times
                                    </span>
                                    {selectedBarber && (
                                        <span className="text-[10px] text-ivory-dim truncate max-w-[140px]">
                                            for {selectedBarber.name}
                                        </span>
                                    )}
                                </div>

                                {(selectedBarber as any)?.statusType === 'walkin_only' ? (
                                    <div className="p-4 border border-amber-500/20 bg-amber-500/10 rounded-sm text-center">
                                        <p className="text-xs text-amber-400 font-bold uppercase tracking-wider">
                                            Walk-in Only Today
                                        </p>
                                        <p className="text-[11px] text-ivory-dim mt-1 leading-relaxed">
                                            {selectedBarber?.name} is on duty at SampleBranch Branch for walk-ins today. To book ahead with an online reservation, select a future date on the calendar.
                                        </p>
                                    </div>
                                ) : (selectedBarber as any)?.statusType === 'off_today' ? (
                                    <div className="p-4 border border-white/10 bg-white/5 rounded-sm text-center">
                                        <p className="text-xs text-ivory-dim font-bold uppercase tracking-wider">
                                            Off Duty on this date
                                        </p>
                                        <p className="text-[11px] text-ivory-dim/70 mt-1 leading-relaxed">
                                            {selectedBarber?.name} is scheduled off on {monthNames[currentDate.getMonth()]} {selectedDay}. Please select another barber or pick another date to book.
                                        </p>
                                    </div>
                                ) : isLoadingSlots ? (
                                    <div className="grid grid-cols-3 gap-2">
                                        {Array(6).fill(0).map((_, i) => (
                                            <div key={i} className="h-9 bg-white/5 animate-pulse rounded-sm border border-white/5"></div>
                                        ))}
                                    </div>
                                ) : (availableSlots.length > 0 || recentlyTakenSlots.length > 0) ? (
                                    <div className="space-y-2">
                                        {recentlyTakenSlots.length > 0 && (
                                            <div className="p-2.5 bg-red-500/10 border border-red-500/30 rounded-sm flex items-center gap-2 text-xs text-red-400 animate-fade-in">
                                                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                                <span>A time slot was just booked by another client in real-time.</span>
                                            </div>
                                        )}

                                        <div className="grid grid-cols-3 gap-2 max-h-[220px] overflow-y-auto custom-scrollbar pr-1">
                                            {/* Real-time animated taken slots */}
                                            {recentlyTakenSlots.map((hour) => (
                                                <div
                                                    key={`taken-${hour}`}
                                                    className="py-2 px-1 text-xs font-mono rounded-sm border border-red-500/70 bg-red-500/20 text-red-300 font-bold flex items-center justify-center gap-1.5 animate-pulse shadow-[0_0_12px_rgba(239,68,68,0.4)]"
                                                >
                                                    <span className="line-through opacity-70">{hour}</span>
                                                    <span className="text-[9px] uppercase tracking-wider bg-red-500 text-charcoal font-black px-1 rounded">Taken!</span>
                                                </div>
                                            ))}

                                            {/* Available Slots */}
                                            {availableSlots.map((slot, index) => {
                                                const isSlotSelected = selectedSlot === index;
                                                return (
                                                    <button
                                                        key={index}
                                                        disabled={!slot.isAvailable}
                                                        onClick={() => setSelectedSlot(index)}
                                                        className={`py-2 px-2 border rounded-sm text-xs font-mono font-medium transition-all text-center flex items-center justify-center gap-1 ${
                                                            !slot.isAvailable
                                                                ? 'border-white/5 bg-white/5 opacity-40 cursor-not-allowed text-ivory-dim'
                                                                : isSlotSelected
                                                                    ? 'border-gold bg-gold text-charcoal font-bold shadow-[0_0_10px_rgba(212,175,55,0.3)]'
                                                                    : 'border-white/10 bg-white/[0.02] text-ivory hover:border-gold hover:text-gold hover:bg-gold/10'
                                                        }`}
                                                    >
                                                        {slot.hour}
                                                        {isSlotSelected && <Check className="w-3 h-3 text-charcoal stroke-[3]" />}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-center py-6 border border-white/5 rounded-sm bg-white/5">
                                        <p className="text-xs text-ivory-dim italic">
                                            No available times for {selectedBarber?.name || 'this barber'} on {monthNames[currentDate.getMonth()].slice(0, 3)} {selectedDay}.
                                        </p>
                                        <p className="text-[10px] text-gold mt-1">Choose another barber or date.</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Continue Button */}
                        <div className="pt-4 border-t border-white/10">
                            <Button
                                variant="primary"
                                className="w-full justify-center py-3 text-xs uppercase tracking-widest font-bold font-serif"
                                disabled={(selectedBarber as any)?.statusType !== 'available' || (selectedService && selectedSlot === null)}
                                onClick={() => {
                                    if (!selectedService) {
                                        setIsServiceModalOpen(true);
                                        return;
                                    }
                                    if (selectedSlot === null || !availableSlots[selectedSlot]) {
                                        return;
                                    }
                                    if (!isAuthenticated) {
                                        setIsCanvasingModalOpen(true);
                                        return;
                                    }
                                    handleProceed();
                                }}
                            >
                                {!selectedService ? 'Choose Service to Continue' : 'Proceed to Booking'}
                            </Button>
                            <p className="text-center text-[10px] text-ivory-dim/70 mt-2 uppercase tracking-widest">
                                {!selectedService 
                                    ? 'Select a service to view duration & book' 
                                    : (selectedBarber as any)?.statusType !== 'available'
                                        ? 'Select an available barber'
                                        : selectedSlot === null 
                                            ? 'Select an available time' 
                                            : isAuthenticated 
                                                ? 'Ready to confirm' 
                                                : 'Account sign in required to confirm'}
                            </p>
                        </div>
                    </div>
                </div>

            </div>

            {/* Public Barber Portfolio Modal (Decision Support) */}
            <PublicPortfolioPreviewModal
                isOpen={isPortfolioOpen}
                onClose={() => setIsPortfolioOpen(false)}
                barberId={selectedBarber?.barber_id}
                barberName={selectedBarber?.name}
                highlightServiceName={selectedService?.serviceName}
                isBookingMode={true}
                onSelectBarber={() => setIsPortfolioOpen(false)}
            />

            {/* Select Service Modal */}
            <Modal
                isOpen={isServiceModalOpen}
                onClose={() => setIsServiceModalOpen(false)}
                title="Select a Service"
                size="md"
            >
                <div className="space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
                    <p className="text-xs text-ivory-dim">
                        Choose a service to view estimated appointment duration and confirm available booking slots.
                    </p>
                    {serviceCategories.map((categoryGroup, idx) => (
                        <div key={idx} className="border border-white/10 rounded-sm overflow-hidden bg-charcoal">
                            <div className="bg-white/5 px-4 py-2 text-xs font-serif font-bold text-gold uppercase tracking-wider">
                                {categoryGroup.category}
                            </div>
                            <div className="divide-y divide-white/5">
                                {categoryGroup.services.map((service) => (
                                    <button
                                        key={service.id}
                                        type="button"
                                        onClick={() => {
                                            handleServiceSelect(service);
                                            setIsServiceModalOpen(false);
                                        }}
                                        className="w-full px-4 py-3 text-left hover:bg-gold/10 transition-colors flex items-center justify-between group"
                                    >
                                        <div className="min-w-0 pr-3">
                                            <span className="text-sm font-medium text-ivory group-hover:text-gold transition-colors block">
                                                {service.title}
                                            </span>
                                            {service.description && (
                                                <p className="text-xs text-ivory-dim/70 line-clamp-1 mt-0.5">{service.description}</p>
                                            )}
                                            <div className="flex items-center gap-1.5 text-[11px] text-gold/80 mt-1">
                                                <Clock className="w-3 h-3 text-gold" />
                                                <span>Estimated ~{service.duration || (service as any).duration_minutes || '30'} mins</span>
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <span className="font-serif font-bold text-gold text-sm block">₱{service.price}</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </Modal>

            {/* Canvasing / Guest Login Warning Modal */}
            <Modal
                isOpen={isCanvasingModalOpen}
                onClose={() => setIsCanvasingModalOpen(false)}
                title="Ready to Finalize Your Reservation?"
                size="md"
            >
                <div className="space-y-4">
                    {/* Booking Snapshot */}
                    <div className="p-4 bg-white/[0.03] border border-gold/30 rounded-sm space-y-2 text-xs">
                        <div className="flex justify-between items-center pb-2 border-b border-white/10">
                            <span className="text-ivory-dim uppercase tracking-wider text-[10px]">Service</span>
                            <span className="font-serif font-bold text-ivory text-sm">
                                {selectedService?.serviceName} (₱{selectedService?.servicePrice})
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-ivory-dim">Estimated Duration</span>
                            <span className="text-gold font-medium">~{selectedService?.serviceDuration || 30} mins</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-ivory-dim">Selected Barber</span>
                            <span className="text-ivory font-medium">{selectedBarber?.name || 'Any Available Barber'}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-ivory-dim">Appointment Time</span>
                            <span className="text-gold font-bold">
                                {monthNames[currentDate.getMonth()]} {selectedDay}, {currentDate.getFullYear()} at {selectedSlot !== null ? availableSlots[selectedSlot]?.hour : ''}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-ivory-dim">Location</span>
                            <span className="text-ivory">SampleBranch Branch</span>
                        </div>
                    </div>

                    {/* Canvasing Notice */}
                    <div className="text-xs text-ivory-dim/80 leading-relaxed bg-white/[0.02] p-3 border border-white/5 rounded-sm">
                        <p className="mb-2">
                            You will be redirected to sign in or create an account to secure this spot. Your selected booking details are preserved so you won't lose your progress.
                        </p>
                        <p className="text-[11px] text-ivory-dim/60 italic">
                            If you are currently canvasing prices or exploring barber schedules, you can cancel to remain on this page.
                        </p>
                    </div>

                    {/* Modal Actions */}
                    <div className="flex items-center justify-between gap-3 pt-3 border-t border-white/10">
                        <button
                            type="button"
                            onClick={() => setIsCanvasingModalOpen(false)}
                            className="px-4 py-2 border border-white/10 hover:border-white/30 text-ivory-dim hover:text-ivory text-xs uppercase tracking-wider rounded-sm transition-colors"
                        >
                            Cancel / Just Canvasing
                        </button>
                        <Button
                            variant="primary"
                            className="px-5 py-2.5 text-xs uppercase tracking-wider font-bold"
                            onClick={() => {
                                setIsCanvasingModalOpen(false);
                                handleProceed();
                            }}
                        >
                            Log In & Book Spot →
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};