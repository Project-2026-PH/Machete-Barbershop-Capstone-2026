import React from 'react';
import { useShopSettings } from '@/hooks/useShopSettings';

export const About = () => {
  const { settings } = useShopSettings();

  const subheading = settings?.about?.subheading || 'Our Story';
  const heading = settings?.about?.heading || 'MORE THAN JUST A CUT';
  const story1 = settings?.about?.storyParagraph1 || "Founded in 2024, DemoShop's Barbers was born from a desire to restore the dignity of the classic barbershop experience. We believe that grooming is not a chore, but a ritual—a moment of pause in a chaotic world.";
  const story2 = settings?.about?.storyParagraph2 || "Our philosophy is simple: Precision & Tradition. We combine old-school techniques—hot towels, straight razors, and scissor-over-comb—with a modern eye for detail and style.";
  const story3 = settings?.about?.storyParagraph3 || "Every barber at DemoShop's is a master of their craft, hand-picked not just for their skill, but for their passion. When you sit in our chair, you're not just a customer; you're a patron of the arts.";
  const yearsExp = settings?.about?.yearsExperience || '5+';
  const happyClients = settings?.about?.happyClients || '5k+';
  const quote = settings?.about?.quote || '"Quality is never an accident."';
  const aboutImage = settings?.about?.imageUrl || '/barbers_at_work.jpg';

  return (
    <section id="about" className="py-8 sm:py-16 md:py-24 bg-charcoal relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 sm:gap-12 lg:gap-16 items-center">

          {/* Text Content */}
          <div className="order-2 lg:order-1 animate-fade-in">
            <span className="text-gold font-serif italic text-base sm:text-xl mb-2 sm:mb-4 block">{subheading}</span>
            <h2 className="text-2xl sm:text-4xl md:text-6xl font-serif font-bold text-ivory mb-4 sm:mb-8 tracking-tight leading-tight sm:leading-none">
              {heading}
            </h2>

            <div className="space-y-3.5 sm:space-y-6 text-ivory-dim font-light text-xs sm:text-base md:text-lg leading-relaxed">
              <p>{story1}</p>
              <p>{story2}</p>
              <p>{story3}</p>
              <p>
                Located at SampleBranch in Brgy. Kaypian, DemoShop Barbershop serves clients from San Jose del Monte (SJDM) and communities across Bulacan. Book online or visit our SampleBranch branch for a precise, comfortable grooming experience.
              </p>
            </div>

            <div className="mt-6 sm:mt-12 pt-6 sm:pt-8 border-t border-white/10 flex gap-6 sm:gap-12">
              <div>
                <span className="block text-2xl sm:text-4xl font-serif font-bold text-gold mb-0.5 sm:mb-1">{yearsExp}</span>
                <span className="text-[10px] sm:text-xs uppercase tracking-widest text-ivory-dim">Years Experience</span>
              </div>
              <div>
                <span className="block text-2xl sm:text-4xl font-serif font-bold text-gold mb-0.5 sm:mb-1">{happyClients}</span>
                <span className="text-[10px] sm:text-xs uppercase tracking-widest text-ivory-dim">Happy Clients</span>
              </div>
              <div>
                <span className="block text-2xl sm:text-4xl font-serif font-bold text-gold mb-0.5 sm:mb-1">1</span>
                <span className="text-[10px] sm:text-xs uppercase tracking-widest text-ivory-dim">Branch</span>
              </div>
            </div>
          </div>

          {/* Image Composition */}
          <div className="order-1 lg:order-2 relative animate-fade-in" style={{ animationDelay: '0.2s' }}>
            <div className="relative z-10 border border-white/5 p-2.5 sm:p-4 bg-charcoal-light/50 backdrop-blur-sm">
              <img
                src={aboutImage}
                alt="Master Barber at work"
                width={768}
                height={768}
                loading="lazy"
                decoding="async"
                className="w-full aspect-[16/10] sm:aspect-square object-cover grayscale hover:grayscale-0 transition-all duration-1000"
              />
            </div>

            {/* Decorative Elements */}
            <div className="absolute -top-8 -right-8 w-64 h-64 border border-gold/20 z-0 hidden md:block"></div>
            <div className="absolute -bottom-8 -left-8 w-64 h-64 border border-gold/20 z-0 hidden md:block"></div>

            {/* Signature Overlay */}
            <div className="absolute -bottom-6 -right-2 sm:-bottom-10 md:-bottom-12 sm:-right-8 md:-right-12 bg-charcoal p-3.5 sm:p-6 border border-gold/30 shadow-2xl z-20 max-w-[170px] sm:max-w-[200px]">
              <p className="font-serif italic text-gold text-xs sm:text-sm mb-1 sm:mb-2">{quote}</p>
              <picture>
                <source srcSet="/demoshop_logo.webp" type="image/webp" />
                <img src="/demoshop_logo.png" alt="Signature" width={256} height={256} loading="lazy" decoding="async" className="h-6 sm:h-8 w-auto opacity-80" />
              </picture>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};
