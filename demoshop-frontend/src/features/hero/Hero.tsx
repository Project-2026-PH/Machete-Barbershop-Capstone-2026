import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Link } from 'react-router';
import { useShopSettings } from '@/hooks/useShopSettings';
import { getOptimizedSupabaseImageUrl } from '@/utils/supabase-image.util';

export const Hero = () => {
  const { settings } = useShopSettings();

  const heroHeadline = settings?.website?.heroHeadline || 'DEMOSHOP BARBERSHOP';
  const heroSubtext = settings?.website?.heroSubtext || 'Classic grooming and modern barbering at SampleBranch, San Jose del Monte, Bulacan. Book your next cut with DemoShop.';
  const heroImageUrl = settings?.website?.heroImageUrl?.trim() || '';
  const optimizedHeroImageUrl = getOptimizedSupabaseImageUrl(heroImageUrl, 1920, 70, 1080);
  const primaryCta = settings?.website?.heroCtaPrimary || 'Book Appointment';
  const secondaryCta = settings?.website?.heroCtaSecondary || 'View Services';

  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageLoaded(false);
    setImageError(false);

    if (!optimizedHeroImageUrl) return;

    // Detect save-data / slow 2G mobile connection
    const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    if (connection?.saveData || connection?.effectiveType === 'slow-2g' || connection?.effectiveType === '2g') {
      setImageError(true);
    }
  }, [optimizedHeroImageUrl]);

  // Render headline with stylized gold ampersand if applicable
  const renderHeadline = () => {
    if (heroHeadline.includes('&')) {
      const [first, ...rest] = heroHeadline.split('&');
      return (
        <>
          <span className="inline-block hover:text-gold transition-colors duration-500 hover:-translate-y-2 transform">{first.trim()}</span>{' '}
          <span className="text-gold hover:text-white transition-colors duration-500">&</span><br />
          <span className="inline-block hover:text-gold transition-colors duration-500 hover:-translate-y-2 transform delay-75">{rest.join('&').trim()}</span>
        </>
      );
    }
    return <span className="inline-block hover:text-gold transition-colors duration-500">{heroHeadline}</span>;
  };

  const primaryDest = settings?.website?.ctaPrimaryDestination || '/booking';
  const secondaryDest = settings?.website?.ctaSecondaryDestination || '#services';

  return (
    <section id="home" className="relative h-screen flex items-center justify-center overflow-hidden group/hero">
      {/* Background with Ambient Fallback & Remote Image */}
      <div className="absolute inset-0 z-0 bg-charcoal overflow-hidden pointer-events-none">
        {/* Zero-bandwidth Ambient Gold & Charcoal Backdrop */}
        <div
          className="absolute inset-0 opacity-80"
          style={{
            background: 'radial-gradient(ellipse at 50% 35%, rgba(212, 175, 55, 0.08) 0%, rgba(26, 26, 26, 0.95) 60%, #121212 100%)',
          }}
        />

        {/* Ambient Subtle Grid Pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_40%,#000_70%,transparent_100%)] opacity-40" />

        {/* Remote Hero Image Layer (Fades in when loaded) */}
        {optimizedHeroImageUrl && !imageError && (
          <img
            src={optimizedHeroImageUrl}
            alt=""
            aria-hidden="true"
            width={1920}
            height={1080}
            loading="eager"
            decoding="async"
            fetchPriority="low"
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
            className={`absolute inset-0 w-full h-full object-cover object-center grayscale mix-blend-overlay transition-opacity duration-1000 ease-out group-hover/hero:scale-105 ${
              imageLoaded ? 'opacity-60' : 'opacity-0'
            }`}
          />
        )}

        {/* Dark Vignette Overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-charcoal/90 via-charcoal/40 to-charcoal z-10" />
      </div>

      {/* Content */}
      <div className="relative z-20 text-center px-4 max-w-5xl mx-auto flex flex-col items-center">
        <div className="mb-8 animate-fade-in hover:scale-105 transition-transform duration-700">
          <picture>
            <source srcSet="/demoshop_logo.webp" type="image/webp" />
            <img
              src="/demoshop_logo.png"
              alt="DemoShop Barbershop crest"
              width={256}
              height={256}
              loading="eager"
              decoding="async"
              fetchPriority="high"
              className="h-32 md:h-48 w-auto mx-auto drop-shadow-2xl filter brightness-90 hover:brightness-110 transition-all duration-500"
            />
          </picture>
        </div>
        
        <div className="mb-6 inline-block border-y border-gold/30 py-2 px-8 animate-fade-in hover:border-gold transition-colors duration-500 cursor-default" style={{ animationDelay: '0.2s' }}>
          <span className="text-gold font-serif font-bold tracking-[0.3em] uppercase text-sm md:text-base hover:text-ivory transition-colors duration-300">
            Est. 2024 &bull; SampleBranch, San Jose del Monte
          </span>
        </div>
        
        <h1 className="text-5xl md:text-7xl lg:text-8xl font-serif font-black text-ivory mb-8 tracking-tight leading-none animate-fade-in cursor-default" style={{ animationDelay: '0.4s' }}>
          {renderHeadline()}
        </h1>
        
        <p className="text-ivory-dim text-lg md:text-xl max-w-2xl mx-auto mb-12 leading-relaxed font-light animate-fade-in hover:text-white transition-colors duration-500" style={{ animationDelay: '0.6s' }}>
          {heroSubtext}
        </p>
        
        <div className="flex flex-col sm:flex-row gap-6 justify-center animate-fade-in" style={{ animationDelay: '0.8s' }}>
          {primaryDest.startsWith('#') ? (
            <a href={primaryDest}>
              <Button variant="primary" className="min-w-[200px]">
                {primaryCta}
              </Button>
            </a>
          ) : (
            <Link to={primaryDest}>
              <Button variant="primary" className="min-w-[200px]">
                {primaryCta}
              </Button>
            </Link>
          )}
          {secondaryDest.startsWith('#') ? (
            <a href={secondaryDest}>
              <Button variant="secondary" className="min-w-[200px]">
                {secondaryCta}
              </Button>
            </a>
          ) : (
            <Link to={secondaryDest}>
              <Button variant="secondary" className="min-w-[200px]">
                {secondaryCta}
              </Button>
            </Link>
          )}
        </div>
      </div>
      
      {/* Scroll Indicator */}
      <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2 animate-bounce text-gold/50 hover:text-gold transition-colors duration-300 cursor-pointer">
        <div className="w-[1px] h-16 bg-gradient-to-b from-transparent via-gold to-transparent"></div>
      </div>
    </section>
  );
};
