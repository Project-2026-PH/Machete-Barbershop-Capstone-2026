import React from 'react';
import { MapPin, Phone, Clock, ArrowRight, Calendar } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/Button';

export const Locations = () => {
  const branchInfo = {
    name: "DemoShop's Barbershop - SampleBranch Branch",
    address: "Ground floor, SampleBranch, Brgy. Kaypian, San Jose del Monte, Bulacan",
    phone: "(02) 8555-0123",
    hours: "Mon-Sat: 10:00 AM - 9:00 PM",
    image: "/demoshop_interior.jpg"
  };

  return (
    <section id="locations" className="py-8 sm:py-16 md:py-24 bg-charcoal relative overflow-hidden">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center mb-6 sm:mb-10 md:mb-16">
          <span className="text-gold font-serif italic text-base sm:text-xl mb-1 sm:mb-2 block animate-fade-in">Visit Us</span>
          <h2 className="text-2xl sm:text-4xl md:text-5xl font-serif font-bold text-ivory mb-3 sm:mb-6 tracking-tight animate-fade-in">
            OUR <span className="text-gold">SAMPLEBRANCH BARBERSHOP</span>
          </h2>
          <div className="h-[1px] w-16 sm:w-24 bg-gold mx-auto animate-fade-in"></div>
        </div>

        <div className="bg-charcoal-light border border-white/5 overflow-hidden animate-fade-in hover:border-gold/30 transition-colors duration-500 rounded-sm shadow-xl">
          <div className="grid grid-cols-1 lg:grid-cols-2">
            {/* Left side: Premium Image */}
            <div className="lg:col-span-1 aspect-[16/10] sm:aspect-video lg:aspect-square overflow-hidden relative">
              <div className="absolute inset-0 bg-charcoal/20 z-10"></div>
              <img
                src={branchInfo.image}
                alt={branchInfo.name}
                width={768}
                height={768}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-700 hover:scale-105"
              />
            </div>

            {/* Right side: Detailed Information */}
            <div className="lg:col-span-1 p-5 sm:p-8 lg:p-12 flex flex-col justify-center">
              <span className="text-xs uppercase tracking-widest text-gold mb-2 sm:mb-3 font-semibold">SampleBranch Branch</span>
              <h3 className="text-xl sm:text-2xl md:text-3xl font-serif font-bold text-ivory mb-4 sm:mb-6">
                {branchInfo.name}
              </h3>
              
              <ul className="space-y-3.5 sm:space-y-5 text-ivory-dim text-xs sm:text-sm md:text-base font-light mb-6 sm:mb-8">
                <li className="flex items-start gap-3 sm:gap-4">
                  <MapPin className="w-5 h-5 text-gold shrink-0 mt-0.5" />
                  <span>{branchInfo.address}</span>
                </li>
                <li className="flex items-center gap-3 sm:gap-4">
                  <Phone className="w-5 h-5 text-gold shrink-0" />
                  <span>{branchInfo.phone}</span>
                </li>
                <li className="flex items-center gap-3 sm:gap-4">
                  <Clock className="w-5 h-5 text-gold shrink-0" />
                  <span>{branchInfo.hours}</span>
                </li>
              </ul>

              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                <Link to="/booking" className="flex-1">
                  <button className="w-full py-3 sm:py-4 bg-gold hover:bg-gold-light text-charcoal uppercase tracking-widest text-xs font-bold transition-all duration-300 flex items-center justify-center gap-2 rounded-sm shadow-[0_0_20px_rgba(212,175,55,0.15)] hover:shadow-[0_0_30px_rgba(212,175,55,0.35)] hover:-translate-y-0.5 active:translate-y-0 group cursor-pointer">
                    <Calendar className="w-4 h-4 group-hover:scale-110 group-hover:rotate-6 transition-transform duration-300" />
                    Book a Session
                  </button>
                </Link>
                <a 
                  href="https://maps.google.com/?q=SampleBranch+San+Jose+del+Monte+Bulacan" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="flex-1"
                >
                  <button className="w-full py-3 sm:py-4 border border-white/10 text-ivory hover:border-gold/30 hover:bg-white/5 uppercase tracking-widest text-xs font-bold transition-all duration-300 flex items-center justify-center gap-2 rounded-sm cursor-pointer">
                    Get Directions
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </a>
              </div>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
};
