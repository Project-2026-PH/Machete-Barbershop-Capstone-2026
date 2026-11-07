import React, { useState } from 'react';
import { Heart, Upload, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/feedback/ToastContext';

export const LookbookTab = () => {
  const { addToast } = useToast();
  const [activeFilter, setActiveFilter] = useState('All');

  const styles = [
    { id: 1, title: "Classic Pompadour", category: "Classic", image: "https://images.unsplash.com/photo-1593702295094-aea22597af65?q=80&w=2070&auto=format&fit=crop" },
    { id: 2, title: "Skin Fade Crop", category: "Modern", image: "https://images.unsplash.com/photo-1621605815971-fbc98d665033?q=80&w=2070&auto=format&fit=crop" },
    { id: 3, title: "Textured Quiff", category: "Modern", image: "https://images.unsplash.com/photo-1605497788044-5a32c7078486?q=80&w=1974&auto=format&fit=crop" },
    { id: 4, title: "Slick Back", category: "Classic", image: "https://images.unsplash.com/photo-1503951914875-befbb6470523?q=80&w=2068&auto=format&fit=crop" },
    { id: 5, title: "Buzz Cut", category: "Short", image: "https://images.unsplash.com/photo-1512690459411-b9245aed614b?q=80&w=2070&auto=format&fit=crop" },
    { id: 6, title: "Beard Shape Up", category: "Beard", image: "https://images.unsplash.com/photo-1634480496821-4d6a96e23121?q=80&w=1974&auto=format&fit=crop" },
  ];

  const filters = ['All', 'Classic', 'Modern', 'Short', 'Beard'];

  const filteredStyles = activeFilter === 'All' 
    ? styles 
    : styles.filter(style => style.category === activeFilter);

  const handleSave = (title: string) => {
    addToast({
      type: 'success',
      title: 'Style Saved',
      message: `${title} has been added to your favorites.`,
    });
  };

  return (
    <div className="space-y-8 animate-fade-in w-full">
      
      {/* Header & Actions */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-6">
        <div>
          <h2 className="text-3xl font-serif font-bold text-ivory mb-2">Style Lookbook</h2>
          <p className="text-ivory-dim text-sm font-light">Curate your personal style. Save references to show your barber.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="text-xs py-2 px-4 flex items-center gap-2">
            <Upload className="w-4 h-4" /> Upload Photo
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
        {filters.map(filter => (
          <button
            key={filter}
            onClick={() => setActiveFilter(filter)}
            className={`px-6 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-all whitespace-nowrap ${
              activeFilter === filter 
                ? 'bg-gold text-charcoal' 
                : 'bg-white/5 text-ivory-dim hover:bg-white/10 hover:text-ivory'
            }`}
          >
            {filter}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Upload Placeholder */}
        <div className="aspect-[4/5] border-2 border-dashed border-white/10 rounded-sm flex flex-col items-center justify-center text-ivory-dim hover:border-gold/50 hover:text-gold hover:bg-white/[0.02] transition-all cursor-pointer group">
          <div className="p-4 bg-white/5 rounded-full mb-4 group-hover:scale-110 transition-transform">
            <Plus className="w-8 h-8" />
          </div>
          <span className="text-xs uppercase tracking-widest font-bold">Add Reference</span>
        </div>

        {filteredStyles.map((style) => (
          <div key={style.id} className="group relative aspect-[4/5] rounded-sm overflow-hidden bg-charcoal-light">
            <img 
              src={style.image} 
              alt={style.title} 
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 grayscale group-hover:grayscale-0"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-charcoal/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-6">
              <span className="text-gold text-[10px] uppercase tracking-widest mb-1">{style.category}</span>
              <div className="flex justify-between items-end">
                <h3 className="text-xl font-serif font-bold text-ivory">{style.title}</h3>
                <button 
                  onClick={() => handleSave(style.title)}
                  className="p-2 bg-white/10 rounded-full hover:bg-gold hover:text-charcoal transition-colors text-ivory"
                >
                  <Heart className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
