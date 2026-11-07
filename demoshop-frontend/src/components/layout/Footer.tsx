import React from 'react';
import { Facebook, MapPin, Phone, Clock } from 'lucide-react';
import { Link } from 'react-router';
import { useShopSettings } from '../../hooks/useShopSettings';

export const Footer = () => {
  const { settings } = useShopSettings();

  const brandName = settings?.shopName || "DEMOSHOP'S";
  const brandDescription = settings?.footer?.brandDescription || "Where tradition meets precision. Experience the art of grooming in an atmosphere of industrial elegance.";
  const physicalAddress = settings?.physicalAddress || "Ground floor, SampleBranch,\nBrgy. Kaypian, SJDM, Bulacan";
  const contactPhone = settings?.footer?.phone || "(02) 8555-0123";
  const operatingHours = settings?.footer?.operatingHoursDisplay || "Monday - Sunday\n10am - 9pm";
  const facebookUrl = settings?.footer?.socialLinks?.facebook || "https://www.facebook.com/profile.php?id=61581132495911";
  const tiktokUrl = settings?.footer?.socialLinks?.tiktok || "https://www.tiktok.com/@demoshopsr18.samplebranch";
  const copyright = settings?.footer?.copyrightText || `© ${new Date().getFullYear()} ${settings?.shopName || "DemoShop's Barbers"}. All rights reserved.`;

  return (
    <footer className="bg-charcoal-light border-t border-gold/10 pt-10 sm:pt-16 md:pt-20 pb-8 sm:pb-10 bg-texture relative overflow-hidden pb-safe">
      {/* Subtle Gold Glow at top */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-1 bg-gradient-to-r from-transparent via-gold/30 to-transparent blur-sm"></div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8 sm:gap-10 md:gap-16 mb-8 sm:mb-12 md:mb-16">
          {/* Brand */}
          <div className="col-span-1 group">
            <div className="flex items-center gap-3 mb-3 sm:mb-6 cursor-pointer">
              <picture>
                <source srcSet="/demoshop_logo.webp" type="image/webp" />
                <img src="/demoshop_logo.png" alt="DemoShop Barbershop logo" width={256} height={256} decoding="async" className="h-8 sm:h-10 w-auto opacity-80 group-hover:opacity-100 transition-opacity duration-500" />
              </picture>
              <span className="text-lg sm:text-xl font-serif font-bold tracking-widest text-ivory group-hover:text-gold transition-colors duration-500 uppercase">
                {brandName}
              </span>
            </div>
            <div className="flex items-start justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
              <p className="text-ivory-dim text-xs sm:text-sm leading-relaxed font-light group-hover:text-ivory transition-colors duration-500 whitespace-pre-line flex-1">
                {brandDescription}
              </p>
              <div className="flex items-center gap-2.5 sm:gap-3 shrink-0 pt-0.5">
                {facebookUrl && (
                  <a 
                    href={facebookUrl} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-ivory-dim hover:text-gold transition-all duration-300 hover:scale-110 transform"
                    title="Facebook"
                  >
                    <Facebook className="h-4 sm:h-5 w-4 sm:w-5" />
                  </a>
                )}
                {tiktokUrl && (
                  <a 
                    href={tiktokUrl} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-ivory-dim hover:text-gold transition-all duration-300 hover:scale-110 transform"
                    title="TikTok"
                  >
                    <svg className="h-4 sm:h-5 w-4 sm:w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
                    </svg>
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Combined Contact & Hours (Side-by-side on mobile with vertical divider) */}
          <div className="col-span-1 md:col-span-2 flex flex-row items-start">
            {/* Contact */}
            <div className="flex-1 pr-3 sm:pr-6 md:pr-8 group">
              <h3 className="text-gold font-serif font-bold uppercase tracking-widest mb-2 sm:mb-6 text-xs sm:text-sm group-hover:tracking-[0.15em] transition-all duration-500">Contact</h3>
              <ul className="space-y-2.5 sm:space-y-4 text-ivory-dim text-xs sm:text-sm font-light">
                <li className="flex items-start gap-2 sm:gap-3 group/item hover:text-ivory transition-colors duration-300 cursor-default">
                  <MapPin className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-gold shrink-0 mt-0.5 group-hover/item:scale-110 transition-transform duration-300" />
                  <span className="whitespace-pre-line text-[11px] sm:text-xs md:text-sm leading-tight sm:leading-normal">{physicalAddress}</span>
                </li>
                <li className="flex items-center gap-2 sm:gap-3 group/item hover:text-ivory transition-colors duration-300 cursor-default">
                  <Phone className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-gold shrink-0 group-hover/item:scale-110 transition-transform duration-300" />
                  <span className="font-mono text-[11px] sm:text-xs md:text-sm">{contactPhone}</span>
                </li>
              </ul>
            </div>

            {/* Vertical Divider */}
            <div className="w-[1px] bg-white/10 self-stretch shrink-0 my-1"></div>

            {/* Hours */}
            <div className="flex-1 pl-3 sm:pl-6 md:pl-8 group">
              <h3 className="text-gold font-serif font-bold uppercase tracking-widest mb-2 sm:mb-6 text-xs sm:text-sm group-hover:tracking-[0.15em] transition-all duration-500">Hours</h3>
              <ul className="space-y-2 sm:space-y-4 text-ivory-dim text-xs sm:text-sm font-light">
                <li className="flex items-start gap-2 sm:gap-3 hover:text-ivory transition-colors duration-300 cursor-default">
                  <Clock className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-gold shrink-0 mt-0.5" />
                  <div className="whitespace-pre-line text-[11px] sm:text-xs md:text-sm leading-tight sm:leading-normal">
                    {operatingHours}
                  </div>
                </li>
              </ul>
            </div>
          </div>

          {/* Newsletter */}
          <div className="group">
            <h3 className="text-gold font-serif font-bold uppercase tracking-widest mb-2 sm:mb-6 text-xs sm:text-sm group-hover:tracking-[0.15em] transition-all duration-500">Newsletter</h3>
            <p className="text-ivory-dim text-xs sm:text-sm mb-3 sm:mb-4 font-light group-hover:text-ivory transition-colors duration-300">Subscribe for updates and exclusive offers.</p>
            <form onSubmit={(e) => e.preventDefault()} className="flex items-center border-b border-ivory/20 pb-2 focus-within:border-gold transition-colors duration-500">
              <input 
                type="email" 
                placeholder="Email Address" 
                aria-label="Email address"
                className="bg-transparent border-none outline-none text-ivory placeholder-ivory-dim/50 w-full text-xs sm:text-sm focus:placeholder-gold/50 transition-all min-w-0"
              />
              <button 
                type="submit"
                className="text-gold font-bold uppercase text-[11px] sm:text-xs tracking-widest hover:text-white transition-colors hover:scale-105 transform px-2 py-1 shrink-0 cursor-pointer"
              >
                Join
              </button>
            </form>
          </div>
        </div>

        <div className="border-t border-white/5 pt-6 sm:pt-8 flex flex-col md:flex-row justify-between items-center text-ivory-dim/40 text-[11px] sm:text-xs tracking-wider gap-4 text-center md:text-left">
          <p className="hover:text-ivory-dim transition-colors duration-300 order-2 md:order-1">{copyright}</p>
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 order-1 md:order-2">
            <Link to="/franchise" className="hover:text-gold transition-colors duration-300 hover:underline decoration-gold/50 underline-offset-4">Franchise</Link>
            <Link to="/careers" className="hover:text-gold transition-colors duration-300 hover:underline decoration-gold/50 underline-offset-4">Careers</Link>
            <Link to="/documents/privacy-policy" className="hover:text-gold transition-colors duration-300 hover:underline decoration-gold/50 underline-offset-4">Privacy Policy</Link>
            <Link to="/documents/terms-of-service" className="hover:text-gold transition-colors duration-300 hover:underline decoration-gold/50 underline-offset-4">Terms of Service</Link>
          </div>
        </div>
      </div>
    </footer>
  );
};
