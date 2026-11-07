import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Droplets,
  Leaf,
  Package,
  Scissors,
  Sparkles,
} from 'lucide-react';
import { Link } from 'react-router';
import type { PublicShopProduct, ShopProductConfig } from '@demoshop/shared-types';
import { api } from '@/config/api';
import { useShopSettings } from '@/hooks/useShopSettings';
import { getOptimizedSupabaseImageUrl } from '@/utils/supabase-image.util';
import { ProductImageFallback } from './ProductImageFallback';
import { DEFAULT_SHOP_RETAIL_PRODUCTS } from '@/features/admin/tabs/settings/ShopSection';

interface PointerPosition {
  x: number;
  y: number;
}

interface ProductSlideProps {
  product: PublicShopProduct;
  index: number;
  total: number;
  pointer: PointerPosition;
  motionEnabled: boolean;
}

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

const getDepthTransform = (
  pointer: PointerPosition,
  depth: number,
  rotation = 0,
  motionEnabled = true,
) => ({
  transform: motionEnabled
    ? `translate3d(${pointer.x * depth}px, ${pointer.y * depth}px, 0) rotate(${rotation + pointer.x * depth * 0.12}deg)`
    : `rotate(${rotation}deg)`,
});

const ProductSlide: React.FC<ProductSlideProps> = ({
  product,
  index,
  total,
  pointer,
  motionEnabled,
}) => {
  const [imageFailed, setImageFailed] = useState(false);
  const [useOriginalImage, setUseOriginalImage] = useState(false);
  const imageUrl = product.imageUrl
    ? getOptimizedSupabaseImageUrl(product.imageUrl, 900, 78, 720)
    : '';
  const renderedImageUrl = useOriginalImage ? product.imageUrl || '' : imageUrl;

  const productTransform = motionEnabled
    ? {
      transform: `perspective(1100px) rotateX(${pointer.y * -7}deg) rotateY(${pointer.x * 10}deg) translate3d(${pointer.x * 10}px, ${pointer.y * 10}px, 40px)`,
    }
    : undefined;

  return (
    <article
      className="w-screen shrink-0 h-screen overflow-y-auto px-4 py-16 sm:px-10 sm:py-20 lg:px-20 lg:py-0 flex items-center justify-center [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      aria-label={`${product.name}, product ${index + 1} of ${total}`}
    >
      <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] items-center gap-3 sm:gap-8 lg:gap-20">
        {/* Floating product visualizer */}
        <div className="relative h-[38vh] min-h-[230px] max-h-[360px] sm:h-[52vh] sm:min-h-[360px] sm:max-h-[680px] flex items-center justify-center [perspective:1100px]">
          <div className="absolute w-[min(72vw,520px)] aspect-square rounded-full bg-gold/10 blur-3xl" />
          <div className="absolute w-[min(50vw,360px)] aspect-square rounded-full border border-gold/10" />

          {/* Peripheral planes move at different depths from the product. */}
          <div
            className="absolute left-[8%] top-[15%] text-gold/60 will-change-transform"
            style={getDepthTransform(pointer, 34, -18, motionEnabled)}
            aria-hidden="true"
          >
            <Droplets className="w-8 h-8 sm:w-10 sm:h-10" strokeWidth={1.2} />
          </div>
          <div
            className="absolute right-[12%] top-[12%] text-ivory/50 will-change-transform"
            style={getDepthTransform(pointer, 22, 16, motionEnabled)}
            aria-hidden="true"
          >
            <Leaf className="w-9 h-9 sm:w-12 sm:h-12" strokeWidth={1.1} />
          </div>
          <div
            className="absolute right-[7%] bottom-[18%] text-gold/50 will-change-transform"
            style={getDepthTransform(pointer, 46, -25, motionEnabled)}
            aria-hidden="true"
          >
            <Scissors className="w-10 h-10 sm:w-14 sm:h-14" strokeWidth={1.1} />
          </div>
          <div
            className="absolute left-[15%] bottom-[19%] text-gold/45 will-change-transform"
            style={getDepthTransform(pointer, 54, 45, motionEnabled)}
            aria-hidden="true"
          >
            <Sparkles className="w-7 h-7 sm:w-9 sm:h-9" strokeWidth={1.1} />
          </div>
          <div
            className="absolute left-[28%] top-[19%] w-4 h-4 sm:w-5 sm:h-5 border border-gold/60 rotate-45 will-change-transform"
            style={getDepthTransform(pointer, 68, 45, motionEnabled)}
            aria-hidden="true"
          />
          <div
            className="absolute right-[27%] bottom-[14%] w-3 h-3 rounded-full bg-gold/70 shadow-[0_0_24px_rgba(212,175,55,0.7)] will-change-transform"
            style={getDepthTransform(pointer, 78, 0, motionEnabled)}
            aria-hidden="true"
          />

          <div
            className="relative z-10 w-[min(68vw,340px)] h-[min(42vh,330px)] sm:w-[min(68vw,420px)] sm:h-[min(68vw,520px)] flex items-center justify-center will-change-transform transition-transform duration-200 ease-out"
            style={productTransform}
          >
            <div className="absolute inset-[10%] rounded-[45%] bg-gradient-to-br from-white/10 via-transparent to-gold/10 blur-2xl" />
            {renderedImageUrl && !imageFailed ? (
              <img
                src={renderedImageUrl}
                alt={product.name}
                width={900}
                height={720}
                loading={index === 0 ? 'eager' : 'lazy'}
                decoding="async"
                className="relative z-10 w-full h-full object-contain drop-shadow-[0_32px_28px_rgba(0,0,0,0.55)]"
                onError={() => {
                  if (!useOriginalImage && product.imageUrl) {
                    setUseOriginalImage(true);
                    return;
                  }
                  setImageFailed(true);
                }}
              />
            ) : (
              <ProductImageFallback name={product.name} category={product.category} size="xl" />
            )}
          </div>
        </div>

        {/* Product information */}
        <div className="relative z-20 max-w-xl lg:pb-8">
          <span className="text-gold font-serif italic text-lg sm:text-xl">The DemoShop Collection</span>
          <p className="mt-2 sm:mt-5 text-[10px] uppercase tracking-[0.35em] text-ivory-dim/70">
            {product.category} · {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
          </p>
          <h3 className="mt-2 sm:mt-4 text-3xl sm:text-6xl font-serif font-bold text-ivory tracking-tight leading-none">
            {product.name}
          </h3>
          <div className="h-px w-20 sm:w-24 bg-gold mt-4 sm:mt-7" />
          <p className="mt-4 sm:mt-7 max-w-md text-sm sm:text-base text-ivory-dim leading-relaxed font-light">
            {product.description || 'Curated grooming essentials selected for the DemoShop standard of precision, ritual, and finish.'}
          </p>
          {product.retailPrice !== null && (
            <p className="mt-4 sm:mt-7 text-2xl sm:text-3xl font-serif font-bold text-gold">
              ₱{product.retailPrice.toLocaleString('en-PH')}
            </p>
          )}
          <Link
            to="/shop"
            className="mt-5 sm:mt-9 inline-flex items-center gap-3 border border-gold/40 px-5 sm:px-6 py-3 text-[10px] sm:text-xs uppercase tracking-[0.2em] font-bold text-gold hover:bg-gold hover:text-charcoal transition-all duration-300"
          >
            Explore Product
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </article>
  );
};

export interface ShopPreviewProps {
  overrideProducts?: PublicShopProduct[] | ShopProductConfig[];
}

export const ShopPreview: React.FC<ShopPreviewProps> = ({ overrideProducts }) => {
  const { settings } = useShopSettings();
  const [products, setProducts] = useState<PublicShopProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeProductIndex, setActiveProductIndex] = useState(0);
  const [dragOffsetX, setDragOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [pointer, setPointer] = useState<PointerPosition>({ x: 0, y: 0 });
  const [motionEnabled, setMotionEnabled] = useState(true);
  const sectionRef = useRef<HTMLElement | null>(null);
  const pointerBoundsRef = useRef<DOMRect | null>(null);
  const pointerFrameRef = useRef<number | null>(null);
  const pendingPointerRef = useRef<PointerPosition>({ x: 0, y: 0 });
  const activeProductRef = useRef(0);
  const dragStartXRef = useRef(0);
  const dragStartIndexRef = useRef(0);
  const didDragRef = useRef(false);
  const capturedPointerIdRef = useRef<number | null>(null);

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

    let isActive = true;

    api.get('/api/shop/products')
      .then((response) => {
        if (!isActive) return;
        const productsData = Array.isArray(response.data) && response.data.length > 0
          ? response.data
          : (DEFAULT_SHOP_RETAIL_PRODUCTS as any);
        setProducts(productsData);
      })
      .catch(() => {
        if (isActive) setProducts(DEFAULT_SHOP_RETAIL_PRODUCTS as any);
      })
      .finally(() => {
        if (isActive) setIsLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [overrideProducts, settings?.shopProducts]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotionPreference = () => setMotionEnabled(!mediaQuery.matches);
    updateMotionPreference();
    mediaQuery.addEventListener('change', updateMotionPreference);
    return () => mediaQuery.removeEventListener('change', updateMotionPreference);
  }, []);

  useEffect(() => () => {
    if (pointerFrameRef.current !== null) cancelAnimationFrame(pointerFrameRef.current);
  }, []);

  const setActiveProduct = (index: number) => {
    const nextIndex = Math.max(0, Math.min(index, products.length - 1));
    activeProductRef.current = nextIndex;
    setActiveProductIndex(nextIndex);
    setDragOffsetX(0);
  };

  const handlePointerEnter = (event: React.PointerEvent<HTMLDivElement>) => {
    pointerBoundsRef.current = event.currentTarget.getBoundingClientRect();
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (products.length < 2 || (event.pointerType === 'mouse' && event.button !== 0)) return;

    pointerBoundsRef.current = event.currentTarget.getBoundingClientRect();
    dragStartXRef.current = event.clientX;
    dragStartIndexRef.current = activeProductRef.current;
    didDragRef.current = false;
    capturedPointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      const deltaX = event.clientX - dragStartXRef.current;
      if (Math.abs(deltaX) > 8) didDragRef.current = true;
      if (didDragRef.current) event.preventDefault();
      setDragOffsetX(deltaX);
      return;
    }

    const bounds = pointerBoundsRef.current;
    if (!bounds || !motionEnabled) return;

    pendingPointerRef.current = {
      x: clamp(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -1, 1),
      y: clamp(((event.clientY - bounds.top) / bounds.height) * 2 - 1, -1, 1),
    };

    if (pointerFrameRef.current === null) {
      pointerFrameRef.current = requestAnimationFrame(() => {
        pointerFrameRef.current = null;
        setPointer(pendingPointerRef.current);
      });
    }
  };

  const finishPointerDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;

    const deltaX = event.clientX - dragStartXRef.current;
    const threshold = Math.max(window.innerWidth * 0.16, 48);
    const direction = Math.abs(deltaX) >= threshold ? (deltaX < 0 ? 1 : -1) : 0;
    const nextIndex = dragStartIndexRef.current + direction;

    if (direction !== 0 && nextIndex >= 0 && nextIndex < products.length) {
      setActiveProduct(nextIndex);
    } else {
      setDragOffsetX(0);
    }

    if (capturedPointerIdRef.current !== null && event.currentTarget.hasPointerCapture(capturedPointerIdRef.current)) {
      event.currentTarget.releasePointerCapture(capturedPointerIdRef.current);
    }
    capturedPointerIdRef.current = null;
    setIsDragging(false);
  };

  const handlePointerLeave = () => {
    if (!isDragging) {
      pointerBoundsRef.current = null;
      setPointer({ x: 0, y: 0 });
    }
  };

  const handleClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (didDragRef.current) {
      event.preventDefault();
      event.stopPropagation();
      didDragRef.current = false;
    }
  };

  const goToProduct = (index: number) => {
    setActiveProduct(index);
  };

  const trackOffset = `calc(-${activeProductIndex * 100}vw + ${dragOffsetX}px)`;

  return (
    <section
      id="shop"
      ref={sectionRef}
      className="relative h-screen bg-[#111312] overflow-hidden"
    >
      <div
        className={`relative h-full overflow-hidden touch-pan-y select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        onPointerDown={handlePointerDown}
        onPointerEnter={handlePointerEnter}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointerDrag}
        onPointerCancel={finishPointerDrag}
        onPointerLeave={handlePointerLeave}
        onClickCapture={handleClickCapture}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_42%,rgba(212,175,55,0.14),transparent_32%),radial-gradient(circle_at_78%_70%,rgba(255,255,255,0.04),transparent_30%)]" />
        <div className="absolute inset-0 bg-texture opacity-30 pointer-events-none" />

        {isLoading ? (
          <div className="relative z-10 h-full flex flex-col items-center justify-center text-center px-6">
            <Package className="w-12 h-12 text-gold/70 mb-5 animate-pulse" />
            <p className="text-gold font-serif italic text-xl">Preparing the collection</p>
          </div>
        ) : products.length > 0 ? (
          <>
            <div
              className={`relative z-10 flex h-full will-change-transform ${isDragging ? '' : 'transition-transform duration-700 ease-out'}`}
              style={{
                width: `${products.length * 100}vw`,
                transform: `translate3d(${trackOffset}, 0, 0)`,
              }}
            >
              {products.map((product, index) => (
                <ProductSlide
                  key={product.id}
                  product={product}
                  index={index}
                  total={products.length}
                  pointer={pointer}
                  motionEnabled={motionEnabled}
                />
              ))}
            </div>

            <div className="absolute top-8 left-5 sm:left-10 lg:left-20 z-30 pointer-events-none">
              <span className="text-gold text-[10px] uppercase tracking-[0.35em] font-bold">Collection</span>
            </div>
            <Link
              to="/shop"
              className="absolute top-7 right-5 sm:right-10 lg:right-20 z-30 inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] font-bold text-ivory-dim hover:text-gold transition-colors"
            >
              Full Collection
              <ArrowUpRight className="w-4 h-4" />
            </Link>

            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3">
              {products.map((product, index) => {
                const isActive = activeProductIndex === index;
                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => goToProduct(index)}
                    aria-label={`Show ${product.name}`}
                    aria-current={isActive ? 'step' : undefined}
                    className="min-w-8 min-h-8 flex items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70"
                  >
                    <span className={`block h-1 rounded-full transition-all duration-300 ${isActive ? 'w-8 bg-gold' : 'w-2 bg-white/25 hover:bg-white/60'}`} />
                  </button>
                );
              })}
            </div>
            <div className="absolute bottom-8 right-5 sm:right-10 lg:right-20 z-30 hidden sm:flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-ivory-dim/60 pointer-events-none">
              <span>Drag to explore</span>
              <ArrowRight className="w-4 h-4 text-gold" />
            </div>
          </>
        ) : (
          <div className="relative z-10 h-full flex flex-col items-center justify-center text-center px-6">
            <Package className="w-12 h-12 text-gold/70 mb-5" />
            <p className="text-gold font-serif italic text-xl">The collection is being curated.</p>
            <Link
              to="/shop"
              className="mt-6 inline-flex items-center gap-2 border border-gold/40 px-5 py-3 text-xs uppercase tracking-[0.2em] font-bold text-gold hover:bg-gold hover:text-charcoal transition-all"
            >
              Visit Shop
              <ArrowUpRight className="w-4 h-4" />
            </Link>
          </div>
        )}
      </div>
    </section>
  );
};
