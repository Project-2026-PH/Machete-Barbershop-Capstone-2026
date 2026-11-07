import React, { useState } from 'react';
import { Link } from 'react-router';
import { Scissors } from 'lucide-react';
import { getOptimizedSupabaseImageUrl } from '@/utils/supabase-image.util';

interface ServiceCardProps {
    id: string | number;
    title: string;
    description: string;
    price: string | number;
    duration?: string;
    image_url?: string | null;
    index: number;
}

export const ServiceCard: React.FC<ServiceCardProps> = ({ id, title, description, price, duration, image_url, index }) => {
    const [imageFailed, setImageFailed] = useState(false);
    const hasImage = Boolean(image_url && !imageFailed);
    const imageSrc = image_url ? getOptimizedSupabaseImageUrl(image_url, 800, 75, 352) : '';

    return (
        <Link
            to="/booking"
            state={{
                serviceId: id,
                serviceName: title,
                servicePrice: price,
                serviceDuration: duration,
                serviceDescription: description,
                serviceImage: image_url
            }}
            className="block h-full"
        >
            <div
                className="group relative flex flex-row sm:flex-col h-full bg-charcoal-light border border-white/5 hover:border-gold/50 rounded-xl sm:rounded-sm transition-all duration-500 hover:-translate-y-1.5 sm:hover:-translate-y-3 hover:shadow-[0_20px_50px_-12px_rgba(212,175,55,0.15)] overflow-hidden cursor-pointer animate-fade-in z-10 p-3 sm:p-8"
                style={{ animationDelay: `${index * 0.1 + 0.3}s` }}
            >
                {/* Background Glow */}
                <div className="absolute inset-0 bg-gradient-to-br from-gold/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 ease-in-out pointer-events-none"></div>

                {/* Animated Border Lines (Desktop) */}
                <div className="hidden sm:block absolute top-0 left-0 w-full h-[1px] bg-gold transform -translate-x-full group-hover:translate-x-0 transition-transform duration-700 ease-out pointer-events-none"></div>
                <div className="hidden sm:block absolute bottom-0 right-0 w-full h-[1px] bg-gold transform translate-x-full group-hover:translate-x-0 transition-transform duration-700 ease-out delay-100 pointer-events-none"></div>
                <div className="hidden sm:block absolute top-0 right-0 w-[1px] h-full bg-gold transform -translate-y-full group-hover:translate-y-0 transition-transform duration-700 ease-out delay-200 pointer-events-none"></div>
                <div className="hidden sm:block absolute bottom-0 left-0 w-[1px] h-full bg-gold transform translate-y-full group-hover:translate-y-0 transition-transform duration-700 ease-out delay-300 pointer-events-none"></div>

                {/* Service Photo / Luxury Placeholder */}
                <div className="relative w-28 h-28 sm:w-[calc(100%+4rem)] sm:h-44 shrink-0 sm:-mx-8 sm:-mt-8 mb-0 sm:mb-6 overflow-hidden rounded-lg sm:rounded-none border-b sm:border-b border-gold/20 bg-charcoal select-none flex items-center justify-center">
                    {hasImage ? (
                        <>
                            <img
                                src={imageSrc}
                                alt={title}
                                width={800}
                                height={352}
                                loading="lazy"
                                decoding="async"
                                className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700 ease-out"
                                onError={(event) => {
                                    if (event.currentTarget.src !== image_url) {
                                        event.currentTarget.src = image_url!;
                                        return;
                                    }
                                    setImageFailed(true);
                                }}
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-charcoal-light via-charcoal-light/30 to-transparent pointer-events-none hidden sm:block" />
                        </>
                    ) : (
                        <div className="w-full h-full relative flex flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-[#1c1a17] via-charcoal to-charcoal-light p-2 text-center">
                            {/* Geometric luxury background pattern */}
                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(212,175,55,0.12),transparent_70%)]" />
                            <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#d4af37_1px,transparent_1px)] [background-size:10px_10px] sm:[background-size:16px_16px]" />
                            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-charcoal-light to-transparent hidden sm:block" />

                            {/* Watermark / Icon Emblem */}
                            <div className="relative z-10 flex flex-col items-center gap-1 sm:gap-1.5 transition-transform duration-500 group-hover:scale-110">
                                <div className="w-7 h-7 sm:w-12 sm:h-12 rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center shadow-[0_0_20px_rgba(212,175,55,0.15)] group-hover:border-gold/60 group-hover:bg-gold/15 transition-all">
                                    <Scissors className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-gold" />
                                </div>
                                <span className="font-serif text-[8px] sm:text-[10px] tracking-[0.2em] sm:tracking-[0.25em] uppercase text-gold/80 font-bold">
                                    DemoShop Signature
                                </span>
                            </div>

                            {/* Subtle Corner Accents */}
                            <div className="absolute top-1.5 left-1.5 sm:top-2 sm:left-2 w-1.5 h-1.5 sm:w-2 sm:h-2 border-t border-l border-gold/40" />
                            <div className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 w-1.5 h-1.5 sm:w-2 sm:h-2 border-t border-r border-gold/40" />
                            <div className="absolute bottom-1.5 left-1.5 sm:bottom-2 sm:left-2 w-1.5 h-1.5 sm:w-2 sm:h-2 border-b border-l border-gold/40" />
                            <div className="absolute bottom-1.5 right-1.5 sm:bottom-2 sm:right-2 w-1.5 h-1.5 sm:w-2 sm:h-2 border-b border-r border-gold/40" />
                        </div>
                    )}
                </div>

                {/* Content */}
                <div className="relative z-20 flex flex-1 flex-col justify-between pl-3 sm:pl-0 min-w-0">
                    <div>
                        <div className="flex justify-between items-start sm:items-baseline gap-1.5 mb-1 sm:mb-4 border-b border-white/5 pb-1 sm:pb-4 group-hover:border-gold/20 transition-colors duration-500">
                            <h3 className="text-xs sm:text-xl font-serif font-bold text-ivory group-hover:text-gold transition-colors duration-300 truncate sm:whitespace-normal group-hover:sm:translate-x-2">
                                {title}
                            </h3>
                            <div className="text-right group-hover:scale-105 sm:group-hover:scale-110 transition-transform duration-500 origin-right shrink-0">
                                <span className="block text-xs sm:text-2xl font-serif font-bold text-gold drop-shadow-md">₱{price}</span>
                                {duration && <span className="hidden sm:inline text-xs text-ivory-dim uppercase tracking-wider group-hover:text-ivory transition-colors">{duration}</span>}
                            </div>
                        </div>

                        {duration && (
                            <span className="block sm:hidden text-[10px] text-ivory-dim uppercase tracking-wider group-hover:text-ivory transition-colors mb-1">
                                {duration}
                            </span>
                        )}

                        <p className="text-ivory-dim text-[11px] sm:text-sm leading-relaxed mb-2 sm:mb-6 font-light group-hover:text-ivory/90 transition-colors duration-500 line-clamp-1 sm:line-clamp-2 transform group-hover:sm:translate-y-1">
                            {description}
                        </p>
                    </div>

                    <div className="flex items-center justify-between pt-1.5 sm:pt-0 mt-0 sm:mt-4 border-t border-zinc-800/60 sm:border-transparent opacity-80 sm:opacity-70 group-hover:opacity-100 transition-opacity duration-500">
                        <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider sm:tracking-widest text-gold hover:text-white transition-all duration-300 flex items-center gap-1 sm:gap-2 group-hover:sm:gap-4 group-hover:sm:tracking-[0.2em]">
                            Book Now <span className="text-xs sm:text-lg leading-none transform group-hover:translate-x-1 sm:group-hover:translate-x-2 transition-transform duration-300">&rarr;</span>
                        </span>

                        {/* Decorative Icon */}
                        <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full border border-gold/30 flex items-center justify-center group-hover:border-gold group-hover:bg-gold group-hover:text-charcoal transition-all duration-500 transform scale-100 sm:scale-0 group-hover:sm:scale-100">
                            <span className="text-[10px] sm:text-xs font-serif italic">+</span>
                        </div>
                    </div>
                </div>
            </div>
        </Link>
    );
};
