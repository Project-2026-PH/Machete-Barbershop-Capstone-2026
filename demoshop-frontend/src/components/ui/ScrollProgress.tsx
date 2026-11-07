import React, { useEffect, useState } from 'react';
import { Scissors } from 'lucide-react';

export const ScrollProgress: React.FC = () => {
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const totalScroll = document.documentElement.scrollTop;
      const windowHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      const scroll = totalScroll / (windowHeight || 1);
      setScrollProgress(scroll);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="fixed right-0 top-0 bottom-0 w-1 z-50 hidden md:block">
      {/* Track */}
      <div className="absolute top-0 right-0 w-full h-full bg-white/5"></div>
      
      {/* Progress Line (Gold hair/thread) */}
      <div 
        className="absolute top-0 right-0 w-full bg-gold transition-all duration-100 ease-out"
        style={{ height: `${scrollProgress * 100}%` }}
      ></div>

      {/* Scissors Indicator */}
      <div 
        className="absolute right-0 transform translate-x-1/2 -translate-y-1/2 transition-all duration-100 ease-out z-50"
        style={{ top: `${scrollProgress * 100}%` }}
      >
        <div className="relative -left-4">
          <Scissors 
            className="w-6 h-6 text-gold fill-charcoal transform rotate-90 filter drop-shadow-[0_0_5px_rgba(212,175,55,0.5)]" 
            strokeWidth={1.5}
          />
        </div>
      </div>
    </div>
  );
};
