import React, { useState, useEffect, useRef } from 'react';
import { ServiceCard } from './ServiceCard';
import { api } from '@/config/api';
import { Skeleton } from '@/components/ui/Skeleton';

interface Service {
    service_id: string | number;
    id: string | number;
    title: string;
    description: string;
    price: string | number;
    duration?: string;
    category?: string;
    image_url?: string | null;
}

interface ServiceCategoryGroup {
    category: string;
    services: Service[];
}

const ServiceCardSkeleton = () => (
    <div className="p-3 sm:p-8 bg-charcoal-light border border-white/5 rounded-xl sm:rounded-sm flex flex-row sm:flex-col justify-between overflow-hidden">
        <div className="relative w-28 h-28 sm:w-[calc(100%+4rem)] sm:h-44 shrink-0 sm:-mx-8 sm:-mt-8 mb-0 sm:mb-6 overflow-hidden rounded-lg sm:rounded-none border-b sm:border-b border-gold/20 bg-charcoal flex items-center justify-center">
            <Skeleton variant="rect" className="w-full h-full" />
        </div>
        <div className="flex-1 flex flex-col justify-between pl-3 sm:pl-0 min-w-0">
            <div>
                <div className="flex justify-between items-baseline mb-1 sm:mb-4 border-b border-white/5 pb-1 sm:pb-4">
                    <Skeleton variant="text" className="w-1/3 h-5 sm:h-6" />
                    <Skeleton variant="text" className="w-12 sm:w-16 h-5 sm:h-6" />
                </div>
                <div className="space-y-1 sm:space-y-2 mb-2 sm:mb-6">
                    <Skeleton variant="text" className="w-full h-3 sm:h-4" />
                    <Skeleton variant="text" className="w-5/6 h-3 sm:h-4" />
                </div>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-zinc-800/60 sm:border-transparent">
                <Skeleton variant="text" className="w-20 sm:w-24 h-3 sm:h-4" />
                <Skeleton variant="circle" className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
        </div>
    </div>
);

export interface ServicesListProps {
    overrideServices?: any[];
}

export const ServicesList: React.FC<ServicesListProps> = ({ overrideServices }) => {
    const [serviceCategories, setServiceCategories] = useState<ServiceCategoryGroup[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
    const [loading, setLoading] = useState(!overrideServices);
    const [showTimeoutError, setShowTimeoutError] = useState(false);
    const sectionRef = useRef<HTMLDivElement | null>(null);

    const formatAndSetServices = (data: any[]) => {
        // Normalize category names (trim + canonical upper case) to prevent case-variant duplicate groups
        const grouped = (Array.isArray(data) ? data : []).reduce<Record<string, { category: string; services: Service[] }>>((acc, service: any) => {
            const rawCategory = (service.category && typeof service.category === 'string') ? service.category.trim() : 'OTHER';
            const canonicalKey = rawCategory.toUpperCase();

            if (!acc[canonicalKey]) {
                acc[canonicalKey] = {
                    category: canonicalKey,
                    services: []
                };
            }

            // Prevent duplicate service cards within the same group
            const alreadyExists = acc[canonicalKey].services.some(s => String(s.id) === String(service.service_id));
            if (!alreadyExists) {
                acc[canonicalKey].services.push({
                    ...service,
                    id: service.service_id,
                    duration: service.duration_minutes ? `${service.duration_minutes} MIN` : undefined
                });
            }
            return acc;
        }, {});

        const formattedCategories = Object.values(grouped);
        setServiceCategories(formattedCategories);
    };

    const fetchServices = async () => {
        if (overrideServices) {
            formatAndSetServices(overrideServices);
            setLoading(false);
            return;
        }
        setLoading(true);
        setShowTimeoutError(false);
        try {
            const response = await api.get('/api/services');
            formatAndSetServices(response.data);
        } catch (error) {
            console.error("[ServicesList] Error fetching services:", error);
            setShowTimeoutError(true);
        } finally {
            setLoading(false);
        }
    };

    // Eagerly fetch on component mount or process override services
    useEffect(() => {
        if (overrideServices) {
            formatAndSetServices(overrideServices);
            setLoading(false);
            return;
        }
        fetchServices();
    }, [overrideServices]);

    // 8-second timeout loader check (prevents premature error triggers during backend cold start/compilation)
    useEffect(() => {
        if (!loading) {
            setShowTimeoutError(false);
            return;
        }

        const timer = setTimeout(() => {
            if (loading) {
                setShowTimeoutError(true);
            }
        }, 8000);

        return () => clearTimeout(timer);
    }, [loading]);

    // Handle Timeout Error UI
    if (loading && showTimeoutError) {
        return (
            <section className="py-32 bg-charcoal relative bg-texture overflow-hidden">
                <div className="container mx-auto px-4 relative z-10 max-w-xl">
                    <div className="col-span-full py-12 text-center border border-dashed border-white/10 rounded-lg">
                        <p className="text-ivory-dim italic mb-4">Unable to load services.</p>
                        <button 
                            onClick={fetchServices}
                            className="px-6 py-2 bg-gold text-charcoal hover:bg-gold/80 transition-all font-bold uppercase tracking-wider text-xs rounded-none"
                        >
                            Retry
                        </button>
                    </div>
                </div>
            </section>
        );
    }

    // Handle the Empty State for the public view
    if (loading) {
        return (
            <section className="py-10 sm:py-16 md:py-24 bg-charcoal relative bg-texture overflow-hidden">
                <div className="container mx-auto px-4 relative z-10 animate-pulse">
                    {/* Header Skeleton */}
                    <div className="flex flex-col items-center mb-8 sm:mb-12">
                        <Skeleton variant="text" className="w-24 h-5 mb-2" />
                        <Skeleton variant="text" className="w-48 h-8 sm:h-10 mb-3" />
                        <Skeleton variant="text" className="w-72 sm:w-96 h-4" />
                    </div>

                    {/* Category Skeleton */}
                    <div className="mb-10">
                        <div className="flex justify-center mb-6 sm:mb-8">
                            <Skeleton variant="text" className="w-48 h-8" />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-6 md:gap-8 max-w-5xl mx-auto">
                            <ServiceCardSkeleton />
                            <ServiceCardSkeleton />
                            <ServiceCardSkeleton />
                            <ServiceCardSkeleton />
                        </div>
                    </div>
                </div>
            </section>
        );
    }

    if (serviceCategories.length === 0) {
        return (
            <section id="services" className="py-10 sm:py-16 md:py-24 bg-charcoal text-center">
                <p className="text-ivory-dim font-serif italic">Our service menu is being updated. Please check back soon!</p>
            </section>
        );
    }

    // Dynamic categories list derived strictly from database records
    const categoryTabs = [
        { label: 'ALL', count: serviceCategories.reduce((sum, g) => sum + g.services.length, 0) },
        ...serviceCategories.map(group => ({
            label: group.category,
            count: group.services.length
        }))
    ];

    // Filter displayed groups based on active category selection
    const displayedGroups = selectedCategory === 'ALL'
        ? serviceCategories
        : serviceCategories.filter(g => g.category === selectedCategory);

    return (
        <section ref={sectionRef} id="services" className="py-10 sm:py-16 md:py-24 bg-charcoal relative bg-texture overflow-hidden">
            <div className="container mx-auto px-4 relative z-10">
                <div className="text-center mb-6 sm:mb-8 md:mb-12">
                    <span className="text-gold font-serif italic text-base sm:text-xl mb-1 sm:mb-2 block animate-fade-in">
                        Our Craft
                    </span>
                    <h2 className="text-2xl sm:text-4xl md:text-5xl font-serif font-bold text-ivory tracking-tight animate-fade-in mb-2 sm:mb-4">
                        OUR <span className="text-gold">SERVICES</span>
                    </h2>
                    <p className="text-ivory-dim max-w-2xl mx-auto text-xs sm:text-sm md:text-base leading-relaxed">
                        Every service is a masterwork. Choose your experience.
                    </p>
                </div>

                {/* Theme-aligned Luxury Category Filter Bar - Horizontal Scroll on Mobile */}
                {categoryTabs.length > 1 && (
                    <div className="relative mt-4 sm:mt-6 mb-6 sm:mb-10 w-full max-w-4xl mx-auto px-1 sm:px-6">
                        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-2 sm:justify-center">
                            {categoryTabs.map((tab) => {
                                const isActive = selectedCategory === tab.label;
                                return (
                                    <button
                                        key={tab.label}
                                        type="button"
                                        onClick={() => setSelectedCategory(tab.label)}
                                        className={`flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap active:scale-95 cursor-pointer ${
                                            isActive
                                                ? 'bg-gold text-charcoal shadow-[0_0_20px_rgba(212,175,55,0.25)]'
                                                : 'border border-white/10 bg-charcoal-light/80 text-ivory-dim hover:border-white/20 hover:text-ivory'
                                        }`}
                                    >
                                        <span>{tab.label}</span>
                                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded leading-none ${
                                            isActive ? 'bg-charcoal/20 text-charcoal font-bold' : 'bg-white/5 text-ivory-dim'
                                        }`}>
                                            {tab.count}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Category Groups View */}
                <div className="space-y-8 sm:space-y-12 md:space-y-16">
                    {displayedGroups.map((categoryGroup, categoryIndex) => (
                        <div key={categoryGroup.category} className="animate-fade-in">
                            {/* Category Header shown when viewing 'ALL' or for distinct visual hierarchy */}
                            {selectedCategory === 'ALL' && (
                                <h3 className="text-lg sm:text-2xl md:text-3xl font-serif font-bold text-gold text-center mt-4 mb-3 sm:mt-8 sm:mb-6 tracking-wide uppercase">
                                    {categoryGroup.category}
                                </h3>
                            )}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-6 md:gap-8 max-w-5xl mx-auto">
                                {categoryGroup.services.map((service, index) => (
                                    <ServiceCard key={service.id} index={index} {...service} />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};