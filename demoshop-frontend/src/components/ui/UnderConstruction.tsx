import React from 'react';
import { Hammer, HardHat, Construction } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Link } from 'react-router';

interface UnderConstructionProps {
  title?: string;
  message?: string;
}

export const UnderConstruction: React.FC<UnderConstructionProps> = ({ 
  title = "Under Construction", 
  message = "We're crafting something special here. Check back soon!" 
}) => {
  return (
    <div className="min-h-screen bg-charcoal flex flex-col items-center justify-center relative overflow-hidden px-4 text-center">
      {/* Background Texture */}
      <div className="absolute inset-0 bg-texture opacity-50 pointer-events-none"></div>
      
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 text-gold/5 animate-pulse">
          <Hammer size={120} />
        </div>
        <div className="absolute bottom-1/4 right-1/4 text-gold/5 animate-bounce" style={{ animationDuration: '3s' }}>
          <HardHat size={100} />
        </div>
      </div>

      <div className="relative z-10 animate-fade-in max-w-lg mx-auto">
        <div className="mb-8 flex justify-center">
          <div className="p-6 bg-gold/10 rounded-full border-2 border-gold/30 shadow-[0_0_30px_rgba(212,175,55,0.2)]">
            <Construction className="w-16 h-16 text-gold animate-[spin_10s_linear_infinite]" />
          </div>
        </div>

        <h1 className="text-4xl md:text-6xl font-serif font-bold text-ivory mb-6 tracking-tight">
          {title}
        </h1>
        
        <div className="h-[1px] w-24 bg-gold mx-auto mb-8"></div>
        
        <p className="text-ivory-dim text-lg mb-10 font-light leading-relaxed">
          {message}
        </p>
        
        <Link to="/">
          <Button variant="primary" className="min-w-[200px]">
            Return Home
          </Button>
        </Link>
      </div>

      {/* Footer Copyright */}
      <div className="absolute bottom-8 text-ivory-dim/30 text-xs tracking-widest font-serif">
        DEMOSHOP'S BARBERS &copy; EST. 2024
      </div>
    </div>
  );
};
