import React from 'react';

interface SkeletonProps {
  variant?: 'text' | 'circle' | 'rect';
  className?: string;
}

/**
 * Skeleton loading component with shimmer effect.
 */
export const Skeleton: React.FC<SkeletonProps> = ({ variant = 'rect', className = '' }) => {
  const baseClasses = "animate-pulse bg-white/10 relative overflow-hidden";

  const variantClasses = {
    text: "rounded-md h-4 w-full",
    circle: "rounded-full",
    rect: "rounded-sm w-full h-full",
  };

  return (
    <div className={`${baseClasses} ${variantClasses[variant]} ${className}`}>
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent skew-x-[-20deg]" />
    </div>
  );
};
