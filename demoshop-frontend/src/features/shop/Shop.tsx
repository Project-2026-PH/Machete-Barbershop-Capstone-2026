import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Search,
  Package,
  Sparkles,
  X,
  Store,
  ArrowUpRight,
  AlertCircle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { api } from '@/config/api';
import { Button } from '@/components/ui/Button';
import { ProductImageFallback } from './ProductImageFallback';
import type { PublicShopProduct, ShopProductConfig } from '@demoshop/shared-types';
import { useShopSettings } from '@/hooks/useShopSettings';
import { DEFAULT_SHOP_RETAIL_PRODUCTS } from '@/features/admin/tabs/settings/ShopSection';

/* =========================================================================
   INDIVIDUAL PRODUCT SHOWCASE CARD
   - Interactive with subtle pointer-depth on fine desktop pointer devices
   - Heroic object-fit: contain product photography on dark studio surface
   - Restrained gold-accented typography and outlined badges
   ========================================================================= */

interface ProductCardProps {
  product: PublicShopProduct;
  index: number;
  onSelect: (product: PublicShopProduct, element: HTMLElement) => void;
  supportsParallax: boolean;
}

const ProductCard: React.FC<ProductCardProps> = ({
  product,
  index,
  onSelect,
  supportsParallax,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [parallax, setParallax] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!supportsParallax) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    // Tiny subtle movement (max ~3px) for tangible depth without 3D gimmick
    setParallax({ x: x * 6, y: y * 6 });
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setParallax({ x: 0, y: 0 });
  };

  const handleClick = () => {
    if (cardRef.current) {
      onSelect(product, cardRef.current);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  const tags = Array.isArray(product.tags) ? product.tags : [];
  const displayTags = tags.slice(0, 2);
  const extraTagsCount = tags.length > 2 ? tags.length - 2 : 0;

  return (
    <div
      ref={cardRef}
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      aria-label={`View details for ${product.name}, ₱${Number(product.retailPrice || 0).toFixed(0)}`}
      className="group relative bg-[#151517] border border-white/10 hover:border-gold/45 rounded-sm overflow-hidden transition-all duration-400 ease-out flex flex-col cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-gold focus-visible:border-gold shadow-[0_4px_24px_rgba(0,0,0,0.5)] hover:shadow-[0_12px_36px_rgba(0,0,0,0.7)] hover:-translate-y-1 animate-fade-in select-none"
      style={{ animationDelay: `${Math.min(index * 0.04, 0.4)}s` }}
    >
      {/* ================= HERO OBJECT DISPLAY AREA ================= */}
      <div className="relative aspect-square w-full overflow-hidden bg-gradient-to-b from-[#1b1b1e] via-[#161619] to-[#111113] p-6 sm:p-7 flex items-center justify-center">
        {/* Soft studio radial highlight behind product */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(212,175,55,0.06)_0%,_transparent_70%)] pointer-events-none transition-opacity duration-500 group-hover:opacity-100 opacity-60" />

        {/* Ambient grounded shadow on display floor */}
        <div className="absolute bottom-5 inset-x-12 h-4 bg-black/75 rounded-full blur-[10px] pointer-events-none transition-transform duration-500 ease-out group-hover:scale-95 group-hover:opacity-85" />

        {/* Product Object */}
        <div
          className="relative z-10 w-full h-full flex items-center justify-center transition-transform duration-400 ease-out"
          style={{
            transform: isHovered
              ? `translate3d(${parallax.x}px, ${parallax.y - 4}px, 0) scale(1.035)`
              : 'translate3d(0, 0, 0) scale(1)',
          }}
        >
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.name}
              width={400}
              height={400}
              loading="lazy"
              decoding="async"
              className="max-w-full max-h-full aspect-square object-contain drop-shadow-[0_16px_22px_rgba(0,0,0,0.75)]"
            />
          ) : (
            <ProductImageFallback
              name={product.name}
              category={product.category}
              size="lg"
            />
          )}
        </div>

        {/* Outlined Gold Tags (Max 2 + extra count) */}
        {tags.length > 0 && (
          <div className="absolute top-3.5 left-3.5 z-20 flex flex-wrap gap-1 items-start pointer-events-none">
            {displayTags.map((tag) => (
              <span
                key={tag}
                className="border border-gold/35 bg-black/75 text-gold text-[9px] font-semibold tracking-[0.18em] uppercase px-2 py-0.5 rounded-[2px] backdrop-blur-md shadow-sm"
              >
                {tag}
              </span>
            ))}
            {extraTagsCount > 0 && (
              <span className="border border-gold/25 bg-black/75 text-gold/80 text-[8px] font-bold px-1.5 py-0.5 rounded-[2px] backdrop-blur-md">
                +{extraTagsCount}
              </span>
            )}
          </div>
        )}

        {/* Restrained Stock Indicator */}
        <div className="absolute top-3.5 right-3.5 z-20 pointer-events-none">
          {product.stockStatus === 'IN STOCK' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium tracking-wide bg-black/75 border border-emerald-500/30 text-emerald-300 backdrop-blur-md">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              In Stock
            </span>
          )}
          {product.stockStatus === 'LOW STOCK' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium tracking-wide bg-black/75 border border-amber-500/30 text-amber-300 backdrop-blur-md">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              Low Stock
            </span>
          )}
          {product.stockStatus === 'OUT OF STOCK' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium tracking-wide bg-black/75 border border-zinc-700/80 text-zinc-400 backdrop-blur-md">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
              Out of Stock
            </span>
          )}
        </div>
      </div>

      {/* ================= EDITORIAL INFORMATION AREA ================= */}
      <div className="p-5 flex-1 flex flex-col justify-between border-t border-white/5 bg-[#151517]">
        <div>
          {/* Category */}
          <span className="text-gold/75 text-[10px] font-bold uppercase tracking-[0.25em] mb-1.5 block">
            {product.category || 'Grooming'}
          </span>

          {/* Product Name */}
          <h3 className="text-lg sm:text-xl font-serif font-bold text-ivory tracking-tight group-hover:text-gold transition-colors line-clamp-2 leading-snug">
            {product.name}
          </h3>
        </div>

        {/* Price & In-Store Availability */}
        <div className="mt-5 pt-3.5 border-t border-white/5 flex items-end justify-between">
          <div>
            <span className="text-xl sm:text-2xl font-serif font-bold text-ivory tracking-tight block">
              ₱{Number(product.retailPrice || 0).toFixed(0)}
            </span>
            <div className="flex items-center gap-1 text-[11px] text-ivory-dim/70 font-light mt-0.5">
              <Store className="w-3 h-3 text-gold/70" />
              <span>Available in-store</span>
            </div>
          </div>

          {/* Details Affordance */}
          <span className="text-[10px] font-bold tracking-[0.15em] uppercase text-gold/60 group-hover:text-gold flex items-center transition-colors pb-0.5">
            Details
            <ArrowUpRight className="w-3 h-3 ml-0.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </span>
        </div>
      </div>
    </div>
  );
};

/* =========================================================================
   PREMIUM EDITORIAL PRODUCT SHOWCASE OVERLAY (VIEW-ONLY)
   - Large hero studio display surface (~55/45 split on desktop)
   - Editorial serif typography
   - Restrained in-store availability narrative
   - Keyboard & carousel navigation (Previous / Next / Esc)
   ========================================================================= */

interface ProductShowcaseOverlayProps {
  product: PublicShopProduct;
  productsList: PublicShopProduct[];
  onClose: () => void;
  onNavigate: (product: PublicShopProduct) => void;
}

const ProductShowcaseOverlay: React.FC<ProductShowcaseOverlayProps> = ({
  product,
  productsList,
  onClose,
  onNavigate,
}) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const currentIndex = productsList.findIndex((p) => p.id === product.id);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < productsList.length - 1;

  const handlePrev = useCallback(() => {
    if (hasPrev) onNavigate(productsList[currentIndex - 1]);
  }, [hasPrev, currentIndex, productsList, onNavigate]);

  const handleNext = useCallback(() => {
    if (hasNext) onNavigate(productsList[currentIndex + 1]);
  }, [hasNext, currentIndex, productsList, onNavigate]);

  // Focus trap and keyboard controls (Escape, ArrowLeft, ArrowRight)
  useEffect(() => {
    closeButtonRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, handlePrev, handleNext]);

  // Prevent body scrolling while showcase is open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="showcase-product-title"
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 md:p-8 animate-fade-in"
    >
      {/* Dark Ambient Backdrop with subtle blur */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/85 backdrop-blur-md transition-opacity duration-300"
      />

      {/* Showcase Surface Box */}
      <div
        className="relative z-10 w-full max-w-5xl max-h-[92vh] overflow-y-auto custom-scrollbar bg-[#141416] border border-gold/30 rounded-sm shadow-[0_24px_64px_rgba(0,0,0,0.85)] flex flex-col md:flex-row transition-all duration-300 animate-scale-in"
      >
        {/* Floating Close Button */}
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Close product showcase"
          className="absolute top-4 right-4 z-30 p-2 rounded-full bg-black/60 hover:bg-black/90 text-ivory hover:text-gold border border-white/10 hover:border-gold/40 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* ================= LEFT / HERO STUDIO DISPLAY ================= */}
        <div className="w-full md:w-[56%] bg-gradient-to-b from-[#1c1c1f] via-[#161619] to-[#0e0e10] p-8 sm:p-12 md:p-14 relative flex items-center justify-center min-h-[320px] md:min-h-[520px]">
          {/* Studio Radial Spotlight */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(212,175,55,0.08)_0%,_transparent_70%)] pointer-events-none" />

          {/* Studio Floor Grounded Shadow */}
          <div className="absolute bottom-10 inset-x-16 h-8 bg-black/80 rounded-full blur-[16px] pointer-events-none" />

          {/* Product Hero Object */}
          <div className="relative z-10 w-full h-full max-h-[380px] md:max-h-[440px] flex items-center justify-center">
            {product.imageUrl ? (
              <img
                src={product.imageUrl}
                alt={product.name}
                width={500}
                height={500}
                decoding="async"
                className="max-w-full max-h-[360px] md:max-h-[420px] aspect-square object-contain drop-shadow-[0_24px_32px_rgba(0,0,0,0.85)] transition-all duration-500"
              />
            ) : (
              <div className="w-64 h-64 md:w-80 md:h-80">
                <ProductImageFallback
                  name={product.name}
                  category={product.category}
                  size="xl"
                />
              </div>
            )}
          </div>

          {/* Previous / Next Desktop Quick Buttons */}
          <div className="absolute bottom-4 left-6 right-6 hidden md:flex items-center justify-between text-xs text-ivory-dim/70 z-20">
            <button
              type="button"
              onClick={handlePrev}
              disabled={!hasPrev}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded border border-white/10 bg-black/40 hover:bg-black/80 hover:text-gold hover:border-gold/30 transition-colors ${
                !hasPrev ? 'opacity-30 cursor-not-allowed pointer-events-none' : 'cursor-pointer'
              }`}
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Previous</span>
            </button>

            <span className="font-mono text-[11px] text-ivory-dim/50">
              {currentIndex + 1} of {productsList.length}
            </span>

            <button
              type="button"
              onClick={handleNext}
              disabled={!hasNext}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded border border-white/10 bg-black/40 hover:bg-black/80 hover:text-gold hover:border-gold/30 transition-colors ${
                !hasNext ? 'opacity-30 cursor-not-allowed pointer-events-none' : 'cursor-pointer'
              }`}
            >
              <span>Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ================= RIGHT / EDITORIAL SPECIFICATIONS ================= */}
        <div className="w-full md:w-[44%] p-6 sm:p-8 md:p-10 flex flex-col justify-between bg-[#141416] border-t md:border-t-0 md:border-l border-white/10">
          <div className="space-y-6">
            {/* Category Header */}
            <div>
              <span className="text-gold text-xs font-bold uppercase tracking-[0.25em] block mb-2">
                {product.category || 'Grooming'}
              </span>
              <h2
                id="showcase-product-title"
                className="text-2xl sm:text-3xl lg:text-4xl font-serif font-bold text-ivory tracking-tight leading-tight"
              >
                {product.name}
              </h2>
            </div>

            {/* Price Presentation */}
            <div className="text-3xl lg:text-4xl font-serif font-bold text-gold tracking-tight">
              ₱{Number(product.retailPrice || 0).toFixed(2)}
            </div>

            {/* Tags (Outlined Gold Badges) */}
            {Array.isArray(product.tags) && product.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {product.tags.map((tag) => (
                  <span
                    key={tag}
                    className="border border-gold/35 bg-gold/5 text-gold text-[10px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-[2px]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Stock Status Indicator */}
            <div className="pt-2">
              {product.stockStatus === 'IN STOCK' && (
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span>Available in Store • Physical Stock Ready</span>
                </div>
              )}
              {product.stockStatus === 'LOW STOCK' && (
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span>Limited Physical Stock Remaining</span>
                </div>
              )}
              {product.stockStatus === 'OUT OF STOCK' && (
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400">
                  <span className="w-2 h-2 rounded-full bg-zinc-500" />
                  <span>Temporarily Out of Physical Stock</span>
                </div>
              )}
            </div>

            {/* Product Narrative Description */}
            {product.description && (
              <p className="text-xs sm:text-sm text-ivory-dim font-light leading-relaxed pt-1">
                {product.description}
              </p>
            )}

            {/* In-Store Narrative (Subtle Gold Rule, not an alert box) */}
            <div className="pt-6 border-t border-white/10 space-y-2">
              <div className="flex items-center gap-2 text-gold text-xs font-bold uppercase tracking-[0.2em]">
                <Store className="w-4 h-4 text-gold" />
                <span>Available at DemoShop's</span>
              </div>
              <p className="text-xs sm:text-sm text-ivory-dim font-light leading-relaxed">
                Products are available for direct in-person purchase at our barbershop counter. Ask our staff or your
                barber during your appointment.
              </p>
            </div>
          </div>

          {/* Mobile Prev / Next Buttons */}
          <div className="mt-8 pt-6 border-t border-white/10 flex md:hidden items-center justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={handlePrev}
              disabled={!hasPrev}
              className="text-xs py-2 px-3 border-white/10"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Previous
            </Button>
            <span className="text-xs font-mono text-ivory-dim">
              {currentIndex + 1} / {productsList.length}
            </span>
            <Button
              type="button"
              variant="outline"
              onClick={handleNext}
              disabled={!hasNext}
              className="text-xs py-2 px-3 border-white/10"
            >
              Next
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* =========================================================================
   MAIN /shop PAGE
   ========================================================================= */

export interface ShopProps {
  overrideProducts?: PublicShopProduct[] | ShopProductConfig[];
}

export const Shop: React.FC<ShopProps> = ({ overrideProducts }) => {
  const { settings } = useShopSettings();
  const [products, setProducts] = useState<PublicShopProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [selectedProduct, setSelectedProduct] = useState<PublicShopProduct | null>(null);

  // Track the originating element so focus can be restored gracefully when closing showcase
  const originatingTriggerRef = useRef<HTMLElement | null>(null);

  // Parallax pointer support detection (fine pointer, hover supported, not reduced-motion)
  const [supportsParallax, setSupportsParallax] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
      const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      setSupportsParallax(finePointer && !prefersReduced);
    }
  }, []);

  const fetchProducts = async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const response = await api.get('/api/shop/products');
      const loaded = Array.isArray(response.data) && response.data.length > 0
        ? response.data
        : (DEFAULT_SHOP_RETAIL_PRODUCTS as any);
      setProducts(loaded);
    } catch (err: any) {
      setLoadError(err?.response?.data?.error || err?.message || 'Could not load retail catalog.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (overrideProducts) {
      setProducts(overrideProducts as PublicShopProduct[]);
      setIsLoading(false);
      return;
    }

    if (settings?.shopProducts && settings.shopProducts.length > 0) {
      setProducts(settings.shopProducts as PublicShopProduct[]);
      setIsLoading(false);
      return;
    }

    void fetchProducts();
  }, [overrideProducts, settings?.shopProducts]);

  // Dynamically extract real categories from enabled products
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category && p.category.trim() !== '') {
        set.add(p.category.trim());
      }
    });
    return ['All', ...Array.from(set).sort()];
  }, [products]);

  // Filter products by category and search query
  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products.filter((p) => {
      const matchesCategory =
        activeCategory === 'All' || p.category.toLowerCase() === activeCategory.toLowerCase();
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        (Array.isArray(p.tags) && p.tags.some((t) => t.toLowerCase().includes(q)));
      return matchesCategory && matchesSearch;
    });
  }, [products, activeCategory, searchQuery]);

  const handleOpenShowcase = (product: PublicShopProduct, element: HTMLElement) => {
    originatingTriggerRef.current = element;
    setSelectedProduct(product);
  };

  const handleCloseShowcase = () => {
    setSelectedProduct(null);
    if (originatingTriggerRef.current) {
      originatingTriggerRef.current.focus();
    }
  };

  return (
    <div className="min-h-screen bg-[#0e0e10] pt-28 sm:pt-32 pb-24 px-4 sm:px-6 lg:px-8 relative selection:bg-gold/30 selection:text-ivory">
      {/* Background Ambience & Noise */}
      <div className="absolute inset-0 bg-texture opacity-30 pointer-events-none" />
      <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[700px] h-[320px] bg-[radial-gradient(circle,_rgba(212,175,55,0.06)_0%,_transparent_70%)] blur-[100px] pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10">
        {/* ================= EDITORIAL PAGE INTRODUCTION ================= */}
        <div className="text-center mb-12 sm:mb-14 animate-fade-in">
          <span className="text-gold text-[11px] font-bold uppercase tracking-[0.3em] mb-2.5 block">
            Retail Collection
          </span>
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-serif font-bold text-ivory tracking-tight mb-4">
            GROOMING, <span className="text-gold">THE DEMOSHOP WAY.</span>
          </h1>
          <div className="h-[1px] w-24 bg-gradient-to-r from-transparent via-gold to-transparent mx-auto mb-4" />
          <p className="text-ivory-dim max-w-xl mx-auto font-light text-sm sm:text-base leading-relaxed">
            Handpicked styling and care essentials, available in-store at DemoShop's Barbershop.
          </p>
        </div>

        {/* ================= CONTROLS: CATEGORIES & SEARCH ================= */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-10 pb-5 border-b border-white/5 animate-fade-in">
          {/* Dynamic Category Filters */}
          <div className="flex gap-2 overflow-x-auto pb-1.5 w-full md:w-auto custom-scrollbar">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={`px-5 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-all whitespace-nowrap cursor-pointer ${
                  activeCategory === cat
                    ? 'bg-gold text-charcoal shadow-md shadow-gold/20'
                    : 'bg-white/5 text-ivory-dim hover:bg-white/10 hover:text-ivory border border-white/5'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Search Bar */}
          <div className="relative w-full md:w-72">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products or tags…"
              className="w-full bg-[#161618] border border-white/10 rounded-full py-2.5 pl-10 pr-9 text-xs text-ivory placeholder-ivory-dim/40 focus:border-gold/60 focus:outline-none transition-all shadow-inner"
            />
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ivory-dim pointer-events-none" />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ivory-dim hover:text-ivory p-0.5"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* ================= LOADING STATE ================= */}
        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 md:gap-8">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div
                key={i}
                className="rounded-sm border border-white/5 bg-[#151517] p-4 space-y-4 animate-pulse"
              >
                <div className="aspect-square w-full bg-white/5 rounded-sm" />
                <div className="h-4 bg-white/10 rounded w-1/3" />
                <div className="h-6 bg-white/10 rounded w-3/4" />
                <div className="h-5 bg-white/10 rounded w-1/4" />
              </div>
            ))}
          </div>
        )}

        {/* ================= LOAD ERROR STATE ================= */}
        {!isLoading && loadError && (
          <div className="max-w-md mx-auto my-16 p-8 rounded-lg border border-red-500/30 bg-red-500/10 text-center space-y-4">
            <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
            <h2 className="text-lg font-serif font-bold text-ivory">Unable to Load Catalog</h2>
            <p className="text-xs text-red-200/80">{loadError}</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => void fetchProducts()}
              className="border-red-400/40 text-red-200 hover:bg-red-500/20 text-xs mx-auto"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-2" />
              Retry
            </Button>
          </div>
        )}

        {/* ================= EMPTY STATE: ZERO DATABASE PRODUCTS ================= */}
        {!isLoading && !loadError && products.length === 0 && (
          <div className="max-w-xl mx-auto my-20 py-16 px-6 text-center rounded-lg border border-gold/20 bg-[#141416] shadow-2xl space-y-4">
            <div className="w-16 h-16 rounded-full bg-gold/5 border border-gold/20 flex items-center justify-center mx-auto text-gold">
              <Package className="w-8 h-8" />
            </div>
            <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-gold block">
              In-Store Inventory
            </span>
            <h2 className="text-2xl sm:text-3xl font-serif font-bold text-ivory tracking-wide">
              OUR SHELVES ARE BEING STOCKED
            </h2>
            <p className="text-ivory-dim text-sm max-w-md mx-auto leading-relaxed">
              Our curated grooming collection will be available here soon. Visit our physical barbershop location to
              view our current on-hand essentials.
            </p>
          </div>
        )}

        {/* ================= EMPTY STATE: FILTERED OUT ================= */}
        {!isLoading && !loadError && products.length > 0 && filteredProducts.length === 0 && (
          <div className="max-w-md mx-auto my-16 py-12 px-4 text-center space-y-3">
            <Package className="w-10 h-10 text-ivory-dim/60 mx-auto" />
            <h2 className="text-lg font-serif font-bold text-ivory">No matching products</h2>
            <p className="text-xs text-ivory-dim">
              No retail items match "{searchQuery}" in category "{activeCategory}".
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setActiveCategory('All');
              }}
              className="text-xs font-bold text-gold hover:underline pt-2 inline-block cursor-pointer"
            >
              Reset filters
            </button>
          </div>
        )}

        {/* ================= PRODUCT SHOWCASE GRID ================= */}
        {!isLoading && !loadError && filteredProducts.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 md:gap-8">
            {filteredProducts.map((product, index) => (
              <ProductCard
                key={product.id}
                product={product}
                index={index}
                onSelect={handleOpenShowcase}
                supportsParallax={supportsParallax}
              />
            ))}
          </div>
        )}
      </div>

      {/* ================= PREMIUM PRODUCT SHOWCASE OVERLAY ================= */}
      {selectedProduct && (
        <ProductShowcaseOverlay
          product={selectedProduct}
          productsList={filteredProducts}
          onClose={handleCloseShowcase}
          onNavigate={(nextProduct) => setSelectedProduct(nextProduct)}
        />
      )}
    </div>
  );
};
