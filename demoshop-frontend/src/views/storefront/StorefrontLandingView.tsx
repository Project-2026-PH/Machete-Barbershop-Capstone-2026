import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Scissors, MapPin, Phone, Clock, ArrowRight, ArrowUpRight,
  Sparkles, Globe, Facebook, Play, Pause, Volume2, VolumeX,
  Droplets, Leaf, Package, Check, ChevronRight, Star, Mail,
  Calendar, Eye
} from 'lucide-react';
import { Link } from 'react-router';
import type { ShopSettings } from '@demoshop/shared-types';
import { ShopSettingsOverrideContext, useShopSettings } from '@/hooks/useShopSettings';
import { api } from '@/config/api';

export interface StorefrontLandingViewProps {
  isPreviewMode?: boolean;
  previewData?: ShopSettings | null;
  containerRef?: React.RefObject<HTMLDivElement | null>;
}

interface ServiceItem {
  service_id: number;
  title: string;
  description: string;
  price: number;
  duration_minutes: number;
  category: string;
  image_url?: string | null;
}

const CANONICAL_SERVICES: ServiceItem[] = [
  // 1. MEN'S GROOMING (4)
  {
    service_id: 1,
    title: 'HAIR CUT',
    description: 'Standard precision cut and style tailored to your face structure.',
    price: 250,
    duration_minutes: 30,
    category: "MEN'S GROOMING",
    image_url: null,
  },
  {
    service_id: 2,
    title: 'HAIR CUT W/SHAMPOO',
    description: 'Standard cut followed by a refreshing wash, invigorating scalp massage, and hot towel finish.',
    price: 300,
    duration_minutes: 45,
    category: "MEN'S GROOMING",
    image_url: null,
  },
  {
    service_id: 3,
    title: 'BEARD TRIM & SHAPE',
    description: 'Precision beard sculpting with straight razor edge detailing and conditioning oil.',
    price: 200,
    duration_minutes: 20,
    category: "MEN'S GROOMING",
    image_url: null,
  },
  {
    service_id: 4,
    title: 'CLASSIC SHAVE & TOWEL',
    description: 'Traditional hot lather shave with steam-infused towel ritual and cool balm detailing.',
    price: 250,
    duration_minutes: 30,
    category: "MEN'S GROOMING",
    image_url: null,
  },

  // 2. TREATMENT SERVICES (9)
  {
    service_id: 5,
    title: 'HAIR ART',
    description: 'Creative custom hair designs, freehand geometry, and razor art.',
    price: 0,
    duration_minutes: 30,
    category: 'TREATMENT SERVICES',
    image_url: null,
  },
  {
    service_id: 6,
    title: 'HEAD SHAVE',
    description: 'Ultra-smooth scalp shave with hot lather treatment and moisturizing aftercare.',
    price: 300,
    duration_minutes: 30,
    category: 'TREATMENT SERVICES',
    image_url: null,
  },
  {
    service_id: 7,
    title: 'HAIR CUT + HOT OIL',
    description: 'Precision cut paired with restorative deep hot oil scalp therapy.',
    price: 750,
    duration_minutes: 60,
    category: 'TREATMENT SERVICES',
    image_url: null,
  },
  {
    service_id: 8,
    title: 'HAIR CUT + NATURAL COLOR',
    description: 'Signature cut with natural tone coverage and grey blending.',
    price: 850,
    duration_minutes: 90,
    category: 'TREATMENT SERVICES',
    image_url: null,
  },
  {
    service_id: 9,
    title: 'HAIR CUT + FASHION COLOR',
    description: 'Expressive vibrant coloring tailored with precision texturizing cut.',
    price: 1500,
    duration_minutes: 120,
    category: 'TREATMENT SERVICES',
    image_url: null,
  },
  {
    service_id: 10,
    title: 'HAIR CUT + HIGHLIGHTS',
    description: 'Dimensional foil highlights paired with a tailored master haircut.',
    price: 1500,
    duration_minutes: 120,
    category: 'TREATMENT SERVICES',
    image_url: null,
  },
  {
    service_id: 11,
    title: 'HAIR CUT + PASTEL COLOR',
    description: 'High-lift blonde toning and modern pastel hues with full styling.',
    price: 2000,
    duration_minutes: 150,
    category: 'TREATMENT SERVICES',
    image_url: null,
  },
  {
    service_id: 12,
    title: 'HAIR PERM',
    description: 'Classic texturizing wave or modern Korean-style volume perm.',
    price: 1800,
    duration_minutes: 120,
    category: 'TREATMENT SERVICES',
    image_url: null,
  },
  {
    service_id: 13,
    title: 'HAIR SPA & SCALP DETOX',
    description: 'Rejuvenating scalp exfoliating treatment with essential botanical serums.',
    price: 650,
    duration_minutes: 45,
    category: 'TREATMENT SERVICES',
    image_url: null,
  },

  // 3. SPECIAL PROMOS (6)
  {
    service_id: 14,
    title: 'THE STANDARD',
    description: 'Haircut, Shampoo, Hot Towel, Face Cleanse Mask.',
    price: 350,
    duration_minutes: 45,
    category: 'SPECIAL PROMOS',
    image_url: null,
  },
  {
    service_id: 15,
    title: 'THE SUPERIOR',
    description: 'The Standard package + Beard Grooming and straight razor detailing.',
    price: 450,
    duration_minutes: 60,
    category: 'SPECIAL PROMOS',
    image_url: null,
  },
  {
    service_id: 16,
    title: 'THE ULTIMATE',
    description: 'The Superior package + Deep Cleansing Charcoal Facial treatment.',
    price: 650,
    duration_minutes: 75,
    category: 'SPECIAL PROMOS',
    image_url: null,
  },
  {
    service_id: 17,
    title: 'THE HAIR AND SCALP',
    description: 'The Superior package + Relaxing Scalp Massage + Hair Moisturizer.',
    price: 850,
    duration_minutes: 90,
    category: 'SPECIAL PROMOS',
    image_url: null,
  },
  {
    service_id: 18,
    title: 'THE GRAND SLAM OVERALL',
    description: 'The Superior + The Hair and Scalp + Deep Cleansing Facial all-in-one ritual.',
    price: 1000,
    duration_minutes: 120,
    category: 'SPECIAL PROMOS',
    image_url: null,
  },
  {
    service_id: 19,
    title: "GENTLEMAN'S DELUXE",
    description: 'Full executive service: Master haircut, luxury shave, charcoal facial, and premium styling.',
    price: 1200,
    duration_minutes: 120,
    category: 'SPECIAL PROMOS',
    image_url: null,
  },
];

const SHOP_PRODUCTS = [
  {
    id: 1,
    name: 'Matte Pomade',
    category: 'HAIR',
    retailPrice: 150,
    imageUrl: '/pomade.jpg',
    description: 'High hold, low shine styling pomade for clean precision pompadours and textured finishes.',
  },
  {
    id: 2,
    name: 'Texture Powder',
    category: 'HAIR',
    retailPrice: 150,
    imageUrl: '/powder.jpg',
    description: 'Weightless volumizing powder with a natural matte finish, engineered for modern messy crops.',
  },
  {
    id: 3,
    name: 'Beard Oil',
    category: 'BEARD',
    retailPrice: 150,
    imageUrl: '/beard-oil.jpg',
    description: 'Nourishing organic beard oil formulated with argan and cedarwood to soften facial hair and protect the skin beneath.',
  },
  {
    id: 4,
    name: 'Hair Gel',
    category: 'STYLING',
    retailPrice: 150,
    imageUrl: '/hair-gel.jpg',
    description: 'High hold, clean sheen styling gel engineered for slicked backs, side parts, and razor-sharp separation without flaking.',
  },
];

const GALLERY_ITEMS = [
  { id: '1', src: '/main_floor.jpg', alt: 'The Main Floor', category: 'Interior' },
  { id: '2', src: '/details.jpg', alt: 'Tools of Trade', category: 'Details' },
  { id: '3', src: '/classic_shave.jpg', alt: 'Classic Shave', category: 'Service' },
  { id: '4', src: '/demoshop_interior2.jpg', alt: 'Waiting Area', category: 'Interior' },
  { id: '5', src: '/demoshop_team.jpg', alt: 'Master Barber', category: 'Team' },
  { id: '6', src: '/master_at_work.jpg', alt: 'Precision', category: 'Service' },
];

export const StorefrontLandingView: React.FC<StorefrontLandingViewProps> = ({
  isPreviewMode = false,
  previewData = null,
  containerRef,
}) => {
  const { settings: hookSettings } = useShopSettings();
  const settings = previewData || hookSettings;

  const displayedShopProducts = useMemo(() => {
    const list = (settings?.shopProducts && settings.shopProducts.length > 0)
      ? settings.shopProducts
      : SHOP_PRODUCTS;
    return list.filter((p: any) => p.showInShop !== false);
  }, [settings?.shopProducts]);

  // 1. Navigation Anchor Scrolling
  const scrollToAnchor = (targetId: string) => {
    if (targetId === 'home') {
      if (containerRef?.current) {
        containerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }

    const container = containerRef?.current;
    if (container) {
      const element = container.querySelector(`#${targetId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } else {
      const element = document.getElementById(targetId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  // 2. Services State & Loading
  const [services, setServices] = useState<ServiceItem[]>(CANONICAL_SERVICES);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  useEffect(() => {
    let isMounted = true;
    const fetchServices = async () => {
      try {
        const res = await api.get('/api/services');
        if (!isMounted) return;
        const data = Array.isArray(res.data) ? res.data : [];
        if (data.length > 0) {
          setServices(
            data.map((item) => ({
              service_id: Number(item.service_id),
              title: item.title || '',
              description: item.description || '',
              price: Number(item.price) || 0,
              duration_minutes: Number(item.duration_minutes) || 30,
              category: (item.category || "MEN'S GROOMING").trim().toUpperCase(),
              image_url: item.image_url || null,
            }))
          );
        }
      } catch {
        // Keep canonical services fallback
      }
    };

    void fetchServices();

    const handleUpdate = () => void fetchServices();
    window.addEventListener('demoshop:services-updated', handleUpdate);
    return () => {
      isMounted = false;
      window.removeEventListener('demoshop:services-updated', handleUpdate);
    };
  }, []);

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      ALL: services.length,
      "MEN'S GROOMING": 0,
      'TREATMENT SERVICES': 0,
      'SPECIAL PROMOS': 0,
    };
    services.forEach((s) => {
      const cat = s.category.toUpperCase();
      if (counts[cat] !== undefined) {
        counts[cat] += 1;
      } else {
        counts[cat] = 1;
      }
    });
    return counts;
  }, [services]);

  const categoryTabs = useMemo(() => {
    return [
      { key: 'ALL', label: 'ALL', count: categoryCounts['ALL'] || 19 },
      { key: "MEN'S GROOMING", label: "MEN'S GROOMING", count: categoryCounts["MEN'S GROOMING"] || 4 },
      { key: 'TREATMENT SERVICES', label: 'TREATMENT SERVICES', count: categoryCounts['TREATMENT SERVICES'] || 9 },
      { key: 'SPECIAL PROMOS', label: 'SPECIAL PROMOS', count: categoryCounts['SPECIAL PROMOS'] || 6 },
    ];
  }, [categoryCounts]);

  const displayedServices = useMemo(() => {
    if (selectedCategory === 'ALL') return services;
    return services.filter((s) => s.category.toUpperCase() === selectedCategory);
  }, [services, selectedCategory]);

  // 3. Shop Product Carousel State
  const [activeProductIndex, setActiveProductIndex] = useState(0);

  // 4. Ambient Music Player State
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);

  // 5. Hero Dynamic Copy
  const heroHeadline = settings?.website?.heroHeadline || 'PRECISION & TRADITION';
  const heroSubtext =
    settings?.website?.heroSubtext ||
    'Experience the art of classic filipino grooming in a modern industrial setting.';
  const heroCtaPrimary = settings?.website?.heroCtaPrimary || 'Book Appointment';
  const heroCtaSecondary = settings?.website?.heroCtaSecondary || 'View Services';

  // Format business hours
  const businessHoursDisplay = useMemo(() => {
    if (!settings?.businessHours) {
      return [
        { day: 'Monday - Saturday', time: '10:00 AM - 9:00 PM', isOpen: true },
        { day: 'Sunday', time: '10:00 AM - 9:00 PM', isOpen: true },
      ];
    }
    if (Array.isArray(settings.businessHours)) {
      return settings.businessHours.map((h: any) => ({
        day: h.day,
        time: h.isOpen ? `${h.openTime} - ${h.closeTime}` : 'Closed',
        isOpen: h.isOpen,
      }));
    }
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const map = settings.businessHours as Record<string, any>;
    return days.map((day) => ({
      day,
      time: map[day]?.isOpen
        ? `${map[day]?.openTime || '10:00'} - ${map[day]?.closeTime || '21:00'}`
        : 'Closed',
      isOpen: map[day]?.isOpen ?? true,
    }));
  }, [settings?.businessHours]);

  return (
    <ShopSettingsOverrideContext.Provider value={settings || null}>
      <div className="w-full bg-[#0c0c0e] text-[#f5f5f7] font-sans antialiased selection:bg-amber-400 selection:text-zinc-950 relative">
        {/* ============================================================== */}
        {/* 1. STOREFRONT NAVIGATION BAR (`Header`)                         */}
        {/* ============================================================== */}
        <header className="sticky top-0 z-50 w-full border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-md">
          <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6 lg:px-8">
            
            {/* 1. Left: Brand Logo & Crest (Strictly isolated with shrink-0) */}
            <div
              onClick={() => scrollToAnchor('home')}
              className="flex shrink-0 items-center gap-3 cursor-pointer group"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-amber-400/30 bg-amber-400/10 text-amber-400 shadow-sm shadow-amber-400/5 group-hover:border-amber-400 group-hover:scale-105 transition-all">
                <Scissors className="h-4 w-4 rotate-45" />
              </div>
              <div className="flex flex-col">
                <span className="font-serif text-lg font-bold tracking-[0.2em] text-zinc-100 group-hover:text-amber-400 transition-colors uppercase">
                  DEMOSHOP<span className="text-amber-400">'S</span>
                </span>
                <span className="text-[9px] font-semibold tracking-[0.3em] text-zinc-400 uppercase">
                  BARBERSHOP
                </span>
              </div>
            </div>

            {/* 2. Center: Navigation Links (Centered and decoupled from logo) */}
            <nav className="hidden md:flex items-center justify-center gap-6 lg:gap-8 flex-1 px-8">
              <a
                href="#home"
                onClick={(e) => {
                  e.preventDefault();
                  scrollToAnchor('home');
                }}
                className="text-xs font-semibold tracking-widest text-zinc-300 uppercase transition hover:text-amber-400 cursor-pointer"
              >
                HOME
              </a>
              <a
                href="#services"
                onClick={(e) => {
                  e.preventDefault();
                  scrollToAnchor('services');
                }}
                className="text-xs font-semibold tracking-widest text-zinc-300 uppercase transition hover:text-amber-400 cursor-pointer"
              >
                SERVICES
              </a>
              <a
                href="#shop"
                onClick={(e) => {
                  e.preventDefault();
                  scrollToAnchor('shop');
                }}
                className="text-xs font-semibold tracking-widest text-zinc-300 uppercase transition hover:text-amber-400 cursor-pointer"
              >
                COLLECTIONS
              </a>
              <a
                href="#gallery"
                onClick={(e) => {
                  e.preventDefault();
                  scrollToAnchor('gallery');
                }}
                className="text-xs font-semibold tracking-widest text-zinc-300 uppercase transition hover:text-amber-400 cursor-pointer"
              >
                GALLERY
              </a>
              <a
                href="#branches"
                onClick={(e) => {
                  e.preventDefault();
                  scrollToAnchor('locations');
                }}
                className="text-xs font-semibold tracking-widest text-zinc-300 uppercase transition hover:text-amber-400 cursor-pointer"
              >
                BRANCHES
              </a>
              <a
                href="#about"
                onClick={(e) => {
                  e.preventDefault();
                  scrollToAnchor('about');
                }}
                className="text-xs font-semibold tracking-widest text-zinc-300 uppercase transition hover:text-amber-400 cursor-pointer"
              >
                ABOUT
              </a>
            </nav>

            {/* 3. Right: Action Buttons (whitespace-nowrap prevents line wrapping) */}
            <div className="flex shrink-0 items-center justify-end">
              <a
                href="/login"
                onClick={(e) => {
                  if (isPreviewMode) {
                    e.preventDefault();
                  }
                }}
                className="inline-flex items-center justify-center whitespace-nowrap rounded-full border border-amber-400/80 bg-transparent px-6 py-2 text-xs font-bold tracking-widest text-amber-400 uppercase shadow-sm transition hover:bg-amber-400 hover:text-zinc-950 focus:outline-none focus:ring-2 focus:ring-amber-400/50 cursor-pointer"
              >
                SIGN IN
              </a>
            </div>

          </div>
        </header>

        {/* ============================================================== */}
        {/* 2. HERO SECTION                                                */}
        {/* ============================================================== */}
        <section
          id="home"
          className="relative min-h-[640px] lg:min-h-[720px] flex items-center justify-center text-center px-6 py-24 overflow-hidden border-b border-white/5"
        >
          {/* Ambient Lighting & Backdrop */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(ellipse at 50% 30%, rgba(212, 175, 55, 0.16) 0%, rgba(18, 18, 20, 0.95) 65%, #0c0c0e 100%)',
            }}
          />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-30 pointer-events-none" />

          {settings?.website?.heroImageUrl && (
            <img
              src={settings.website.heroImageUrl}
              alt="Hero Backdrop"
              width={1920}
              height={1080}
              decoding="async"
              className="absolute inset-0 w-full h-full object-cover opacity-15 pointer-events-none"
            />
          )}

          <div className="relative z-10 max-w-3xl mx-auto flex flex-col items-center space-y-6">
            {/* Badge / Crest */}
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-zinc-900/80 px-4 py-1.5 shadow-[0_0_20px_rgba(212,175,55,0.15)]">
              <Scissors className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-serif text-xs font-bold uppercase tracking-[0.25em] text-amber-400">
                EST. 2024 • SAMPLEBRANCH, SAN JOSE DEL MONTE
              </span>
            </div>

            {/* Display Typography */}
            <h1 className="font-serif text-4xl sm:text-6xl lg:text-7xl font-black uppercase tracking-tight text-zinc-100 leading-none drop-shadow-md">
              {heroHeadline}
            </h1>

            {/* Subheading */}
            <p className="text-sm sm:text-base lg:text-lg text-zinc-400 max-w-xl mx-auto font-light leading-relaxed">
              {heroSubtext}
            </p>

            {/* Dual CTAs */}
            <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
              <button
                type="button"
                onClick={() => scrollToAnchor('services')}
                className="rounded-md bg-amber-400 px-7 py-3 text-xs font-bold uppercase tracking-widest text-zinc-950 shadow-lg shadow-amber-400/20 hover:bg-amber-300 hover:scale-105 active:scale-95 transition-all cursor-pointer"
              >
                {heroCtaPrimary}
              </button>
              <button
                type="button"
                onClick={() => scrollToAnchor('services')}
                className="rounded-md border border-amber-400/60 bg-transparent px-7 py-3 text-xs font-bold uppercase tracking-widest text-amber-400 hover:bg-amber-400/10 hover:border-amber-400 transition-all cursor-pointer"
              >
                {heroCtaSecondary}
              </button>
            </div>
          </div>
        </section>

        {/* ============================================================== */}
        {/* 3. "OUR CRAFT" / SERVICES & PRICING (`ServicesSection`)        */}
        {/* ============================================================== */}
        <section id="services" className="relative w-full py-10 sm:py-16 md:py-24 bg-zinc-950">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-10 space-y-6 sm:space-y-10">
            <div className="text-center space-y-2 sm:space-y-3 mb-4 sm:mb-8">
              <span className="font-serif italic text-base sm:text-xl text-amber-400 block">
                Our Craft
              </span>
              <h2 className="font-serif text-2xl sm:text-4xl md:text-5xl font-bold uppercase tracking-tight text-zinc-100">
                OUR <span className="text-amber-400">SERVICES</span>
              </h2>
              <p className="text-xs sm:text-sm text-zinc-400 max-w-lg mx-auto leading-relaxed">
                Every service is a masterwork. Choose your experience.
              </p>
            </div>

            {/* Interactive Category Filter Tabs - Horizontal Scroll on Mobile */}
            <div className="relative mt-4 sm:mt-6 mb-6 sm:mb-8 w-full max-w-4xl mx-auto px-1 sm:px-6">
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-2 sm:justify-center">
                {categoryTabs.map((tab) => {
                  const isActive = selectedCategory === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setSelectedCategory(tab.key)}
                      className={`flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap active:scale-95 cursor-pointer ${
                        isActive
                          ? 'bg-amber-400 text-zinc-950 shadow-md shadow-amber-400/20 font-bold'
                          : 'border border-zinc-800 bg-zinc-900/80 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                      }`}
                    >
                      <span>{tab.label}</span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-mono leading-none ${
                          isActive ? 'bg-zinc-950/20 text-zinc-950 font-bold' : 'bg-zinc-800 text-zinc-400'
                        }`}
                      >
                        {tab.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Service Cards Grid (All Services) */}
            <div className="grid grid-cols-1 gap-3 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
              {displayedServices.map((service) => (
                <div
                  key={service.service_id}
                  className="group relative flex flex-row sm:flex-col overflow-hidden rounded-xl border border-white/5 bg-[#141417] p-3 sm:p-6 hover:border-amber-400/40 hover:-translate-y-1.5 hover:shadow-[0_20px_40px_-10px_rgba(212,175,55,0.12)] transition-all duration-300"
                >
                  {/* Photo or Geometric DemoShop Signature Fallback Pattern */}
                  <div className="relative w-28 h-28 sm:w-full sm:h-44 md:aspect-video shrink-0 overflow-hidden rounded-lg border border-amber-400/20 bg-zinc-950 mb-0 sm:mb-5 select-none flex items-center justify-center">
                    {service.image_url ? (
                      <img
                        src={service.image_url}
                        alt={service.title}
                        width={800}
                        height={450}
                        decoding="async"
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full relative flex flex-col items-center justify-center bg-gradient-to-b from-[#1a1a1e] via-[#121215] to-[#0c0c0e] p-2 text-center">
                        {/* Radial Accent Glow */}
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(212,175,55,0.14),transparent_65%)]" />
                        {/* Geometric Dot Grid */}
                        <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#d4af37_1px,transparent_1px)] [background-size:10px_10px] sm:[background-size:16px_16px]" />

                        {/* Gold Scissors Watermark Badge */}
                        <div className="relative z-10 flex flex-col items-center gap-1 sm:gap-1.5 transition-transform duration-300 group-hover:scale-110">
                          <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-full border border-amber-400/40 bg-amber-400/10 flex items-center justify-center text-amber-400 shadow-[0_0_15px_rgba(212,175,55,0.15)]">
                            <Scissors className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" />
                          </div>
                          <span className="font-serif text-[8px] sm:text-[9px] tracking-[0.2em] sm:tracking-[0.25em] uppercase text-amber-400/80 font-bold">
                            DEMOSHOP SIGNATURE
                          </span>
                        </div>

                        {/* Subtle Corner Accents */}
                        <div className="absolute top-1.5 left-1.5 sm:top-2 sm:left-2 w-1.5 h-1.5 sm:w-2 sm:h-2 border-t border-l border-amber-400/40" />
                        <div className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 w-1.5 h-1.5 sm:w-2 sm:h-2 border-t border-r border-amber-400/40" />
                        <div className="absolute bottom-1.5 left-1.5 sm:bottom-2 sm:left-2 w-1.5 h-1.5 sm:w-2 sm:h-2 border-b border-l border-amber-400/40" />
                        <div className="absolute bottom-1.5 right-1.5 sm:bottom-2 sm:right-2 w-1.5 h-1.5 sm:w-2 sm:h-2 border-b border-r border-amber-400/40" />
                      </div>
                    )}

                    {/* Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#141417] via-transparent to-transparent opacity-60 pointer-events-none hidden sm:block" />
                  </div>

                  {/* Card Body */}
                  <div className="space-y-2 sm:space-y-3 flex-1 flex flex-col justify-between pl-3 sm:pl-0 min-w-0">
                    <div>
                      <div className="flex items-start justify-between gap-1.5 border-b border-white/5 pb-1 sm:pb-2.5">
                        <h3 className="font-serif font-bold text-xs sm:text-base text-zinc-100 group-hover:text-amber-400 transition-colors uppercase truncate sm:whitespace-normal">
                          {service.title}
                        </h3>
                        <span className="font-serif font-bold text-amber-400 text-xs sm:text-base whitespace-nowrap shrink-0">
                          ₱{Number(service.price).toFixed(2)}
                        </span>
                      </div>

                      {/* Duration & Category */}
                      <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-zinc-400 font-mono mt-1 sm:mt-2">
                        <span className="flex items-center gap-1 text-zinc-300">
                          <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-400" />
                          {service.duration_minutes} MIN
                        </span>
                        <span className="font-bold uppercase tracking-wider text-amber-400/90 text-[9px] sm:text-[10px]">
                          {service.category}
                        </span>
                      </div>

                      <p className="text-[11px] sm:text-xs text-zinc-400 mt-1 sm:mt-2.5 line-clamp-1 sm:line-clamp-2 leading-relaxed font-light">
                        {service.description}
                      </p>
                    </div>

                    <div className="pt-1.5 sm:pt-2 border-t border-zinc-800/60 sm:border-transparent flex items-center justify-between text-[10px] sm:text-xs font-bold uppercase tracking-wider sm:tracking-widest text-amber-400 group-hover:text-amber-300">
                      <a
                        href={`/booking?serviceId=${service.service_id}`}
                        className="flex items-center gap-1 hover:text-amber-300 transition-colors"
                      >
                        BOOK NOW <ArrowRight className="w-3 h-3 sm:w-3.5 sm:h-3.5 transition-transform group-hover:translate-x-1" />
                      </a>
                      <span className="text-zinc-600 font-serif">+</span>
                    </div>
                  </div>
                </div>
              ))}

              {displayedServices.length === 0 && (
                <div className="col-span-full py-12 text-center text-sm text-zinc-400">
                  No services available in this category.
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ============================================================== */}
        {/* 4. "THE DEMOSHOP COLLECTION" (`ShopSection`)                     */}
        {/* ============================================================== */}
        <section id="shop" className="relative py-24 bg-[#111312] border-t border-b border-white/5 overflow-hidden">
          <div className="max-w-6xl mx-auto px-6 sm:px-10">
            {/* Category Tagline & Header */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-14 border-b border-white/5 pb-6">
              <div>
                <span className="font-serif italic text-lg sm:text-xl text-amber-400 block">
                  The DemoShop Collection
                </span>
                <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-zinc-400 mt-1">
                  {displayedShopProducts[0]?.category || 'HAIR'} · 01 / {String(displayedShopProducts.length).padStart(2, '0')}
                </p>
                <h2 className="font-serif text-3xl sm:text-5xl font-bold uppercase tracking-tight text-zinc-100 mt-2">
                  CURATED <span className="text-amber-400">GROOMING</span>
                </h2>
              </div>

              <div className="flex items-center gap-4 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                <span className="inline-flex items-center gap-1.5 text-amber-400">
                  <ArrowRight className="w-3.5 h-3.5" /> DRAG TO EXPLORE
                </span>
                <Link
                  to="/shop"
                  className="rounded-md border border-amber-400/40 px-4 py-1.5 text-amber-400 hover:bg-amber-400 hover:text-zinc-950 transition-colors"
                >
                  SHOP FULL COLLECTION
                </Link>
              </div>
            </div>

            {/* Product Showcase Carousel Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
              {displayedShopProducts.map((product) => (
                <div
                  key={product.id}
                  className="relative rounded-2xl border border-white/5 bg-[#141417] p-8 flex flex-col justify-between overflow-hidden shadow-2xl group hover:border-amber-400/40 transition-all duration-300"
                >
                  {/* Floating Depth Visualizer Icons */}
                  <div className="absolute top-6 right-6 flex items-center gap-3 text-amber-400/30">
                    <Droplets className="w-4 h-4" />
                    <Scissors className="w-4 h-4" />
                    <Sparkles className="w-4 h-4" />
                  </div>

                  {/* Product Visual Container */}
                  <div className="relative h-56 flex items-center justify-center my-4">
                    <div className="w-40 h-40 rounded-full bg-amber-400/10 blur-2xl absolute" />
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="max-h-48 max-w-full object-contain relative z-10 drop-shadow-[0_12px_24px_rgba(0,0,0,0.6)] group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-32 h-32 rounded-2xl border border-amber-400/20 bg-zinc-900/80 flex flex-col items-center justify-center p-4 text-center group-hover:scale-105 transition-transform duration-300">
                        <Package className="w-10 h-10 text-amber-400 mb-2" />
                        <span className="font-serif text-xs font-bold text-zinc-200 uppercase">
                          {product.name}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Product Info */}
                  <div className="space-y-3 pt-4 border-t border-white/5">
                    <div className="flex items-baseline justify-between">
                      <h3 className="font-serif text-2xl font-bold text-zinc-100 uppercase group-hover:text-amber-400 transition-colors">
                        {product.name}
                      </h3>
                      <span className="font-serif text-2xl font-bold text-amber-400">
                        ₱{Number(product.retailPrice || 0).toLocaleString('en-PH')}
                      </span>
                    </div>

                    <p className="text-xs text-zinc-400 font-light leading-relaxed">
                      {product.description}
                    </p>

                    <div className="pt-2">
                      <Link
                        to="/shop"
                        className="inline-flex items-center gap-2 rounded-md border border-amber-400/60 px-5 py-2 text-xs font-bold uppercase tracking-widest text-amber-400 hover:bg-amber-400 hover:text-zinc-950 transition-all cursor-pointer"
                      >
                        EXPLORE PRODUCT <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ============================================================== */}
        {/* 5. "THE GALLERY" VISUAL EXPERIENCE (`GallerySection`)           */}
        {/* ============================================================== */}
        <section id="gallery" className="px-6 sm:px-10 py-24 max-w-7xl mx-auto w-full space-y-12">
          <div className="text-center space-y-3">
            <span className="font-serif italic text-lg sm:text-xl text-amber-400 block">
              Visual Experience
            </span>
            <h2 className="font-serif text-3xl sm:text-5xl font-bold uppercase tracking-tight text-zinc-100">
              THE <span className="text-amber-400">GALLERY</span>
            </h2>
            <p className="text-xs sm:text-sm text-zinc-400 max-w-lg mx-auto leading-relaxed">
              Precision blades, heritage rituals, and the industrial ambiance of SampleBranch.
            </p>
          </div>

          {/* Masonry / Visual Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {GALLERY_ITEMS.map((item) => (
              <div
                key={item.id}
                className="group relative aspect-[4/3] rounded-xl overflow-hidden border border-white/5 bg-[#141417] shadow-lg cursor-pointer"
              >
                <img
                  src={item.src}
                  alt={item.alt}
                  width={800}
                  height={600}
                  decoding="async"
                  className="w-full h-full object-cover grayscale group-hover:grayscale-0 group-hover:scale-105 transition-all duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/90 via-zinc-950/20 to-transparent opacity-80 group-hover:opacity-60 transition-opacity" />

                <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400 font-bold block">
                      {item.category}
                    </span>
                    <h3 className="font-serif text-base font-bold text-zinc-100 group-hover:text-amber-300 transition-colors">
                      {item.alt}
                    </h3>
                  </div>
                  <div className="w-8 h-8 rounded-full border border-amber-400/40 bg-zinc-950/60 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform">
                    <Eye className="w-4 h-4" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ============================================================== */}
        {/* 6. "OUR SAMPLEBRANCH BARBERSHOP" (`BranchSection`)                  */}
        {/* ============================================================== */}
        <section id="locations" className="px-4 sm:px-10 py-8 sm:py-16 md:py-24 bg-[#101014] border-t border-b border-white/5">
          <div className="max-w-6xl mx-auto space-y-6 sm:space-y-12">
            <div className="text-center space-y-2 sm:space-y-3">
              <span className="font-serif italic text-base sm:text-xl text-amber-400 block">
                Visit Us
              </span>
              <h2 className="font-serif text-2xl sm:text-4xl md:text-5xl font-bold uppercase tracking-tight text-zinc-100">
                OUR <span className="text-amber-400">SAMPLEBRANCH BARBERSHOP</span>
              </h2>
            </div>

            <div className="rounded-2xl border border-white/5 bg-[#141417] overflow-hidden shadow-2xl grid grid-cols-1 lg:grid-cols-2">
              {/* Branch Image */}
              <div className="relative aspect-[16/10] sm:aspect-video lg:aspect-auto overflow-hidden">
                <img
                  src="/demoshop_interior.jpg"
                  alt="SampleBranch Branch Interior"
                  width={800}
                  height={500}
                  decoding="async"
                  className="w-full h-full object-cover grayscale hover:grayscale-0 hover:scale-105 transition-all duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#141417] via-transparent to-transparent lg:hidden" />
              </div>

              {/* Branch Details */}
              <div className="p-5 sm:p-8 lg:p-12 flex flex-col justify-between space-y-5 sm:space-y-8">
                <div>
                  <span className="text-xs font-mono uppercase tracking-[0.25em] text-amber-400 font-bold">
                    SampleBranch Branch
                  </span>
                  <h3 className="font-serif text-xl sm:text-2xl md:text-3xl font-bold text-zinc-100 mt-1 sm:mt-2">
                    DemoShop's Barbershop - SampleBranch
                  </h3>
                </div>

                <div className="space-y-3.5 sm:space-y-5 text-xs sm:text-sm font-light text-zinc-300">
                  <div className="flex items-start gap-3.5">
                    <MapPin className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">
                      {settings?.physicalAddress ||
                        'Ground floor, SampleBranch, Brgy. Kaypian, San Jose del Monte, Bulacan'}
                    </span>
                  </div>

                  <div className="flex items-center gap-3.5">
                    <Phone className="w-5 h-5 text-amber-400 shrink-0" />
                    <span className="font-mono text-zinc-200">
                      {settings?.footer?.phone || '(02) 8555-0123'}
                    </span>
                  </div>

                  <div className="flex items-center gap-3.5">
                    <Clock className="w-5 h-5 text-amber-400 shrink-0" />
                    <span>Mon-Sat: 10:00 AM - 9:00 PM</span>
                  </div>
                </div>

                {/* Branch CTAs */}
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 pt-3 sm:pt-4 border-t border-white/5">
                  <button
                    type="button"
                    onClick={() => scrollToAnchor('services')}
                    className="flex-1 rounded-md bg-amber-400 py-3 text-xs font-bold uppercase tracking-widest text-zinc-950 shadow-md shadow-amber-400/10 hover:bg-amber-300 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Calendar className="w-4 h-4" />
                    BOOK A SESSION
                  </button>
                  <a
                    href="https://maps.google.com/?q=SampleBranch+San+Jose+del+Monte+Bulacan"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 rounded-md border border-white/10 py-3 text-xs font-bold uppercase tracking-widest text-zinc-300 hover:border-amber-400/40 hover:bg-white/5 transition-colors flex items-center justify-center gap-2"
                  >
                    GET DIRECTIONS
                    <ArrowRight className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============================================================== */}
        {/* 7. "OUR STORY" / HERITAGE & METRICS (`AboutSection`)            */}
        {/* ============================================================== */}
        <section id="about" className="px-4 sm:px-10 py-8 sm:py-16 md:py-24 max-w-7xl mx-auto w-full">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 sm:gap-12 lg:gap-16 items-center">
            {/* Story Text */}
            <div className="space-y-4 sm:space-y-6">
              <span className="font-serif italic text-base sm:text-xl text-amber-400 block">
                {settings?.about?.subheading || 'Our Story'}
              </span>
              <h2 className="font-serif text-2xl sm:text-4xl md:text-5xl font-bold uppercase tracking-tight text-zinc-100 leading-tight">
                {settings?.about?.heading || 'MORE THAN JUST A CUT'}
              </h2>

              <div className="space-y-3 sm:space-y-4 text-zinc-400 text-xs sm:text-base font-light leading-relaxed">
                <p>
                  {settings?.about?.storyParagraph1 ||
                    "Founded in 2024, DemoShop's Barbers was born from a desire to restore the dignity of the classic barbershop experience. We believe that grooming is not a chore, but a ritual—a moment of pause in a chaotic world."}
                </p>
                <p>
                  {settings?.about?.storyParagraph2 ||
                    'Our philosophy is simple: Precision & Tradition. We combine old-school techniques—hot towels, straight razors, and scissor-over-comb—with a modern eye for detail and style.'}
                </p>
                <p>
                  {settings?.about?.storyParagraph3 ||
                    "Every barber at DemoShop's is a master of their craft, hand-picked not just for their skill, but for their passion. When you sit in our chair, you're not just a customer; you're a patron of the arts."}
                </p>
              </div>

              {/* Key Counters / Stats */}
              <div className="grid grid-cols-3 gap-4 sm:gap-6 pt-4 sm:pt-6 border-t border-white/10">
                <div>
                  <span className="font-serif text-2xl sm:text-3xl md:text-4xl font-bold text-amber-400 block">
                    {settings?.about?.yearsExperience || '5+'}
                  </span>
                  <span className="text-[10px] sm:text-xs font-mono uppercase tracking-widest text-zinc-400">
                    YEARS EXPERIENCE
                  </span>
                </div>
                <div>
                  <span className="font-serif text-2xl sm:text-3xl md:text-4xl font-bold text-amber-400 block">
                    {settings?.about?.happyClients || '5k+'}
                  </span>
                  <span className="text-[10px] sm:text-xs font-mono uppercase tracking-widest text-zinc-400">
                    HAPPY CLIENTS
                  </span>
                </div>
                <div>
                  <span className="font-serif text-2xl sm:text-3xl md:text-4xl font-bold text-amber-400 block">
                    1
                  </span>
                  <span className="text-[10px] sm:text-xs font-mono uppercase tracking-widest text-zinc-400">
                    BRANCH
                  </span>
                </div>
              </div>
            </div>

            {/* Visual Master Barber Sign-off Composition */}
            <div className="relative">
              <div className="relative rounded-2xl overflow-hidden border border-white/5 bg-[#141417] shadow-2xl">
                <img
                  src={settings?.about?.imageUrl || '/barbers_at_work.jpg'}
                  alt="Master Barber at work"
                  width={768}
                  height={768}
                  decoding="async"
                  className="w-full aspect-[16/10] sm:aspect-square object-cover grayscale hover:grayscale-0 transition-all duration-700"
                />
              </div>

              {/* Quote & Sign-off Card */}
              <div className="absolute -bottom-4 sm:-bottom-6 -right-2 sm:-right-4 sm:-right-8 rounded-xl border border-amber-400/30 bg-[#0c0c0e]/95 p-3.5 sm:p-5 shadow-2xl backdrop-blur-md max-w-[200px] sm:max-w-xs space-y-1.5 sm:space-y-2">
                <p className="font-serif italic text-amber-400 text-xs sm:text-sm">
                  {settings?.about?.quote || '"Quality is never an accident."'}
                </p>
                <div className="flex items-center gap-2 pt-1 border-t border-amber-400/20">
                  <Scissors className="w-3.5 h-3.5 text-amber-400" />
                  <span className="font-serif text-[11px] font-bold uppercase tracking-widest text-zinc-300">
                    Master Barber Sign-off
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============================================================== */}
        {/* 8. COMPREHENSIVE BRAND FOOTER (`Footer`)                       */}
        {/* ============================================================== */}
        <footer className="border-t border-amber-400/20 bg-[#0a0a0c] pt-10 sm:pt-16 md:pt-20 pb-8 sm:pb-12 px-4 sm:px-10 pb-safe">
          <div className="max-w-7xl mx-auto space-y-8 sm:space-y-12 md:space-y-16">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8 sm:gap-10 md:gap-12">
              {/* Brand Statement */}
              <div className="space-y-3 sm:space-y-4">
                <div className="flex items-center gap-2.5">
                  <Scissors className="w-5 h-5 text-amber-400" />
                  <span className="font-serif text-lg font-bold uppercase tracking-widest text-zinc-100">
                    DEMOSHOP'S BARBERS
                  </span>
                </div>
                <div className="flex items-start justify-between gap-3 sm:gap-4">
                  <p className="text-xs text-zinc-400 leading-relaxed font-light flex-1">
                    {settings?.footer?.brandDescription ||
                      'Where tradition meets precision. Experience the art of grooming in an atmosphere of industrial elegance.'}
                  </p>
                  <div className="flex items-center gap-2 shrink-0 pt-0.5">
                    <a
                      href={settings?.footer?.socialLinks?.facebook || 'https://www.facebook.com'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-8 h-8 rounded-full border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-amber-400 hover:border-amber-400 transition-colors"
                      title="Facebook"
                    >
                      <Facebook className="w-4 h-4" />
                    </a>
                    <a
                      href={settings?.footer?.socialLinks?.tiktok || 'https://www.tiktok.com/@demoshopsr18.samplebranch'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-8 h-8 rounded-full border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-amber-400 hover:border-amber-400 transition-colors"
                      title="TikTok"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
                      </svg>
                    </a>
                  </div>
                </div>
              </div>

              {/* Combined Contact & Hours (Side-by-side on mobile with vertical divider) */}
              <div className="col-span-1 md:col-span-2 flex flex-row items-start">
                {/* Contact Column */}
                <div className="flex-1 pr-3 sm:pr-6 md:pr-8 space-y-3 sm:space-y-4">
                  <h4 className="font-serif text-xs font-bold uppercase tracking-[0.2em] text-amber-400">
                    Contact
                  </h4>
                  <ul className="space-y-2.5 text-xs text-zinc-400 font-light">
                    <li className="flex items-start gap-2 sm:gap-2.5">
                      <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400 shrink-0 mt-0.5" />
                      <span className="text-[11px] sm:text-xs leading-tight sm:leading-normal">
                        {settings?.physicalAddress ||
                          'Ground floor, SampleBranch, Brgy. Kaypian, SJDM, Bulacan'}
                      </span>
                    </li>
                    <li className="flex items-center gap-2 sm:gap-2.5">
                      <Phone className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400 shrink-0" />
                      <span className="font-mono text-[11px] sm:text-xs">
                        {settings?.footer?.phone || '(02) 8555-0123'}
                      </span>
                    </li>
                  </ul>
                </div>

                {/* Vertical Divider */}
                <div className="w-[1px] bg-white/10 self-stretch shrink-0 my-1"></div>

                {/* Hours Column */}
                <div className="flex-1 pl-3 sm:pl-6 md:pl-8 space-y-3 sm:space-y-4">
                  <h4 className="font-serif text-xs font-bold uppercase tracking-[0.2em] text-amber-400">
                    Hours
                  </h4>
                  <div className="space-y-1.5 text-xs text-zinc-400 font-light">
                    <div className="flex items-start gap-2 text-zinc-200">
                      <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400 shrink-0 mt-0.5" />
                      <span className="text-[11px] sm:text-xs leading-tight sm:leading-normal">Monday - Sunday: 10am - 9pm</span>
                    </div>
                    <p className="text-[10px] sm:text-[11px] text-zinc-500 font-mono">
                      Open all regular & special holidays
                    </p>
                  </div>
                </div>
              </div>

              {/* Newsletter Subscription Card */}
              <div className="space-y-3 sm:space-y-4">
                <h4 className="font-serif text-xs font-bold uppercase tracking-[0.2em] text-amber-400">
                  Newsletter
                </h4>
                <p className="text-xs text-zinc-400 font-light">
                  Subscribe for seasonal cuts and exclusive promotional codes.
                </p>
                <form onSubmit={(e) => e.preventDefault()} className="flex border-b border-zinc-700 pb-2 focus-within:border-amber-400 transition-colors">
                  <input
                    type="email"
                    placeholder="Email Address"
                    aria-label="Email address"
                    className="bg-transparent border-none outline-none text-xs text-zinc-200 placeholder-zinc-500 w-full min-w-0"
                  />
                  <button
                    type="submit"
                    className="text-amber-400 font-bold uppercase text-[11px] tracking-widest hover:text-amber-300 ml-2 shrink-0 cursor-pointer"
                  >
                    JOIN
                  </button>
                </form>
              </div>
            </div>

            {/* Bottom Bar: Copyright and Legal */}
            <div className="border-t border-white/5 pt-6 sm:pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-zinc-500 text-center md:text-left">
              <p className="order-2 md:order-1">
                © {new Date().getFullYear()} DemoShop Barbershop. All rights reserved.
              </p>
              <div className="flex flex-wrap justify-center gap-x-5 sm:gap-x-6 gap-y-2 order-1 md:order-2">
                <span className="hover:text-amber-400 cursor-pointer">Franchise</span>
                <span className="hover:text-amber-400 cursor-pointer">Careers</span>
                <span className="hover:text-amber-400 cursor-pointer">Privacy Policy</span>
                <span className="hover:text-amber-400 cursor-pointer">Terms of Service</span>
              </div>
            </div>
          </div>
        </footer>

        {/* ============================================================== */}
        {/* 9. AMBIENT AUDIO PLAYER WIDGET (Floating Component)             */}
        {/* ============================================================== */}
        <aside className="sticky bottom-4 sm:bottom-6 left-4 sm:left-6 z-30 inline-flex items-center gap-2.5 sm:gap-3 rounded-full border border-amber-400/30 bg-[#0c0c0e]/90 p-1.5 sm:p-2 pr-4 sm:pr-5 shadow-2xl backdrop-blur-md ml-4 sm:ml-6 mb-4 sm:mb-6 max-w-[calc(100vw-2rem)]">
          {/* Animated Visualizer Bars */}
          <div className="flex items-end gap-1 h-6 pl-2">
            {[...Array(4)].map((_, i) => (
              <span
                key={i}
                className={`w-1 rounded-full bg-amber-400 transition-all ${
                  isPlaying ? 'animate-pulse' : 'h-1.5'
                }`}
                style={{
                  height: isPlaying ? `${12 + (i % 3) * 6}px` : '4px',
                  animationDelay: `${i * 0.15}s`,
                }}
              />
            ))}
          </div>

          {/* Gold Play/Pause Control */}
          <button
            type="button"
            onClick={() => setIsPlaying(!isPlaying)}
            className="w-8 h-8 rounded-full bg-amber-400 text-zinc-950 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform cursor-pointer"
          >
            {isPlaying ? (
              <Pause className="w-3.5 h-3.5 fill-current" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
            )}
          </button>

          {/* Text Badge */}
          <div className="flex flex-col">
            <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-amber-400">
              NOW PLAYING
            </span>
            <span className="font-serif text-xs italic text-zinc-200">
              Late Night Jazz
            </span>
          </div>
        </aside>
      </div>
    </ShopSettingsOverrideContext.Provider>
  );
};

export default StorefrontLandingView;
