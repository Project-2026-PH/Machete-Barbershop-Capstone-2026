import React, { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  className = '', 
  ...props 
}) => {
  const baseStyles = "relative px-8 py-3 font-serif font-bold uppercase tracking-widest transition-all duration-500 cursor-pointer overflow-hidden group/btn touch-manipulation hover:tracking-[0.2em] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60";
  
  const variants = {
    primary: "btn-primary bg-transparent text-gold border border-gold hover:text-charcoal active:bg-gold active:text-charcoal active:shadow-[0_0_30px_rgba(212,175,55,0.3)] hover:shadow-[0_0_30px_rgba(212,175,55,0.3)]",
    secondary: "btn-secondary bg-charcoal-light text-ivory border border-charcoal-light hover:border-gold hover:text-gold hover:bg-charcoal active:border-gold active:text-gold active:bg-charcoal",
    outline: "btn-outline bg-transparent text-ivory border border-white/20 hover:border-gold hover:text-gold active:border-gold active:text-gold",
    ghost: "btn-ghost text-ivory-dim hover:text-gold hover:bg-white/5 active:text-gold active:bg-white/5"
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant] || variants.primary} ${className}`}
      {...props}
    >
      <span className="relative z-10 flex items-center justify-center gap-2 transition-colors duration-500">{children}</span>
      {variant === 'primary' && (
        <div className="absolute inset-0 bg-gold transform scale-x-0 group-hover/btn:scale-x-100 transition-transform duration-500 ease-out origin-left z-0 pointer-events-none"></div>
      )}
    </button>
  );
};

