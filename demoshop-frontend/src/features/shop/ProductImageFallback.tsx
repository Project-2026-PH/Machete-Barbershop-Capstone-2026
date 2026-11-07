import React from 'react';
import { Package } from 'lucide-react';

interface ProductImageFallbackProps {
  name: string;
  category?: string | null;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export const ProductImageFallback: React.FC<ProductImageFallbackProps> = ({
  name,
  category,
  className = '',
  size = 'md',
}) => {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || 'M';

  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
  };

  const initialSizes = {
    sm: 'text-xs',
    md: 'text-base',
    lg: 'text-2xl',
    xl: 'text-4xl',
  };

  return (
    <div
      className={`relative w-full h-full flex flex-col items-center justify-center bg-zinc-900 select-none overflow-hidden ${className}`}
      aria-label={`${name} archival display`}
    >
      {/* Studio Ambient Glow */}
      <div className="absolute inset-0 bg-gold/5 pointer-events-none" />

      {/* Luxury Geometric Corner Accents */}
      <div className="absolute top-3 left-3 w-2.5 h-2.5 border-t border-l border-gold/30" />
      <div className="absolute top-3 right-3 w-2.5 h-2.5 border-t border-r border-gold/30" />
      <div className="absolute bottom-3 left-3 w-2.5 h-2.5 border-b border-l border-gold/30" />
      <div className="absolute bottom-3 right-3 w-2.5 h-2.5 border-b border-r border-gold/30" />

      {/* Subtle Archival Watermark */}
      <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none">
        <span className="text-9xl font-serif font-black tracking-widest text-gold">DEMOSHOP</span>
      </div>

      {/* Object Pedestal Display */}
      <div className="relative z-10 flex flex-col items-center text-center px-4">
        <div className="mb-3 p-3.5 rounded-full bg-gold/5 border border-gold/25 text-gold/80 shadow-[0_8px_20px_rgba(0,0,0,0.6)] backdrop-blur-sm">
          <Package className={iconSizes[size]} strokeWidth={1.5} />
        </div>
        <span className={`font-serif font-bold text-gold/90 tracking-[0.25em] ${initialSizes[size]}`}>
          {initials}
        </span>
        {category && size !== 'sm' && (
          <span className="mt-1.5 text-[9px] uppercase tracking-[0.25em] text-ivory-dim/60 font-medium">
            {category}
          </span>
        )}
      </div>

      {/* Subtle Grounded Pedestal Shadow & Gold Line */}
      <div className="absolute bottom-6 w-24 h-2 bg-black/60 rounded-full blur-[6px] pointer-events-none" />
      <div className="absolute bottom-0 inset-x-12 h-[1px] bg-gradient-to-r from-transparent via-gold/25 to-transparent" />
    </div>
  );
};
