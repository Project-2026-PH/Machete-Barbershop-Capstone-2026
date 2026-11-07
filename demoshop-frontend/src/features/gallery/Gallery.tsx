import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, ZoomIn, ChevronLeft, ChevronRight } from 'lucide-react';
import { useShopSettings } from '@/hooks/useShopSettings';
import { getOptimizedSupabaseImageUrl } from '@/utils/supabase-image.util';

export const Gallery = () => {
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [originRect, setOriginRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const scrollLeftStartRef = useRef(0);
  const hasDraggedRef = useRef(false);

  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 });
  const [scrollX, setScrollX] = useState(0);
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  
  const scrollRafRef = useRef<number | null>(null);
  const mouseRafRef = useRef<number | null>(null);
  const galleryRectRef = useRef<DOMRect | null>(null);

  const { settings } = useShopSettings();

  const defaultImages: Array<{
    id: string;
    src: string;
    imageUrl?: string;
    alt: string;
    caption?: string;
    category: string;
    displayOrder: number;
  }> = [
    {
      id: '1',
      src: "/main_floor.jpg",
      imageUrl: "/main_floor.jpg",
      alt: "The Main Floor",
      caption: "The Main Floor",
      category: "Interior",
      displayOrder: 1,
    },
    {
      id: '2',
      src: "/details.jpg",
      imageUrl: "/details.jpg",
      alt: "Tools of Trade",
      caption: "Tools of Trade",
      category: "Details",
      displayOrder: 2,
    },
    {
      id: '3',
      src: "/classic_shave.jpg",
      imageUrl: "/classic_shave.jpg",
      alt: "Classic Shave",
      caption: "Classic Shave",
      category: "Service",
      displayOrder: 3,
    },
    {
      id: '4',
      src: "/demoshop_interior2.jpg",
      imageUrl: "/demoshop_interior2.jpg",
      alt: "Waiting Area",
      caption: "Waiting Area",
      category: "Interior",
      displayOrder: 4,
    },
    {
      id: '5',
      src: "/demoshop_team.jpg",
      imageUrl: "/demoshop_team.jpg",
      alt: "Master Barber",
      caption: "Master Barber",
      category: "Team",
      displayOrder: 5,
    },
    {
      id: '6',
      src: "/master_at_work.jpg",
      imageUrl: "/master_at_work.jpg",
      alt: "Precision",
      caption: "Precision",
      category: "Service",
      displayOrder: 6,
    }
  ];

  const rawGallery = (settings?.gallery && settings.gallery.length > 0)
    ? settings.gallery
    : (settings?.galleryImages && settings.galleryImages.length > 0)
    ? settings.galleryImages
    : defaultImages;

  const images = [...rawGallery]
    .map((item: any, idx: number) => ({
      id: String(item.id || idx + 1),
      src: (item.imageUrl || item.src || '') as string,
      alt: (item.caption || item.alt || 'Gallery item') as string,
      category: (item.category || 'Interior') as string,
      displayOrder: typeof item.displayOrder === 'number' ? item.displayOrder : idx + 1,
    }))
    .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

  // Tripled array for infinite loop
  const displayImages = [...images, ...images, ...images];

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
      galleryRectRef.current = null;
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Center scroll position on mount (middle set)
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    
    const initScroll = () => {
      const setWidth = container.scrollWidth / 3;
      if (setWidth > 0) {
        container.scrollLeft = setWidth;
        setScrollX(setWidth);
      } else {
        requestAnimationFrame(initScroll);
      }
    };
    initScroll();
  }, []);

  // Handle Infinite Scroll Loop and Parallax Offset
  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const currentScroll = container.scrollLeft;
    const setWidth = container.scrollWidth / 3;

    if (setWidth > 0) {
      // Seamless infinite wrap without delayed timer
      if (currentScroll >= setWidth * 2) {
        container.scrollLeft = currentScroll - setWidth;
        if (isDraggingRef.current) {
          scrollLeftStartRef.current -= setWidth;
        }
      } else if (currentScroll <= setWidth * 0.3) {
        container.scrollLeft = currentScroll + setWidth;
        if (isDraggingRef.current) {
          scrollLeftStartRef.current += setWidth;
        }
      }
    }

    if (scrollRafRef.current) {
      cancelAnimationFrame(scrollRafRef.current);
    }
    scrollRafRef.current = requestAnimationFrame(() => {
      if (scrollContainerRef.current) {
        setScrollX(scrollContainerRef.current.scrollLeft);
      }
    });
  };

  // Drag to Scroll Logic
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!scrollContainerRef.current || e.button !== 0) return;
    isDraggingRef.current = true;
    setIsDragging(true);
    hasDraggedRef.current = false;
    startXRef.current = e.pageX;
    scrollLeftStartRef.current = scrollContainerRef.current.scrollLeft;
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !scrollContainerRef.current) return;
      const deltaX = e.pageX - startXRef.current;
      if (Math.abs(deltaX) > 5) {
        hasDraggedRef.current = true;
      }
      scrollContainerRef.current.scrollLeft = scrollLeftStartRef.current - deltaX;
    };

    const handleGlobalMouseUp = () => {
      isDraggingRef.current = false;
      setIsDragging(false);
      setTimeout(() => {
        hasDraggedRef.current = false;
      }, 80);
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDragging]);

  // Cache the section geometry once per pointer entry instead of forcing a
  // layout read on every mousemove event.
  const handleMouseEnter = (e: React.MouseEvent<HTMLElement>) => {
    galleryRectRef.current = e.currentTarget.getBoundingClientRect();
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    if (isDraggingRef.current) return;
    const rect = galleryRectRef.current;
    if (!rect) return;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    if (mouseRafRef.current) {
      cancelAnimationFrame(mouseRafRef.current);
    }
    mouseRafRef.current = requestAnimationFrame(() => {
      setMousePos({ x, y });
    });
  };

  // Calculate Parallax and Tilt for each card
  const getParallaxStyle = (index: number) => {
    const cardWidth = windowWidth >= 768 ? 532 : 332; 
    const centerScreen = windowWidth / 2;
    const leftPadding = windowWidth >= 768 ? windowWidth * 0.1 : 16;
    const itemCenter = leftPadding + (index * cardWidth) + (cardWidth / 2);
    const positionInViewport = itemCenter - scrollX;
    const parallaxOffset = (positionInViewport - centerScreen) * -0.08;

    const mouseTiltX = (mousePos.x - 0.5) * -15;
    const mouseTiltY = (mousePos.y - 0.5) * -15;

    return {
      transform: `translate3d(${parallaxOffset + mouseTiltX}px, ${mouseTiltY}px, 0) scale(1.15)`
    };
  };

  // Button Scroll Logic
  const scroll = (direction: 'left' | 'right') => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const scrollAmount = windowWidth >= 768 ? 532 : 332;
    container.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth'
    });
  };

  // Morph Animation Logic
  const handleThumbnailClick = (index: number, e: React.MouseEvent<HTMLDivElement>) => {
    if (hasDraggedRef.current || isDraggingRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setOriginRect({
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height
    });
    setSelectedImageIndex(index);
    setIsExpanded(false);
    
    // Trigger animation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsExpanded(true);
      });
    });
  };

  const handlePreviewClick = (index: number, e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setOriginRect({
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height
    });
    setSelectedImageIndex(index);
    setIsExpanded(false);
    
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsExpanded(true);
      });
    });
  };

  const handleClose = useCallback(() => {
    setIsExpanded(false);
    setTimeout(() => {
      setSelectedImageIndex(null);
      setOriginRect(null);
    }, 500);
  }, []);

  // Keyboard navigation for lightbox
  useEffect(() => {
    if (selectedImageIndex === null) return;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      } else if (e.key === 'ArrowRight') {
        setSelectedImageIndex((prev) => (prev !== null ? (prev + 1) % images.length : null));
      } else if (e.key === 'ArrowLeft') {
        setSelectedImageIndex((prev) => (prev !== null ? (prev - 1 + images.length) % images.length : null));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedImageIndex, handleClose, images.length]);

  const selectedImage = selectedImageIndex !== null ? images[selectedImageIndex % images.length] : null;

  return (
    <section 
      id="gallery" 
      className="py-32 bg-charcoal-light bg-texture relative overflow-hidden"
      onMouseEnter={handleMouseEnter}
      onMouseMove={handleMouseMove}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 mb-12">
        <div className="flex justify-between items-end">
          <div>
            <span className="text-gold font-serif italic text-xl mb-2 block animate-fade-in">Visual Experience</span>
            <h2 className="text-4xl md:text-6xl font-serif font-bold text-ivory tracking-tight animate-fade-in">
              THE <span className="text-gold">GALLERY</span>
            </h2>
          </div>
          
          {/* Navigation Buttons */}
          <div className="flex gap-4 hidden md:flex">
            <button 
              onClick={() => scroll('left')}
              className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center text-ivory hover:bg-gold hover:text-charcoal hover:border-gold transition-all duration-300"
              aria-label="Scroll gallery left"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button 
              onClick={() => scroll('right')}
              className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center text-ivory hover:bg-gold hover:text-charcoal hover:border-gold transition-all duration-300"
              aria-label="Scroll gallery right"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </div>
        </div>
        <div className="h-[1px] w-full bg-white/5 mt-8"></div>
      </div>
      
      {/* Draggable & Infinite Horizontal Container */}
      <div 
        ref={scrollContainerRef}
        className="flex gap-8 overflow-x-auto px-4 md:px-[10vw] pb-12 cursor-grab active:cursor-grabbing [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden overscroll-x-contain select-none"
        onMouseDown={handleMouseDown}
        onScroll={handleScroll}
      >
        {displayImages.map((image, index) => (
          <div 
            key={`${image.id}-${index}`} 
            className="relative w-[300px] md:w-[500px] h-[400px] flex-shrink-0 group overflow-hidden select-none rounded-sm border border-white/5 bg-charcoal shadow-lg hover:border-gold/30 transition-colors duration-500"
            onClick={(e) => handleThumbnailClick(index, e)}
          >
            {/* Parallax Image Container - Directly synchronized without CSS transition delay */}
            <div 
              className="absolute inset-[-15%] w-[130%] h-[130%] pointer-events-none will-change-transform"
              style={getParallaxStyle(index)}
            >
              <img 
                src={getOptimizedSupabaseImageUrl(image.src, windowWidth >= 768 ? 1000 : 600, 75, 800)}
                alt={image.alt}
                width={1000}
                height={800}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover grayscale group-hover:grayscale-0 group-hover:scale-105 transition-all duration-700 ease-out"
                draggable={false}
              />
            </div>

            {/* Overlay */}
            <div className="absolute inset-0 bg-charcoal/40 group-hover:bg-transparent transition-colors duration-700 z-10"></div>
            
            {/* Hover Content */}
            <div className="absolute inset-0 z-20 flex flex-col justify-end p-8 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-t from-charcoal/95 via-charcoal/30 to-transparent pointer-events-none">
              <div className="transform translate-y-4 group-hover:translate-y-0 transition-transform duration-500 delay-100">
                <span className="text-gold font-serif italic text-lg block mb-1">{image.category}</span>
                <div className="flex justify-between items-end border-b border-gold/30 pb-2">
                  <h3 className="text-2xl font-bold text-white font-serif">{image.alt}</h3>
                  <ZoomIn className="text-gold w-6 h-6 mb-1" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Lightbox Modal with Morph Animation */}
      {selectedImage && (
        <>
          {/* Backdrop */}
          <div 
            className={`fixed inset-0 z-[60] bg-charcoal/95 transition-opacity duration-500 ease-out transform-gpu will-change-transform ${isExpanded ? 'opacity-100' : 'opacity-0'}`}
            onClick={handleClose}
          ></div>

          {/* Close Button */}
          <button 
            className={`fixed top-8 right-8 text-ivory hover:text-gold transition-all duration-300 transform hover:rotate-90 z-[70] ${isExpanded ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}
            onClick={handleClose}
            aria-label="Close modal"
          >
            <X className="w-10 h-10" />
          </button>

          {/* Morphed Image */}
          <img 
            src={getOptimizedSupabaseImageUrl(selectedImage.src, 1600, 80, 1200)}
            alt={selectedImage.alt}
            width={1600}
            height={1200}
            loading="eager"
            decoding="async"
            className="fixed z-[65] transition-all duration-500 cubic-bezier(0.4, 0, 0.2, 1) shadow-2xl"
            style={{
              top: isExpanded ? 0 : originRect?.top,
              left: isExpanded ? 0 : originRect?.left,
              width: isExpanded ? '100vw' : originRect?.width,
              height: isExpanded ? '100vh' : originRect?.height,
              objectFit: 'cover',
              pointerEvents: 'none'
            }}
          />

          {/* Info Overlay */}
          <div className={`fixed bottom-32 left-4 md:left-12 z-[70] transition-all duration-500 delay-300 transform-gpu will-change-transform ${isExpanded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <div className="bg-charcoal/90 p-6 border-l-2 border-gold shadow-2xl">
              <span className="text-gold font-serif italic text-xl block mb-1">{selectedImage.category}</span>
              <h3 className="text-3xl font-bold text-white font-serif">{selectedImage.alt}</h3>
            </div>
          </div>

          {/* Preview Strip */}
          <div 
            className={`fixed bottom-8 right-8 flex gap-4 z-[70] overflow-x-auto max-w-[80vw] p-2 transition-all duration-500 delay-200 ${isExpanded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
            onClick={(e) => e.stopPropagation()}
          >
            {images.map((img, idx) => (
              <div 
                key={img.id}
                className={`relative w-24 h-16 cursor-pointer transition-all duration-300 border-2 flex-shrink-0 ${selectedImageIndex === idx ? 'border-gold scale-110' : 'border-transparent opacity-50 hover:opacity-100'}`}
                onClick={(e) => handlePreviewClick(idx, e)}
              >
                <img 
                  src={getOptimizedSupabaseImageUrl(img.src, 240, 70, 160)}
                  alt={img.alt}
                  width={240}
                  height={160}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover"
                />
                {selectedImageIndex === idx && (
                  <div className="absolute inset-0 bg-gold/10"></div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
};


