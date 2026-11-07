import React, { useState, useEffect } from 'react';
import { Scissors, Clock, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Link } from 'react-router';
import { api } from '@/config/api';

interface Service {
    service_id: string | number;
    title: string;
    description: string;
    price: string | number;
    duration?: string;
    category?: string;
    image_url?: string | null;
}

const ServiceMenuItemCard: React.FC<{ service: Service; index: number }> = ({ service, index }) => {
    const [imageFailed, setImageFailed] = useState(false);
    const hasImage = Boolean(service.image_url && !imageFailed);

    return (
        <div
            className="bg-charcoal-light border border-white/5 rounded-sm p-8 group hover:border-gold/30 transition-all duration-500 animate-fade-in relative overflow-hidden"
            style={{ animationDelay: `${index * 0.05}s` }}
        >
            {/* Background Glow Effect */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-gold/5 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

            {/* Service Photo / Luxury Placeholder */}
            <div className="relative w-[calc(100%+4rem)] h-44 -mx-8 -mt-8 mb-6 overflow-hidden border-b border-gold/20 bg-charcoal select-none">
                {hasImage ? (
                    <>
                        <img
                            src={service.image_url!}
                            alt={service.title}
                            width={800}
                            height={352}
                            loading="lazy"
                            decoding="async"
                            className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700 ease-out"
                            onError={() => setImageFailed(true)}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-charcoal-light via-charcoal-light/30 to-transparent pointer-events-none" />
                    </>
                ) : (
                    <div className="w-full h-full relative flex flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-[#1c1a17] via-charcoal to-charcoal-light">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(212,175,55,0.12),transparent_70%)]" />
                        <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#d4af37_1px,transparent_1px)] [background-size:16px_16px]" />
                        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-charcoal-light to-transparent" />

                        <div className="relative z-10 flex flex-col items-center gap-1.5 transition-transform duration-500 group-hover:scale-110">
                            <div className="w-12 h-12 rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center shadow-[0_0_20px_rgba(212,175,55,0.15)] group-hover:border-gold/60 group-hover:bg-gold/15 transition-all">
                                <Scissors className="w-5 h-5 text-gold" />
                            </div>
                            <span className="font-serif text-[10px] tracking-[0.25em] uppercase text-gold/80 font-bold">
                                DemoShop Signature
                            </span>
                        </div>

                        <div className="absolute top-2 left-2 w-2 h-2 border-t border-l border-gold/40" />
                        <div className="absolute top-2 right-2 w-2 h-2 border-t border-r border-gold/40" />
                        <div className="absolute bottom-2 left-2 w-2 h-2 border-b border-l border-gold/40" />
                        <div className="absolute bottom-2 right-2 w-2 h-2 border-b border-r border-gold/40" />
                    </div>
                )}
            </div>

            <div className="relative z-10">
                {/* Category Badge */}
                <span className="inline-block px-3 py-1 bg-white/5 text-gold text-[10px] font-bold uppercase tracking-widest rounded-full mb-4 border border-gold/20">
                    {service.category}
                </span>

                {/* Service Title */}
                <h3 className="text-2xl font-serif font-bold text-ivory mb-3 group-hover:text-gold transition-colors">
                    {service.title}
                </h3>

                {/* Description */}
                <p className="text-ivory-dim text-sm mb-6 leading-relaxed">
                    {service.description}
                </p>

                {/* Bottom Row */}
                <div className="flex justify-between items-center pt-6 border-t border-white/5">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 text-ivory-dim">
                            <Clock className="w-4 h-4 text-gold" />
                            <span className="text-xs">{service.duration}</span>
                        </div>
                    </div>
                    <div className="text-right">
                        <span className="text-2xl font-serif font-bold text-gold">
                            ₱{service.price}
                        </span>
                    </div>
                </div>

                {/* Book Button */}
                <Link to="/booking">
                    <Button
                        variant="outline"
                        className="w-full mt-6 text-xs py-3 flex justify-between items-center group/btn border-gold/30 text-gold hover:bg-gold hover:text-charcoal"
                    >
                        Book This Service
                        <ChevronRight className="w-4 h-4 transform group-hover/btn:translate-x-1 transition-transform" />
                    </Button>
                </Link>
            </div>
        </div>
    );
};

export const ServicesMenu = () => {
    const [services, setServices] = useState<Service[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState('ALL');


    useEffect(() => {
        fetchServices();
    }, []);

    const fetchServices = async () => {
        try {
            const response = await api.get('/api/services');

            if (response.status === 200) {
                const data = response.data;
                setServices(data);
            }
        } catch (error) {
            console.error("Failed to fetch services", error);
        } finally {
            setLoading(false);
        }
    };

    // Get unique categories
    const categories = ['ALL', ...new Set(services.map(s => s.category || 'OTHER'))];

    // Filter services by category
    const filteredServices = selectedCategory === 'ALL'
        ? services
        : services.filter(s => s.category === selectedCategory);

    if (loading) {
        return (
            <section className="py-24 bg-charcoal">
                <div className="max-w-7xl mx-auto px-4 text-center">
                    <p className="text-ivory-dim">Loading services...</p>
                </div>
            </section>
        );
    }

    return (
        <section className="py-24 bg-charcoal relative overflow-hidden">
            {/* Background Decoration */}
            <div className="absolute inset-0 bg-texture opacity-30 pointer-events-none"></div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">

                {/* Header */}
                <div className="text-center mb-16">
          <span className="text-gold font-serif italic text-xl mb-2 block animate-fade-in">
            Our Craft
          </span>
                    <h2 className="text-3xl md:text-5xl font-serif font-bold text-ivory tracking-tight animate-fade-in mb-4">
                        OUR <span className="text-gold">SERVICES</span>
                    </h2>
                    <p className="text-ivory-dim max-w-2xl mx-auto">
                        Every service is a masterwork. Choose your experience.
                    </p>
                </div>

                {/* Category Filter */}
                <div className="flex justify-center mb-12">
                    <div className="inline-flex bg-charcoal-light p-1 rounded-full border border-white/10 flex-wrap gap-2">
                        {categories.map((category) => (
                            <button
                                key={category}
                                onClick={() => setSelectedCategory(category)}
                                className={`px-6 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all duration-300 ${
                                    selectedCategory === category
                                        ? 'bg-gold text-charcoal shadow-lg'
                                        : 'text-ivory-dim hover:text-white'
                                }`}
                            >
                                {category}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Services Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredServices.map((service, index) => (
                        <ServiceMenuItemCard key={service.service_id} service={service} index={index} />
                    ))}
                </div>

                {/* No Services Message */}
                {filteredServices.length === 0 && (
                    <div className="text-center py-12">
                        <p className="text-ivory-dim">No services available in this category.</p>
                    </div>
                )}

                {/* CTA */}
                <div className="mt-16 text-center">
                    <Link to="/booking">
                        <Button variant="primary" className="px-8 py-4">
                            View Full Booking System
                        </Button>
                    </Link>
                </div>

            </div>
        </section>
    );
};