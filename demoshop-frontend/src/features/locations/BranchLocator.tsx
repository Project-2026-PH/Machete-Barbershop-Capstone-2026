import React, { useState } from 'react';
import { MapPin, Phone, Clock, ArrowRight, Search, Navigation } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { branches as allLocations } from '../customer/data';

export const BranchLocator = () => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredLocations = allLocations.filter(loc =>
    loc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    loc.area.toLowerCase().includes(searchTerm.toLowerCase()) ||
    loc.address.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-charcoal pt-24 pb-12 relative">
      {/* Background Texture */}
      <div className="absolute inset-0 bg-texture opacity-50 pointer-events-none"></div>

      {/* Map Background Overlay */}
      <div className="absolute inset-0 opacity-10 pointer-events-none bg-[url('https://upload.wikimedia.org/wikipedia/commons/thumb/b/b0/New_York_City_map.svg/1200px-New_York_City_map.svg.png')] bg-cover bg-center grayscale fixed"></div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">

        {/* Header */}
        <div className="text-center mb-16 animate-fade-in">
          <span className="text-gold font-serif italic text-xl mb-2 block">Visit Our SJDM Location</span>
          <h1 className="text-4xl md:text-6xl font-serif font-bold text-ivory mb-6 tracking-tight">
            SAMPLEBRANCH BARBERSHOP <span className="text-gold">IN SJDM</span>
          </h1>
          <div className="h-[1px] w-24 bg-gold mx-auto mb-8"></div>

          {/* Search Bar */}
          <div className="max-w-xl mx-auto relative">
            <input
              type="text"
              placeholder="Search by city, area, or branch name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-charcoal-light/80 backdrop-blur-md border border-white/10 rounded-full py-4 pl-12 pr-6 text-ivory placeholder-ivory-dim/50 focus:border-gold focus:outline-none transition-colors shadow-xl"
            />
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gold w-5 h-5" />
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredLocations.map((loc, index) => (
            <div
              key={loc.id}
              className="group bg-charcoal-light border border-white/5 rounded-sm overflow-hidden hover:border-gold/30 transition-all duration-500 hover:-translate-y-1 hover:shadow-2xl animate-fade-in"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              {/* Image */}
              <div className="h-56 overflow-hidden relative">
                <div className="absolute inset-0 bg-charcoal/20 group-hover:bg-transparent transition-colors duration-500 z-10"></div>
                <div className="absolute top-4 right-4 z-20">
                  <span className={`px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded-full backdrop-blur-md ${loc.status === 'Open Now' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-orange-500/20 text-orange-400 border border-orange-500/30'}`}>
                    {loc.status}
                  </span>
                </div>
                <img
                  src={loc.image}
                  alt={loc.name}
                  width={600}
                  height={224}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-700 grayscale group-hover:grayscale-0"
                />
              </div>

              {/* Content */}
              <div className="p-8">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <span className="text-gold text-xs uppercase tracking-widest block mb-1">{loc.area}</span>
                    <h3 className="text-2xl font-serif font-bold text-ivory group-hover:text-gold transition-colors duration-300">
                      {loc.name}
                    </h3>
                  </div>
                </div>

                <ul className="space-y-4 text-ivory-dim text-sm font-light mb-8">
                  <li className="flex items-start gap-3">
                    <MapPin className="w-5 h-5 text-gold shrink-0 mt-0.5" />
                    <span>{loc.address}</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <Phone className="w-5 h-5 text-gold shrink-0" />
                    <span>{loc.phone}</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <Clock className="w-5 h-5 text-gold shrink-0" />
                    <span>{loc.hours}</span>
                  </li>
                </ul>

                <div className="flex gap-3">
                  <Button variant="primary" className="flex-1 text-xs py-3 flex justify-center items-center gap-2">
                    Book Here
                  </Button>
                  <button className="px-4 border border-white/10 text-ivory hover:bg-white hover:text-charcoal transition-all duration-300 flex items-center justify-center">
                    <Navigation className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filteredLocations.length === 0 && (
          <div className="text-center py-20">
            <p className="text-ivory-dim text-lg">No branches found matching your search.</p>
            <button
              onClick={() => setSearchTerm('')}
              className="mt-4 text-gold hover:underline decoration-gold/50 underline-offset-4"
            >
              View all locations
            </button>
          </div>
        )}

      </div>
    </div>
  );
};
