import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ children, className = '' }) => {
  return (
    <span className={`inline-block px-3 py-1 text-xs font-bold text-onyx bg-gold rounded-full ${className}`}>
      {children}
    </span>
  );
};
